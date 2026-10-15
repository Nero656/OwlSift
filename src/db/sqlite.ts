import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

export interface IndexedFile {
    id?: number;
    path: string;
    name: string;
    extension: string;
    size: number;
    mtime: number;
    content: string;
}

export interface SearchResult {
    id: number;
    path: string;
    name: string;
    snippet: string;
}

export interface IndexedFileRecord extends SearchResult {
    extension: string;
    size: number;
    mtime: number;
    tags: string[];
    note: string;
}

export interface DatabaseStatus {
    connected: boolean;
    fileCount: number;
    sizeBytes: number;
    fts5Available: boolean;
}

export const MAX_FILES_PER_FOLDER = 1000;

class DatabaseManager {
    private db: Database.Database | null = null;
    private dbPath: string | null = null;

    /**
     * Инициализация БД и создание таблиц
     */
    public init(): void {
        // Храним базу в папке пользовательских данных приложения (UserData)
        const dbPath = path.join(app.getPath('userData'), 'localmind.db');

        // Seed a first-run database from the project asset, then keep the writable copy in userData.
        const seedPath = app.isPackaged
            ? path.join(process.resourcesPath, 'database', 'localmind.db')
            : path.join(app.getAppPath(), 'database', 'localmind.db');
        if (!fs.existsSync(dbPath) && fs.existsSync(seedPath)) {
            fs.copyFileSync(seedPath, dbPath);
        }

        this.db = new Database(dbPath);
        this.dbPath = dbPath;
        this.db.pragma('foreign_keys = ON');

        // Включаем WAL-режим для ускорения записи и читаемости из разных потоков
        this.db.pragma('journal_mode = WAL');

        this.createTables();
    }

    /** Index a folder recursively. Text files are stored for FTS; other files remain searchable by name. */
    public indexFolder(folderPath: string, requestedLimit = MAX_FILES_PER_FOLDER): { folderPath: string; indexedCount: number; skippedCount: number; limit: number } {
        if (!this.db) throw new Error('SQLite is not initialized');
        const limit = Math.max(1, Math.min(5000, Math.floor(requestedLimit) || MAX_FILES_PER_FOLDER));

        const textExtensions = new Set([
            '.txt', '.md', '.markdown', '.csv', '.json', '.xml', '.html', '.htm',
            '.js', '.ts', '.vue', '.css', '.scss', '.yaml', '.yml', '.log', '.sql', '.py', '.java', '.c', '.cpp', '.h', '.sh',
        ]);
        let indexedCount = 0;
        let skippedCount = 0;

        const visit = (directory: string): void => {
            const entries = fs.readdirSync(directory, { withFileTypes: true })
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
            for (const entry of entries) {
                const entryPath = path.join(directory, entry.name);
                if (entry.isSymbolicLink()) continue;
                if (entry.isDirectory()) {
                    visit(entryPath);
                    continue;
                }
                if (!entry.isFile()) continue;
                if (indexedCount >= limit) {
                    skippedCount += 1;
                    continue;
                }

                try {
                    const stat = fs.statSync(entryPath);
                    const extension = path.extname(entry.name).toLowerCase().replace(/^\./, '');
                    let content = '';
                    if (textExtensions.has(`.${extension}`) && stat.size <= 2 * 1024 * 1024) {
                        content = fs.readFileSync(entryPath, 'utf8');
                    }
                    this.saveFile({
                        path: entryPath,
                        name: entry.name,
                        extension,
                        size: stat.size,
                        mtime: Math.floor(stat.mtimeMs),
                        content,
                    });
                    indexedCount += 1;
                } catch (error) {
                    console.warn(`Skipping unreadable file ${entryPath}:`, error);
                }
            }
        };

        visit(folderPath);
        const activePaths = (this.db.prepare('SELECT id, path FROM files WHERE is_deleted = 0').all() as Array<{ id: number; path: string }>)
            .filter(({ path: filePath }) => {
                const relative = path.relative(folderPath, filePath);
                return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
            })
            .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
        const capExcess = activePaths.slice(limit);
        if (capExcess.length) {
            const hideFile = this.db.prepare('UPDATE files SET is_deleted = 1 WHERE id = ?');
            const hideExcess = this.db.transaction((ids: number[]) => {
                for (const id of ids) hideFile.run(id);
            });
            hideExcess(capExcess.map(({ id }) => id));
        }
        this.db.prepare(`
            INSERT INTO indexed_folders (path, name, indexed_count)
            VALUES (?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET name = excluded.name, indexed_count = excluded.indexed_count
        `).run(folderPath, path.basename(folderPath), indexedCount);
        return { folderPath, indexedCount, skippedCount, limit };
    }

