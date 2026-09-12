import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { authRequired } from '../auth.ts';
import type { Config } from '../config.ts';

export function artifactsRouter(db: DatabaseSync, config: Config): Router {
  const r = Router();
  r.use(authRequired);

  // List artifacts (paginated)
  r.get('/', (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
    const rows = db.prepare('SELECT id, artifact_type AS artifactType, category, file_path AS filePath, mime_type AS mimeType, size_bytes AS sizeBytes, created_at AS createdAt, metadata_json AS metadataJson FROM artifacts ORDER BY id DESC LIMIT ?').all(limit);
    res.json({ items: rows });
  });

  r.get('/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(Number(req.params.id)) as any;
    if (!row) { res.status(404).json({ error: 'Artifact not found' }); return; }
    res.json(row);
  });

  // Job status (V5-013)
  r.get('/jobs/:id/status', (req, res) => {
    const row = db.prepare('SELECT id, status, error_message AS errorMessage, file_path AS filePath FROM artifact_jobs WHERE id = ?').get(Number(req.params.id)) as any;
    if (!row) { res.status(404).json({ error: 'Job not found' }); return; }
    res.json(row);
  });

  // Create artifact job (scaffold — inserts queued job, real worker picks up in V5-013)
  r.post('/jobs', (req, res) => {
    const body = req.body ?? {};
    const info = db.prepare('INSERT INTO artifact_jobs (category, record_id, status) VALUES (?, ?, ?)').run(String(body.category ?? 'IR'), Number(body.recordId ?? 0), 'queued');
    res.status(201).json({ jobId: Number(info.lastInsertRowid), status: 'queued' });
  });

  return r;
}
