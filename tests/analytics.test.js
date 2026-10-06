import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { connectDB, closeDB, getDB } from '../server/config/db.js';

describe('Phase 6: Advanced Analytics & Aggregation Pipelines Integration Tests', () => {
  const app = createApp();
  let adminToken = '';
  let operatorToken = '';
  let driverToken = '';

  before(async () => {
    await connectDB();

    // 1. Authenticate Admin
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@voltgrid.internal', password: 'VoltGrid#2026' });
    adminToken = adminRes.body.data.token;

    // 2. Authenticate Operator
    const operatorRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'operator.whitefield@voltgrid.internal', password: 'VoltGrid#2026' });
    operatorToken = operatorRes.body.data.token;

    // 3. Authenticate Driver
    const driverRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'driver.aarav.mehta.1@voltgrid.internal', password: 'VoltGrid#2026' });
    driverToken = driverRes.body.data.token;
  });

  after(async () => {
    await closeDB();
  });

  describe('RBAC Access Control on Analytics Endpoints', () => {
    it('Driver is denied access (RBAC 403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/analytics/peak-hours')
        .set('Authorization', `Bearer ${driverToken}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });

    it('Unauthenticated request is rejected (401 Unauthorized)', async () => {
      const res = await request(app).get('/api/analytics/peak-hours');

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    it('Operator and Admin are granted access (200 OK)', async () => {
      const opRes = await request(app)
        .get('/api/analytics/peak-hours')
        .set('Authorization', `Bearer ${operatorToken}`);
      assert.equal(opRes.status, 200);

      const adminRes = await request(app)
        .get('/api/analytics/peak-hours')
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(adminRes.status, 200);
    });
  });

  describe('Core Aggregation Pipelines', () => {
    it('GET /api/analytics/peak-hours calculates diurnal hourly load ($project, $hour, $group, $sort)', async () => {
      const res = await request(app)
        .get('/api/analytics/peak-hours')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length > 0);

      const firstEntry = res.body.data[0];
      assert.ok(typeof firstEntry.hour === 'number');
      assert.ok(typeof firstEntry.totalSessions === 'number');
      assert.ok(typeof firstEntry.totalEnergyKWh === 'number');
      assert.ok(typeof firstEntry.totalRevenue === 'number');
    });

    it('GET /api/analytics/stations calculates station throughput via $lookup', async () => {
      const res = await request(app)
        .get('/api/analytics/stations')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length > 0);

      const hub = res.body.data[0];
      assert.ok(hub.name);
      assert.ok(hub.area);
      assert.ok(typeof hub.chargerCount === 'number');
      assert.ok(typeof hub.totalSessions === 'number');
      assert.ok(typeof hub.totalRevenue === 'number');
      assert.ok(typeof hub.avgDurationMinutes === 'number');
    });

    it('GET /api/analytics/area-breakdown computes multi-facet metrics via $facet', async () => {
      const res = await request(app)
        .get('/api/analytics/area-breakdown')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.byArea);
      assert.ok(res.body.data.totals);
      assert.ok(Array.isArray(res.body.data.byArea));
      assert.ok(Array.isArray(res.body.data.totals));

      const area = res.body.data.byArea[0];
      assert.ok(area.area);
      assert.ok(typeof area.totalRevenue === 'number');
      assert.ok(typeof area.totalEnergyKWh === 'number');

      const totals = res.body.data.totals[0];
      assert.ok(totals.totalSessions > 0);
      assert.ok(totals.totalRevenue > 0);
    });

    it('GET /api/analytics/duration-distribution groups dwell times via $bucket', async () => {
      const res = await request(app)
        .get('/api/analytics/duration-distribution')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length > 0);

      const bucket = res.body.data[0];
      assert.ok(bucket._id !== undefined);
      assert.ok(typeof bucket.count === 'number');
      assert.ok(typeof bucket.totalRevenue === 'number');
    });

    it('GET /api/analytics/rolling-average calculates 7-day smoothing via $setWindowFields', async () => {
      const res = await request(app)
        .get('/api/analytics/rolling-average')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length > 0);

      const row = res.body.data[0];
      assert.ok(row.date);
      assert.ok(typeof row.rollingAvgEnergyKWh === 'number');
      assert.ok(typeof row.rollingTotalRevenue === 'number');
    });

    it('POST /api/analytics/refresh-daily-stats merges live sessions into daily_station_stats ($merge)', async () => {
      const res = await request(app)
        .post('/api/analytics/refresh-daily-stats')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      // Verify records exist in daily_station_stats
      const db = getDB();
      const count = await db.collection('daily_station_stats').countDocuments();
      assert.ok(count > 0);
    });

    it('GET /api/analytics/expansion-suggestions produces algorithmic zone rankings', async () => {
      const res = await request(app)
        .get('/api/analytics/expansion-suggestions')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length > 0);

      const rec = res.body.data[0];
      assert.ok(rec.area);
      assert.ok(typeof rec.demandRatio === 'number');
      assert.ok(rec.recommendation);
      assert.ok(rec.priority);
    });

    it('GET /api/analytics/export/stations-csv streams formatted CSV document', async () => {
      const res = await request(app)
        .get('/api/analytics/export/stations-csv')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'], /text\/csv/);
      assert.match(
        res.headers['content-disposition'],
        /attachment; filename="voltgrid_station_performance.csv"/
      );
      assert.match(res.text, /Station ID,Name,Area,Operator/);
    });

    it('GET /api/analytics/export/revenue-csv streams formatted revenue CSV document', async () => {
      const res = await request(app)
        .get('/api/analytics/export/revenue-csv')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'], /text\/csv/);
      assert.match(res.text, /Area,Total Sessions,Total Energy \(kWh\),Total Revenue \(INR\)/);
    });
  });
});
