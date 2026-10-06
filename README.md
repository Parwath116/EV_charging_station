# VoltGrid: EV Charging Network Platform (Bengaluru)

VoltGrid is a production-scale EV charging network management platform designed for the metropolitan Bengaluru charging grid. It enables drivers to discover and reserve charging stations, operators to monitor hardware telemetry and manage tariffs, and network administrators to supervise grid health, billing settlements, and load analytics.

---

## Technical Architecture

- **Runtime & API Gateway:** Node.js (v20+) with Express (ES Modules)
- **Database Engine:** MongoDB 7+ with Single-Node Replica Set (`rs0`) for Multi-Document ACID Transactions & Change Streams
- **Database Driver:** Official MongoDB Node Driver (`mongodb` v6) — zero abstraction layer, raw driver execution
- **Validation & Security:** Zod schema validation, Helmet security headers, CORS origin isolation, HttpOnly JWT cookies, Rate Limiting
- **Real-Time Layer:** Server-Sent Events (SSE) fed by MongoDB Change Streams
- **Frontend Architecture:** Vanilla ES Modules with hash-based client routing, Leaflet with OpenStreetMap tiles, and Chart.js

---

## Port Allocation & Network Topology

| Service                 | Port    | Configuration Key                                    | Notes                                                                                                   |
| :---------------------- | :------ | :--------------------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| **VoltGrid Web & API**  | `5173`  | `PORT`                                               | Configurable in `.env`. **Port 3000 is strictly reserved and blocked by internal policy.**              |
| **MongoDB Host Port**   | `27018` | `MONGODB_URI`                                        | Mapped to container port `27017` to avoid colliding with any default local MongoDB instance on `27017`. |
| **MongoDB Replica Set** | `rs0`   | Query param: `?replicaSet=rs0&directConnection=true` | Enabled for Change Stream and Transaction support.                                                      |

> **Port Conflict Detection:** If the configured `PORT` is occupied, the server aborts initialization immediately with an explicit log message identifying the contested port.

---

## Directory Structure

```text
voltgrid/
├── client/                     # Vanilla ES Modules Frontend
│   ├── css/
│   │   └── style.css           # Design tokens, variables & responsive styling
│   ├── js/
│   │   └── main.js             # Client bootstrap & status monitor
│   └── index.html              # Core application shell & viewport configuration
├── server/                     # Backend API & Gateway Service
│   ├── app.js                  # Express middleware pipeline, security & static delivery
│   ├── server.js               # HTTP listener, lifecycle hooks & port conflict handler
│   ├── config/
│   │   ├── db.js               # Official MongoDB driver connection pool & replica set health
│   │   └── env.js              # Zod environment variable parsing & validation
│   ├── controllers/            # Request handlers
│   ├── middleware/             # Error handling, request logging, rate-limiting & auth
│   │   ├── errorHandler.js     # Centralized operational error & Mongo error translator
│   │   └── requestLogger.js    # Structured latency & status logging
│   ├── repositories/           # Isolated MongoDB driver data-access layer
│   ├── routes/                 # Express API route modules
│   │   ├── api.routes.js       # Central API router
│   │   └── health.routes.js    # /api/health probe
│   ├── services/               # Core business logic
│   └── utils/
│       ├── errors.js           # Domain error classes
│       └── logger.js           # Structured console logger
├── docs/                       # Architecture & design specifications
│   ├── ARCHITECTURE.md         # Engineering decisions and architectural trade-offs
│   ├── FEATURE_MAP.md          # MongoDB capability mapping matrix
│   └── SCHEMA_DESIGN.md        # Document schemas, embed vs reference trade-offs
├── tests/                      # Automated test suites
│   └── health.test.js          # API health probe validation tests
├── docker-compose.yml          # Single-node replica set MongoDB 7 service
├── .env.example                # Template configuration
├── .env                        # Local development environment configuration
├── package.json                # Project manifest and scripts
└── README.md                   # Platform documentation
```

---

## Prerequisites

- **Node.js**: v20.0.0 or higher
- **Docker & Docker Compose**: v2.20+ (for containerized MongoDB replica set)
- _(Optional)_ Alternatively, a **MongoDB Atlas** cluster connection string.

