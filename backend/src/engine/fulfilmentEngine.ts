/**
 * Fulfilment Engine — pure, no HTTP/DB import (development.md §1, §6).
 *
 * Implements the evaluation order from §6.1:
 *   customer → product/stock existence → warehouse selection
 *
 * and the single-warehouse selection algorithm from §6.2/§6.3:
 *   - fixed priority WH-A → WH-B → WH-C (never sorted by stock or date)
 *   - the full quantity must come from ONE warehouse's available_quantity
 *   - date comparison is inclusive, no transit-day addition
 */

import {
  BlockedDecision,
  BlockReasonCode,
  Customer,
  FulfilmentDecision,
  InventoryRow,
  ReleasedDecision,
  WAREHOUSE_PRIORITY_ORDER,
} from '../types/domain';

export interface EvaluateFulfilmentInput {
  customer: Customer | null;
  /** The customer_id as submitted on the order — used in block-reason text even when the customer was not found. */
  customerId: string;
  /** All inventory rows for the order's product, across all warehouses. Empty = product not found. */
  inventoryRows: InventoryRow[];
  quantity: number;
  promisedDeliveryDate: string; // YYYY-MM-DD
}

interface WarehouseCandidate {
  warehouseId: string;
  row: InventoryRow;
}

function evaluateCustomer(customer: Customer | null, customerId: string): BlockedDecision | null {
  if (!customer) {
    return {
      status: 'BLOCKED',
      blockReasonCode: 'CUSTOMER_NOT_FOUND',
      blockReason: `Customer ${customerId} was not found in the customer master.`,
    };
  }
  if (customer.eligibleStatus !== 'ELIGIBLE') {
    return {
      status: 'BLOCKED',
      blockReasonCode: 'CUSTOMER_NOT_ELIGIBLE',
      blockReason: `Customer ${customer.customerId} exists but is not eligible for order release.`,
    };
  }
  return null;
}

// block_reason is VARCHAR(300) (development.md §4.6) — cap the generated text
// so it never overflows the column, however many warehouses are listed.
const BLOCK_REASON_MAX_LENGTH = 300;

function capBlockReason(text: string): string {
  if (text.length <= BLOCK_REASON_MAX_LENGTH) return text;
  return `${text.slice(0, BLOCK_REASON_MAX_LENGTH - 1)}…`;
}

function orderRowsByPriority(inventoryRows: InventoryRow[]): WarehouseCandidate[] {
  const byWarehouse = new Map(inventoryRows.map((row) => [row.warehouseId, row]));
  const candidates: WarehouseCandidate[] = [];
  for (const warehouseId of WAREHOUSE_PRIORITY_ORDER) {
    const row = byWarehouse.get(warehouseId);
    if (row) {
      candidates.push({ warehouseId, row });
    }
  }
  return candidates;
}

/**
 * Runs the §6.2 selection loop. Returns the first warehouse (in fixed
 * priority order) whose available_quantity covers the full order quantity
 * AND whose earliest_dispatch_date is on or before the promised date.
 */
export function selectWarehouse(
  inventoryRows: InventoryRow[],
  quantity: number,
  promisedDeliveryDate: string
): ReleasedDecision | null {
  const candidates = orderRowsByPriority(inventoryRows);
  const promised = new Date(promisedDeliveryDate).getTime();

  for (const { warehouseId, row } of candidates) {
    if (row.availableQuantity < quantity) continue;
    const dispatch = new Date(row.earliestDispatchDate).getTime();
    if (dispatch > promised) continue;

    return {
      status: 'RELEASED',
      selectedWarehouseId: warehouseId,
      allocatedQuantity: quantity,
      warehouseDispatchDate: row.earliestDispatchDate,
      expectedDeliveryDate: row.earliestDispatchDate,
    };
  }
  return null;
}

/**
 * Builds the §6.3 block reason when no warehouse qualified: quantity check
 * first (across ALL warehouses), then date check (only among warehouses that
 * already passed the quantity check).
 */
export function buildNoWarehouseBlock(
  inventoryRows: InventoryRow[],
  quantity: number,
  promisedDeliveryDate: string
): BlockedDecision {
  const candidates = orderRowsByPriority(inventoryRows);
  const quantitySufficient = candidates.filter((c) => c.row.availableQuantity >= quantity);

  if (quantitySufficient.length === 0) {
    const perWarehouse = candidates
      .map((c) => `${c.warehouseId}: ${c.row.availableQuantity}`)
      .join(', ');
    return {
      status: 'BLOCKED',
      blockReasonCode: 'INSUFFICIENT_STOCK',
      blockReason: capBlockReason(
        `Requested quantity ${quantity} is not available in full from any single warehouse. ${perWarehouse}.`
      ),
    };
  }

  const detail = quantitySufficient
    .map(
      (c) =>
        `${c.warehouseId} has sufficient stock (${c.row.availableQuantity}) but earliest dispatch ${c.row.earliestDispatchDate} is after the promised date ${promisedDeliveryDate}`
    )
    .join('; ');
  return {
    status: 'BLOCKED',
    blockReasonCode: 'DELIVERY_DATE_NOT_MET',
    blockReason: capBlockReason(`${detail}.`),
  };
}

export function evaluateFulfilment(input: EvaluateFulfilmentInput): FulfilmentDecision {
  const { customer, customerId, inventoryRows, quantity, promisedDeliveryDate } = input;

  const customerBlock = evaluateCustomer(customer, customerId);
  if (customerBlock) {
    return customerBlock;
  }

  if (inventoryRows.length === 0) {
    const reasonCode: BlockReasonCode = 'PRODUCT_NOT_FOUND';
    return {
      status: 'BLOCKED',
      blockReasonCode: reasonCode,
      blockReason: 'No inventory record exists for this product in any warehouse.',
    };
  }

  const released = selectWarehouse(inventoryRows, quantity, promisedDeliveryDate);
  if (released) return released;

  return buildNoWarehouseBlock(inventoryRows, quantity, promisedDeliveryDate);
}
