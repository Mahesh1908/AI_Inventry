# Cement Company — Order Fulfilment & Inventory Management System

**Requirements Specification**

| Field | Value |
|---|---|
| Document | requirement.md |
| Version | 1.0 |
| Date | 2026-09-24 |
| Author | Mahesh Selvalakshmi (maheshslm@ramcocements.co.in) |
| Status | Draft — for review and sign-off before development starts |

---

## 1. Purpose

Build an inventory management and order-fulfilment application for a cement company operating **three warehouses — WH-A, WH-B and WH-C**.

When a sales order is submitted, the system must automatically decide whether the order can be honoured — by checking customer eligibility, product stock across the three warehouses, and whether the promised delivery date can be met — and then either **release** the order (reserving stock) or **block** it with a clear reason. Every order and its fulfilment result is stored in the database and can be looked up later by order id.

## 2. Scope

### 2.1 In scope
- Application database holding customer, product, warehouse, inventory, order, fulfilment-result and allocation data.
- Order submission REST API that validates and evaluates an order in one call.
- Automatic fulfilment decision engine (eligibility → stock → delivery-date feasibility).
- Inventory deduction and per-warehouse allocation records for released orders.
- Fulfilment-result retrieval REST API by order id.
- A simple web UI to submit orders, look up fulfilment results and view inventory.
- Automated end-to-end API tests and a seed/demo data script.

### 2.2 Out of scope (this release)
- Authentication, authorisation and user management.
- Order amendment, cancellation, or re-evaluation of a blocked order (see §6.7).
- Partial / backorder fulfilment — an order is either fully released or fully blocked.
- Goods dispatch, invoicing, transport planning, pricing, taxes.
- Inventory replenishment, goods receipt, stock transfer between warehouses.
- Customer-type based rules (field is captured now, logic deferred — see §6.3).

---

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React with TypeScript (`.tsx`) |
| Backend API | Node.js + Express + TypeScript |
| Database | Microsoft SQL Server (MSSQL) |
| API testing | Automated end-to-end tests against the REST API with a seeded database |
| Seed data | SQL script for demo/test data |

---

## 4. Data Model

### 4.1 Entity overview

| Entity | Purpose | Type |
|---|---|---|
| `Customer` | Customer master with eligibility flag | Master |
| `Product` | Cement product master | Master |
| `Warehouse` | WH-A, WH-B, WH-C | Master |
| `Inventory` | Stock and earliest dispatch date per product per warehouse | Transactional |
| `OrderHeader` | Submitted order as received | Transactional |
| `OrderFulfilment` | Fulfilment decision for an order | Transactional |
| `OrderAllocation` | Which warehouse supplied how much for a released order | Transactional |

### 4.2 Customer

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `customer_id` | VARCHAR(20) | PK | e.g. `CUST-001` |
| `customer_name` | VARCHAR(100) | NULL | Display only; added for UI readability |
| `eligible_status` | VARCHAR(20) | NOT NULL | `ELIGIBLE` / `NOT_ELIGIBLE` |
| `created_at` | DATETIME2 | NOT NULL, default now | Audit |
| `updated_at` | DATETIME2 | NOT NULL, default now | Audit |

### 4.3 Product

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `product_id` | VARCHAR(20) | PK | e.g. `PRD-OPC53` |
| `product_name` | VARCHAR(100) | NOT NULL | e.g. "OPC 53 Grade Cement" |
| `uom` | VARCHAR(10) | NOT NULL | Unit of measure, e.g. `BAG`, `MT` |
| `is_active` | BIT | NOT NULL, default 1 | |

### 4.4 Warehouse

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `warehouse_id` | VARCHAR(10) | PK | Fixed set: `WH-A`, `WH-B`, `WH-C` |
| `warehouse_name` | VARCHAR(100) | NOT NULL | |
| `location` | VARCHAR(100) | NULL | |
| `is_active` | BIT | NOT NULL, default 1 | |

