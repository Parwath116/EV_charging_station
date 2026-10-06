# VoltGrid Data Model & Schema Design Specification

This document details the MongoDB document architecture for the VoltGrid EV Charging Network Platform (Bengaluru metropolitan grid), explaining the technical rationale and operational trade-offs for embedding versus referencing across all domain entities.

---

## 1. Domain Collections Overview

| Collection            | Role / Domain                                  | Pattern                          | Cardinality Model               |
| :-------------------- | :--------------------------------------------- | :------------------------------- | :------------------------------ |
| `users`               | Drivers, Operators, Network Administrators     | Hybrid Document                  | High Read / Moderate Write      |
| `stations`            | EV Charging Hubs in Bengaluru                  | Hybrid (Embedded Hardware)       | High Read / Moderate Write      |
| `bookings`            | Slot reservations with conflict locks          | Referenced Document              | High Write / High Read          |
| `sessions`            | Metered energy delivery & billing              | Referenced Document              | Write Intensive / High Read     |
| `telemetry`           | Charger IoT electrical & thermal stream        | MongoDB Time-Series Collection   | Extreme Write / Aggregated Read |
| `alerts`              | Hardware anomalies & fault threshold triggers  | Referenced Document              | Event-driven / Partial Indexing |
| `audit_logs`          | Write operations tracking (Operators & Admins) | Append-Only Referenced Document  | Event-driven / TTL Managed      |
| `daily_station_stats` | Pre-computed analytical roll-ups               | Pre-aggregated Output (`$merge`) | Scheduled Batch / High Read     |

---

## 2. Embed vs Reference Architectural Decisions

### 2.1. Vehicles within Users (`users.vehicles[]` — Embedded)

- **Decision:** Embedded Array of Subdocuments.
- **Cardinality:** 1 : 1–4 (A typical EV driver maintains 1 to 3 registered electric vehicles).
- **Rationale:**
  - An EV driver's vehicles are queried whenever the user opens their profile, searches for compatible plugs, or initiates a booking.
  - Embedding eliminates `$lookup` joins on critical driver authentication and booking request flows.
  - Because vehicle counts per driver are strictly bounded, document size remains orders of magnitude below MongoDB's 16MB document limit (~300 bytes added).
- **Trade-off:**
  - If a driver modifies vehicle specs, updates are scoped to array elements via positional operators or `$pull`/`$push`. Cross-user fleet vehicle queries require multikey indexing.

### 2.2. Chargers within Stations (`stations.chargers[]` — Embedded)

- **Decision:** Embedded Array of Subdocuments.
- **Cardinality:** 1 : 2–8 (A physical charging station hosts between 2 and 8 discrete dispensers/guns).
- **Rationale:**
  - Station search results on Leaflet maps display live charger availability per connector type (e.g. CCS2, Type2, CHAdeMO).
  - Updating a charger's operational status (e.g., `available` -> `charging`) occurs atomically in the station document using `$set` with `arrayFilters`.
  - Atomicity guarantees that station aggregate status and individual charger states remain strictly consistent without cross-collection distributed locking.
- **Trade-off:**
  - Concurrent status updates to multiple chargers within the same station document compete for document-level write locks. In MongoDB WiredTiger, document concurrency handles dozens of writes/sec per station without contention.

### 2.3. Amenities within Stations (`stations.amenities[]` — Embedded)

- **Decision:** Embedded Array of Strings.
- **Cardinality:** 1 : 2–10.
- **Rationale:**
  - Amenities (e.g., "WiFi", "Restrooms", "EV Lounge", "Cafe") are static tags queried for filtration and full-text search.
  - Multikey text indexing on `amenities` allows instant keyword filtering without relational lookup tables.

### 2.4. Bookings (`bookings` — Referenced Collection)

- **Decision:** Independent Referenced Collection referencing `userId` and `stationId` via `ObjectId`.
- **Cardinality:** 1 : N (Unbounded growth over time).
- **Rationale:**
  - Embedding bookings inside `stations` or `users` would violate the anti-pattern of unbounded array growth, leading to document fragmentation, continuous re-allocation, and 16MB breach.
  - Booking slot validation requires scanning across time intervals (`startTime` to `endTime`) for a specific `chargerId`. A dedicated collection with compound index `{ stationId: 1, chargerId: 1, startTime: 1, endTime: 1 }` enables sub-millisecond slot conflict detection.
  - Isolation allows independent archiving, partitioning, and strict write transactions.

### 2.5. Charging Sessions (`sessions` — Referenced Collection)

- **Decision:** Independent Referenced Collection referencing `userId` and `stationId` via `ObjectId`.
- **Cardinality:** 1 : N (Millions of sessions over platform lifecycle).
- **Rationale:**
  - Charging sessions contain metered energy delivery (`energyKWh`), financial costs, timestamps, and payment statuses.
  - Session completion performs transactional wallet balance updates (`$inc` on `users.walletBalance`) and status transitions.
  - Analytical pipelines (e.g. `$facet`, `$bucket`, `$setWindowFields`) aggregate over sessions without inflating station document footprints.

### 2.6. Telemetry (`telemetry` — Native Time-Series Collection)

- **Decision:** Dedicated MongoDB 7 Time-Series Collection (`timeField: "ts"`, `metaField: "meta"`).
- **Cardinality:** Thousands of readings per minute across network hardware.
- **Rationale:**
  - Native MongoDB time-series collections utilize columnar compression algorithms, reducing disk storage by 70–85% compared to standard collections.
  - Data is organized internally into time-bucketed documents ordered by `ts`.
  - Built-in `expireAfterSeconds: 2592000` automatically discards raw high-frequency telemetry older than 30 days without scheduled cron jobs.

