import { Router } from 'express';
import { listCustomers } from '../repositories/customerRepository';

const router = Router();

router.get('/customers', async (_req, res, next) => {
  try {
    const customers = await listCustomers();
    return res.json(customers);
  } catch (err) {
    next(err);
  }
});

export default router;
