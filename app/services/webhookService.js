import { prisma } from '../lib/prisma.js';
import { processSingleMergedPR, processSingleReview } from './contributorService.js';
import logger from '../utils/logger.js';

/**
 * Check if a webhook delivery has already been processed (idempotency).
 * @param {string} deliveryId - X-GitHub-Delivery header value
 * @returns {boolean} true if already processed
 */
const isAlreadyProcessed = async (deliveryId) => {
    const existing = await prisma.webhookEvent.findUnique({
        where: { deliveryId }
    });
    return !!existing;
};

/**
 * Record a webhook event for audit trail and idempotency.
 */
const recordWebhookEvent = async (deliveryId, eventType, action, payload, status = 'processed') => {
    await prisma.webhookEvent.create({
        data: {
            deliveryId,
            eventType,
            action,
            payload,
            status
        }
    });
};

/**
 * Handle a pull_request webhook event.
 * Only processes merged PRs (action=closed, merged=true).
 */
const handlePullRequestEvent = async (payload) => {
    const { action, pull_request: pr } = payload;

    // Only process merged PRs
    if (action !== 'closed' || !pr.merged) {
        return { processed: false, reason: `Ignored: action=${action}, merged=${pr?.merged}` };
    }

    const result = await processSingleMergedPR({
        number: pr.number,
        title: pr.title,
        username: pr.user.login,
        mergedAt: pr.merged_at,
        labels: pr.labels || []
    });

    logger.info('Webhook: processed merged PR', {
        prNumber: pr.number,
        username: pr.user.login,
        result: result.reason
    });

    return result;
};

/**
 * Handle a pull_request_review webhook event.
 * Only processes submitted reviews.
 */
const handlePullRequestReviewEvent = async (payload) => {
    const { action, review, pull_request: pr } = payload;

    if (action !== 'submitted') {
        return { processed: false, reason: `Ignored: action=${action}` };
    }

    const result = await processSingleReview({
        reviewId: review.id,
        username: review.user.login,
        submittedAt: review.submitted_at,
        prNumber: pr.number
    });

    logger.info('Webhook: processed review', {
        reviewId: review.id,
        prNumber: pr.number,
        username: review.user.login,
        result: result.reason
    });

    return result;
};

/**
 * Main webhook processing entry point.
 * Routes to the appropriate handler based on event type.
 *
 * @param {string} deliveryId - X-GitHub-Delivery header
 * @param {string} eventType - X-GitHub-Event header
 * @param {Object} payload - Parsed webhook payload
 * @returns {Object} { processed, reason }
 */
export const processWebhookEvent = async (deliveryId, eventType, payload) => {
    // Idempotency check
    if (await isAlreadyProcessed(deliveryId)) {
        logger.info('Webhook: duplicate delivery, skipping', { deliveryId });
        return { processed: false, reason: 'duplicate_delivery' };
    }

    const action = payload.action || 'unknown';
    let result;

    try {
        switch (eventType) {
            case 'pull_request':
                result = await handlePullRequestEvent(payload);
                break;
            case 'pull_request_review':
                result = await handlePullRequestReviewEvent(payload);
                break;
            case 'ping':
                logger.info('Webhook: ping received', { zen: payload.zen });
                result = { processed: true, reason: 'ping' };
                break;
            default:
                result = { processed: false, reason: `Unsupported event: ${eventType}` };
        }

        await recordWebhookEvent(deliveryId, eventType, action, payload, result.processed ? 'processed' : 'skipped');
    } catch (error) {
        logger.error('Webhook: processing error', {
            deliveryId,
            eventType,
            action,
            error: error.message
        });

        // Record the failed event for debugging/replay
        try {
            await recordWebhookEvent(deliveryId, eventType, action, payload, 'failed');
        } catch (recordError) {
            logger.error('Webhook: failed to record error event', { error: recordError.message });
        }

        throw error;
    }

    return result;
};
