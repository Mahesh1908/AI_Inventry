-- ============================================================================
-- Cement Company Order Fulfilment & Inventory Management System
-- Stage 1 - Schema
-- Target database: IDBTesting (existing database, objects created inside it)
-- All application objects are suffixed `_selvalakshmi` per development.md #3
-- ============================================================================

USE IDBTesting;
GO

-- ----------------------------------------------------------------------------
-- 1. Customer_selvalakshmi
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.Customer_selvalakshmi', 'U') IS NOT NULL
    DROP TABLE dbo.Customer_selvalakshmi;
GO

CREATE TABLE dbo.Customer_selvalakshmi (
    customer_id     VARCHAR(20)     NOT NULL,
    customer_name   VARCHAR(100)    NULL,
    eligible_status VARCHAR(20)     NOT NULL,
    created_at      DATETIME2       NOT NULL CONSTRAINT DF_Customer_selvalakshmi_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at      DATETIME2       NOT NULL CONSTRAINT DF_Customer_selvalakshmi_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Customer_selvalakshmi PRIMARY KEY (customer_id),
    CONSTRAINT CK_Customer_selvalakshmi_eligible_status CHECK (eligible_status IN ('ELIGIBLE', 'NOT_ELIGIBLE'))
);
GO

-- ----------------------------------------------------------------------------
-- 2. Product_selvalakshmi
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.Product_selvalakshmi', 'U') IS NOT NULL
    DROP TABLE dbo.Product_selvalakshmi;
GO

CREATE TABLE dbo.Product_selvalakshmi (
    product_id      VARCHAR(20)     NOT NULL,
    product_name    VARCHAR(100)    NOT NULL,
    uom             VARCHAR(10)     NOT NULL,
    is_active       BIT             NOT NULL CONSTRAINT DF_Product_selvalakshmi_is_active DEFAULT (1),
    CONSTRAINT PK_Product_selvalakshmi PRIMARY KEY (product_id)
);
GO

-- ----------------------------------------------------------------------------
-- 3. Warehouse_selvalakshmi
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.Warehouse_selvalakshmi', 'U') IS NOT NULL
    DROP TABLE dbo.Warehouse_selvalakshmi;
GO

CREATE TABLE dbo.Warehouse_selvalakshmi (
    warehouse_id    VARCHAR(10)     NOT NULL,
    warehouse_name  VARCHAR(100)    NOT NULL,
    location        VARCHAR(100)    NULL,
    is_active       BIT             NOT NULL CONSTRAINT DF_Warehouse_selvalakshmi_is_active DEFAULT (1),
    CONSTRAINT PK_Warehouse_selvalakshmi PRIMARY KEY (warehouse_id)
);
GO

-- ----------------------------------------------------------------------------
-- 4. Inventory_selvalakshmi
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.Inventory_selvalakshmi', 'U') IS NOT NULL
    DROP TABLE dbo.Inventory_selvalakshmi;
GO

CREATE TABLE dbo.Inventory_selvalakshmi (
    product_id              VARCHAR(20)     NOT NULL,
    warehouse_id            VARCHAR(10)     NOT NULL,
    available_quantity      DECIMAL(18,3)   NOT NULL,
    earliest_dispatch_date  DATE            NOT NULL,
    updated_at              DATETIME2       NOT NULL CONSTRAINT DF_Inventory_selvalakshmi_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Inventory_selvalakshmi PRIMARY KEY (product_id, warehouse_id),
    CONSTRAINT FK_Inventory_selvalakshmi_Product FOREIGN KEY (product_id) REFERENCES dbo.Product_selvalakshmi(product_id),
    CONSTRAINT FK_Inventory_selvalakshmi_Warehouse FOREIGN KEY (warehouse_id) REFERENCES dbo.Warehouse_selvalakshmi(warehouse_id),
    CONSTRAINT CK_Inventory_selvalakshmi_available_quantity CHECK (available_quantity >= 0)
);
GO

-- ----------------------------------------------------------------------------
-- 5. OrderHeader_selvalakshmi
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.OrderHeader_selvalakshmi', 'U') IS NOT NULL
    DROP TABLE dbo.OrderHeader_selvalakshmi;
GO

CREATE TABLE dbo.OrderHeader_selvalakshmi (
    order_id                VARCHAR(30)     NOT NULL,
    customer_id             VARCHAR(20)     NOT NULL,
    -- version2.md §3.1 (D-14): required, exactly 'Standard' or 'Priority'.
    -- Was nullable/unused pass-through in Stage 1.
    customer_type           VARCHAR(20)     NOT NULL,
    product_id              VARCHAR(20)     NOT NULL,
    quantity                DECIMAL(18,3)   NOT NULL,
    promised_delivery_date  DATE            NOT NULL,
    submitted_at            DATETIME2       NOT NULL CONSTRAINT DF_OrderHeader_selvalakshmi_submitted_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_OrderHeader_selvalakshmi PRIMARY KEY (order_id),
    CONSTRAINT CK_OrderHeader_selvalakshmi_quantity CHECK (quantity > 0),
    CONSTRAINT CK_OrderHeader_selvalakshmi_customer_type CHECK (customer_type IN ('Standard', 'Priority'))
);
GO

