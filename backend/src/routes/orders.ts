import { Router } from 'express';
import { validateOrderBody } from '../services/validation';
import { submitOrder, getFulfilment, listOrders } from '../services/orderService';
import { toOrderApiResponse } from '../services/responseMapper';

const router = Router();

router.post('/orders', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const validation = validateOrderBody(body);
    if (!validation.valid) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.errors });
    }

    const result = await submitOrder({
      orderId: body.orderId,
      customerId: body.customerId,
      customerType: body.customerType,
      productId: body.productId,
      quantity: body.quantity,
      promisedDeliveryDate: body.promisedDeliveryDate,
    });

    return res.status(201).json(toOrderApiResponse(result.fulfilment, result.previouslyRecorded));
  } catch (err) {
    next(err);
  }
});

router.get('/orders', async (_req, res, next) => {
  try {
    const orders = await listOrders();
    return res.json(orders.map((o) => toOrderApiResponse(o, false)));
  } catch (err) {
    next(err);
  }
});

router.get('/orders/:orderId/fulfilment', async (req, res, next) => {
  try {
    const fulfilment = await getFulfilment(req.params.orderId);
    if (!fulfilment) {
      return res.status(404).json({ error: 'ORDER_NOT_FOUND', orderId: req.params.orderId });
    }
    return res.json(toOrderApiResponse(fulfilment, false));
  } catch (err) {
    next(err);
  }
});

export default router;
