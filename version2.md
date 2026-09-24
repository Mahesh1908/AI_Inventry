# Cement Company — Order Fulfilment & Inventory Management System

**Development Specification — Stage 2: Priority Customer Multi-Warehouse Fulfilment**

| Field         | Value                                                                |
| ------------- | --------------------------------------------------------------------- |
| Document      | version2.md                                                          |
| Version       | 2.0                                                                   |
| Date          | 2026-09-24                                                            |
| Author        | Mahesh Selvalakshmi (maheshslm@ramcocements.co.in)                    |
| Base document | development.md v1.0 (Stage 1, "single-warehouse fulfilment")          |
| Status        | Draft for review — introduces priority-customer partial fulfilment   |

This document is additive to `development.md`. Section 1 restates the current (Stage 1) flow exactly as implemented today, so the delta is unambiguous. Section 2 onward specifies the new requirement: **priority customers may combine stock across WH-A/B/C and receive a partial release plus a backorder, instead of the strict single-warehouse all-or-nothing rule.**

Everything in `development.md` continues to apply except where this document explicitly overrides it. Nothing here changes the schema-naming convention (`_selvalakshmi` suffix), the DB target (`IDBTesting`), or the architecture layering (routes → pure fulfilment engine → repository → stored procedures).

---

## 1. Current Flow (Stage 1, as implemented — recap)

This reflects the actual code today (`backend/src/engine/fulfilmentEngine.ts`, `backend/src/services/orderService.ts`, `db/schema.sql`), which matches `development.md`:

1. `evaluateCustomer()` — looks up `Customer_selvalakshmi` by `customer_id`. Missing → `CUSTOMER_NOT_FOUND`. `eligible_status <> 'ELIGIBLE'` → `CUSTOMER_NOT_ELIGIBLE`. **There is no priority/standard distinction anywhere today** — every eligible customer is treated identically.
2. Product/inventory existence check — no `Inventory_selvalakshmi` rows for the product in any warehouse → `PRODUCT_NOT_FOUND`.
3. `selectWarehouse()` — iterates the fixed order `WH-A → WH-B → WH-C` and picks the **first** warehouse whose `available_quantity >= order.quantity` **and** `earliest_dispatch_date <= promised_delivery_date`. The full quantity must come from that **one** warehouse; quantities are never summed across warehouses.
4. No qualifying warehouse → `BLOCKED` with `INSUFFICIENT_STOCK` or `DELIVERY_DATE_NOT_MET` (per `development.md` §6.3). No partial allocation, no backorder concept exists.
5. Qualifying warehouse found → `RELEASED`, full quantity deducted from that one warehouse, `selected_warehouse_id` + `allocated_quantity` stored on `OrderFulfilment_selvalakshmi` (single row, no separate allocation table — `development.md` D-07).
6. Re-submitting an existing `order_id` returns the stored result unchanged (`previouslyRecorded: true`), no re-evaluation, no re-deduction.
7. `OrderHeader_selvalakshmi.customer_type` is accepted from the request and persisted, but is **pure pass-through** today — nothing branches on it.

This is the baseline that must keep passing unchanged for **standard** customers after this release.

---

## 2. What Changes in Stage 2

| Topic                      | Stage 1 (today)                                              | Stage 2 (this document)                                                                                                 |
| --------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Standard customers          | Single warehouse, all-or-nothing                               | **Unchanged.** Exactly the Stage 1 algorithm, byte-for-byte.                                                                |
| Priority customers          | Did not exist as a concept                                     | May combine WH-A + WH-B + WH-C (in that fixed order) to cover the order. Partial release + one Open backorder is possible. |
| "Priority" designation      | `customer_type` accepted on the order request but unused        | `customer_type` becomes a required, validated 2-value enum — exactly `Standard` or `Priority` — and now drives which algorithm runs (see §3.1). |
| Threshold                   | N/A                                                             | 70% of requested quantity, **configurable** (see §4).                                                                       |
| Allocation storage          | 0 or 1 row folded into `OrderFulfilment_selvalakshmi`           | Reintroduces a one-to-many allocation table — a priority order can now touch up to three warehouses (see §3.3).            |
| Backorder                   | Did not exist                                                   | New `Backorder_selvalakshmi` table; at most one Open backorder per order (see §3.4).                                        |
| Fulfilment status values    | `RELEASED` / `BLOCKED`                                          | Adds `PARTIALLY_RELEASED` (see §5.3).                                                                                       |
| Idempotency                 | Re-submission returns stored result unchanged                  | **Unchanged rule**, explicitly extended to cover allocations + backorders (see §5.6).                                      |