-- ----------------------------------------------------------------------------
-- 6. OrderFulfilment_selvalakshmi
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.OrderFulfilment_selvalakshmi', 'U') IS NOT NULL
    DROP TABLE dbo.OrderFulfilment_selvalakshmi;
GO

CREATE TABLE dbo.OrderFulfilment_selvalakshmi (
    order_id                  VARCHAR(30)     NOT NULL,
    -- version2.md §5.3/D-18: adds 'PARTIALLY_RELEASED' alongside RELEASED/BLOCKED.
    status                    VARCHAR(20)     NOT NULL,
    block_reason_code         VARCHAR(40)     NULL,
    block_reason              VARCHAR(300)    NULL,
    -- Deprecated (version2.md §3.3/D-17): Stage 1's folded single-warehouse
    -- columns. Kept nullable for backward compatibility; no longer written by
    -- new code — read OrderAllocation_selvalakshmi instead.
    selected_warehouse_id     VARCHAR(10)     NULL,
    allocated_quantity        DECIMAL(18,3)   NULL,
    warehouse_dispatch_date   DATE            NULL,
    expected_delivery_date    DATE            NULL,
    -- version2.md §3.5: persisted split of quantity so status reads never need
    -- to join+sum OrderAllocation/Backorder on every GET.
    released_quantity         DECIMAL(18,3)   NOT NULL CONSTRAINT DF_OrderFulfilment_selvalakshmi_released_quantity DEFAULT (0),
    backordered_quantity      DECIMAL(18,3)   NOT NULL CONSTRAINT DF_OrderFulfilment_selvalakshmi_backordered_quantity DEFAULT (0),
    evaluated_at              DATETIME2       NOT NULL CONSTRAINT DF_OrderFulfilment_selvalakshmi_evaluated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_OrderFulfilment_selvalakshmi PRIMARY KEY (order_id),
    CONSTRAINT FK_OrderFulfilment_selvalakshmi_OrderHeader FOREIGN KEY (order_id) REFERENCES dbo.OrderHeader_selvalakshmi(order_id),
    CONSTRAINT FK_OrderFulfilment_selvalakshmi_Warehouse FOREIGN KEY (selected_warehouse_id) REFERENCES dbo.Warehouse_selvalakshmi(warehouse_id),
    CONSTRAINT CK_OrderFulfilment_selvalakshmi_status CHECK (status IN ('RELEASED', 'PARTIALLY_RELEASED', 'BLOCKED')),
    CONSTRAINT CK_OrderFulfilment_selvalakshmi_allocated_quantity CHECK (allocated_quantity IS NULL OR allocated_quantity > 0),
    CONSTRAINT CK_OrderFulfilment_selvalakshmi_released_quantity CHECK (released_quantity >= 0),
    CONSTRAINT CK_OrderFulfilment_selvalakshmi_backordered_quantity CHECK (backordered_quantity >= 0)
);
GO

-- ----------------------------------------------------------------------------
-- 7. AppConfig_selvalakshmi (version2.md §3.2)
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.AppConfig_selvalakshmi', 'U') IS NOT NULL
    DROP TABLE dbo.AppConfig_selvalakshmi;
GO

CREATE TABLE dbo.AppConfig_selvalakshmi (
    config_key      VARCHAR(50)     NOT NULL,
    config_value    VARCHAR(50)     NOT NULL,
    updated_at      DATETIME2       NOT NULL CONSTRAINT DF_AppConfig_selvalakshmi_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_AppConfig_selvalakshmi PRIMARY KEY (config_key)
);
GO

INSERT INTO dbo.AppConfig_selvalakshmi (config_key, config_value, updated_at) VALUES
    ('PRIORITY_RELEASE_THRESHOLD_PCT', '70', SYSUTCDATETIME());
GO

-- ----------------------------------------------------------------------------
-- 8. OrderAllocation_selvalakshmi (version2.md §3.3)
-- Reintroduces the one-to-many table development.md D-07 folded away — a
-- priority order can now legitimately span up to three warehouses.
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.OrderAllocation_selvalakshmi', 'U') IS NOT NULL
    DROP TABLE dbo.OrderAllocation_selvalakshmi;
GO

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
GO

-- ----------------------------------------------------------------------------
-- 9. Backorder_selvalakshmi (version2.md §3.4)
-- At most one backorder per order; exists only when status = PARTIALLY_RELEASED.
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.Backorder_selvalakshmi', 'U') IS NOT NULL
    DROP TABLE dbo.Backorder_selvalakshmi;
GO

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
GO

-- ----------------------------------------------------------------------------
-- Helpful indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IX_Inventory_selvalakshmi_product ON dbo.Inventory_selvalakshmi(product_id);
CREATE INDEX IX_OrderHeader_selvalakshmi_customer ON dbo.OrderHeader_selvalakshmi(customer_id);
CREATE INDEX IX_OrderFulfilment_selvalakshmi_status ON dbo.OrderFulfilment_selvalakshmi(status);
CREATE INDEX IX_OrderAllocation_selvalakshmi_warehouse ON dbo.OrderAllocation_selvalakshmi(warehouse_id);
GO
