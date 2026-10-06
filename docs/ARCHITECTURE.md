# VoltGrid System Architecture & Engineering Trade-Offs

VoltGrid is an enterprise EV charging network platform engineered for the Bengaluru metropolitan region. It provides real-time geospatial discovery, conflict-free slot reservations, automated billing with atomic wallet debiting, IoT sensor streaming into columnar time-series collections, and diagnostic database tooling.

---

## 1. High-Level Component Topology

```
+---------------------------------------------------------------------------------+
|                                 Client Tier                                     |
|    - Vanilla ES6+ Single-Page Architecture (Zero Framework Overhead)             |
|    - Hash Router (#/map, #/stations, #/bookings, #/sessions, #/analytics, #/dblab)|
|    - Reactive State Store with Observer Pattern (state.js)                      |
|    - Server-Sent Events (SSE) Subscriber (notifications.js)                     |
|    - Leaflet 1.9.4 Geospatial Canvas (Bengaluru WGS84 Bounds)                   |
+----------------------------------------+----------------------------------------+
                                         |
                            HTTP/1.1 REST| SSE Streams
                                         v
+---------------------------------------------------------------------------------+
|                              Node.js API Tier                                   |
|    - Express 4.21 ES Modules (Strict Commercial Engineering Tone)               |
|    - Layered Onion Architecture: Routes -> Controllers -> Services -> Repositories|
|    - Security Layer: Helmet (CSP), CORS, SameSite Cookies, CSRF Guard, RateLimit|
|    - Input Boundary Validation: Zod 3.24 (Type-Safe Parameter Sanitization)     |
|    - Telemetry Ingestion Simulator & Autonomous Fault Detector                  |
+----------------------------------------+----------------------------------------+
                                         |
                            Official MongoDB Driver (v6.13)
                            Connection Pooling (5-50 sockets)
                                         v
+---------------------------------------------------------------------------------+
|                       MongoDB 7+ Database Cluster (rs0)                         |
|    - Standard Collections ($jsonSchema Strictly Enforced)                       |
|        * stations (2dsphere geospatial, multikey unique, text search)           |
|        * bookings (Partial indexing, slot conflict detection)                   |
|        * sessions (Temporal compound indexes, payment accounting)               |
|        * users (Unique email, embedded vehicle arrays, atomic balance)          |
|        * alerts (Partial unack index, TTL 30d auto-purge)                       |
|        * audit_logs (Regulatory immutable audit trail, TTL 90d)                 |
|    - Native Time-Series Engine                                                  |
|        * telemetry (Columnar compression, seconds granularity, TTL 30d)         |
|    - Materialized Summary Collection                                            |
|        * daily_station_stats (Aggregated roll-ups via $merge)                   |
|    - Distributed Multi-Document ACID Transactions (Snapshot Isolation)          |
|    - Real-Time Change Streams (collection.watch() on stations & alerts)         |
+---------------------------------------------------------------------------------+
```

---

## 2. Deliberate Architectural Decisions & Trade-Offs

### 2.1 Official MongoDB Driver vs Mongoose ORM

- **Decision**: Adopt the official `mongodb` Node.js driver directly (version 6.13+) with zero Object Document Mapper (ODM) abstraction layers.
- **Rationale**:
  - Direct access to advanced MongoDB 7+ engine primitives: Native Time-Series collections, `$setWindowFields`, `$facet`, `$bucket`, `$merge`, Change Streams, and multi-document ACID transactions with snapshot isolation.
  - Mongoose introduces substantial object wrapping, casting overhead, and hidden middleware hooks that obscure index hint evaluation and explain plans.
  - Schema integrity is maintained deterministically in the database engine itself via server-side `$jsonSchema` validators and strict validation actions (`validationAction: 'error'`), guaranteeing that malformed data is rejected regardless of ingestion path (REST API, batch scripts, or direct imports).
- **Trade-off**: Requires explicit repository abstraction and manual ObjectId conversion, which was resolved by implementing clean, reusable repository classes.

### 2.2 Time-Series Collections for IoT Sensor Telemetry

- **Decision**: Deploy a dedicated MongoDB Time-Series collection (`telemetry`) with `timeField: 'ts'`, `metaField: 'meta'`, and `granularity: 'seconds'`.
- **Rationale**:
  - EV fast charging involves high-frequency sensor readings (voltage, current, power, temperature, SoC) streamed every few seconds per bay.
  - MongoDB's columnar time-series engine automatically buckets measurements into optimized, compressed internal BSON blocks, reducing storage footprint by up to 70% compared to standard document collections.
  - Native retention policies configured via `expireAfterSeconds: 2592000` (30 days) automatically prune historical measurements without running external cron jobs or delete scripts.
- **Trade-off**: Time-series collections prohibit arbitrary document updates and transactions, which aligns with append-only sensor telemetry.

### 2.3 Write-Skew Elimination via Optimistic Concurrency Locking

- **Decision**: Combine multi-document ACID transactions with an atomic `$inc` on `chargers.bookingVersion` inside the reservation transaction.
- **Rationale**:
  - Standard transactional overlap queries (`$gte startTime` and `$lte endTime`) run under snapshot isolation. When two parallel requests attempt to reserve the same slot concurrently, both see an empty slot and commit, causing write skew.
  - Incrementing a version counter (`bookingVersion`) on the target charger subdocument forces a write lock on the same document within the transaction. If two transactions attempt to write concurrently, MongoDB automatically detects the write conflict, commits exactly one transaction, and aborts the second with a retryable or 409 conflict error.
