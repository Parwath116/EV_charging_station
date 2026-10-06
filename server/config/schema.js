import { logger } from '../utils/logger.js';
import { BENGALURU_BOUNDS } from './constants.js';

export const collectionsSchema = {
  users: {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'name',
          'email',
          'passwordHash',
          'role',
          'walletBalance',
          'vehicles',
          'createdAt',
        ],
        properties: {
          name: {
            bsonType: 'string',
            minLength: 2,
            maxLength: 100,
            description: 'User full name',
          },
          email: {
            bsonType: 'string',
            pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
            description: 'Valid unique email address',
          },
          passwordHash: {
            bsonType: 'string',
            description: 'Bcrypt hashed password',
          },
          role: {
            enum: ['admin', 'operator', 'driver'],
            description: 'Platform access role',
          },
          walletBalance: {
            bsonType: ['double', 'int', 'decimal'],
            minimum: 0,
            description: 'Wallet balance in INR (non-negative)',
          },
          vehicles: {
            bsonType: 'array',
            items: {
              bsonType: 'object',
              required: ['make', 'model', 'connectorType', 'batteryKWh'],
              properties: {
                make: { bsonType: 'string' },
                model: { bsonType: 'string' },
                connectorType: { enum: ['CCS2', 'Type2', 'CHAdeMO', 'GB/T'] },
                batteryKWh: { bsonType: ['double', 'int'], minimum: 1 },
              },
            },
          },
          createdAt: { bsonType: 'date' },
          lastLoginAt: { bsonType: 'date' },
        },
      },
    },
    indexes: [
      { key: { email: 1 }, unique: true, name: 'idx_users_email_unique' },
      { key: { role: 1, createdAt: -1 }, name: 'idx_users_role_createdAt' },
    ],
  },

  stations: {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'name',
          'operator',
          'address',
          'area',
          'location',
          'amenities',
          'tariffPerKWh',
          'openHours',
          'status',
          'chargers',
          'createdAt',
        ],
        properties: {
          name: {
            bsonType: 'string',
            minLength: 3,
            maxLength: 150,
            description: 'Station name',
          },
          operator: {
            bsonType: 'string',
            description: 'Network operator organization name',
          },
          address: {
            bsonType: 'string',
            description: 'Physical address in Bengaluru',
          },
          area: {
            bsonType: 'string',
            description: 'Bengaluru zone or locality',
          },
          location: {
            bsonType: 'object',
            required: ['type', 'coordinates'],
            properties: {
              type: { enum: ['Point'] },
              coordinates: {
                bsonType: 'array',
                minItems: 2,
                maxItems: 2,
                items: [
                  {
                    bsonType: ['double', 'int'],
                    minimum: BENGALURU_BOUNDS.minLng,
                    maximum: BENGALURU_BOUNDS.maxLng,
                    description: `Bengaluru metropolitan longitude [${BENGALURU_BOUNDS.minLng}, ${BENGALURU_BOUNDS.maxLng}]`,
                  },
                  {
                    bsonType: ['double', 'int'],
                    minimum: BENGALURU_BOUNDS.minLat,
                    maximum: BENGALURU_BOUNDS.maxLat,
                    description: `Bengaluru metropolitan latitude [${BENGALURU_BOUNDS.minLat}, ${BENGALURU_BOUNDS.maxLat}]`,
                  },
                ],
              },
            },
          },
          amenities: {
            bsonType: 'array',
            items: { bsonType: 'string' },
          },
          tariffPerKWh: {
            bsonType: ['double', 'int'],
            minimum: 0,
            description: 'Electricity tariff per kWh in INR',
          },
          openHours: {
            bsonType: 'string',
            description: 'Operating schedule',
          },
          status: {
            enum: ['active', 'maintenance', 'decommissioned'],
            description: 'Station operational lifecycle status',
          },
          chargers: {
            bsonType: 'array',
            items: {
              bsonType: 'object',
              required: ['chargerId', 'connector', 'powerKW', 'status'],
              properties: {
                chargerId: { bsonType: 'string' },
                connector: { enum: ['CCS2', 'Type2', 'CHAdeMO', 'GB/T'] },
                powerKW: { bsonType: ['double', 'int'], minimum: 1 },
                status: {
                  enum: ['available', 'charging', 'reserved', 'faulted', 'offline', 'maintenance'],
                },
                bookingVersion: { bsonType: ['int', 'long', 'double'] },
              },
            },
          },
          createdAt: { bsonType: 'date' },
        },
      },
    },
    indexes: [
      { key: { location: '2dsphere' }, name: 'idx_stations_location_2dsphere' },
      {
        key: { name: 'text', address: 'text', area: 'text', amenities: 'text' },
        name: 'idx_stations_text_search',
      },
      { key: { area: 1, status: 1 }, name: 'idx_stations_area_status' },
      {
        key: { status: 1, tariffPerKWh: 1 },
        name: 'idx_stations_active_tariff_partial',
        partialFilterExpression: { status: 'active' },
      },
      {
        key: { 'chargers.chargerId': 1 },
        unique: true,
        name: 'idx_stations_chargers_chargerId_unique',
      },
    ],
  },

  bookings: {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'userId',
          'stationId',
          'chargerId',
          'startTime',
          'endTime',
          'status',
          'createdAt',
        ],
        properties: {
          userId: { bsonType: 'objectId' },
          stationId: { bsonType: 'objectId' },
          chargerId: { bsonType: 'string' },
          startTime: { bsonType: 'date' },
          endTime: { bsonType: 'date' },
          status: { enum: ['pending', 'confirmed', 'cancelled', 'completed'] },
          estimatedCost: { bsonType: ['double', 'int'] },
          createdAt: { bsonType: 'date' },
        },
      },
    },
    indexes: [
      {
        key: { stationId: 1, chargerId: 1, startTime: 1, endTime: 1 },
        name: 'idx_bookings_slot_conflict',
      },
      { key: { userId: 1, startTime: -1 }, name: 'idx_bookings_user_history' },
      {
        key: { status: 1, startTime: 1 },
        name: 'idx_bookings_active_slots_partial',
        partialFilterExpression: { status: { $in: ['pending', 'confirmed'] } },
      },
    ],
  },

  sessions: {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'userId',
          'stationId',
          'chargerId',
          'startedAt',
          'energyKWh',
          'cost',
          'paymentStatus',
        ],
        properties: {
          userId: { bsonType: 'objectId' },
          stationId: { bsonType: 'objectId' },
          chargerId: { bsonType: 'string' },
          startedAt: { bsonType: 'date' },
          endedAt: { bsonType: 'date' },
          energyKWh: { bsonType: ['double', 'int'], minimum: 0 },
          cost: { bsonType: ['double', 'int'], minimum: 0 },
          paymentStatus: { enum: ['pending', 'paid', 'due', 'failed'] },
          amountDue: { bsonType: ['double', 'int'], minimum: 0 },
          createdAt: { bsonType: 'date' },
        },
      },
    },
    indexes: [
      { key: { userId: 1, startedAt: -1 }, name: 'idx_sessions_user_timeline' },
      { key: { stationId: 1, startedAt: -1 }, name: 'idx_sessions_station_timeline' },
      { key: { paymentStatus: 1, startedAt: -1 }, name: 'idx_sessions_payment_status' },
    ],
  },

  alerts: {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'stationId',
          'chargerId',
          'type',
          'severity',
          'message',
          'acknowledged',
          'createdAt',
        ],
        properties: {
          stationId: { bsonType: 'objectId' },
          chargerId: { bsonType: 'string' },
          type: {
            enum: [
              'overtemperature',
              'overvoltage',
              'fault_code',
              'connectivity_loss',
              'power_surge',
              'connector_lock_failure',
            ],
          },
          severity: { enum: ['low', 'medium', 'high', 'critical'] },
          message: { bsonType: 'string' },
          acknowledged: { bsonType: 'bool' },
          createdAt: { bsonType: 'date' },
        },
      },
    },
    indexes: [
      { key: { stationId: 1, createdAt: -1 }, name: 'idx_alerts_station_history' },
      {
        key: { stationId: 1, createdAt: -1 },
        name: 'idx_alerts_unack_partial',
        partialFilterExpression: { acknowledged: false },
      },
      {
        key: { createdAt: 1 },
        name: 'idx_alerts_ttl_30d',
        expireAfterSeconds: 2592000,
      },
    ],
  },

  audit_logs: {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['actorId', 'action', 'collection', 'documentId', 'ip', 'ts'],
        properties: {
          actorId: { bsonType: ['objectId', 'string'] },
          action: { bsonType: 'string' },
          collection: { bsonType: 'string' },
          documentId: { bsonType: ['objectId', 'string'] },
          before: { bsonType: ['object', 'null'] },
          after: { bsonType: ['object', 'null'] },
          ip: { bsonType: 'string' },
          ts: { bsonType: 'date' },
        },
      },
    },
    indexes: [
      { key: { collection: 1, ts: -1 }, name: 'idx_audit_collection_timeline' },
      { key: { actorId: 1, ts: -1 }, name: 'idx_audit_actor_timeline' },
      {
        key: { ts: 1 },
        name: 'idx_audit_ttl_90d',
        expireAfterSeconds: 7776000,
      },
    ],
  },

  daily_station_stats: {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'stationId',
          'date',
          'totalSessions',
          'totalEnergyKWh',
          'totalRevenue',
          'updatedAt',
        ],
        properties: {
          stationId: { bsonType: 'objectId' },
          date: { bsonType: 'string' },
          totalSessions: { bsonType: ['int', 'long', 'double'], minimum: 0 },
          totalEnergyKWh: { bsonType: ['int', 'long', 'double'], minimum: 0 },
          totalRevenue: { bsonType: ['int', 'long', 'double'], minimum: 0 },
          peakHour: { bsonType: ['int', 'long', 'double'] },
          updatedAt: { bsonType: 'date' },
        },
      },
    },
    indexes: [
      {
        key: { stationId: 1, date: 1 },
        unique: true,
        name: 'idx_stats_station_date_unique',
      },
    ],
  },
};

