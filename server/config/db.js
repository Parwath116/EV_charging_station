import { MongoClient } from 'mongodb';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let client = null;
let db = null;

const clientOptions = {
  maxPoolSize: 50,
  minPoolSize: 5,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
};

export async function connectDB() {
  if (db && client) {
    return { client, db };
  }

  try {
    logger.info(
      `Connecting to MongoDB at: ${env.MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`
    );
    client = new MongoClient(env.MONGODB_URI, clientOptions);
    await client.connect();

    db = client.db(env.DB_NAME);

    // Verify connectivity with a quick ping
    const pingResult = await db.command({ ping: 1 });
    logger.info(
      `MongoDB connected successfully to database "${env.DB_NAME}". Ping response:`,
      pingResult
    );

    // Setup connection event listeners
    client.on('connectionPoolCreated', () => logger.debug('MongoDB connection pool initialized.'));
    client.on('close', () => logger.warn('MongoDB connection closed.'));
    client.on('error', err => logger.error('MongoDB client error:', err));

    return { client, db };
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error.message);
    throw error;
  }
}

export function getDB() {
  if (!db) {
    throw new Error('Database not initialized. Call connectDB() first.');
  }
  return db;
}

export const getDb = getDB;

export function getClient() {
  if (!client) {
    throw new Error('MongoClient not initialized. Call connectDB() first.');
  }
  return client;
}

export async function checkHealth() {
  if (!client || !db) {
    return {
      connected: false,
      status: 'disconnected',
      error: 'Client not initialized',
    };
  }

  const start = Date.now();
  try {
    await db.command({ ping: 1 });
    const latencyMs = Date.now() - start;

    // Check replica set status
    let replicaSet = null;
    let isWritablePrimary = false;

    try {
      const helloResult = await db.command({ hello: 1 });
      replicaSet = helloResult.setName || null;
      isWritablePrimary = Boolean(helloResult.isWritablePrimary);
    } catch {
      // Fallback if hello command not supported in older versions
      try {
        const isMaster = await db.command({ isMaster: 1 });
        replicaSet = isMaster.setName || null;
        isWritablePrimary = Boolean(isMaster.ismaster);
      } catch {
        // Standalone or uninitialized
      }
    }

    return {
      connected: true,
      status: 'healthy',
      database: env.DB_NAME,
      replicaSet,
      isWritablePrimary,
      latencyMs,
    };
  } catch (error) {
    return {
      connected: false,
      status: 'unhealthy',
      error: error.message,
      latencyMs: Date.now() - start,
    };
  }
}

export async function closeDB() {
  if (client) {
    logger.info('Closing MongoDB connection pool...');
    await client.close();
    client = null;
    db = null;
    logger.info('MongoDB connection pool terminated.');
  }
}
