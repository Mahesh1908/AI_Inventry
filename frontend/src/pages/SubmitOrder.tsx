import { useState } from "react";
import type { FormEvent } from "react";
import { ApiRequestError, submitOrder } from "../api/client";
import type { OrderFulfilmentResponse } from "../types/api";

interface FormState {
  orderId: string;
  customerId: string;
  customerType: string;
  productId: string;
  quantity: string;
  promisedDeliveryDate: string;
}

const EMPTY_FORM: FormState = {
  orderId: "",
  customerId: "",
  customerType: "",
  productId: "",
  quantity: "",
  promisedDeliveryDate: "",
};

export default function SubmitOrder() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OrderFulfilmentResponse | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validateClientSide(): string[] {
    const missing: string[] = [];
    if (!form.customerId.trim()) missing.push("Customer is required");
    if (!form.productId.trim()) missing.push("Product is required");
    if (!form.quantity.trim() || Number(form.quantity) <= 0)
      missing.push("Quantity must be greater than zero");
    if (!form.promisedDeliveryDate.trim()) missing.push("Promised delivery date is required");
    return missing;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setResult(null);
    setErrors([]);

    const clientErrors = validateClientSide();
    if (clientErrors.length > 0) {
      setErrors(clientErrors);
      return;
    }

    setLoading(true);
    try {
      const response = await submitOrder({
        orderId: form.orderId.trim() || undefined,
        customerId: form.customerId.trim(),
        customerType: form.customerType.trim() || undefined,
        productId: form.productId.trim(),
        quantity: Number(form.quantity),
        promisedDeliveryDate: form.promisedDeliveryDate,
      });
      setResult(response);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrors(err.body.details ?? [err.body.message ?? err.body.error]);
      } else {
        setErrors(["Unexpected error submitting order"]);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2>Submit Order</h2>
      <form onSubmit={handleSubmit} className="form-grid">
        {/* <label>
          Order Id (optional)
          <input
            value={form.orderId}
            onChange={(e) => update('orderId', e.target.value)}
            placeholder="Auto-generated if left blank"
          />
        </label> */}
        <label>
          Customer Id *
          <input
            value={form.customerId}
            onChange={(e) => update("customerId", e.target.value)}
            required
          />
        </label>
        <label>
          Customer Type
          <input
            value={form.customerType}
            onChange={(e) => update("customerType", e.target.value)}
          />
        </label>
        <label>
          Product Id *
          <input
            value={form.productId}
            onChange={(e) => update("productId", e.target.value)}
            required
          />
        </label>
        <label>
          Quantity *
          <input
            type="number"
            step="any"
            min="0"
            value={form.quantity}
            onChange={(e) => update("quantity", e.target.value)}
            required
          />
        </label>
        <label>
          Promised Delivery Date *
          <input
            type="date"
            value={form.promisedDeliveryDate}
            onChange={(e) => update("promisedDeliveryDate", e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Submitting…" : "Submit Order"}
        </button>
      </form>

      {errors.length > 0 && (
        <div className="panel panel-error">
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <div
          className={`panel ${result.status === "RELEASED" ? "panel-success" : "panel-blocked"}`}
        >
          <h3>
            Order {result.orderId} — {result.status}
            {result.previouslyRecorded && <span className="badge"> (previously recorded)</span>}
          </h3>
          {result.status === "RELEASED" ? (
            <>
              <p>Released quantity: {result.releasedQuantity}</p>
              {result.allocations.map((a) => (
                <p key={a.warehouseId}>
                  Warehouse {a.warehouseId} — allocated {a.allocatedQuantity}, dispatch{" "}
                  {a.warehouseDispatchDate}
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
