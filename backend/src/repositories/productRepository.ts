import { getPool, sql } from '../config/db';
import { Product } from '../types/domain';

export async function listProducts(): Promise<Product[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query(`SELECT product_id, product_name, uom, is_active FROM dbo.Product_selvalakshmi ORDER BY product_id`);

  return result.recordset.map((row) => ({
    productId: row.product_id,
    productName: row.product_name,
    uom: row.uom,
    isActive: !!row.is_active,
  }));
}

export async function findProductById(productId: string): Promise<Product | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('productId', sql.VarChar(20), productId)
    .query(`SELECT product_id, product_name, uom, is_active FROM dbo.Product_selvalakshmi WHERE product_id = @productId`);

  const row = result.recordset[0];
  if (!row) return null;

  return {
    productId: row.product_id,
    productName: row.product_name,
    uom: row.uom,
    isActive: !!row.is_active,
  };
}
