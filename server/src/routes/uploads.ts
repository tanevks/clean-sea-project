import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database';

const router = Router();

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, unique);
  },
});

const upload = multer({ storage });

router.post('/', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  const { markerId, groupId } = req.body;
  const id = uuidv4();
  const uploadedAt = new Date().toISOString();
  db.prepare(
    'INSERT INTO uploads (id, filename, originalname, mimetype, size, markerId, groupId, uploadedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, markerId || null, groupId || null, uploadedAt);
  const uploadRecord = db.prepare('SELECT * FROM uploads WHERE id = ?').get(id);
  res.status(201).json(uploadRecord);
});

router.get('/', (_req: Request, res: Response) => {
  const uploads = db.prepare('SELECT * FROM uploads ORDER BY uploadedAt DESC').all();
  res.json(uploads);
});

router.get('/file/:filename', (req: Request, res: Response) => {
  const filePath = path.resolve(uploadsDir, req.params.filename);
  if (!filePath.startsWith(uploadsDir + path.sep)) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'File not found' }); return; }
  res.sendFile(filePath);
});

router.delete('/:id', (req: Request, res: Response) => {
  const record = db.prepare('SELECT * FROM uploads WHERE id = ?').get(req.params.id) as { filename: string } | undefined;
  if (!record) { res.status(404).json({ error: 'Not found' }); return; }
  const filePath = path.join(uploadsDir, record.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM uploads WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
