import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { createApp } from '../server/app.js';
import { connectDB, closeDB } from '../server/config/db.js';

describe('Phase 8: Database Lab & Query Performance Tool Integration Tests', () => {
  let app;
  let adminToken;
  let operatorToken;
  let driverToken;

  before(async () => {
    await connectDB();
    app = createApp();

    // 1. Authenticate Admin Persona
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@voltgrid.internal', password: 'VoltGrid#2026' });
    adminToken = adminRes.body?.data?.token;

    // 2. Authenticate Operator Persona
    const opRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'operator.whitefield@voltgrid.internal', password: 'VoltGrid#2026' });
    operatorToken = opRes.body?.data?.token;

    // 3. Authenticate Driver Persona
    const driverRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'driver.aarav.mehta.1@voltgrid.internal', password: 'VoltGrid#2026' });
    driverToken = driverRes.body?.data?.token;
  });

  after(async () => {
    await closeDB();
  });

  describe('RBAC Authorization Guard (Admin-Only)', () => {
    it('Driver is denied access to Database Lab endpoints (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/lab/explain')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ scenario: 'geo_near' });

      assert.equal(res.status, 403);
    });

    it('Operator is denied access to Database Lab endpoints (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/lab/index-comparison')
        .set('Authorization', `Bearer ${operatorToken}`);

      assert.equal(res.status, 403);
    });

    it('Admin is granted access to Database Lab endpoints (200 OK)', async () => {
      const res = await request(app)
        .get('/api/lab/index-comparison')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    });
  });

  describe('Query Explain & ExecutionStats Evaluator', () => {
    it('Evaluates Geospatial Discovery ($near 2dsphere) explain plan', async () => {
      const res = await request(app)
        .post('/api/lab/explain')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ scenario: 'geo_near' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.executionStats);
      assert.equal(res.body.data.collection, 'stations');
    });

    it('Evaluates Diurnal Peak-Hour Aggregation explain plan', async () => {
      const res = await request(app)
        .post('/api/lab/explain')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ scenario: 'peak_hour_agg' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.collection, 'sessions');
      assert.ok(res.body.data.executionStats);
    });

    it('Evaluates Full-Text Search explain plan', async () => {
      const res = await request(app)
        .post('/api/lab/explain')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ scenario: 'text_search' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.collection, 'stations');
      assert.ok(res.body.data.executionStats);
    });

    it('Evaluates Active Bookings Partial Index explain plan', async () => {
      const res = await request(app)
        .post('/api/lab/explain')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ scenario: 'partial_index_bookings' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.collection, 'bookings');
    });
  });

  describe('Index Benchmark (IXSCAN vs COLLSCAN)', () => {
    it('Compares indexed vs unindexed query performance side-by-side', async () => {
      const res = await request(app)
        .get('/api/lab/index-comparison')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      const { indexedRun, unindexedRun, analysis } = res.body.data;
      assert.equal(indexedRun.stage, 'IXSCAN');
      assert.equal(unindexedRun.stage, 'COLLSCAN');

      // Unindexed scan must inspect all collection documents
      assert.ok(
        indexedRun.totalDocsExamined <= unindexedRun.totalDocsExamined,
        'Indexed scan must examine fewer or equal documents compared to full collection scan'
      );
      assert.ok(analysis.docsExaminedSaved >= 0);
      assert.ok(typeof analysis.docReductionPercentage === 'string');
    });
  });

  describe('Server-Side Schema Validation Sandbox (Error 121)', () => {
    it('Captures MongoDB Error 121 when writing negative wallet balance', async () => {
      const res = await request(app)
        .post('/api/lab/validate-demo')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'negative_wallet' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.rejected, true);
      assert.equal(res.body.data.errorCode, 121);
      assert.equal(res.body.data.errorName, 'MongoServerError');
    });

    it('Captures MongoDB Error 121 when writing out-of-bounds GPS coordinates', async () => {
      const res = await request(app)
        .post('/api/lab/validate-demo')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'out_of_bounds_gps' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.rejected, true);
      assert.equal(res.body.data.errorCode, 121);
    });

    it('Captures MongoDB Error 121 when writing invalid charger connector enum', async () => {
      const res = await request(app)
        .post('/api/lab/validate-demo')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'invalid_connector' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.rejected, true);
      assert.equal(res.body.data.errorCode, 121);
    });
  });

  describe('Multi-Document ACID Transactions Demonstrator', () => {
    it('Executes and commits multi-document transaction across stations and bookings', async () => {
      const res = await request(app)
        .post('/api/lab/transaction-demo')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ abort: false });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.transactionStatus, 'COMMITTED');
      assert.equal(res.body.data.persistedInDatabase, true);
      assert.ok(Array.isArray(res.body.data.logTrace));
      assert.ok(res.body.data.durationMillis >= 0);
    });

    it('Rolls back transaction completely upon injected fault with zero residual writes', async () => {
      const res = await request(app)
        .post('/api/lab/transaction-demo')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ abort: true });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.transactionStatus, 'ABORTED');
      assert.equal(res.body.data.persistedInDatabase, false);
      assert.equal(res.body.data.abortedDueTo, 'SIMULATED_TRANSACTION_FAULT_TEST');
    });
  });

  describe('Cluster Schema Inventory & Storage Footprint', () => {
    it('Retrieves schema summary with document counts and index metadata', async () => {
      const res = await request(app)
        .get('/api/lab/schema-summary')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.databaseName);
      assert.ok(Array.isArray(res.body.data.collections));

      const stationCol = res.body.data.collections.find(c => c.collection === 'stations');
      assert.ok(stationCol);
      assert.ok(stationCol.documentCount >= 1);
      assert.ok(stationCol.indexes.length >= 1);

      const telemetryCol = res.body.data.collections.find(c => c.collection === 'telemetry');
      assert.ok(telemetryCol);
      assert.equal(telemetryCol.isTimeSeries, true);
    });
  });
});
