import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import request from 'supertest';
import { ObjectId } from 'mongodb';

import { createApp } from '../server/app.js';
import { connectDB, closeDB, getDb } from '../server/config/db.js';
import { AlertRepository } from '../server/repositories/alert.repository.js';
import { TelemetryRepository } from '../server/repositories/telemetry.repository.js';
import { AlertService } from '../server/services/alert.service.js';
import { runSimulationCycle } from '../server/scripts/simulator.js';

describe('Phase 7: Real-Time Telemetry, IoT Simulator & Alerting Integration Tests', () => {
  let app;
  let db;
  let adminToken;
  let operatorToken;
  let driverToken;
  let testStation;
  let testChargerId;

  before(async () => {
    await connectDB();
    db = getDb();
    app = createApp();

    // 1. Authenticate Test Personas
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@voltgrid.internal', password: 'VoltGrid#2026' });
    adminToken = adminRes.body?.data?.token;

    const opRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'operator.whitefield@voltgrid.internal', password: 'VoltGrid#2026' });
    operatorToken = opRes.body?.data?.token;

    const driverRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'driver.aarav.mehta.1@voltgrid.internal', password: 'VoltGrid#2026' });
    driverToken = driverRes.body?.data?.token;

    // 2. Fetch an active station for testing
    testStation = await db.collection('stations').findOne({ status: 'active' });
    assert.ok(testStation, 'Active station must exist for realtime tests');
    testChargerId = testStation.chargers[0].chargerId;
  });

  after(async () => {
    await closeDB();
  });

  describe('Hardware Telemetry Anomaly Evaluation Rules', () => {
    it('Detects high operating temperature (>=65°C) and creates high-severity alert', async () => {
      const alert = await AlertService.evaluateTelemetry({
        stationId: testStation._id,
        chargerId: testChargerId,
        powerKW: 50,
        voltage: 230,
        temperatureC: 68.5,
      });

      assert.ok(alert, 'Alert should be generated');
      assert.equal(alert.type, 'overtemperature');
      assert.equal(alert.severity, 'high');
      assert.equal(alert.acknowledged, false);
    });

    it('Detects critical temperature (>=75°C), creates critical alert, and transitions charger status to faulted', async () => {
      const alert = await AlertService.evaluateTelemetry({
        stationId: testStation._id,
        chargerId: testChargerId,
        powerKW: 120,
        voltage: 230,
        temperatureC: 78.2,
      });

      assert.ok(alert, 'Critical alert should be generated');
      assert.equal(alert.type, 'overtemperature');
      assert.equal(alert.severity, 'critical');

      // Verify charger status transitioned in stations collection
      const updatedStation = await db.collection('stations').findOne({ _id: testStation._id });
      const charger = updatedStation.chargers.find(c => c.chargerId === testChargerId);
      assert.equal(
        charger.status,
        'faulted',
        'Charger should be safely transitioned to faulted on critical thermal trip'
      );

      // Revert charger status back to available for subsequent tests
      await db
        .collection('stations')
        .updateOne(
          { _id: testStation._id, 'chargers.chargerId': testChargerId },
          { $set: { 'chargers.$.status': 'available' } }
        );
    });

    it('Detects overvoltage (>260V) and generates overvoltage alert', async () => {
      const alert = await AlertService.evaluateTelemetry({
        stationId: testStation._id,
        chargerId: testChargerId,
        powerKW: 60,
        voltage: 275,
        temperatureC: 45,
      });

      assert.ok(alert, 'Voltage alert should be generated');
      assert.equal(alert.type, 'overvoltage');
      assert.equal(alert.severity, 'high');
    });

    it('Detects hardware safety fault code and generates critical fault_code alert', async () => {
      const alert = await AlertService.evaluateTelemetry({
        stationId: testStation._id,
        chargerId: testChargerId,
        powerKW: 0,
        voltage: 230,
        temperatureC: 35,
        faultCode: 'ERR_INSULATION_TRIP_09',
      });

      assert.ok(alert, 'Hardware fault alert should be generated');
      assert.equal(alert.type, 'fault_code');
      assert.equal(alert.severity, 'critical');
    });

    it('Returns null when readings are within nominal operating limits', async () => {
      const alert = await AlertService.evaluateTelemetry({
        stationId: testStation._id,
        chargerId: testChargerId,
        powerKW: 45,
        voltage: 230,
        temperatureC: 40,
      });

      assert.equal(alert, null, 'No alert should be generated for nominal parameters');
    });
  });

  describe('Operational Alerts Management API & RBAC', () => {
    let createdAlertId;

    before(async () => {
      const alert = await AlertRepository.createAlert({
        stationId: testStation._id,
        chargerId: testChargerId,
        type: 'connectivity_loss',
        severity: 'medium',
        message: 'Telemetry heartbeat lost for 60 seconds',
      });
      createdAlertId = alert._id.toString();
    });

    it('Driver cannot list operational alerts (RBAC 403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/alerts')
        .set('Authorization', `Bearer ${driverToken}`);
      assert.equal(res.status, 403);
    });

    it('Operator successfully lists operational alerts and filters by acknowledged status', async () => {
      const res = await request(app)
        .get('/api/alerts?acknowledged=false')
        .set('Authorization', `Bearer ${operatorToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length >= 1);
      assert.ok(res.body.data.every(a => a.acknowledged === false));
    });

    it('Operator retrieves unread alerts count', async () => {
      const res = await request(app)
        .get('/api/alerts/unread-count')
        .set('Authorization', `Bearer ${operatorToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(typeof res.body.data.count === 'number');
      assert.ok(res.body.data.count >= 1);
    });

    it('Driver cannot resolve operational alerts (RBAC 403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/alerts/${createdAlertId}/resolve`)
        .set('Authorization', `Bearer ${driverToken}`);

      assert.equal(res.status, 403);
    });

    it('Operator successfully acknowledges and resolves alert, recording audit log', async () => {
      const res = await request(app)
        .patch(`/api/alerts/${createdAlertId}/resolve`)
        .set('Authorization', `Bearer ${operatorToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.acknowledged, true);
      assert.ok(res.body.data.resolvedAt);

      // Verify audit log created
      const auditLog = await db.collection('audit_logs').findOne({
        action: 'ALERT_RESOLVED',
        documentId: { $in: [createdAlertId, new ObjectId(createdAlertId)] },
      });
      assert.ok(auditLog, 'Audit log must record alert resolution');
      assert.equal(auditLog.collection, 'alerts');
    });

    it('Returns 404 for non-existent alert resolution', async () => {
      const fakeId = new ObjectId().toString();
      const res = await request(app)
        .patch(`/api/alerts/${fakeId}/resolve`)
        .set('Authorization', `Bearer ${operatorToken}`);

      assert.equal(res.status, 404);
    });
  });

  describe('Time-Series Telemetry & IoT Simulator Cycle', () => {
    it('Bulk inserts telemetry readings into time-series collection', async () => {
      const testReadings = [
        {
          ts: new Date(),
          meta: { stationId: testStation._id, chargerId: testChargerId },
          powerKW: 60.5,
          voltage: 231.2,
          currentA: 261.8,
          temperatureC: 44.1,
          socPct: 65,
          chargerStatus: 'charging',
        },
        {
          ts: new Date(Date.now() - 5000),
          meta: { stationId: testStation._id, chargerId: testChargerId },
          powerKW: 60.1,
          voltage: 230.9,
          currentA: 260.4,
          temperatureC: 43.8,
          socPct: 64,
          chargerStatus: 'charging',
        },
      ];

      const insertResult = await TelemetryRepository.insertMany(testReadings);
      assert.equal(insertResult.insertedCount, 2);

      const recent = await TelemetryRepository.getRecentForCharger(
        testStation._id,
        testChargerId,
        5
      );
      assert.ok(recent.length >= 2);
      assert.equal(recent[0].meta.chargerId, testChargerId);
    });

    it('Executes simulator cycle and produces valid telemetry across network', async () => {
      const result = await runSimulationCycle(db, 0); // 0 fault probability for clean run
      assert.ok(result.readingsCount > 0, 'Simulation cycle should ingest readings');
      assert.equal(result.anomaliesCount, 0);
    });
  });

  describe('Server-Sent Events (SSE) & Audit Log Trail API', () => {
    it('SSE stream endpoint returns text/event-stream headers and handshake', async () => {
      const server = http.createServer(app);
      await new Promise(resolve => server.listen(0, resolve));
      const port = server.address().port;

      const handshakeReceived = await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/api/realtime/events`, res => {
          assert.equal(res.statusCode, 200);
          assert.ok(res.headers['content-type'].includes('text/event-stream'));
          let buffer = '';
          res.on('data', chunk => {
            buffer += chunk.toString();
            if (buffer.includes('event: handshake')) {
              req.destroy();
              server.close(() => resolve(true));
            }
          });
        });
        req.on('error', err => {
          if (err.code !== 'ECONNRESET') reject(err);
        });
      });

      assert.equal(handshakeReceived, true);
    });

    it('Driver cannot access audit logs (RBAC 403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/users/audit-logs')
        .set('Authorization', `Bearer ${driverToken}`);
      assert.equal(res.status, 403);
    });

    it('Admin successfully accesses audit logs trail', async () => {
      const res = await request(app)
        .get('/api/users/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.pagination.total >= 1);
    });
  });
});
