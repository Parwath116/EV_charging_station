import { Router } from 'express';
import { checkHealth } from '../config/db.js';
import { env } from '../config/env.js';

const router = Router();

router.get('/health', async (req, res, next) => {
  try {
    const dbHealth = await checkHealth();
    const isDbOk = dbHealth.connected;

    const payload = {
      status: isDbOk ? 'ok' : 'degraded',
      service: 'VoltGrid EV Network API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: env.NODE_ENV,
      port: env.PORT,
      database: dbHealth,
    };

    const statusCode = isDbOk ? 200 : 503;
    res.status(statusCode).json(payload);
  } catch (error) {
    next(error);
  }
});

export default router;
