import { getPriorityReleaseThresholdPct } from '../config/appConfig';
import { evaluateFulfilment } from '../engine/fulfilmentEngine';
import { findCustomerById } from '../repositories/customerRepository';
import { getInventoryForProduct } from '../repositories/inventoryRepository';
import * as orderRepository from '../repositories/orderRepository';
import { CustomerType, FulfilmentDecision, OrderInput, StoredFulfilment } from '../types/domain';

export class ValidationError extends Error {
  constructor(public details: string[]) {
    super('VALIDATION_ERROR');
  }
}

const MAX_ALLOCATION_RETRIES = 5;

async function generateOrderId(): Promise<string> {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return `ORD-${suffix}`;
}

export interface SubmitOrderResult {
  fulfilment: StoredFulfilment;
  previouslyRecorded: boolean;
}

export async function submitOrder(input: {
  orderId?: string;
  customerId: string;
  customerType: CustomerType;
  productId: string;
  quantity: number;
  promisedDeliveryDate: string;
}): Promise<SubmitOrderResult> {
  const orderId = input.orderId ?? (await generateOrderId());

  // FR-09: idempotent re-submission — return the stored result unchanged.
  // version2.md §5.6: extended to also cover allocations + backorders.
  const existing = await orderRepository.findStoredFulfilment(orderId);
  if (existing) {
    return { fulfilment: existing, previouslyRecorded: true };
  }

  const customer = await findCustomerById(input.customerId);
  const priorityReleaseThresholdPct = await getPriorityReleaseThresholdPct();

  const orderInput: OrderInput = {
    orderId,
    customerId: input.customerId,
    customerType: input.customerType,
    productId: input.productId,
    quantity: input.quantity,
    promisedDeliveryDate: input.promisedDeliveryDate,
  };

  for (let attempt = 0; attempt < MAX_ALLOCATION_RETRIES; attempt++) {
    const inventoryRows = await getInventoryForProduct(input.productId);

    const decision: FulfilmentDecision = evaluateFulfilment({
      customer,
      customerId: input.customerId,
      customerType: input.customerType,
      inventoryRows,
      quantity: input.quantity,
      promisedDeliveryDate: input.promisedDeliveryDate,
      priorityReleaseThresholdPct,
    });

    const { allocationSucceeded } = await orderRepository.submitOrder(orderInput, decision);

    if (allocationSucceeded) {
      const stored = await orderRepository.findStoredFulfilment(orderId);
      if (!stored) {
        throw new Error('Order was persisted but could not be re-read');
      }
      return { fulfilment: stored, previouslyRecorded: false };
    }

    // One of the targeted warehouses lost the concurrent stock race (NFR-02) —
    // the whole transaction (including the header insert) was rolled back.
    // Re-fetch fresh inventory and re-run fulfilment evaluation, falling
    // through to the next warehouse(s) in priority order or blocking if none
    // remain (development.md §6.4, version2.md §5.5).
  }

  throw new Error('Unable to allocate inventory after repeated concurrent contention');
}

export async function getFulfilment(orderId: string): Promise<StoredFulfilment | null> {
  return orderRepository.findStoredFulfilment(orderId);
}

export async function listOrders(): Promise<StoredFulfilment[]> {
  return orderRepository.listOrders();
}
