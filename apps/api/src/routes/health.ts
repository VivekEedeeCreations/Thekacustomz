import { Router } from 'express';
import type { HealthStatus } from '@inventory/shared';

import { ok } from '../lib/http.js';

export const healthRouter: Router = Router();

healthRouter.get('/', (_req, res) => {
  const body: HealthStatus = {
    status: 'ok',
    service: '@inventory/api',
    timestamp: new Date().toISOString(),
  };
  res.json(ok(body));
});
