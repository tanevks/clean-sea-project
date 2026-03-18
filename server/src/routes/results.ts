import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const totalMarkers = (db.prepare('SELECT COUNT(*) as count FROM markers').get() as { count: number }).count;
  const markersBySeverityRaw = db.prepare('SELECT severity, COUNT(*) as count FROM markers GROUP BY severity').all() as { severity: string; count: number }[];
  const markersBySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
  markersBySeverityRaw.forEach(row => {
    if (row.severity in markersBySeverity) {
      (markersBySeverity as Record<string, number>)[row.severity] = row.count;
    }
  });

  const totalGroups = (db.prepare('SELECT COUNT(*) as count FROM groups').get() as { count: number }).count;
  const groupsByStatusRaw = db.prepare('SELECT status, COUNT(*) as count FROM groups GROUP BY status').all() as { status: string; count: number }[];
  const groupsByStatus = { planned: 0, active: 0, completed: 0 };
  groupsByStatusRaw.forEach(row => {
    if (row.status in groupsByStatus) {
      (groupsByStatus as Record<string, number>)[row.status] = row.count;
    }
  });

  const totalUploads = (db.prepare('SELECT COUNT(*) as count FROM uploads').get() as { count: number }).count;
  const totalMessages = (db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }).count;

  res.json({ totalMarkers, markersBySeverity, totalGroups, groupsByStatus, totalUploads, totalMessages });
});

export default router;
