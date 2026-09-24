# Cement Company — Order Fulfilment & Inventory Management System

Full spec: [`development.md`](development.md) (build-ready, supersedes `requirement.md` where noted).

## Folder structure

```
AI_Inventry/
├── db/                          Stage 1/2/4 artifacts — schema, seed data, stored procedures
│   ├── schema.sql
│   ├── seed.sql
│   ├── procs/
│   │   ├── sp_TryAllocateInventory_selvalakshmi.sql
│   │   ├── sp_SubmitOrder_selvalakshmi.sql
│   │   └── sp_GetFulfilment_selvalakshmi.sql
│   └── README.md
├── backend/                     Express + TS API layer, Fulfilment Engine, data access
│   └── src/
│       ├── engine/              Pure fulfilment decision logic (no HTTP/DB import) + unit tests
│       ├── repositories/        Parameterised SQL / stored-procedure calls
│       ├── services/            Validation, orchestration (idempotency, concurrency retry), response mapping
│       ├── routes/               REST endpoints (§7)
│       ├── config/db.ts         MSSQL connection pool (env-driven, NFR-06)
│       ├── app.ts / server.ts
├── frontend/                    React + TS UI (Vite)
│   └── src/
│       ├── pages/               Submit Order, Fulfilment Lookup, Orders List, Inventory View
│       ├── api/client.ts        Typed fetch wrapper for the backend API
│       └── types/api.ts
└── test-results.md              Stage 7 sign-off (§10 scenario matrix)
```

## Running it

### 1. Database (Stage 1/2/4)

Apply against the existing `IDBTesting` database (see `db/README.md` for exact commands):

```
db/schema.sql
db/seed.sql
db/procs/sp_TryAllocateInventory_selvalakshmi.sql
db/procs/sp_SubmitOrder_selvalakshmi.sql
db/procs/sp_GetFulfilment_selvalakshmi.sql
```

### 2. Backend

```
cd backend
npm install
cp .env.example .env      # fill in DB_* vars, or rely on MSSQL_CONNECTION_STRING from .mcp.json
npm run test              # Fulfilment Engine unit tests (T-01–T-10, T-19)
npm run dev                # http://localhost:4000
```

### 3. Frontend

```
cd frontend
npm install
cp .env.example .env      # VITE_API_BASE_URL, defaults to http://localhost:4000/api
npm run dev                # http://localhost:5173
```

## Key design points (see `development.md` for full rationale)

- **Single-warehouse fulfilment only** — an order is satisfied entirely from one warehouse (WH-A → WH-B → WH-C priority) or blocked. No splitting.
- **No transit-day addition** — `expected_delivery_date` equals the selected warehouse's `earliest_dispatch_date`.
- **Fulfilment Engine is pure TypeScript** (`backend/src/engine/fulfilmentEngine.ts`) — no HTTP or DB imports, fully unit-testable.
- **Concurrency safety (NFR-02)** — `sp_TryAllocateInventory_selvalakshmi` deducts stock under a row lock inside `sp_SubmitOrder_selvalakshmi`'s single transaction; if a warehouse loses the stock race, the whole transaction (including the order header) rolls back and the backend orchestration (`services/orderService.ts`) retries warehouse selection against fresh inventory.
- **All application DB objects are suffixed `_selvalakshmi`.**