### 4.5 Inventory

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `product_id` | VARCHAR(20) | PK (composite), FK → Product | |
| `warehouse_id` | VARCHAR(10) | PK (composite), FK → Warehouse | |
| `available_quantity` | DECIMAL(18,3) | NOT NULL, CHECK >= 0 | Free-to-promise quantity |
| `earliest_dispatch_date` | DATE | NOT NULL | Earliest date this warehouse can dispatch this product |
| `updated_at` | DATETIME2 | NOT NULL | Audit |

- Primary key: `(product_id, warehouse_id)` — one stock row per product per warehouse.
- Index on `(product_id, earliest_dispatch_date)` to support allocation ordering.

### 4.6 OrderHeader

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `order_id` | VARCHAR(30) | PK | Supplied by client or system-generated (§6.1) |
| `customer_id` | VARCHAR(20) | NOT NULL | Not enforced as FK — unknown customers must still be persisted as blocked (§6.4) |
| `customer_type` | VARCHAR(20) | NULL | Stored only in this release (§6.3) |
| `product_id` | VARCHAR(20) | NOT NULL | Same reasoning as `customer_id` |
| `quantity` | DECIMAL(18,3) | NOT NULL, CHECK > 0 | |
| `promised_delivery_date` | DATE | NOT NULL | |
| `submitted_at` | DATETIME2 | NOT NULL, default now | Audit |

### 4.7 OrderFulfilment

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `order_id` | VARCHAR(30) | PK, FK → OrderHeader | One result per order |
| `status` | VARCHAR(20) | NOT NULL | `RELEASED` / `BLOCKED` |
| `block_reason_code` | VARCHAR(40) | NULL | Populated only when `BLOCKED` (§6.6) |
| `block_reason` | VARCHAR(300) | NULL | Human-readable reason |
| `effective_dispatch_date` | DATE | NULL | Latest dispatch date among allocated warehouses (released orders) |
| `expected_delivery_date` | DATE | NULL | `effective_dispatch_date` + transit days |
| `evaluated_at` | DATETIME2 | NOT NULL | When the decision was taken |

### 4.8 OrderAllocation

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `allocation_id` | INT IDENTITY | PK | |
| `order_id` | VARCHAR(30) | NOT NULL, FK → OrderHeader | |
| `warehouse_id` | VARCHAR(10) | NOT NULL, FK → Warehouse | |
| `allocated_quantity` | DECIMAL(18,3) | NOT NULL, CHECK > 0 | |
| `warehouse_dispatch_date` | DATE | NOT NULL | Dispatch date of that warehouse at allocation time |
| `allocated_at` | DATETIME2 | NOT NULL | Audit |

- Rows are written **only for released orders**. Blocked orders have no allocation rows.
- Unique constraint on `(order_id, warehouse_id)`.

### 4.9 Fields added beyond the originally listed data
These were added deliberately and are flagged for your confirmation: `customer_name`, `Product` and `Warehouse` master tables, all `created_at`/`updated_at`/`submitted_at`/`evaluated_at` audit columns, and the `OrderFulfilment` and `OrderAllocation` tables (needed for requirements 6, 8 and 9).

---

## 5. Configuration

| Parameter | Value | Description |
|---|---|---|
| `TRANSIT_DAYS` | `2` | Fixed transit time in calendar days, the same for all warehouses and all customers. Held in application configuration so it can be changed without a code change. |

---

## 6. Functional Requirements

### 6.1 FR-01 — Order submission and identification
- The system accepts an order through the REST API with: `order_id` (optional), `customer_id`, `customer_type`, `product_id`, `quantity`, `promised_delivery_date`.
- If `order_id` is supplied, it is used as-is. If it is absent, the system generates one (format `ORD-<sequence>`) and returns it in the response.
- Submission and evaluation happen in a single call — the response carries the fulfilment decision.

### 6.2 FR-02 — Order validation (structural)
Before any business evaluation, the request is validated. Failures are rejected with **HTTP 400** and **nothing is written to the database**:
- All mandatory fields present and non-empty.
- `quantity` is numeric and greater than zero.
- `promised_delivery_date` is a valid date in `YYYY-MM-DD` format.
- `order_id`, if supplied, matches the allowed format and length.

### 6.3 FR-03 — Customer type
`customer_type` is captured and stored on the order for reporting. **It does not influence validation, allocation or blocking in this release.** The fulfilment engine must be structured so that customer-type rules can be added later without restructuring the decision flow.

