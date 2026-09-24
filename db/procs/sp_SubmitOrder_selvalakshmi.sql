-- ============================================================================
-- sp_SubmitOrder_selvalakshmi
-- Wraps the full release/block transaction: insert OrderHeader, (if the
-- caller's decision is RELEASED) call sp_TryAllocateInventory_selvalakshmi for
-- the ALREADY-SELECTED warehouse, then insert OrderFulfilment - all in ONE
-- transaction (FR-07 / NFR-01).
--
-- The warehouse-selection DECISION (which warehouse, in what priority order,
-- whether the date is met) is made by the TypeScript Fulfilment Engine before
-- this procedure is called - this procedure only performs the atomic
-- persistence + stock deduction.
--
-- If the targeted warehouse's stock was consumed by a concurrent order between
-- the engine's read and this call, @allocation_succeeded is returned 0 and the
-- ENTIRE transaction (including the OrderHeader insert) is rolled back, so the
-- caller can safely re-run warehouse selection against fresh inventory and
-- call this procedure again (falling through to the next warehouse in
-- priority order, or blocking if none remain) - see development.md #6.4.
-- ============================================================================

USE IDBTesting;
GO

IF OBJECT_ID('dbo.sp_SubmitOrder_selvalakshmi', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_SubmitOrder_selvalakshmi;
GO

CREATE PROCEDURE dbo.sp_SubmitOrder_selvalakshmi
    @order_id                  VARCHAR(30),
    @customer_id               VARCHAR(20),
    @customer_type             VARCHAR(20) = NULL,
    @product_id                VARCHAR(20),
    @quantity                  DECIMAL(18,3),
    @promised_delivery_date    DATE,
    @status                    VARCHAR(20),        -- 'RELEASED' | 'BLOCKED'
    @block_reason_code         VARCHAR(40) = NULL,
    @block_reason              VARCHAR(300) = NULL,
    @selected_warehouse_id     VARCHAR(10) = NULL,
    @warehouse_dispatch_date   DATE = NULL,
    @expected_delivery_date    DATE = NULL,
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

    IF @status = 'RELEASED'
    BEGIN
        EXEC dbo.sp_TryAllocateInventory_selvalakshmi
            @product_id   = @product_id,
            @warehouse_id = @selected_warehouse_id,
            @quantity     = @quantity,
            @success      = @alloc_success OUTPUT;

        IF @alloc_success = 0
        BEGIN
            ROLLBACK TRANSACTION;
            SET @allocation_succeeded = 0;
            RETURN;
        END

        INSERT INTO dbo.OrderFulfilment_selvalakshmi
            (order_id, status, block_reason_code, block_reason, selected_warehouse_id,
             allocated_quantity, warehouse_dispatch_date, expected_delivery_date, evaluated_at)
        VALUES
            (@order_id, 'RELEASED', NULL, NULL, @selected_warehouse_id,
             @quantity, @warehouse_dispatch_date, @expected_delivery_date, @now);
    END
    ELSE
    BEGIN
        INSERT INTO dbo.OrderFulfilment_selvalakshmi
            (order_id, status, block_reason_code, block_reason, selected_warehouse_id,
             allocated_quantity, warehouse_dispatch_date, expected_delivery_date, evaluated_at)
        VALUES
            (@order_id, 'BLOCKED', @block_reason_code, @block_reason, NULL,
             NULL, NULL, NULL, @now);
    END

    COMMIT TRANSACTION;
    SET @allocation_succeeded = 1;
END
GO
