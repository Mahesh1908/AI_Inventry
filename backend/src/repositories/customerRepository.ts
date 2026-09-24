import { getPool, sql } from '../config/db';
import { Customer } from '../types/domain';

export async function findCustomerById(customerId: string): Promise<Customer | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('customerId', sql.VarChar(20), customerId)
    .query(
      `SELECT customer_id, customer_name, eligible_status
       FROM dbo.Customer_selvalakshmi
       WHERE customer_id = @customerId`
    );

  const row = result.recordset[0];
  if (!row) return null;

  return {
    customerId: row.customer_id,
    customerName: row.customer_name,
    eligibleStatus: row.eligible_status,
  };
}

export async function listCustomers(): Promise<Customer[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query(`SELECT customer_id, customer_name, eligible_status FROM dbo.Customer_selvalakshmi ORDER BY customer_id`);

  return result.recordset.map((row) => ({
    customerId: row.customer_id,
    customerName: row.customer_name,
    eligibleStatus: row.eligible_status,
  }));
}
