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
    ('PRD-NOSTOCK', 'Discontinued Blend',         'BAG', 1);  -- T-06 (PRODUCT_NOT_FOUND - no inventory rows)
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

-- PRD-NOSTOCK: intentionally has NO inventory rows in any warehouse (T-06 / PRODUCT_NOT_FOUND).
GO
