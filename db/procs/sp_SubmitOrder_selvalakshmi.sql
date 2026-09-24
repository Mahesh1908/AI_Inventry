-- ============================================================================
-- sp_SubmitOrder_selvalakshmi
-- Wraps the full release/block transaction: insert OrderHeader, (if the
-- caller's decision is RELEASED or PARTIALLY_RELEASED) call
-- sp_TryAllocateInventory_selvalakshmi for each ALREADY-SELECTED warehouse
-- (up to three - the fixed WH-A/B/C set, version2.md §5.2/§5.5), insert one
-- OrderAllocation_selvalakshmi row per warehouse actually drawn from, insert
-- the Backorder_selvalakshmi row when PARTIALLY_RELEASED, then insert
-- OrderFulfilment - all in ONE transaction (FR-07 / NFR-01, version2.md §5.5).
--
-- The warehouse-selection DECISION (which warehouse(s), in what priority
-- order, how much from each) is made by the TypeScript Fulfilment Engine
-- before this procedure is called - this procedure only performs the atomic
-- persistence + stock deduction.
--
-- If ANY targeted warehouse's stock was consumed by a concurrent order
-- between the engine's read and this call, @allocation_succeeded is returned
-- 0 and the ENTIRE transaction (including the OrderHeader insert and any
-- warehouses already deducted earlier in this same call) is rolled back, so
-- the caller can safely re-run warehouse selection against fresh inventory
-- and call this procedure again - see development.md §6.4 / version2.md §5.5.
-- ============================================================================

USE IDBTesting;
GO

IF OBJECT_ID('dbo.sp_SubmitOrder_selvalakshmi', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_SubmitOrder_selvalakshmi;
GO

CREATE PROCEDURE dbo.sp_SubmitOrder_selvalakshmi
    @order_id                  VARCHAR(30),
    @customer_id               VARCHAR(20),
    @customer_type             VARCHAR(20),
    @product_id                VARCHAR(20),
    @quantity                  DECIMAL(18,3),
    @promised_delivery_date    DATE,
    @status                    VARCHAR(20),        -- 'RELEASED' | 'PARTIALLY_RELEASED' | 'BLOCKED'
    @block_reason_code         VARCHAR(40)     = NULL,
    @block_reason              VARCHAR(300)    = NULL,
    @released_quantity         DECIMAL(18,3)   = 0,
    @backordered_quantity      DECIMAL(18,3)   = 0,
    @expected_delivery_date    DATE            = NULL,
    -- Up to three warehouse allocations - the system has exactly WH-A/B/C
    -- (version2.md §5.2), so fixed slots avoid a table-valued parameter.
    @warehouse_id_1            VARCHAR(10)     = NULL,
    @allocated_quantity_1      DECIMAL(18,3)   = NULL,
    @warehouse_dispatch_date_1 DATE            = NULL,
    @warehouse_id_2            VARCHAR(10)     = NULL,
    @allocated_quantity_2      DECIMAL(18,3)   = NULL,
    @warehouse_dispatch_date_2 DATE            = NULL,
    @warehouse_id_3            VARCHAR(10)     = NULL,
    @allocated_quantity_3      DECIMAL(18,3)   = NULL,
    @warehouse_dispatch_date_3 DATE            = NULL,
    @allocation_succeeded      BIT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @now DATETIME2 = SYSUTCDATETIME();
    DECLARE @alloc_success BIT = 1;

    BEGIN TRANSACTION;

    INSERT INTO dbo.OrderHeader_selvalakshmi
        (order_id, customer_id, customer_type, product_id, quantity, promised_delivery_date, submitted_at)
    VALUES
        (@order_id, @customer_id, @customer_type, @product_id, @quantity, @promised_delivery_date, @now);

    IF @status IN ('RELEASED', 'PARTIALLY_RELEASED')
    BEGIN
        IF @warehouse_id_1 IS NOT NULL
        BEGIN
            EXEC dbo.sp_TryAllocateInventory_selvalakshmi
                @product_id   = @product_id,
                @warehouse_id = @warehouse_id_1,
                @quantity     = @allocated_quantity_1,
                @success      = @alloc_success OUTPUT;

            IF @alloc_success = 0
            BEGIN
                ROLLBACK TRANSACTION;
                SET @allocation_succeeded = 0;
                RETURN;
            END

            INSERT INTO dbo.OrderAllocation_selvalakshmi
                (order_id, warehouse_id, allocated_quantity, warehouse_dispatch_date, created_at)
            VALUES
                (@order_id, @warehouse_id_1, @allocated_quantity_1, @warehouse_dispatch_date_1, @now);
        END

        IF @warehouse_id_2 IS NOT NULL
        BEGIN
            EXEC dbo.sp_TryAllocateInventory_selvalakshmi
                @product_id   = @product_id,
                @warehouse_id = @warehouse_id_2,
                @quantity     = @allocated_quantity_2,
                @success      = @alloc_success OUTPUT;

            IF @alloc_success = 0
            BEGIN
                ROLLBACK TRANSACTION;
                SET @allocation_succeeded = 0;
                RETURN;
            END

            INSERT INTO dbo.OrderAllocation_selvalakshmi
                (order_id, warehouse_id, allocated_quantity, warehouse_dispatch_date, created_at)
            VALUES
                (@order_id, @warehouse_id_2, @allocated_quantity_2, @warehouse_dispatch_date_2, @now);
        END

        IF @warehouse_id_3 IS NOT NULL
        BEGIN
            EXEC dbo.sp_TryAllocateInventory_selvalakshmi
                @product_id   = @product_id,
                @warehouse_id = @warehouse_id_3,
                @quantity     = @allocated_quantity_3,
                @success      = @alloc_success OUTPUT;

            IF @alloc_success = 0
            BEGIN
                ROLLBACK TRANSACTION;
                SET @allocation_succeeded = 0;
                RETURN;
            END

            INSERT INTO dbo.OrderAllocation_selvalakshmi
                (order_id, warehouse_id, allocated_quantity, warehouse_dispatch_date, created_at)
            VALUES
                (@order_id, @warehouse_id_3, @allocated_quantity_3, @warehouse_dispatch_date_3, @now);
        END

        IF @status = 'PARTIALLY_RELEASED'
        BEGIN
            INSERT INTO dbo.Backorder_selvalakshmi
                (order_id, backordered_quantity, status, created_at, updated_at)
            VALUES
                (@order_id, @backordered_quantity, 'OPEN', @now, @now);
        END

        INSERT INTO dbo.OrderFulfilment_selvalakshmi
            (order_id, status, block_reason_code, block_reason, selected_warehouse_id,
             allocated_quantity, warehouse_dispatch_date, expected_delivery_date,
             released_quantity, backordered_quantity, evaluated_at)
        VALUES
            (@order_id, @status, NULL, NULL, NULL,
             NULL, NULL, @expected_delivery_date,
             @released_quantity, @backordered_quantity, @now);
    END
    ELSE
    BEGIN
        -- BLOCKED: released_quantity=0, backordered_quantity=full quantity
        -- (version2.md §3.5 invariant), but NO Backorder row (§3.4 - a
        -- backorder row exists only for PARTIALLY_RELEASED).
        INSERT INTO dbo.OrderFulfilment_selvalakshmi
            (order_id, status, block_reason_code, block_reason, selected_warehouse_id,
             allocated_quantity, warehouse_dispatch_date, expected_delivery_date,
             released_quantity, backordered_quantity, evaluated_at)
        VALUES
            (@order_id, 'BLOCKED', @block_reason_code, @block_reason, NULL,
             NULL, NULL, NULL,
             0, @quantity, @now);
    END

    COMMIT TRANSACTION;
    SET @allocation_succeeded = 1;
END
GO
