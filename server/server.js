import http from 'http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDB, closeDB, getDb } from './config/db.js';
import { SSEService } from './services/sse.service.js';
import { logger } from './utils/logger.js';

async function startServer() {
  try {
    // 1. Establish Database Connection
    await connectDB();

    // 2. Initialize Real-Time Change Streams
    await SSEService.initChangeStreams(getDb());

    // 3. Instantiate Express App
    const app = createApp();
    const server = http.createServer(app);

    // 4. Port Conflict Detection and Error Handling
    server.on('error', error => {
      if (error.code === 'EADDRINUSE') {
        logger.error(
          `Port ${env.PORT} is already in use. Please configure a different PORT in .env or terminate the occupying process.`
        );
        process.exit(1);
      }
      logger.error('Unexpected server error encountered:', error);
      process.exit(1);
    });

    // 5. Start Listening
    server.listen(env.PORT, () => {
      logger.info('====================================================');
      logger.info(` VoltGrid EV Network Platform Server Initialized`);
      logger.info(` Environment : ${env.NODE_ENV}`);
      logger.info(` HTTP Port   : ${env.PORT}`);
      logger.info(` Health Check: http://localhost:${env.PORT}/api/health`);
      logger.info(` Client URL  : ${env.CLIENT_ORIGIN}`);
      logger.info('====================================================');
    });

    // 6. Graceful Teardown
    const gracefulShutdown = async signal => {
      logger.info(`Received ${signal}. Initiating graceful shutdown...`);
      await SSEService.close();
      server.close(async () => {
        logger.info('HTTP server closed.');
        try {
          await closeDB();
          logger.info('All connections terminated cleanly. Exiting.');
          process.exit(0);
        } catch (err) {
          logger.error('Error during database teardown:', err);
          process.exit(1);
        }
      });

      // Force kill after 10s timeout
      setTimeout(() => {
        logger.error('Graceful shutdown timed out. Forcing process exit.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error('Fatal initialization error:', error.message);
    process.exit(1);
  }
}

startServer();
