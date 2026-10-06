# VoltGrid MongoDB Feature Mapping Matrix

This document tracks all MongoDB 7+ database capabilities, operators, and engine features utilized across VoltGrid, mapped directly to product features and exact code locations.

---

## 1. Core Data Access & Manipulation (CRUD)

| Feature / Workload                  | MongoDB Method / Operator | Target Collection | Code Reference                                | Description                                                                 |
| :---------------------------------- | :------------------------ | :---------------- | :-------------------------------------------- | :-------------------------------------------------------------------------- |
| Single Station Creation             | `insertOne()`             | `stations`        | `server/repositories/station.repository.js`   | Persists individual charging station with embedded chargers.                |
| CSV Bulk Import                     | `insertMany()`            | `stations`        | `server/repositories/station.repository.js`   | Batch ingestion of stations from CSV uploads with unordered error handling. |
| High-Throughput Telemetry Ingestion | `insertMany()`            | `telemetry`       | `server/repositories/telemetry.repository.js` | High-throughput time-series sensor ingestion.                               |
| Single Telemetry Point              | `insertOne()`             | `telemetry`       | `server/repositories/telemetry.repository.js` | Appends individual IoT device reading.                                      |
| Operational Alert Creation          | `insertOne()`             | `alerts`          | `server/repositories/alert.repository.js`     | Records hardware fault or thermal anomaly alarm.                            |
| Regulatory Audit Trail Logging      | `insertOne()`             | `audit_logs`      | `server/repositories/audit.repository.js`     | Immutable logging of administrative and operational actions.                |
| Atomic Alert Resolution             | `findOneAndUpdate()`      | `alerts`          | `server/repositories/alert.repository.js`     | Marks alert resolved and stamps timestamp in a single round-trip.           |
| Atomic Booking Reservation          | `findOneAndUpdate()`      | `bookings`        | `server/repositories/booking.repository.js`   | Locks and transitions booking state atomically.                             |
| Mixed Batch Maintenance             | `bulkWrite()`             | `stations`        | `server/repositories/station.repository.js`   | Executes interleaved updates and upserts across multiple stations.          |
| Station Recommissioning             | `upsert: true`            | `stations`        | `server/repositories/station.repository.js`   | Creates or replaces station definitions idempotently.                       |
| User Profile Dynamic Field Unset    | `$unset`                  | `users`           | `server/repositories/user.repository.js`      | Schema evolution removing deprecated non-sensitive fields.                  |
| User Profile Dynamic Field Rename   | `$rename`                 | `users`           | `server/repositories/user.repository.js`      | Schema evolution renaming user profile attributes.                          |
| Atomic Driver Wallet Credit         | `$inc`                    | `users`           | `server/repositories/user.repository.js`      | Atomically increments driver prepaid wallet balance.                        |

---

## 2. Array Manipulation Operators

| Feature / Workload                | MongoDB Operator        | Target Collection                       | Code Reference                              | Description                                                                   |
| :-------------------------------- | :---------------------- | :-------------------------------------- | :------------------------------------------ | :---------------------------------------------------------------------------- |
| Add Charger to Station            | `$push`                 | `stations.chargers`                     | `server/repositories/station.repository.js` | Appends a new hardware dispenser to a station.                                |
| Remove Decommissioned Charger     | `$pull`                 | `stations.chargers`                     | `server/repositories/station.repository.js` | Removes charger subdocument by `chargerId`.                                   |
| Update Specific Charger Status    | `arrayFilters` (`$[c]`) | `stations.chargers.$[c]`                | `server/repositories/station.repository.js` | Modifies power or status of a specific embedded charger.                      |
| Atomic Booking Skew Lock          | `$inc`                  | `stations.chargers.$[c].bookingVersion` | `server/repositories/booking.repository.js` | Atomically increments version counter to force lock and eliminate write skew. |
| Add Vehicle to Driver Garage      | `$push`                 | `users.vehicles`                        | `server/repositories/user.repository.js`    | Adds electric vehicle specs to user vehicle array.                            |
| Remove Vehicle from Driver Garage | `$pull`                 | `users.vehicles`                        | `server/repositories/user.repository.js`    | Removes electric vehicle subdocument by model.                                |
| Add Driver Favourite Station      | `$addToSet`             | `users.favouriteStations`               | `server/repositories/user.repository.js`    | Ensures idempotency when adding stations to user favourites.                  |
| Remove Driver Favourite Station   | `$pull`                 | `users.favouriteStations`               | `server/repositories/user.repository.js`    | Removes station ObjectId from driver favourite list.                          |

---

## 3. Geospatial Engine (2dsphere)

