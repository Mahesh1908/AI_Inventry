import { getPool, sql } from '../config/db';
import {
  AllocationRow,
  CustomerType,
  FulfilmentDecision,
  OrderInput,
  StoredFulfilment,
  WAREHOUSE_PRIORITY_ORDER,
} from '../types/domain';

function toDateOnlyString(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapAllocationRow(row: any): AllocationRow {
  return {
    warehouseId: row.warehouse_id,
    allocatedQuantity: Number(row.allocated_quantity),
    warehouseDispatchDate: toDateOnlyString(row.warehouse_dispatch_date)!,
  };
}

function mapStoredFulfilment(headerRow: any, allocationRows: any[], backorderRow: any | undefined): StoredFulfilment {
  return {
    orderId: headerRow.order_id,
    customerId: headerRow.customer_id,
    customerType: headerRow.customer_type as CustomerType,
    productId: headerRow.product_id,
    quantity: Number(headerRow.quantity),
    promisedDeliveryDate: toDateOnlyString(headerRow.promised_delivery_date)!,
    submittedAt: new Date(headerRow.submitted_at).toISOString(),
    status: headerRow.status,
    blockReasonCode: headerRow.block_reason_code,
    blockReason: headerRow.block_reason,
    releasedQuantity: Number(headerRow.released_quantity),
    backorderedQuantity: Number(headerRow.backordered_quantity),
    allocations: allocationRows.map(mapAllocationRow),
    backorderStatus: backorderRow ? backorderRow.status : null,
    expectedDeliveryDate: toDateOnlyString(headerRow.expected_delivery_date),
    evaluatedAt: new Date(headerRow.evaluated_at).toISOString(),
  };
}

export async function findStoredFulfilment(orderId: string): Promise<StoredFulfilment | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('order_id', sql.VarChar(30), orderId)
    .execute('dbo.sp_GetFulfilment_selvalakshmi');

  const recordsets = result.recordsets as unknown as any[][];
  const headerRow = recordsets[0][0];
  if (!headerRow) return null;

  const allocationRows = recordsets[1] ?? [];
  const backorderRow = recordsets[2]?.[0];
  return mapStoredFulfilment(headerRow, allocationRows, backorderRow);
}

/**
 * version2.md §5.5 — persists the release/partial-release/block decision in
 * one transaction via sp_SubmitOrder_selvalakshmi. Up to three warehouse
 * allocations (fixed WH-A/B/C slots) are passed through; unused slots are
 * NULL. Returns `allocationSucceeded = false` only when one of the targeted
 * warehouses lost the concurrent stock race - in that case NOTHING was
 * persisted (the whole transaction, including the header insert and any
 * warehouses already deducted in this same call, was rolled back) and the
 * caller should re-run the fulfilment engine against fresh inventory.
 */
export async function submitOrder(
  order: OrderInput,
  decision: FulfilmentDecision
): Promise<{ allocationSucceeded: boolean }> {
  const pool = await getPool();

  const allocations = decision.status === 'BLOCKED' ? [] : decision.allocations;
  const slots = WAREHOUSE_PRIORITY_ORDER.map((_, i) => allocations[i] ?? null);

  const releasedQuantity =
    decision.status === 'RELEASED'
      ? order.quantity
      : decision.status === 'PARTIALLY_RELEASED'
        ? decision.releasedQuantity
        : 0;
  const backorderedQuantity =
    decision.status === 'PARTIALLY_RELEASED' ? decision.backorderedQuantity : decision.status === 'BLOCKED' ? order.quantity : 0;
  const expectedDeliveryDate = decision.status === 'BLOCKED' ? null : decision.expectedDeliveryDate;

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
    .input('released_quantity', sql.Decimal(18, 3), releasedQuantity)
    .input('backordered_quantity', sql.Decimal(18, 3), backorderedQuantity)
    .input('expected_delivery_date', sql.Date, expectedDeliveryDate)
    .output('allocation_succeeded', sql.Bit);

  slots.forEach((slot, i) => {
    const n = i + 1;
    request.input(`warehouse_id_${n}`, sql.VarChar(10), slot?.warehouseId ?? null);
    request.input(`allocated_quantity_${n}`, sql.Decimal(18, 3), slot?.allocatedQuantity ?? null);
    request.input(`warehouse_dispatch_date_${n}`, sql.Date, slot?.warehouseDispatchDate ?? null);
  });

  const result = await request.execute('dbo.sp_SubmitOrder_selvalakshmi');
  return { allocationSucceeded: !!result.output.allocation_succeeded };
}

export async function listOrders(): Promise<StoredFulfilment[]> {
  const pool = await getPool();

  const headersResult = await pool.request().query(
    `SELECT
        oh.order_id, oh.customer_id, oh.customer_type, oh.product_id, oh.quantity,
        oh.promised_delivery_date, oh.submitted_at,
        f.status, f.block_reason_code, f.block_reason,
        f.released_quantity, f.backordered_quantity, f.expected_delivery_date, f.evaluated_at
     FROM dbo.OrderHeader_selvalakshmi oh
     INNER JOIN dbo.OrderFulfilment_selvalakshmi f ON f.order_id = oh.order_id
     ORDER BY oh.submitted_at DESC`
  );

  const allocationsResult = await pool
    .request()
    .query(`SELECT order_id, warehouse_id, allocated_quantity, warehouse_dispatch_date FROM dbo.OrderAllocation_selvalakshmi`);

  const backordersResult = await pool.request().query(`SELECT order_id, backordered_quantity, status FROM dbo.Backorder_selvalakshmi`);

  const allocationsByOrder = new Map<string, any[]>();
  for (const row of allocationsResult.recordset) {
    const list = allocationsByOrder.get(row.order_id) ?? [];
    list.push(row);
    allocationsByOrder.set(row.order_id, list);
  }

  const backorderByOrder = new Map<string, any>();
  for (const row of backordersResult.recordset) {
    backorderByOrder.set(row.order_id, row);
  }

  return headersResult.recordset.map((headerRow) =>
    mapStoredFulfilment(headerRow, allocationsByOrder.get(headerRow.order_id) ?? [], backorderByOrder.get(headerRow.order_id))
  );
}
