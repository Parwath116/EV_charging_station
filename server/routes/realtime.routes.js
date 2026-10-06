import { Router } from 'express';
import { SSEService } from '../services/sse.service.js';

const router = Router();

/**
 * Server-Sent Events (SSE) streaming endpoint.
 * Connects browser clients to live station status changes and anomaly alerts.
 */
router.get('/events', (req, res) => {
  SSEService.addClient(res, req);
});

export default router;