---

## 3. Data Model Changes

### 3.1 `OrderHeader_selvalakshmi.customer_type` — becomes a required, validated 2-value type

| Column          | Type        | Constraints                                              | Notes                                                                          |
| ---------------- | ----------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `customer_type` | VARCHAR(20) | NOT NULL, CHECK (`customer_type IN ('Standard','Priority')`) | Was nullable/unused (`development.md` §4.5). Now required and drives §5.1's branch. |

**Design decision (D-14, revised).** `customer_type` is exactly the 2-value type the customer sends on the order request — literal values `"Standard"` and `"Priority"` (matching the exact-casing API convention in §6.1) — not a separate flag stored on the customer master. It moves from "accepted and persisted but ignored" (Stage 1) to "required and used for branching" (Stage 2):

- Structural validation (§8-equivalent for Stage 2) rejects any request where `customerType` is missing or is anything other than `"Standard"` or `"Priority"` — HTTP 400, nothing persisted, same as any other malformed field.
- The looked-up `Customer_selvalakshmi` row is unchanged — `eligible_status` still gates existence/eligibility exactly as in Stage 1, independent of the order's `customerType`.
- No new column is added to `Customer_selvalakshmi` for this. If a future requirement wants priority to be a durable property of the customer *account* (so it can't vary order-to-order), that would be a separate change — flagged here but not built now, since the current requirement text and the example payload both put `customerType` on the order.

### 3.2 New config table — `AppConfig_selvalakshmi`

| Column         | Type         | Constraints | Notes                                             |
| -------------- | ------------ | ----------- | -------------------------------------------------- |
| `config_key`   | VARCHAR(50)  | PK          | e.g. `PRIORITY_RELEASE_THRESHOLD_PCT`              |
| `config_value` | VARCHAR(50)  | NOT NULL    | Stored as text, parsed by type at read time        |
| `updated_at`   | DATETIME2    | NOT NULL    |                                                     |

Seeded row: `PRIORITY_RELEASE_THRESHOLD_PCT = 70`. See §4 for how this is read and cached.

### 3.3 New allocation table — `OrderAllocation_selvalakshmi`

Reintroduces the one-to-many table `development.md` D-07 folded away, because a priority order can now legitimately span up to three warehouses.

| Column                    | Type          | Constraints                        | Notes                                                    |
| -------------------------- | ------------- | ------------------------------------ | ---------------------------------------------------------- |
| `order_id`                 | VARCHAR(30)   | PK (composite), FK → OrderHeader    |                                                            |
| `warehouse_id`             | VARCHAR(10)   | PK (composite), FK → Warehouse      |                                                            |
| `allocated_quantity`       | DECIMAL(18,3) | NOT NULL, CHECK > 0                 | Portion released from this specific warehouse             |
| `warehouse_dispatch_date`  | DATE          | NOT NULL                            | That warehouse's `earliest_dispatch_date` at decision time |
| `created_at`               | DATETIME2     | NOT NULL, default now               |                                                            |

- A **standard** `RELEASED` order still produces exactly one row here (same as today's single-warehouse behaviour) — the table generalizes rather than changes Stage 1's outcome.
- A **priority** `RELEASED` or `PARTIALLY_RELEASED` order produces one row per warehouse actually drawn from, in priority order.
- A `BLOCKED` order produces zero rows, for both customer types.
- `OrderFulfilment_selvalakshmi.selected_warehouse_id` / `.allocated_quantity` (the Stage 1 folded columns) are **deprecated** in favour of reading `OrderAllocation_selvalakshmi`; kept nullable for now so no destructive migration is required, but no longer written by new code (see §5.7 for the read-path change).

### 3.4 New backorder table — `Backorder_selvalakshmi`

| Column                  | Type          | Constraints                     | Notes                                      |
| ------------------------ | ------------- | ---------------------------------- | -------------------------------------------- |
| `order_id`               | VARCHAR(30)   | PK, FK → OrderHeader              | At most one backorder per order            |
| `backordered_quantity`   | DECIMAL(18,3) | NOT NULL, CHECK > 0                | Requested quantity minus released quantity |
| `status`                 | VARCHAR(20)   | NOT NULL, DEFAULT `'OPEN'`        | `OPEN` (only value produced in this release — no fulfilment/cancellation workflow yet) |
| `created_at`             | DATETIME2     | NOT NULL, default now             |                                             |
| `updated_at`             | DATETIME2     | NOT NULL, default now             |                                             |

A backorder row exists **only** when status is `PARTIALLY_RELEASED`. `BLOCKED` orders (priority, <70% available) never get a backorder row — per the requirement, blocking means "no allocation and no backorder."

### 3.5 `OrderFulfilment_selvalakshmi` — new columns

| Column                  | Type          | Constraints | Notes                                                                                      |
| ------------------------ | ------------- | ----------- | -------------------------------------------------------------------------------------------- |
| `status`                 | VARCHAR(20)   | NOT NULL    | Now one of `RELEASED` / `PARTIALLY_RELEASED` / `BLOCKED` (was `RELEASED` / `BLOCKED`)         |
| `released_quantity`      | DECIMAL(18,3) | NOT NULL, DEFAULT 0 | Sum of `OrderAllocation_selvalakshmi.allocated_quantity` for this order, persisted for direct read (not recomputed by joining on every GET) |
| `backordered_quantity`   | DECIMAL(18,3) | NOT NULL, DEFAULT 0 | Equals `order.quantity - released_quantity`; also mirrors `Backorder_selvalakshmi.backordered_quantity` when one exists |

`released_quantity + backordered_quantity` always equals `OrderHeader_selvalakshmi.quantity`, for every status, for both customer types — this is the invariant that generalizes Stage 1's "all-or-nothing" fields into Stage 2's partial ones.

---

## 4. Configurable Threshold

- Default: **70%** (`0.70`), seeded in `AppConfig_selvalakshmi` as `PRIORITY_RELEASE_THRESHOLD_PCT = 70`.
- Read via a small config repository (`backend/src/config/appConfig.ts`, new) that queries `AppConfig_selvalakshmi` once per process start and caches the value in memory; a restart is required to pick up a change (no requirement was given for hot-reload, and none is assumed).
- If the row is missing for any reason, the engine **fails closed** to the 70% default rather than throwing, so a misconfigured environment doesn't silently disable the priority path.
- The threshold is passed into the pure fulfilment engine as a parameter (`evaluateFulfilment(input, { priorityReleaseThresholdPct })`) — the engine itself has **no** DB dependency, consistent with `development.md` §1/NFR-08. This also makes the threshold trivial to vary per-test without touching the DB (unit tests pass `50`, `70`, `99.9`, etc. directly).
- "Exactly 70% qualifies" is implemented as `availablePct >= threshold`, not `>` — verified explicitly in T-22 (see §7).

---

## 5. Fulfilment Decision Flow (Stage 2)

### 5.1 Evaluation order (extends `development.md` §6.1)

```
Submit order
   │
   ├─ Structural validation fails ─────────────────────────► HTTP 400, nothing persisted
   ├─ order_id already exists ────────────────────────────► Return stored result unchanged (idempotent, §5.6)
   ├─ Customer not found / not eligible ──────────────────► BLOCKED (unchanged codes)
   ├─ No inventory rows for product in any warehouse ─────► BLOCKED (PRODUCT_NOT_FOUND)
   │
   ├─ customerType == "Standard" ──────────────────────────► Stage 1 algorithm, unchanged (§1)
   │
   └─ customerType == "Priority" ──────────────────────────► Stage 2 algorithm (§5.2)
```

The customer/product existence checks run **before** branching on priority — a not-found customer or product blocks identically for both customer types.

### 5.2 Priority-customer warehouse combination algorithm

```
threshold = configured PRIORITY_RELEASE_THRESHOLD_PCT   // default 70

remaining = order.quantity
allocations = []

for warehouse in [WH-A, WH-B, WH-C]:
    if remaining <= 0:
        break
    row = Inventory row for (product_id, warehouse)
    if row does not exist or row.available_quantity <= 0:
        continue
    draw = min(row.available_quantity, remaining)     // never allocate more than requested, in total or per warehouse
    allocations.push({ warehouse, quantity: draw, dispatchDate: row.earliest_dispatch_date })
    remaining -= draw

releasedQuantity = order.quantity - remaining
availablePct = (releasedQuantity / order.quantity) * 100

if availablePct >= threshold:
    if remaining == 0:
        status = RELEASED                              // 100% available, no backorder — same outcome shape as Stage 1
    else:
        status = PARTIALLY_RELEASED
        create ONE Backorder row: quantity = remaining, status = OPEN
    persist `allocations` (one row per warehouse actually drawn from)
    deduct each warehouse's stock by its `quantity` (per-warehouse, same locked conditional UPDATE as Stage 1)
else:
    status = BLOCKED, block_reason_code = INSUFFICIENT_STOCK
    // no allocations, no stock deducted anywhere, no backorder row
```

Key points, stated explicitly:

- **Delivery date is not part of this algorithm.** The requirement text for priority customers does not mention a date check, unlike Stage 1's `DELIVERY_DATE_NOT_MET`. This release therefore does **not** apply a per-warehouse date filter to priority orders — every warehouse with any stock is eligible to contribute, in priority order, regardless of its `earliest_dispatch_date`. `expected_delivery_date` on the response is still populated (see §6.2) as informational data, but it does not gate whether stock from that warehouse is drawn. **Flagging this as an assumption** — if a delivery-date gate for priority orders is actually wanted, say so and it will be added as an additional filter before the quantity loop, mirroring Stage 1's `DELIVERY_DATE_NOT_MET` reasoning per-warehouse.
- **Combination order is fixed** WH-A → WH-B → WH-C, exactly as in Stage 1 — never re-sorted by available quantity or dispatch date.
- **Never allocate more than requested**, enforced both per-warehouse (`draw = min(...)`) and in total (the loop stops the instant `remaining` hits zero).
- **The 70% test is against the combined total**, not any single warehouse. A priority customer whose WH-A alone has 70%+ is released entirely from WH-A with no need to touch WH-B/WH-C (the loop's `remaining <= 0` short-circuit handles this naturally).
- **Below 70% combined → full block**, not a smaller partial release. There is no "release whatever is below 70%" case — the requirement is explicit that under-threshold orders get zero allocation and zero backorder.
- **Stock is only deducted when the order is released or partially released** — a `BLOCKED` priority order leaves every warehouse's stock untouched, same guarantee as Stage 1.

### 5.3 Status semantics

| Status               | `released_quantity`         | `backordered_quantity`      | Allocation rows | Backorder row |
| --------------------- | ---------------------------- | ----------------------------- | ---------------- | -------------- |
| `RELEASED`           | = `quantity`                  | `0`                            | 1+ (1 for standard, 1–3 for priority) | none |
| `PARTIALLY_RELEASED` | `>= threshold% of quantity`, `< quantity` | `quantity - released_quantity` | 1–3 (priority only) | 1, status `OPEN` |
| `BLOCKED`            | `0`                           | = `quantity`                   | none              | none |

`PARTIALLY_RELEASED` is a new status; it never applies to standard customers, since Stage 1's algorithm has no partial outcome.

### 5.4 Block reason codes — addition

| Code                 | Meaning                                                                                                           | Applies to        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `INSUFFICIENT_STOCK` | (Reused) For priority customers, now means: combined available quantity across WH-A/B/C is below the configured threshold percentage of the requested quantity. | Priority customers |

The existing `INSUFFICIENT_STOCK` code is reused rather than adding a new one — the underlying cause (not enough stock, viewed appropriately for the customer's rule) is the same concept; only the *test* that produces it differs by customer type. The block-reason text distinguishes the two cases, e.g.:
_"Priority order: only 620 of 1000 requested (62%) available across WH-A/B/C, below the 70% release threshold. WH-A: 200, WH-B: 250, WH-C: 170."_

### 5.5 Release and inventory update

Extends `development.md` §6.4. For a priority order, the transaction now performs the locked conditional stock deduction **once per warehouse actually drawn from** (up to three calls to `sp_TryAllocateInventory_selvalakshmi`, unchanged procedure — it already operates on one `(product_id, warehouse_id)` pair), inserts one `OrderAllocation_selvalakshmi` row per warehouse, and inserts the `Backorder_selvalakshmi` row when the order is `PARTIALLY_RELEASED`. If any per-warehouse deduction fails under concurrency (another order raced it to the same stock), the whole transaction rolls back and the order is re-evaluated from scratch against current stock levels — same retry behaviour already implemented for Stage 1 in `orderService.ts` (`MAX_ALLOCATION_RETRIES`), extended to loop over all warehouses touched, not just one.

### 5.6 Idempotent re-submission — extended (FR-09, `development.md` §6.6)

Unchanged rule, restated for the new tables: if `order_id` already exists, the stored `OrderFulfilment_selvalakshmi` row, its `OrderAllocation_selvalakshmi` rows, and its `Backorder_selvalakshmi` row (if any) are returned **unchanged** — no re-evaluation, no re-deduction, no new backorder, no duplicate allocation rows. This is enforced the same way Stage 1 already enforces it (existence check on `order_id` before any engine evaluation runs), so it requires no new logic — it's called out here because the requirement explicitly asks for it to hold for the new allocation/backorder tables too.

### 5.7 Fulfilment retrieval — read path change

`GET /api/orders/{orderId}/fulfilment` now reads `released_quantity` / `backordered_quantity` directly off `OrderFulfilment_selvalakshmi` (§3.5) and joins `OrderAllocation_selvalakshmi` (0–3 rows) and `Backorder_selvalakshmi` (0–1 row) instead of the Stage 1 single folded pair of columns. Standard-customer orders flow through the same read path and simply always resolve to 0 or 1 allocation rows and no backorder row — no branching needed in the read path itself.

---

## 6. REST API Changes

### 6.1 Request — `customerType` becomes required and validated

No new request field is added, but `customerType` changes from optional/ignored to **required**, with exactly two accepted literal values: `"Standard"` or `"Priority"` (per §3.1). Any other value, or a missing field, is a structural validation failure (HTTP 400, nothing persisted) — same treatment as an invalid `quantity` or malformed date. This value is what §5.1 branches on.

### 6.2 Response — `allocations` becomes genuinely multi-entry; new backorder fields

```json
{
  "orderId": "ORD-2001",
  "status": "PARTIALLY_RELEASED",
  "reason": null,
  "releasedQuantity": 750,
  "backorderQuantity": 250,
  "backorderStatus": "OPEN",
  "allocations": [
    { "warehouseId": "WH-A", "allocatedQuantity": 400, "warehouseDispatchDate": "2026-10-05" },
    { "warehouseId": "WH-B", "allocatedQuantity": 350, "warehouseDispatchDate": "2026-10-07" }
  ],
  "expectedDeliveryDate": "2026-10-07",
  "promisedDeliveryDate": "2026-10-10",
  "evaluatedAt": "2026-09-24T10:20:00Z",
  "previouslyRecorded": false
}
```

- `status` — now `RELEASED` / `PARTIALLY_RELEASED` / `BLOCKED`.
- `releasedQuantity` / `backorderQuantity` — same field names as Stage 1 (`development.md` §7.2), now genuinely partial for priority orders instead of always being `0` or the full quantity. Standard-customer responses keep the Stage 1 all-or-nothing behaviour exactly.
- `backorderStatus` — new field. `null` when there is no backorder (`RELEASED` or `BLOCKED`), `"OPEN"` when `PARTIALLY_RELEASED`.
- `allocations` — same field, now can hold 0–3 entries instead of 0–1. `expectedDeliveryDate` when there are multiple allocations is the **latest** of the contributing warehouses' dispatch dates (the order can't be considered fully dispatched until the slowest contributing warehouse ships) — stated explicitly here since it's a judgment call the requirement doesn't specify.
- `reason` — populated with the `INSUFFICIENT_STOCK` text (§5.4) when `BLOCKED`; `null` otherwise, unchanged pattern.

### 6.3 Other endpoints

`GET /api/orders` (list) should surface `status` including the new `PARTIALLY_RELEASED` value and each order's `customerType`. `GET /api/customers` is unchanged — priority is an order-level field, not a customer-master attribute (§3.1), so there is nothing new to expose there.

---

## 7. Testing — new/updated scenarios

`development.md` §10 (T-01–T-19) must all continue to pass **unchanged** for standard customers — this is the explicit "preserve Stage 1 behaviour" requirement. The scenarios below are additive.

| #    | Scenario                                                                                                          | Expected result                                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| T-20 | Priority customer, WH-A alone has 100% of requested quantity                                                       | `RELEASED`; single allocation row (WH-A); no backorder — same shape as a Stage 1 release                             |
| T-21 | Priority customer, no single warehouse has enough, but WH-A + WH-B combined equal exactly the requested quantity   | `RELEASED`; two allocation rows; no backorder                                                                         |
| T-22 | Priority customer, combined WH-A+B+C available equals **exactly** 70% of requested quantity                        | `PARTIALLY_RELEASED`; released = 70%; one Open backorder for the remaining 30% (boundary — inclusive)                 |
| T-23 | Priority customer, combined available is 69.999% of requested quantity                                             | `BLOCKED` / `INSUFFICIENT_STOCK`; no allocation rows; no backorder row; no stock deducted anywhere                    |
| T-24 | Priority customer, combined available exceeds requested quantity (e.g. WH-A alone already covers it)               | Released quantity never exceeds `order.quantity`; excess stock in later warehouses is left untouched                 |
| T-25 | Priority customer, WH-A has partial stock, WH-B has zero, WH-C has the rest needed to clear threshold               | Allocation rows only for WH-A and WH-C (WH-B skipped, not a zero-quantity row)                                        |
| T-26 | Re-submit an existing `order_id` that was `PARTIALLY_RELEASED`                                                      | Stored result, allocations, and backorder returned unchanged; no duplicate backorder row; stock not deducted again  |
| T-27 | Standard customer (regression), same fixtures as T-20–T-23                                                          | Stage 1 all-or-nothing behaviour holds exactly — either `RELEASED` from one warehouse or `BLOCKED`, never `PARTIALLY_RELEASED` |
| T-28 | Threshold configured to a non-default value (e.g. 50%) via `AppConfig_selvalakshmi`                                 | Release/block boundary shifts to the configured percentage, proving the threshold is not hardcoded                   |
| T-29 | Priority customer, product has no inventory row in any warehouse                                                    | `BLOCKED` / `PRODUCT_NOT_FOUND` — existence check still runs before the priority algorithm (§5.1)                     |
| T-30 | Concurrency: two priority orders simultaneously draw from the same warehouse mid-combination                        | Per-warehouse locked deduction (§5.5) prevents overselling; a losing order re-evaluates against updated stock, never oversells |

---

## 8. Decisions Log (continuing `development.md` §12)

| #    | Topic                                  | Decision                                                                                                                                                 | Status                                             |
| ---- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| D-14 | Where "priority" lives                 | `OrderHeader_selvalakshmi.customer_type` — required, exactly `"Standard"` or `"Priority"` — is the field the engine branches on. No new column on `Customer_selvalakshmi`; priority is per-order, not a durable customer-master attribute. | Confirmed by requirement text (exact 2-value `customerType` convention) |
| D-15 | Delivery date for priority orders      | Not checked — priority algorithm only tests combined quantity against the threshold, per the literal requirement text.                                    | **Assumption — please confirm or correct**          |
| D-16 | Threshold storage                      | New `AppConfig_selvalakshmi` key/value table, cached in memory per process, default 70, engine takes it as a parameter (no DB dependency in the engine).   | My design decision — reversible to an env var if preferred |
| D-17 | Allocation table reintroduced           | `OrderAllocation_selvalakshmi` (one-to-many) replaces the Stage 1 folded columns for all new writes; old columns kept nullable, unused going forward.       | Required by the multi-warehouse requirement          |
| D-18 | New status value                        | `PARTIALLY_RELEASED` added alongside `RELEASED`/`BLOCKED`.                                                                                                 | Required by the partial-release requirement          |
| D-19 | `expectedDeliveryDate` on multi-warehouse release | Latest dispatch date among contributing warehouses.                                                                                              | My design decision — flagged, reversible             |
| D-20 | Exactly-70% boundary                   | Inclusive — `availablePct >= threshold` releases, matching the requirement's explicit "exactly 70% qualifies."                                             | Confirmed by requirement text                        |
| D-21 | Below-threshold outcome                | Full block, zero allocation, zero backorder — no smaller partial release is attempted below 70%.                                                          | Confirmed by requirement text                        |

---

## 9. Development Stages & Artifacts (Stage 2)

| Stage                                  | Deliverable artifact                                              | Contents                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Stage 2a — Schema**                  | `db/schema_v2.sql` (or additive migration in `db/schema.sql`)         | `customer_type` NOT NULL + CHECK constraint on `OrderHeader_selvalakshmi`, `AppConfig_selvalakshmi`, `OrderAllocation_selvalakshmi`, `Backorder_selvalakshmi`, new `OrderFulfilment` columns |
| **Stage 2b — Seed data**               | `db/seed_v2.sql`                                                       | Orders/fixtures using `customerType: "Priority"`, inventory spanning the exact-70%, below-70%, and over-100% cases (T-20–T-25) |
| **Stage 2c — Fulfilment engine**       | `backend/src/engine/fulfilmentEngine.ts` (extended) + unit tests       | `selectWarehousesForPriority()` alongside the untouched Stage 1 `selectWarehouse()`; unit tests T-20–T-25, T-27–T-29 |
| **Stage 2d — Stored procedures**       | `db/procs/*.sql` (extended)                                            | New/extended proc for multi-row allocation insert + backorder insert in one transaction               |
| **Stage 2e — API layer**               | `backend/src/routes/*.ts`, `responseMapper.ts` (extended) + E2E tests  | Updated response shape (§6.2); E2E tests T-20–T-30                                                     |
| **Stage 2f — UI**                      | `frontend/src/pages/*.tsx` (extended)                                  | `PARTIALLY_RELEASED` status styling, backorder display, `customerType` selector (`Standard`/`Priority`) on the Submit Order form |
| **Stage 2g — Sign-off**                | `test-results-v2.md`                                                  | Full §7 scenario matrix, plus a re-run of `development.md` §10 T-01–T-19 proving no regression         |
