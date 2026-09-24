import { getPool, sql } from '../config/db';
import { FulfilmentDecision, OrderInput, StoredFulfilment } from '../types/domain';

function toDateOnlyString(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapStoredFulfilmentRow(row: any): StoredFulfilment {
  return {
    orderId: row.order_id,
    customerId: row.customer_id,
    customerType: row.customer_type,
    productId: row.product_id,
    quantity: Number(row.quantity),
    promisedDeliveryDate: toDateOnlyString(row.promised_delivery_date)!,
    submittedAt: new Date(row.submitted_at).toISOString(),
    status: row.status,
    blockReasonCode: row.block_reason_code,
    blockReason: row.block_reason,
    selectedWarehouseId: row.selected_warehouse_id,
    allocatedQuantity: row.allocated_quantity === null ? null : Number(row.allocated_quantity),
    warehouseDispatchDate: toDateOnlyString(row.warehouse_dispatch_date),
    expectedDeliveryDate: toDateOnlyString(row.expected_delivery_date),
    evaluatedAt: new Date(row.evaluated_at).toISOString(),
  };
}

export async function findStoredFulfilment(orderId: string): Promise<StoredFulfilment | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('order_id', sql.VarChar(30), orderId)
    .execute('dbo.sp_GetFulfilment_selvalakshmi');

  const row = result.recordset[0];
  if (!row) return null;
  return mapStoredFulfilmentRow(row);
}

/**
 * Persists the release/block decision in one transaction via
 * sp_SubmitOrder_selvalakshmi. Returns `allocationSucceeded = false` only
 * when a RELEASED decision lost the concurrent stock race on its selected
 * warehouse — in that case NOTHING was persisted (the header insert was
 * rolled back too) and the caller should re-run warehouse selection against
 * fresh inventory and try again.
 */
export async function submitOrder(
  order: OrderInput,
  decision: FulfilmentDecision
): Promise<{ allocationSucceeded: boolean }> {
  const pool = await getPool();
  const request = pool
    .request()
    .input('order_id', sql.VarChar(30), order.orderId)
    .input('customer_id', sql.VarChar(20), order.customerId)
    .input('customer_type', sql.VarChar(20), order.customerType)
    .input('product_id', sql.VarChar(20), order.productId)
    .input('quantity', sql.Decimal(18, 3), order.quantity)
    .input('promised_delivery_date', sql.Date, order.promisedDeliveryDate)
    .input('status', sql.VarChar(20), decision.status)
    .input('block_reason_code', sql.VarChar(40), decision.status === 'BLOCKED' ? decision.blockReasonCode : null)
    .input('block_reason', sql.VarChar(300), decision.status === 'BLOCKED' ? decision.blockReason : null)
    .input('selected_warehouse_id', sql.VarChar(10), decision.status === 'RELEASED' ? decision.selectedWarehouseId : null)
    .input('warehouse_dispatch_date', sql.Date, decision.status === 'RELEASED' ? decision.warehouseDispatchDate : null)
    .input('expected_delivery_date', sql.Date, decision.status === 'RELEASED' ? decision.expectedDeliveryDate : null)
    .output('allocation_succeeded', sql.Bit);

  const result = await request.execute('dbo.sp_SubmitOrder_selvalakshmi');
  return { allocationSucceeded: !!result.output.allocation_succeeded };
}

export async function listOrders(): Promise<StoredFulfilment[]> {
  const pool = await getPool();
  const result = await pool.request().query(
    `SELECT
        oh.order_id, oh.customer_id, oh.customer_type, oh.product_id, oh.quantity,
        oh.promised_delivery_date, oh.submitted_at,
        f.status, f.block_reason_code, f.block_reason, f.selected_warehouse_id,
        f.allocated_quantity, f.warehouse_dispatch_date, f.expected_delivery_date, f.evaluated_at
     FROM dbo.OrderHeader_selvalakshmi oh
     INNER JOIN dbo.OrderFulfilment_selvalakshmi f ON f.order_id = oh.order_id
     ORDER BY oh.submitted_at DESC`
  );

  return result.recordset.map(mapStoredFulfilmentRow);
}
