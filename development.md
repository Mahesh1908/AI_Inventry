# Cement Company — Order Fulfilment & Inventory Management System

**Development Specification (build-ready, supersedes requirement.md where noted)**

| Field         | Value                                                                              |
| ------------- | ---------------------------------------------------------------------------------- |
| Document      | development.md                                                                     |
| Version       | 1.0                                                                                |
| Date          | 2026-09-24                                                                         |
| Author        | Mahesh Selvalakshmi (maheshslm@ramcocements.co.in)                                 |
| Base document | requirement.md v1.0                                                                |
| Status        | Final for development — every open point from requirement.md §11 is resolved below |

This document exists because two of your clarifications change the core fulfilment algorithm described in `requirement.md`:

1. **Single-warehouse fulfilment only** — the requested quantity must come entirely from **one** warehouse. Warehouses are never combined to cover a shortfall. This replaces `requirement.md` §6.6's split-allocation rule.
2. **No transit-day addition** — the selected warehouse's `earliest_dispatch_date` is compared **directly** to `promised_delivery_date`. `TRANSIT_DAYS` is **not used** anywhere in this release.

Everything below reflects these two changes. Sections not mentioning a change are carried over from `requirement.md` unchanged.

---

## 1. Architecture Overview

```
┌────────────────────┐      REST/JSON       ┌──────────────────────────┐
│  React + TS UI      │ ───────────────────► │  Express + TS API layer   │
│  (Submit / Lookup /  │ ◄─────────────────── │  (routes, validation)     │
│   List / Inventory)  │                       └────────────┬─────────────┘
└────────────────────┘                                     │ calls
                                                             ▼
                                                ┌──────────────────────────┐
                                                │  Fulfilment Engine        │
                                                │  (pure, no HTTP/DB import)│
                                                │  eligibility → stock →    │
                                                │  warehouse-selection      │
                                                └────────────┬─────────────┘
                                                             │ via repository interfaces
                                                             ▼
                                                ┌──────────────────────────┐
                                                │  Data Access Layer        │
                                                │  parameterised SQL +      │
                                                │  stored procedures        │
                                                └────────────┬─────────────┘
                                                             ▼
                                                ┌──────────────────────────┐
                                                │  MSSQL — IDBTesting DB    │
                                                │  (local server, via MCP)  │
                                                └──────────────────────────┘
```

The Fulfilment Engine has **no** dependency on Express or the SQL client — it is given plain data (customer record, inventory rows, order) and returns a decision object. This satisfies NFR-08 and keeps customer-type rules (deferred, §6.3) addable later without touching routes or the DB layer.

---

## 2. Environment & Database Target

Resolved (was open point O-03 in `requirement.md`):

| Setting    | Value                                                                                                                                          | Source                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Server     | `172.16.1.173,54321`                                                                                                                           | `.mcp.json` → `local-sqlserver` MCP server |
| Database   | `IDBTesting`                                                                                                                                   | `.mcp.json`                                |
| Connection | Read from environment variables at runtime (`MSSQL_CONNECTION_STRING` or equivalent discrete vars) — **never hardcoded in source**, per NFR-06 | `.mcp.json` already externalises it        |

The application does **not** create a new database — `IDBTesting` already exists on the local server. Schema objects are created **inside** that existing database.

`TRANSIT_DAYS` config entry from `requirement.md` §5 is **removed** — it has no role in this release's date check (see §6.2 below).

---

## 3. Database Object Naming Convention

**Every table and stored procedure created for this application ends with the suffix `_selvalakshmi`.** This distinguishes application objects from anything else already in the shared `IDBTesting` database.

### 3.1 Tables

| Table                          | Purpose                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `Customer_selvalakshmi`        | Customer master                                                                                  |
| `Product_selvalakshmi`         | Product master                                                                                   |
| `Warehouse_selvalakshmi`       | Warehouse master (WH-A, WH-B, WH-C)                                                              |
| `Inventory_selvalakshmi`       | Stock + earliest dispatch date per product per warehouse                                         |
| `OrderHeader_selvalakshmi`     | Submitted order as received                                                                      |
| `OrderFulfilment_selvalakshmi` | Fulfilment decision, including the selected warehouse and allocated quantity for released orders |

