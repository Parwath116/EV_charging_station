import { connectDB, getDB, closeDB } from '../config/db.js';
import { setupCollections } from '../config/schema.js';
import { logger } from '../utils/logger.js';
import { BENGALURU_AREAS } from '../config/constants.js';

// Precomputed bcrypt hash for password "VoltGrid#2026" (10 salt rounds)
const DEFAULT_PASSWORD_HASH = '$2b$10$V2HFAWRujBiup2g.se8GoOroi9yZleeRD5i6e3ttOy1JKvl02Jcdi';

// Fixed baseline anchor time for 100% deterministic reproducibility
const BASELINE_TIME = new Date('2026-10-06T12:00:00.000Z').getTime();
const DAY_MS = 86400000;

// Mulberry32 deterministic PRNG
function createPrng(seed = 42) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Bengaluru geographic boundaries & station definitions across 8 required areas
export const STATIONS_DATA = [
  // 1 & 2: Whitefield
  {
    name: 'VoltGrid SuperHub - ITPL Main Road',
    operator: 'VoltGrid Metropolitan Infrastructure',
    address: 'Plot 14, ITPL Main Road, Whitefield, Bengaluru 560066',
    area: 'Whitefield',
    location: { type: 'Point', coordinates: [77.7499, 12.9863] },
    amenities: ['WiFi', 'Restrooms', 'EV Lounge', '24/7 Security', 'Cafe'],
    tariffPerKWh: 18.5,
    openHours: '24/7',
    status: 'active',
    chargers: [
      { chargerId: 'CHG-WF1-01', connector: 'CCS2', powerKW: 120, status: 'available' },
      { chargerId: 'CHG-WF1-02', connector: 'CCS2', powerKW: 120, status: 'charging' },
      { chargerId: 'CHG-WF1-03', connector: 'Type2', powerKW: 22, status: 'available' },
      { chargerId: 'CHG-WF1-04', connector: 'CHAdeMO', powerKW: 50, status: 'available' },
    ],
  },
  {
    name: 'VoltGrid FastCharge - Prestige Shantiniketan',
    operator: 'VoltGrid Metropolitan Infrastructure',
    address: 'Commercial Hub Gate 2, Prestige Shantiniketan, Whitefield, Bengaluru 560048',
    area: 'Whitefield',
    location: { type: 'Point', coordinates: [77.7289, 12.9904] },
    amenities: ['Shopping Mall', 'Restrooms', 'Covered Parking', 'Cafe'],
    tariffPerKWh: 19.0,
    openHours: '06:00 - 23:00',
    status: 'active',
    chargers: [
      { chargerId: 'CHG-WF2-01', connector: 'CCS2', powerKW: 60, status: 'available' },
      { chargerId: 'CHG-WF2-02', connector: 'CCS2', powerKW: 60, status: 'available' },
      { chargerId: 'CHG-WF2-03', connector: 'Type2', powerKW: 22, status: 'available' },
    ],
  },

  // 3 & 4: Koramangala
  {
    name: 'VoltGrid Central - 80 Feet Road Koramangala',
    operator: 'VoltGrid Urban Transit Network',
    address: '412, 80 Feet Road, 4th Block, Koramangala, Bengaluru 560034',
    area: 'Koramangala',
    location: { type: 'Point', coordinates: [77.6245, 12.9352] },
    amenities: ['WiFi', 'Cafe', 'Restrooms', '24/7 Security'],
    tariffPerKWh: 17.5,
    openHours: '24/7',
    status: 'active',
    chargers: [
      { chargerId: 'CHG-KM1-01', connector: 'CCS2', powerKW: 150, status: 'charging' },
      { chargerId: 'CHG-KM1-02', connector: 'CCS2', powerKW: 150, status: 'available' },
      { chargerId: 'CHG-KM1-03', connector: 'Type2', powerKW: 22, status: 'available' },
      { chargerId: 'CHG-KM1-04', connector: 'GB/T', powerKW: 50, status: 'available' },
    ],
  },
  {
    name: 'VoltGrid Express - Sony World Junction',
    operator: 'VoltGrid Urban Transit Network',
    address: 'Near Sony World Crossing, 100 Feet Inner Ring Rd, Koramangala, Bengaluru 560047',
    area: 'Koramangala',
    location: { type: 'Point', coordinates: [77.6271, 12.9341] },
    amenities: ['WiFi', 'Convenience Store', '24/7 Security'],
    tariffPerKWh: 18.0,
    openHours: '24/7',
    status: 'active',
    chargers: [
      { chargerId: 'CHG-KM2-01', connector: 'CCS2', powerKW: 60, status: 'available' },
      { chargerId: 'CHG-KM2-02', connector: 'CCS2', powerKW: 60, status: 'available' },
      { chargerId: 'CHG-KM2-03', connector: 'Type2', powerKW: 22, status: 'maintenance' },
    ],
  },

  // 5 & 6: Indiranagar
  {
    name: 'VoltGrid Metro Point - 100 Feet Road Indiranagar',
    operator: 'VoltGrid Urban Transit Network',
    address: '782, 100 Feet Road, HAL 2nd Stage, Indiranagar, Bengaluru 560038',
    area: 'Indiranagar',
    location: { type: 'Point', coordinates: [77.6412, 12.9719] },
    amenities: ['WiFi', 'Restrooms', 'Cafe', 'Shopping Mall'],
    tariffPerKWh: 19.5,
    openHours: '24/7',
    status: 'active',
    chargers: [
      { chargerId: 'CHG-IN1-01', connector: 'CCS2', powerKW: 120, status: 'available' },
      { chargerId: 'CHG-IN1-02', connector: 'CCS2', powerKW: 120, status: 'charging' },
      { chargerId: 'CHG-IN1-03', connector: 'Type2', powerKW: 22, status: 'available' },
    ],
  },
  {
    name: 'VoltGrid Corner - 12th Main Indiranagar',
    operator: 'VoltGrid Urban Transit Network',
    address: '53, 12th Main Road, Defence Colony, Indiranagar, Bengaluru 560008',
    area: 'Indiranagar',
    location: { type: 'Point', coordinates: [77.6441, 12.9691] },
    amenities: ['Cafe', 'Covered Parking', 'WiFi'],
    tariffPerKWh: 18.5,
    openHours: '07:00 - 23:00',
    status: 'active',
    chargers: [
      { chargerId: 'CHG-IN2-01', connector: 'CCS2', powerKW: 50, status: 'available' },
      { chargerId: 'CHG-IN2-02', connector: 'Type2', powerKW: 22, status: 'available' },
      { chargerId: 'CHG-IN2-03', connector: 'CHAdeMO', powerKW: 50, status: 'available' },
    ],
  },

  // 7 & 8: Electronic City
  {
    name: 'VoltGrid TechPark Hub - E-City Phase 1',
    operator: 'VoltGrid Green Corridor Systems',
    address: 'Phase 1 Electronic City, Opp. Wipro Gate 3, Bengaluru 560100',
    area: 'Electronic City',
    location: { type: 'Point', coordinates: [77.6602, 12.8452] },
    amenities: ['EV Lounge', 'WiFi', 'Restrooms', '24/7 Security', 'Covered Parking'],
    tariffPerKWh: 16.0,
    openHours: '24/7',
    status: 'active',
    chargers: [
      { chargerId: 'CHG-EC1-01', connector: 'CCS2', powerKW: 150, status: 'available' },
      { chargerId: 'CHG-EC1-02', connector: 'CCS2', powerKW: 150, status: 'charging' },
      { chargerId: 'CHG-EC1-03', connector: 'CCS2', powerKW: 60, status: 'available' },
      { chargerId: 'CHG-EC1-04', connector: 'Type2', powerKW: 22, status: 'available' },
    ],
  },
  {
    name: 'VoltGrid Gateway - Hosur Road Flyover Base',
    operator: 'VoltGrid Green Corridor Systems',
    address: 'NH 44 Hosur Road Toll Plaza Corridor, Electronic City, Bengaluru 560100',
    area: 'Electronic City',
    location: { type: 'Point', coordinates: [77.674, 12.8398] },
    amenities: ['24/7 Security', 'Restrooms', 'Fast Food'],
    tariffPerKWh: 15.5,
    openHours: '24/7',
    status: 'active',
    chargers: [
      { chargerId: 'CHG-EC2-01', connector: 'CCS2', powerKW: 120, status: 'available' },
      { chargerId: 'CHG-EC2-02', connector: 'CCS2', powerKW: 120, status: 'available' },
      { chargerId: 'CHG-EC2-03', connector: 'GB/T', powerKW: 50, status: 'available' },
    ],
  },

  // 9 & 10: Hebbal
  {
    name: 'VoltGrid North Hub - Manyata Tech Park Ring Road',
    operator: 'VoltGrid North Corridor Ops',
    address: 'Outer Ring Road, Opp. Manyata Tech Park Gate 1, Hebbal, Bengaluru 560045',
    area: 'Hebbal',
    location: { type: 'Point', coordinates: [77.6212, 13.0478] },
    amenities: ['EV Lounge', 'WiFi', 'Restrooms', '24/7 Security', 'Cafe'],
    tariffPerKWh: 17.0,
    openHours: '24/7',
    status: 'active',
    chargers: [
      { chargerId: 'CHG-HB1-01', connector: 'CCS2', powerKW: 150, status: 'available' },
      { chargerId: 'CHG-HB1-02', connector: 'CCS2', powerKW: 60, status: 'charging' },
      { chargerId: 'CHG-HB1-03', connector: 'Type2', powerKW: 22, status: 'available' },
    ],
  },
  {
    name: 'VoltGrid Flyover Junction - Bellary Road',
    operator: 'VoltGrid North Corridor Ops',
    address: 'Bellary Road Service Lane, Near Hebbal Lake, Bengaluru 560024',
    area: 'Hebbal',
    location: { type: 'Point', coordinates: [77.597, 13.0358] },
    amenities: ['Restrooms', '24/7 Security', 'Convenience Store'],
    tariffPerKWh: 16.5,
    openHours: '24/7',
    status: 'active',
    chargers: [
      { chargerId: 'CHG-HB2-01', connector: 'CCS2', powerKW: 60, status: 'available' },
      { chargerId: 'CHG-HB2-02', connector: 'CHAdeMO', powerKW: 50, status: 'available' },
      { chargerId: 'CHG-HB2-03', connector: 'Type2', powerKW: 22, status: 'available' },
    ],
  },

  // 11 & 12: HSR Layout
  {
    name: 'VoltGrid Sector 1 - 27th Main HSR',
    operator: 'VoltGrid South Bangalore Distribution',
    address: '908, 27th Main Road, Sector 1, HSR Layout, Bengaluru 560102',
    area: 'HSR Layout',
    location: { type: 'Point', coordinates: [77.6446, 12.9121] },
    amenities: ['WiFi', 'Cafe', 'Restrooms', 'EV Lounge'],
    tariffPerKWh: 18.0,
    openHours: '24/7',
    status: 'active',
    chargers: [
      { chargerId: 'CHG-HSR1-01', connector: 'CCS2', powerKW: 120, status: 'available' },
      { chargerId: 'CHG-HSR1-02', connector: 'CCS2', powerKW: 120, status: 'available' },
      { chargerId: 'CHG-HSR1-03', connector: 'Type2', powerKW: 22, status: 'available' },
    ],
  },
  {
    name: 'VoltGrid Sector 4 - Agara Lake Front',
    operator: 'VoltGrid South Bangalore Distribution',
    address: 'Agara Outer Ring Road Junction, Sector 4, HSR Layout, Bengaluru 560102',
    area: 'HSR Layout',
    location: { type: 'Point', coordinates: [77.6521, 12.9189] },
    amenities: ['Covered Parking', 'Restrooms', '24/7 Security'],
    tariffPerKWh: 17.5,
    openHours: '06:00 - 23:00',
    status: 'active',
    chargers: [
      { chargerId: 'CHG-HSR2-01', connector: 'CCS2', powerKW: 60, status: 'available' },
      { chargerId: 'CHG-HSR2-02', connector: 'CCS2', powerKW: 60, status: 'available' },
      { chargerId: 'CHG-HSR2-03', connector: 'Type2', powerKW: 22, status: 'available' },
    ],
  },

  // 13 & 14: Jayanagar
  {
    name: 'VoltGrid South Hub - 4th Block Complex',
    operator: 'VoltGrid Heritage Grid Ops',
    address: '11th Main Rd, 4th Block, Jayanagar, Bengaluru 560011',
    area: 'Jayanagar',
    location: { type: 'Point', coordinates: [77.5838, 12.9308] },
    amenities: ['Shopping Mall', 'Restrooms', 'WiFi', '24/7 Security'],
    tariffPerKWh: 17.0,
    openHours: '07:00 - 23:00',
    status: 'active',
    chargers: [
      { chargerId: 'CHG-JN1-01', connector: 'CCS2', powerKW: 120, status: 'available' },
      { chargerId: 'CHG-JN1-02', connector: 'CCS2', powerKW: 60, status: 'available' },
      { chargerId: 'CHG-JN1-03', connector: 'Type2', powerKW: 22, status: 'available' },
      { chargerId: 'CHG-JN1-04', connector: 'GB/T', powerKW: 50, status: 'available' },
    ],
  },
  {
    name: 'VoltGrid Heritage - 9th Block South End',
    operator: 'VoltGrid Heritage Grid Ops',
    address: '32nd Cross Road, 9th Block, Jayanagar, Bengaluru 560069',
    area: 'Jayanagar',
    location: { type: 'Point', coordinates: [77.5912, 12.9195] },
    amenities: ['Covered Parking', 'WiFi', 'Restrooms'],
    tariffPerKWh: 16.5,
    openHours: '24/7',
    status: 'active',
    chargers: [
      { chargerId: 'CHG-JN2-01', connector: 'CCS2', powerKW: 60, status: 'available' },
      { chargerId: 'CHG-JN2-02', connector: 'Type2', powerKW: 22, status: 'available' },
    ],
  },

  // 15 & 16: Malleshwaram
  {
    name: 'VoltGrid West Point - 8th Cross Margosa Road',
    operator: 'VoltGrid West Metro Ops',
    address: 'Margosa Road, Between 8th and 9th Cross, Malleshwaram, Bengaluru 560003',
    area: 'Malleshwaram',
    location: { type: 'Point', coordinates: [77.5643, 13.0031] },
    amenities: ['WiFi', 'Restrooms', 'Cafe', 'Covered Parking'],
    tariffPerKWh: 18.0,
    openHours: '24/7',
    status: 'active',
    chargers: [
      { chargerId: 'CHG-ML1-01', connector: 'CCS2', powerKW: 120, status: 'available' },
      { chargerId: 'CHG-ML1-02', connector: 'CCS2', powerKW: 60, status: 'available' },
      { chargerId: 'CHG-ML1-03', connector: 'Type2', powerKW: 22, status: 'available' },
    ],
  },
  {
    name: 'VoltGrid Metro Station - Sampige Road',
    operator: 'VoltGrid West Metro Ops',
    address: 'Sampige Road Metro Station Transit Bay, Malleshwaram, Bengaluru 560003',
    area: 'Malleshwaram',
    location: { type: 'Point', coordinates: [77.5712, 12.9975] },
    amenities: ['Metro Transit Connection', 'Restrooms', '24/7 Security'],
    tariffPerKWh: 17.0,
    openHours: '05:30 - 23:30',
    status: 'maintenance',
    chargers: [
      { chargerId: 'CHG-ML2-01', connector: 'CCS2', powerKW: 60, status: 'maintenance' },
      { chargerId: 'CHG-ML2-02', connector: 'Type2', powerKW: 22, status: 'maintenance' },
    ],
  },
];

