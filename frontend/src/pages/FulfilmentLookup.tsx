import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiRequestError, getFulfilment } from '../api/client';
import type { OrderFulfilmentResponse } from '../types/api';

export default function FulfilmentLookup() {
  const [searchParams] = useSearchParams();
  const [orderId, setOrderId] = useState(searchParams.get('orderId') ?? '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OrderFulfilmentResponse | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runLookup = useCallback(async (id: string) => {
    setResult(null);
    setNotFound(null);
    setError(null);
    if (!id.trim()) return;

    setLoading(true);
    try {
      const response = await getFulfilment(id.trim());
      setResult(response);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) {
        setNotFound(id.trim());
      } else if (err instanceof ApiRequestError) {
        setError(err.body.message ?? err.body.error);
      } else {
        setError('Unexpected error looking up order');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const fromUrl = searchParams.get('orderId');
    if (fromUrl) {
      setOrderId(fromUrl);
      runLookup(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    runLookup(orderId);
  }

  return (
    <section>
      <h2>Fulfilment Lookup</h2>
      <form onSubmit={handleSubmit} className="form-inline">
        <label>
          Order Id
          <input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="e.g. ORD-1001" />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Looking up…' : 'Look up'}
        </button>
      </form>

      {notFound && (
        <div className="panel panel-error">
          <p>Order not found: {notFound}</p>
        </div>
      )}

      {error && (
        <div className="panel panel-error">
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className={`panel ${result.status === 'RELEASED' ? 'panel-success' : 'panel-blocked'}`}>
          <h3>
            Order {result.orderId} — {result.status}
          </h3>
          {result.status === 'RELEASED' ? (
            <>
              <p>Released quantity: {result.releasedQuantity}</p>
              {result.allocations.map((a) => (
                <p key={a.warehouseId}>
                  Warehouse {a.warehouseId} — allocated {a.allocatedQuantity}, dispatch {a.warehouseDispatchDate}
                </p>
              ))}
              <p>Expected delivery date: {result.expectedDeliveryDate}</p>
            </>
          ) : (
            <p>Reason: {result.reason}</p>
          )}
          <p>Promised delivery date: {result.promisedDeliveryDate}</p>
          <p>Evaluated at: {result.evaluatedAt}</p>
        </div>
      )}
    </section>
  );
}
