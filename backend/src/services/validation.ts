import { CUSTOMER_TYPES } from '../types/domain';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{3,30}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface RawOrderBody {
  orderId?: unknown;
  customerId?: unknown;
  customerType?: unknown;
  productId?: unknown;
  quantity?: unknown;
  promisedDeliveryDate?: unknown;
}

export function validateOrderBody(body: RawOrderBody): ValidationResult {
  const errors: string[] = [];

  if (body.orderId !== undefined && body.orderId !== null) {
    if (typeof body.orderId !== 'string' || !ORDER_ID_PATTERN.test(body.orderId)) {
      errors.push('orderId, if supplied, must match ^[A-Za-z0-9_-]{3,30}$');
    }
  }

  if (typeof body.customerId !== 'string' || body.customerId.trim() === '') {
    errors.push('customerId is required and must be a non-empty string');
  }

  // version2.md §3.1/§6.1: customerType is now required, exactly 'Standard' or 'Priority'.
  if (typeof body.customerType !== 'string' || !CUSTOMER_TYPES.includes(body.customerType as any)) {
    errors.push(`customerType is required and must be exactly one of: ${CUSTOMER_TYPES.join(', ')}`);
  }

  if (typeof body.productId !== 'string' || body.productId.trim() === '') {
    errors.push('productId is required and must be a non-empty string');
  }

  if (typeof body.quantity !== 'number' || !Number.isFinite(body.quantity) || body.quantity <= 0) {
    errors.push('quantity is required and must be a number greater than zero');
  }

  if (typeof body.promisedDeliveryDate !== 'string' || !DATE_PATTERN.test(body.promisedDeliveryDate)) {
    errors.push('promisedDeliveryDate is required and must be a valid YYYY-MM-DD date');
  } else if (Number.isNaN(new Date(body.promisedDeliveryDate).getTime())) {
    errors.push('promisedDeliveryDate is not a valid calendar date');
  }

  return { valid: errors.length === 0, errors };
}
