import { Router, type Request, type Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { Config } from '../config.ts';
import type { DomainRegistry } from '../domain-registry.ts';
import { authRequired } from '../auth.ts';
import {
  buildIdentifier,
  parseIdentifier,
  resolveCluster,
  validateIdentifier,
} from '../identifier.ts';

export function identifierRouter(
  _db: DatabaseSync,
  registry: DomainRegistry,
  _config: Config,
): Router {
  const router = Router();

  router.get('/validate', authRequired, (req: Request, res: Response) => {
    const value = String(req.query.value ?? '');
    res.json(validateIdentifier(value));
  });

  router.get('/parse', authRequired, (req: Request, res: Response) => {
    const value = String(req.query.value ?? '');
    const components = parseIdentifier(value);
    if (!components) {
      res.json({ ok: false, error: 'Invalid identifier format' });
      return;
    }
    res.json({ ok: true, components });
  });

  router.get('/cluster', authRequired, (req: Request, res: Response) => {
    const zone = String(req.query.zone ?? '');
    res.json({ cluster: resolveCluster(zone, registry) });
  });

  router.get('/build', authRequired, (req: Request, res: Response) => {
    const category = String(req.query.category ?? '');
    const fork = String(req.query.fork ?? '');
    const cluster = String(req.query.cluster ?? '');
    const requestNo = String(req.query.requestNo ?? '');
    res.json({ identifier: buildIdentifier({ category, fork, cluster, requestNo }) });
  });

  return router;
}
