/**
 * Fulfilment Engine — pure, no HTTP/DB import (development.md §1, §6).
 *
 * Stage 1 (standard customers, development.md §6.1-§6.3, unchanged):
 *   customer → product/stock existence → single-warehouse selection
 *   - fixed priority WH-A → WH-B → WH-C (never sorted by stock or date)
 *   - the full quantity must come from ONE warehouse's available_quantity
 *   - date comparison is inclusive, no transit-day addition
 *
 * Stage 2 (priority customers, version2.md §5.1-§5.2, additive):
 *   customer → product/stock existence → multi-warehouse combination against
 *   a configurable release threshold, with partial release + backorder.
 */

import {
  AllocationRow,
  BlockedDecision,
  BlockReasonCode,
  Customer,
  CustomerType,
  DEFAULT_PRIORITY_RELEASE_THRESHOLD_PCT,
  FulfilmentDecision,
  InventoryRow,
  PartiallyReleasedDecision,
  ReleasedDecision,
  WAREHOUSE_PRIORITY_ORDER,
} from '../types/domain';

export interface EvaluateFulfilmentInput {
  customer: Customer | null;
  /** The customer_id as submitted on the order — used in block-reason text even when the customer was not found. */
  customerId: string;
  /** version2.md §3.1 — required 2-value enum; defaults to 'Standard' so existing Stage 1 callers/tests are unaffected. */
  customerType?: CustomerType;
  /** All inventory rows for the order's product, across all warehouses. Empty = product not found. */
  inventoryRows: InventoryRow[];
  quantity: number;
  promisedDeliveryDate: string; // YYYY-MM-DD
  /** version2.md §4 — configurable, passed in by the caller; the engine has no DB dependency. */
  priorityReleaseThresholdPct?: number;
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
 * Runs the §6.2 selection loop (standard customers only). Returns the first
 * warehouse (in fixed priority order) whose available_quantity covers the
 * full order quantity AND whose earliest_dispatch_date is on or before the
 * promised date.
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
      allocations: [
        {
          warehouseId,
          allocatedQuantity: quantity,
          warehouseDispatchDate: row.earliestDispatchDate,
        },
      ],
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

/**
 * version2.md §5.2 — priority-customer multi-warehouse combination.
 * Fixed WH-A -> WH-B -> WH-C order, never re-sorted; never allocates more
 * than requested per-warehouse or in total; no delivery-date gate (D-15).
 */
function buildPriorityBlock(
  candidates: WarehouseCandidate[],
  quantity: number,
  releasedQuantity: number,
  availablePct: number,
  thresholdPct: number
): BlockedDecision {
  const perWarehouse = candidates.map((c) => `${c.warehouseId}: ${c.row.availableQuantity}`).join(', ');
  // Truncate (never round up) so a below-threshold percentage can never
  // display as the threshold itself (e.g. 69.9999% must not read as 70.0%).
  const truncatedPct = Math.floor(availablePct * 100) / 100;
  const pctText = Number.isInteger(truncatedPct) ? String(truncatedPct) : truncatedPct.toFixed(2);
  return {
    status: 'BLOCKED',
    blockReasonCode: 'INSUFFICIENT_STOCK',
    blockReason: capBlockReason(
      `Priority order: only ${releasedQuantity} of ${quantity} requested (${pctText}%) available across WH-A/B/C, below the ${thresholdPct}% release threshold. ${perWarehouse}.`
    ),
  };
}

export function selectWarehousesForPriority(
  inventoryRows: InventoryRow[],
  quantity: number,
  thresholdPct: number
): ReleasedDecision | PartiallyReleasedDecision | BlockedDecision {
  const candidates = orderRowsByPriority(inventoryRows);

  let remaining = quantity;
  const allocations: AllocationRow[] = [];

  for (const { warehouseId, row } of candidates) {
    if (remaining <= 0) break;
    if (row.availableQuantity <= 0) continue;
    const draw = Math.min(row.availableQuantity, remaining);
    allocations.push({
      warehouseId,
      allocatedQuantity: draw,
      warehouseDispatchDate: row.earliestDispatchDate,
    });
    remaining -= draw;
  }

  const releasedQuantity = quantity - remaining;
  const availablePct = (releasedQuantity / quantity) * 100;

  // "Exactly threshold% qualifies" — inclusive (D-20, T-22).
  if (allocations.length > 0 && availablePct >= thresholdPct) {
    const expectedDeliveryDate = allocations.reduce(
      (latest, a) => (a.warehouseDispatchDate > latest ? a.warehouseDispatchDate : latest),
      allocations[0].warehouseDispatchDate
    );

    if (remaining === 0) {
      return { status: 'RELEASED', allocations, expectedDeliveryDate };
    }

    return {
      status: 'PARTIALLY_RELEASED',
      allocations,
      releasedQuantity,
      backorderedQuantity: remaining,
      expectedDeliveryDate,
    };
  }

  return buildPriorityBlock(candidates, quantity, releasedQuantity, availablePct, thresholdPct);
}

export function evaluateFulfilment(input: EvaluateFulfilmentInput): FulfilmentDecision {
  const {
    customer,
    customerId,
    customerType = 'Standard',
    inventoryRows,
    quantity,
    promisedDeliveryDate,
    priorityReleaseThresholdPct = DEFAULT_PRIORITY_RELEASE_THRESHOLD_PCT,
  } = input;

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

  if (customerType === 'Priority') {
    return selectWarehousesForPriority(inventoryRows, quantity, priorityReleaseThresholdPct);
  }

  const released = selectWarehouse(inventoryRows, quantity, promisedDeliveryDate);
  if (released) return released;

  return buildNoWarehouseBlock(inventoryRows, quantity, promisedDeliveryDate);
}
