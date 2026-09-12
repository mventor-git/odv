import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { rateLimit } from 'express-rate-limit';
import type { DatabaseSync } from 'node:sqlite';
import { PROJECT_ROOT, type Config } from './config.ts';
import { authRouter } from './routes/auth.ts';
import { filesRouter } from './routes/files.ts';
import { legacyRouter } from './routes/legacy.ts';
import { logsRouter } from './routes/logs.ts';
import { metaRouter } from './routes/meta.ts';
import { recordsRouter } from './routes/records.ts';
import { trashRouter } from './routes/trash.ts';
import { refRouter } from './routes/ref.ts';
import { reportsRouter } from './routes/reports.ts';
import { scansRouter } from './routes/scans.ts';
import { settingsRouter } from './routes/settings.ts';
import { setupRouter } from './routes/setup.ts';
import { fylerRouter } from './routes/fyler.ts';
import { checklistRouter } from './routes/checklist.ts';
import { helpRouter } from './routes/help.ts';
import { notifyRouter } from './routes/notify.ts';
import { searchRouter } from './routes/search.ts';
import { domainAdminRouter } from './routes/domain-admin.ts';
import { templatesRouter } from './routes/templates.ts';
import { mappersRouter } from './routes/mappers.ts';
import { artifactsRouter } from './routes/artifacts.ts';
import { permissionsRouter } from './routes/permissions.ts';
import { cementRouter } from './routes/cement.ts';
import { laborRouter } from './routes/labor.ts';
import { identifierRouter } from './routes/identifier.ts';
import { clustersRouter } from './routes/clusters.ts';
import { DomainRegistry } from './domain-registry.ts';

export function createApp(db: DatabaseSync, config: Config): express.Express {
  const app = express();
  app.locals.config = config;
  const domainRegistry = new DomainRegistry(db);
  app.locals.domainRegistry = domainRegistry;

  // Security hardening (V5-030): restricted CORS, headers, rate limit.
  const allowedOrigins = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  app.use(cors(allowedOrigins.length > 0 ? { origin: allowedOrigins } : {}));
  app.use((_, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Real rate limiting (mventor-ticket-122). Env-configurable, with sane LAN
  // defaults. The login limiter is strict (brute-force); the global limiter
  // catches DDoS/abuse but is loose enough for normal LAN bursts.
  const globalWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
  const globalMax = Number(process.env.RATE_LIMIT_MAX ?? 200);
  const globalLimiter = rateLimit({
    windowMs: globalWindowMs,
    max: globalMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: JSON.stringify({ error: 'Too many requests. Please slow down.' }),
  });
  app.use('/api', globalLimiter);

  const loginWindowMs = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 60_000);
  const loginMax = Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 10);
  const loginLimiter = rateLimit({
    windowMs: loginWindowMs,
    max: loginMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: JSON.stringify({ error: 'Too many login attempts. Please wait and try again.' }),
  });
  app.use('/api/auth/login', loginLimiter);

  app.use(express.json({ limit: '1mb' }));

  app.use('/api/auth', authRouter(db, config));
  app.use('/api/meta', metaRouter(db, domainRegistry));
  app.use('/api/records', recordsRouter(db, domainRegistry));
  app.use('/api/trash', trashRouter(db, config));
  app.use('/api/reports', reportsRouter(db, config, domainRegistry));
  app.use('/api/scans', scansRouter(db, config, domainRegistry));
  app.use('/api/settings', settingsRouter(db, config));
  app.use('/api/setup', setupRouter(db));
  app.use('/api/fyler', fylerRouter(db, config));
  app.use('/api/checklist', checklistRouter(db, domainRegistry));
  app.use('/api/help', helpRouter(db));
  app.use('/api/notify', notifyRouter(db, config));
  app.use('/api/search', searchRouter(db));
  app.use('/api/ref', refRouter(db, config, domainRegistry));
  app.use('/api/domain', domainAdminRouter(db, domainRegistry));
  app.use('/api/templates', templatesRouter(db, config, domainRegistry));
  app.use('/api/mappers', mappersRouter(db, domainRegistry));
  app.use('/api/artifacts', artifactsRouter(db, config));
  app.use('/api/permissions', permissionsRouter(db));
  app.use('/api/cement', cementRouter(db));
  app.use('/api/labor', laborRouter(db));
  app.use('/api/identifier', identifierRouter(db, domainRegistry, config));
  app.use('/api/clusters', clustersRouter(db));
  app.use('/api/logs', logsRouter(db));
  app.use('/api/files', filesRouter(db, config));
  app.use('/api/legacy', legacyRouter(db, config));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Serve the built client (SPA) if present — LAN users hit one port.
  const dist = path.join(PROJECT_ROOT, 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.sendFile(path.join(dist, 'index.html'));
        return;
      }
      next();
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[odv] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
