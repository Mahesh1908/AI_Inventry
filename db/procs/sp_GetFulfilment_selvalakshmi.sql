-- ============================================================================
-- sp_GetFulfilment_selvalakshmi
-- Retrieves the stored fulfilment result (with order + warehouse detail) for
-- a given order_id. Returns zero rows when the order_id is unknown - the API
-- layer maps that to HTTP 404 / ORDER_NOT_FOUND.
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
        f.selected_warehouse_id,
        f.allocated_quantity,
        f.warehouse_dispatch_date,
        f.expected_delivery_date,
        f.evaluated_at
    FROM dbo.OrderHeader_selvalakshmi oh
    INNER JOIN dbo.OrderFulfilment_selvalakshmi f ON f.order_id = oh.order_id
    WHERE oh.order_id = @order_id;
END
GO
