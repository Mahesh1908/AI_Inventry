import { StoredFulfilment } from '../types/domain';

/**
 * Builds the §7.2/§7.3/§7.4 API response shape from a stored fulfilment
 * record. version2.md §6.2: releasedQuantity/backorderQuantity/allocations
 * are read directly off the stored record (§5.7) - they now coexist for
 * PARTIALLY_RELEASED instead of being mutually exclusive.
 */
export function toOrderApiResponse(fulfilment: StoredFulfilment, previouslyRecorded: boolean) {
  const isBlocked = fulfilment.status === 'BLOCKED';

  return {
    orderId: fulfilment.orderId,
    status: fulfilment.status,
    reason: isBlocked ? fulfilment.blockReason : null,
    releasedQuantity: fulfilment.releasedQuantity,
    backorderQuantity: fulfilment.backorderedQuantity,
    backorderStatus: fulfilment.backorderStatus,
    allocations: fulfilment.allocations,
    expectedDeliveryDate: fulfilment.expectedDeliveryDate,
    promisedDeliveryDate: fulfilment.promisedDeliveryDate,
    evaluatedAt: fulfilment.evaluatedAt,
    previouslyRecorded,
  };
}
