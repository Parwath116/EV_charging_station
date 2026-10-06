import { z } from 'zod';

export const startSessionSchema = z.object({
  stationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid station ObjectId'),
  chargerId: z.string().min(1, 'Charger ID is required'),
});

export const stopSessionSchema = z.object({
  finalEnergyKWh: z.coerce.number().min(0.01, 'Delivered energy must be greater than zero'),
});

export const telemetryPayloadSchema = z.object({
  stationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid station ObjectId'),
  chargerId: z.string().min(1, 'Charger ID is required'),
  sessionId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid session ObjectId')
    .optional(),
  powerKW: z.number().min(0),
  voltage: z.number().min(0).default(400),
  currentA: z.number().min(0).default(32),
  socPercent: z.number().min(0).max(100),
  temperatureC: z.number().default(30),
});
