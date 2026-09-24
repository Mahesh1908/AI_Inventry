import { useEffect, useState } from 'react';
import { listInventory, listProducts } from '../api/client';
import type { InventoryRow, Product } from '../types/api';

export default function InventoryView() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productFilter, setProductFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProducts()
      .then(setProducts)
      .catch(() => {
        /* non-fatal — filter dropdown is a convenience */
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    listInventory(productFilter || undefined)
      .then(setRows)
      .catch(() => setError('Failed to load inventory'))
      .finally(() => setLoading(false));
  }, [productFilter]);

  const productName = (id: string) => products.find((p) => p.productId === id)?.productName ?? id;

  return (
    <section>
      <h2>Inventory View</h2>
      <label>
        Filter by product
        <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.productId} value={p.productId}>
              {p.productId} — {p.productName}
            </option>
          ))}
        </select>
      </label>

      {loading && <p>Loading inventory…</p>}
      {error && <p className="panel panel-error">{error}</p>}

      {!loading && !error && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Warehouse</th>
              <th>Available Quantity</th>
              <th>Earliest Dispatch Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.productId}-${row.warehouseId}`}>
                <td>
                  {row.productId} — {productName(row.productId)}
                </td>
                <td>{row.warehouseId}</td>
                <td>{row.availableQuantity}</td>
                <td>{row.earliestDispatchDate}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4}>No inventory rows found.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
