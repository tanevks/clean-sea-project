import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '../../data.db');

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS markers (
    id TEXT PRIMARY KEY,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
    createdAt TEXT NOT NULL,
    imageUrl TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    text TEXT NOT NULL,
    markerRef TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT NOT NULL,
    meetingDate TEXT NOT NULL,
    organizer TEXT NOT NULL,
    memberCount INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','completed')),
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    originalname TEXT NOT NULL,
    mimetype TEXT NOT NULL,
    size INTEGER NOT NULL,
    markerId TEXT,
    groupId TEXT,
    uploadedAt TEXT NOT NULL
  );
`);

export default db;
