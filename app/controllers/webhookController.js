import { processWebhookEvent } from '../services/webhookService.js';
import logger from '../utils/logger.js';

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

    // Process asynchronously after responding
    try {
        const result = await processWebhookEvent(deliveryId, eventType, payload);
        logger.info('Webhook processed', { deliveryId, eventType, result });
    } catch (error) {
        logger.error('Webhook processing failed', {
            deliveryId,
            eventType,
            error: error.message
        });
    }
};
