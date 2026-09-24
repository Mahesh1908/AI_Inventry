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
    customer_type           VARCHAR(20)     NULL,
    product_id              VARCHAR(20)     NOT NULL,
    quantity                DECIMAL(18,3)   NOT NULL,
    promised_delivery_date  DATE            NOT NULL,
    submitted_at            DATETIME2       NOT NULL CONSTRAINT DF_OrderHeader_selvalakshmi_submitted_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_OrderHeader_selvalakshmi PRIMARY KEY (order_id),
    CONSTRAINT CK_OrderHeader_selvalakshmi_quantity CHECK (quantity > 0)
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
    status                    VARCHAR(20)     NOT NULL,
    block_reason_code         VARCHAR(40)     NULL,
    block_reason              VARCHAR(300)    NULL,
    selected_warehouse_id     VARCHAR(10)     NULL,
    allocated_quantity        DECIMAL(18,3)   NULL,
    warehouse_dispatch_date   DATE            NULL,
    expected_delivery_date    DATE            NULL,
    evaluated_at              DATETIME2       NOT NULL CONSTRAINT DF_OrderFulfilment_selvalakshmi_evaluated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_OrderFulfilment_selvalakshmi PRIMARY KEY (order_id),
    CONSTRAINT FK_OrderFulfilment_selvalakshmi_OrderHeader FOREIGN KEY (order_id) REFERENCES dbo.OrderHeader_selvalakshmi(order_id),
    CONSTRAINT FK_OrderFulfilment_selvalakshmi_Warehouse FOREIGN KEY (selected_warehouse_id) REFERENCES dbo.Warehouse_selvalakshmi(warehouse_id),
    CONSTRAINT CK_OrderFulfilment_selvalakshmi_status CHECK (status IN ('RELEASED', 'BLOCKED')),
    CONSTRAINT CK_OrderFulfilment_selvalakshmi_allocated_quantity CHECK (allocated_quantity IS NULL OR allocated_quantity > 0)
);
GO

-- ----------------------------------------------------------------------------
-- Helpful indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IX_Inventory_selvalakshmi_product ON dbo.Inventory_selvalakshmi(product_id);
CREATE INDEX IX_OrderHeader_selvalakshmi_customer ON dbo.OrderHeader_selvalakshmi(customer_id);
CREATE INDEX IX_OrderFulfilment_selvalakshmi_status ON dbo.OrderFulfilment_selvalakshmi(status);
GO
