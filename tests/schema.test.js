import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoServerError } from 'mongodb';
import { connectDB, getDB, closeDB } from '../server/config/db.js';

describe('Phase 1: MongoDB Schema Validation & Index Enforcement', () => {
  let db;

  before(async () => {
    await connectDB();
    db = getDB();
  });

  after(async () => {
    await closeDB();
  });

  // 1. Bengaluru Geospatial Bounding Box Validation
  describe('Geospatial Bounding Box ($jsonSchema)', () => {
    test('REJECTS station document with coordinates outside Bengaluru metropolitan bounds', async () => {
      const invalidStation = {
        name: 'VoltGrid Out-Of-Bounds Test Station',
        operator: 'External Transit Ltd',
        address: 'Marine Drive, Mumbai 400020',
        area: 'Mumbai External',
        // Mumbai coordinates: [72.8777, 19.0760] -> outside [77.40, 77.85] / [12.75, 13.20]
        location: {
          type: 'Point',
          coordinates: [72.8777, 19.076],
        },
        amenities: ['WiFi'],
        tariffPerKWh: 18.0,
        openHours: '24/7',
        status: 'active',
        chargers: [
          { chargerId: 'CHG-OOB-01', connector: 'CCS2', powerKW: 60, status: 'available' },
        ],
        createdAt: new Date(),
      };

      await assert.rejects(
        async () => {
          await db.collection('stations').insertOne(invalidStation);
        },
        err => {
          assert.ok(err instanceof MongoServerError);
          assert.strictEqual(err.code, 121, 'Expected Error 121 (Document failed validation)');
          return true;
        }
      );
    });

    test('REJECTS station whose coordinates are strings instead of numbers', async () => {
      const stringCoordsStation = {
        name: 'VoltGrid String Coordinates Test Hub',
        operator: 'VoltGrid Bengaluru Distribution',
        address: '100 Feet Road, Indiranagar, Bengaluru 560038',
        area: 'Indiranagar',
        location: {
          type: 'Point',
          coordinates: ['77.6412', '12.9719'], // Strings instead of numbers
        },
        amenities: ['WiFi'],
        tariffPerKWh: 18.0,
        openHours: '24/7',
        status: 'active',
        chargers: [
          { chargerId: 'CHG-STR-01', connector: 'CCS2', powerKW: 120, status: 'available' },
        ],
        createdAt: new Date(),
      };

      await assert.rejects(
        async () => {
          await db.collection('stations').insertOne(stringCoordsStation);
        },
        err => {
          assert.ok(err instanceof MongoServerError);
          assert.strictEqual(err.code, 121, 'Expected Error 121 for string coordinates');
          return true;
        }
      );
    });

    test('REJECTS duplicate chargerId across stations via multikey unique index (E11000)', async () => {
      const duplicateChargerId = 'CHG-UNIQUE-TEST-01';

      const stationA = {
        name: 'Station With Charger Alpha',
        operator: 'VoltGrid Test Operator',
        address: 'MG Road, Bengaluru 560001',
        area: 'Indiranagar',
        location: { type: 'Point', coordinates: [77.61, 12.97] },
        amenities: ['WiFi'],
        tariffPerKWh: 18.0,
        openHours: '24/7',
        status: 'active',
        chargers: [
          { chargerId: duplicateChargerId, connector: 'CCS2', powerKW: 60, status: 'available' },
        ],
        createdAt: new Date(),
      };

      const resultA = await db.collection('stations').insertOne(stationA);
      assert.ok(resultA.insertedId);

      const stationB = {
        name: 'Station With Duplicate Charger Beta',
        operator: 'VoltGrid Test Operator',
        address: 'Brigade Road, Bengaluru 560025',
        area: 'Indiranagar',
        location: { type: 'Point', coordinates: [77.6, 12.97] },
        amenities: ['WiFi'],
        tariffPerKWh: 18.0,
        openHours: '24/7',
        status: 'active',
        chargers: [
          { chargerId: duplicateChargerId, connector: 'Type2', powerKW: 22, status: 'available' },
        ],
        createdAt: new Date(),
      };

      await assert.rejects(
        async () => {
          await db.collection('stations').insertOne(stationB);
        },
        err => {
          assert.ok(err instanceof MongoServerError);
          assert.strictEqual(err.code, 11000, 'Expected Error 11000 for duplicate chargerId');
          return true;
        }
      );

      // Clean up station A
      await db.collection('stations').deleteOne({ _id: resultA.insertedId });
    });

    test('ACCEPTS station document with valid coordinates inside Bengaluru metropolitan bounds', async () => {
      const validStation = {
        name: 'VoltGrid Valid Boundary Test Hub',
        operator: 'VoltGrid Bengaluru Distribution',
        address: '100 Feet Road, Indiranagar, Bengaluru 560038',
        area: 'Indiranagar',
        // Valid Bengaluru coordinates
        location: {
          type: 'Point',
          coordinates: [77.6412, 12.9719],
        },
        amenities: ['WiFi', 'Restrooms'],
        tariffPerKWh: 18.0,
        openHours: '24/7',
        status: 'active',
        chargers: [
          { chargerId: 'CHG-VALID-01', connector: 'CCS2', powerKW: 120, status: 'available' },
        ],
        createdAt: new Date(),
      };

      const result = await db.collection('stations').insertOne(validStation);
      assert.ok(result.insertedId);

      // Clean up test document
      await db.collection('stations').deleteOne({ _id: result.insertedId });
    });
  });

  // 2. User Collection Constraints
  describe('User Schema Validation & Unique Indexes', () => {
    test('REJECTS user with negative wallet balance', async () => {
      const invalidUser = {
        name: 'Invalid Balance User',
        email: 'invalid.balance@voltgrid.internal',
        passwordHash: 'dummyhash',
        role: 'driver',
        walletBalance: -500, // Invalid: minimum is 0
        vehicles: [],
        createdAt: new Date(),
      };

      await assert.rejects(
        async () => {
          await db.collection('users').insertOne(invalidUser);
        },
        err => {
          assert.ok(err instanceof MongoServerError);
          assert.strictEqual(err.code, 121);
          return true;
        }
      );
    });

    test('REJECTS user with unauthorized role enumeration', async () => {
      const invalidRoleUser = {
        name: 'Unauthorized Role User',
        email: 'invalid.role@voltgrid.internal',
        passwordHash: 'dummyhash',
        role: 'superuser', // Invalid: allowed ['admin', 'operator', 'driver']
        walletBalance: 100,
        vehicles: [],
        createdAt: new Date(),
      };

      await assert.rejects(
        async () => {
          await db.collection('users').insertOne(invalidRoleUser);
        },
        err => {
          assert.ok(err instanceof MongoServerError);
          assert.strictEqual(err.code, 121);
          return true;
        }
      );
    });

    test('REJECTS duplicate email via unique index (E11000)', async () => {
      const uniqueEmail = `test.unique.${Date.now()}@voltgrid.internal`;
      const userA = {
        name: 'User Unique A',
        email: uniqueEmail,
        passwordHash: 'hashA',
        role: 'driver',
        walletBalance: 250,
        vehicles: [],
        createdAt: new Date(),
      };

      const insertResult = await db.collection('users').insertOne(userA);
      assert.ok(insertResult.insertedId);

      // Attempt duplicate insert
      const userB = {
        name: 'User Unique B',
        email: uniqueEmail,
        passwordHash: 'hashB',
        role: 'driver',
        walletBalance: 300,
        vehicles: [],
        createdAt: new Date(),
      };

      await assert.rejects(
        async () => {
          await db.collection('users').insertOne(userB);
        },
        err => {
          assert.ok(err instanceof MongoServerError);
          assert.strictEqual(err.code, 11000, 'Expected Error 11000 (Duplicate key error)');
          return true;
        }
      );

      // Clean up
      await db.collection('users').deleteOne({ _id: insertResult.insertedId });
    });
  });

  // 3. Time-Series Collection Telemetry Verification
  describe('Time-Series Collection (telemetry)', () => {
    test('Verifies telemetry collection is configured as a time-series collection', async () => {
      const collections = await db.listCollections({ name: 'telemetry' }).toArray();
      assert.strictEqual(collections.length, 1);
      assert.strictEqual(collections[0].type, 'timeseries');
      assert.strictEqual(collections[0].options.timeseries.timeField, 'ts');
      assert.strictEqual(collections[0].options.timeseries.metaField, 'meta');
    });

    test('Performs aggregate query on time-series telemetry collection', async () => {
      const sampleStation = await db.collection('stations').findOne();
      assert.ok(sampleStation);

      const recentTelemetry = await db
        .collection('telemetry')
        .find({ 'meta.stationId': sampleStation._id })
        .limit(10)
        .toArray();

      assert.ok(Array.isArray(recentTelemetry));
      if (recentTelemetry.length > 0) {
        assert.ok(recentTelemetry[0].ts instanceof Date);
        assert.strictEqual(typeof recentTelemetry[0].voltage, 'number');
      }
    });
  });

  // 4. Seed Data Quantity & Integrity Validation
  describe('Seed Data Verification', () => {
    test('Confirms seeded counts match production requirements', async () => {
      const [stationCount, userCount, bookingCount, sessionCount, telemetryCount] =
        await Promise.all([
          db.collection('stations').countDocuments(),
          db.collection('users').countDocuments(),
          db.collection('bookings').countDocuments(),
          db.collection('sessions').countDocuments(),
          db.collection('telemetry').countDocuments(),
        ]);

      assert.ok(stationCount >= 15, `Expected >= 15 stations, got ${stationCount}`);
      assert.ok(userCount >= 60, `Expected >= 60 users, got ${userCount}`);
      assert.ok(bookingCount >= 500, `Expected >= 500 bookings, got ${bookingCount}`);
      assert.ok(sessionCount >= 2000, `Expected >= 2000 sessions, got ${sessionCount}`);
      assert.ok(telemetryCount >= 2000, `Expected >= 2000 telemetry points, got ${telemetryCount}`);
    });

    test('Verifies ZERO booking slot overlaps on the same charger across all seeded bookings', async () => {
      const allBookings = await db
        .collection('bookings')
        .find({}, { projection: { chargerId: 1, startTime: 1, endTime: 1, status: 1 } })
        .toArray();

      assert.ok(allBookings.length > 500);

      // Group by chargerId
      const chargerMap = new Map();
      for (const b of allBookings) {
        if (!chargerMap.has(b.chargerId)) {
          chargerMap.set(b.chargerId, []);
        }
        chargerMap.get(b.chargerId).push(b);
      }

      // Assert no overlap
      let totalOverlaps = 0;
      for (const [chargerId, bookings] of chargerMap.entries()) {
        bookings.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        for (let i = 0; i < bookings.length - 1; i++) {
          const current = bookings[i];
          const next = bookings[i + 1];
          if (current.endTime.getTime() > next.startTime.getTime()) {
            totalOverlaps++;
            assert.fail(
              `Slot collision on charger ${chargerId}: [${current.startTime.toISOString()} - ${current.endTime.toISOString()}] overlaps [${next.startTime.toISOString()} - ${next.endTime.toISOString()}]`
            );
          }
        }
      }

      assert.strictEqual(totalOverlaps, 0, 'Found booking overlaps on the same charger');
    });
  });
});