### 6.4 FR-04 — Customer eligibility check
- The engine looks up `customer_id` in the `Customer` table.
- If the customer is **not found**, the order is **persisted and BLOCKED** with reason `CUSTOMER_NOT_FOUND`. It is not rejected as a bad request.
- If the customer is found but `eligible_status` is not `ELIGIBLE`, the order is **BLOCKED** with reason `CUSTOMER_NOT_ELIGIBLE`.
- Richer eligibility states (e.g. `ON_HOLD`, credit checks) are a future extension; the check must be implemented as a replaceable rule.

### 6.5 FR-05 — Stock availability check across WH-A, WH-B and WH-C
- The engine reads all `Inventory` rows for the ordered `product_id` across the three warehouses.
- If the product has no inventory rows at all, the order is **BLOCKED** with reason `PRODUCT_NOT_FOUND`.
- If `SUM(available_quantity)` across the three warehouses is **less than** the ordered quantity, the order is **BLOCKED** with reason `INSUFFICIENT_STOCK`. The reason text states the requested and available quantities.

### 6.6 FR-06 — Allocation and delivery-commitment check

**Allocation rule (split across warehouses is allowed):**
1. Take all inventory rows for the product with `available_quantity > 0`.
2. Sort by `earliest_dispatch_date` **ascending**; tie-break by `warehouse_id` ascending for deterministic results.
3. Consume greedily from the top of that list until the ordered quantity is fully covered. A warehouse may be partially consumed.

**Delivery-commitment rule:**
- `effective_dispatch_date` = the **latest** `earliest_dispatch_date` among the warehouses actually allocated (the order ships complete, so the slowest leg governs).
- `expected_delivery_date` = `effective_dispatch_date` + `TRANSIT_DAYS` (2 calendar days).
- The commitment is met when `expected_delivery_date <= promised_delivery_date`.
- If it is not met, the order is **BLOCKED** with reason `DELIVERY_DATE_NOT_MET`, and the reason text states the expected versus promised date.

### 6.7 FR-07 — Release and inventory update
When all checks pass, in a **single database transaction**:
1. Insert the `OrderHeader` row.
2. Insert `OrderAllocation` rows — one per warehouse used, with the allocated quantity and that warehouse's dispatch date.
3. **Deduct** `allocated_quantity` from `Inventory.available_quantity` for each warehouse used.
4. Insert the `OrderFulfilment` row with `status = RELEASED`, the effective dispatch date and the expected delivery date.

If any step fails, the whole transaction is rolled back and no partial state remains. Stock rows must be read under a lock (or guarded by a conditional update) so two concurrent orders cannot oversell the same stock.

### 6.8 FR-08 — Blocking
- A blocked order is **persisted** with `status = BLOCKED`, a machine-readable `block_reason_code` and a human-readable `block_reason`.
- A blocked order **never** deducts inventory and **never** writes allocation rows.
- Evaluation **stops at the first failing check** — the reason reported is the first rule that failed, in the order: customer → product/stock → delivery date.
- **A blocked order is terminal in this release.** There is no re-evaluation, retry or cancellation endpoint; a new order must be submitted instead.

**Block reason codes:**

| Code | Meaning |
|---|---|
| `CUSTOMER_NOT_FOUND` | `customer_id` does not exist in the customer master |
| `CUSTOMER_NOT_ELIGIBLE` | Customer exists but `eligible_status` is not `ELIGIBLE` |
| `PRODUCT_NOT_FOUND` | No inventory record for the product in any warehouse |
| `INSUFFICIENT_STOCK` | Total available quantity across WH-A/B/C is less than the ordered quantity |
| `DELIVERY_DATE_NOT_MET` | Expected delivery date is later than the promised delivery date |

### 6.9 FR-09 — Idempotent re-submission
If an order is submitted with an `order_id` that already exists, the system **returns the stored fulfilment result unchanged**. It does not re-process the order, does not overwrite the stored order and does not deduct stock a second time. The response indicates that the result was previously recorded.