**Design decision — no separate allocation table.** `requirement.md` §4.8 defined `OrderAllocation` as a one-to-many table because an order could be split across warehouses. Since an order is now satisfied by exactly **one** warehouse or not at all, that table would only ever hold zero or one row per order. It is folded directly into `OrderFulfilment_selvalakshmi` as `selected_warehouse_id`, `allocated_quantity`, and `warehouse_dispatch_date` columns. This is a schema simplification only — every value the original design captured is still stored, just without an unnecessary join.

### 3.2 Stored procedures

| Procedure                              | Purpose                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sp_TryAllocateInventory_selvalakshmi` | Atomically checks and deducts stock for **one specific** `(product_id, warehouse_id)` under a row lock, so two concurrent orders cannot oversell the same warehouse's stock (NFR-02). Returns success/failure; does not decide _which_ warehouse to try — that decision is made by the Fulfilment Engine in the app layer. |
| `sp_SubmitOrder_selvalakshmi`          | Wraps the full release transaction — insert `OrderHeader`, call `sp_TryAllocateInventory_selvalakshmi`, insert `OrderFulfilment` — in a single transaction (FR-07 / NFR-01).                                                                                                                                               |
| `sp_GetFulfilment_selvalakshmi`        | Retrieves the stored fulfilment result (with order + warehouse detail) for a given `order_id`.                                                                                                                                                                                                                             |

Business rules (eligibility check, which warehouse to try, in what order, whether the date is met) live in the **TypeScript Fulfilment Engine**, not in T-SQL — this keeps the decision logic unit-testable and independently extensible (NFR-08). The stored procedures only do the parts that must be atomic at the database level (the stock deduction) and the parts that are pure persistence.

---

## 4. Data Model

### 4.1 `Customer_selvalakshmi`

| Column            | Type         | Constraints           | Notes                       |
| ----------------- | ------------ | --------------------- | --------------------------- |
| `customer_id`     | VARCHAR(20)  | PK                    | e.g. `CUST-001`             |
| `customer_name`   | VARCHAR(100) | NULL                  | Display only                |
| `eligible_status` | VARCHAR(20)  | NOT NULL              | `ELIGIBLE` / `NOT_ELIGIBLE` |
| `created_at`      | DATETIME2    | NOT NULL, default now |                             |
| `updated_at`      | DATETIME2    | NOT NULL, default now |                             |

### 4.2 `Product_selvalakshmi`

| Column         | Type         | Constraints         | Notes            |
| -------------- | ------------ | ------------------- | ---------------- |
| `product_id`   | VARCHAR(20)  | PK                  | e.g. `PRD-OPC53` |
| `product_name` | VARCHAR(100) | NOT NULL            |                  |
| `uom`          | VARCHAR(10)  | NOT NULL            | e.g. `BAG`, `MT` |
| `is_active`    | BIT          | NOT NULL, default 1 |                  |

### 4.3 `Warehouse_selvalakshmi`

| Column           | Type         | Constraints         | Notes                             |
| ---------------- | ------------ | ------------------- | --------------------------------- |
| `warehouse_id`   | VARCHAR(10)  | PK                  | Fixed set: `WH-A`, `WH-B`, `WH-C` |
| `warehouse_name` | VARCHAR(100) | NOT NULL            |                                   |
| `location`       | VARCHAR(100) | NULL                |                                   |
| `is_active`      | BIT          | NOT NULL, default 1 |                                   |

### 4.4 `Inventory_selvalakshmi`

| Column                   | Type          | Constraints                    | Notes                                                                                                     |
| ------------------------ | ------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `product_id`             | VARCHAR(20)   | PK (composite), FK → Product   |                                                                                                           |
| `warehouse_id`           | VARCHAR(10)   | PK (composite), FK → Warehouse |                                                                                                           |
| `available_quantity`     | DECIMAL(18,3) | NOT NULL, CHECK >= 0           | Free-to-promise quantity. 3-decimal precision kept as-is; **no rounding anywhere**, per your instruction. |
| `earliest_dispatch_date` | DATE          | NOT NULL                       |                                                                                                           |
| `updated_at`             | DATETIME2     | NOT NULL                       |                                                                                                           |

PK: `(product_id, warehouse_id)`.

### 4.5 `OrderHeader_selvalakshmi`

| Column                   | Type          | Constraints           | Notes                                                             |
| ------------------------ | ------------- | --------------------- | ----------------------------------------------------------------- |
| `order_id`               | VARCHAR(30)   | PK                    | Client-supplied or system-generated `ORD-<sequence>`              |
| `customer_id`            | VARCHAR(20)   | NOT NULL              | Not FK-enforced — unknown customers must still persist as blocked |
| `customer_type`          | VARCHAR(20)   | NULL                  | Stored only, no logic (unchanged from requirement.md §6.3)        |
| `product_id`             | VARCHAR(20)   | NOT NULL              | Not FK-enforced, same reasoning                                   |
| `quantity`               | DECIMAL(18,3) | NOT NULL, CHECK > 0   |                                                                   |
| `promised_delivery_date` | DATE          | NOT NULL              |                                                                   |
| `submitted_at`           | DATETIME2     | NOT NULL, default now |                                                                   |

### 4.6 `OrderFulfilment_selvalakshmi`

| Column                    | Type          | Constraints                   | Notes                                                                                                          |
| ------------------------- | ------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `order_id`                | VARCHAR(30)   | PK, FK → OrderHeader          | One result per order                                                                                           |
| `status`                  | VARCHAR(20)   | NOT NULL                      | `RELEASED` / `BLOCKED`                                                                                         |
| `block_reason_code`       | VARCHAR(40)   | NULL                          | Populated only when `BLOCKED`                                                                                  |
| `block_reason`            | VARCHAR(300)  | NULL                          | Human-readable                                                                                                 |
| `selected_warehouse_id`   | VARCHAR(10)   | NULL, FK → Warehouse          | Populated only when `RELEASED`. Exactly one warehouse.                                                         |
| `allocated_quantity`      | DECIMAL(18,3) | NULL, CHECK > 0 when not null | Populated only when `RELEASED`. Always equals `OrderHeader.quantity` in full — there is no partial allocation. |
| `warehouse_dispatch_date` | DATE          | NULL                          | The selected warehouse's `earliest_dispatch_date` at allocation time                                           |
| `expected_delivery_date`  | DATE          | NULL                          | Equal to `warehouse_dispatch_date` — **no transit days added** (see §6.2)                                      |
| `evaluated_at`            | DATETIME2     | NOT NULL                      | When the decision was taken                                                                                    |

---

## 5. Configuration

`TRANSIT_DAYS` from `requirement.md` §5 is **not carried forward** — dropped per your confirmation that the date check compares the warehouse's dispatch date directly to the promised date.

No other configuration parameters are required for the decision engine in this release.

---

## 6. Fulfilment Decision Flow

### 6.1 Evaluation order (unchanged from `requirement.md` §6.8/§6.11)

```
Submit order
   │
   ├─ Structural validation fails ─────────────────────────► HTTP 400, nothing persisted
   │
   ├─ order_id already exists ────────────────────────────► Return stored result unchanged (idempotent)
   │
   ├─ Customer not found / not eligible ──────────────────► BLOCKED (CUSTOMER_NOT_FOUND | CUSTOMER_NOT_ELIGIBLE)
   │
   ├─ No inventory rows for product in any warehouse ─────► BLOCKED (PRODUCT_NOT_FOUND)
   │
   ├─ Warehouse selection (see 6.2) finds no eligible WH ─► BLOCKED (INSUFFICIENT_STOCK | DELIVERY_DATE_NOT_MET)
   │
   └─ Warehouse selected ──────────────────────────────────► RELEASED
                                                              + deduct that warehouse's stock only
                                                              + persist selected warehouse + allocated quantity
                                                              (single transaction)
