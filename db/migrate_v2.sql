-- ============================================================================
-- version2.md — Stage 2 additive migration
-- Non-destructive: ALTERs existing tables and backfills existing rows instead
-- of dropping/recreating (unlike schema.sql, which is a full from-scratch
-- rebuild). Safe to run against a database that already has Stage 1 data.
-- ============================================================================

USE IDBTesting;
GO

-- ----------------------------------------------------------------------------
-- 1. OrderHeader_selvalakshmi.customer_type -> required, validated enum
-- ----------------------------------------------------------------------------
-- Stage 1 left customer_type as free-text pass-through, so a prior test run
-- may have stored arbitrary values; normalize anything that isn't already
-- one of the new valid values to 'Standard' before making it NOT NULL.
UPDATE dbo.OrderHeader_selvalakshmi
SET customer_type = 'Standard'
WHERE customer_type IS NULL OR customer_type NOT IN ('Standard', 'Priority');
GO

ALTER TABLE dbo.OrderHeader_selvalakshmi
    ALTER COLUMN customer_type VARCHAR(20) NOT NULL;
GO

ALTER TABLE dbo.OrderHeader_selvalakshmi
    ADD CONSTRAINT CK_OrderHeader_selvalakshmi_customer_type CHECK (customer_type IN ('Standard', 'Priority'));
GO

-- ----------------------------------------------------------------------------
-- 2. OrderFulfilment_selvalakshmi — new columns + PARTIALLY_RELEASED status
-- ----------------------------------------------------------------------------
ALTER TABLE dbo.OrderFulfilment_selvalakshmi
    ADD released_quantity    DECIMAL(18,3) NULL,
        backordered_quantity DECIMAL(18,3) NULL;
GO

-- Backfill from existing Stage 1 rows (only RELEASED/BLOCKED exist so far).
UPDATE f
SET f.released_quantity = CASE WHEN f.status = 'RELEASED' THEN oh.quantity ELSE 0 END,
    f.backordered_quantity = CASE WHEN f.status = 'RELEASED' THEN 0 ELSE oh.quantity END
FROM dbo.OrderFulfilment_selvalakshmi f
INNER JOIN dbo.OrderHeader_selvalakshmi oh ON oh.order_id = f.order_id
WHERE f.released_quantity IS NULL OR f.backordered_quantity IS NULL;
GO

ALTER TABLE dbo.OrderFulfilment_selvalakshmi
    ALTER COLUMN released_quantity DECIMAL(18,3) NOT NULL;
GO
ALTER TABLE dbo.OrderFulfilment_selvalakshmi
    ALTER COLUMN backordered_quantity DECIMAL(18,3) NOT NULL;
GO

ALTER TABLE dbo.OrderFulfilment_selvalakshmi
    ADD CONSTRAINT DF_OrderFulfilment_selvalakshmi_released_quantity DEFAULT (0) FOR released_quantity;
GO
ALTER TABLE dbo.OrderFulfilment_selvalakshmi
    ADD CONSTRAINT DF_OrderFulfilment_selvalakshmi_backordered_quantity DEFAULT (0) FOR backordered_quantity;
GO

ALTER TABLE dbo.OrderFulfilment_selvalakshmi
    ADD CONSTRAINT CK_OrderFulfilment_selvalakshmi_released_quantity CHECK (released_quantity >= 0);
GO
ALTER TABLE dbo.OrderFulfilment_selvalakshmi
    ADD CONSTRAINT CK_OrderFulfilment_selvalakshmi_backordered_quantity CHECK (backordered_quantity >= 0);
GO

ALTER TABLE dbo.OrderFulfilment_selvalakshmi
    DROP CONSTRAINT CK_OrderFulfilment_selvalakshmi_status;
GO
ALTER TABLE dbo.OrderFulfilment_selvalakshmi
    ADD CONSTRAINT CK_OrderFulfilment_selvalakshmi_status CHECK (status IN ('RELEASED', 'PARTIALLY_RELEASED', 'BLOCKED'));
GO

