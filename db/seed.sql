-- ============================================================================
-- Cement Company Order Fulfilment & Inventory Management System
-- Stage 2 - Seed data
-- Spread across WH-A / WH-B / WH-C so every scenario in development.md #10 is
-- reachable. Run schema.sql first.
-- ============================================================================

USE IDBTesting;
GO

-- ----------------------------------------------------------------------------
-- Warehouses (fixed set)
-- ----------------------------------------------------------------------------
INSERT INTO dbo.Warehouse_selvalakshmi (warehouse_id, warehouse_name, location, is_active) VALUES
    ('WH-A', 'Warehouse A - North Plant', 'Chennai',     1),
    ('WH-B', 'Warehouse B - South Depot', 'Coimbatore',  1),
    ('WH-C', 'Warehouse C - East Yard',   'Vizag',       1);
GO

-- ----------------------------------------------------------------------------
-- Customers
-- ----------------------------------------------------------------------------
INSERT INTO dbo.Customer_selvalakshmi (customer_id, customer_name, eligible_status) VALUES
    ('CUST-001', 'Acme Constructions',      'ELIGIBLE'),
    ('CUST-002', 'Blocked Builders Pvt Ltd','NOT_ELIGIBLE');
-- CUST-999 is intentionally NOT seeded, used by tests for CUSTOMER_NOT_FOUND (T-04)
GO

-- ----------------------------------------------------------------------------
-- Products
-- ----------------------------------------------------------------------------
INSERT INTO dbo.Product_selvalakshmi (product_id, product_name, uom, is_active) VALUES
    ('PRD-OPC53',   'OPC 53 Grade Cement',        'BAG', 1),  -- T-01 (WH-A alone qualifies)
    ('PRD-T02',     'PPC Cement 50kg',            'BAG', 1),  -- T-02 (only WH-B qualifies)
    ('PRD-T03',     'PSC Cement 50kg',            'BAG', 1),  -- T-03 (WH-A & WH-B both qualify -> WH-A wins)
    ('PRD-T07',     'White Cement 40kg',          'BAG', 1),  -- T-07 (no single warehouse covers qty)
    ('PRD-T08',     'RMC Grade M25',              'MT',  1),  -- T-08 (enough stock, date too late)
    ('PRD-T09',     'Sulphate Resistant Cement',  'BAG', 1),  -- T-09/T-10 (boundary date)
    ('PRD-T18',     'OPC 43 Grade Cement',        'BAG', 1),  -- T-18 (concurrency)
    ('PRD-NOSTOCK', 'Discontinued Blend',         'BAG', 1),  -- T-06 / T-29 (PRODUCT_NOT_FOUND - no inventory rows)
    ('PRD-P20',     'Priority Test Blend 20',     'BAG', 1),  -- T-20 (priority, WH-A alone has 100%)
    ('PRD-P21',     'Priority Test Blend 21',     'BAG', 1),  -- T-21 (priority, WH-A + WH-B sum exactly equals qty)
    ('PRD-P22',     'Priority Test Blend 22',     'BAG', 1),  -- T-22 (priority, combined exactly 70% - boundary)
    ('PRD-P23',     'Priority Test Blend 23',     'BAG', 1),  -- T-23 (priority, combined 69.999% - below boundary)
    ('PRD-P24',     'Priority Test Blend 24',     'BAG', 1),  -- T-24 (priority, combined exceeds qty)
    ('PRD-P25',     'Priority Test Blend 25',     'BAG', 1);  -- T-25 (priority, WH-B has zero stock - skipped)
GO

-- ----------------------------------------------------------------------------
-- Inventory
-- Dates are anchored around 2026-09-24 (see development.md front-matter).
-- ----------------------------------------------------------------------------

-- PRD-OPC53: T-01 - WH-A alone has enough stock and meets the date.
INSERT INTO dbo.Inventory_selvalakshmi (product_id, warehouse_id, available_quantity, earliest_dispatch_date, updated_at) VALUES
    ('PRD-OPC53', 'WH-A', 500.000, '2026-10-05', SYSUTCDATETIME()),
    ('PRD-OPC53', 'WH-B', 100.000, '2026-10-05', SYSUTCDATETIME()),
    ('PRD-OPC53', 'WH-C', 100.000, '2026-10-05', SYSUTCDATETIME());

