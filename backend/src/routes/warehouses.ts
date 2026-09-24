import { Router } from 'express';
import { listWarehouses } from '../repositories/warehouseRepository';

const router = Router();

router.get('/warehouses', async (_req, res, next) => {
  try {
    const warehouses = await listWarehouses();
    return res.json(warehouses);
  } catch (err) {
    next(err);
  }
});

export default router;