export async function setupCollections(db) {
  const existingList = await db.listCollections().toArray();
  const existingNames = new Set(existingList.map(c => c.name));

  // 1. Standard Collections with Validators
  for (const [colName, config] of Object.entries(collectionsSchema)) {
    if (!existingNames.has(colName)) {
      logger.info(`Creating collection "${colName}" with $jsonSchema validator...`);
      await db.createCollection(colName, {
        validator: config.validator,
        validationLevel: 'strict',
        validationAction: 'error',
      });
    } else {
      logger.info(`Updating $jsonSchema validator for collection "${colName}"...`);
      await db.command({
        collMod: colName,
        validator: config.validator,
        validationLevel: 'strict',
        validationAction: 'error',
      });
    }

    // Apply Indexes
    if (config.indexes && config.indexes.length > 0) {
      for (const idx of config.indexes) {
        const { key, name, ...options } = idx;
        try {
          await db.collection(colName).createIndex(key, { name, ...options });
          logger.debug(`Index "${name}" confirmed on "${colName}".`);
        } catch (err) {
          logger.warn(`Could not create index "${name}" on "${colName}": ${err.message}`);
        }
      }
    }
  }

  // 2. Time-Series Collection: telemetry
  if (!existingNames.has('telemetry')) {
    logger.info('Creating time-series collection "telemetry"...');
    await db.createCollection('telemetry', {
      timeseries: {
        timeField: 'ts',
        metaField: 'meta',
        granularity: 'seconds',
      },
      expireAfterSeconds: 2592000, // 30 days retention
    });
    // Create secondary index on metadata and time
    await db
      .collection('telemetry')
      .createIndex(
        { 'meta.stationId': 1, 'meta.chargerId': 1, ts: -1 },
        { name: 'idx_telemetry_meta_ts' }
      );
    logger.info('Time-series collection "telemetry" initialized.');
  } else {
    logger.debug('Time-series collection "telemetry" already exists.');
  }
}
