export type EligibleStatus = 'ELIGIBLE' | 'NOT_ELIGIBLE';

export interface Customer {
  customerId: string;
  customerName: string | null;
  eligibleStatus: EligibleStatus;
}

export interface Product {
  productId: string;
  productName: string;
  uom: string;
  isActive: boolean;
}

export const WAREHOUSE_PRIORITY_ORDER = ['WH-A', 'WH-B', 'WH-C'] as const;
export type WarehouseId = (typeof WAREHOUSE_PRIORITY_ORDER)[number];

export interface Warehouse {
  warehouseId: string;
  warehouseName: string;
  location: string | null;
  isActive: boolean;
}

export interface InventoryRow {
  productId: string;
  warehouseId: string;
  availableQuantity: number;
  earliestDispatchDate: string; // YYYY-MM-DD
}

export type BlockReasonCode =
  | 'CUSTOMER_NOT_FOUND'
  | 'CUSTOMER_NOT_ELIGIBLE'
  | 'PRODUCT_NOT_FOUND'
  | 'INSUFFICIENT_STOCK'
  | 'DELIVERY_DATE_NOT_MET';

// version2.md §3.1 — the exact 2-value type the order request sends. Was
// nullable/pass-through in Stage 1; now required and drives §5.1's branch.
export const CUSTOMER_TYPES = ['Standard', 'Priority'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const DEFAULT_PRIORITY_RELEASE_THRESHOLD_PCT = 70;

export interface OrderInput {
  orderId: string;
  customerId: string;
  customerType: CustomerType;
  productId: string;
  quantity: number;
  promisedDeliveryDate: string; // YYYY-MM-DD
}

// version2.md §3.3 — one order can now touch up to three warehouses (1 for
// standard orders, 1-3 for priority orders).
export interface AllocationRow {
  warehouseId: string;
  allocatedQuantity: number;
  warehouseDispatchDate: string;
}

export interface ReleasedDecision {
  status: 'RELEASED';
  allocations: AllocationRow[];
  expectedDeliveryDate: string;
}

// version2.md §5.3 — new status: some quantity released across 1-3
// warehouses, the remainder recorded as one Open backorder.
export interface PartiallyReleasedDecision {
  status: 'PARTIALLY_RELEASED';
  allocations: AllocationRow[];
  releasedQuantity: number;
  backorderedQuantity: number;
  expectedDeliveryDate: string;
}

export interface BlockedDecision {
  status: 'BLOCKED';
  blockReasonCode: BlockReasonCode;
  blockReason: string;
}

export type FulfilmentDecision = ReleasedDecision | PartiallyReleasedDecision | BlockedDecision;

export type FulfilmentStatus = 'RELEASED' | 'PARTIALLY_RELEASED' | 'BLOCKED';

export interface StoredFulfilment {
  orderId: string;
  customerId: string;
  customerType: CustomerType;
  productId: string;
  quantity: number;
  promisedDeliveryDate: string;
  submittedAt: string;
  status: FulfilmentStatus;
  blockReasonCode: BlockReasonCode | null;
  blockReason: string | null;
  releasedQuantity: number;
  backorderedQuantity: number;
  allocations: AllocationRow[];
  backorderStatus: 'OPEN' | null;
  expectedDeliveryDate: string | null;
  evaluatedAt: string;
}
