import { connectDB, getDB, closeDB } from '../config/db.js';
import { collectionsSchema } from '../config/schema.js';
import { logger } from '../utils/logger.js';

export async function applyIndexes() {
  logger.info('Applying all collection indexes idempotently...');
  try {
    await connectDB();
    const db = getDB();

    for (const [colName, config] of Object.entries(collectionsSchema)) {
      if (config.indexes && config.indexes.length > 0) {
        logger.info(`Ensuring indexes for collection "${colName}"...`);
        for (const idx of config.indexes) {
          const { key, name, ...options } = idx;
          try {
            const indexName = await db.collection(colName).createIndex(key, { name, ...options });
            logger.info(`  [OK] Index "${indexName}" on "${colName}"`);
          } catch (err) {
            logger.warn(`  [WARN] Index "${name}" on "${colName}": ${err.message}`);
          }
        }
      }
    }

    // Secondary index on time-series telemetry collection
    try {
      const telemetryIdx = await db
        .collection('telemetry')
        .createIndex(
          { 'meta.stationId': 1, 'meta.chargerId': 1, ts: -1 },
          { name: 'idx_telemetry_meta_ts' }
        );
      logger.info(`  [OK] Index "${telemetryIdx}" on "telemetry"`);
    } catch (err) {
      logger.warn(`  [WARN] Index on "telemetry": ${err.message}`);
    }

    logger.info('Index application completed successfully.');
  } catch (error) {
    logger.error('Failed to apply indexes:', error);
    throw error;
  }
}

if (process.argv[1]?.endsWith('indexes.js')) {
  applyIndexes()
    .then(async () => {
      await closeDB();
      process.exit(0);
    })
    .catch(async () => {
      await closeDB();
      process.exit(1);
    });
}
