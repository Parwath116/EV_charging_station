import { connectDB, getDB, closeDB } from '../config/db.js';
import { setupCollections } from '../config/schema.js';
import { seedDatabase } from './seed.js';
import { logger } from '../utils/logger.js';

process.env.DB_NAME = 'voltgrid_test';
process.env.NODE_ENV = 'test';

async function main() {
  try {
    await connectDB();
    const db = getDB();
    logger.info('Priming isolated test database "voltgrid_test"...');
    await setupCollections(db);
    await seedDatabase(42);
    logger.info('Database "voltgrid_test" primed deterministically.');
    await closeDB();
  } catch (error) {
    logger.error('Failed to seed voltgrid_test:', error);
    await closeDB();
    process.exit(1);
  }
}

main();