### 6.10 FR-10 — Fulfilment result retrieval
- A REST endpoint returns the current fulfilment result for a given `order_id`.
- The response includes the order details, status, block reason (if any), effective dispatch date, expected delivery date, evaluation timestamp and the per-warehouse allocation breakdown for released orders.
- An unknown `order_id` returns **HTTP 404**.

### 6.11 FR-11 — Decision flow (summary)

```
Submit order
   │
   ├─ Structural validation fails ──────────────────► HTTP 400, nothing persisted
   │
   ├─ order_id already exists ──────────────────────► Return stored result (idempotent)
   │
   ├─ Customer not found / not eligible ────────────► BLOCKED (CUSTOMER_NOT_FOUND | CUSTOMER_NOT_ELIGIBLE)
   │
   ├─ No inventory rows for product ────────────────► BLOCKED (PRODUCT_NOT_FOUND)
   │
   ├─ Total stock across WH-A/B/C < quantity ───────► BLOCKED (INSUFFICIENT_STOCK)
   │
   ├─ Allocate by earliest dispatch date ascending
   │     effective_dispatch = MAX(dispatch dates used)
   │     expected_delivery  = effective_dispatch + 2 days
   │
   ├─ expected_delivery > promised_delivery_date ───► BLOCKED (DELIVERY_DATE_NOT_MET)
   │
   └─ All checks pass ──────────────────────────────► RELEASED
                                                      + deduct inventory
                                                      + write allocation rows
                                                      (single transaction)
```

---

## 7. REST API

Base path: `/api`

| # | Method | Endpoint | Purpose |
|---|---|---|---|
| 1 | `POST` | `/orders` | Submit an order; validate, evaluate and persist. Returns the fulfilment decision. |
| 2 | `GET` | `/orders/{orderId}/fulfilment` | Retrieve the current fulfilment result for an order. |
| 3 | `GET` | `/orders` | List orders with their statuses (for the UI list screen). |
| 4 | `GET` | `/inventory` | Current stock across WH-A/B/C, optionally filtered by product. |
| 5 | `GET` | `/customers` | Customer list for the UI dropdown. |
| 6 | `GET` | `/products` | Product list for the UI dropdown. |

### 7.1 `POST /api/orders` — request

```json
{
  "orderId": "ORD-1001",
  "customerId": "CUST-001",
  "customerType": "DEALER",
  "productId": "PRD-OPC53",
  "quantity": 500,
  "promisedDeliveryDate": "2026-10-10"
}
```

### 7.2 `POST /api/orders` — released response (HTTP 201)

```json
{
  "orderId": "ORD-1001",
  "status": "RELEASED",
  "blockReasonCode": null,
  "blockReason": null,
  "effectiveDispatchDate": "2026-10-05",
  "expectedDeliveryDate": "2026-10-07",
  "promisedDeliveryDate": "2026-10-10",
  "allocations": [
    { "warehouseId": "WH-B", "allocatedQuantity": 300, "warehouseDispatchDate": "2026-10-03" },
    { "warehouseId": "WH-A", "allocatedQuantity": 200, "warehouseDispatchDate": "2026-10-05" }
  ],
  "evaluatedAt": "2026-09-24T10:15:00Z"
}
```

### 7.3 `POST /api/orders` — blocked response (HTTP 201)

```json
{
  "orderId": "ORD-1002",
  "status": "BLOCKED",
  "blockReasonCode": "INSUFFICIENT_STOCK",
  "blockReason": "Requested quantity 900 exceeds total available quantity 650 across WH-A, WH-B, WH-C.",
  "effectiveDispatchDate": null,
  "expectedDeliveryDate": null,
  "promisedDeliveryDate": "2026-10-10",
  "allocations": [],
  "evaluatedAt": "2026-09-24T10:16:00Z"
}
```

A blocked order is a successfully processed business outcome, not an error — it is returned with a success status code, not 4xx.

### 7.4 Error responses

| Situation | HTTP | Body |
|---|---|---|
| Structural validation failure | 400 | `{ "error": "VALIDATION_ERROR", "details": [ ... ] }` |
| Order id not found on retrieval | 404 | `{ "error": "ORDER_NOT_FOUND", "orderId": "..." }` |
| Unhandled server/database error | 500 | `{ "error": "INTERNAL_ERROR", "message": "..." }` |

