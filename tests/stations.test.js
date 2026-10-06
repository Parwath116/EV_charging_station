import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { connectDB, closeDB, getDB } from '../server/config/db.js';
import { ObjectId } from 'mongodb';

describe('Phase 4: Station Management & Geospatial Discovery Integration Tests', () => {
  const app = createApp();
  let adminToken = '';
  let operatorToken = '';
  let driverToken = '';
  let testStationId = '';
  const testChargerId = 'CHG-TEST-999';

  before(async () => {
    await connectDB();

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
  });

  after(async () => {
    // Clean up test stations if any left
    const db = getDB();
    if (testStationId) {
      await db.collection('stations').deleteOne({ _id: new ObjectId(testStationId) });
    }
    await db.collection('stations').deleteMany({ name: { $regex: /Test/i } });
    await closeDB();
  });

  describe('Station Listing & Filtering', () => {
    it('GET /api/stations returns paginated station list with meta', async () => {
      const res = await request(app).get('/api/stations?page=1&limit=5');
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length <= 5);
      assert.ok(res.body.pagination.total > 0);
    });

    it('GET /api/stations filters by area', async () => {
      const res = await request(app).get('/api/stations?area=Indiranagar');
      assert.equal(res.status, 200);
      for (const st of res.body.data) {
        assert.equal(st.area, 'Indiranagar');
      }
    });

    it('GET /api/stations filters by connector type', async () => {
      const res = await request(app).get('/api/stations?connector=CCS2');
      assert.equal(res.status, 200);
      for (const st of res.body.data) {
        assert.ok(st.chargers.some(c => c.connector === 'CCS2'));
      }
    });

    it('GET /api/stations text search matches name or address', async () => {
      const res = await request(app).get('/api/stations?q=Indiranagar');
      assert.equal(res.status, 200);
      assert.ok(res.body.data.length > 0);
    });
  });

  describe('Geospatial Queries ($geoNear & $geoWithin)', () => {
    it('GET /api/stations/nearest returns stations sorted by distance ($geoNear)', async () => {
      // MG Road coordinates: 77.5946, 12.9716
      const res = await request(app).get(
        '/api/stations/nearest?lng=77.5946&lat=12.9716&maxDistance=10000&limit=5'
      );
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length > 0);

      // Verify distance is populated and ascending
      for (let i = 0; i < res.body.data.length - 1; i++) {
        assert.ok(res.body.data[i].distanceMeters !== undefined);
        assert.ok(res.body.data[i].distanceMeters <= res.body.data[i + 1].distanceMeters);
      }
    });

    it('GET /api/stations/within-circle finds stations in specified radius ($geoWithin $centerSphere)', async () => {
      const res = await request(app).get(
        '/api/stations/within-circle?lng=77.5946&lat=12.9716&radiusKm=5'
      );
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
    });

    it('POST /api/stations/within-polygon finds stations inside polygon boundary ($geoWithin $geometry)', async () => {
      // Small polygon around central Bengaluru
      const polygon = [
        [
          [77.58, 12.96],
          [77.62, 12.96],
          [77.62, 12.99],
          [77.58, 12.99],
          [77.58, 12.96],
        ],
      ];

      const res = await request(app)
        .post('/api/stations/within-polygon')
        .send({ coordinates: polygon });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
    });
  });

  describe('Station Creation & Validation (RBAC & Geo Bounding Box)', () => {
    it('Driver cannot create a station (RBAC 403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/stations')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          name: 'Unauthorized Station',
          address: 'Test Rd',
          area: 'Indiranagar',
          location: { type: 'Point', coordinates: [77.6, 12.97] },
          status: 'active',
          tariffPerKWh: 15,
          chargers: [
            { chargerId: testChargerId, connector: 'CCS2', powerKW: 60, status: 'available' },
          ],
        });
      assert.equal(res.status, 403);
    });

    it('Operator creates a new station within Bengaluru bounds (201 Created)', async () => {
      const res = await request(app)
        .post('/api/stations')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          name: 'VoltGrid Test Superhub',
          operator: 'VoltGrid Metropolitan Operations',
          address: '100 Feet Road, Indiranagar',
          area: 'Indiranagar',
          location: { type: 'Point', coordinates: [77.6385, 12.9719] },
          status: 'active',
          tariffPerKWh: 16.5,
          amenities: ['wifi', 'cafe', 'restrooms'],
          chargers: [
            {
              chargerId: testChargerId,
              connector: 'CCS2',
              powerKW: 120,
              status: 'available',
            },
          ],
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.name, 'VoltGrid Test Superhub');
      testStationId = res.body.data._id;
    });

    it('Rejects station creation outside Bengaluru bounds', async () => {
      const res = await request(app)
        .post('/api/stations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Out of Bounds Station',
          operator: 'VoltGrid Metropolitan Operations',
          address: 'Delhi Bypass',
          area: 'Indiranagar',
          location: { type: 'Point', coordinates: [72.8777, 19.076] }, // Mumbai coords
          status: 'active',
          tariffPerKWh: 15,
          chargers: [
            { chargerId: 'CHG-OOB-1', connector: 'CCS2', powerKW: 50, status: 'available' },
          ],
        });

      assert.equal(res.status, 400);
      assert.ok(JSON.stringify(res.body).includes('bounds'));
    });
  });

  describe('Station Updates & Lifecycle Management', () => {
    it('PATCH /api/stations/:id/tariff updates tariff', async () => {
      const res = await request(app)
        .patch(`/api/stations/${testStationId}/tariff`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ tariffPerKWh: 18.25 });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.tariffPerKWh, 18.25);
    });

    it('PATCH /api/stations/:id/status updates status to maintenance', async () => {
      const res = await request(app)
        .patch(`/api/stations/${testStationId}/status`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ status: 'maintenance' });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'maintenance');
    });

    it('PATCH /api/stations/:id/decommission soft-deletes the station', async () => {
      const res = await request(app)
        .patch(`/api/stations/${testStationId}/decommission`)
        .set('Authorization', `Bearer ${operatorToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'decommissioned');
    });
  });

  describe('Transactional Hard Delete & Cascade Guard', () => {
    it('Blocks hard delete if active bookings exist on the station', async () => {
      const db = getDB();
      // Insert an active reservation on test station
      await db.collection('bookings').insertOne({
        stationId: new ObjectId(testStationId),
        chargerId: testChargerId,
        userId: new ObjectId(),
        status: 'confirmed',
        startTime: new Date(),
        endTime: new Date(Date.now() + 3600000),
        createdAt: new Date(),
      });

      const res = await request(app)
        .delete(`/api/stations/${testStationId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 400);
      assert.ok(JSON.stringify(res.body).includes('reservation'));

      // Remove the test booking
      await db.collection('bookings').deleteMany({ stationId: new ObjectId(testStationId) });
    });

    it('Admin successfully hard-deletes station with cascading cleanup when no active reservations exist', async () => {
      const res = await request(app)
        .delete(`/api/stations/${testStationId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      // Verify deletion from database
      const db = getDB();
      const check = await db.collection('stations').findOne({ _id: new ObjectId(testStationId) });
      assert.equal(check, null);
      testStationId = '';
    });
  });

  describe('CSV Bulk Import', () => {
    it('Admin imports valid stations via CSV', async () => {
      const csvData = [
        'name,address,area,lng,lat,tariffPerKWh,connectors',
        'Bulk Hub Alpha,Outer Ring Rd,Bellandur,77.6750,12.9260,15.5,CCS2|Type2',
        'Bulk Hub Beta,Whitefield Main Rd,Whitefield,77.7490,12.9698,16.0,CCS2|CHAdeMO',
      ].join('\n');

      const res = await request(app)
        .post('/api/stations/bulk-import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ csv: csvData });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.importedCount, 2);

      // Clean up bulk stations
      const db = getDB();
      await db
        .collection('stations')
        .deleteMany({ name: { $in: ['Bulk Hub Alpha', 'Bulk Hub Beta'] } });
    });

    it('Rejects bulk import with coordinates outside Bengaluru bounds', async () => {
      const invalidCsv = [
        'name,address,area,lng,lat,tariffPerKWh,connectors',
        'Invalid OutOfBounds,Some Road,Unknown,80.2707,13.0827,15.0,CCS2', // Chennai coords
      ].join('\n');

      const res = await request(app)
        .post('/api/stations/bulk-import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ csv: invalidCsv });

      assert.equal(res.status, 400);
      assert.ok(JSON.stringify(res.body).includes('bounds'));
    });
  });
});
