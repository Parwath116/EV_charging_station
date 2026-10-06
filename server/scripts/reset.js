import { env } from '../config/env.js';
import { connectDB, getDB, closeDB } from '../config/db.js';
import { setupCollections } from '../config/schema.js';
import { logger } from '../utils/logger.js';

export async function resetDatabase() {
  const isForce = process.argv.includes('--force');
  const uri = env.MONGODB_URI;
  const isLocal = uri.includes('localhost') || uri.includes('127.0.0.1');

  if (!isLocal && !isForce) {
    const errorMsg =
      'Reset aborted: MONGODB_URI does not point to localhost or 127.0.0.1. Pass --force to execute reset on remote/non-local databases.';
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  try {
    await connectDB();
    const db = getDB();

    logger.info('Starting VoltGrid database reset...');
    const collections = await db.listCollections().toArray();

    for (const col of collections) {
      // Don't drop system collections
      if (col.name.startsWith('system.')) continue;
      logger.info(`Dropping collection: ${col.name}`);
      await db.collection(col.name).drop();
    }

    logger.info('Re-initializing collections, validators, and indexes...');
    await setupCollections(db);

    logger.info('Database reset completed successfully.');
  } catch (error) {
    logger.error('Failed to reset database:', error);
    throw error;
  }
}

// Direct execution from CLI
if (process.argv[1]?.endsWith('reset.js')) {
  resetDatabase()
    .then(async () => {
      await closeDB();
      process.exit(0);
    })
    .catch(async () => {
      await closeDB();
      process.exit(1);
    });
}