    private readTextExtensions() {
        return new Set([
            '.txt', '.md', '.markdown', '.csv', '.json', '.xml', '.html', '.htm',
            '.js', '.ts', '.vue', '.css', '.scss', '.yaml', '.yml', '.log', '.sql', '.py', '.java', '.c', '.cpp', '.h', '.sh',
        ]);
    }

    private rememberFolder(folderPath: string): void {
        if (!this.db) return;
        this.db.prepare(`
            INSERT INTO indexed_folders (path, name, indexed_count)
            VALUES (?, ?, 0)
            ON CONFLICT(path) DO NOTHING
        `).run(folderPath, path.basename(folderPath));
        const count = this.listFolders().find((folder) => folder.path === folderPath)?.count ?? 0;
        this.db.prepare('UPDATE indexed_folders SET indexed_count = ? WHERE path = ?').run(count, folderPath);
    }

    public indexSingleFile(filePath: string, folderPath?: string): { folderPath: string; indexedCount: number; skippedCount: number; limit: number } {
        if (!this.db) throw new Error('SQLite is not initialized');
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error('File not found');
        const stat = fs.statSync(filePath);
        const name = path.basename(filePath);
        const extension = path.extname(name).toLowerCase().replace(/^\./, '');
        let content = '';
        if (this.readTextExtensions().has(`.${extension}`) && stat.size <= 2 * 1024 * 1024) {
            content = fs.readFileSync(filePath, 'utf8');
        }
        this.saveFile({
            path: filePath,
            name,
            extension,
            size: stat.size,
            mtime: Math.floor(stat.mtimeMs),
            content,
        });
        const workspace = folderPath && fs.existsSync(folderPath) ? folderPath : path.dirname(filePath);
        this.rememberFolder(workspace);
        return { folderPath: workspace, indexedCount: 1, skippedCount: 0, limit: 1 };
    }

