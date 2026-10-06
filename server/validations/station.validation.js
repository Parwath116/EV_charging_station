import { z } from 'zod';
import { BENGALURU_BOUNDS } from '../config/constants.js';

export const createStationSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(150),
  operator: z.string().min(2, 'Operator name is required'),
  address: z.string().min(5, 'Address is required'),
  area: z.string().min(2, 'Area is required'),
  location: z.object({
    type: z.literal('Point'),
    coordinates: z
      .tuple([z.number(), z.number()])
      .refine(
        ([lng, lat]) =>
          lng >= BENGALURU_BOUNDS.minLng &&
          lng <= BENGALURU_BOUNDS.maxLng &&
          lat >= BENGALURU_BOUNDS.minLat &&
          lat <= BENGALURU_BOUNDS.maxLat,
        {
          message: `Coordinates must fall within Bengaluru bounds (Lng: [${BENGALURU_BOUNDS.minLng}, ${BENGALURU_BOUNDS.maxLng}], Lat: [${BENGALURU_BOUNDS.minLat}, ${BENGALURU_BOUNDS.maxLat}])`,
        }
      ),
  }),
  amenities: z.array(z.string()).default([]),
  tariffPerKWh: z.number().min(0, 'Tariff must be non-negative'),
  openHours: z.string().default('24/7'),
  status: z.enum(['active', 'maintenance', 'decommissioned']).default('active'),
  chargers: z
    .array(
      z.object({
        chargerId: z.string().min(2, 'Charger ID is required'),
        connector: z.enum(['CCS2', 'Type2', 'CHAdeMO', 'GB/T']),
        powerKW: z.number().min(1, 'Power must be at least 1 kW'),
        status: z
          .enum(['available', 'charging', 'reserved', 'faulted', 'offline', 'maintenance'])
          .default('available'),
      })
    )
    .min(1, 'At least one charger must be configured'),
});

export const updateStationSchema = createStationSchema.partial();

export const nearestQuerySchema = z.object({
  lng: z.coerce.number(),
  lat: z.coerce.number(),
  maxDistance: z.coerce.number().default(15000), // meters
  limit: z.coerce.number().default(10),
  onlyAvailable: z.coerce.boolean().default(false),
});

export const geoWithinCircleSchema = z.object({
  lng: z.coerce.number(),
  lat: z.coerce.number(),
  radiusMeters: z.coerce.number().min(100).max(50000).default(5000),
});
