import crypto from 'crypto';

/**
 * Middleware to verify GitHub webhook signatures (HMAC SHA-256).
 * Requires req.rawBody to be set by express.json({ verify }) option.
 * Rejects requests with missing or invalid signatures.
 */
export const verifyWebhookSignature = (req, res, next) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;

    if (!secret) {
        console.error('GITHUB_WEBHOOK_SECRET is not configured');
        return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
        return res.status(401).json({ error: 'Missing X-Hub-Signature-256 header' });
    }

    if (!req.rawBody) {
        console.error('req.rawBody is not available - ensure express.json verify option is configured');
        return res.status(500).json({ error: 'Unable to verify signature' });
    }

    const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', secret)
        .update(req.rawBody)
        .digest('hex');

    const signatureBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (signatureBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    next();
};
