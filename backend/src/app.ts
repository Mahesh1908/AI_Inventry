import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import ordersRouter from './routes/orders';
import inventoryRouter from './routes/inventory';
import customersRouter from './routes/customers';
import productsRouter from './routes/products';
import warehousesRouter from './routes/warehouses';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api', ordersRouter);
  app.use('/api', inventoryRouter);
  app.use('/api', customersRouter);
  app.use('/api', productsRouter);
  app.use('/api', warehousesRouter);

  // 404 fallback for unmatched API routes
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });

  // Central error handler (§7.5 — unhandled server/database error -> 500)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'INTERNAL_ERROR', message });
  });

  return app;
}
