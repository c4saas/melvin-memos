import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users, apiKeys } from '../shared/schema';
import { createLogger } from './logger';

const log = createLogger('auth-core');

declare module 'express-session' {
  interface SessionData { userId?: string }
}

export async function ensureDefaultUser(): Promise<string> {
  const email = process.env.MEMOS_DEFAULT_EMAIL ?? 'austin@c4saas.com';
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);

  const demoPassword = process.env.MEMOS_DEMO_PASSWORD;
  const demoHash = demoPassword ? await bcrypt.hash(demoPassword, 12) : null;

  if (existing[0]) {
    if (demoHash && !existing[0].passwordHash) {
      await db.update(users).set({ passwordHash: demoHash }).where(eq(users.id, existing[0].id));
      log.info('seeded default user password', { email });
    }
    return existing[0].id;
  }

  const [row] = await db.insert(users).values({
    email,
    name: process.env.MEMOS_DEFAULT_NAME ?? 'Austin',
    passwordHash: demoHash,
  }).returning();
  log.info('created default user', { email, hasPassword: Boolean(demoHash) });
  return row.id;
}

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): { plain: string; hash: string; prefix: string } {
  const plain = `mm_${crypto.randomBytes(32).toString('base64url')}`;
  return { plain, hash: hashApiKey(plain), prefix: plain.slice(0, 10) };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const bearer = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (bearer) {
    const hash = hashApiKey(bearer);
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).limit(1);
    if (row) {
      await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
      (req as any).userId = row.userId;
      return next();
    }
  }
  if (req.session?.userId) {
    (req as any).userId = req.session.userId;
    return next();
  }
  if (process.env.MEMOS_SINGLE_USER === '1') {
    const uid = await ensureDefaultUser();
    (req as any).userId = uid;
    return next();
  }
  res.status(401).json({ error: 'unauthorized' });
}

export function getUserId(req: Request): string {
  const uid = (req as any).userId;
  if (!uid) throw new Error('No userId on request (auth missing)');
  return uid;
}