---

## 8. User Interface (React + TypeScript)

| Screen | Contents |
|---|---|
| **Submit Order** | Form with customer (dropdown), customer type, product (dropdown), quantity, promised delivery date. On submit, shows the decision inline: `RELEASED` with the allocation breakdown and dates, or `BLOCKED` with the reason. |
| **Fulfilment Lookup** | Order id input; displays the stored order, status, block reason, dispatch/expected/promised dates and the per-warehouse allocation table. Shows a clear "order not found" message for an unknown id. |
| **Orders List** | Table of submitted orders with status and reason; row click opens the fulfilment detail. |
| **Inventory View** | Read-only grid of product × warehouse showing available quantity and earliest dispatch date, so the effect of a released order on stock is visible. |

UI requirements: mandatory-field validation before submit, visually distinct RELEASED (green) and BLOCKED (red) states, loading and error states on every API call.

---

## 9. Testing Requirements

### 9.1 Deliverables
1. **Automated end-to-end API tests** — exercise the real REST endpoints against a seeded test database and assert the persisted order, fulfilment status, block reason, allocation rows and resulting inventory quantities.
2. **Seed/demo data script** — a SQL script creating customers (eligible and not eligible), products, the three warehouses, and stock spread across WH-A/B/C so that every scenario below can be triggered on demand.

### 9.2 Mandatory test scenarios

| # | Scenario | Expected result |
|---|---|---|
| T-01 | Eligible customer, single warehouse has enough stock, dispatch + 2 days ≤ promised date | `RELEASED`; one allocation row; stock deducted in that warehouse only |
| T-02 | Eligible customer, quantity requires two warehouses | `RELEASED`; two allocation rows; effective dispatch = later of the two dates; both warehouses deducted |
| T-03 | Eligible customer, quantity requires all three warehouses | `RELEASED`; three allocation rows; all three warehouses deducted |
| T-04 | Customer id not present in the customer master | `BLOCKED` / `CUSTOMER_NOT_FOUND`; order persisted; no stock change |
| T-05 | Customer exists but `eligible_status` is `NOT_ELIGIBLE` | `BLOCKED` / `CUSTOMER_NOT_ELIGIBLE`; no stock change |
| T-06 | Product has no inventory record in any warehouse | `BLOCKED` / `PRODUCT_NOT_FOUND` |
| T-07 | Total stock across all three warehouses is less than the ordered quantity | `BLOCKED` / `INSUFFICIENT_STOCK`; no stock change |
| T-08 | Stock is sufficient but dispatch + 2 days falls after the promised delivery date | `BLOCKED` / `DELIVERY_DATE_NOT_MET`; no stock change |
| T-09 | Boundary: expected delivery date equals the promised delivery date exactly | `RELEASED` (inclusive comparison) |
| T-10 | Boundary: expected delivery date is exactly one day after the promised date | `BLOCKED` / `DELIVERY_DATE_NOT_MET` |
| T-11 | Allocation picks the earliest dispatch date first, not the largest warehouse | Allocation rows match the earliest-date-first ordering |
| T-12 | Retrieve fulfilment result by order id for a released order | Full result with allocation breakdown |
| T-13 | Retrieve fulfilment result by order id for a blocked order | Status and block reason returned |
| T-14 | Retrieve with an unknown order id | HTTP 404 |
| T-15 | Re-submit an existing order id | Stored result returned unchanged; stock not deducted twice |
| T-16 | Submit with quantity ≤ 0, missing field or malformed date | HTTP 400; nothing persisted |
| T-17 | Order submitted without an order id | Order id generated and returned |
| T-18 | Blocked order followed by an inventory check | Inventory quantities unchanged from before the submission |

---

## 10. Non-Functional Requirements

