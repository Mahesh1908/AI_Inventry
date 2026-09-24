# Stage 7 — Test Sign-off

Full `development.md` §10 scenario matrix, evidence gathered by:
1. `backend` unit tests (`npm run test`) — engine-level (`src/engine/__tests__/fulfilmentEngine.test.ts`), 12/12 passing.
2. Live E2E runs against the real `IDBTesting` database (schema + seed data from `db/`, backend running via `npm run dev`).

All scenario numbers below match `development.md` §10.

## Unit test results (engine)

```
✓ src/engine/__tests__/fulfilmentEngine.test.ts (12 tests)
  ✓ T-01 releases from WH-A when WH-A alone has enough stock and meets the date
  ✓ T-02 releases from WH-B when only WH-B has enough stock
  ✓ T-03 prefers WH-A over WH-B by fixed priority even when WH-B dispatches earlier
  ✓ T-04 blocks with CUSTOMER_NOT_FOUND when the customer does not exist
  ✓ T-05 blocks with CUSTOMER_NOT_ELIGIBLE when the customer is not eligible
  ✓ T-06 blocks with PRODUCT_NOT_FOUND when there is no inventory row anywhere
  ✓ T-07 blocks with INSUFFICIENT_STOCK when no single warehouse covers the quantity
  ✓ T-08 blocks with DELIVERY_DATE_NOT_MET when the only sufficient warehouse dispatches too late
  ✓ T-09 releases when the dispatch date exactly equals the promised date (boundary)
  ✓ T-10 blocks when the dispatch date is exactly one day after the promised date (boundary)
  ✓ caps the block reason at 300 chars even with 3 qualifying-on-quantity warehouses (regression, found during E2E — see below)
  ✓ T-19 preserves full decimal precision on the released quantity, with no rounding

Test Files  1 passed (1)
     Tests  12 passed (12)
```

## E2E results (live API against seeded `IDBTesting`)

| # | Scenario | Request | Result | Verdict |
|---|---|---|---|---|
| T-01 | WH-A alone has enough stock and meets the date | `ORD-T01`, `PRD-OPC53`, qty 300, promised 2026-10-10 | `RELEASED`, `WH-A`, WH-A 500→200, WH-B/C unchanged | ✅ Pass |
| T-02 | Only WH-B has enough stock and meets the date | `ORD-T02`, `PRD-T02`, qty 300 | `RELEASED`, `WH-B` | ✅ Pass |
| T-03 | WH-A and WH-B both qualify | `ORD-T03`, `PRD-T03`, qty 300 | `RELEASED`, `WH-A` (dispatch 2026-10-08) despite WH-B's earlier 2026-10-01 dispatch | ✅ Pass |
| T-04 | Unknown customer | `CUST-999`, `PRD-OPC53`, qty 50 | `BLOCKED` / reason names `CUST-999` not found | ✅ Pass |
| T-05 | Not-eligible customer | `CUST-002`, `PRD-OPC53`, qty 50 | `BLOCKED` / "exists but is not eligible" | ✅ Pass |
| T-06 | No inventory row for product | `CUST-001`, `PRD-NOSTOCK`, qty 50 | `BLOCKED` / "No inventory record exists…" | ✅ Pass |
| T-07 | No single warehouse covers qty, sum would | `PRD-T07` (200/300/150), qty 500 | `BLOCKED` / lists WH-A:200, WH-B:300, WH-C:150 | ✅ Pass |
| T-08 | Only sufficient warehouse dispatches too late | `PRD-T08`, qty 300, promised 2026-10-10 | `BLOCKED` / WH-B stock 300, dispatch 2026-10-12 after promised | ✅ Pass |
| T-09 | Boundary: dispatch == promised | `PRD-T09`, qty 200, promised 2026-10-10 (dispatch 2026-10-10) | `RELEASED` (inclusive) | ✅ Pass |
| T-10 | Boundary: dispatch = promised + 1 day | `PRD-T09`, qty 49, promised 2026-10-09 (dispatch 2026-10-10) | `BLOCKED` / `DELIVERY_DATE_NOT_MET` | ✅ Pass (see fix note below) |
| T-11 | Retrieve released order | `GET /orders/ORD-T01/fulfilment` | Full result incl. `WH-A`, allocated 300, dates | ✅ Pass |
| T-12 | Retrieve blocked order | `GET /orders/ORD-T05/fulfilment` | Status `BLOCKED` + reason returned | ✅ Pass |
| T-13 | Unknown order id | `GET /orders/ORD-NOPE/fulfilment` | HTTP 404, `{"error":"ORDER_NOT_FOUND", ...}` | ✅ Pass |
| T-14 | Re-submit existing order id | Re-POST `ORD-T01` unchanged | Same result, `previouslyRecorded: true`, stock **not** deducted again | ✅ Pass |
| T-15 | Invalid submission (qty ≤ 0) | qty `-5` | HTTP 400, `VALIDATION_ERROR` | ✅ Pass |
| T-16 | No order id supplied | omit `orderId` | `ORD-<timestamp>` generated, returned in response | ✅ Pass |
| T-17 | Blocked order followed by inventory check | Blocked order against `PRD-T02`, then re-check inventory | Inventory rows identical before/after (50/100/50) | ✅ Pass |
| T-18 | Concurrency — two simultaneous orders, only one qualifying warehouse | Two concurrent 400-qty orders against `PRD-T18` (WH-A stock 600) | One `RELEASED` from WH-A (600→200), the other re-evaluated fresh and `BLOCKED`/`INSUFFICIENT_STOCK` (200 < 400 after the first deduction) — **no overselling** | ✅ Pass |
| T-19 | Decimal quantity, no rounding | qty `123.456` | Stored/returned as `123.456` at API and DB layers | ✅ Pass |

## Issue found and fixed during E2E (T-10)

**Symptom:** the first T-10 run (all three warehouses individually sufficient on quantity but all failing on date) returned HTTP 500 `INTERNAL_ERROR` — the generated `DELIVERY_DATE_NOT_MET` reason text (311 chars) exceeded the `block_reason VARCHAR(300)` column (§4.6), and the underlying `mssql`/tedious driver surfaced this as a raw TDS parameter-metadata error rather than a clean validation failure.

**Fix:** `backend/src/engine/fulfilmentEngine.ts` now caps every generated block-reason string at 300 characters (truncating with `…` if needed) before it is ever handed to the persistence layer, in both the `INSUFFICIENT_STOCK` and `DELIVERY_DATE_NOT_MET` builders. A regression test was added to `fulfilmentEngine.test.ts` reproducing the 3-warehouse case. Re-run after the fix: `HTTP 201`, clean `BLOCKED` response, reason text ends with `…` instead of erroring.

## Sign-off

All 19 scenarios (T-01–T-19) pass against both the pure engine unit tests and the live API + database. The single defect found (block-reason overflow) was fixed and covered by a new regression test before sign-off.
