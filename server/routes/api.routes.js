import { Router } from 'express';
import healthRouter from './health.routes.js';
import authRouter from './auth.routes.js';
import stationRouter from './station.routes.js';
import bookingRouter from './booking.routes.js';
import sessionRouter from './session.routes.js';
import userRouter from './user.routes.js';
import analyticsRouter from './analytics.routes.js';
import alertRouter from './alert.routes.js';
import realtimeRouter from './realtime.routes.js';
import labRouter from './lab.routes.js';

const router = Router();

// Health check endpoint
router.use('/', healthRouter);

// Authentication & Session Auth endpoints
router.use('/auth', authRouter);

// Station Management & Discovery endpoints
router.use('/stations', stationRouter);

// Reservation & Slot Booking endpoints
router.use('/bookings', bookingRouter);

// Live Charging Sessions & Telemetry endpoints
router.use('/sessions', sessionRouter);

// User Governance, Vehicles & Wallet endpoints
router.use('/users', userRouter);

// Aggregation Analytics & Grid Intelligence endpoints
router.use('/analytics', analyticsRouter);

// Operational Alerts & Hardware Health endpoints
router.use('/alerts', alertRouter);

// Real-Time SSE Event Streaming endpoints
router.use('/realtime', realtimeRouter);

// Admin Database Lab Diagnostics & Performance Tooling
router.use('/lab', labRouter);

export default router;