| Feature / Workload              | MongoDB Operator                  | Target Collection   | Code Reference                              | Description                                                              |
| :------------------------------ | :-------------------------------- | :------------------ | :------------------------------------------ | :----------------------------------------------------------------------- |
| Nearest Available Charger       | `$near`                           | `stations`          | `server/repositories/station.repository.js` | Queries stations nearest to driver coordinates with max distance filter. |
| Proximity Distance Calculation  | `$geoNear`                        | `stations`          | `server/repositories/station.repository.js` | Aggregation stage computing spherical distance in meters to driver.      |
| Viewport Bounding Box Search    | `$geoWithin` with `$box`          | `stations`          | `server/repositories/station.repository.js` | Returns stations within rectangular map viewport bounds.                 |
| Radial Circular Boundary Search | `$geoWithin` with `$centerSphere` | `stations`          | `server/repositories/station.repository.js` | Returns stations enclosed within custom circular radius.                 |
| Custom Polygon Zone Filter      | `$geoWithin` with `$geometry`     | `stations`          | `server/repositories/station.repository.js` | Returns stations enclosed within custom polygonal corridor.              |
| Geospatial Index Definition     | `2dsphere`                        | `stations.location` | `server/config/schema.js`                   | Evaluates spherical geometry on Earth's surface using WGS84 coordinates. |

---

## 4. Text Search & Indexing Engine

| Feature / Workload                   | MongoDB Operator / Index                  | Target Collection             | Code Reference                              | Description                                                                   |
| :----------------------------------- | :---------------------------------------- | :---------------------------- | :------------------------------------------ | :---------------------------------------------------------------------------- |
| Catalog Full-Text Search             | `$text`, `$search`                        | `stations`                    | `server/repositories/station.repository.js` | Compound full-text search across `name`, `address`, `area`, and `amenities`.  |
| Unique Email Enforcement             | Unique Index                              | `users`                       | `server/config/schema.js`                   | Precludes duplicate account registrations.                                    |
| Unique Multikey Charger ID           | Unique Index                              | `stations.chargers.chargerId` | `server/config/schema.js`                   | Enforces global uniqueness of charger serial identifiers across all stations. |
| Active Booking Fast Lookups          | Partial Index                             | `bookings`                    | `server/config/schema.js`                   | Indexes solely `status: { $in: ['pending', 'confirmed'] }`.                   |
| Active Station Tariff Partial Filter | Partial Index                             | `stations`                    | `server/config/schema.js`                   | Indexes solely `status: 'active'` sorted by `tariffPerKWh`.                   |
| Unacknowledged Alerts Queue          | Partial Index                             | `alerts`                      | `server/config/schema.js`                   | Indexes solely `acknowledged: false` to minimize index memory footprint.      |
| Automatic Telemetry Retention        | TTL Index (`expireAfterSeconds: 2592000`) | `telemetry`                   | `server/config/schema.js`                   | Automatically purges raw sensor telemetry older than 30 days.                 |
| Operational Alerts Retention         | TTL Index (`expireAfterSeconds: 2592000`) | `alerts`                      | `server/config/schema.js`                   | Automatically purges resolved alerts older than 30 days.                      |
| Regulatory Audit Log Retention       | TTL Index (`expireAfterSeconds: 7776000`) | `audit_logs`                  | `server/config/schema.js`                   | Automatically removes compliance audit entries older than 90 days.            |

---

## 5. Aggregation Framework Pipelines

| Analytics Feature               | Pipeline Stages & Operators                         | Target Collections                  | Code Reference                                | Description                                                              |
| :------------------------------ | :-------------------------------------------------- | :---------------------------------- | :-------------------------------------------- | :----------------------------------------------------------------------- |
| Peak-Hour Charging Load         | `$project`, `$hour`, `$group`, `$sort`              | `sessions`                          | `server/repositories/analytics.repository.js` | Determines network-wide power demand curve across 24 hours.              |
| Station Utilization & Revenue   | `$lookup`, `$unwind`, `$group`, `$project`, `$sort` | `stations` ⋈ `sessions`             | `server/repositories/analytics.repository.js` | Correlates station metadata with historical session revenue.             |
| Area Revenue & Demand Facets    | `$facet`, `$group`, `$sort`, `$limit`               | `sessions`                          | `server/repositories/analytics.repository.js` | Computes multi-dimensional regional breakdowns in a single pass.         |
| Session Dwell Time Distribution | `$bucket`, `$project`, `$round`                     | `sessions`                          | `server/repositories/analytics.repository.js` | Groups charging sessions into duration buckets (0-30m, 30-60m, etc.).    |
| 7-Day Rolling Average Energy    | `$setWindowFields` (`partitionBy`, `window`)        | `daily_station_stats`               | `server/repositories/analytics.repository.js` | Computes trailing 7-day smoothing of energy delivery per station.        |
| Materialized Daily Summary      | `$group`, `$merge`                                  | `sessions` -> `daily_station_stats` | `server/repositories/analytics.repository.js` | Materializes daily metrics incrementally into summary collection.        |
| Network Expansion Suggestions   | `$group`, `$lookup`, `$project`                     | `bookings` ⋈ `stations`             | `server/repositories/analytics.repository.js` | Computes booking-to-charger ratio to recommend new deployment corridors. |

