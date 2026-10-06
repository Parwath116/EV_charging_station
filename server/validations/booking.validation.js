import { z } from 'zod';

export const createBookingSchema = z
  .object({
    stationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid station ObjectId'),
    chargerId: z.string().min(1, 'Charger ID is required'),
    startTime: z.string().datetime({ message: 'Start time must be a valid ISO datetime' }),
    endTime: z.string().datetime({ message: 'End time must be a valid ISO datetime' }),
    estimatedCost: z.number().min(0).optional(),
  })
  .refine(data => new Date(data.endTime) > new Date(data.startTime), {
    message: 'End time must be strictly after start time',
    path: ['endTime'],
  });

export const rescheduleBookingSchema = z
  .object({
    startTime: z.string().datetime({ message: 'New start time must be a valid ISO datetime' }),
    endTime: z.string().datetime({ message: 'New end time must be a valid ISO datetime' }),
  })
  .refine(data => new Date(data.endTime) > new Date(data.startTime), {
    message: 'New end time must be strictly after new start time',
    path: ['endTime'],
  });

export const estimateCostSchema = z.object({
  stationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid station ObjectId'),
  batteryKWh: z.coerce.number().min(1, 'Battery capacity must be at least 1 kWh'),
  currentSoc: z.coerce
    .number()
    .min(0)
    .max(100, 'Current state of charge must be between 0 and 100'),
  targetSoc: z.coerce.number().min(0).max(100, 'Target state of charge must be between 0 and 100'),
  chargerPowerKW: z.coerce.number().min(1).default(60),
});