```

Evaluation still stops at the first failing check, in the order: customer → product/stock existence → warehouse selection.

### 6.2 Warehouse selection algorithm (replaces `requirement.md` §6.6 entirely)

Given the ordered quantity and promised delivery date, evaluate warehouses **in the fixed priority order WH-A, then WH-B, then WH-C** (not sorted by stock size or by dispatch date — your instruction is an explicit priority sequence):

```
for warehouse in [WH-A, WH-B, WH-C]:
    row = Inventory row for (product_id, warehouse)
    if row does not exist:
        continue                                   // this warehouse has no stock record for the product
    if row.available_quantity < order.quantity:
        continue                                   // this single warehouse cannot cover the full quantity
    if row.earliest_dispatch_date > order.promised_delivery_date:
        continue                                   // this warehouse cannot meet the date
    // Both conditions satisfied — this is the selected warehouse. Stop.
    select warehouse
    break

if no warehouse selected:
    determine block reason (see 6.3)
```

Key points, stated explicitly so no assumption is needed during implementation:

- **The full requested quantity must come from one warehouse's `available_quantity`.** Quantities across warehouses are never summed or combined to cover a shortfall (your note 1).
- **Priority is fixed (A → B → C), not earliest-dispatch-date-first.** If WH-A and WH-B both have enough stock and both meet the date, **WH-A is chosen**, even if WH-B's dispatch date is earlier. This is a deliberate change from `requirement.md` §6.6 step 2, which sorted by date.
- **Date comparison is inclusive and has no transit addition.** `earliest_dispatch_date <= promised_delivery_date` passes; `earliest_dispatch_date > promised_delivery_date` fails. There is no `+ TRANSIT_DAYS` step.
- `expected_delivery_date` stored on the order **equals** the selected warehouse's `earliest_dispatch_date`.

### 6.3 Determining the block reason when no warehouse qualifies

Because a warehouse can fail selection for two different reasons (not enough quantity, or date too late), the block reason must reflect _why none qualified_, evaluated in this order:

1. **`INSUFFICIENT_STOCK`** — if **none** of WH-A/B/C individually has `available_quantity >= order.quantity` (regardless of date), block with this code. Reason text lists each warehouse's available quantity against the requested quantity, e.g.:
   _"Requested quantity 500 is not available in full from any single warehouse. WH-A: 200, WH-B: 300, WH-C: 150."_
2. **`DELIVERY_DATE_NOT_MET`** — if **at least one** warehouse has enough quantity but **none** of those quantity-sufficient warehouses can meet the promised date, block with this code. Reason text names the qualifying-on-quantity warehouse(s) and their dispatch dates versus the promised date, e.g.:
   _"WH-B has sufficient stock (300) but earliest dispatch 2026-10-12 is after the promised date 2026-10-10."_

This two-step reasoning (quantity first, then date) mirrors the original spec's "customer → stock → delivery date" ordering, just applied per-warehouse instead of to a warehouse sum.

### 6.4 Release and inventory update (FR-07, adapted)

When a warehouse is selected, in a **single database transaction** (via `sp_SubmitOrder_selvalakshmi`):

1. Insert the `OrderHeader_selvalakshmi` row.
2. Call `sp_TryAllocateInventory_selvalakshmi(product_id, selected_warehouse_id, quantity)` — this locks the specific inventory row (`UPDLOCK`/row lock) and performs a conditional `UPDATE ... SET available_quantity = available_quantity - @qty WHERE available_quantity >= @qty`. If the affected row count is 0 (another concurrent order consumed the stock first), the whole transaction is rolled back and the order is **re-evaluated as `INSUFFICIENT_STOCK`** for that warehouse before falling through to the next warehouse in priority order, or blocking if none remain. This is what makes NFR-02 (no overselling) hold under concurrency.
3. Insert `OrderFulfilment_selvalakshmi` with `status = RELEASED`, `selected_warehouse_id`, `allocated_quantity = order.quantity`, `warehouse_dispatch_date`, `expected_delivery_date`.

If any step fails, the whole transaction rolls back — no partial state (NFR-01).

### 6.5 Blocking (FR-08, adapted)

- A blocked order is persisted with `status = BLOCKED`, a `block_reason_code`, and `block_reason`.
- A blocked order never deducts inventory and never populates `selected_warehouse_id` / `allocated_quantity`.
- Blocked orders are terminal — no retry, re-evaluation, or cancellation endpoint exists (unchanged, requirement.md A-05).

**Block reason codes (updated):**

| Code                    | Meaning                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `CUSTOMER_NOT_FOUND`    | `customer_id` does not exist in the customer master                                                                      |
| `CUSTOMER_NOT_ELIGIBLE` | Customer exists but `eligible_status` is not `ELIGIBLE`                                                                  |
| `PRODUCT_NOT_FOUND`     | No inventory record for the product in any warehouse                                                                     |
| `INSUFFICIENT_STOCK`    | No single warehouse (WH-A, WH-B or WH-C) individually holds enough `available_quantity` to cover the full order quantity |
| `DELIVERY_DATE_NOT_MET` | At least one warehouse has enough quantity, but none of those can dispatch on or before the promised delivery date       |

### 6.6 Idempotent re-submission (FR-09, unchanged)

If `order_id` already exists in `OrderHeader_selvalakshmi`, the system returns the **stored** `OrderFulfilment_selvalakshmi` result unchanged — no re-evaluation, no re-deduction of stock, `order_id` is reused as given (your note 4). The API response includes a flag indicating the result was previously recorded.

### 6.7 Fulfilment retrieval (FR-10, unchanged behaviour)

`GET /api/orders/{orderId}/fulfilment` returns the stored decision. Unknown `order_id` → **HTTP 404** (your note 5), body `{ "error": "ORDER_NOT_FOUND", "orderId": "..." }`.

---

## 7. REST API

Base path: `/api` — endpoints unchanged from `requirement.md` §7, response shape adapted for single-warehouse allocation.

### 7.1 `POST /api/orders` — request (unchanged)

```json
{
  "orderId": "ORD-1001",
  "customerId": "CUST-001",
  "customerType": "DEALER",
  "productId": "PRD-OPC53",
  "quantity": 300,
  "promisedDeliveryDate": "2026-10-10"
}
```

### 7.2 `POST /api/orders` — released response (HTTP 201)

```json
{
  "orderId": "ORD-1001",
  "status": "RELEASED",
  "reason": null,
  "releasedQuantity": 300,
  "backorderQuantity": 0,
  "allocations": [
    { "warehouseId": "WH-A", "allocatedQuantity": 300, "warehouseDispatchDate": "2026-10-05" }
  ],
  "expectedDeliveryDate": "2026-10-05",
  "promisedDeliveryDate": "2026-10-10",
  "evaluatedAt": "2026-09-24T10:15:00Z",
  "previouslyRecorded": false
}
```

Field semantics — **all-or-nothing, confirmed** (no partial fulfillment was introduced by this shape change):

- `releasedQuantity` — the full order quantity when `RELEASED`, otherwise `0`. Never a partial amount.
- `backorderQuantity` — the remainder **not** released: always `0` when `RELEASED` (since the whole order was released), and always equal to the full order quantity when `BLOCKED` (since nothing was released). It is a display convenience, not a tracked backorder — this release has no backorder/re-fulfilment process (requirement.md §2.2 still holds).
- `allocations` — an **array**, but it holds **exactly one entry when `RELEASED`** (the single selected warehouse) and is an **empty array `[]` when `BLOCKED`** (see §7.3 — using `[]` rather than a scalar `0` so API clients can treat the field as a consistent list type either way).
- `reason` — `null` when `RELEASED`; the human-readable block reason text when `BLOCKED` (see §7.3). The machine-readable `block_reason_code` (§6.5 table) is still stored in `OrderFulfilment_selvalakshmi` and still governs the engine's internal branching and test assertions (§10) — it is simply no longer part of the API response surface. Flag this if you want the code exposed to API clients as well (e.g. for UI styling logic beyond just green/red on `status`).

### 7.3 `POST /api/orders` — blocked response (HTTP 201)

```json
{
  "orderId": "ORD-1002",
  "status": "BLOCKED",
  "reason": "Requested quantity 900 is not available in full from any single warehouse. WH-A: 200, WH-B: 300, WH-C: 150.",
  "releasedQuantity": 0,
  "backorderQuantity": 900,
  "allocations": [],
  "expectedDeliveryDate": null,
  "promisedDeliveryDate": "2026-10-10",
  "evaluatedAt": "2026-09-24T10:16:00Z",
  "previouslyRecorded": false
}
```

A blocked order is a successful business outcome — HTTP 201, not a 4xx (unchanged).

### 7.4 `GET /api/orders/{orderId}/fulfilment` — response shape

Same fields as §7.2/§7.3, read back from `OrderFulfilment_selvalakshmi` joined to `OrderHeader_selvalakshmi`. `releasedQuantity`, `backorderQuantity` and `allocations` are derived at read time from the stored `status`, `selected_warehouse_id`, `allocated_quantity` and `OrderHeader_selvalakshmi.quantity` — they are not stored as separate columns.

### 7.5 Error responses (unchanged)

| Situation                       | HTTP | Body                                                  |
| ------------------------------- | ---- | ----------------------------------------------------- |
| Structural validation failure   | 400  | `{ "error": "VALIDATION_ERROR", "details": [ ... ] }` |
| Order id not found on retrieval | 404  | `{ "error": "ORDER_NOT_FOUND", "orderId": "..." }`    |
| Unhandled server/database error | 500  | `{ "error": "INTERNAL_ERROR", "message": "..." }`     |

### 7.6 Other endpoints (unchanged from requirement.md §7)

`GET /api/orders` (list), `GET /api/inventory` (optionally filtered by product), `GET /api/customers`, `GET /api/products` — same purpose, now reading from the `_selvalakshmi`-suffixed tables.

---

## 8. Order Validation (FR-02, unchanged) and Structural Rules

- All mandatory fields present and non-empty; failures → HTTP 400, nothing persisted.
- `quantity` numeric, greater than zero, **no rounding or truncation at any layer** (your note 2) — stored and displayed with up to 3 decimal places exactly as entered.
- `promised_delivery_date` valid `YYYY-MM-DD`.
- `order_id`, if supplied, matches format `^[A-Za-z0-9_-]{3,30}$` (declared default — reversible if you want a stricter pattern later).
- A `promised_delivery_date` in the past is **not** rejected at validation — it is left to the warehouse-selection rule in §6.2/§6.3, where it will naturally fail as `DELIVERY_DATE_NOT_MET` (or `INSUFFICIENT_STOCK` first, if that check fails earlier) since no warehouse's dispatch date will be on/before a past date. (Resolves `requirement.md` open point O-01.)

---

## 9. User Interface (unchanged screens, updated data shown)

| Screen                | Contents                                                                                                                                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Submit Order**      | Form: customer, customer type, product, quantity (decimal input, no rounding/step restriction), promised delivery date. Result shown inline: `RELEASED` (green) with **the single selected warehouse**, allocated quantity, dispatch/expected dates; or `BLOCKED` (red) with the reason text. |
| **Fulfilment Lookup** | Order id input → stored order, status, block reason, selected warehouse, allocated quantity, dispatch/expected/promised dates. Unknown id → clear "order not found" message (backed by the 404).                                                                                              |
| **Orders List**       | Table of orders with status and reason; row click opens fulfilment detail.                                                                                                                                                                                                                    |
| **Inventory View**    | Read-only grid of product × warehouse: available quantity (exact, unrounded) and earliest dispatch date.                                                                                                                                                                                      |

Mandatory-field validation before submit; loading and error states on every API call (unchanged from requirement.md §8).

---

## 10. Testing Requirements — updated scenarios

Scenarios from `requirement.md` §9.2 that assumed multi-warehouse splitting (T-02, T-03, T-11) are replaced. Renumbered here as the authoritative test list for this release.

| #    | Scenario                                                                                                                            | Expected result                                                                                                                                                                                        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-01 | Eligible customer, WH-A alone has enough stock and meets the date                                                                   | `RELEASED`; `selectedWarehouseId = WH-A`; WH-A stock deducted by the full quantity; WH-B/WH-C unchanged                                                                                                |
| T-02 | Eligible customer, only WH-B (not WH-A) has enough stock and meets the date                                                         | `RELEASED`; `selectedWarehouseId = WH-B`; only WH-B deducted                                                                                                                                           |
| T-03 | Eligible customer, both WH-A and WH-B individually have enough stock and both meet the date                                         | `RELEASED`; `selectedWarehouseId = WH-A` (priority order wins over WH-B, even if WH-B's dispatch date is earlier)                                                                                      |
| T-04 | Customer id not present in customer master                                                                                          | `BLOCKED` / `CUSTOMER_NOT_FOUND`; order persisted; no stock change                                                                                                                                     |
| T-05 | Customer exists but `eligible_status` is `NOT_ELIGIBLE`                                                                             | `BLOCKED` / `CUSTOMER_NOT_ELIGIBLE`; no stock change                                                                                                                                                   |
| T-06 | Product has no inventory record in any warehouse                                                                                    | `BLOCKED` / `PRODUCT_NOT_FOUND`                                                                                                                                                                        |
| T-07 | No single warehouse's stock covers the requested quantity, even though the sum across all three would                               | `BLOCKED` / `INSUFFICIENT_STOCK`; no stock change                                                                                                                                                      |
| T-08 | Exactly one warehouse has enough stock, but its dispatch date is after the promised date                                            | `BLOCKED` / `DELIVERY_DATE_NOT_MET`; no stock change                                                                                                                                                   |
| T-09 | Boundary: selected warehouse's `earliest_dispatch_date` equals `promised_delivery_date` exactly                                     | `RELEASED` (inclusive comparison)                                                                                                                                                                      |
| T-10 | Boundary: selected warehouse's `earliest_dispatch_date` is exactly one day after `promised_delivery_date`                           | `BLOCKED` / `DELIVERY_DATE_NOT_MET`                                                                                                                                                                    |
| T-11 | Retrieve fulfilment result by order id for a released order                                                                         | Full result including selected warehouse and allocated quantity                                                                                                                                        |
| T-12 | Retrieve fulfilment result by order id for a blocked order                                                                          | Status and block reason returned                                                                                                                                                                       |
| T-13 | Retrieve with an unknown order id                                                                                                   | HTTP 404                                                                                                                                                                                               |
| T-14 | Re-submit an existing order id                                                                                                      | Stored result returned unchanged; same `order_id`; stock not deducted twice                                                                                                                            |
| T-15 | Submit with quantity ≤ 0, missing field, or malformed date                                                                          | HTTP 400; nothing persisted                                                                                                                                                                            |
| T-16 | Order submitted without an order id                                                                                                 | Order id generated (`ORD-<sequence>`) and returned                                                                                                                                                     |
| T-17 | Blocked order followed by an inventory check                                                                                        | Inventory quantities unchanged from before submission                                                                                                                                                  |
| T-18 | Concurrency: two simultaneous orders both requesting more than half of WH-A's stock, WH-A is each order's only qualifying warehouse | Exactly one order is `RELEASED` from WH-A; the other is re-evaluated and either falls through to the next warehouse in priority order or is `BLOCKED` / `INSUFFICIENT_STOCK` — stock is never oversold |
| T-19 | Decimal quantity input (e.g. `123.456`)                                                                                             | Stored and returned with full precision, no rounding, at every layer (DB, API, UI)                                                                                                                     |

---

## 11. Non-Functional Requirements (unchanged from requirement.md §10)

NFR-01 through NFR-08 all still apply as written, with NFR-02/NFR-03 now scoped to a **single warehouse's** row rather than multiple rows per order (since only one warehouse is ever touched per release).

---

## 12. Decisions Log (everything that could have been an assumption, made explicit)

| #    | Topic                                              | Decision                                                                                                                                                                                                                                                                                                                                    | Status                                                                                                          |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| D-01 | Multi-warehouse splitting                          | Removed. One order is satisfied by exactly one warehouse or blocked.                                                                                                                                                                                                                                                                        | Confirmed by you                                                                                                |
| D-02 | Warehouse selection order                          | Fixed priority WH-A → WH-B → WH-C; first warehouse that meets both quantity and date wins. Not sorted by earliest dispatch date.                                                                                                                                                                                                            | Confirmed by you                                                                                                |
| D-03 | Transit days                                       | Removed entirely. `earliest_dispatch_date` compared directly to `promised_delivery_date`. `TRANSIT_DAYS` config deleted.                                                                                                                                                                                                                    | Confirmed by you                                                                                                |
| D-04 | Quantity rounding                                  | Never rounded, at DB, API, or UI layer. Decimal input allowed (up to schema's 3 places).                                                                                                                                                                                                                                                    | Confirmed by you                                                                                                |
| D-05 | Database target                                    | Existing `IDBTesting` database on local server `172.16.1.173,54321`, per `.mcp.json`. No new database created.                                                                                                                                                                                                                              | Confirmed by you (via `.mcp.json`)                                                                              |
| D-06 | Object naming                                      | All application tables and stored procedures suffixed `_selvalakshmi`.                                                                                                                                                                                                                                                                      | Confirmed by you                                                                                                |
| D-07 | Allocation storage                                 | Folded into `OrderFulfilment_selvalakshmi` (`selected_warehouse_id`, `allocated_quantity`) instead of a separate one-to-many allocation table, since at most one warehouse is ever involved.                                                                                                                                                | My design decision — flagged here, reversible if you'd rather keep a separate table for audit-log style history |
| D-08 | Order id format                                    | `^[A-Za-z0-9_-]{3,30}$`                                                                                                                                                                                                                                                                                                                     | My declared default — reversible                                                                                |
| D-09 | Past promised date                                 | Not rejected at validation; naturally fails the warehouse-selection date check                                                                                                                                                                                                                                                              | Confirmed (resolves requirement.md O-01)                                                                        |
| D-10 | Idempotent resubmission                            | Same `order_id` reused; stored result returned unchanged; no re-deduction                                                                                                                                                                                                                                                                   | Confirmed by you                                                                                                |
| D-11 | Unknown order id on lookup                         | HTTP 404                                                                                                                                                                                                                                                                                                                                    | Confirmed by you                                                                                                |
| D-12 | `releasedQuantity` / `backorderQuantity` semantics | All-or-nothing display fields only — not a partial-fulfillment feature. `releasedQuantity` is `0` or the full quantity; `backorderQuantity` is its complement. No backorder tracking/re-fulfilment process exists.                                                                                                                          | Confirmed by you                                                                                                |
| D-13 | API response shape (§7.2/§7.3)                     | `blockReasonCode`/`blockReason` collapsed into a single `reason` string; `selectedWarehouseId`/`allocatedQuantity` moved into an `allocations` array (0 or 1 entries) instead of top-level scalars. `block_reason_code` remains in the DB and engine internals for deterministic branching/tests (§10) but is dropped from the API surface. | Confirmed by you — reversible if you want `reasonCode` re-exposed for UI logic                                  |

---

## 13. Development Stages & Artifacts

Each stage below produces its own artifact so the build has a traceable record at every point — this satisfies your request to "maintain the architecture documents and artifacts which has each stage development details."

| Stage                           | Deliverable artifact                         | Contents                                                                                                                                         |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Stage 1 — Schema**            | `db/schema.sql`, `db/README.md`              | DDL for all six `_selvalakshmi` tables, constraints, indexes, against the existing `IDBTesting` database                                         |
| **Stage 2 — Seed data**         | `db/seed.sql`                                | Customers (eligible/not eligible), products, three warehouses, inventory rows spread across WH-A/B/C sufficient to trigger every scenario in §10 |
| **Stage 3 — Fulfilment engine** | `backend/src/engine/*.ts` + unit test report | Pure TS module implementing §6.1–§6.3; unit tests covering T-01–T-10, T-19                                                                       |
| **Stage 4 — Stored procedures** | `db/procs/*.sql`                             | `sp_TryAllocateInventory_selvalakshmi`, `sp_SubmitOrder_selvalakshmi`, `sp_GetFulfilment_selvalakshmi`                                           |
| **Stage 5 — API layer**         | `backend/src/routes/*.ts` + E2E test report  | All six endpoints from §7; E2E tests T-01–T-18 against the seeded `IDBTesting` database                                                          |
| **Stage 6 — UI**                | `frontend/src/pages/*.tsx`                   | Four screens from §9; manual golden-path walkthrough notes                                                                                       |
| **Stage 7 — Sign-off**          | `test-results.md`                            | Full §10 scenario matrix with pass/fail evidence, ready for review                                                                               |

Each stage's artifact stays in the repository as the permanent record of that stage — this document (`development.md`) is the fixed reference all of them are built against, so no stage should reintroduce the multi-warehouse or transit-day logic this document explicitly removes.
