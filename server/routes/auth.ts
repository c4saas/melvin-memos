import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../../shared/schema';
import { createLogger } from '../logger';

export const authRouter = Router();
const log = createLogger('auth');

authRouter.get('/me', async (req, res) => {
  if (!req.session?.userId) {
    if (process.env.MEMOS_SINGLE_USER === '1') {
      return res.json({ user: null, mode: 'single-user', loginRequired: false });
    }
    return res.json({ user: null, mode: 'multi-user', loginRequired: true });
  }
  const [u] = await db.select({
    id: users.id, email: users.email, name: users.name, timezone: users.timezone,
  }).from(users).where(eq(users.id, req.session.userId)).limit(1);
  if (!u) return res.json({ user: null, loginRequired: true });
  res.json({ user: u, mode: 'multi-user', loginRequired: false });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u || !u.passwordHash) {
    log.warn('login failed: user not found or no password set', { email });
    return res.status(401).json({ error: 'invalid credentials' });
  }

  const ok = await bcrypt.compare(password, u.passwordHash);
  if (!ok) {
    log.warn('login failed: bad password', { email });
    return res.status(401).json({ error: 'invalid credentials' });
  }

  req.session.userId = u.id;
  log.info('login ok', { email });
  res.json({ user: { id: u.id, email: u.email, name: u.name, timezone: u.timezone } });
});

authRouter.post('/logout', (req, res) => {
  req.session?.destroy(() => {});
  res.json({ ok: true });
});

authRouter.post('/change-password', async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'currentPassword and newPassword (8+ chars) required' });
  }

  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u?.passwordHash) return res.status(400).json({ error: 'no password set' });

  const ok = await bcrypt.compare(currentPassword, u.passwordHash);
  if (!ok) return res.status(401).json({ error: 'current password incorrect' });

  const newHash = await bcrypt.hash(newPassword, 12);
  await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId));
  res.json({ ok: true });
});
