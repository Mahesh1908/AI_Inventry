import type {
  ApiError,
  Customer,
  InventoryRow,
  OrderFulfilmentResponse,
  Product,
  SubmitOrderRequest,
} from '../types/api';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

export class ApiRequestError extends Error {
  status: number;
  body: ApiError;

  constructor(status: number, body: ApiError) {
    super(body.message ?? body.error);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiRequestError(res.status, body as ApiError);
  }

  return body as T;
}

export function submitOrder(payload: SubmitOrderRequest): Promise<OrderFulfilmentResponse> {
  return request<OrderFulfilmentResponse>('/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getFulfilment(orderId: string): Promise<OrderFulfilmentResponse> {
  return request<OrderFulfilmentResponse>(`/orders/${encodeURIComponent(orderId)}/fulfilment`);
}

export function listOrders(): Promise<OrderFulfilmentResponse[]> {
  return request<OrderFulfilmentResponse[]>('/orders');
}

export function listInventory(productId?: string): Promise<InventoryRow[]> {
  const query = productId ? `?productId=${encodeURIComponent(productId)}` : '';
  return request<InventoryRow[]>(`/inventory${query}`);
}

export function listCustomers(): Promise<Customer[]> {
  return request<Customer[]>('/customers');
}

export function listProducts(): Promise<Product[]> {
  return request<Product[]>('/products');
}