- **Trade-off**: Minor lock contention under extreme booking surges for the exact same physical dispenser, which is the exact behavioral invariant required by physical hardware.

### 2.4 Server-Sent Events (SSE) & Change Streams vs WebSockets

- **Decision**: Implement unidirectional Server-Sent Events (`/api/realtime/events`) paired with MongoDB Change Streams (`collection.watch()`).
- **Rationale**:
  - Charger availability and hardware anomaly alerts are unidirectional push events (server to browser).
  - SSE operates over standard HTTP/1.1 or HTTP/2, requires zero custom protocol handshakes, works seamlessly through standard corporate proxies and firewalls, and includes automatic native browser reconnection.
  - MongoDB Change Streams tail the cluster oplog reactively, meaning UI clients update instantly upon database state transitions, completely removing the need for polling.
- **Trade-off**: SSE does not support binary payloads or client-to-server messaging, which is unnecessary since client mutations occur via REST endpoints.

### 2.5 Deterministic Geospatial Modeling Locked to Bengaluru Bounds

- **Decision**: Enforce a strict geographic bounding box in a single shared configuration constant (`server/config/constants.js`) utilized across schema `$jsonSchema`, Zod request validators, seed data generators, and frontend Leaflet bounds.
- **Bounding Box**: Longitude `[77.40, 77.85]`, Latitude `[12.75, 13.20]`.
- **Rationale**:
  - Prevents malformed GPS coordinates (e.g. inverted [lat, lng] instead of GeoJSON standard [lng, lat]) from corrupting 2dsphere indexes.
  - Guarantees that map viewport calculations and `$near` proximity searches return predictable, bounded responses.

### 2.6 Daily Aggregation Roll-up Materialization via `$merge`

- **Decision**: Materialize diurnal metrics into `daily_station_stats` using an aggregation pipeline terminating in `$merge`.
- **Rationale**:
  - Running analytics across hundreds of thousands of historical charging sessions on every dashboard visit is computationally wasteful.
  - The `$merge` stage incrementally computes daily revenue, session volume, and peak load per station, storing them in a dedicated collection with a unique compound index `{ stationId: 1, date: 1 }`.
  - Trailing 7-day smoothing queries utilize `$setWindowFields` directly over the pre-aggregated summary collection, executing in under 20 milliseconds.

### 2.7 Zero-Framework Frontend Architecture

- **Decision**: Build the client as a dependency-free vanilla JavaScript Single-Page Application (ES6 modules, CSS Custom Properties, Leaflet, and Chart.js).
- **Rationale**:
  - Eliminates bundler bloat, build steps, and hydration delays.
  - Ensures fast page loads and inspectability.
  - Accessible by design: includes keyboard shortcuts (`Ctrl+K` command palette, `?` shortcuts dialog), cookie consent management, theme persistence, and `prefers-reduced-motion` compliance.

---

## 3. Security, RBAC & Defensive Engineering

- **Role-Based Access Control**:
  - `driver`: Search stations, book reservations, initiate/terminate charging sessions, top up personal wallet, manage vehicles and favourite stations.
  - `operator`: Station maintenance, tariff updates, bulk uploads, operational alert management, real-time telemetry monitoring.
  - `admin`: Network governance, database lab diagnostics, index benchmarking, explain plan execution, field maintenance, compliance audit log review.
- **Defensive Query Construction**:
  - Every incoming request is parsed and sanitized by Zod schemas prior to hitting repositories.
  - Query parameters are passed strictly as structured BSON objects to the driver; zero raw string interpolation or eval is permitted.
- **HTTP Security Posture**:
  - Helmet: Strict Content Security Policy (CSP), X-Frame-Options, X-Content-Type-Options.
  - Cookies: JWT session tokens are stored in `HttpOnly`, `SameSite: Lax` cookies.
  - CSRF Defense: Custom middleware verifies `Sec-Fetch-Site` and rejects unauthenticated cross-site mutations.

---

## 4. Operational Maintenance & Database Tooling

| NPM Script          | Execution Target              | Purpose                                                                  |
| :------------------ | :---------------------------- | :----------------------------------------------------------------------- |
| `npm run dev`       | `server/server.js`            | Starts server with nodemon for hot-reloading development.                |
| `npm run start`     | `server/server.js`            | Starts production HTTP server.                                           |
| `npm run seed`      | `server/scripts/seed.js`      | Populates database deterministically using seeded PRNG.                  |
| `npm run reset`     | `server/scripts/reset.js`     | Purges all collections (safeguarded to localhost unless `--force`).      |
| `npm run indexes`   | `server/scripts/indexes.js`   | Idempotently verifies and reconstructs all cluster indexes.              |
| `npm run db:verify` | `server/scripts/verifyDb.js`  | Prints collection sizes, index inventories, and `$near` IXSCAN evidence. |
| `npm run simulator` | `server/scripts/simulator.js` | Real-time IoT hardware telemetry simulator with anomaly injection.       |
| `npm test`          | Node.js Test Runner           | Executes complete end-to-end integration test suite.                     |
| `npm run lint`      | ESLint 9                      | Validates code standards and catches unused variables.                   |
| `npm run format`    | Prettier 3                    | Enforces code formatting.                                                |
