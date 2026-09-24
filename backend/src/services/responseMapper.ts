import { StoredFulfilment } from '../types/domain';

/**
 * Builds the §7.2/§7.3/§7.4 API response shape from a stored fulfilment
 * record. releasedQuantity/backorderQuantity/allocations are derived at read
 * time, never stored as separate columns (§7.4).
 */
export function toOrderApiResponse(fulfilment: StoredFulfilment, previouslyRecorded: boolean) {
  const isReleased = fulfilment.status === 'RELEASED';

  return {
    orderId: fulfilment.orderId,
    status: fulfilment.status,
    reason: isReleased ? null : fulfilment.blockReason,
    releasedQuantity: isReleased ? fulfilment.quantity : 0,
    backorderQuantity: isReleased ? 0 : fulfilment.quantity,
    allocations: isReleased
      ? [
          {
            warehouseId: fulfilment.selectedWarehouseId,
            allocatedQuantity: fulfilment.allocatedQuantity,
            warehouseDispatchDate: fulfilment.warehouseDispatchDate,
          },
        ]
      : [],
    expectedDeliveryDate: isReleased ? fulfilment.expectedDeliveryDate : null,
    promisedDeliveryDate: fulfilment.promisedDeliveryDate,
    evaluatedAt: fulfilment.evaluatedAt,
    previouslyRecorded,
  };
}
