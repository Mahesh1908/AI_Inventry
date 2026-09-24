import { getPool, sql } from '../config/db';
import { InventoryRow } from '../types/domain';

function toDateOnlyString(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapRow(row: any): InventoryRow {
  return {
    productId: row.product_id,
    warehouseId: row.warehouse_id,
    availableQuantity: Number(row.available_quantity),
    earliestDispatchDate: toDateOnlyString(row.earliest_dispatch_date),
  };
}

export async function getInventoryForProduct(productId: string): Promise<InventoryRow[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('productId', sql.VarChar(20), productId)
    .query(
      `SELECT product_id, warehouse_id, available_quantity, earliest_dispatch_date
       FROM dbo.Inventory_selvalakshmi
       WHERE product_id = @productId`
    );

  return result.recordset.map(mapRow);
}

export async function listInventory(productId?: string): Promise<InventoryRow[]> {
  const pool = await getPool();
  const request = pool.request();

  let query = `SELECT product_id, warehouse_id, available_quantity, earliest_dispatch_date
               FROM dbo.Inventory_selvalakshmi`;

  if (productId) {
    request.input('productId', sql.VarChar(20), productId);
    query += ` WHERE product_id = @productId`;
  }

  query += ` ORDER BY product_id, warehouse_id`;

  const result = await request.query(query);
  return result.recordset.map(mapRow);
}
