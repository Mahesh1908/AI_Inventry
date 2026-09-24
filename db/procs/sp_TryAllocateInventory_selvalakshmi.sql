-- ============================================================================
-- sp_TryAllocateInventory_selvalakshmi
-- Atomically checks and deducts stock for ONE specific (product_id, warehouse_id)
-- under a row lock, so two concurrent orders cannot oversell the same
-- warehouse's stock (NFR-02). Does not decide which warehouse to try - that
-- decision is made by the Fulfilment Engine in the app layer.
-- ============================================================================

USE IDBTesting;
GO

IF OBJECT_ID('dbo.sp_TryAllocateInventory_selvalakshmi', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_TryAllocateInventory_selvalakshmi;
GO

CREATE PROCEDURE dbo.sp_TryAllocateInventory_selvalakshmi
    @product_id     VARCHAR(20),
    @warehouse_id   VARCHAR(10),
    @quantity       DECIMAL(18,3),
    @success        BIT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @rows_affected INT = 0;
    DECLARE @started_own_transaction BIT = 0;

    IF @@TRANCOUNT = 0
    BEGIN
        BEGIN TRANSACTION;
        SET @started_own_transaction = 1;
    END

    -- UPDLOCK + HOLDLOCK on the targeted row so a concurrent caller blocks
    -- until this transaction commits/rolls back, then re-reads the fresh value.
    UPDATE dbo.Inventory_selvalakshmi WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
    SET available_quantity = available_quantity - @quantity,
        updated_at = SYSUTCDATETIME()
    WHERE product_id = @product_id
      AND warehouse_id = @warehouse_id
      AND available_quantity >= @quantity;

    SET @rows_affected = @@ROWCOUNT;

    IF @rows_affected > 0
        SET @success = 1;
    ELSE
        SET @success = 0;

    IF @started_own_transaction = 1
        COMMIT TRANSACTION;
END
GO
