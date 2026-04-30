import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { meetingsRouter } from './routes/meetings';
import { calendarRouter } from './routes/calendar';
import { settingsRouter } from './routes/settings';
import { integrationApiRouter } from './routes/integration-api';
import { authRouter } from './routes/auth';
import { brandingRouter } from './routes/branding';
import { highlightsRouter } from './routes/highlights';
import { searchRouter } from './routes/search';
import { linearRouter } from './routes/linear';
import { exportRouter } from './routes/export';
import { apiKeysRouter } from './routes/api-keys';
import { errorsRouter } from './routes/errors';
import { ensureDefaultUser } from './auth';
import { startScheduler } from './scheduler';
import { createLogger } from './logger';
import { runMigrations } from './migrate';
import { pool } from './db';
import { getBranding } from './branding';

const log = createLogger('server');

async function main() {
  await runMigrations();
  await ensureDefaultUser();
  getBranding();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 16) {
    throw new Error('SESSION_SECRET must be set (16+ chars). Generate with: openssl rand -hex 32');
  }

  const PgSession = connectPgSimple(session);
  app.use(session({
    store: new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: 'memos.sid',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 86400_000,
      secure: process.env.NODE_ENV === 'production' && process.env.TRUST_PROXY === '1',
    },
  }));

  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  });

  const setupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many setup attempts. Try again later.' },
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'memos', version: process.env.APP_VERSION ?? 'dev' });
  });

  // Chrome extension metadata — used by the Settings page to surface a live download link.
  app.get('/api/extension', (_req, res) => {
    const zipPath = join(downloadsDir, 'memos-extension.zip');
    const manifestPath = join(__dirname, '..', 'extension', 'manifest.json');
    let extVersion: string | null = null;
    try {
      if (existsSync(manifestPath)) {
        const mf = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: string };
        extVersion = mf.version ?? null;
      }
    } catch {}
    res.json({
      available: existsSync(zipPath),
      downloadUrl: '/extension.zip',
      version: extVersion,
    });
  });

  app.use('/api/branding', brandingRouter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/setup', setupLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/meetings', meetingsRouter);
  app.use('/api/highlights', highlightsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/linear', linearRouter);
  app.use('/api/export', exportRouter);
  app.use('/api/api-keys', apiKeysRouter);
  app.use('/api/errors', errorsRouter);
  app.use('/api/calendar', calendarRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/v1', integrationApiRouter);

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const clientDist = join(__dirname, '..', 'dist', 'public');
  const downloadsDir = join(__dirname, 'downloads'); // esbuild puts us in /app/dist, so /app/dist/downloads
  const brand = getBranding();

  // Serve the bundled Chrome extension zip. Handy root-level alias too.
  if (existsSync(downloadsDir)) {
    app.use('/downloads', express.static(downloadsDir, { maxAge: '1h' }));
    app.get('/extension.zip', (_req, res) => {
      res.sendFile(join(downloadsDir, 'memos-extension.zip'));
    });
  }

  let indexHtml: string | null = null;
  if (existsSync(join(clientDist, 'index.html'))) {
    indexHtml = readFileSync(join(clientDist, 'index.html'), 'utf8')
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(brand.name)} — ${escapeHtml(brand.tagline)}</title>`)
      .replace(
        /(<\/head>)/,
        `<script>window.__BRANDING__=${JSON.stringify(brand)};</script>$1`,
      );
  }

  if (existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      if (indexHtml) return res.type('html').send(indexHtml);
      res.sendFile(join(clientDist, 'index.html'));
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error('unhandled error', err);
    res.status(500).json({ error: 'internal error' });
  });

  const port = Number(process.env.PORT ?? 3100);
  const server = createServer(app);
  server.listen(port, () => {
    log.info(`${brand.name} v${process.env.APP_VERSION ?? 'dev'} listening on :${port}`);
  });

  startScheduler();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

main().catch(err => {
  console.error('fatal', err);
  process.exit(1);
});
