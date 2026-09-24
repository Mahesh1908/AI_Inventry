# Order Fulfilment & Inventory Management — Use Cases

Practical, runnable examples of every fulfilment outcome the system can produce, using the data already seeded in `db/seed.sql` and `db/seed_v2_additive.sql` (target database `IDBTesting`). Each use case gives the API request you can send and the response you should get back.

All requests are `POST http://localhost:4000/api/orders` with `Content-Type: application/json`, unless noted otherwise. `orderId` is optional — omit it and the server generates one; **each order can only be submitted once with a given `orderId`** (see Use Case 16, Idempotency).

Reference data used below:

| Customer | Status |
| --- | --- |
| `CUST-001` (Acme Constructions) | `ELIGIBLE` |
| `CUST-002` (Blocked Builders Pvt Ltd) | `NOT_ELIGIBLE` |
| `CUST-999` | does not exist |

Warehouses are always tried in fixed order **WH-A → WH-B → WH-C**, never re-sorted.

---

## Part 1 — Standard customers (`customerType: "Standard"`)

Standard customers must have their full quantity covered by **one single warehouse**, by both quantity and delivery date. No splitting, no partial release, no backorder.

### 1. Full release from the first warehouse that qualifies

WH-A alone has enough stock (500) and dispatches in time.

```json
POST /api/orders
{
  "customerId": "CUST-001",
  "customerType": "Standard",
  "productId": "PRD-OPC53",
  "quantity": 300,
  "promisedDeliveryDate": "2026-10-10"
}
```

**Result:** `status: "RELEASED"`, `releasedQuantity: 300`, one allocation row for `WH-A`, `expectedDeliveryDate: "2026-10-05"`.

### 2. Release falls through to a later-priority warehouse

WH-A only has 50 units (not enough); WH-B has 400 and is tried next.

```json
POST /api/orders
{
  "customerId": "CUST-001",
  "customerType": "Standard",
  "productId": "PRD-T02",
  "quantity": 300,
  "promisedDeliveryDate": "2026-10-10"
}
```

**Result:** `status: "RELEASED"`, allocation from `WH-B` (WH-A was skipped for insufficient stock, not because it was slower).

### 3. Fixed priority order wins even when another warehouse ships sooner

Both WH-A (dispatches 2026-10-08) and WH-B (dispatches 2026-10-01, earlier) have enough stock. WH-A still wins because priority order is fixed, never re-sorted by speed.

```json
POST /api/orders
{
  "customerId": "CUST-001",
  "customerType": "Standard",
  "productId": "PRD-T03",
  "quantity": 300,
  "promisedDeliveryDate": "2026-10-10"
}
```

