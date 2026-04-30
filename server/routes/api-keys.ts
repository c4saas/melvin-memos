/**
 * API keys management for Memos — used by MelvinOS and other sibling products
 * to authenticate against the /api/v1 integration surface.
 *
 * Keys are stored hashed (SHA-256). The plaintext is returned exactly once on
 * create; the UI is responsible for showing it to the user immediately.
 */

import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { apiKeys } from '../../shared/schema';
import { requireAuth, getUserId, generateApiKey } from '../auth';
import { createLogger } from '../logger';

const log = createLogger('api-keys');

export const apiKeysRouter = Router();
apiKeysRouter.use(requireAuth);

apiKeysRouter.get('/', async (req, res) => {
  const userId = getUserId(req);
  const rows = await db.select({
    id: apiKeys.id,
    name: apiKeys.name,
    prefix: apiKeys.prefix,
    lastUsedAt: apiKeys.lastUsedAt,
    createdAt: apiKeys.createdAt,
  }).from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));
  res.json(rows);
});

apiKeysRouter.post('/', async (req, res) => {
  const userId = getUserId(req);
  const name = (typeof req.body?.name === 'string' ? req.body.name.trim() : '').slice(0, 60) || 'Untitled key';

  // Reserved names used for internal flows — refuse to let users collide.
  // Case-insensitive + whitespace-insensitive comparison.
  const RESERVED = new Set(['extension']);
  const normalized = name.toLowerCase().replace(/\s+/g, '');
  if (RESERVED.has(normalized)) {
    return res.status(400).json({ error: `Key name "${name}" is reserved. Pick another.` });
  }

  const { plain, hash, prefix } = generateApiKey();
  const [row] = await db.insert(apiKeys).values({
    userId,
    name,
    keyHash: hash,
    prefix,
  }).returning({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, createdAt: apiKeys.createdAt });

  log.info('api key created', { userId, name, prefix });

  // Plaintext returned exactly once.
  res.status(201).json({ ...row, token: plain });
});

apiKeysRouter.delete('/:id', async (req, res) => {
  const userId = getUserId(req);
  const result = await db.delete(apiKeys)
    .where(and(eq(apiKeys.id, req.params.id), eq(apiKeys.userId, userId)))
    .returning({ id: apiKeys.id });
  if (result.length === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});
