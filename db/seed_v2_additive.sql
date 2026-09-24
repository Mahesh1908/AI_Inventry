-- ============================================================================
-- version2.md §7 - Stage 2 priority-customer seed fixtures, additive only.
-- Safe to run against a database that already has Stage 1 seed data; does
-- not touch any existing rows.
-- ============================================================================

USE IDBTesting;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Product_selvalakshmi WHERE product_id = 'PRD-P20')
BEGIN
    INSERT INTO dbo.Product_selvalakshmi (product_id, product_name, uom, is_active) VALUES
        ('PRD-P20', 'Priority Test Blend 20', 'BAG', 1),
        ('PRD-P21', 'Priority Test Blend 21', 'BAG', 1),
        ('PRD-P22', 'Priority Test Blend 22', 'BAG', 1),
        ('PRD-P23', 'Priority Test Blend 23', 'BAG', 1),
        ('PRD-P24', 'Priority Test Blend 24', 'BAG', 1),
        ('PRD-P25', 'Priority Test Blend 25', 'BAG', 1);

    INSERT INTO dbo.Inventory_selvalakshmi (product_id, warehouse_id, available_quantity, earliest_dispatch_date, updated_at) VALUES
        ('PRD-P20', 'WH-A', 500.000, '2026-10-05', SYSUTCDATETIME()),
        ('PRD-P20', 'WH-B', 50.000,  '2026-10-05', SYSUTCDATETIME()),
        ('PRD-P20', 'WH-C', 50.000,  '2026-10-05', SYSUTCDATETIME()),

        ('PRD-P21', 'WH-A', 300.000, '2026-10-05', SYSUTCDATETIME()),
        ('PRD-P21', 'WH-B', 200.000, '2026-10-07', SYSUTCDATETIME()),
        ('PRD-P21', 'WH-C', 10.000,  '2026-10-05', SYSUTCDATETIME()),

        ('PRD-P22', 'WH-A', 300.000, '2026-10-05', SYSUTCDATETIME()),
        ('PRD-P22', 'WH-B', 250.000, '2026-10-06', SYSUTCDATETIME()),
        ('PRD-P22', 'WH-C', 150.000, '2026-10-07', SYSUTCDATETIME()),

        ('PRD-P23', 'WH-A', 300.000,  '2026-10-05', SYSUTCDATETIME()),
        ('PRD-P23', 'WH-B', 250.000,  '2026-10-06', SYSUTCDATETIME()),
        ('PRD-P23', 'WH-C', 149.999,  '2026-10-07', SYSUTCDATETIME()),

        ('PRD-P24', 'WH-A', 200.000, '2026-10-05', SYSUTCDATETIME()),
        ('PRD-P24', 'WH-B', 500.000, '2026-10-06', SYSUTCDATETIME()),
        ('PRD-P24', 'WH-C', 500.000, '2026-10-07', SYSUTCDATETIME()),

        ('PRD-P25', 'WH-A', 300.000, '2026-10-05', SYSUTCDATETIME()),
        ('PRD-P25', 'WH-B', 0.000,   '2026-10-05', SYSUTCDATETIME()),
        ('PRD-P25', 'WH-C', 400.000, '2026-10-07', SYSUTCDATETIME());
END
GO