**Result:** `status: "RELEASED"`, allocation from `WH-A` (not WH-B, despite WH-B's earlier dispatch date).

### 4. Blocked — customer does not exist

```json
POST /api/orders
{
  "customerId": "CUST-999",
  "customerType": "Standard",
  "productId": "PRD-OPC53",
  "quantity": 100,
  "promisedDeliveryDate": "2026-10-10"
}
```

**Result:** `status: "BLOCKED"`, `reason` mentions `CUSTOMER_NOT_FOUND`.

### 5. Blocked — customer exists but is not eligible

```json
POST /api/orders
{
  "customerId": "CUST-002",
  "customerType": "Standard",
  "productId": "PRD-OPC53",
  "quantity": 100,
  "promisedDeliveryDate": "2026-10-10"
}
```

**Result:** `status: "BLOCKED"`, reason code `CUSTOMER_NOT_ELIGIBLE`.

### 6. Blocked — product has no inventory anywhere

```json
POST /api/orders
{
  "customerId": "CUST-001",
  "customerType": "Standard",
  "productId": "PRD-NOSTOCK",
  "quantity": 50,
  "promisedDeliveryDate": "2026-10-10"
}
```

**Result:** `status: "BLOCKED"`, reason code `PRODUCT_NOT_FOUND`.

### 7. Blocked — no single warehouse has enough, even though the total would cover it

WH-A=200, WH-B=300, WH-C=150 (sum 650) but the order asks for 500 and Standard customers can't combine warehouses.

```json
POST /api/orders
{
  "customerId": "CUST-001",
  "customerType": "Standard",
  "productId": "PRD-T07",
  "quantity": 500,
  "promisedDeliveryDate": "2026-10-10"
}
```

**Result:** `status: "BLOCKED"`, reason code `INSUFFICIENT_STOCK`, message lists each warehouse's stock.

### 8. Blocked — enough stock, but it ships too late

Only WH-B has enough stock (300), but it doesn't dispatch until 2026-10-12, after the promised date.

```json
POST /api/orders
{
  "customerId": "CUST-001",
  "customerType": "Standard",
  "productId": "PRD-T08",
  "quantity": 300,
  "promisedDeliveryDate": "2026-10-10"
}
```

**Result:** `status: "BLOCKED"`, reason code `DELIVERY_DATE_NOT_MET`.

---

## Part 2 — Priority customers (`customerType: "Priority"`)

Priority customers may combine stock across WH-A + WH-B + WH-C (still tried in that fixed order). Delivery date is **not** checked for priority orders. If the combined available quantity is **≥ 70%** of what was requested (configurable in `AppConfig_selvalakshmi`), the order releases — fully if 100% is available, otherwise partially with the shortfall recorded as one Open backorder. Below 70% combined, the whole order is blocked with **zero** allocation and **zero** backorder.

### 9. Full release from one warehouse (priority customer, no split needed)

WH-A alone already covers the requested 300.

```json
POST /api/orders
{
  "customerId": "CUST-001",
  "customerType": "Priority",
  "productId": "PRD-P20",
  "quantity": 300,
  "promisedDeliveryDate": "2026-10-10"
}
```

**Result:** `status: "RELEASED"`, single allocation from `WH-A`, `backorderQuantity: 0`.

### 10. Full release, split across two warehouses that exactly cover the order

WH-A (300) + WH-B (200) sum to exactly the 500 requested.

```json
POST /api/orders
{
  "customerId": "CUST-001",
  "customerType": "Priority",
  "productId": "PRD-P21",
  "quantity": 500,
  "promisedDeliveryDate": "2026-10-10"
}
```

**Result:** `status: "RELEASED"`, two allocation rows (`WH-A`: 300, `WH-B`: 200), no backorder.

### 11. Partial release at exactly the 70% boundary

Combined WH-A(300) + WH-B(250) + WH-C(150) = 700, exactly 70% of the 1000 requested. The 70% boundary is inclusive, so this releases rather than blocks.

```json
POST /api/orders
{
  "customerId": "CUST-001",
  "customerType": "Priority",
  "productId": "PRD-P22",
  "quantity": 1000,
  "promisedDeliveryDate": "2026-10-10"
}
```

**Result:** `status: "PARTIALLY_RELEASED"`, `releasedQuantity: 700`, three allocation rows (WH-A/B/C), `backorderQuantity: 300`, `backorderStatus: "OPEN"`.

### 12. Blocked — just under the 70% threshold

Same shape as #11, but WH-C only has 149.999 instead of 150, so the combined total is 699.999 = 69.99...% — just below the threshold.

```json
POST /api/orders
{
  "customerId": "CUST-001",
  "customerType": "Priority",
  "productId": "PRD-P23",
  "quantity": 1000,
  "promisedDeliveryDate": "2026-10-10"
}
```

**Result:** `status: "BLOCKED"`, reason code `INSUFFICIENT_STOCK`, message like *"only 699.999 of 1000 requested (69.99%) available ... below the 70% release threshold"*. No allocation, no backorder — below-threshold orders never get a smaller partial release.

### 13. Never releases more than requested, even with large excess stock

WH-A has 200 (not enough alone), WH-B has 500 (way more than needed). The engine draws only what's needed from each warehouse in turn and stops.

```json
POST /api/orders
{
  "customerId": "CUST-001",
  "customerType": "Priority",
  "productId": "PRD-P24",
  "quantity": 300,
  "promisedDeliveryDate": "2026-10-10"
}
```

**Result:** `status: "RELEASED"`, allocations `WH-A: 200` + `WH-B: 100` (not WH-B's full 500), `releasedQuantity: 300` exactly. WH-C and the rest of WH-B's stock are untouched.

### 14. A zero-stock warehouse is skipped, not allocated a zero-quantity row

WH-B has 0 available; the engine skips straight to WH-C to reach the threshold.

```json
POST /api/orders
{
  "customerId": "CUST-001",
  "customerType": "Priority",
  "productId": "PRD-P25",
  "quantity": 1000,
  "promisedDeliveryDate": "2026-10-10"
}
```

**Result:** `status: "PARTIALLY_RELEASED"`, allocations only for `WH-A` (300) and `WH-C` (400) — no `WH-B` row at all — `releasedQuantity: 700`, `backorderQuantity: 300`.

### 15. Blocked before the priority algorithm even runs — no inventory record

Existence checks (customer, then product) run before the priority combination logic, for both customer types.

```json
POST /api/orders
{
  "customerId": "CUST-001",
  "customerType": "Priority",
  "productId": "PRD-NOSTOCK",
  "quantity": 50,
  "promisedDeliveryDate": "2026-10-10"
}
```

**Result:** `status: "BLOCKED"`, reason code `PRODUCT_NOT_FOUND` — identical to the Standard-customer case (#6).

---

## Part 3 — Idempotency, lookup, and listing

### 16. Re-submitting the same `orderId` never re-evaluates or double-deducts stock

Submit once with an explicit `orderId`:

```json
POST /api/orders
{
  "orderId": "ORD-DEMO-001",
  "customerId": "CUST-001",
  "customerType": "Priority",
  "productId": "PRD-P22",
  "quantity": 1000,
  "promisedDeliveryDate": "2026-10-10"
}
```

Submit the exact same request again (same `orderId`):

**Result:** identical response body, `previouslyRecorded: true` — no new stock deduction, no duplicate allocation rows, no duplicate backorder.

### 17. Look up a previously submitted order

```
GET /api/orders/ORD-DEMO-001/fulfilment
```

**Result:** the same stored fulfilment record (status, releasedQuantity/backorderQuantity, allocations, backorder), or `404 ORDER_NOT_FOUND` if the order ID is unknown.

### 18. List all submitted orders

```
GET /api/orders
```

**Result:** an array of every order's fulfilment response, most recently submitted first, including `customerType` and (for priority orders) any `PARTIALLY_RELEASED` status.

### 19. Reference data lookups (used to populate dropdowns / sanity-check stock before submitting)

```
GET /api/customers
GET /api/products
GET /api/warehouses
GET /api/inventory?productId=PRD-P22
```

**Result:** plain listings — e.g. `GET /api/inventory?productId=PRD-P22` returns the current `available_quantity` and `earliest_dispatch_date` per warehouse, useful for predicting what the next order against that product will do.

---

## Frontend equivalents

Every request above can also be run from the UI instead of raw HTTP calls:

| Use case | Page |
| --- | --- |
| Submitting any order (1–15) | **Submit Order** — pick `Customer Type` from the dropdown (`Standard` / `Priority`) |
| Idempotent re-submission (16) | **Submit Order**, using the same Order Id twice (currently only exposed via the API — the UI always auto-generates one) |
| Lookup by order id (17) | **Fulfilment Lookup** |
| Listing all orders (18) | **Orders** — `PARTIALLY_RELEASED` rows show their backorder quantity and status; the "Reason / Warehouse(s)" column lists every warehouse an order drew from |
| Inventory check (19) | **Inventory** |
