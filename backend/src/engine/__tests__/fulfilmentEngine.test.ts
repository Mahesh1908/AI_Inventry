import { describe, expect, it } from 'vitest';
import { evaluateFulfilment } from '../fulfilmentEngine';
import { Customer, InventoryRow } from '../../types/domain';

const ELIGIBLE_CUSTOMER: Customer = {
  customerId: 'CUST-001',
  customerName: 'Acme Constructions',
  eligibleStatus: 'ELIGIBLE',
};

const NOT_ELIGIBLE_CUSTOMER: Customer = {
  customerId: 'CUST-002',
  customerName: 'Blocked Builders',
  eligibleStatus: 'NOT_ELIGIBLE',
};

function rows(partial: Partial<Record<'WH-A' | 'WH-B' | 'WH-C', { qty: number; date: string }>>): InventoryRow[] {
  return Object.entries(partial).map(([warehouseId, v]) => ({
    productId: 'PRD-TEST',
    warehouseId,
    availableQuantity: v!.qty,
    earliestDispatchDate: v!.date,
  }));
}

describe('Fulfilment Engine — development.md §6', () => {
  // T-01
  it('releases from WH-A when WH-A alone has enough stock and meets the date', () => {
    const decision = evaluateFulfilment({
      customer: ELIGIBLE_CUSTOMER,
      customerId: 'CUST-001',
      inventoryRows: rows({
        'WH-A': { qty: 500, date: '2026-10-05' },
        'WH-B': { qty: 100, date: '2026-10-05' },
        'WH-C': { qty: 100, date: '2026-10-05' },
      }),
      quantity: 300,
      promisedDeliveryDate: '2026-10-10',
    });
    expect(decision.status).toBe('RELEASED');
    if (decision.status === 'RELEASED') {
      expect(decision.selectedWarehouseId).toBe('WH-A');
      expect(decision.allocatedQuantity).toBe(300);
      expect(decision.expectedDeliveryDate).toBe('2026-10-05');
    }
  });

  // T-02
  it('releases from WH-B when only WH-B has enough stock', () => {
    const decision = evaluateFulfilment({
      customer: ELIGIBLE_CUSTOMER,
      customerId: 'CUST-001',
      inventoryRows: rows({
        'WH-A': { qty: 50, date: '2026-10-05' },
        'WH-B': { qty: 400, date: '2026-10-05' },
        'WH-C': { qty: 50, date: '2026-10-05' },
      }),
      quantity: 300,
      promisedDeliveryDate: '2026-10-10',
    });
    expect(decision.status).toBe('RELEASED');
    if (decision.status === 'RELEASED') {
      expect(decision.selectedWarehouseId).toBe('WH-B');
    }
  });

  // T-03
  it('prefers WH-A over WH-B by fixed priority even when WH-B dispatches earlier', () => {
    const decision = evaluateFulfilment({
      customer: ELIGIBLE_CUSTOMER,
      customerId: 'CUST-001',
      inventoryRows: rows({
        'WH-A': { qty: 400, date: '2026-10-08' },
        'WH-B': { qty: 400, date: '2026-10-01' },
        'WH-C': { qty: 50, date: '2026-10-08' },
      }),
      quantity: 300,
      promisedDeliveryDate: '2026-10-10',
    });
    expect(decision.status).toBe('RELEASED');
    if (decision.status === 'RELEASED') {
      expect(decision.selectedWarehouseId).toBe('WH-A');
    }
  });

  // T-04
  it('blocks with CUSTOMER_NOT_FOUND when the customer does not exist', () => {
    const decision = evaluateFulfilment({
      customer: null,
      customerId: 'CUST-999',
      inventoryRows: rows({ 'WH-A': { qty: 500, date: '2026-10-05' } }),
      quantity: 300,
      promisedDeliveryDate: '2026-10-10',
    });
    expect(decision.status).toBe('BLOCKED');
    if (decision.status === 'BLOCKED') {
      expect(decision.blockReasonCode).toBe('CUSTOMER_NOT_FOUND');
    }
  });

  // T-05
  it('blocks with CUSTOMER_NOT_ELIGIBLE when the customer is not eligible', () => {
    const decision = evaluateFulfilment({
      customer: NOT_ELIGIBLE_CUSTOMER,
      customerId: 'CUST-002',
      inventoryRows: rows({ 'WH-A': { qty: 500, date: '2026-10-05' } }),
      quantity: 300,
      promisedDeliveryDate: '2026-10-10',
    });
    expect(decision.status).toBe('BLOCKED');
    if (decision.status === 'BLOCKED') {
      expect(decision.blockReasonCode).toBe('CUSTOMER_NOT_ELIGIBLE');
    }
  });

  // T-06
  it('blocks with PRODUCT_NOT_FOUND when there is no inventory row anywhere', () => {
    const decision = evaluateFulfilment({
      customer: ELIGIBLE_CUSTOMER,
      customerId: 'CUST-001',
      inventoryRows: [],
      quantity: 300,
      promisedDeliveryDate: '2026-10-10',
    });
    expect(decision.status).toBe('BLOCKED');
    if (decision.status === 'BLOCKED') {
      expect(decision.blockReasonCode).toBe('PRODUCT_NOT_FOUND');
    }
  });

  // T-07
  it('blocks with INSUFFICIENT_STOCK when no single warehouse covers the quantity, even though the sum would', () => {
    const decision = evaluateFulfilment({
      customer: ELIGIBLE_CUSTOMER,
      customerId: 'CUST-001',
      inventoryRows: rows({
        'WH-A': { qty: 200, date: '2026-10-05' },
        'WH-B': { qty: 300, date: '2026-10-05' },
        'WH-C': { qty: 150, date: '2026-10-05' },
      }),
      quantity: 500,
      promisedDeliveryDate: '2026-10-10',
    });
    expect(decision.status).toBe('BLOCKED');
    if (decision.status === 'BLOCKED') {
      expect(decision.blockReasonCode).toBe('INSUFFICIENT_STOCK');
      expect(decision.blockReason).toContain('WH-A: 200');
      expect(decision.blockReason).toContain('WH-B: 300');
      expect(decision.blockReason).toContain('WH-C: 150');
    }
  });

  // T-08
  it('blocks with DELIVERY_DATE_NOT_MET when the only sufficient warehouse dispatches too late', () => {
    const decision = evaluateFulfilment({
      customer: ELIGIBLE_CUSTOMER,
      customerId: 'CUST-001',
      inventoryRows: rows({
        'WH-A': { qty: 50, date: '2026-10-05' },
        'WH-B': { qty: 300, date: '2026-10-12' },
        'WH-C': { qty: 50, date: '2026-10-05' },
      }),
      quantity: 300,
      promisedDeliveryDate: '2026-10-10',
    });
    expect(decision.status).toBe('BLOCKED');
    if (decision.status === 'BLOCKED') {
      expect(decision.blockReasonCode).toBe('DELIVERY_DATE_NOT_MET');
      expect(decision.blockReason).toContain('WH-B');
      expect(decision.blockReason).toContain('2026-10-12');
      expect(decision.blockReason).toContain('2026-10-10');
    }
  });

  // T-09 — boundary: dispatch date equals promised date exactly
  it('releases when the dispatch date exactly equals the promised date (inclusive comparison)', () => {
    const decision = evaluateFulfilment({
      customer: ELIGIBLE_CUSTOMER,
      customerId: 'CUST-001',
      inventoryRows: rows({ 'WH-A': { qty: 250, date: '2026-10-10' } }),
      quantity: 200,
      promisedDeliveryDate: '2026-10-10',
    });
    expect(decision.status).toBe('RELEASED');
  });

  // T-10 — boundary: dispatch date is one day after the promised date
  it('blocks when the dispatch date is exactly one day after the promised date', () => {
    const decision = evaluateFulfilment({
      customer: ELIGIBLE_CUSTOMER,
      customerId: 'CUST-001',
      inventoryRows: rows({ 'WH-A': { qty: 250, date: '2026-10-10' } }),
      quantity: 200,
      promisedDeliveryDate: '2026-10-09',
    });
    expect(decision.status).toBe('BLOCKED');
    if (decision.status === 'BLOCKED') {
      expect(decision.blockReasonCode).toBe('DELIVERY_DATE_NOT_MET');
    }
  });

  it('caps the block reason at 300 chars (VARCHAR(300) column) even with 3 qualifying-on-quantity warehouses', () => {
    const decision = evaluateFulfilment({
      customer: ELIGIBLE_CUSTOMER,
      customerId: 'CUST-001',
      inventoryRows: rows({
        'WH-A': { qty: 250, date: '2026-10-10' },
        'WH-B': { qty: 250, date: '2026-10-10' },
        'WH-C': { qty: 250, date: '2026-10-10' },
      }),
      quantity: 49,
      promisedDeliveryDate: '2026-10-09',
    });
    expect(decision.status).toBe('BLOCKED');
    if (decision.status === 'BLOCKED') {
      expect(decision.blockReasonCode).toBe('DELIVERY_DATE_NOT_MET');
      expect(decision.blockReason.length).toBeLessThanOrEqual(300);
    }
  });

  // T-19
  it('preserves full decimal precision on the released quantity, with no rounding', () => {
    const decision = evaluateFulfilment({
      customer: ELIGIBLE_CUSTOMER,
      customerId: 'CUST-001',
      inventoryRows: rows({ 'WH-A': { qty: 500, date: '2026-10-05' } }),
      quantity: 123.456,
      promisedDeliveryDate: '2026-10-10',
    });
    expect(decision.status).toBe('RELEASED');
    if (decision.status === 'RELEASED') {
      expect(decision.allocatedQuantity).toBe(123.456);
    }
  });
});