---

## Quickstart Guide

### 1. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Ensure `PORT` is set to `5173` (or an open port of your choice, never `3000`).

### 2. Launch MongoDB Replica Set

Start the containerized MongoDB instance on port `27018`:

```bash
docker compose up -d
```

Verify the container is healthy:

```bash
docker compose ps
```

The service initializes a single-node replica set (`rs0`) required for multi-document ACID transactions and change stream events.

### 3. Install Dependencies & Run

```bash
npm install
npm run dev
```

### 4. Verify System Health

Open the platform dashboard in your browser:

- Client Dashboard: [http://localhost:5173](http://localhost:5173)
- Direct Health Probe: [http://localhost:5173/api/health](http://localhost:5173/api/health)

Sample `/api/health` response:

```json
{
  "status": "ok",
  "service": "VoltGrid EV Network API",
  "version": "1.0.0",
  "timestamp": "2026-10-06T16:50:00.000Z",
  "uptimeSeconds": 14,
  "environment": "development",
  "port": 5173,
  "database": {
    "connected": true,
    "status": "healthy",
    "database": "voltgrid",
    "replicaSet": "rs0",
    "isWritablePrimary": true,
    "latencyMs": 2
  }
}
```

---

## Demo Accounts

The database seed generates realistic accounts for each platform role:

| Role                     | Email Address                            | Default Password | Scope of Access                                                             |
| :----------------------- | :--------------------------------------- | :--------------- | :-------------------------------------------------------------------------- |
| **System Administrator** | `admin@voltgrid.internal`                | `VoltGrid#2026`  | Full platform control, Database Lab, audit log inspection, user governance  |
| **Station Operator**     | `operator.whitefield@voltgrid.internal`  | `VoltGrid#2026`  | Station editing, charger lifecycle, tariff tuning, maintenance alerts       |
| **EV Driver**            | `driver.aarav.mehta.1@voltgrid.internal` | `VoltGrid#2026`  | Station map discovery, slot reservations, charging sessions, wallet balance |

> **Security Notice:** The shared seed password (`VoltGrid#2026`) is exclusively intended for local development and demonstration purposes.

---

## Available NPM Scripts

- `npm run dev`: Starts the API server with nodemon hot reloading.
- `npm run start`: Starts the API server in production mode.
- `npm run seed`: Generates deterministic Bengaluru dataset (16 stations, 60 users, 560+ bookings, 2,200+ sessions, 3,500+ telemetry points).
- `npm run reset`: Wipes non-system collections and re-applies schema validators and indexes (requires `--force` if not local).
- `npm run indexes`: Idempotently applies and ensures all indexes across collections without modifying document data.
- `npm run db:verify`: Inspects document counts, validates index catalogs, and outputs `explain("executionStats")` for 2dsphere queries.
- `npm run simulator`: Streams live IoT sensor telemetry into the time-series collection with anomaly fault injection.
- `npm test`: Executes the automated integration test suite across all 8 test modules.
- `npm run lint`: Validates source code against ESLint rules.
- `npm run format`: Formats codebase with Prettier.
- `npm run format:check`: Validates formatting consistency.

---

## API & Platform Tooling

- **Interactive Database Lab**: Admin-only diagnostic sandbox located at `#/dblab` providing `.explain("executionStats")` plans, side-by-side IXSCAN vs COLLSCAN benchmarks, Error 121 schema validation triggers, and ACID transaction rollback simulations.
- **REST Client Executable Spec**: Complete API collection formatted in standard RFC-7230 syntax available in [`voltgrid.http`](./voltgrid.http).
- **Engineering Documentation**:
  - [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md): System topology, technical justifications, and engineering trade-offs.
  - [`docs/FEATURE_MAP.md`](./docs/FEATURE_MAP.md): MongoDB engine capability and operator mapping matrix.
  - [`docs/SCHEMA_DESIGN.md`](./docs/SCHEMA_DESIGN.md): BSON schemas, embedding vs referencing decisions, index catalog, and bounds.
