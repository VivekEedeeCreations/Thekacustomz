import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';

import { corsOrigins } from './config/env.js';
import { fail } from './lib/http.js';
import { healthRouter } from './routes/health.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins.length === 1 && corsOrigins[0] === '*' ? true : corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json());

  // Routes. Feature routers (products, inventory, purchasing, ...) mount here.
  app.use('/health', healthRouter);
  app.use('/api/health', healthRouter);

  // 404 fallback.
  app.use((_req: Request, res: Response) => {
    res.status(404).json(fail({ code: 'not_found', message: 'Route not found' }));
  });

  // Centralised error handler.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json(fail({ code: 'internal_error', message: 'An unexpected error occurred' }));
  });

  return app;
}
