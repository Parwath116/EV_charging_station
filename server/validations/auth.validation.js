import { z } from 'zod';

export const registerSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters'),
  email: z.string().email('Please provide a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(100, 'Password cannot exceed 100 characters'),
  role: z.enum(['driver', 'operator']).default('driver'),
  vehicles: z
    .array(
      z.object({
        make: z.string().min(1, 'Make is required'),
        model: z.string().min(1, 'Model is required'),
        connectorType: z.enum(['CCS2', 'Type2', 'CHAdeMO', 'GB/T']),
        batteryKWh: z.number().min(1, 'Battery capacity must be at least 1 kWh'),
      })
    )
    .optional()
    .default([]),
});

export const loginSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters long')
    .max(100, 'New password cannot exceed 100 characters'),
});
