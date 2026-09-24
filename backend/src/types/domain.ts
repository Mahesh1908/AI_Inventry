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

export interface OrderInput {
  orderId: string;
  customerId: string;
  customerType: string | null;
  productId: string;
  quantity: number;
  promisedDeliveryDate: string; // YYYY-MM-DD
}

export interface ReleasedDecision {
  status: 'RELEASED';
  selectedWarehouseId: string;
  allocatedQuantity: number;
  warehouseDispatchDate: string;
  expectedDeliveryDate: string;
}

export interface BlockedDecision {
  status: 'BLOCKED';
  blockReasonCode: BlockReasonCode;
  blockReason: string;
}

export type FulfilmentDecision = ReleasedDecision | BlockedDecision;

export interface StoredFulfilment {
  orderId: string;
  customerId: string;
  customerType: string | null;
  productId: string;
  quantity: number;
  promisedDeliveryDate: string;
  submittedAt: string;
  status: 'RELEASED' | 'BLOCKED';
  blockReasonCode: BlockReasonCode | null;
  blockReason: string | null;
  selectedWarehouseId: string | null;
  allocatedQuantity: number | null;
  warehouseDispatchDate: string | null;
  expectedDeliveryDate: string | null;
  evaluatedAt: string;
}
