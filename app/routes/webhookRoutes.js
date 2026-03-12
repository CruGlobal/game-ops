import { Router } from 'express';
import { verifyWebhookSignature } from '../middleware/webhookVerification.js';
import { handleGitHubWebhook } from '../controllers/webhookController.js';

const router = Router();

// GitHub webhook endpoint - signature verified, no auth middleware
router.post('/github', verifyWebhookSignature, handleGitHubWebhook);

export default router;
