import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { connectDB, closeDB, getDB } from '../server/config/db.js';
import { userRepository } from '../server/repositories/user.repository.js';
import { ObjectId } from 'mongodb';

describe('Phase 5: Chargers, Bookings, Sessions & User Fleet Integration Tests', () => {
  const app = createApp();
  let adminToken = '';
  let operatorToken = '';
  let driverToken = '';
  let driverUser = null;
  let testStationId = '';
  const testChargerId = 'CHG-PH5-TEST-1';
  let createdBookingId = '';
  let createdSessionId = '';

  before(async () => {
    await connectDB();
    const db = getDB();

    // 1. Authenticate admin
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@voltgrid.internal', password: 'VoltGrid#2026' });
    adminToken = adminRes.body.data.token;

    // 2. Authenticate operator
    const operatorRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'operator.whitefield@voltgrid.internal', password: 'VoltGrid#2026' });
    operatorToken = operatorRes.body.data.token;

    // 3. Authenticate driver
    const driverRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'driver.aarav.mehta.1@voltgrid.internal', password: 'VoltGrid#2026' });
    driverToken = driverRes.body.data.token;
    driverUser = driverRes.body.data;

    // 4. Ensure a dedicated test station exists
    const stationDoc = {
      name: 'Phase 5 Test Charging Hub',
      operator: 'VoltGrid Fleet Testing',
      address: '12 Ring Road, Koramangala',
      area: 'Koramangala',
      location: { type: 'Point', coordinates: [77.6245, 12.9352] },
      amenities: ['wifi', 'restrooms'],
      tariffPerKWh: 18.0,
      openHours: '24/7',
      status: 'active',
      chargers: [
        { chargerId: testChargerId, connector: 'CCS2', powerKW: 120, status: 'available' },
      ],
      createdAt: new Date(),
    };
    const insertRes = await db.collection('stations').insertOne(stationDoc);
    testStationId = insertRes.insertedId.toString();

    // Ensure driver wallet has ample funds for testing
    await db
      .collection('users')
      .updateOne({ _id: new ObjectId(driverUser._id) }, { $set: { walletBalance: 2500 } });
  });

  after(async () => {
    const db = getDB();
    if (testStationId) {
      await db.collection('stations').deleteOne({ _id: new ObjectId(testStationId) });
      await db.collection('bookings').deleteMany({ stationId: new ObjectId(testStationId) });
      await db.collection('sessions').deleteMany({ stationId: new ObjectId(testStationId) });
    }
    await closeDB();
  });

  describe('Charger Embedded Array Operations ($push, $pull, arrayFilters, bulkWrite)', () => {
    const secondaryChargerId = 'CHG-PH5-TEST-2';

    it('POST /api/stations/:id/chargers appends a new charger via $push', async () => {
      const res = await request(app)
        .post(`/api/stations/${testStationId}/chargers`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          chargerId: secondaryChargerId,
          connector: 'Type2',
          powerKW: 22,
          status: 'available',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      const station = res.body.data;
      assert.ok(station.chargers.some(c => c.chargerId === secondaryChargerId));
    });

    it('PATCH /api/stations/:id/chargers/:chargerId updates charger via arrayFilters', async () => {
      const res = await request(app)
        .patch(`/api/stations/${testStationId}/chargers/${secondaryChargerId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ status: 'maintenance' });

      assert.equal(res.status, 200);
      const station = res.body.data;
      const chg = station.chargers.find(c => c.chargerId === secondaryChargerId);
      assert.equal(chg.status, 'maintenance');
    });

    it('POST /api/stations/:id/chargers/bulk-sync synchronizes chargers via bulkWrite', async () => {
      const res = await request(app)
        .post(`/api/stations/${testStationId}/chargers/bulk-sync`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          updates: [
            { chargerId: testChargerId, status: 'available' },
            { chargerId: secondaryChargerId, status: 'available' },
          ],
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.modifiedCount >= 1, true);
    });

    it('DELETE /api/stations/:id/chargers/:chargerId removes charger via $pull', async () => {
      const res = await request(app)
        .delete(`/api/stations/${testStationId}/chargers/${secondaryChargerId}`)
        .set('Authorization', `Bearer ${operatorToken}`);

      assert.equal(res.status, 200);
      const station = res.body.data;
      assert.equal(
        station.chargers.some(c => c.chargerId === secondaryChargerId),
        false
      );
    });
  });

  describe('Slot Bookings & ACID Concurrency Conflict Guard', () => {
    it('GET /api/bookings/estimate calculates required energy and cost', async () => {
      const res = await request(app).get(
        `/api/bookings/estimate?stationId=${testStationId}&batteryKWh=50&currentSoc=20&targetSoc=80&chargerPowerKW=120`
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.energyNeededKWh, 30); // 60% of 50kWh = 30kWh
      assert.equal(res.body.data.estimatedCost, 540); // 30kWh * 18/kWh = 540
      assert.equal(res.body.data.durationMinutes, 15); // 30kWh / 120kW * 60 = 15 mins
    });

    it('POST /api/bookings creates reservation inside ACID transaction', async () => {
      const start = new Date(Date.now() + 7200000).toISOString(); // +2 hours
      const end = new Date(Date.now() + 10800000).toISOString(); // +3 hours

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          stationId: testStationId,
          chargerId: testChargerId,
          startTime: start,
          endTime: end,
          estimatedCost: 540,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'confirmed');
      createdBookingId = res.body.data._id;
    });

    it('POST /api/bookings REJECTS overlapping slot reservation with 409 Conflict', async () => {
      // Overlapping window (+2.5 hours to +3.5 hours)
      const overlapStart = new Date(Date.now() + 9000000).toISOString();
      const overlapEnd = new Date(Date.now() + 12600000).toISOString();

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          stationId: testStationId,
          chargerId: testChargerId,
          startTime: overlapStart,
          endTime: overlapEnd,
          estimatedCost: 540,
        });

      assert.equal(res.status, 409);
      assert.equal(res.body.success, false);
      assert.ok(JSON.stringify(res.body).includes('reserved'));
    });

    it('PATCH /api/bookings/:id/reschedule updates slot window inside transaction', async () => {
      // Shift to +4 hours to +5 hours
      const newStart = new Date(Date.now() + 14400000).toISOString();
      const newEnd = new Date(Date.now() + 18000000).toISOString();

      const res = await request(app)
        .patch(`/api/bookings/${createdBookingId}/reschedule`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          startTime: newStart,
          endTime: newEnd,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    });

    it('GET /api/bookings returns populated bookings via $lookup', async () => {
      const res = await request(app)
        .get('/api/bookings')
        .set('Authorization', `Bearer ${driverToken}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      const target = res.body.data.find(b => b._id.toString() === createdBookingId.toString());
      assert.ok(target);
      assert.equal(target.stationName, 'Phase 5 Test Charging Hub');
    });

    it('PATCH /api/bookings/:id/cancel cancels reservation via findOneAndUpdate', async () => {
      const res = await request(app)
        .patch(`/api/bookings/${createdBookingId}/cancel`)
        .set('Authorization', `Bearer ${driverToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'cancelled');
    });
  });

  describe('Live Charging Sessions & Transactional Wallet Debit ($inc)', () => {
    it('POST /api/sessions/start starts charging session and sets charger to charging', async () => {
      const res = await request(app)
        .post('/api/sessions/start')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          stationId: testStationId,
          chargerId: testChargerId,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.paymentStatus, 'pending');
      createdSessionId = res.body.data._id;

      // Verify charger status transitioned to charging
      const db = getDB();
      const station = await db.collection('stations').findOne({ _id: new ObjectId(testStationId) });
      const chg = station.chargers.find(c => c.chargerId === testChargerId);
      assert.equal(chg.status, 'charging');
    });

    it('GET /api/sessions/active returns the current ongoing session', async () => {
      const res = await request(app)
        .get('/api/sessions/active')
        .set('Authorization', `Bearer ${driverToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data._id.toString(), createdSessionId.toString());
    });

    it('POST /api/sessions/telemetry records telemetry measurement', async () => {
      const res = await request(app)
        .post('/api/sessions/telemetry')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          stationId: testStationId,
          chargerId: testChargerId,
          sessionId: createdSessionId,
          powerKW: 118.5,
          voltage: 412,
          currentA: 287,
          socPercent: 54,
          temperatureC: 38,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
    });

    it('POST /api/sessions/:id/stop debits wallet via $inc, resets charger, and completes session', async () => {
      // Driver starting wallet balance
      const db = getDB();
      const userBefore = await db
        .collection('users')
        .findOne({ _id: new ObjectId(driverUser._id) });
      const balanceBefore = userBefore.walletBalance;

      const deliveredKWh = 20.0;
      const expectedCost = deliveredKWh * 18.0; // 360 INR

      const res = await request(app)
        .post(`/api/sessions/${createdSessionId}/stop`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ finalEnergyKWh: deliveredKWh });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.cost, expectedCost);
      assert.equal(res.body.data.paymentStatus, 'paid');

      // Verify wallet was atomically debited by $inc
      const userAfter = await db.collection('users').findOne({ _id: new ObjectId(driverUser._id) });
      assert.equal(userAfter.walletBalance, balanceBefore - expectedCost);

      // Verify charger was returned to available
      const station = await db.collection('stations').findOne({ _id: new ObjectId(testStationId) });
      const chg = station.chargers.find(c => c.chargerId === testChargerId);
      assert.equal(chg.status, 'available');
    });
  });

  describe('User Fleet, Favourites & Explicit Operators ($addToSet, $pull, $inc, $unset, upsert, $rename)', () => {
    it('POST /api/users/vehicles appends vehicle to array via $push', async () => {
      const res = await request(app)
        .post('/api/users/vehicles')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          make: 'MG',
          model: 'Comet EV Urban Edition',
          connectorType: 'Type2',
          batteryKWh: 17.3,
        });

      assert.equal(res.status, 200);
      assert.ok(res.body.data.some(v => v.model === 'Comet EV Urban Edition'));
    });

    it('DELETE /api/users/vehicles/:model removes vehicle via $pull', async () => {
      const res = await request(app)
        .delete('/api/users/vehicles/Comet%20EV%20Urban%20Edition')
        .set('Authorization', `Bearer ${driverToken}`);

      assert.equal(res.status, 200);
      assert.equal(
        res.body.data.some(v => v.model === 'Comet EV Urban Edition'),
        false
      );
    });

    it('POST /api/users/wallet/topup atomics increases wallet balance via $inc', async () => {
      const db = getDB();
      const userBefore = await db
        .collection('users')
        .findOne({ _id: new ObjectId(driverUser._id) });

      const res = await request(app)
        .post('/api/users/wallet/topup')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ amount: 1000 });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.walletBalance, userBefore.walletBalance + 1000);
    });

    it('POST /api/users/favourites/:stationId adds favourite idempotently via $addToSet', async () => {
      const res = await request(app)
        .post(`/api/users/favourites/${testStationId}`)
        .set('Authorization', `Bearer ${driverToken}`);

      assert.equal(res.status, 200);

      // Duplicate add must remain idempotent via $addToSet
      await request(app)
        .post(`/api/users/favourites/${testStationId}`)
        .set('Authorization', `Bearer ${driverToken}`);

      const user = await userRepository.findById(driverUser._id);
      const occurrences = (user.favouriteStations || []).filter(
        id => id.toString() === testStationId.toString()
      ).length;
      assert.equal(occurrences, 1);
    });

    it('DELETE /api/users/favourites/:stationId removes favourite via $pull', async () => {
      const res = await request(app)
        .delete(`/api/users/favourites/${testStationId}`)
        .set('Authorization', `Bearer ${driverToken}`);

      assert.equal(res.status, 200);
      const user = await userRepository.findById(driverUser._id);
      assert.equal(
        (user.favouriteStations || []).some(id => id.toString() === testStationId),
        false
      );
    });

    it('Demonstrates explicit $unset, upsert, and $rename via repository operations', async () => {
      const db = getDB();

      // 1. Explicit $unset on whitelisted field
      await db
        .collection('users')
        .updateOne({ _id: new ObjectId(driverUser._id) }, { $set: { tempNote: 'VOLT-XYZ-123' } });
      await userRepository.unsetField(driverUser._id, 'tempNote');
      const userAfterUnset = await db
        .collection('users')
        .findOne({ _id: new ObjectId(driverUser._id) });
      assert.equal(userAfterUnset.tempNote, undefined);

      // 2. Explicit upsert: true
      const upsertResult = await userRepository.upsertUserSettings(driverUser._id, {
        notificationSms: true,
        autoBilling: false,
      });
      assert.ok(upsertResult.upsertedCount === 1 || upsertResult.matchedCount === 1);

      // 3. Explicit $rename on whitelisted fields
      await db
        .collection('users')
        .updateOne({ _id: new ObjectId(driverUser._id) }, { $set: { tempNote: 'Legacy notes' } });
      await userRepository.renameField('tempNote', 'archiveNote');
      const userAfterRename = await db
        .collection('users')
        .findOne({ _id: new ObjectId(driverUser._id) });
      assert.equal(userAfterRename.tempNote, undefined);
      assert.equal(userAfterRename.archiveNote, 'Legacy notes');

      // Clean up test field
      await db
        .collection('users')
        .updateOne({ _id: new ObjectId(driverUser._id) }, { $unset: { archiveNote: '' } });
    });

    it('GET /api/users lists users for admin governance', async () => {
      const res = await request(app)
        .get('/api/users?limit=5')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
    });

    // --- PRE-PHASE 6 MANDATORY VERIFICATION TESTS ---

    it('Prevents write skew: 10 parallel booking requests for identical slot produce exactly 1 success (201) and 9 conflicts (409)', async () => {
      const startTime = new Date(Date.now() + 72 * 3600000).toISOString();
      const endTime = new Date(Date.now() + 73 * 3600000).toISOString();

      const parallelRequests = Array.from({ length: 10 }, () =>
        request(app).post('/api/bookings').set('Authorization', `Bearer ${driverToken}`).send({
          stationId: testStationId,
          chargerId: testChargerId,
          startTime,
          endTime,
        })
      );

      const responses = await Promise.all(parallelRequests);
      const statusCodes = responses.map(r => r.status);
      const successes = statusCodes.filter(s => s === 201);
      const conflicts = statusCodes.filter(s => s === 409);

      assert.equal(
        successes.length,
        1,
        `Expected exactly 1 success (201), got ${successes.length}`
      );
      assert.equal(
        conflicts.length,
        9,
        `Expected exactly 9 conflicts (409), got ${conflicts.length}`
      );
    });

    it('Wallet safety: stopSession closes session, sets paymentStatus "due", amountDue, never drops wallet below 0, and resets charger to available', async () => {
      const db = getDB();

      // Create dedicated charger for isolated session test
      const safetyChargerId = 'CHG-WALLET-SAFE-1';
      await db.collection('stations').updateOne(
        { _id: new ObjectId(testStationId) },
        {
          $push: {
            chargers: {
              chargerId: safetyChargerId,
              connector: 'CCS2',
              powerKW: 60,
              status: 'available',
            },
          },
        }
      );

      // Set driver wallet to minimum balance (50.00 INR)
      await db
        .collection('users')
        .updateOne({ _id: new ObjectId(driverUser._id) }, { $set: { walletBalance: 50.0 } });

      // Start session
      const startRes = await request(app)
        .post('/api/sessions/start')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          stationId: testStationId,
          chargerId: safetyChargerId,
          connector: 'CCS2',
        });
      assert.equal(startRes.status, 201);
      const sessId = startRes.body.data._id;

      // Stop session with high energy (final energy = 20 kWh @ 18 INR/kWh = 360 INR, exceeds 50 INR balance)
      const stopRes = await request(app)
        .post(`/api/sessions/${sessId}/stop`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ finalEnergyKWh: 20 });

      assert.equal(stopRes.status, 200);
      assert.equal(stopRes.body.data.paymentStatus, 'due');
      assert.equal(stopRes.body.data.amountDue, 310); // 360 - 50 = 310 INR due
      assert.equal(stopRes.body.data.cost, 360);
      assert.ok(stopRes.body.data.endedAt);

      // Verify user wallet balance is 0 (never negative)
      const updatedUser = await db
        .collection('users')
        .findOne({ _id: new ObjectId(driverUser._id) });
      assert.equal(updatedUser.walletBalance, 0);

      // Verify charger returned to available
      const updatedStation = await db
        .collection('stations')
        .findOne({ _id: new ObjectId(testStationId) });
      const targetCharger = updatedStation.chargers.find(c => c.chargerId === safetyChargerId);
      assert.equal(targetCharger.status, 'available');
    });

    it('Field-name safety: rejects unsetting or renaming sensitive fields (role, passwordHash, walletBalance)', async () => {
      // 1. Repository guards for unset
      await assert.rejects(
        async () => await userRepository.unsetField(driverUser._id, 'role'),
        err => {
          assert.match(err.message, /cannot be unset/);
          return true;
        }
      );

      await assert.rejects(
        async () => await userRepository.unsetField(driverUser._id, 'passwordHash'),
        err => {
          assert.match(err.message, /cannot be unset/);
          return true;
        }
      );

      await assert.rejects(
        async () => await userRepository.unsetField(driverUser._id, 'walletBalance'),
        err => {
          assert.match(err.message, /cannot be unset/);
          return true;
        }
      );

      // 2. Repository guards for rename
      await assert.rejects(
        async () => await userRepository.renameField('role', 'userRole'),
        err => {
          assert.match(err.message, /forbidden/);
          return true;
        }
      );

      await assert.rejects(
        async () => await userRepository.renameField('passwordHash', 'pwd'),
        err => {
          assert.match(err.message, /forbidden/);
          return true;
        }
      );

      // 3. API endpoint tests
      const apiUnsetRes = await request(app)
        .post('/api/users/unset-field')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ id: driverUser._id, field: 'walletBalance' });
      assert.equal(apiUnsetRes.status, 400);

      const driverUnsetRes = await request(app)
        .post('/api/users/unset-field')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ id: driverUser._id, field: 'notes' });
      assert.equal(driverUnsetRes.status, 403);
    });

    it('Parameter tampering guard: driver cannot modify role, walletBalance, or verification fields via profile update', async () => {
      const db = getDB();
      const beforeUser = await db
        .collection('users')
        .findOne({ _id: new ObjectId(driverUser._id) });

      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          name: 'Verified Driver Name',
          role: 'admin',
          walletBalance: 999999,
          isEmailVerified: true,
          adminNotes: 'Injected Privileges',
        });

      assert.equal(res.status, 200);
      const afterUser = await db.collection('users').findOne({ _id: new ObjectId(driverUser._id) });
      assert.equal(afterUser.name, 'Verified Driver Name');
      assert.equal(afterUser.role, 'driver');
      assert.equal(afterUser.walletBalance, beforeUser.walletBalance);
      assert.equal(afterUser.isEmailVerified, undefined);
    });

    it('Audit Logging: operator and admin writes capture both before and after document states in audit_logs', async () => {
      const db = getDB();

      const tariffRes = await request(app)
        .patch(`/api/stations/${testStationId}/tariff`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ tariffPerKWh: 22.5 });
      assert.equal(tariffRes.status, 200);

      const auditEntry = await db.collection('audit_logs').findOne(
        {
          action: 'UPDATE_TARIFF',
          documentId: testStationId,
        },
        { sort: { timestamp: -1 } }
      );

      assert.ok(auditEntry);
      assert.ok(auditEntry.before);
      assert.ok(auditEntry.after);
      assert.equal(auditEntry.after.tariffPerKWh, 22.5);
      assert.ok(typeof auditEntry.before.tariffPerKWh === 'number');
    });

    it('CSRF Protection: rejects cross-site cookie authenticated state-changing requests', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'driver.aarav.mehta.1@voltgrid.internal', password: 'VoltGrid#2026' });

      const authCookie = loginRes.headers['set-cookie'];

      // Cross-site request without X-Requested-With or matching Origin
      const crossSiteRes = await request(app)
        .post('/api/users/wallet/topup')
        .set('Cookie', authCookie)
        .set('sec-fetch-site', 'cross-site')
        .send({ amount: 100 });

      assert.equal(crossSiteRes.status, 403);
      assert.equal(crossSiteRes.body.success, false);

      // Valid AJAX request with X-Requested-With
      const validAjaxRes = await request(app)
        .post('/api/users/wallet/topup')
        .set('Cookie', authCookie)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ amount: 100 });

      assert.equal(validAjaxRes.status, 200);
    });
  });
});