// Generic fictional user names
const FICTIONAL_FIRST_NAMES = [
  'Aarav',
  'Aditi',
  'Akash',
  'Ananya',
  'Arjun',
  'Bhavna',
  'Chetan',
  'Deepa',
  'Dev',
  'Divya',
  'Gaurav',
  'Ishaan',
  'Jaya',
  'Karan',
  'Kavita',
  'Manish',
  'Meera',
  'Mohan',
  'Neha',
  'Nikhil',
  'Pooja',
  'Pranav',
  'Priya',
  'Rahul',
  'Rani',
  'Rishi',
  'Ritu',
  'Rohan',
  'Sameer',
  'Sangeeta',
  'Sanjay',
  'Shalini',
  'Shikha',
  'Siddharth',
  'Smita',
  'Sneha',
  'Suresh',
  'Swati',
  'Tanvi',
  'Tarun',
  'Varun',
  'Vidya',
  'Vikram',
  'Vinay',
  'Yash',
  'Zara',
  'Abhishek',
  'Archana',
  'Ashok',
  'Chitra',
  'Harish',
  'Komal',
  'Manoj',
  'Naveen',
  'Preeti',
  'Rajesh',
];

const FICTIONAL_LAST_NAMES = [
  'Mehta',
  'Sharma',
  'Gupta',
  'Iyer',
  'Patel',
  'Nair',
  'Verma',
  'Rao',
  'Deshmukh',
  'Kulkarni',
  'Menon',
  'Reddy',
  'Sen',
  'Joshi',
  'Hegde',
  'Pillai',
  'Bhat',
  'Nambiar',
  'Bose',
  'Chopra',
  'Malhotra',
  'Shetty',
  'Kamath',
  'Pai',
];

