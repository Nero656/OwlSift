"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbManager = exports.MAX_FILES_PER_FOLDER = void 0;
const fileTypeGroups_1 = require("../utils/fileTypeGroups");
const indexedText_1 = require("../services/indexedText");
const node_crypto_1 = require("node:crypto");
const scanStorage_1 = require("../services/scanStorage");
const fuzzySearch_1 = require("../services/fuzzySearch");
const workspaceFiles_1 = require("../services/workspaceFiles");
const hiddenFiles_1 = require("../utils/hiddenFiles");
const fileVisibility_1 = require("../utils/fileVisibility");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const electron_1 = require("electron");
exports.MAX_FILES_PER_FOLDER = 1000;
const EARLY_CONTENT_THRESHOLD = 5000;
const EARLY_CONTENT_INTERVAL = 100;
const OS_SCAN_IGNORED_DIRECTORIES = new Set([
    'windows', '$recycle.bin', 'system volume information', 'program files',
    'program files (x86)', 'programdata', 'perflogs', 'recovery',
    'proc', 'sys', 'dev', 'run', 'snap', 'node_modules', '.git',
]);
const isAccessDenied = (error) => {
    const code = error?.code;
    return code === 'EACCES' || code === 'EPERM';
};
async function verifyScanReadable(filePath) {
    if (process.platform === 'win32') {
        // access() does not test Windows ACLs.
        const handle = await node_fs_1.default.promises.open(filePath, 'r');
        await handle.close();
    }
    else {
        await node_fs_1.default.promises.access(filePath, node_fs_1.default.constants.R_OK);
    }
}
const OS_SCAN_IGNORED_UNIX_ROOTS = new Set(['usr', 'etc', 'var', 'lib', 'lib64', 'bin', 'sbin', 'boot', 'system', 'applications', 'private']);
class DatabaseManager {
    catalog;
    folderScanRunning = false;
    indexPath(id) {
        return node_path_1.default.join(electron_1.app.getPath('userData'), id === 'default' ? 'localmind.db' : 'index-' + id + '.db');
    }
    get catalogPath() {
        return node_path_1.default.join(electron_1.app.getPath('userData'), 'index-catalog.json');
    }
    saveCatalog(catalog) {
        const temporaryPath = this.catalogPath + '.tmp';
        node_fs_1.default.writeFileSync(temporaryPath, JSON.stringify(catalog));
        node_fs_1.default.renameSync(temporaryPath, this.catalogPath);
        this.catalog = catalog;
    }
    listIndexes() {
        if (!this.catalog)
            throw new Error('Index databases could not be opened.');
        return { ...this.catalog, scanMode: (0, scanStorage_1.normalizeScanMode)(this.catalog.scanMode) };
    }
    setScanMode(mode) {
        this.saveCatalog({ ...this.catalog, scanMode: (0, scanStorage_1.normalizeScanMode)(mode) });
    }
    createIndex(name) {
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 80)
            throw new Error('Enter an index name (1–80 characters).');
        const trimmed = name.trim();
        if (this.catalog.indexes.some(index => index.name.toLowerCase() === trimmed.toLowerCase()))
            throw new Error('An index with this name already exists.');
        const index = { id: (0, node_crypto_1.randomUUID)(), name: trimmed };
        new better_sqlite3_1.default(this.indexPath(index.id)).close();
        try {
            this.saveCatalog({ ...this.catalog, indexes: [...this.catalog.indexes, index] });
        }
        catch (error) {
            node_fs_1.default.unlinkSync(this.indexPath(index.id));
            throw error;
        }
    }
    switchIndex(id) {
        if (id === this.catalog.activeId)
            return;
        if (!this.catalog.indexes.some(index => index.id === id))
            throw new Error('Index not found.');
        if (this.documentScan || this.folderScanRunning || this.workspaceTransferBusy)
            throw new Error('Wait for indexing or file operations to finish.');
        const previous = { db: this.db, dbPath: this.dbPath, searchIndex: this.searchIndex, fileUpsert: this.fileUpsert };
        this.db = null;
        this.fileUpsert = null;
        try {
            this.openIndex(this.indexPath(id), true);
            this.saveCatalog({ ...this.catalog, activeId: id });
        }
        catch (error) {
            this.close();
            Object.assign(this, previous);
            throw error;
        }
        previous.db?.close();
    }
    deleteIndex(id) {
        if (id === this.catalog.activeId)
            throw new Error('Switch to another index before deleting this one.');
        if (!this.catalog.indexes.some(index => index.id === id))
            throw new Error('Index not found.');
        const filename = this.indexPath(id);
        // Rename first so a catalog write failure can restore the index.
        node_fs_1.default.renameSync(filename, filename + '.deleted');
        try {
            this.saveCatalog({ ...this.catalog, indexes: this.catalog.indexes.filter(index => index.id !== id) });
        }
        catch (error) {
            node_fs_1.default.renameSync(filename + '.deleted', filename);
            throw error;
        }
        for (const suffix of ['.deleted', '-wal', '-shm', '-journal'])
            node_fs_1.default.rmSync(filename + suffix, { force: true });
    }
    db = null;
    dbPath = null;
    searchIndex = null;
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
    /** Fast metadata-only filter for SQLite result queries; never starts PowerShell on the UI thread. */
    isFileVisibleForQuery(filePath) {
        if (this.includeSystemFiles)
            return true;
        try {
            return !(0, fileVisibility_1.isHiddenPath)(filePath);
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
        const existing = node_fs_1.default.existsSync(this.catalogPath);
        if (existing) {
            const catalog = JSON.parse(node_fs_1.default.readFileSync(this.catalogPath, 'utf8'));
            if (!Array.isArray(catalog.indexes) || !catalog.indexes.every(index => typeof index.name === 'string' && (index.id === 'default' || /^[a-f0-9-]{36}$/.test(index.id))) ||
                !catalog.indexes.some(index => index.id === catalog.activeId))
                throw new Error('Invalid index catalog.');
            this.catalog = catalog;
            for (const index of catalog.indexes) {
                const filename = this.indexPath(index.id);
                if (!node_fs_1.default.existsSync(filename) && node_fs_1.default.existsSync(filename + '.deleted'))
                    node_fs_1.default.renameSync(filename + '.deleted', filename);
            }
            this.openIndex(this.indexPath(catalog.activeId), true);
            return;
        }
        const dbPath = this.indexPath('default');
        // Seed a first-run database from the project asset, then keep the writable copy in userData.
        const seedPath = electron_1.app.isPackaged
            ? node_path_1.default.join(process.resourcesPath, 'database', 'localmind.db')
            : node_path_1.default.join(electron_1.app.getAppPath(), 'database', 'localmind.db');
        if (!node_fs_1.default.existsSync(dbPath) && node_fs_1.default.existsSync(seedPath)) {
            node_fs_1.default.copyFileSync(seedPath, dbPath);
        }
        this.openIndex(dbPath);
        this.saveCatalog({ activeId: 'default', indexes: [{ id: 'default', name: 'Default' }] });
    }
    openIndex(dbPath, fileMustExist = false) {
        this.db = new better_sqlite3_1.default(dbPath, { fileMustExist });
        this.db.function('owlsift_file_visible', (filePath) => this.isFileVisibleForQuery(filePath) ? 1 : 0);
        this.dbPath = dbPath;
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('busy_timeout = 1500');
        // Включаем WAL-режим для ускорения записи и читаемости из разных потоков
        this.db.pragma('journal_mode = WAL');
        this.createTables();
        this.searchIndex = new fuzzySearch_1.FileSearch(this.db);
        this.searchIndex.initialize();
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS document_scan_job (
                id INTEGER PRIMARY KEY CHECK (id = 1), config TEXT NOT NULL,
                phase TEXT NOT NULL, content_total INTEGER, content_processed INTEGER, files_checked INTEGER, indexed_count INTEGER NOT NULL DEFAULT 0,
                skipped_count INTEGER NOT NULL DEFAULT 0, content_count INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS document_scan_queue (
                id INTEGER PRIMARY KEY, kind TEXT NOT NULL, path TEXT NOT NULL,
                size INTEGER, mtime INTEGER, indexed_in_job INTEGER NOT NULL DEFAULT 0, UNIQUE(kind, path)
            );
            CREATE TABLE IF NOT EXISTS document_scan_pending_content (
                path TEXT PRIMARY KEY, size INTEGER NOT NULL, mtime INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS document_scan_skips (path TEXT PRIMARY KEY);
            CREATE INDEX IF NOT EXISTS document_scan_queue_kind ON document_scan_queue(kind, id);
        `);
        const queueColumns = this.db.pragma('table_info(document_scan_queue)');
        if (!queueColumns.some(column => column.name === 'indexed_in_job')) {
            this.db.exec('ALTER TABLE document_scan_queue ADD COLUMN indexed_in_job INTEGER NOT NULL DEFAULT 0');
        }
        if (!queueColumns.some(column => column.name === 'lane')) {
            this.db.exec('ALTER TABLE document_scan_queue ADD COLUMN lane INTEGER NOT NULL DEFAULT 0');
        }
        this.db.exec('CREATE INDEX IF NOT EXISTS document_scan_queue_lane ON document_scan_queue(kind, lane, id)');
        const columns = this.db.pragma('table_info(document_scan_job)');
        for (const column of ['content_total', 'content_processed', 'files_checked']) {
            if (!columns.some(existing => existing.name === column)) {
                this.db.exec('ALTER TABLE document_scan_job ADD COLUMN ' + column + ' INTEGER');
            }
        }
    }
    /** Index a folder recursively. Text files are stored for FTS; other files remain searchable by name. */
    async indexFolder(folderPath, requestedLimit = exports.MAX_FILES_PER_FOLDER) {
        if (this.folderScanRunning || this.documentScan)
            throw new Error('[SCAN_BUSY] Indexing is already running');
        this.folderScanRunning = true;
        try {
            return await this.indexFolderContents(folderPath, requestedLimit);
        }
        finally {
            this.folderScanRunning = false;
        }
    }
    async indexDroppedFolders(paths, maxFiles) {
        if (this.folderScanRunning || this.documentScan)
            throw new Error('[SCAN_BUSY] Indexing is already running');
        if (!this.db)
            throw new Error('SQLite is not initialized');
        const result = { added: 0, duplicates: 0, invalid: 0, unavailable: 0, indexedCount: 0, skippedCount: 0 };
        const keyFor = (value) => process.platform === 'win32' ? node_path_1.default.resolve(value).toLowerCase() : node_path_1.default.resolve(value);
        const registered = this.db.prepare('SELECT path FROM indexed_folders').all();
        const known = new Set(registered.map(folder => keyFor(folder.path)));
        const exists = this.db.prepare('SELECT 1 FROM indexed_folders WHERE path = ?');
        this.folderScanRunning = true;
        try {
            for (const source of paths) {
                if (typeof source !== 'string' || !node_path_1.default.isAbsolute(source)) {
                    result.invalid++;
                    continue;
                }
                const folder = node_path_1.default.resolve(source);
                const key = keyFor(folder);
                try {
                    if (!(await node_fs_1.default.promises.lstat(folder)).isDirectory()) {
                        result.invalid++;
                        continue;
                    }
                    if (known.has(key)) {
                        result.duplicates++;
                        continue;
                    }
                    const indexed = await this.indexFolderContents(folder, maxFiles ?? exports.MAX_FILES_PER_FOLDER);
                    if (!exists.get(folder)) {
                        result.unavailable++;
                        continue;
                    }
                    known.add(key);
                    result.added++;
                    result.indexedCount += indexed.indexedCount;
                    result.skippedCount += indexed.skippedCount;
                }
                catch (error) {
                    console.error('Could not index dropped folder:', error);
                    result.unavailable++;
                }
            }
            return result;
        }
        finally {
            this.folderScanRunning = false;
        }
    }
    async indexFolderContents(folderPath, requestedLimit) {
        if (!this.db)
            throw new Error('SQLite is not initialized');
        const limit = Math.max(1, Math.min(5000, Math.floor(requestedLimit) || exports.MAX_FILES_PER_FOLDER));
        const includeSystemFiles = this.includeSystemFiles;
        const signal = new AbortController().signal;
        const visibility = (0, hiddenFiles_1.createAsyncFileVisibilityFilter)(signal);
        const textReader = (0, indexedText_1.createScanTextReader)(signal);
        const { widthFor } = (0, scanStorage_1.createStorageStrategy)((0, scanStorage_1.normalizeScanMode)(this.catalog.scanMode));
        const previous = this.db.prepare(`
            SELECT size, mtime, CASE WHEN text_indexed=1 THEN 1 ELSE content<>'' END AS text_ready FROM files WHERE path = ? AND is_deleted = 0
            AND NOT EXISTS (SELECT 1 FROM document_scan_pending_content WHERE path = files.path)
        `);
        let indexedCount = 0;
        let skippedCount = 0;
        const writes = [];
        let bytes = 0;
        const flush = async () => {
            this.saveFiles(writes);
            writes.length = 0;
            bytes = 0;
            await (0, scanStorage_1.yieldScan)();
        };
        const visit = async (directory) => {
            let entries;
            let width;
            try {
                const stat = await node_fs_1.default.promises.lstat(directory);
                if (!stat.isDirectory() || stat.isSymbolicLink() || (!includeSystemFiles && await visibility.isHidden(directory))) {
                    skippedCount++;
                    return false;
                }
                width = await widthFor(directory, stat.dev);
                entries = await node_fs_1.default.promises.readdir(directory, { withFileTypes: true });
            }
            catch (cause) {
                if (visibility.failure)
                    throw new Error('[SCAN_ACCESS] File protection check failed', { cause: visibility.failure });
                skippedCount++;
                return false;
            }
            entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
            for (let i = 0; i < entries.length;) {
                const entry = entries[i];
                if (entry.isDirectory()) {
                    const entryPath = node_path_1.default.join(directory, entry.name);
                    i++;
                    await visit(entryPath);
                    continue;
                }
                const batch = [];
                const batchSize = Math.min(width, Math.max(1, limit - indexedCount));
                do {
                    const candidate = entries[i++];
                    if (!candidate.isFile())
                        continue;
                    if (indexedCount + batch.length < limit)
                        batch.push(candidate);
                    else
                        skippedCount++;
                } while (i < entries.length && !entries[i].isDirectory() && batch.length < batchSize);
                const results = await Promise.all(batch.map(async (candidate) => {
                    const filePath = node_path_1.default.join(directory, candidate.name);
                    try {
                        if (!includeSystemFiles && await visibility.isHidden(filePath))
                            return null;
                        const stat = await node_fs_1.default.promises.lstat(filePath);
                        if (!stat.isFile() || stat.isSymbolicLink())
                            return null;
                        await verifyScanReadable(filePath);
                        const mtime = Math.floor(stat.mtimeMs);
                        const extension = node_path_1.default.extname(candidate.name).slice(1).toLowerCase();
                        let textIndexed = (0, indexedText_1.canIndexText)(extension, stat.size);
                        const existing = previous.get(filePath);
                        if (existing?.size === stat.size && existing.mtime === mtime && (!textIndexed || existing.text_ready))
                            return { unchanged: true };
                        let content = '';
                        if (textIndexed) {
                            try {
                                content = await textReader.read(filePath, extension);
                            }
                            catch (cause) {
                                if (!(0, indexedText_1.isRichDocument)(extension) || isAccessDenied(cause))
                                    throw cause;
                                textIndexed = false;
                            }
                            const after = await node_fs_1.default.promises.lstat(filePath);
                            if (!after.isFile() || after.ino !== stat.ino || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs)
                                return null;
                        }
                        return { path: filePath, name: candidate.name, extension, size: stat.size, mtime, content, textIndexed };
                    }
                    catch {
                        if (visibility.failure)
                            throw new Error('[SCAN_ACCESS] File protection check failed', { cause: visibility.failure });
                        return null;
                    }
                }));
                for (const result of results) {
                    if (!result) {
                        skippedCount++;
                        continue;
                    }
                    indexedCount++;
                    if ('unchanged' in result)
                        continue;
                    writes.push(result);
                    bytes += result.content.length;
                }
                if (writes.length >= 100 || bytes >= 4 * 1024 * 1024)
                    await flush();
            }
            return true;
        };
        const activePaths = [];
        try {
            if (!await visit(folderPath))
                return { folderPath, indexedCount, skippedCount, limit };
            if (writes.length)
                await flush();
            const records = this.db.prepare('SELECT id, path FROM files WHERE is_deleted = 0').all();
            for (const record of records) {
                const relative = node_path_1.default.relative(folderPath, record.path);
                if (!relative || relative === '..' || relative.startsWith('..' + node_path_1.default.sep) || node_path_1.default.isAbsolute(relative))
                    continue;
                try {
                    if (includeSystemFiles || !await visibility.isHidden(record.path))
                        activePaths.push(record);
                }
                catch (cause) {
                    if (visibility.failure || !isAccessDenied(cause))
                        throw cause;
                }
            }
        }
        finally {
            visibility.dispose();
            textReader.dispose();
        }
        activePaths.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
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
    listScanDrives() {
        if (process.platform === 'win32') {
            const drives = [];
            for (let code = 65; code <= 90; code++) {
                const drivePath = String.fromCharCode(code) + ':' + String.fromCharCode(92);
                try {
                    if (node_fs_1.default.statSync(drivePath).isDirectory())
                        drives.push({ path: drivePath, label: drivePath.slice(0, 2) });
                }
                catch { /* unavailable drive */ }
            }
            return drives;
        }
        if (process.platform === 'darwin') {
            const volumesPath = '/Volumes';
            try {
                return node_fs_1.default.readdirSync(volumesPath, { withFileTypes: true }).filter(entry => entry.isDirectory())
                    .map(entry => ({ path: node_path_1.default.join(volumesPath, entry.name), label: entry.name }));
            }
            catch { /* use the system root below */ }
        }
        const root = node_path_1.default.parse(process.env.HOME || node_path_1.default.sep).root || node_path_1.default.sep;
        return [{ path: root, label: root }];
    }
    documentScan = null;
    stopDocumentScan() {
        if (!this.documentScan)
            return false;
        this.documentScan.abort();
        return true;
    }
    /** Resolve and deduplicate selected subtrees without allowing a different disk. */
    async documentScanRoots(drivePath, folderPaths, drives = this.listScanDrives()) {
        const selectedDrive = drives.find(drive => {
            const current = node_path_1.default.resolve(drive.path), requested = node_path_1.default.resolve(String(drivePath || ''));
            return process.platform === 'win32' ? current.toLowerCase() === requested.toLowerCase() : current === requested;
        });
        if (!selectedDrive)
            throw new Error('[SCAN_DRIVE] Choose an available drive before scanning');
        if (folderPaths !== undefined && (!Array.isArray(folderPaths) || !folderPaths.length))
            throw new Error('[SCAN_SCOPE] Select at least one folder before scanning');
        const root = await node_fs_1.default.promises.realpath(selectedDrive.path).catch(() => {
            throw new Error('[SCAN_DRIVE] Choose an available drive before scanning');
        });
        const roots = [];
        for (const folder of folderPaths ?? [root]) {
            if (typeof folder !== 'string' || !node_path_1.default.isAbsolute(folder))
                throw new Error('[SCAN_SCOPE] Invalid scan folder');
            let resolved;
            try {
                resolved = await node_fs_1.default.promises.realpath(folder);
                if (!(await node_fs_1.default.promises.stat(resolved)).isDirectory())
                    throw new Error('[SCAN_SCOPE] Scan target must be a folder');
            }
            catch (error) {
                if (!isAccessDenied(error)) {
                    const code = error?.code;
                    if (code === 'ENOENT' || code === 'ENOTDIR')
                        throw new Error('[SCAN_SCOPE] Scan folder unavailable', { cause: error });
                    throw error;
                }
                // The scanner will record the inaccessible target without traversing it.
                resolved = node_path_1.default.resolve(folder);
            }
            const relative = node_path_1.default.relative(root, resolved);
            if (relative === '..' || relative.startsWith('..' + node_path_1.default.sep) || node_path_1.default.isAbsolute(relative))
                throw new Error('[SCAN_SCOPE] Choose folders on the selected drive');
            if (!roots.some(existing => node_path_1.default.relative(existing, resolved) === ''))
                roots.push(resolved);
        }
        return roots.filter(folder => !roots.some(parent => {
            if (parent === folder)
                return false;
            const relative = node_path_1.default.relative(parent, folder);
            return relative !== '..' && !relative.startsWith('..' + node_path_1.default.sep) && !node_path_1.default.isAbsolute(relative);
        }));
    }
    documentScanStatus() {
        const row = this.db?.prepare('SELECT * FROM document_scan_job WHERE id = 1').get();
        const config = row ? JSON.parse(row.config) : { drivePath: '', extensions: [] };
        const scanTotal = row?.phase === 'content' && row.files_checked !== null
            ? Math.max(row.files_checked, row.content_total ?? 0)
            : null;
        const remaining = Math.max(0, (row?.content_total ?? 0) - (row?.content_processed ?? 0));
        return {
            ...config, running: Boolean(this.documentScan), resumable: Boolean(row), phase: row?.phase ?? null,
            indexedCount: row?.indexed_count ?? 0, skippedCount: row?.skipped_count ?? 0, contentCount: row?.content_count ?? 0,
            contentTotal: row?.content_total ?? null, contentProcessed: row?.content_processed ?? 0,
            scanTotal, scanProcessed: scanTotal === null ? 0 : scanTotal - remaining,
        };
    }
    /** Discover files and drain content in bounded batches, committing each batch with its checkpoint. */
    async scanOsDocuments(drivePath, requestedExtensions, folderPaths, resume = false, mode, additionalDrivePaths = []) {
        if (!this.db)
            throw new Error('SQLite is not initialized');
        if (this.documentScan || this.folderScanRunning)
            throw new Error('[SCAN_BUSY] Indexing is already running');
        const controller = new AbortController();
        this.documentScan = controller;
        const { signal } = controller;
        const textReader = (0, indexedText_1.createScanTextReader)(signal);
        let visibility;
        try {
            const saved = resume ? this.documentScanStatus() : null;
            if (resume && !saved?.resumable)
                throw new Error('[SCAN_RESUME] No scan to resume');
            if (saved) {
                ({ drivePath, extensions: requestedExtensions, folderPaths } = saved);
                additionalDrivePaths = saved.additionalDrivePaths ?? [];
            }
            mode = (0, scanStorage_1.normalizeScanMode)((saved ? saved.mode : mode) ?? this.catalog.scanMode);
            const { profileFor, widthFor } = (0, scanStorage_1.createStorageStrategy)(mode);
            const extensions = new Set((Array.isArray(requestedExtensions) ? requestedExtensions : [])
                .map(extension => String(extension).trim().replace(/^\./, '').toLowerCase())
                .filter(extension => fileTypeGroups_1.searchableFileExtensions.has(extension)));
            if (!extensions.size)
                throw new Error('[SCAN_EXTENSIONS] Select at least one document extension before scanning');
            if (!Array.isArray(additionalDrivePaths) || additionalDrivePaths.length > 25 ||
                additionalDrivePaths.some(drive => typeof drive !== 'string' || !node_path_1.default.isAbsolute(drive))) {
                throw new Error('[SCAN_DRIVE] Choose available drives before scanning');
            }
            if (additionalDrivePaths.length && folderPaths)
                throw new Error('[SCAN_SCOPE] Multi-drive scans require whole drives');
            const drives = this.listScanDrives();
            const roots = [...new Set((await Promise.all([
                    this.documentScanRoots(drivePath, folderPaths, drives),
                    ...additionalDrivePaths.map(drive => this.documentScanRoots(drive, undefined, drives)),
                ])).flat())];
            // Nested mounts are already visited from their ancestor. Avoid a second traversal.
            const scanRoots = roots.filter(root => !roots.some(parent => {
                if (parent === root)
                    return false;
                const relative = node_path_1.default.relative(parent, root);
                return relative === '' ? roots.indexOf(parent) < roots.indexOf(root) :
                    relative !== '..' && !relative.startsWith('..' + node_path_1.default.sep) && !node_path_1.default.isAbsolute(relative);
            }));
            const stored = resume ? this.db.prepare('SELECT config FROM document_scan_job WHERE id=1').get() : null;
            const includeSystemFiles = stored ? JSON.parse(stored.config).includeSystemFiles : this.includeSystemFiles;
            if (!resume) {
                const config = JSON.stringify({
                    drivePath, mode, extensions: [...extensions], ...(folderPaths ? { folderPaths: scanRoots } : {}),
                    ...(additionalDrivePaths.length ? { additionalDrivePaths } : {}), includeSystemFiles,
                });
                const laneKeys = new Map();
                const assignments = [];
                for (const root of scanRoots) {
                    if (!additionalDrivePaths.length) {
                        assignments.push('single');
                        continue;
                    }
                    const stat = await node_fs_1.default.promises.stat(root).catch(() => null);
                    const profile = stat && await profileFor(root, stat.dev, true);
                    // Volumes on one physical disk share a lane. Unidentified HDDs do too.
                    const volume = process.platform === 'win32' ? node_path_1.default.parse(root).root.toLowerCase() : String(stat?.dev);
                    assignments.push(profile?.disk ? 'disk:' + profile.disk :
                        profile?.width === 8 ? 'volume:' + volume : 'serial');
                }
                this.db.transaction(() => {
                    this.db.exec('DELETE FROM document_scan_queue; DELETE FROM document_scan_job; DELETE FROM document_scan_skips;');
                    this.db.prepare("INSERT INTO document_scan_job(id,config,phase,files_checked) VALUES(1,?,'metadata',0)").run(config);
                    const enqueue = this.db.prepare("INSERT OR IGNORE INTO document_scan_queue(kind,path,lane) VALUES('directory',?,?)");
                    for (const [index, root] of scanRoots.entries()) {
                        const key = assignments[index];
                        if (!laneKeys.has(key))
                            laneKeys.set(key, laneKeys.size);
                        enqueue.run(root, laneKeys.get(key));
                    }
                })();
            }
            const scanVisibility = (0, hiddenFiles_1.createAsyncFileVisibilityFilter)(signal);
            visibility = scanVisibility;
            const insideRoots = (target) => roots.some(root => {
                const relative = node_path_1.default.relative(root, target);
                return relative !== '..' && !relative.startsWith('..' + node_path_1.default.sep) && !node_path_1.default.isAbsolute(relative);
            });
            const lanes = this.db.prepare('SELECT DISTINCT lane FROM document_scan_queue ORDER BY lane').all()
                .map(row => row.lane);
            // Keep the total I/O budget at eight reads even with two active disks.
            const maxReadsPerLane = lanes.length > 1 ? 4 : 8;
            const laneWidth = async (folder, device) => Math.min(await widthFor(folder, device), maxReadsPerLane);
            const runLanes = async (run) => {
                let nextLane = 0;
                const workers = Array.from({ length: Math.min(2, lanes.length) }, async () => {
                    try {
                        while (!signal.aborted && nextLane < lanes.length)
                            await run(lanes[nextLane++]);
                    }
                    catch (cause) {
                        controller.abort();
                        throw cause;
                    }
                });
                const results = await Promise.allSettled(workers);
                for (const result of results)
                    if (result.status === 'rejected')
                        throw result.reason;
            };
            const nextDirectory = this.db.prepare("SELECT id,path FROM document_scan_queue WHERE kind='directory' AND lane=? ORDER BY id LIMIT 1");
            const enqueue = this.db.prepare('INSERT INTO document_scan_queue(kind,path,size,mtime,indexed_in_job,lane) VALUES(@kind,@path,@size,@mtime,@indexed,@lane) ON CONFLICT(kind,path) DO UPDATE SET size=excluded.size,mtime=excluded.mtime,indexed_in_job=MAX(indexed_in_job,excluded.indexed_in_job)');
            const dequeue = this.db.prepare('DELETE FROM document_scan_queue WHERE id=?');
            const previousFile = this.db.prepare("SELECT f.size,f.mtime,CASE WHEN f.text_indexed=1 THEN 1 ELSE f.content<>'' END AS text_ready,p.path AS needs_content FROM files f LEFT JOIN document_scan_pending_content p ON p.path=f.path WHERE f.path=? AND f.is_deleted=0");
            const markPending = this.db.prepare('INSERT INTO document_scan_pending_content(path,size,mtime) VALUES(@path,@size,@mtime) ON CONFLICT(path) DO UPDATE SET size=excluded.size,mtime=excluded.mtime');
            const recordSkip = this.db.prepare('INSERT OR IGNORE INTO document_scan_skips(path) VALUES(?)');
            const commitSkips = (skipped) => {
                let count = 0;
                for (const skippedPath of skipped) {
                    const key = process.platform === 'win32' ? skippedPath.toLowerCase() : skippedPath;
                    count += recordSkip.run(key).changes;
                }
                return count;
            };
            const clearPending = this.db.prepare('DELETE FROM document_scan_pending_content WHERE path=? AND size=? AND mtime=?');
            const updateContent = this.db.prepare('UPDATE files SET content=?,text_indexed=1 WHERE path=? AND size=? AND mtime=? AND is_deleted=0');
            const hideProtectedFile = this.db.prepare('UPDATE files SET is_deleted=1 WHERE path=? AND size=? AND mtime=? AND is_deleted=0');
            const nextContents = this.db.prepare("SELECT id,path,size,mtime,indexed_in_job FROM document_scan_queue WHERE kind='content' AND lane=? ORDER BY id LIMIT ?");
            const processContentBatch = async (lane, limit) => {
                if (signal.aborted)
                    return false;
                const items = nextContents.all(lane, limit);
                if (!items.length)
                    return false;
                const finished = [];
                let contentBytes = 0;
                let currentDirectory = '';
                let width = 1;
                for (let i = 0; i < items.length && !signal.aborted && contentBytes < 4 * 1024 * 1024;) {
                    const directory = node_path_1.default.dirname(items[i].path);
                    if (directory !== currentDirectory) {
                        currentDirectory = directory;
                        const stat = await node_fs_1.default.promises.stat(directory).catch(() => null);
                        width = stat ? await laneWidth(directory, stat.dev) : 1;
                    }
                    const group = [];
                    let groupBytes = 0;
                    while (i < items.length && group.length < width && node_path_1.default.dirname(items[i].path) === directory) {
                        const item = items[i];
                        if (group.length && groupBytes + item.size > 4 * 1024 * 1024)
                            break;
                        group.push(item);
                        groupBytes += item.size;
                        i++;
                    }
                    const results = await Promise.all(group.map(async (item) => {
                        if (signal.aborted)
                            return item;
                        try {
                            const stat = await node_fs_1.default.promises.lstat(item.path);
                            const canonical = await node_fs_1.default.promises.realpath(item.path);
                            if (!stat.isFile() || stat.isSymbolicLink() || !insideRoots(canonical) || stat.size !== item.size || Math.floor(stat.mtimeMs) !== item.mtime)
                                return item;
                            if (!includeSystemFiles && await scanVisibility.isHidden(item.path))
                                return { ...item, protected: true };
                            const content = await textReader.read(item.path, node_path_1.default.extname(item.path).slice(1).toLowerCase(), node_fs_1.default.promises.readFile);
                            const after = await node_fs_1.default.promises.stat(item.path);
                            if (after.size !== item.size || Math.floor(after.mtimeMs) !== item.mtime)
                                return item;
                            return { ...item, content };
                        }
                        catch (cause) {
                            return isAccessDenied(cause) ? { ...item, protected: true } : item;
                        }
                    }));
                    if (signal.aborted)
                        break;
                    if (scanVisibility.failure)
                        throw new Error('[SCAN_ACCESS] File protection check failed', { cause: scanVisibility.failure });
                    for (const item of results) {
                        finished.push(item);
                        if ('content' in item)
                            contentBytes += item.content.length;
                    }
                }
                const commitContent = this.db.transaction((batch) => {
                    const skipped = new Set();
                    let count = 0;
                    let removed = 0;
                    for (const item of batch) {
                        if (item.content !== undefined) {
                            updateContent.run(item.content, item.path, item.size, item.mtime);
                            clearPending.run(item.path, item.size, item.mtime);
                            count++;
                        }
                        else if (item.protected) {
                            const hidden = hideProtectedFile.run(item.path, item.size, item.mtime).changes;
                            removed += hidden * item.indexed_in_job;
                            clearPending.run(item.path, item.size, item.mtime);
                        }
                        if (item.content === undefined)
                            skipped.add(item.path);
                        dequeue.run(item.id);
                    }
                    this.db.prepare('UPDATE document_scan_job SET content_count=content_count+?, skipped_count=skipped_count+?, content_processed=COALESCE(content_processed,content_count)+?, indexed_count=indexed_count-? WHERE id=1').run(count, commitSkips(skipped), batch.length, removed);
                });
                // SQLite/FTS writes are synchronous. Give the main loop a turn between small transactions.
                for (let start = 0; start < finished.length && !signal.aborted;) {
                    let end = start;
                    let bytes = 0;
                    do {
                        bytes += finished[end++].content?.length ?? 0;
                    } while (end < finished.length && end - start < 32 && bytes < 512 * 1024);
                    commitContent(finished.slice(start, end));
                    start = end;
                    await (0, scanStorage_1.yieldScan)();
                }
                return finished.length > 0;
            };
            const checkpoint = this.db.prepare('SELECT files_checked FROM document_scan_job WHERE id=1').get();
            await runLanes(async (lane) => {
                const skipped = new Set();
                let completedFiles = lanes.length === 1 ? checkpoint.files_checked ?? saved?.indexedCount ?? 0 : 0;
                let lastEarlyBatch = EARLY_CONTENT_THRESHOLD - EARLY_CONTENT_INTERVAL;
                const shouldIndexEarly = (checked) => checked >= EARLY_CONTENT_THRESHOLD && checked - lastEarlyBatch >= EARLY_CONTENT_INTERVAL;
                const indexEarly = async (checked, width) => {
                    lastEarlyBatch = checked;
                    // Alternate discovery and content batches. HDDs retain one reader and never seek between concurrent reads.
                    await processContentBatch(lane, width === 1 ? 32 : 100);
                };
                let metadata = [];
                let queued = [];
                const flushMetadata = (completedDirectory) => {
                    if (!metadata.length && !queued.length && !skipped.size && completedDirectory === undefined)
                        return;
                    this.db.transaction(() => {
                        if (metadata.length)
                            this.saveFiles(metadata);
                        for (const item of queued) {
                            enqueue.run({ ...item, lane });
                            if (item.kind === 'content')
                                markPending.run({ path: item.path, size: item.size, mtime: item.mtime });
                        }
                        if (completedDirectory)
                            dequeue.run(completedDirectory.id);
                        this.db.prepare('UPDATE document_scan_job SET indexed_count=indexed_count+?, skipped_count=skipped_count+?, files_checked=files_checked+? WHERE id=1').run(metadata.length, commitSkips(skipped), completedDirectory?.filesChecked ?? 0);
                    })();
                    metadata = [];
                    queued = [];
                    skipped.clear();
                };
                while (!signal.aborted) {
                    const directory = nextDirectory.get(lane);
                    if (!directory)
                        break;
                    let completed = false;
                    let filesChecked = 0;
                    try {
                        const stat = await node_fs_1.default.promises.lstat(directory.path);
                        const canonical = await node_fs_1.default.promises.realpath(directory.path);
                        if (!stat.isDirectory() || stat.isSymbolicLink() || !insideRoots(canonical) || (!includeSystemFiles && await scanVisibility.isHidden(directory.path))) {
                            skipped.add(directory.path);
                            completed = true;
                        }
                        else {
                            const handle = await node_fs_1.default.promises.opendir(directory.path);
                            completed = true;
                            const width = await laneWidth(canonical, stat.dev);
                            let candidates = [];
                            const inspectFiles = async () => {
                                const results = await Promise.all(candidates.map(async (candidate) => {
                                    try {
                                        if (!includeSystemFiles && await scanVisibility.isHidden(candidate.entryPath))
                                            return null;
                                        const stat = await node_fs_1.default.promises.lstat(candidate.entryPath);
                                        if (!stat.isFile() || stat.isSymbolicLink())
                                            return null;
                                        await verifyScanReadable(candidate.entryPath);
                                        return { ...candidate, stat };
                                    }
                                    catch {
                                        return null;
                                    }
                                }));
                                const batch = candidates;
                                candidates = [];
                                if (signal.aborted)
                                    return;
                                if (scanVisibility.failure)
                                    throw new Error('[SCAN_ACCESS] File protection check failed', { cause: scanVisibility.failure });
                                for (const [i, result] of results.entries()) {
                                    if (!result) {
                                        skipped.add(batch[i].entryPath);
                                        continue;
                                    }
                                    filesChecked++;
                                    const { entryPath, name, extension, stat } = result;
                                    const mtime = Math.floor(stat.mtimeMs);
                                    const existing = previousFile.get(entryPath);
                                    const changed = !existing || existing.size !== stat.size || existing.mtime !== mtime;
                                    if (changed)
                                        metadata.push({ path: entryPath, name, extension, size: stat.size, mtime, content: '' });
                                    if ((changed || existing?.needs_content || !existing?.text_ready) && (0, indexedText_1.canIndexText)(extension, stat.size)) {
                                        queued.push({ kind: 'content', path: entryPath, size: stat.size, mtime, indexed: Number(changed) });
                                    }
                                }
                            };
                            for await (const entry of handle) {
                                if (signal.aborted)
                                    break;
                                const entryPath = node_path_1.default.join(directory.path, entry.name);
                                if (entry.isSymbolicLink())
                                    continue;
                                if (entry.isDirectory()) {
                                    const name = entry.name.toLowerCase();
                                    const systemRoot = process.platform !== 'win32' && directory.path === node_path_1.default.parse(directory.path).root;
                                    if (OS_SCAN_IGNORED_DIRECTORIES.has(name) || (systemRoot && OS_SCAN_IGNORED_UNIX_ROOTS.has(name)))
                                        skipped.add(entryPath);
                                    else
                                        queued.push({ kind: 'directory', path: entryPath, size: null, mtime: null, indexed: 0 });
                                }
                                else if (entry.isFile()) {
                                    const extension = node_path_1.default.extname(entry.name).slice(1).toLowerCase();
                                    if (!extensions.has(extension))
                                        continue;
                                    candidates.push({ entryPath, name: entry.name, extension });
                                    if (candidates.length >= Math.min(width, 100 - metadata.length, 100 - queued.length))
                                        await inspectFiles();
                                }
                                const checked = completedFiles + filesChecked;
                                const early = shouldIndexEarly(checked);
                                if (metadata.length >= 100 || queued.length >= 100 || skipped.size >= 100 || early) {
                                    flushMetadata();
                                    if (early)
                                        await indexEarly(checked, width);
                                    else
                                        await (0, scanStorage_1.yieldScan)();
                                }
                            }
                            if (!signal.aborted && candidates.length)
                                await inspectFiles();
                            if (signal.aborted)
                                completed = false;
                        }
                    }
                    catch (cause) {
                        if (!signal.aborted && scanVisibility.failure)
                            throw new Error('[SCAN_ACCESS] File protection check failed', { cause: scanVisibility.failure });
                        if (!signal.aborted) {
                            const code = cause?.code;
                            if (!code || !/^E[A-Z]+$/.test(code))
                                throw cause;
                            skipped.add(directory.path);
                            completed = true;
                        }
                    }
                    // An interrupted directory is checked again on resume. Count it only when dequeued.
                    flushMetadata(completed ? { id: directory.id, filesChecked } : undefined);
                    if (completed) {
                        completedFiles += filesChecked;
                        if (!signal.aborted && shouldIndexEarly(completedFiles)) {
                            // Use the smaller batch at a directory boundary, where the next volume is unknown.
                            await indexEarly(completedFiles, 1);
                        }
                    }
                }
            });
            if (!signal.aborted)
                this.db.prepare(`
                UPDATE document_scan_job SET phase='content',
                    content_total=COALESCE(content_total, COALESCE(content_processed, content_count) + (SELECT COUNT(*) FROM document_scan_queue WHERE kind='content')),
                    content_processed=COALESCE(content_processed, content_count)
                WHERE id=1
            `).run();
            await runLanes(async (lane) => {
                while (await processContentBatch(lane, 100)) { /* Drain the remaining queue. */ }
            });
            const result = this.documentScanStatus();
            if (!signal.aborted)
                this.db.transaction(() => {
                    this.db.exec('DELETE FROM document_scan_queue; DELETE FROM document_scan_job; DELETE FROM document_scan_skips;');
                })();
            return { indexedCount: result.indexedCount, skippedCount: result.skippedCount, cancelled: signal.aborted };
        }
        finally {
            visibility?.dispose();
            textReader.dispose();
            if (this.documentScan === controller)
                this.documentScan = null;
        }
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
        if ((0, indexedText_1.canIndexText)(extension, stat.size) && !(0, indexedText_1.isRichDocument)(extension)) {
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
    async indexImportedFile(filePath, folderPath) {
        const result = this.indexSingleFile(filePath, folderPath);
        const extension = node_path_1.default.extname(filePath).slice(1).toLowerCase();
        if (!(0, indexedText_1.isRichDocument)(extension) || !this.db)
            return result;
        const db = this.db;
        const row = db.prepare('SELECT size, mtime FROM files WHERE path=?').get(filePath);
        if (!row || !(0, indexedText_1.canIndexText)(extension, row.size))
            return result;
        try {
            const content = await (0, indexedText_1.readIndexedText)(filePath, extension);
            const stat = await node_fs_1.default.promises.stat(filePath);
            if (stat.size === row.size && Math.floor(stat.mtimeMs) === row.mtime && db.open) {
                db.prepare('UPDATE files SET content=?, text_indexed=1 WHERE path=? AND size=? AND mtime=? AND is_deleted=0')
                    .run(content, filePath, row.size, row.mtime);
            }
        }
        catch (cause) {
            console.warn('Could not extract text from imported document:', cause instanceof Error ? cause.name : 'Unknown error');
        }
        return result;
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
    createWorkspaceFolder(parentPath, requestedName) {
        if (!this.db || !node_path_1.default.isAbsolute(parentPath))
            throw new Error('Choose a parent folder');
        const name = String(requestedName || '').trim();
        if (!name || name.length > 120 || /[\\/:*?"<>|\x00-\x1f]/.test(name) || name.startsWith('.') || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
            throw new Error('Invalid workspace name');
        const parent = node_fs_1.default.realpathSync(parentPath);
        if (!node_fs_1.default.statSync(parent).isDirectory())
            throw new Error('Parent folder not found');
        const target = node_path_1.default.join(parent, name);
        node_fs_1.default.mkdirSync(target);
        try {
            this.db.prepare('INSERT INTO indexed_folders(path,name,indexed_count) VALUES(?,?,0)').run(target, name);
        }
        catch (error) {
            node_fs_1.default.rmdirSync(target);
            throw error;
        }
        return { name, path: target, count: 0 };
    }
    workspaceTarget(folderPath) {
        if (!this.db || !node_path_1.default.isAbsolute(folderPath))
            throw new Error('Workspace not found');
        const folder = this.db.prepare('SELECT path FROM indexed_folders WHERE path=?').get(folderPath);
        if (!folder || !this.isFileVisible(folder.path))
            throw new Error('Workspace not found');
        const target = node_fs_1.default.realpathSync(folder.path);
        if (!node_fs_1.default.statSync(target).isDirectory())
            throw new Error('Workspace folder is unavailable');
        return node_path_1.default.resolve(folder.path);
    }
    async importFileToWorkspace(source, folderPath, maxFiles = 1000) {
        const target = this.workspaceTarget(folderPath);
        if (!this.isFileVisible(source))
            throw new Error('Hidden and system files are excluded');
        if (node_path_1.default.relative(node_path_1.default.dirname(node_fs_1.default.realpathSync(source)), node_fs_1.default.realpathSync(target)) === '') {
            await this.indexImportedFile(source, folderPath);
            return source;
        }
        const limit = Math.max(1, Math.min(5000, Math.floor(maxFiles) || 1000));
        if ((this.listFolders().find(folder => folder.path === folderPath)?.count ?? 0) >= limit)
            throw new Error('Folder limit reached');
        const placed = await (0, workspaceFiles_1.placeWorkspaceFile)(source, target, false, candidate => Boolean(this.db.prepare('SELECT 1 FROM files WHERE path=?').get(candidate)));
        try {
            await this.indexImportedFile(placed.destination, folderPath);
        }
        catch (error) {
            await node_fs_1.default.promises.unlink(placed.destination).catch(() => { });
            throw error;
        }
        return placed.destination;
    }
    workspaceTransferBusy = false;
    async transferWorkspaceFiles(request) {
        if (this.workspaceTransferBusy)
            throw new Error('A file operation is already running');
        this.workspaceTransferBusy = true;
        try {
            return await this.performWorkspaceTransfer(request);
        }
        finally {
            this.workspaceTransferBusy = false;
        }
    }
    async performWorkspaceTransfer(request) {
        if (!this.db || !['copy', 'move'].includes(request.mode) || !Array.isArray(request.fileIds) || !request.fileIds.length || request.fileIds.length > 5000 || request.fileIds.some(id => !Number.isInteger(id)))
            throw new Error('Invalid file transfer');
        const target = this.workspaceTarget(request.targetFolderPath);
        const result = { completed: [], failed: [] };
        const limit = Math.max(1, Math.min(5000, Math.floor(request.maxFiles ?? 1000) || 1000));
        let count = this.listFolders().find(folder => folder.path === request.targetFolderPath)?.count ?? 0;
        for (const fileId of new Set(request.fileIds)) {
            let placed;
            let sourceRemoved = false;
            let source = '';
            try {
                const record = this.db.prepare('SELECT id,path,size,mtime,extension,content FROM files WHERE id=? AND is_deleted=0').get(fileId);
                if (!record || !this.isFileVisible(record.path))
                    throw new Error('Indexed file is unavailable');
                source = record.path;
                if (request.mode === 'move' && node_path_1.default.relative(node_path_1.default.dirname(node_fs_1.default.realpathSync(source)), node_fs_1.default.realpathSync(target)) === '') {
                    result.completed.push({ sourceId: fileId, id: fileId, oldPath: source, path: source, name: node_path_1.default.basename(source) });
                    continue;
                }
                const relative = node_path_1.default.relative(target, source);
                const alreadyInside = relative !== '..' && !relative.startsWith('..' + node_path_1.default.sep) && !node_path_1.default.isAbsolute(relative);
                if (count >= limit && (request.mode === 'copy' || !alreadyInside))
                    throw new Error('Folder limit reached');
                placed = await (0, workspaceFiles_1.placeWorkspaceFile)(source, target, request.mode === 'move', candidate => Boolean(this.db.prepare('SELECT 1 FROM files WHERE path=?').get(candidate)));
                const unchanged = record.size === placed.original.size && Math.floor(record.mtime) === Math.floor(placed.original.mtimeMs);
                let content = unchanged ? record.content : '';
                if ((0, indexedText_1.canIndexText)(record.extension, placed.stat.size) && !(0, indexedText_1.isRichDocument)(record.extension) && (!content || record.size !== placed.original.size || Math.floor(record.mtime) !== Math.floor(placed.original.mtimeMs))) {
                    content = await node_fs_1.default.promises.readFile(placed.destination, 'utf8');
                }
                const destination = placed.destination, snapshot = placed;
                let newId = fileId;
                this.db.transaction(() => {
                    if (!(0, workspaceFiles_1.sameFileVersion)(snapshot.original, node_fs_1.default.lstatSync(source)))
                        throw new Error('The source file changed during transfer');
                    if (request.mode === 'move') {
                        this.db.prepare('UPDATE files SET path=?,name=?,size=?,mtime=?,content=? WHERE id=?').run(destination, node_path_1.default.basename(destination), snapshot.stat.size, Math.floor(snapshot.stat.mtimeMs), content, fileId);
                        this.db.prepare("DELETE FROM document_scan_queue WHERE kind='content' AND path=?").run(source);
                        this.db.prepare('DELETE FROM document_scan_pending_content WHERE path=?').run(source);
                        node_fs_1.default.unlinkSync(source);
                        sourceRemoved = true;
                    }
                    else {
                        const insert = this.db.prepare('INSERT INTO files(path,name,extension,size,mtime,content) VALUES(?,?,?,?,?,?)').run(destination, node_path_1.default.basename(destination), record.extension, snapshot.stat.size, Math.floor(snapshot.stat.mtimeMs), content);
                        newId = Number(insert.lastInsertRowid);
                        this.db.prepare('INSERT INTO file_tags(file_id,tag) SELECT ?,tag FROM file_tags WHERE file_id=?').run(newId, fileId);
                        this.db.prepare('INSERT INTO file_notes(file_id,note,updated_at) SELECT ?,note,updated_at FROM file_notes WHERE file_id=?').run(newId, fileId);
                    }
                })();
                if (request.mode === 'copy' || !alreadyInside)
                    count++;
                result.completed.push({ sourceId: fileId, id: newId, oldPath: source, path: destination, name: node_path_1.default.basename(destination) });
            }
            catch (error) {
                if (placed) {
                    let restored = !sourceRemoved;
                    if (sourceRemoved) {
                        try {
                            await node_fs_1.default.promises.copyFile(placed.destination, source, node_fs_1.default.constants.COPYFILE_EXCL);
                            await node_fs_1.default.promises.utimes(source, placed.original.atime, placed.original.mtime);
                            restored = true;
                        }
                        catch { /* Keep the destination if restoring the source is impossible. */ }
                    }
                    if (restored)
                        await node_fs_1.default.promises.unlink(placed.destination).catch(() => { });
                }
                result.failed.push({ fileId, message: error instanceof Error ? error.message : String(error) });
            }
            await (0, scanStorage_1.yieldScan)();
        }
        return result;
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
        const visibleFolders = folders.filter(folder => this.isFileVisible(folder.path));
        if (!visibleFolders.length)
            return [];
        const keyFor = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
        const keys = visibleFolders.map(folder => keyFor(node_path_1.default.resolve(folder.path)));
        const counts = new Map(keys.map(key => [key, 0]));
        const activePaths = this.db.prepare('SELECT path FROM files WHERE is_deleted = 0 AND owlsift_file_visible(path) = 1')
            .iterate();
        for (const { path: filePath } of activePaths) {
            let current = node_path_1.default.resolve(filePath);
            for (let parent = node_path_1.default.dirname(current); parent !== current; parent = node_path_1.default.dirname(current)) {
                const key = keyFor(parent);
                const count = counts.get(key);
                if (count !== undefined)
                    counts.set(key, count + 1);
                current = parent;
            }
        }
        return visibleFolders.map((folder, index) => ({ ...folder, count: counts.get(keys[index]) ?? 0 }));
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
    renameIndexedFile(fileId, requestedName) {
        if (!this.db || !Number.isInteger(fileId))
            throw new Error('Invalid file id');
        const name = requestedName.trim();
        if (!name || name.length > 180 || name === '.' || name === '..' || /[\\/:*?"<>|\x00-\x1f]/.test(name))
            throw new Error('Invalid file name');
        const file = this.db.prepare('SELECT path, name, extension FROM files WHERE id = ? AND is_deleted = 0').get(fileId);
        if (!file)
            throw new Error('Indexed file not found');
        const oldExtension = node_path_1.default.extname(file.name);
        const hasExtension = node_path_1.default.extname(name) !== '';
        const nextName = hasExtension ? name : name + oldExtension;
        if (node_path_1.default.extname(nextName).toLowerCase() !== oldExtension.toLowerCase())
            throw new Error('Changing the file extension is not supported');
        const nextPath = node_path_1.default.join(node_path_1.default.dirname(file.path), nextName);
        if (nextPath === file.path)
            return { path: file.path, name: file.name, extension: file.extension, size: node_fs_1.default.statSync(file.path).size, mtime: node_fs_1.default.statSync(file.path).mtimeMs };
        if (node_fs_1.default.existsSync(nextPath))
            throw new Error('A file with that name already exists');
        const stats = node_fs_1.default.statSync(file.path);
        if (!stats.isFile())
            throw new Error('Selected path is not a file');
        node_fs_1.default.renameSync(file.path, nextPath);
        try {
            const nextStats = node_fs_1.default.statSync(nextPath);
            this.db.prepare('UPDATE files SET path = ?, name = ?, size = ?, mtime = ? WHERE id = ?').run(nextPath, nextName, nextStats.size, nextStats.mtimeMs, fileId);
            return { path: nextPath, name: nextName, extension: file.extension, size: nextStats.size, mtime: nextStats.mtimeMs };
        }
        catch (error) {
            try {
                node_fs_1.default.renameSync(nextPath, file.path);
            }
            catch { /* Keep the indexed path aligned whenever the filesystem allows rollback. */ }
            throw error;
        }
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
    attachTags(records, limitLookup = false) {
        if (!this.db || records.length === 0)
            return records;
        const ids = limitLookup && records.length <= 500 ? JSON.stringify(records.map(record => record.id)) : undefined;
        const where = ids === undefined ? '' : ' WHERE file_id IN (SELECT value FROM json_each(?))';
        const parameters = ids === undefined ? [] : [ids];
        const tagsById = new Map();
        const rows = this.db.prepare('SELECT file_id, tag FROM file_tags' + where + ' ORDER BY tag COLLATE NOCASE')
            .all(...parameters);
        for (const { file_id, tag } of rows) {
            const tags = tagsById.get(file_id) ?? [];
            tags.push(tag);
            tagsById.set(file_id, tags);
        }
        const notes = new Map(this.db.prepare('SELECT file_id, note FROM file_notes' + where).all(...parameters)
            .map(({ file_id, note }) => [file_id, note]));
        return records.map((record) => ({
            ...record,
            tags: tagsById.get(record.id) ?? [],
            note: notes.get(record.id) ?? '',
        }));
    }
    async getImagePreview(fileId) {
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
            const stat = await node_fs_1.default.promises.stat(file.path);
            if (!stat.isFile() || stat.size === 0 || stat.size > 10 * 1024 * 1024)
                return null;
            return `data:${mimeType};base64,${(await node_fs_1.default.promises.readFile(file.path)).toString('base64')}`;
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
        if (!columns.some(column => column.name === 'text_indexed')) {
            this.db.exec('ALTER TABLE files ADD COLUMN text_indexed INTEGER NOT NULL DEFAULT 0');
        }
        if (!columns.some((column) => column.name === 'is_deleted')) {
            this.db.exec('ALTER TABLE files ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0');
        }
        // Rebuild the external-content FTS index only when it is first created.
        // Rebuilding it at every launch synchronously blocked Electron on large indexes.
        const hasFtsIndex = Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'files_fts'").get());
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
        if (!hasFtsIndex)
            this.db.exec("INSERT INTO files_fts(files_fts) VALUES('rebuild')");
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
      CREATE TRIGGER files_au AFTER UPDATE OF name,content ON files WHEN old.name <> new.name OR old.content <> new.content BEGIN
        INSERT INTO files_fts(files_fts, rowid, name, content) VALUES('delete', old.id, old.name, old.content);
        INSERT INTO files_fts(rowid, name, content) VALUES (new.id, new.name, new.content);
      END;
    `);
    }
    /**
     * Индексация или обновление файла в базе
     */
    fileUpsert = null;
    saveFile(file) { this.saveFiles([file]); }
    saveFiles(files) {
        if (!this.db || !files.length)
            return;
        this.fileUpsert ??= this.db.prepare(`
            INSERT INTO files (path,name,extension,size,mtime,content,text_indexed)
            VALUES (@path,@name,@extension,@size,@mtime,@content,@textIndexed)
            ON CONFLICT(path) DO UPDATE SET name=excluded.name, extension=excluded.extension,
                size=excluded.size, mtime=excluded.mtime, content=excluded.content, text_indexed=excluded.text_indexed, is_deleted=0
        `);
        this.db.transaction(() => { for (const file of files)
            this.fileUpsert.run({ ...file, textIndexed: Number(file.textIndexed === true) }); })();
    }
    /**
     * Полнотекстовый поиск по FTS5 с подсветкой найденого фрагмента
     */
    search(query, limit = 50) {
        if (!this.db || !this.searchIndex || typeof query !== 'string' || !query.trim())
            return [];
        return this.attachTags(this.searchIndex.search(query, limit), true);
    }
    /**
     * Закрытие соединения с БД
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.fileUpsert = null;
            this.searchIndex = null;
        }
    }
}
exports.dbManager = new DatabaseManager();