-- PRD-T02: only WH-B has enough stock (WH-A is short); both that qualify meet the date.
INSERT INTO dbo.Inventory_selvalakshmi (product_id, warehouse_id, available_quantity, earliest_dispatch_date, updated_at) VALUES
    ('PRD-T02', 'WH-A', 50.000,  '2026-10-05', SYSUTCDATETIME()),
    ('PRD-T02', 'WH-B', 400.000, '2026-10-05', SYSUTCDATETIME()),
    ('PRD-T02', 'WH-C', 50.000,  '2026-10-05', SYSUTCDATETIME());

-- PRD-T03: both WH-A and WH-B individually have enough stock and meet the date;
-- WH-B's dispatch date is earlier, but WH-A must still win on fixed priority.
INSERT INTO dbo.Inventory_selvalakshmi (product_id, warehouse_id, available_quantity, earliest_dispatch_date, updated_at) VALUES
    ('PRD-T03', 'WH-A', 400.000, '2026-10-08', SYSUTCDATETIME()),
    ('PRD-T03', 'WH-B', 400.000, '2026-10-01', SYSUTCDATETIME()),
    ('PRD-T03', 'WH-C', 50.000,  '2026-10-08', SYSUTCDATETIME());

-- PRD-T07: no single warehouse covers the requested quantity (500) even though the sum (650) would.
INSERT INTO dbo.Inventory_selvalakshmi (product_id, warehouse_id, available_quantity, earliest_dispatch_date, updated_at) VALUES
    ('PRD-T07', 'WH-A', 200.000, '2026-10-05', SYSUTCDATETIME()),
    ('PRD-T07', 'WH-B', 300.000, '2026-10-05', SYSUTCDATETIME()),
    ('PRD-T07', 'WH-C', 150.000, '2026-10-05', SYSUTCDATETIME());

-- PRD-T08: exactly one warehouse (WH-B) has enough stock, but its dispatch date is after
-- the promised date used in tests (2026-10-10) -> DELIVERY_DATE_NOT_MET.
INSERT INTO dbo.Inventory_selvalakshmi (product_id, warehouse_id, available_quantity, earliest_dispatch_date, updated_at) VALUES
    ('PRD-T08', 'WH-A', 50.000,  '2026-10-05', SYSUTCDATETIME()),
    ('PRD-T08', 'WH-B', 300.000, '2026-10-12', SYSUTCDATETIME()),
    ('PRD-T08', 'WH-C', 50.000,  '2026-10-05', SYSUTCDATETIME());

-- PRD-T09: boundary tests. Dispatch date exactly equals promised date (2026-10-10) for T-09,
-- and tests reuse the same row with promised date 2026-10-09 for T-10 (dispatch is one day after).
INSERT INTO dbo.Inventory_selvalakshmi (product_id, warehouse_id, available_quantity, earliest_dispatch_date, updated_at) VALUES
    ('PRD-T09', 'WH-A', 250.000, '2026-10-10', SYSUTCDATETIME()),
    ('PRD-T09', 'WH-B', 50.000,  '2026-10-10', SYSUTCDATETIME()),
    ('PRD-T09', 'WH-C', 50.000,  '2026-10-10', SYSUTCDATETIME());

