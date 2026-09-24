import { getPool } from '../config/db';
import { Warehouse } from '../types/domain';

export async function listWarehouses(): Promise<Warehouse[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query(`SELECT warehouse_id, warehouse_name, location, is_active FROM dbo.Warehouse_selvalakshmi ORDER BY warehouse_id`);

  return result.recordset.map((row) => ({
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name,
    location: row.location,
    isActive: !!row.is_active,
  }));
}
