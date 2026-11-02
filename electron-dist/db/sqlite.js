"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbManager = exports.MAX_FILES_PER_FOLDER = void 0;
const hiddenFiles_1 = require("../utils/hiddenFiles");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const electron_1 = require("electron");
exports.MAX_FILES_PER_FOLDER = 1000;
class DatabaseManager {
    db = null;
    dbPath = null;
    includeSystemFiles = false;
    visibility = (0, hiddenFiles_1.createFileVisibilityFilter)();
    setSystemFileVisibility(include) {
        this.includeSystemFiles = include === true;
        this.visibility = (0, hiddenFiles_1.createFileVisibilityFilter)();
    }
    isFileVisible(filePath) {
        if (this.includeSystemFiles)
            return true;
        try {
            return !this.visibility.isHidden(filePath);
        }
        catch {
            return false;
        }
    }
    /**
     * Инициализация БД и создание таблиц
     */
    init() {
        // Храним базу в папке пользовательских данных приложения (UserData)
        const dbPath = node_path_1.default.join(electron_1.app.getPath('userData'), 'localmind.db');
        // Seed a first-run database from the project asset, then keep the writable copy in userData.
        const seedPath = electron_1.app.isPackaged
            ? node_path_1.default.join(process.resourcesPath, 'database', 'localmind.db')
            : node_path_1.default.join(electron_1.app.getAppPath(), 'database', 'localmind.db');
        if (!node_fs_1.default.existsSync(dbPath) && node_fs_1.default.existsSync(seedPath)) {
            node_fs_1.default.copyFileSync(seedPath, dbPath);
        }
        this.db = new better_sqlite3_1.default(dbPath);
        this.db.function('owlsift_file_visible', (filePath) => this.isFileVisible(filePath) ? 1 : 0);
        this.dbPath = dbPath;
        this.db.pragma('foreign_keys = ON');
        // Включаем WAL-режим для ускорения записи и читаемости из разных потоков
        this.db.pragma('journal_mode = WAL');
        this.createTables();
    }
    /** Index a folder recursively. Text files are stored for FTS; other files remain searchable by name. */
    indexFolder(folderPath, requestedLimit = exports.MAX_FILES_PER_FOLDER) {
        if (!this.db)
            throw new Error('SQLite is not initialized');
        const limit = Math.max(1, Math.min(5000, Math.floor(requestedLimit) || exports.MAX_FILES_PER_FOLDER));
        const textExtensions = new Set([
            '.tsv', '.txt', '.md', '.markdown', '.csv', '.json', '.xml', '.html', '.htm',
            '.js', '.ts', '.vue', '.css', '.scss', '.yaml', '.yml', '.log', '.sql', '.py', '.java', '.c', '.cpp', '.h', '.sh',
        ]);
        const visibility = (0, hiddenFiles_1.createFileVisibilityFilter)();
        if (!this.includeSystemFiles && visibility.isHidden(folderPath))
            throw new Error('Hidden folders cannot be indexed');
        let indexedCount = 0;
        let skippedCount = 0;
        const visit = (directory) => {
            let entries;
            try {
                entries = node_fs_1.default.readdirSync(directory, { withFileTypes: true });
            }
            catch {
                return;
            }
            entries = entries
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
            for (const entry of entries) {
                const entryPath = node_path_1.default.join(directory, entry.name);
                if (entry.isSymbolicLink())
                    continue;
                try {
                    if (!this.includeSystemFiles && visibility.isHidden(entryPath)) {
                        skippedCount++;
                        continue;
                    }
                }
                catch {
                    skippedCount++;
                    continue;
                }
                if (entry.isDirectory()) {
                    visit(entryPath);
                    continue;
                }
                if (!entry.isFile())
                    continue;
                if (indexedCount >= limit) {
                    skippedCount += 1;
                    continue;
                }
                try {
                    const stat = node_fs_1.default.statSync(entryPath);
                    const extension = node_path_1.default.extname(entry.name).toLowerCase().replace(/^\./, '');
                    let content = '';
                    if (textExtensions.has(`.${extension}`) && stat.size <= 2 * 1024 * 1024) {
                        content = node_fs_1.default.readFileSync(entryPath, 'utf8');
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
                }
                catch (error) {
                    console.warn(`Skipping unreadable file ${entryPath}:`, error);
                }
            }
        };
        visit(folderPath);
        const activePaths = this.db.prepare('SELECT id, path FROM files WHERE is_deleted = 0').all()
            .filter(({ path: filePath }) => {
            const relative = node_path_1.default.relative(folderPath, filePath);
            return this.isFileVisible(filePath) && relative !== '' && relative !== '..' && !relative.startsWith(`..${node_path_1.default.sep}`) && !node_path_1.default.isAbsolute(relative);
        })
            .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
        const capExcess = activePaths.slice(limit);
        if (capExcess.length) {
            const hideFile = this.db.prepare('UPDATE files SET is_deleted = 1 WHERE id = ?');
            const hideExcess = this.db.transaction((ids) => {
                for (const id of ids)
                    hideFile.run(id);
            });
            hideExcess(capExcess.map(({ id }) => id));
        }
        this.db.prepare(`
            INSERT INTO indexed_folders (path, name, indexed_count)
            VALUES (?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET name = excluded.name, indexed_count = excluded.indexed_count
        `).run(folderPath, node_path_1.default.basename(folderPath), indexedCount);
        return { folderPath, indexedCount, skippedCount, limit };
    }
    readTextExtensions() {
        return new Set([
            '.tsv', '.txt', '.md', '.markdown', '.csv', '.json', '.xml', '.html', '.htm',
            '.js', '.ts', '.vue', '.css', '.scss', '.yaml', '.yml', '.log', '.sql', '.py', '.java', '.c', '.cpp', '.h', '.sh',
        ]);
    }
    rememberFolder(folderPath) {
        if (!this.db)
            return;
        this.db.prepare(`
            INSERT INTO indexed_folders (path, name, indexed_count)
            VALUES (?, ?, 0)
            ON CONFLICT(path) DO NOTHING
        `).run(folderPath, node_path_1.default.basename(folderPath));
        const count = this.listFolders().find((folder) => folder.path === folderPath)?.count ?? 0;
        this.db.prepare('UPDATE indexed_folders SET indexed_count = ? WHERE path = ?').run(count, folderPath);
    }
    indexSingleFile(filePath, folderPath) {
        if (!this.db)
            throw new Error('SQLite is not initialized');
        if (!node_fs_1.default.existsSync(filePath) || !node_fs_1.default.statSync(filePath).isFile())
            throw new Error('File not found');
        if (!this.isFileVisible(filePath))
            throw new Error('System and hidden files are excluded by the current settings');
        const stat = node_fs_1.default.statSync(filePath);
        const name = node_path_1.default.basename(filePath);
        const extension = node_path_1.default.extname(name).toLowerCase().replace(/^\./, '');
        let content = '';
        if (this.readTextExtensions().has(`.${extension}`) && stat.size <= 2 * 1024 * 1024) {
            content = node_fs_1.default.readFileSync(filePath, 'utf8');
        }
        this.saveFile({
            path: filePath,
            name,
            extension,
            size: stat.size,
            mtime: Math.floor(stat.mtimeMs),
            content,
        });
        const workspace = folderPath && node_fs_1.default.existsSync(folderPath) ? folderPath : node_path_1.default.dirname(filePath);
        this.rememberFolder(workspace);
        return { folderPath: workspace, indexedCount: 1, skippedCount: 0, limit: 1 };
    }
    createFileInFolder(folderPath, fileName, content, bytes) {
        if (!this.db)
            throw new Error('SQLite is not initialized');
        if (!folderPath || !node_fs_1.default.existsSync(folderPath) || !node_fs_1.default.statSync(folderPath).isDirectory()) {
            throw new Error('Folder not found');
        }
        if (!this.listFolders().some(folder => node_path_1.default.resolve(folder.path) === node_path_1.default.resolve(folderPath)))
            throw new Error('Workspace not found');
        const safeName = node_path_1.default.basename((fileName || 'untitled.txt').replace(/[\\/:*?"<>|]/g, '-'));
        const filePath = node_path_1.default.join(folderPath, safeName);
        if ((0, hiddenFiles_1.createFileVisibilityFilter)().isHidden(folderPath) || safeName.startsWith('.') || safeName.startsWith('~$'))
            throw new Error('Hidden files cannot be created');
        node_fs_1.default.writeFileSync(filePath, bytes ?? content ?? '', { flag: 'wx' });
        const result = this.indexSingleFile(filePath, folderPath);
        this.saveFile({ path: filePath, name: safeName, extension: node_path_1.default.extname(safeName).slice(1), size: node_fs_1.default.statSync(filePath).size, mtime: Math.floor(node_fs_1.default.statSync(filePath).mtimeMs), content });
        return result;
    }
    /** Update only an existing indexed document, without accepting a model-supplied path. */
    editIndexedFile(fileId, content, bytes, expectedMtime) {
        if (!this.db || !Number.isInteger(fileId) || typeof content !== 'string' || content.length > 2000000 || bytes.length > 20 * 1024 * 1024)
            throw new Error('Invalid document edit');
        const record = this.db.prepare('SELECT path FROM files WHERE id = ? AND is_deleted = 0').get(fileId);
        if (!record)
            throw new Error('Indexed file not found');
        if ((0, hiddenFiles_1.createFileVisibilityFilter)().isHidden(record.path) || node_fs_1.default.lstatSync(record.path).isSymbolicLink())
            throw new Error('This file cannot be edited');
        const descriptor = node_fs_1.default.openSync(record.path, 'r+');
        try {
            const stat = node_fs_1.default.fstatSync(descriptor);
            if (!stat.isFile() || Math.floor(stat.mtimeMs) !== expectedMtime)
                throw new Error('The file changed since indexing. Refresh the folder before editing.');
            // A local backup preserves the original binary and formatting.
            node_fs_1.default.copyFileSync(record.path, node_path_1.default.join(node_path_1.default.dirname(record.path), '.' + node_path_1.default.basename(record.path) + '.' + Date.now() + '.owlsift-backup'), node_fs_1.default.constants.COPYFILE_EXCL);
            node_fs_1.default.writeFileSync(descriptor, bytes);
            node_fs_1.default.ftruncateSync(descriptor, bytes.length);
        }
        finally {
            node_fs_1.default.closeSync(descriptor);
        }
        const stat = node_fs_1.default.statSync(record.path);
        this.saveFile({ path: record.path, name: node_path_1.default.basename(record.path), extension: node_path_1.default.extname(record.path).slice(1), size: stat.size, mtime: Math.floor(stat.mtimeMs), content });
    }
    getFileContent(fileId) {
        if (!this.db || !Number.isInteger(fileId))
            return '';
        const file = this.db.prepare('SELECT content FROM files WHERE id = ? AND is_deleted = 0').get(fileId);
        return file?.content ?? '';
    }
    listFolders() {
        if (!this.db)
            return [];
        const folders = this.db.prepare('SELECT name, path FROM indexed_folders ORDER BY name COLLATE NOCASE')
            .all();
        const activePaths = this.db.prepare('SELECT path FROM files WHERE is_deleted = 0 AND owlsift_file_visible(path) = 1').all()
            .map(({ path: filePath }) => filePath);
        return folders.filter(folder => this.isFileVisible(folder.path)).map((folder) => ({
            ...folder,
            count: activePaths.filter((filePath) => {
                const relative = node_path_1.default.relative(folder.path, filePath);
                return relative !== '' && relative !== '..' && !relative.startsWith(`..${node_path_1.default.sep}`) && !node_path_1.default.isAbsolute(relative);
            }).length,
        }));
    }
    listFiles() {
        if (!this.db)
            return [];
        const records = this.db.prepare(`
            SELECT id, path, name, extension, size, mtime,
              CASE WHEN content = '' THEN name ELSE substr(content, 1, 240) END AS snippet
            FROM files WHERE is_deleted = 0 AND owlsift_file_visible(path) = 1 ORDER BY name COLLATE NOCASE
        `).all();
        return this.attachTags(records);
    }
    getFilePath(fileId) {
        if (!this.db || !Number.isInteger(fileId))
            throw new Error('Invalid file id');
        const file = this.db.prepare('SELECT path FROM files WHERE id = ?').get(fileId);
        if (!file)
            throw new Error('Indexed file not found');
        return file.path;
    }
    removeFileRecord(fileId) {
        if (!this.db || !Number.isInteger(fileId))
            throw new Error('Invalid file id');
        this.db.prepare('UPDATE files SET is_deleted = 1 WHERE id = ?').run(fileId);
    }
    /** Remove an indexed workspace and hide its files from OwlSift without touching disk. */
    removeFolderFromIndex(folderPath) {
        if (!this.db)
            throw new Error('SQLite is not initialized');
        const indexedFolder = this.db.prepare('SELECT 1 FROM indexed_folders WHERE path = ?').get(folderPath);
        if (!indexedFolder)
            throw new Error('Indexed folder not found');
        const files = this.db.prepare('SELECT id, path FROM files').all();
        const nestedIds = files.filter(({ path: filePath }) => {
            const relative = node_path_1.default.relative(folderPath, filePath);
            return relative === '' || (relative !== '..' && !relative.startsWith(`..${node_path_1.default.sep}`) && !node_path_1.default.isAbsolute(relative));
        }).map(({ id }) => id);
        const remove = this.db.transaction(() => {
            const markDeleted = this.db.prepare('UPDATE files SET is_deleted = 1 WHERE id = ?');
            for (const id of nestedIds)
                markDeleted.run(id);
            const indexedFolders = this.db.prepare('SELECT path FROM indexed_folders').all();
            const removeFolder = this.db.prepare('DELETE FROM indexed_folders WHERE path = ?');
            for (const indexed of indexedFolders) {
                const relative = node_path_1.default.relative(folderPath, indexed.path);
                if (relative === '' || (relative !== '..' && !relative.startsWith(`..${node_path_1.default.sep}`) && !node_path_1.default.isAbsolute(relative))) {
                    removeFolder.run(indexed.path);
                }
            }
        });
        remove();
    }
    addFileTag(fileId, rawTag) {
        if (!this.db || !Number.isInteger(fileId))
            throw new Error('Invalid file id');
        const tag = rawTag.trim().replace(/^#+/, '').slice(0, 40);
        if (!tag)
            throw new Error('Tag cannot be empty');
        this.db.prepare('INSERT OR IGNORE INTO file_tags (file_id, tag) VALUES (?, ?)').run(fileId, tag);
        return this.db.prepare('SELECT tag FROM file_tags WHERE file_id = ? ORDER BY tag COLLATE NOCASE')
            .all(fileId).map((row) => row.tag);
    }
    removeFileTag(fileId, tag) {
        if (!this.db || !Number.isInteger(fileId))
            throw new Error('Invalid file id');
        this.db.prepare('DELETE FROM file_tags WHERE file_id = ? AND tag = ?').run(fileId, tag);
        return this.db.prepare('SELECT tag FROM file_tags WHERE file_id = ? ORDER BY tag COLLATE NOCASE')
            .all(fileId).map((row) => row.tag);
    }
    setFileNote(fileId, note) {
        if (!this.db || !Number.isInteger(fileId))
            throw new Error('Invalid file id');
        this.db.prepare(`
            INSERT INTO file_notes (file_id, note, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(file_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at
        `).run(fileId, note, Date.now());
    }
    attachTags(records) {
        if (!this.db || records.length === 0)
            return records;
        const tagsById = new Map();
        const rows = this.db.prepare('SELECT file_id, tag FROM file_tags ORDER BY tag COLLATE NOCASE')
            .all();
        for (const { file_id, tag } of rows) {
            const tags = tagsById.get(file_id) ?? [];
            tags.push(tag);
            tagsById.set(file_id, tags);
        }
        const notes = new Map(this.db.prepare('SELECT file_id, note FROM file_notes').all()
            .map(({ file_id, note }) => [file_id, note]));
        return records.map((record) => ({
            ...record,
            tags: tagsById.get(record.id) ?? [],
            note: notes.get(record.id) ?? '',
        }));
    }
    getImagePreview(fileId) {
        if (!this.db || !Number.isInteger(fileId))
            return null;
        const file = this.db.prepare('SELECT path, extension FROM files WHERE id = ?').get(fileId);
        if (!file)
            return null;
        const mimeTypes = {
            png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
            gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif',
        };
        const mimeType = mimeTypes[file.extension.toLowerCase()];
        if (!mimeType)
            return null;
        try {
            const stat = node_fs_1.default.statSync(file.path);
            if (!stat.isFile() || stat.size === 0 || stat.size > 10 * 1024 * 1024)
                return null;
            return `data:${mimeType};base64,${node_fs_1.default.readFileSync(file.path).toString('base64')}`;
        }
        catch (error) {
            console.warn(`Could not load image preview for indexed file ${fileId}:`, error);
            return null;
        }
    }
    /** Return live database health and index details for the status panel. */
    getStatus() {
        if (!this.db || !this.db.open) {
            return { connected: false, fileCount: 0, sizeBytes: 0, fts5Available: false };
        }
        try {
            const { count } = this.db.prepare('SELECT COUNT(*) AS count FROM files WHERE is_deleted = 0 AND owlsift_file_visible(path) = 1').get();
            const fts5Available = Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'files_fts'").get());
            const sizeBytes = this.dbPath && node_fs_1.default.existsSync(this.dbPath)
                ? node_fs_1.default.statSync(this.dbPath).size
                : 0;
            return { connected: true, fileCount: count, sizeBytes, fts5Available };
        }
        catch (error) {
            console.error('SQLite status check failed:', error);
            return { connected: false, fileCount: 0, sizeBytes: 0, fts5Available: false };
        }
    }
    /**
     * Создание основное таблицы файлов и виртуальной таблицы FTS5
     */
    createTables() {
        if (!this.db)
            return;
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
        const columns = this.db.prepare('PRAGMA table_info(files)').all();
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
    saveFile(file) {
        if (!this.db)
            return;
        const insertOrReplace = this.db.transaction(() => {
            // 1. Записываем/обновляем метаданные в основной таблице
            const stmt = this.db.prepare(`
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
    search(query, limit = 50) {
        if (!this.db || !query.trim())
            return [];
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
      WHERE files_fts MATCH ? AND f.is_deleted = 0 AND owlsift_file_visible(f.path) = 1
      ORDER BY rank
      LIMIT ?
    `);
        let contentMatches = [];
        try {
            contentMatches = stmt.all(formattedQuery, limit);
        }
        catch (error) {
            console.warn('FTS5 Search error; returning tag matches only:', error);
        }
        const terms = [...new Set(query.trim().split(/\s+/).map((term) => term.replace(/^#+/, '')).filter(Boolean))];
        const tagMatches = terms.length ? this.db.prepare(`
            SELECT f.id, f.path, f.name, f.extension, f.size, f.mtime,
              CASE WHEN f.content = '' THEN f.name ELSE substr(f.content, 1, 240) END AS snippet
            FROM files f
            WHERE f.is_deleted = 0 AND owlsift_file_visible(f.path) = 1 AND EXISTS (
              SELECT 1 FROM file_tags t
              WHERE t.file_id = f.id AND (${terms.map(() => 'LOWER(t.tag) LIKE LOWER(?)').join(' OR ')})
            )
            ORDER BY f.name COLLATE NOCASE
            LIMIT ?
        `).all(...terms.map((term) => `%${term}%`), limit) : [];
        const merged = new Map();
        for (const record of [...contentMatches, ...tagMatches])
            merged.set(record.id, record);
        return this.attachTags([...merged.values()].slice(0, limit));
    }
    /**
     * Закрытие соединения с БД
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}
exports.dbManager = new DatabaseManager();