-- PRD-T18: concurrency test - WH-A has exactly 600, two concurrent orders each request 400
-- (each order's only qualifying warehouse is WH-A) -> only one can be RELEASED from WH-A.
INSERT INTO dbo.Inventory_selvalakshmi (product_id, warehouse_id, available_quantity, earliest_dispatch_date, updated_at) VALUES
    ('PRD-T18', 'WH-A', 600.000, '2026-10-05', SYSUTCDATETIME()),
    ('PRD-T18', 'WH-B', 10.000,  '2026-10-05', SYSUTCDATETIME()),
    ('PRD-T18', 'WH-C', 10.000,  '2026-10-05', SYSUTCDATETIME());

-- PRD-NOSTOCK: intentionally has NO inventory rows in any warehouse (T-06 / T-29 / PRODUCT_NOT_FOUND).

-- ----------------------------------------------------------------------------
-- version2.md §7 - Stage 2 priority-customer inventory fixtures.
-- Order quantities used by the corresponding test scenario are noted inline;
-- dispatch dates are informational only for priority orders (D-15).
-- ----------------------------------------------------------------------------

-- PRD-P20: T-20 - order qty 300; WH-A alone already has 100% -> RELEASED from WH-A only.
INSERT INTO dbo.Inventory_selvalakshmi (product_id, warehouse_id, available_quantity, earliest_dispatch_date, updated_at) VALUES
    ('PRD-P20', 'WH-A', 500.000, '2026-10-05', SYSUTCDATETIME()),
    ('PRD-P20', 'WH-B', 50.000,  '2026-10-05', SYSUTCDATETIME()),
    ('PRD-P20', 'WH-C', 50.000,  '2026-10-05', SYSUTCDATETIME());

-- PRD-P21: T-21 - order qty 500; no single warehouse suffices, but WH-A (300) + WH-B (200)
-- combined equal exactly the requested quantity -> RELEASED, two allocation rows.
INSERT INTO dbo.Inventory_selvalakshmi (product_id, warehouse_id, available_quantity, earliest_dispatch_date, updated_at) VALUES
    ('PRD-P21', 'WH-A', 300.000, '2026-10-05', SYSUTCDATETIME()),
    ('PRD-P21', 'WH-B', 200.000, '2026-10-07', SYSUTCDATETIME()),
    ('PRD-P21', 'WH-C', 10.000,  '2026-10-05', SYSUTCDATETIME());

-- PRD-P22: T-22 - order qty 1000; combined WH-A+B+C = 700 = exactly 70% (inclusive boundary)
-- -> PARTIALLY_RELEASED, released 700, one Open backorder for 300.
INSERT INTO dbo.Inventory_selvalakshmi (product_id, warehouse_id, available_quantity, earliest_dispatch_date, updated_at) VALUES
    ('PRD-P22', 'WH-A', 300.000, '2026-10-05', SYSUTCDATETIME()),
    ('PRD-P22', 'WH-B', 250.000, '2026-10-06', SYSUTCDATETIME()),
    ('PRD-P22', 'WH-C', 150.000, '2026-10-07', SYSUTCDATETIME());

-- PRD-P23: T-23 - order qty 1000; combined WH-A+B+C = 699.999 = 69.9999% -> below the
-- 70% threshold -> BLOCKED / INSUFFICIENT_STOCK, no allocation, no backorder.
INSERT INTO dbo.Inventory_selvalakshmi (product_id, warehouse_id, available_quantity, earliest_dispatch_date, updated_at) VALUES
    ('PRD-P23', 'WH-A', 300.000,  '2026-10-05', SYSUTCDATETIME()),
    ('PRD-P23', 'WH-B', 250.000,  '2026-10-06', SYSUTCDATETIME()),
    ('PRD-P23', 'WH-C', 149.999,  '2026-10-07', SYSUTCDATETIME());

-- PRD-P24: T-24 - order qty 300; no single warehouse suffices (WH-A=200) but WH-A + WH-B
-- combined (200+500=700) exceeds the requested quantity -> released never exceeds qty
-- (WH-A 200 + WH-B 100 of its 500), WH-C untouched, WH-B's remaining 400 left alone.
INSERT INTO dbo.Inventory_selvalakshmi (product_id, warehouse_id, available_quantity, earliest_dispatch_date, updated_at) VALUES
    ('PRD-P24', 'WH-A', 200.000, '2026-10-05', SYSUTCDATETIME()),
    ('PRD-P24', 'WH-B', 500.000, '2026-10-06', SYSUTCDATETIME()),
    ('PRD-P24', 'WH-C', 500.000, '2026-10-07', SYSUTCDATETIME());

-- PRD-P25: T-25 - order qty 1000; WH-A has partial stock (300), WH-B is zero (must be
-- skipped, not a zero-quantity allocation row), WH-C (400) covers the rest needed to
-- reach the 70% threshold (300+400=700) -> PARTIALLY_RELEASED, allocation rows for
-- WH-A and WH-C only.
INSERT INTO dbo.Inventory_selvalakshmi (product_id, warehouse_id, available_quantity, earliest_dispatch_date, updated_at) VALUES
    ('PRD-P25', 'WH-A', 300.000, '2026-10-05', SYSUTCDATETIME()),
    ('PRD-P25', 'WH-B', 0.000,   '2026-10-05', SYSUTCDATETIME()),
    ('PRD-P25', 'WH-C', 400.000, '2026-10-07', SYSUTCDATETIME());
GO
