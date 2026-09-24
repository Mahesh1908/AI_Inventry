-- ============================================================================
-- sp_GetFulfilment_selvalakshmi
-- Retrieves the stored fulfilment result (with order + warehouse detail) for
-- a given order_id. Returns zero rows in the first recordset when the
-- order_id is unknown - the API layer maps that to HTTP 404 / ORDER_NOT_FOUND.
--
-- version2.md §5.7: a priority order can now touch up to three warehouses and
-- carry one Open backorder, so this returns THREE recordsets:
--   1. order header + fulfilment summary (0 or 1 row)
--   2. OrderAllocation rows for this order (0-3 rows)
--   3. Backorder row for this order (0 or 1 row)
-- ============================================================================

USE IDBTesting;
GO

IF OBJECT_ID('dbo.sp_GetFulfilment_selvalakshmi', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_GetFulfilment_selvalakshmi;
GO

CREATE PROCEDURE dbo.sp_GetFulfilment_selvalakshmi
    @order_id VARCHAR(30)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        oh.order_id,
        oh.customer_id,
        oh.customer_type,
        oh.product_id,
        oh.quantity,
        oh.promised_delivery_date,
        oh.submitted_at,
        f.status,
        f.block_reason_code,
        f.block_reason,
        f.released_quantity,
        f.backordered_quantity,
        f.expected_delivery_date,
        f.evaluated_at
    FROM dbo.OrderHeader_selvalakshmi oh
    INNER JOIN dbo.OrderFulfilment_selvalakshmi f ON f.order_id = oh.order_id
    WHERE oh.order_id = @order_id;

    SELECT
        oa.warehouse_id,
        oa.allocated_quantity,
        oa.warehouse_dispatch_date
    FROM dbo.OrderAllocation_selvalakshmi oa
    WHERE oa.order_id = @order_id
    ORDER BY oa.created_at;

    SELECT
        bo.backordered_quantity,
        bo.status
    FROM dbo.Backorder_selvalakshmi bo
    WHERE bo.order_id = @order_id;
END
GO