| # | Requirement |
|---|---|
| NFR-01 | Order evaluation and persistence execute in a single atomic transaction; any failure rolls back completely. |
| NFR-02 | Concurrent orders for the same product must not oversell stock — inventory rows are locked or conditionally updated during allocation. |
| NFR-03 | `available_quantity` can never go negative; enforced by a database CHECK constraint as well as in application logic. |
| NFR-04 | Order submission responds within 2 seconds under normal load. |
| NFR-05 | Every evaluation is logged with order id, decision, reason and duration for traceability. |
| NFR-06 | Database connection details and `TRANSIT_DAYS` are externalised to configuration/environment variables; no credentials in source code. |
| NFR-07 | All API inputs are parameterised in SQL — no string-concatenated queries. |
| NFR-08 | The fulfilment engine is a separate, independently testable module, so eligibility and customer-type rules can be extended without touching the API or UI layers. |

---

## 11. Assumptions and Deferred Decisions

Recorded explicitly so nothing is silently assumed:

| # | Item | Position |
|---|---|---|
| A-01 | Transit time is a fixed 2 **calendar** days (not working days) for all warehouses and customers | Confirmed |
| A-02 | Delivery comparison is inclusive — meeting the promised date exactly is a pass | Confirmed in T-09 |
| A-03 | `customer_type` has no logic in this release | Confirmed; future extension |
| A-04 | Unknown customer produces a persisted blocked order, not an HTTP error | Confirmed |
| A-05 | Blocked orders are terminal — no retry, re-evaluation or cancellation | Confirmed |
| A-06 | An order is for one product only; multi-line orders are not supported | Derived from the stated order structure |
| A-07 | Warehouse set is fixed to WH-A, WH-B, WH-C | Stated requirement |
| A-08 | `available_quantity` is free-to-promise stock; released orders reduce it immediately | Confirmed |

### Open points still needing your confirmation

| # | Question |
|---|---|
| O-01 | Should a `promised_delivery_date` in the **past** be rejected as a validation error (HTTP 400), or simply fail the delivery-date rule and be blocked as `DELIVERY_DATE_NOT_MET`? |
| O-02 | Are quantities whole numbers (bags) or decimal (metric tonnes)? The schema currently allows 3 decimal places. |
| O-03 | Is there an existing MSSQL instance and database name to target, or should the setup script create a new database? |

---

## 12. Requirement Traceability

| Your requirement | Covered by |
|---|---|
| 1. Maintain the database structure in the application database | §4 Data Model, §9.1 seed script |
| 2. Validate an order when it is submitted | §6.2 FR-02, §6.11 |
| 3. Check customer eligibility from the database | §6.4 FR-04 |
| 4. Check product availability across the 3 warehouses | §6.5 FR-05 |
| 5. Determine whether the promised delivery commitment can be met | §6.6 FR-06 |
| 6. If fulfillable, release and record the inventory allocation | §6.7 FR-07, §4.8 OrderAllocation |
| 7. If not fulfillable, block with the appropriate reason | §6.8 FR-08 and block reason codes |
| 8. Persist the order and the fulfilment result | §4.6, §4.7, §6.7, §6.8 |
| 9. Retrieve the current fulfilment result by order id | §6.10 FR-10, §7 endpoint 2 |
| 10. Test the functionality | §9 Testing Requirements |

---

## 13. Worked Example

**Inventory for `PRD-OPC53` (today = 2026-09-24):**

| Warehouse | Available quantity | Earliest dispatch date |
|---|---|---|
| WH-A | 200 | 2026-10-05 |
| WH-B | 300 | 2026-10-03 |
| WH-C | 150 | 2026-10-08 |

**Order:** `CUST-001` (ELIGIBLE), 500 units, promised delivery `2026-10-10`.

1. Customer is eligible → pass.
2. Total available = 650 ≥ 500 → pass.
3. Allocate by earliest dispatch date: WH-B (2026-10-03) supplies 300, then WH-A (2026-10-05) supplies the remaining 200. WH-C is not used.
4. `effective_dispatch_date` = max(2026-10-03, 2026-10-05) = **2026-10-05**.
5. `expected_delivery_date` = 2026-10-05 + 2 = **2026-10-07** ≤ 2026-10-10 → pass.
6. Result: **RELEASED**. WH-B drops to 0, WH-A drops to 0, WH-C stays at 150. Two allocation rows are written.

If the same order had a promised delivery date of `2026-10-06`, step 5 would fail (2026-10-07 > 2026-10-06) and the order would be **BLOCKED** with `DELIVERY_DATE_NOT_MET` — with no inventory change at all.
