import { Router } from 'express';
import { listRecentErrors } from '../services/error-log';
import { requireAuth } from '../auth';

export const errorsRouter = Router();
errorsRouter.use(requireAuth);

errorsRouter.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
  const rows = await listRecentErrors(limit, kind);
  res.json({ errors: rows });
});
