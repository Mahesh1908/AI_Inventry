export type FulfilmentStatus = 'RELEASED' | 'PARTIALLY_RELEASED' | 'BLOCKED';

export type CustomerType = 'Standard' | 'Priority';

export interface Allocation {
  warehouseId: string;
  allocatedQuantity: number;
  warehouseDispatchDate: string;
}

export interface OrderFulfilmentResponse {
  orderId: string;
  status: FulfilmentStatus;
  reason: string | null;
  releasedQuantity: number;
  backorderQuantity: number;
  backorderStatus: 'OPEN' | null;
  allocations: Allocation[];
  expectedDeliveryDate: string | null;
  promisedDeliveryDate: string;
  evaluatedAt: string;
  previouslyRecorded: boolean;
}

export interface Customer {
  customerId: string;
  customerName: string | null;
  eligibleStatus: 'ELIGIBLE' | 'NOT_ELIGIBLE';
}

export interface Product {
  productId: string;
  productName: string;
  uom: string;
  isActive: boolean;
}

export interface InventoryRow {
  productId: string;
  warehouseId: string;
  availableQuantity: number;
  earliestDispatchDate: string;
}

export interface SubmitOrderRequest {
  orderId?: string;
  customerId: string;
  customerType: CustomerType;
  productId: string;
  quantity: number;
  promisedDeliveryDate: string;
}

export interface ApiError {
  error: string;
  message?: string;
  details?: string[];
  orderId?: string;
}
