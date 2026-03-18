import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const messages = db.prepare('SELECT * FROM messages ORDER BY createdAt DESC LIMIT 50').all();
  res.json(messages);
});

router.post('/', (req: Request, res: Response) => {
  const { username, text, markerRef } = req.body;
  if (!username || !text) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  db.prepare(
    'INSERT INTO messages (id, username, text, markerRef, createdAt) VALUES (?, ?, ?, ?, ?)'
  ).run(id, username, text, markerRef || null, createdAt);
  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  res.status(201).json(message);
});

router.delete('/:id', (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ success: true });
});

export default router;