---

## 6. Time-Series Engine

| Feature / Workload           | MongoDB Capability                                                           | Target Collection | Code Reference                | Description                                                                           |
| :--------------------------- | :--------------------------------------------------------------------------- | :---------------- | :---------------------------- | :------------------------------------------------------------------------------------ |
| IoT Electrical Sensor Stream | `timeseries: { timeField: 'ts', metaField: 'meta', granularity: 'seconds' }` | `telemetry`       | `server/config/schema.js`     | Columnar compression and time-bucketed storage for voltage, current, and temperature. |
| Sensor Hardware Lookup       | Compound Index `{ "meta.stationId": 1, "meta.chargerId": 1, ts: -1 }`        | `telemetry`       | `server/config/schema.js`     | Fast retrieval of live sensor histories for real-time station diagnostics.            |
| Telemetry Simulation Stream  | `insertMany()` batch generator                                               | `telemetry`       | `server/scripts/simulator.js` | Simulates live EV charging profiles and hardware fault injection.                     |

---

## 7. Multi-Document ACID Transactions

| Business Transaction                 | Engine Feature              | Collections Involved             | Code Reference                              | Description                                                                                    |
| :----------------------------------- | :-------------------------- | :------------------------------- | :------------------------------------------ | :--------------------------------------------------------------------------------------------- |
| Conflict-Free Slot Reservation       | `session.withTransaction()` | `bookings`, `stations`           | `server/repositories/booking.repository.js` | Validates time slot availability and increments `bookingVersion` atomically.                   |
| Session Settlement & Wallet Debit    | `session.withTransaction()` | `sessions`, `users`, `stations`  | `server/repositories/session.repository.js` | Finalizes session, debits driver wallet without dropping below 0, and restores charger status. |
| Station Hard Delete Cascade Check    | `session.withTransaction()` | `stations`, `bookings`, `alerts` | `server/repositories/station.repository.js` | Verifies zero active bookings before performing station purge.                                 |
| ACID Transaction Interactive Sandbox | `session.withTransaction()` | `bookings`, `stations`           | `server/repositories/lab.repository.js`     | Demonstrates atomic commit and automatic rollback upon injected fault.                         |

---

## 8. Real-Time & Change Streams

| Feature / Workload                  | MongoDB Feature          | Target Collection      | Code Reference                     | Description                                                             |
| :---------------------------------- | :----------------------- | :--------------------- | :--------------------------------- | :---------------------------------------------------------------------- |
| Live Station Availability Updates   | `collection.watch()`     | `stations`             | `server/services/sse.service.js`   | Watches station updates with `updateLookup` and emits SSE to browser.   |
| Critical Anomaly Push Notifications | `collection.watch()`     | `alerts`               | `server/services/sse.service.js`   | Watches new alert inserts and pushes real-time alarm events.            |
| Browser Real-Time Event Stream      | Server-Sent Events (SSE) | `/api/realtime/events` | `server/routes/realtime.routes.js` | Delivers real-time events to notification bell and Leaflet map markers. |

---

## 9. Schema Validation & Database Lab Tooling

| Feature / Workload                     | MongoDB Feature                                        | Scope           | Code Reference                          | Description                                                                  |
| :------------------------------------- | :----------------------------------------------------- | :-------------- | :-------------------------------------- | :--------------------------------------------------------------------------- |
| Bengaluru Coordinate Boundary Check    | `$jsonSchema` (tuple array bounds)                     | `stations`      | `server/config/schema.js`               | Validates longitude [77.40, 77.85] and latitude [12.75, 13.20].              |
| Strict Document Validation Enforcement | `validationLevel: "strict", validationAction: "error"` | All collections | `server/config/schema.js`               | Rejects non-conforming writes at database engine level (Error 121).          |
| Query Execution Plan Analysis          | `.explain("executionStats")`                           | Admin DB Lab    | `server/repositories/lab.repository.js` | Evaluates winning stage, totalDocsExamined, totalKeysExamined, and latency.  |
| Side-by-Side Index Benchmark           | `.hint()` vs `.hint({ $natural: 1 })`                  | Admin DB Lab    | `server/repositories/lab.repository.js` | Measures and benchmarks document scanning reduction (IXSCAN vs COLLSCAN).    |
| Schema Validation Sandbox              | Strict Error 121 capture                               | Admin DB Lab    | `server/repositories/lab.repository.js` | Intentionally triggers and captures Error 121 for interactive demonstration. |
| Cluster Storage & Index Inventory      | `db.command({ collStats: ... })`                       | Admin DB Lab    | `server/repositories/lab.repository.js` | Reports document counts, storage footprint, and active index definitions.    |
