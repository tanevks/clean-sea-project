import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const groups = db.prepare('SELECT * FROM groups ORDER BY createdAt DESC').all();
  res.json(groups);
});

router.post('/', (req: Request, res: Response) => {
  const { name, description, location, meetingDate, organizer } = req.body;
  if (!name || !description || !location || !meetingDate || !organizer) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO groups (id, name, description, location, meetingDate, organizer, memberCount, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, 'planned', ?)"
  ).run(id, name, description, location, meetingDate, organizer, createdAt);
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
  res.status(201).json(group);
});

router.put('/:id', (req: Request, res: Response) => {
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id) as { memberCount: number; status: string } | undefined;
  if (!group) { res.status(404).json({ error: 'Not found' }); return; }
  const { action, status, name, description, location, meetingDate, organizer } = req.body;
  if (action === 'join') {
    db.prepare('UPDATE groups SET memberCount = memberCount + 1 WHERE id = ?').run(req.params.id);
  } else if (status) {
    db.prepare('UPDATE groups SET status = ? WHERE id = ?').run(status, req.params.id);
  } else {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (location !== undefined) { updates.push('location = ?'); values.push(location); }
    if (meetingDate !== undefined) { updates.push('meetingDate = ?'); values.push(meetingDate); }
    if (organizer !== undefined) { updates.push('organizer = ?'); values.push(organizer); }
    if (updates.length > 0) {
      values.push(req.params.id);
      db.prepare(`UPDATE groups SET ${updates.join(', ')} WHERE id = ?`).run(values);
    }
  }
  const updated = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM groups WHERE id = ?').run(req.params.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ success: true });
});

export default router;
