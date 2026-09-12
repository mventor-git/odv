import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { authRequired } from '../auth.ts';
import type { DomainRegistry } from '../domain-registry.ts';

export function metaRouter(db: DatabaseSync, registry: DomainRegistry): Router {
  const r = Router();

  r.get('/', authRequired, (_req, res) => {
    // Reference data is DB-driven (ticket 038/039) — zones carry their cluster
    // + Arabic delegate (ticket 068); floors are the selectable list.
    // V5-005: categories/statuses/cycles/buckets now come from DomainRegistry.
    const zones = db
      .prepare('SELECT code, name, name_ar AS nameAr, cluster FROM zones ORDER BY code')
      .all() as unknown as Array<{ code: string; name: string; nameAr: string; cluster: string }>;
    const floors = db
      .prepare('SELECT name, name_ar AS nameAr FROM floors ORDER BY name')
      .all() as unknown as Array<{ name: string; nameAr: string }>;
    const floorNamesAr = registry.getFloorNamesAr();
    const snap = registry.getSnapshot();
    res.json({
      categories: snap.categories,
      statuses: snap.statuses,
      zones,
      floors: floors.map((f) => f.name),
      floorNamesAr,
      buckets: snap.buckets,
      cycles: snap.cycles,
    });
  });

  return r;
}