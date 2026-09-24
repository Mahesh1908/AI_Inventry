import { Router } from 'express';
import { listProducts } from '../repositories/productRepository';

const router = Router();

router.get('/products', async (_req, res, next) => {
  try {
    const products = await listProducts();
    return res.json(products);
  } catch (err) {
    next(err);
  }
});

export default router;
