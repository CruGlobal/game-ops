import { processWebhookEvent } from '../services/webhookService.js';
import logger from '../utils/logger.js';
import { track } from '../lib/inFlightWork.js';

/**
 * Handle incoming GitHub webhook events.
 * Responds 200 immediately to GitHub, then processes the event.
 */
export const handleGitHubWebhook = async (req, res) => {
    const deliveryId = req.headers['x-github-delivery'];
    const eventType = req.headers['x-github-event'];
    const payload = req.body;

    if (!deliveryId || !eventType) {
        return res.status(400).json({ error: 'Missing required GitHub webhook headers' });
    }

    // Respond quickly to GitHub (must respond within 10 seconds)
    res.status(200).json({ received: true, deliveryId });

    // Registered as in-flight work so a SIGTERM drains it instead of killing it. GitHub
    // has already had its 200 and will not redeliver.
    try {
        const result = await track(processWebhookEvent(deliveryId, eventType, payload));
        logger.info('Webhook processed', { deliveryId, eventType, result });
    } catch (error) {
        logger.error('Webhook processing failed', {
            deliveryId,
            eventType,
            error: error.message
        });
    }
};
