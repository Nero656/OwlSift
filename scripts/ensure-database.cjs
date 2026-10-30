const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync: Database } = require('node:sqlite');

const databasePath = process.env.LOCALMIND_DATABASE_PATH || path.join(__dirname, '..', 'database', 'localmind.db');
const databaseDirectory = path.dirname(databasePath);
fs.mkdirSync(databaseDirectory, { recursive: true });

const db = new Database(databasePath);
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      extension TEXT NOT NULL,
      size INTEGER NOT NULL,
      mtime INTEGER NOT NULL,
      content TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS indexed_folders (
      path TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      indexed_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS file_tags (
      file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      tag TEXT NOT NULL COLLATE NOCASE,
      PRIMARY KEY (file_id, tag)
    );
    CREATE TABLE IF NOT EXISTS file_notes (
      file_id INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
      note TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );
  `);

  const columns = db.prepare('PRAGMA table_info(files)').all();
  if (!columns.some((column) => column.name === 'content')) {
    db.exec("ALTER TABLE files ADD COLUMN content TEXT NOT NULL DEFAULT ''");
  }

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
      name, content, content='files', content_rowid='id', tokenize='unicode61'
    );
    DROP TRIGGER IF EXISTS files_ai;
    DROP TRIGGER IF EXISTS files_ad;
    DROP TRIGGER IF EXISTS files_au;
    CREATE TRIGGER files_ai AFTER INSERT ON files BEGIN
      INSERT INTO files_fts(rowid, name, content) VALUES (new.id, new.name, new.content);
    END;
    CREATE TRIGGER files_ad AFTER DELETE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, name, content) VALUES('delete', old.id, old.name, old.content);
    END;
    CREATE TRIGGER files_au AFTER UPDATE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, name, content) VALUES('delete', old.id, old.name, old.content);
      INSERT INTO files_fts(rowid, name, content) VALUES (new.id, new.name, new.content);
    END;
    INSERT INTO files_fts(files_fts) VALUES('rebuild');
  `);
} finally {
  db.close();
}

console.log(`SQLite index database is ready: ${databasePath}`);
