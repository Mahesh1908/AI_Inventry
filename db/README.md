# Database — Stage 1 & 2 Artifact

Target: existing `IDBTesting` database on `172.16.1.173,54321` (see `.mcp.json`). No new database is created.

## Files

| File | Purpose |
|---|---|
| `schema.sql` | DDL for the six `_selvalakshmi` tables (drops and recreates them if already present — safe to re-run in a dev/test database). |
| `seed.sql` | Reference data: 3 warehouses, 2 customers (one eligible, one not), 8 products, and inventory rows deliberately spread across WH-A/B/C to reach every scenario in `development.md` §10. |
| `procs/sp_TryAllocateInventory_selvalakshmi.sql` | Atomic conditional stock deduction for one `(product_id, warehouse_id)` row, under `UPDLOCK, HOLDLOCK, ROWLOCK` — prevents overselling under concurrency (NFR-02). |
| `procs/sp_SubmitOrder_selvalakshmi.sql` | Single-transaction release/block persistence: insert `OrderHeader`, allocate stock (if released), insert `OrderFulfilment`. Rolls back everything (including the header) if the targeted warehouse lost the stock race, so the caller can retry against the next warehouse in priority order. |
| `procs/sp_GetFulfilment_selvalakshmi.sql` | Joined read of `OrderHeader_selvalakshmi` + `OrderFulfilment_selvalakshmi` for `GET /api/orders/{orderId}/fulfilment`. |

## Apply order

```sql
:r schema.sql
:r seed.sql
:r procs/sp_TryAllocateInventory_selvalakshmi.sql
:r procs/sp_SubmitOrder_selvalakshmi.sql
:r procs/sp_GetFulfilment_selvalakshmi.sql
```

Or, via `sqlcmd`:

```
sqlcmd -S 172.16.1.173,54321 -d IDBTesting -U Testuser -P "123$Testuser" -i schema.sql
sqlcmd -S 172.16.1.173,54321 -d IDBTesting -U Testuser -P "123$Testuser" -i seed.sql
sqlcmd -S 172.16.1.173,54321 -d IDBTesting -U Testuser -P "123$Testuser" -i procs/sp_TryAllocateInventory_selvalakshmi.sql
sqlcmd -S 172.16.1.173,54321 -d IDBTesting -U Testuser -P "123$Testuser" -i procs/sp_SubmitOrder_selvalakshmi.sql
sqlcmd -S 172.16.1.173,54321 -d IDBTesting -U Testuser -P "123$Testuser" -i procs/sp_GetFulfilment_selvalakshmi.sql
```

## Object naming

Every table and stored procedure ends with `_selvalakshmi` (see `development.md` §3) to distinguish application objects from anything else already in the shared database.

## Seed data map (for test scenarios in development.md §10)

| Product | Scenario it exercises | Notes |
|---|---|---|
| `PRD-OPC53` | T-01 | Only WH-A has enough stock (500 vs 300 requested) |
| `PRD-T02` | T-02 | Only WH-B has enough stock; WH-A/WH-C are short |
| `PRD-T03` | T-03 | Both WH-A and WH-B qualify; WH-A must win despite WH-B's earlier dispatch date |
| `PRD-T07` | T-07 | No single warehouse covers the quantity, though the sum across all three would |
| `PRD-T08` | T-08 | Only WH-B has enough stock, but its dispatch date is after the promised date |
| `PRD-T09` | T-09 / T-10 | Boundary dispatch date, used with promised dates on either side of it |
| `PRD-T18` | T-18 | WH-A has exactly enough stock for one of two concurrent orders |
| `PRD-NOSTOCK` | T-06 | No inventory rows in any warehouse |

`CUST-001` is `ELIGIBLE`, `CUST-002` is `NOT_ELIGIBLE`, and `CUST-999` is intentionally never seeded (T-04 / `CUSTOMER_NOT_FOUND`).
