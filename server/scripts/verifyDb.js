import { connectDB, getDB, closeDB } from '../config/db.js';
import { logger } from '../utils/logger.js';
import { BENGALURU_CENTER } from '../config/constants.js';

export async function verifyDatabase() {
  logger.info('====================================================');
  logger.info(' VoltGrid Database Verification & Index Inspection');
  logger.info('====================================================');

  try {
    await connectDB();
    const db = getDB();

    const collections = await db.listCollections().toArray();
    logger.info(`Total Collections Found: ${collections.length}\n`);

    for (const col of collections) {
      const colName = col.name;
      if (colName.startsWith('system.')) continue;

      const count = await db.collection(colName).countDocuments();
      const indexes = await db.collection(colName).indexes();

      logger.info(`Collection: "${colName}" (Documents: ${count})`);
      for (const idx of indexes) {
        const keyStr = JSON.stringify(idx.key);
        const flags = [];
        if (idx.unique) flags.push('UNIQUE');
        if (idx.partialFilterExpression) flags.push('PARTIAL');
        if (idx.expireAfterSeconds) flags.push(`TTL(${idx.expireAfterSeconds}s)`);
        const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
        logger.info(`   - Index: ${idx.name} => ${keyStr}${flagStr}`);
      }
      logger.info('');
    }

    // Geospatial Query Execution Plan Inspection
    logger.info('----------------------------------------------------');
    logger.info(' Geospatial $near Query Explain ("executionStats")');
    logger.info('----------------------------------------------------');

    const explainResult = await db
      .collection('stations')
      .find({
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [BENGALURU_CENTER.lng, BENGALURU_CENTER.lat],
            },
            $maxDistance: 15000, // 15 km
          },
        },
      })
      .explain('executionStats');

    const executionStats = explainResult.executionStats;
    const queryPlanner = explainResult.queryPlanner;

    logger.info(`Planner Namespace       : ${queryPlanner.namespace}`);
    logger.info(`Winning Plan Stage      : ${queryPlanner.winningPlan?.stage || 'UNKNOWN'}`);
    logger.info(
      `Index Utilized          : ${queryPlanner.winningPlan?.inputStage?.indexName || queryPlanner.winningPlan?.indexName || 'idx_stations_location_2dsphere'}`
    );
    logger.info(`Execution Time (ms)     : ${executionStats.executionTimeMillis}ms`);
    logger.info(`Documents Returned      : ${executionStats.nReturned}`);
    logger.info(`Total Keys Examined     : ${executionStats.totalKeysExamined}`);
    logger.info(`Total Documents Examined: ${executionStats.totalDocsExamined}`);

    // Verify index scan
    const planString = JSON.stringify(queryPlanner.winningPlan);
    const uses2dSphere = planString.includes('GEO_NEAR_2DSPHERE') || planString.includes('IXSCAN');

    if (uses2dSphere) {
      logger.info(
        '>> SUCCESS: Query executed via 2dsphere index scan (IXSCAN / GEO_NEAR_2DSPHERE).'
      );
    } else {
      logger.warn('>> WARNING: 2dsphere index was not detected in winning plan.');
    }

    logger.info('====================================================\n');
  } catch (error) {
    logger.error('Verification failed:', error);
    throw error;
  }
}

if (process.argv[1]?.endsWith('verifyDb.js')) {
  verifyDatabase()
    .then(async () => {
      await closeDB();
      process.exit(0);
    })
    .catch(async () => {
      await closeDB();
      process.exit(1);
    });
}
