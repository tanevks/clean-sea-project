import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const markers = db.prepare('SELECT * FROM markers ORDER BY createdAt DESC').all();
  res.json(markers);
});

router.post('/', (req: Request, res: Response) => {
  const { lat, lng, title, description, severity } = req.body;
  if (!lat || !lng || !title || !description || !severity) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  db.prepare(
    'INSERT INTO markers (id, lat, lng, title, description, severity, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, lat, lng, title, description, severity, createdAt);
  const marker = db.prepare('SELECT * FROM markers WHERE id = ?').get(id);
  res.status(201).json(marker);
});

router.get('/:id', (req: Request, res: Response) => {
  const marker = db.prepare('SELECT * FROM markers WHERE id = ?').get(req.params.id);
  if (!marker) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(marker);
});

router.delete('/:id', (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM markers WHERE id = ?').run(req.params.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ success: true });
});

export default router;