    public createFileInFolder(folderPath: string, fileName: string, content: string, bytes?: Buffer): { folderPath: string; indexedCount: number; skippedCount: number; limit: number } {
        if (!this.db) throw new Error('SQLite is not initialized');
        if (!folderPath || !fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
            throw new Error('Folder not found');
        }
        const safeName = path.basename((fileName || 'untitled.txt').replace(/[\\/:*?"<>|]/g, '-'));
        const filePath = path.join(folderPath, safeName);
        fs.writeFileSync(filePath, bytes ?? content ?? '', { flag: 'wx' });
        const result = this.indexSingleFile(filePath, folderPath);
        this.saveFile({ path: filePath, name: safeName, extension: path.extname(safeName).slice(1), size: fs.statSync(filePath).size, mtime: Date.now(), content });
        return result;
    }

    public getFileContent(fileId: number): string {
        if (!this.db || !Number.isInteger(fileId)) return '';
        const file = this.db.prepare('SELECT content FROM files WHERE id = ? AND is_deleted = 0').get(fileId) as { content?: string } | undefined;
        return file?.content ?? '';
    }

    public listFolders(): Array<{ name: string; path: string; count: number }> {
        if (!this.db) return [];
        const folders = this.db.prepare('SELECT name, path FROM indexed_folders ORDER BY name COLLATE NOCASE')
            .all() as Array<{ name: string; path: string }>;
        const activePaths = (this.db.prepare('SELECT path FROM files WHERE is_deleted = 0').all() as Array<{ path: string }>)
            .map(({ path: filePath }) => filePath);
        return folders.map((folder) => ({
            ...folder,
            count: activePaths.filter((filePath) => {
                const relative = path.relative(folder.path, filePath);
                return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
            }).length,
        }));
    }

    public listFiles(): IndexedFileRecord[] {
        if (!this.db) return [];
        const records = this.db.prepare(`
            SELECT id, path, name, extension, size, mtime,
              CASE WHEN content = '' THEN name ELSE substr(content, 1, 240) END AS snippet
            FROM files WHERE is_deleted = 0 ORDER BY name COLLATE NOCASE
        `).all() as IndexedFileRecord[];
        return this.attachTags(records);
    }

    public getFilePath(fileId: number): string {
        if (!this.db || !Number.isInteger(fileId)) throw new Error('Invalid file id');
        const file = this.db.prepare('SELECT path FROM files WHERE id = ?').get(fileId) as { path: string } | undefined;
        if (!file) throw new Error('Indexed file not found');
        return file.path;
    }

    public removeFileRecord(fileId: number): void {
        if (!this.db || !Number.isInteger(fileId)) throw new Error('Invalid file id');
        this.db.prepare('UPDATE files SET is_deleted = 1 WHERE id = ?').run(fileId);
    }

    /** Remove an indexed workspace and hide its files from LocalMind without touching disk. */
    public removeFolderFromIndex(folderPath: string): void {
        if (!this.db) throw new Error('SQLite is not initialized');
        const indexedFolder = this.db.prepare('SELECT 1 FROM indexed_folders WHERE path = ?').get(folderPath);
        if (!indexedFolder) throw new Error('Indexed folder not found');
        const files = this.db.prepare('SELECT id, path FROM files').all() as Array<{ id: number; path: string }>;
        const nestedIds = files.filter(({ path: filePath }) => {
            const relative = path.relative(folderPath, filePath);
            return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
        }).map(({ id }) => id);

        const remove = this.db.transaction(() => {
            const markDeleted = this.db!.prepare('UPDATE files SET is_deleted = 1 WHERE id = ?');
            for (const id of nestedIds) markDeleted.run(id);
            const indexedFolders = this.db!.prepare('SELECT path FROM indexed_folders').all() as Array<{ path: string }>;
            const removeFolder = this.db!.prepare('DELETE FROM indexed_folders WHERE path = ?');
            for (const indexed of indexedFolders) {
                const relative = path.relative(folderPath, indexed.path);
                if (relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
                    removeFolder.run(indexed.path);
                }
            }
        });
        remove();
    }

    public addFileTag(fileId: number, rawTag: string): string[] {
        if (!this.db || !Number.isInteger(fileId)) throw new Error('Invalid file id');
        const tag = rawTag.trim().replace(/^#+/, '').slice(0, 40);
        if (!tag) throw new Error('Tag cannot be empty');

        this.db.prepare('INSERT OR IGNORE INTO file_tags (file_id, tag) VALUES (?, ?)').run(fileId, tag);
        return (this.db.prepare('SELECT tag FROM file_tags WHERE file_id = ? ORDER BY tag COLLATE NOCASE')
            .all(fileId) as Array<{ tag: string }>).map((row) => row.tag);
    }

    public removeFileTag(fileId: number, tag: string): string[] {
        if (!this.db || !Number.isInteger(fileId)) throw new Error('Invalid file id');
        this.db.prepare('DELETE FROM file_tags WHERE file_id = ? AND tag = ?').run(fileId, tag);
        return (this.db.prepare('SELECT tag FROM file_tags WHERE file_id = ? ORDER BY tag COLLATE NOCASE')
            .all(fileId) as Array<{ tag: string }>).map((row) => row.tag);
    }

    public setFileNote(fileId: number, note: string): void {
        if (!this.db || !Number.isInteger(fileId)) throw new Error('Invalid file id');
        this.db.prepare(`
            INSERT INTO file_notes (file_id, note, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(file_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at
        `).run(fileId, note, Date.now());
    }

    private attachTags(records: IndexedFileRecord[]): IndexedFileRecord[] {
        if (!this.db || records.length === 0) return records;
        const tagsById = new Map<number, string[]>();
        const rows = this.db.prepare('SELECT file_id, tag FROM file_tags ORDER BY tag COLLATE NOCASE')
            .all() as Array<{ file_id: number; tag: string }>;
        for (const { file_id, tag } of rows) {
            const tags = tagsById.get(file_id) ?? [];
            tags.push(tag);
            tagsById.set(file_id, tags);
        }
        const notes = new Map((this.db.prepare('SELECT file_id, note FROM file_notes').all() as Array<{ file_id: number; note: string }>)
            .map(({ file_id, note }) => [file_id, note]));
        return records.map((record) => ({
            ...record,
            tags: tagsById.get(record.id) ?? [],
            note: notes.get(record.id) ?? '',
        }));
    }

    public getImagePreview(fileId: number): string | null {
        if (!this.db || !Number.isInteger(fileId)) return null;

        const file = this.db.prepare('SELECT path, extension FROM files WHERE id = ?').get(fileId) as
            { path: string; extension: string } | undefined;
        if (!file) return null;

        const mimeTypes: Record<string, string> = {
            png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
            gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif',
        };
        const mimeType = mimeTypes[file.extension.toLowerCase()];
        if (!mimeType) return null;

        try {
            const stat = fs.statSync(file.path);
            if (!stat.isFile() || stat.size === 0 || stat.size > 10 * 1024 * 1024) return null;
            return `data:${mimeType};base64,${fs.readFileSync(file.path).toString('base64')}`;
        } catch (error) {
            console.warn(`Could not load image preview for indexed file ${fileId}:`, error);
            return null;
        }
    }

    /** Return live database health and index details for the status panel. */
    public getStatus(): DatabaseStatus {
        if (!this.db || !this.db.open) {
            return { connected: false, fileCount: 0, sizeBytes: 0, fts5Available: false };
        }

        try {
            const { count } = this.db.prepare('SELECT COUNT(*) AS count FROM files WHERE is_deleted = 0').get() as { count: number };
            const fts5Available = Boolean(this.db.prepare(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'files_fts'"
            ).get());
            const sizeBytes = this.dbPath && fs.existsSync(this.dbPath)
                ? fs.statSync(this.dbPath).size
                : 0;

            return { connected: true, fileCount: count, sizeBytes, fts5Available };
        } catch (error) {
            console.error('SQLite status check failed:', error);
            return { connected: false, fileCount: 0, sizeBytes: 0, fts5Available: false };
        }
    }

    /**
     * Создание основное таблицы файлов и виртуальной таблицы FTS5
     */
    private createTables(): void {
        if (!this.db) return;

        // Основная таблица для хранения метаданных
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        extension TEXT NOT NULL,
        size INTEGER NOT NULL,
        mtime INTEGER NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        is_deleted INTEGER NOT NULL DEFAULT 0
      );
    `);

        this.db.exec(`
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

        const columns = this.db.prepare('PRAGMA table_info(files)').all() as Array<{ name: string }>;
        if (!columns.some((column) => column.name === 'content')) {
            this.db.exec("ALTER TABLE files ADD COLUMN content TEXT NOT NULL DEFAULT ''");
        }
        if (!columns.some((column) => column.name === 'is_deleted')) {
            this.db.exec('ALTER TABLE files ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0');
        }

        // FTS5 виртуальная таблица для полнотекстового поиска по содержимому
        // tokenize='unicode61' обеспечивает корректную работу с кириллицей и регистрами
        this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
        name,
        content,
        content='files',
        content_rowid='id',
        tokenize='unicode61'
      );
    `);

        // Триггеры для автоматической синхронизации FTS5 индекса с основной таблицей
        this.db.exec(`
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
    }

    /**
     * Индексация или обновление файла в базе
     */
    public saveFile(file: IndexedFile): void {
        if (!this.db) return;

        const insertOrReplace = this.db.transaction(() => {
            // 1. Записываем/обновляем метаданные в основной таблице
            const stmt = this.db!.prepare(`
        INSERT INTO files (path, name, extension, size, mtime, content)
        VALUES (@path, @name, @extension, @size, @mtime, @content)
        ON CONFLICT(path) DO UPDATE SET
          name = excluded.name,
          extension = excluded.extension,
          size = excluded.size,
          mtime = excluded.mtime,
          content = excluded.content,
          is_deleted = 0;
      `);
            stmt.run(file);
        });

        insertOrReplace();
    }

    /**
     * Полнотекстовый поиск по FTS5 с подсветкой найденого фрагмента
     */
    public search(query: string, limit = 50): IndexedFileRecord[] {
        if (!this.db || !query.trim()) return [];

        // Преобразуем запрос для префиксного поиска (например: "догов*" найдет "договор", "договора")
        const formattedQuery = query
            .trim()
            .split(/\s+/)
            .map((term) => `${term}*`)
            .join(' ');

        const stmt = this.db.prepare(`
      SELECT 
        f.id,
        f.path,
        f.name,
        f.extension,
        f.size,
        f.mtime,
        snippet(files_fts, 1, '<mark>', '</mark>', '...', 15) AS snippet
      FROM files_fts
      JOIN files f ON f.id = files_fts.rowid
      WHERE files_fts MATCH ? AND f.is_deleted = 0
      ORDER BY rank
      LIMIT ?
    `);

        let contentMatches: IndexedFileRecord[] = [];
        try {
            contentMatches = stmt.all(formattedQuery, limit) as IndexedFileRecord[];
        } catch (error) {
            console.warn('FTS5 Search error; returning tag matches only:', error);
        }

        const terms = [...new Set(query.trim().split(/\s+/).map((term) => term.replace(/^#+/, '')).filter(Boolean))];
        const tagMatches = terms.length ? this.db.prepare(`
            SELECT f.id, f.path, f.name, f.extension, f.size, f.mtime,
              CASE WHEN f.content = '' THEN f.name ELSE substr(f.content, 1, 240) END AS snippet
            FROM files f
            WHERE f.is_deleted = 0 AND EXISTS (
              SELECT 1 FROM file_tags t
              WHERE t.file_id = f.id AND (${terms.map(() => 'LOWER(t.tag) LIKE LOWER(?)').join(' OR ')})
            )
            ORDER BY f.name COLLATE NOCASE
            LIMIT ?
        `).all(...terms.map((term) => `%${term}%`), limit) as IndexedFileRecord[] : [];

        const merged = new Map<number, IndexedFileRecord>();
        for (const record of [...contentMatches, ...tagMatches]) merged.set(record.id, record);
        return this.attachTags([...merged.values()].slice(0, limit));
    }

    /**
     * Закрытие соединения с БД
     */
    public close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

export const dbManager = new DatabaseManager();
