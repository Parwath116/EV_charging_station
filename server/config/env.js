import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const isTestRun =
  process.env.NODE_ENV === 'test' ||
  process.execArgv.includes('--test') ||
  process.argv.some(
    arg => arg.includes('.test.js') || arg.includes('--test') || arg.includes('seedTestDb.js')
  );

if (isTestRun) {
  process.env.NODE_ENV = 'test';
  if (!process.env.DB_NAME || process.env.DB_NAME === 'voltgrid') {
    process.env.DB_NAME = 'voltgrid_test';
  }
}

const envSchema = z.object({
  PORT: z
    .string()
    .default('5173')
    .transform(val => parseInt(val, 10))
    .refine(port => !isNaN(port) && port > 0 && port <= 65535, {
      message: 'PORT must be a valid integer between 1 and 65535',
    })
    .refine(port => port !== 3000, {
      message: 'Port 3000 is restricted and reserved. Please set PORT in .env (default 5173).',
    }),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z
    .string()
    .default('mongodb://127.0.0.1:27018/voltgrid?replicaSet=rs0&directConnection=true'),
  DB_NAME: z.string().default('voltgrid'),
  CLIENT_ORIGIN: z.string().optional(),
  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET must be at least 16 characters long')
    .default('voltgrid_production_super_secret_signing_key_2026_xyz'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  CLIENT_ORIGIN: parsed.data.CLIENT_ORIGIN || `http://localhost:${parsed.data.PORT}`,
};
