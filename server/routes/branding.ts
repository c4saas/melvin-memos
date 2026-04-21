import { Router } from 'express';
import { getBranding } from '../branding';

export const brandingRouter = Router();

brandingRouter.get('/', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(getBranding());
});