-- ----------------------------------------------------------------------------
-- 3. AppConfig_selvalakshmi
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.AppConfig_selvalakshmi', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AppConfig_selvalakshmi (
        config_key      VARCHAR(50)     NOT NULL,
        config_value    VARCHAR(50)     NOT NULL,
        updated_at      DATETIME2       NOT NULL CONSTRAINT DF_AppConfig_selvalakshmi_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_AppConfig_selvalakshmi PRIMARY KEY (config_key)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.AppConfig_selvalakshmi WHERE config_key = 'PRIORITY_RELEASE_THRESHOLD_PCT')
BEGIN
    INSERT INTO dbo.AppConfig_selvalakshmi (config_key, config_value, updated_at) VALUES
        ('PRIORITY_RELEASE_THRESHOLD_PCT', '70', SYSUTCDATETIME());
END
GO

-- ----------------------------------------------------------------------------
-- 4. OrderAllocation_selvalakshmi (+ backfill from Stage 1 single-warehouse rows)
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.OrderAllocation_selvalakshmi', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.OrderAllocation_selvalakshmi (
        order_id                  VARCHAR(30)     NOT NULL,
        warehouse_id               VARCHAR(10)     NOT NULL,
        allocated_quantity         DECIMAL(18,3)   NOT NULL,
        warehouse_dispatch_date    DATE            NOT NULL,
        created_at                 DATETIME2       NOT NULL CONSTRAINT DF_OrderAllocation_selvalakshmi_created_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_OrderAllocation_selvalakshmi PRIMARY KEY (order_id, warehouse_id),
        CONSTRAINT FK_OrderAllocation_selvalakshmi_OrderHeader FOREIGN KEY (order_id) REFERENCES dbo.OrderHeader_selvalakshmi(order_id),
        CONSTRAINT FK_OrderAllocation_selvalakshmi_Warehouse FOREIGN KEY (warehouse_id) REFERENCES dbo.Warehouse_selvalakshmi(warehouse_id),
        CONSTRAINT CK_OrderAllocation_selvalakshmi_allocated_quantity CHECK (allocated_quantity > 0)
    );
END
GO

INSERT INTO dbo.OrderAllocation_selvalakshmi (order_id, warehouse_id, allocated_quantity, warehouse_dispatch_date, created_at)
SELECT f.order_id, f.selected_warehouse_id, f.allocated_quantity, f.warehouse_dispatch_date, f.evaluated_at
FROM dbo.OrderFulfilment_selvalakshmi f
WHERE f.status = 'RELEASED'
  AND f.selected_warehouse_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM dbo.OrderAllocation_selvalakshmi oa WHERE oa.order_id = f.order_id
  );
GO

-- ----------------------------------------------------------------------------
-- 5. Backorder_selvalakshmi
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.Backorder_selvalakshmi', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Backorder_selvalakshmi (
        order_id                VARCHAR(30)     NOT NULL,
        backordered_quantity    DECIMAL(18,3)   NOT NULL,
        status                  VARCHAR(20)     NOT NULL CONSTRAINT DF_Backorder_selvalakshmi_status DEFAULT ('OPEN'),
        created_at               DATETIME2       NOT NULL CONSTRAINT DF_Backorder_selvalakshmi_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at               DATETIME2       NOT NULL CONSTRAINT DF_Backorder_selvalakshmi_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_Backorder_selvalakshmi PRIMARY KEY (order_id),
        CONSTRAINT FK_Backorder_selvalakshmi_OrderHeader FOREIGN KEY (order_id) REFERENCES dbo.OrderHeader_selvalakshmi(order_id),
        CONSTRAINT CK_Backorder_selvalakshmi_quantity CHECK (backordered_quantity > 0),
        CONSTRAINT CK_Backorder_selvalakshmi_status CHECK (status IN ('OPEN'))
    );
END
GO

-- ----------------------------------------------------------------------------
-- 6. Helpful index
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_OrderAllocation_selvalakshmi_warehouse')
BEGIN
    CREATE INDEX IX_OrderAllocation_selvalakshmi_warehouse ON dbo.OrderAllocation_selvalakshmi(warehouse_id);
END
GO
