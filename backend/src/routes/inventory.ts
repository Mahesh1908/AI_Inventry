import { Router } from 'express';
import { listInventory } from '../repositories/inventoryRepository';

const router = Router();

router.get('/inventory', async (req, res, next) => {
  try {
    const productId = typeof req.query.productId === 'string' ? req.query.productId : undefined;
    const rows = await listInventory(productId);
    return res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
