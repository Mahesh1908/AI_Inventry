import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listOrders } from '../api/client';
import type { OrderFulfilmentResponse } from '../types/api';

export default function OrdersList() {
  const [orders, setOrders] = useState<OrderFulfilmentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    listOrders()
      .then(setOrders)
      .catch(() => setError('Failed to load orders'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading orders…</p>;
  if (error) return <p className="panel panel-error">{error}</p>;

  return (
    <section>
      <h2>Orders</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Order Id</th>
            <th>Status</th>
            <th>Reason / Warehouse</th>
            <th>Promised Date</th>
            <th>Expected Date</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.orderId} onClick={() => navigate(`/lookup?orderId=${encodeURIComponent(o.orderId)}`)}>
              <td>{o.orderId}</td>
              <td>
                <span className={o.status === 'RELEASED' ? 'status-released' : 'status-blocked'}>{o.status}</span>
              </td>
              <td>{o.status === 'RELEASED' ? o.allocations[0]?.warehouseId : o.reason}</td>
              <td>{o.promisedDeliveryDate}</td>
              <td>{o.expectedDeliveryDate ?? '—'}</td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={5}>No orders yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