### 2.7. Alerts (`alerts` — Referenced Collection)

- **Decision:** Independent Collection with Partial Indexing and TTL.
- **Cardinality:** Event-driven stream.
- **Rationale:**
  - Alerts are generated asynchronously by the anomaly detection engine.
  - Filtered by operators via `{ acknowledged: false }`. Using a partial index `{ stationId: 1, createdAt: -1 }` on `acknowledged: false` guarantees that only active issues reside in RAM.
  - Expired alerts are purged automatically via a 30-day TTL index.

### 2.8. Audit Logs (`audit_logs` — Referenced Collection)

- **Decision:** Append-Only Collection with TTL.
- **Cardinality:** Every administrative and operational mutation produces an entry.
- **Rationale:**
  - Stores `before` and `after` snapshots for compliance and traceability.
  - Retention is enforced via a 90-day TTL index on `ts`.

### 2.9. Daily Station Stats (`daily_station_stats` — Pre-aggregated Collection)

- **Decision:** Materialized Summary Collection populated via `$merge`.
- **Cardinality:** 1 document per station per day.
- **Rationale:**
  - Prevents resource-heavy ad-hoc aggregations over millions of historical session rows when loading executive dashboards.

---

## 3. Schema Validation & Geographic Constraints

MongoDB `$jsonSchema` validators are enforced with `validationLevel: "strict"` and `validationAction: "error"`.

### Bengaluru Metropolitan Bounding Box

Geospatial coordinates for stations must fall strictly within Greater Bengaluru bounds:

- **Longitude:** `77.4000° E` to `77.8500° E`
- **Latitude:** `12.7500° N` to `13.2000° N`

Enforced in collection validator:

```json
"location": {
  "bsonType": "object",
  "required": ["type", "coordinates"],
  "properties": {
    "type": { "enum": ["Point"] },
    "coordinates": {
      "bsonType": "array",
      "minItems": 2,
      "maxItems": 2,
      "items": [
        { "bsonType": ["double", "int"], "minimum": 77.40, "maximum": 77.85 },
        { "bsonType": ["double", "int"], "minimum": 12.75, "maximum": 13.20 }
      ]
    }
  }
}
```

---

## 4. Index Catalog & Execution Strategy

| Collection            | Index Name                               | Key Specification                                                    | Type               | Rationale                                                                     |
| :-------------------- | :--------------------------------------- | :------------------------------------------------------------------- | :----------------- | :---------------------------------------------------------------------------- |
| `users`               | `idx_users_email_unique`                 | `{ email: 1 }`                                                       | Unique             | Enforces single account per email.                                            |
| `users`               | `idx_users_role_createdAt`               | `{ role: 1, createdAt: -1 }`                                         | Compound           | Fast admin user filtering by role.                                            |
| `stations`            | `idx_stations_location_2dsphere`         | `{ location: "2dsphere" }`                                           | 2dsphere           | Enables `$near`, `$geoNear`, and `$geoWithin`.                                |
| `stations`            | `idx_stations_text_search`               | `{ name: "text", address: "text", area: "text", amenities: "text" }` | Text               | Sub-string and keyword searching on catalog.                                  |
| `stations`            | `idx_stations_area_status`               | `{ area: 1, status: 1 }`                                             | Compound           | Area-based filtering for drivers.                                             |
| `stations`            | `idx_stations_active_tariff_partial`     | `{ status: 1, tariffPerKWh: 1 }`                                     | Partial            | Indexes only `status: "active"` stations for pricing queries.                 |
| `stations`            | `idx_stations_chargers_chargerId_unique` | `{ "chargers.chargerId": 1 }`                                        | Unique Multikey    | Enforces global uniqueness of charger serial identifiers across all stations. |
| `bookings`            | `idx_bookings_slot_conflict`             | `{ stationId: 1, chargerId: 1, startTime: 1, endTime: 1 }`           | Compound           | Instant booking collision detection.                                          |
| `bookings`            | `idx_bookings_user_history`              | `{ userId: 1, startTime: -1 }`                                       | Compound           | Driver booking history pagination.                                            |
| `bookings`            | `idx_bookings_active_slots_partial`      | `{ status: 1, startTime: 1 }`                                        | Partial            | High-speed lookup for active (`pending`, `confirmed`) slots.                  |
| `sessions`            | `idx_sessions_user_timeline`             | `{ userId: 1, startedAt: -1 }`                                       | Compound           | Driver charging logs.                                                         |
| `sessions`            | `idx_sessions_station_timeline`          | `{ stationId: 1, startedAt: -1 }`                                    | Compound           | Station performance queries.                                                  |
| `alerts`              | `idx_alerts_unack_partial`               | `{ stationId: 1, createdAt: -1 }`                                    | Partial            | Fast operator dashboard queue for unacknowledged alerts.                      |
| `alerts`              | `idx_alerts_ttl_30d`                     | `{ createdAt: 1 }`                                                   | TTL                | Automatic purge after 30 days (`expireAfterSeconds: 2592000`).                |
| `audit_logs`          | `idx_audit_ttl_90d`                      | `{ ts: 1 }`                                                          | TTL                | Automatic compliance purge after 90 days (`expireAfterSeconds: 7776000`).     |
| `daily_station_stats` | `idx_stats_station_date_unique`          | `{ stationId: 1, date: 1 }`                                          | Unique             | Idempotency for scheduled `$merge` aggregation pipeline.                      |
| `telemetry`           | `idx_telemetry_meta_ts`                  | `{ "meta.stationId": 1, "meta.chargerId": 1, ts: -1 }`               | Compound Secondary | Fast range queries for charger telemetry charts.                              |