const VEHICLE_MODELS = [
  { make: 'Tata', model: 'Nexon EV Long Range', connectorType: 'CCS2', batteryKWh: 40.5 },
  { make: 'Tata', model: 'Tiago EV', connectorType: 'CCS2', batteryKWh: 24.0 },
  { make: 'MG', model: 'ZS EV Executive', connectorType: 'CCS2', batteryKWh: 50.3 },
  { make: 'Mahindra', model: 'XUV400 Pro', connectorType: 'CCS2', batteryKWh: 39.4 },
  { make: 'Hyundai', model: 'Ioniq 5 AWD', connectorType: 'CCS2', batteryKWh: 72.6 },
  { make: 'BYD', model: 'Atto 3 Superior', connectorType: 'CCS2', batteryKWh: 60.4 },
  { make: 'Kia', model: 'EV6 GT-Line', connectorType: 'CCS2', batteryKWh: 77.4 },
  { make: 'BMW', model: 'iX1 xDrive30', connectorType: 'CCS2', batteryKWh: 66.5 },
];

export async function seedDatabase(randomSeed = 42) {
  const startTime = Date.now();
  const rng = createPrng(randomSeed);
  logger.info(`Commencing VoltGrid Bengaluru deterministic seed (PRNG Seed: ${randomSeed})...`);

  try {
    await connectDB();
    const db = getDB();

    // 1. Initialize Collections & Indexes
    await setupCollections(db);

    // Purge existing data
    logger.info('Purging collections prior to deterministic insertion...');
    const collectionsToClear = [
      'users',
      'stations',
      'bookings',
      'sessions',
      'telemetry',
      'alerts',
      'audit_logs',
      'daily_station_stats',
    ];
    for (const cName of collectionsToClear) {
      await db.collection(cName).deleteMany({});
    }

    // 2. Insert Stations (~16 stations across 8 areas)
    logger.info('Seeding stations collection...');
    const stationDocs = STATIONS_DATA.map(st => ({
      ...st,
      createdAt: new Date('2025-11-01T00:00:00.000Z'),
    }));
    const stationInsertResult = await db.collection('stations').insertMany(stationDocs);
    const stationIds = Object.values(stationInsertResult.insertedIds);
    logger.info(`Inserted ${stationIds.length} stations across Bengaluru.`);

    // 3. Insert Users (60 users: 2 Admins, 6 Operators, 52 Drivers)
    logger.info('Generating 60 users with generic fictional profiles...');
    const userDocs = [];

    // Admins
    userDocs.push({
      name: 'System Network Administrator',
      email: 'admin@voltgrid.internal',
      passwordHash: DEFAULT_PASSWORD_HASH,
      role: 'admin',
      walletBalance: 25000,
      vehicles: [
        { make: 'Hyundai', model: 'Ioniq 5 AWD', connectorType: 'CCS2', batteryKWh: 72.6 },
      ],
      createdAt: new Date('2025-10-01T00:00:00.000Z'),
      lastLoginAt: new Date(BASELINE_TIME - 3600000),
    });

    userDocs.push({
      name: 'Operations Grid Lead',
      email: 'admin.lead@voltgrid.internal',
      passwordHash: DEFAULT_PASSWORD_HASH,
      role: 'admin',
      walletBalance: 15000,
      vehicles: [{ make: 'Kia', model: 'EV6 GT-Line', connectorType: 'CCS2', batteryKWh: 77.4 }],
      createdAt: new Date('2025-10-05T00:00:00.000Z'),
      lastLoginAt: new Date(BASELINE_TIME - 7200000),
    });

    // Operators
    for (let i = 0; i < 6; i++) {
      const area = BENGALURU_AREAS[i];
      const areaTag = area.toLowerCase().replace(/\s+/g, '');
      userDocs.push({
        name: `Operator ${area} Grid`,
        email: `operator.${areaTag}@voltgrid.internal`,
        passwordHash: DEFAULT_PASSWORD_HASH,
        role: 'operator',
        walletBalance: 8000,
        vehicles: [
          { make: 'Tata', model: 'Nexon EV Long Range', connectorType: 'CCS2', batteryKWh: 40.5 },
        ],
        createdAt: new Date('2025-10-10T00:00:00.000Z'),
        lastLoginAt: new Date(BASELINE_TIME - (i + 1) * 3600000),
      });
    }

    // Drivers (52 drivers)
    for (let i = 0; i < 52; i++) {
      const fName = FICTIONAL_FIRST_NAMES[i % FICTIONAL_FIRST_NAMES.length];
      const lName = FICTIONAL_LAST_NAMES[i % FICTIONAL_LAST_NAMES.length];
      const fullName = `${fName} ${lName}`;
      const email = `driver.${fName.toLowerCase()}.${lName.toLowerCase()}.${i + 1}@voltgrid.internal`;
      const vehicleChoice = VEHICLE_MODELS[i % VEHICLE_MODELS.length];

      userDocs.push({
        name: fullName,
        email,
        passwordHash: DEFAULT_PASSWORD_HASH,
        role: 'driver',
        walletBalance: Math.floor(500 + rng() * 4500),
        vehicles: [vehicleChoice],
        createdAt: new Date(BASELINE_TIME - Math.floor(rng() * 90) * DAY_MS),
        lastLoginAt: new Date(BASELINE_TIME - Math.floor(rng() * 5) * DAY_MS),
      });
    }

    const userInsertResult = await db.collection('users').insertMany(userDocs);
    const userIds = Object.values(userInsertResult.insertedIds);
    const driverIds = userIds.slice(8); // Exclude 2 admins and 6 operators
    logger.info(`Inserted ${userDocs.length} users (2 admins, 6 operators, 52 drivers).`);

    // 4. Generate 550+ Bookings with GUARANTEED ZERO OVERLAPS on the same charger
    logger.info('Generating 550+ non-overlapping bookings across station chargers...');
    const bookingDocs = [];
    const chargerSchedules = new Map(); // chargerId -> Array<{ startTime, endTime }>

    // Flatten all available chargers across stations
    const chargerList = [];
    for (let stIdx = 0; stIdx < stationDocs.length; stIdx++) {
      const st = stationDocs[stIdx];
      const sId = stationIds[stIdx];
      for (const ch of st.chargers) {
        if (ch.status !== 'maintenance') {
          chargerList.push({
            stationId: sId,
            tariffPerKWh: st.tariffPerKWh,
            charger: ch,
          });
          chargerSchedules.set(ch.chargerId, []);
        }
      }
    }

    // Target 560 bookings: ~12 slots per charger distributed deterministically across 30 days
    let bookingCounter = 0;
    const daysRange = 30; // -24 days to +6 days relative to BASELINE_TIME

    for (const item of chargerList) {
      const { stationId, tariffPerKWh, charger } = item;
      const chId = charger.chargerId;
      const schedule = chargerSchedules.get(chId);

      // Generate 11-13 non-overlapping slots per charger
      const slotsForCharger = 11 + (bookingCounter % 3);
      for (let s = 0; s < slotsForCharger; s++) {
        const dayOffset = -24 + Math.floor((s / slotsForCharger) * daysRange);
        const dayBase = BASELINE_TIME + dayOffset * DAY_MS;

        // Spread hour of day: (8 + (s * 3) % 14) -> hours between 8:00 and 22:00
        const hour = 8 + ((s * 3 + Math.floor(rng() * 2)) % 14);
        const minute = s % 2 === 0 ? 0 : 30;
        const durationMins = 30 + (s % 3) * 15; // 30, 45, or 60 mins

        const slotStart = new Date(dayBase);
        slotStart.setUTCHours(hour, minute, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + durationMins * 60000);

        // Verify slot does not overlap with any previously scheduled slot on this charger
        const overlaps = schedule.some(existing => {
          return (
            Math.max(existing.startMs, slotStart.getTime()) <
            Math.min(existing.endMs, slotEnd.getTime())
          );
        });

        if (!overlaps) {
          schedule.push({
            startMs: slotStart.getTime(),
            endMs: slotEnd.getTime(),
          });

          const userId = driverIds[bookingCounter % driverIds.length];
          let status = 'completed';
          if (slotStart.getTime() > BASELINE_TIME) {
            status = bookingCounter % 7 === 0 ? 'cancelled' : 'confirmed';
          } else if (bookingCounter % 11 === 0) {
            status = 'cancelled';
          }

          const estimatedKWh = (durationMins / 60) * charger.powerKW * 0.8;
          const estimatedCost = Math.round(estimatedKWh * tariffPerKWh);

          bookingDocs.push({
            userId,
            stationId,
            chargerId: chId,
            startTime: slotStart,
            endTime: slotEnd,
            status,
            estimatedCost,
            createdAt: new Date(slotStart.getTime() - DAY_MS),
          });

          bookingCounter++;
        }
      }
    }

    // Strictly verify ZERO overlaps across all scheduled bookings
    for (const [chId, slots] of chargerSchedules.entries()) {
      slots.sort((a, b) => a.startMs - b.startMs);
      for (let i = 0; i < slots.length - 1; i++) {
        if (slots[i].endMs > slots[i + 1].startMs) {
          throw new Error(
            `CRITICAL ERROR: Overlap detected on charger "${chId}" between ${new Date(slots[i].startMs).toISOString()} and ${new Date(slots[i + 1].startMs).toISOString()}`
          );
        }
      }
    }
    logger.info(
      `Verified: 0 slot collisions detected across all ${bookingDocs.length} generated bookings.`
    );

    await db.collection('bookings').insertMany(bookingDocs);
    logger.info(`Inserted ${bookingDocs.length} deterministic booking records.`);

    // 5. Generate 2,200+ Charging Sessions with realistic diurnal distributions
    logger.info('Generating 2,200+ charging sessions over 90 days with diurnal peaks...');
    const sessionDocs = [];

    for (let s = 0; s < 2250; s++) {
      const stationIndex = s % stationDocs.length;
      const station = stationDocs[stationIndex];
      const stationId = stationIds[stationIndex];
      const charger = station.chargers[s % station.chargers.length];
      const userId = driverIds[s % driverIds.length];

      const dayOffset = Math.floor(rng() * 90);
      const sessionDate = new Date(BASELINE_TIME - dayOffset * DAY_MS);

      // Diurnal weighting: morning peak (8-11), evening peak (17-21)
      const r = rng();
      let hour;
      if (r < 0.4) {
        hour = 8 + Math.floor(rng() * 4);
      } else if (r < 0.8) {
        hour = 17 + Math.floor(rng() * 5);
      } else {
        hour = Math.floor(rng() * 24);
      }

      sessionDate.setUTCHours(hour, Math.floor(rng() * 60), 0, 0);
      const startedAt = new Date(sessionDate);
      const durationMinutes = 20 + Math.floor(rng() * 55); // 20 - 75 minutes
      const endedAt = new Date(startedAt.getTime() + durationMinutes * 60000);

      const effectivePower = charger.powerKW * (0.75 + rng() * 0.2);
      const energyKWh = Math.round(effectivePower * (durationMinutes / 60) * 10) / 10;
      const cost = Math.round(energyKWh * station.tariffPerKWh);

      sessionDocs.push({
        userId,
        stationId,
        chargerId: charger.chargerId,
        startedAt,
        endedAt,
        energyKWh,
        cost,
        paymentStatus: 'paid',
        createdAt: startedAt,
      });
    }

    await db.collection('sessions').insertMany(sessionDocs);
    logger.info(`Inserted ${sessionDocs.length} charging sessions.`);

    // 6. Generate 3,500+ Telemetry Points into Time-Series Collection
    logger.info('Generating 3,500+ telemetry points into time-series collection "telemetry"...');
    const telemetryDocs = [];
    const telemetryIntervals = 75;

    for (let stIdx = 0; stIdx < stationDocs.length; stIdx++) {
      const station = stationDocs[stIdx];
      const stationId = stationIds[stIdx];

      for (const charger of station.chargers) {
        const isCharging = charger.status === 'charging';

        for (let pt = 0; pt < telemetryIntervals; pt++) {
          const pointTime = new Date(BASELINE_TIME - (telemetryIntervals - pt) * 120000);

          let voltage = 398 + Math.round((Math.sin(pt / 5) * 6 + rng() * 4) * 10) / 10;
          let currentA = isCharging
            ? Math.round((70 + Math.sin(pt / 4) * 45 + rng() * 10) * 10) / 10
            : 0.5;
          let powerKW = isCharging
            ? Math.round(((voltage * currentA * Math.sqrt(3)) / 1000) * 10) / 10
            : 0;
          let temperatureC = isCharging
            ? Math.round((38 + (pt / telemetryIntervals) * 18 + rng() * 3) * 10) / 10
            : Math.round((28 + rng() * 4) * 10) / 10;
          let state = isCharging ? 'charging' : 'idle';

          if (isCharging && pt > 65 && stIdx === 0) {
            temperatureC = 68.5; // High thermal anomaly
          }

          telemetryDocs.push({
            ts: pointTime,
            meta: {
              stationId,
              chargerId: charger.chargerId,
            },
            voltage,
            currentA,
            powerKW,
            temperatureC,
            state,
          });
        }
      }
    }

    await db.collection('telemetry').insertMany(telemetryDocs);
    logger.info(`Inserted ${telemetryDocs.length} time-series telemetry records.`);

    // 7. Generate Operational Hardware Alerts
    logger.info('Seeding operational hardware alerts...');
    const alertDocs = [
      {
        stationId: stationIds[0],
        chargerId: 'CHG-WF1-02',
        type: 'overtemperature',
        severity: 'high',
        message: 'Connector temperature reached 68.5°C during active 120kW charge cycle',
        acknowledged: false,
        createdAt: new Date(BASELINE_TIME - 15 * 60000),
      },
      {
        stationId: stationIds[2],
        chargerId: 'CHG-KM1-01',
        type: 'power_surge',
        severity: 'medium',
        message: 'Transient voltage spike detected on phase L2 (428V)',
        acknowledged: true,
        createdAt: new Date(BASELINE_TIME - 120 * 60000),
      },
      {
        stationId: stationIds[15],
        chargerId: 'CHG-ML2-01',
        type: 'connectivity_loss',
        severity: 'critical',
        message: 'OCPP gateway unresponsive for > 15 minutes; scheduled maintenance flagged',
        acknowledged: false,
        createdAt: new Date(BASELINE_TIME - 360 * 60000),
      },
      {
        stationId: stationIds[3],
        chargerId: 'CHG-KM2-03',
        type: 'fault_code',
        severity: 'medium',
        message: 'Ground fault interrupter triggered; automated lockout active',
        acknowledged: false,
        createdAt: new Date(BASELINE_TIME - 240 * 60000),
      },
    ];
    await db.collection('alerts').insertMany(alertDocs);
    logger.info(`Inserted ${alertDocs.length} operational alert records.`);

    // 8. Generate Audit Logs
    logger.info('Seeding operator and admin audit logs...');
    const auditDocs = [
      {
        actorId: userIds[0],
        action: 'PROVISION_STATION',
        collection: 'stations',
        documentId: stationIds[0],
        before: null,
        after: { name: stationDocs[0].name, status: 'active' },
        ip: '127.0.0.1',
        ts: new Date('2025-11-01T10:00:00.000Z'),
      },
      {
        actorId: userIds[2],
        action: 'UPDATE_TARIFF',
        collection: 'stations',
        documentId: stationIds[1],
        before: { tariffPerKWh: 17.5 },
        after: { tariffPerKWh: 19.0 },
        ip: '127.0.0.1',
        ts: new Date('2025-12-15T14:30:00.000Z'),
      },
      {
        actorId: userIds[1],
        action: 'SCHEDULE_MAINTENANCE',
        collection: 'stations',
        documentId: stationIds[15],
        before: { status: 'active' },
        after: { status: 'maintenance' },
        ip: '127.0.0.1',
        ts: new Date(BASELINE_TIME - 360 * 60000),
      },
    ];
    await db.collection('audit_logs').insertMany(auditDocs);
    logger.info(`Inserted ${auditDocs.length} initial audit records.`);

    // 9. Generate Daily Station Stats Baseline
    logger.info('Populating daily_station_stats baseline summary...');
    const statsDocs = [];
    for (let i = 0; i < stationIds.length; i++) {
      const sId = stationIds[i];
      for (let d = 1; d <= 3; d++) {
        const dateStr = new Date(BASELINE_TIME - d * DAY_MS).toISOString().split('T')[0];
        statsDocs.push({
          stationId: sId,
          date: dateStr,
          totalSessions: 14 + i * 2 + d,
          totalEnergyKWh: 450 + i * 35 + d * 10,
          totalRevenue: Math.round((450 + i * 35 + d * 10) * 18.0),
          peakHour: 18,
          updatedAt: new Date(BASELINE_TIME),
        });
      }
    }
    await db.collection('daily_station_stats').insertMany(statsDocs);
    logger.info(`Inserted ${statsDocs.length} daily stats summary documents.`);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info('====================================================');
    logger.info(` VoltGrid Bengaluru Seed Completed in ${duration}s`);
    logger.info(
      ` Stations      : ${stationDocs.length} (Whitefield, Koramangala, Indiranagar, E-City, Hebbal, HSR, Jayanagar, Malleshwaram)`
    );
    logger.info(` Users         : ${userDocs.length} (2 Admins, 6 Operators, 52 Drivers)`);
    logger.info(` Bookings      : ${bookingDocs.length} (0 slot overlaps confirmed)`);
    logger.info(` Sessions      : ${sessionDocs.length}`);
    logger.info(` Telemetry Pts : ${telemetryDocs.length} (Time-series)`);
    logger.info(` Alerts        : ${alertDocs.length}`);
    logger.info(` Audit Logs    : ${auditDocs.length}`);
    logger.info(` Daily Stats   : ${statsDocs.length}`);
    logger.info('====================================================');
  } catch (error) {
    logger.error('Database seed error:', error);
    throw error;
  }
}

// CLI direct execution
if (process.argv[1]?.endsWith('seed.js')) {
  seedDatabase()
    .then(async () => {
      await closeDB();
      process.exit(0);
    })
    .catch(async () => {
      await closeDB();
      process.exit(1);
    });
}
