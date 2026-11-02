import type { WorkspaceTransferRequest, WorkspaceTransferResult } from '../types/workspace';
import { placeWorkspaceFile, sameFileVersion } from '../services/workspaceFiles';
import type { DocumentScanResult, DocumentScanStatus } from '../types/documentScan';
import { createAsyncFileVisibilityFilter, createFileVisibilityFilter } from '../utils/hiddenFiles';
import { isHiddenPath } from '../utils/fileVisibility';
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
const OS_DOCUMENT_EXTENSIONS = new Set([
    'pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'markdown', 'log',
    'csv', 'tsv', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp', 'html', 'htm',
    'json', 'xml', 'yaml', 'yml',
]);
const OS_SCAN_IGNORED_DIRECTORIES = new Set([
    'windows', '$recycle.bin', 'system volume information', 'program files',
    'program files (x86)', 'programdata', 'perflogs', 'recovery',
    'proc', 'sys', 'dev', 'run', 'snap', 'node_modules', '.git',
]);
const OS_SCAN_IGNORED_UNIX_ROOTS = new Set(['usr', 'etc', 'var', 'lib', 'lib64', 'bin', 'sbin', 'boot', 'system', 'applications', 'private']);

class DatabaseManager {
    private db: Database.Database | null = null;
    private dbPath: string | null = null;
    private includeSystemFiles = false;
    private visibility = createFileVisibilityFilter();

    public setSystemFileVisibility(include: boolean): void {
        this.includeSystemFiles = include === true;
        this.visibility = createFileVisibilityFilter();
    }

    public isFileVisible(filePath: string): boolean {
        if (this.includeSystemFiles) return true;
        try { return !this.visibility.isHidden(filePath); } catch { return false; }
    }

    /** Fast metadata-only filter for SQLite result queries; never starts PowerShell on the UI thread. */
    private isFileVisibleForQuery(filePath: string): boolean {
        if (this.includeSystemFiles) return true;
        try { return !isHiddenPath(filePath); } catch { return false; }
    }

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
        this.db.function('owlsift_file_visible', (filePath: string) => this.isFileVisibleForQuery(filePath) ? 1 : 0);
        this.dbPath = dbPath;
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('busy_timeout = 1500');

        // Включаем WAL-режим для ускорения записи и читаемости из разных потоков
        this.db.pragma('journal_mode = WAL');

        this.createTables();
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS document_scan_job (
                id INTEGER PRIMARY KEY CHECK (id = 1), config TEXT NOT NULL,
                phase TEXT NOT NULL, indexed_count INTEGER NOT NULL DEFAULT 0,
                skipped_count INTEGER NOT NULL DEFAULT 0, content_count INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS document_scan_queue (
                id INTEGER PRIMARY KEY, kind TEXT NOT NULL, path TEXT NOT NULL,
                size INTEGER, mtime INTEGER, UNIQUE(kind, path)
            );
            CREATE TABLE IF NOT EXISTS document_scan_pending_content (
                path TEXT PRIMARY KEY, size INTEGER NOT NULL, mtime INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS document_scan_queue_kind ON document_scan_queue(kind, id);
        `);
    }

    /** Index a folder recursively. Text files are stored for FTS; other files remain searchable by name. */
    public indexFolder(folderPath: string, requestedLimit = MAX_FILES_PER_FOLDER): { folderPath: string; indexedCount: number; skippedCount: number; limit: number } {
        if (!this.db) throw new Error('SQLite is not initialized');
        const limit = Math.max(1, Math.min(5000, Math.floor(requestedLimit) || MAX_FILES_PER_FOLDER));

        const textExtensions = new Set([
            '.tsv', '.txt', '.md', '.markdown', '.csv', '.json', '.xml', '.html', '.htm',
            '.js', '.ts', '.vue', '.css', '.scss', '.yaml', '.yml', '.log', '.sql', '.py', '.java', '.c', '.cpp', '.h', '.sh',
        ]);
        const visibility = createFileVisibilityFilter();
        if (!this.includeSystemFiles && visibility.isHidden(folderPath)) throw new Error('Hidden folders cannot be indexed');
        let indexedCount = 0;
        let skippedCount = 0;

        const visit = (directory: string): void => {
            let entries: fs.Dirent[];
            try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
            entries = entries
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
            for (const entry of entries) {
                const entryPath = path.join(directory, entry.name);
                if (entry.isSymbolicLink()) continue;
                try {
                    if (!this.includeSystemFiles && visibility.isHidden(entryPath)) { skippedCount++; continue; }
                } catch { skippedCount++; continue; }
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
                return this.isFileVisible(filePath) && relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
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

    public listScanDrives(): Array<{ path: string; label: string }> {
        if (process.platform === 'win32') {
            const drives: Array<{ path: string; label: string }> = [];
            for (let code = 65; code <= 90; code++) {
                const drivePath = String.fromCharCode(code) + ':' + String.fromCharCode(92);
                try { if (fs.statSync(drivePath).isDirectory()) drives.push({ path: drivePath, label: drivePath.slice(0, 2) }); } catch { /* unavailable drive */ }
            }
            return drives;
        }
        if (process.platform === 'darwin') {
            const volumesPath = '/Volumes';
            try {
                return fs.readdirSync(volumesPath, { withFileTypes: true }).filter(entry => entry.isDirectory())
                    .map(entry => ({ path: path.join(volumesPath, entry.name), label: entry.name }));
            } catch { /* use the system root below */ }
        }
        const root = path.parse(process.env.HOME || path.sep).root || path.sep;
        return [{ path: root, label: root }];
    }

    private documentScan: AbortController | null = null;

    public stopDocumentScan(): boolean {
        if (!this.documentScan) return false;
        this.documentScan.abort();
        return true;
    }

    /** Resolve and deduplicate selected subtrees without allowing a different disk. */
    public async documentScanRoots(drivePath: string, folderPaths?: string[]): Promise<string[]> {
        const selectedDrive = this.listScanDrives().find(drive => {
            const current = path.resolve(drive.path), requested = path.resolve(String(drivePath || ''));
            return process.platform === 'win32' ? current.toLowerCase() === requested.toLowerCase() : current === requested;
        });
        if (!selectedDrive) throw new Error('Choose an available drive before scanning');
        if (folderPaths !== undefined && (!Array.isArray(folderPaths) || !folderPaths.length)) throw new Error('Select at least one folder before scanning');
        const root = await fs.promises.realpath(selectedDrive.path);
        const roots: string[] = [];
        for (const folder of folderPaths ?? [root]) {
            if (typeof folder !== 'string' || !path.isAbsolute(folder)) throw new Error('Invalid scan folder');
            const resolved = await fs.promises.realpath(folder);
            const relative = path.relative(root, resolved);
            if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Choose folders on the selected drive');
            if (!(await fs.promises.stat(resolved)).isDirectory()) throw new Error('Scan target must be a folder');
            if (!roots.some(existing => path.relative(existing, resolved) === '')) roots.push(resolved);
        }
        return roots.filter(folder => !roots.some(parent => {
            if (parent === folder) return false;
            const relative = path.relative(parent, folder);
            return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
        }));
    }

    public documentScanStatus(): DocumentScanStatus {
        const row = this.db?.prepare('SELECT * FROM document_scan_job WHERE id = 1').get() as {
            config: string; phase: 'metadata' | 'content'; indexed_count: number; skipped_count: number; content_count: number;
        } | undefined;
        const config = row ? JSON.parse(row.config) : { drivePath: '', extensions: [] };
        return {
            ...config, running: Boolean(this.documentScan), resumable: Boolean(row), phase: row?.phase ?? null,
            indexedCount: row?.indexed_count ?? 0, skippedCount: row?.skipped_count ?? 0, contentCount: row?.content_count ?? 0,
        };
    }

    /** Metadata first, sequential content reads second; queue and batches commit together. */
    public async scanOsDocuments(drivePath: string, requestedExtensions: string[], folderPaths?: string[], resume = false): Promise<DocumentScanResult> {
        if (!this.db) throw new Error('SQLite is not initialized');
        if (this.documentScan) throw new Error('Document scanning is already running');
        const controller = new AbortController();
        this.documentScan = controller;
        const { signal } = controller;
        let visibility: ReturnType<typeof createAsyncFileVisibilityFilter> | undefined;
        try {
            const saved = resume ? this.documentScanStatus() : null;
            if (resume && !saved?.resumable) throw new Error('No scan to resume');
            if (saved) { drivePath = saved.drivePath; requestedExtensions = saved.extensions; folderPaths = saved.folderPaths; }
            const extensions = new Set((Array.isArray(requestedExtensions) ? requestedExtensions : [])
                .map(extension => String(extension).trim().replace(/^\./, '').toLowerCase())
                .filter(extension => OS_DOCUMENT_EXTENSIONS.has(extension)));
            if (!extensions.size) throw new Error('Select at least one document extension before scanning');
            const roots = await this.documentScanRoots(drivePath, folderPaths);
            const stored = resume ? this.db.prepare('SELECT config FROM document_scan_job WHERE id=1').get() as {config: string} : null;
            const includeSystemFiles: boolean = stored ? JSON.parse(stored.config).includeSystemFiles : this.includeSystemFiles;
            if (!resume) {
                const config = JSON.stringify({drivePath, extensions: [...extensions], ...(folderPaths ? {folderPaths: roots} : {}), includeSystemFiles});
                this.db.transaction(() => {
                    this.db!.exec('DELETE FROM document_scan_queue; DELETE FROM document_scan_job;');
                    this.db!.prepare("INSERT INTO document_scan_job(id,config,phase) VALUES(1,?,'metadata')").run(config);
                    const enqueue = this.db!.prepare("INSERT OR IGNORE INTO document_scan_queue(kind,path) VALUES('directory',?)");
                    for (const root of roots) enqueue.run(root);
                })();
            }
            visibility = createAsyncFileVisibilityFilter(signal);
            const insideRoots = (target: string) => roots.some(root => {
                const relative = path.relative(root, target);
                return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
            });
            const nextDirectory = this.db.prepare("SELECT id,path FROM document_scan_queue WHERE kind='directory' ORDER BY id LIMIT 1");
            const enqueue = this.db.prepare('INSERT INTO document_scan_queue(kind,path,size,mtime) VALUES(@kind,@path,@size,@mtime) ON CONFLICT(kind,path) DO UPDATE SET size=excluded.size,mtime=excluded.mtime');
            const dequeue = this.db.prepare('DELETE FROM document_scan_queue WHERE id=?');
            const previousFile = this.db.prepare('SELECT f.size,f.mtime,p.path AS needs_content FROM files f LEFT JOIN document_scan_pending_content p ON p.path=f.path WHERE f.path=? AND f.is_deleted=0');
            const markPending = this.db.prepare('INSERT INTO document_scan_pending_content(path,size,mtime) VALUES(@path,@size,@mtime) ON CONFLICT(path) DO UPDATE SET size=excluded.size,mtime=excluded.mtime');
            const textExtensions = this.readTextExtensions();
            let skipped = 0;
            let metadata: IndexedFile[] = [];
            let queued: Array<{kind: string; path: string; size: number | null; mtime: number | null}> = [];
            const flushMetadata = (completedDirectory?: number) => {
                if (!metadata.length && !queued.length && !skipped && completedDirectory === undefined) return;
                this.db!.transaction(() => {
                    if (metadata.length) this.saveFiles(metadata);
                    for (const item of queued) {
                        enqueue.run(item);
                        if (item.kind === 'content') markPending.run({path:item.path,size:item.size,mtime:item.mtime});
                    }
                    if (completedDirectory !== undefined) dequeue.run(completedDirectory);
                    this.db!.prepare('UPDATE document_scan_job SET indexed_count=indexed_count+?, skipped_count=skipped_count+? WHERE id=1').run(metadata.length, skipped);
                })();
                metadata = []; queued = []; skipped = 0;
            };
            while (!signal.aborted) {
                const directory = nextDirectory.get() as {id: number; path: string} | undefined;
                if (!directory) break;
                let completed = false;
                try {
                    const stat = await fs.promises.lstat(directory.path);
                    const canonical = await fs.promises.realpath(directory.path);
                    if (!stat.isDirectory() || stat.isSymbolicLink() || !insideRoots(canonical) || (!includeSystemFiles && await visibility.isHidden(directory.path))) {
                        skipped++; completed = true;
                    } else {
                        const handle = await fs.promises.opendir(directory.path);
                        completed = true;
                        for await (const entry of handle) {
                            if (signal.aborted) { completed = false; break; }
                            const entryPath = path.join(directory.path, entry.name);
                            if (entry.isSymbolicLink()) continue;
                            if (entry.isDirectory()) {
                                if (OS_SCAN_IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) continue;
                                if (process.platform !== 'win32' && path.dirname(directory.path) === path.parse(directory.path).root && OS_SCAN_IGNORED_UNIX_ROOTS.has(entry.name.toLowerCase())) continue;
                                queued.push({kind:'directory',path:entryPath,size:null,mtime:null});
                            } else if (entry.isFile()) {
                                const extension = path.extname(entry.name).slice(1).toLowerCase();
                                if (!extensions.has(extension)) continue;
                                try {
                                    if (!includeSystemFiles && await visibility.isHidden(entryPath)) { skipped++; continue; }
                                    const fileStat = await fs.promises.lstat(entryPath);
                                    if (signal.aborted) { completed = false; break; }
                                    if (!fileStat.isFile() || fileStat.isSymbolicLink()) continue;
                                    const mtime = Math.floor(fileStat.mtimeMs);
                                    const existing = previousFile.get(entryPath) as {size:number;mtime:number;needs_content?:string} | undefined;
                                    if (!existing || existing.size !== fileStat.size || existing.mtime !== mtime) {
                                        metadata.push({path:entryPath,name:entry.name,extension,size:fileStat.size,mtime,content:''});
                                        if (textExtensions.has('.'+extension) && fileStat.size <= 2*1024*1024) queued.push({kind:'content',path:entryPath,size:fileStat.size,mtime});
                                    } else if (existing.needs_content && textExtensions.has('.'+extension) && fileStat.size <= 2*1024*1024) {
                                        queued.push({kind:'content',path:entryPath,size:fileStat.size,mtime});
                                    }
                                } catch {
                                    if (!signal.aborted && visibility.failure) throw visibility.failure;
                                    if (!signal.aborted) skipped++;
                                }
                            }
                            if (metadata.length >= 100 || queued.length >= 100) {
                                flushMetadata();
                                await new Promise<void>(resolve => setImmediate(resolve));
                            }
                        }
                        if (signal.aborted) completed = false;
                    }
                } catch {
                    if (!signal.aborted && visibility.failure) throw visibility.failure;
                    if (!signal.aborted) { skipped++; completed = true; }
                }
                flushMetadata(completed ? directory.id : undefined);
            }
            if (!signal.aborted) this.db.prepare("UPDATE document_scan_job SET phase='content' WHERE id=1").run();
            const clearPending = this.db.prepare('DELETE FROM document_scan_pending_content WHERE path=? AND size=? AND mtime=?');
            const updateContent = this.db.prepare('UPDATE files SET content=? WHERE path=? AND size=? AND mtime=? AND is_deleted=0');
            const nextContents = this.db.prepare("SELECT id,path,size,mtime FROM document_scan_queue WHERE kind='content' ORDER BY id LIMIT 100");
            while (!signal.aborted) {
                const items = nextContents.all() as Array<{id:number;path:string;size:number;mtime:number}>;
                if (!items.length) break;
                const finished: Array<{id:number;path:string;size:number;mtime:number;content?:string}> = [];
                let contentBytes = 0;
                skipped = 0;
                for (const item of items) {
                    if (signal.aborted) break;
                    try {
                        const stat = await fs.promises.lstat(item.path);
                        const canonical = await fs.promises.realpath(item.path);
                        if (!stat.isFile() || stat.isSymbolicLink() || !insideRoots(canonical) || stat.size !== item.size || Math.floor(stat.mtimeMs) !== item.mtime || (!includeSystemFiles && await visibility.isHidden(item.path))) {
                            skipped++; finished.push(item); continue;
                        }
                        const content = await fs.promises.readFile(item.path, {encoding:'utf8',signal});
                        if (signal.aborted) break;
                        const after = await fs.promises.stat(item.path);
                        if (after.size !== item.size || Math.floor(after.mtimeMs) !== item.mtime) { skipped++; finished.push(item); continue; }
                        finished.push({...item,content}); contentBytes += content.length;
                        if (contentBytes >= 4*1024*1024) break;
                    } catch {
                        if (signal.aborted) break;
                        if (visibility.failure) throw visibility.failure;
                        skipped++; finished.push(item);
                    }
                }
                if (finished.length) this.db.transaction(() => {
                    let count = 0;
                    for (const item of finished) {
                        if (item.content !== undefined) { updateContent.run(item.content,item.path,item.size,item.mtime); clearPending.run(item.path,item.size,item.mtime); count++; }
                        dequeue.run(item.id);
                    }
                    this.db!.prepare('UPDATE document_scan_job SET content_count=content_count+?, skipped_count=skipped_count+? WHERE id=1').run(count,skipped);
                })();
                await new Promise<void>(resolve => setImmediate(resolve));
            }
            const result = this.documentScanStatus();
            if (!signal.aborted) this.db.transaction(() => {
                this.db!.exec('DELETE FROM document_scan_queue; DELETE FROM document_scan_job;');
            })();
            return {indexedCount:result.indexedCount,skippedCount:result.skippedCount,cancelled:signal.aborted};
        } finally {
            visibility?.dispose();
            if (this.documentScan === controller) this.documentScan = null;
        }
    }

    private readTextExtensions() {
        return new Set([
            '.tsv', '.txt', '.md', '.markdown', '.csv', '.json', '.xml', '.html', '.htm',
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
        if (!this.isFileVisible(filePath)) throw new Error('System and hidden files are excluded by the current settings');
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
        if (!this.listFolders().some(folder => path.resolve(folder.path) === path.resolve(folderPath))) throw new Error('Workspace not found');
        const safeName = path.basename((fileName || 'untitled.txt').replace(/[\\/:*?"<>|]/g, '-'));
        const filePath = path.join(folderPath, safeName);
        if (createFileVisibilityFilter().isHidden(folderPath) || safeName.startsWith('.') || safeName.startsWith('~$')) throw new Error('Hidden files cannot be created');
        fs.writeFileSync(filePath, bytes ?? content ?? '', { flag: 'wx' });
        const result = this.indexSingleFile(filePath, folderPath);
        this.saveFile({ path: filePath, name: safeName, extension: path.extname(safeName).slice(1), size: fs.statSync(filePath).size, mtime: Math.floor(fs.statSync(filePath).mtimeMs), content });
        return result;
    }

    /** Update only an existing indexed document, without accepting a model-supplied path. */
    public editIndexedFile(fileId: number, content: string, bytes: Buffer, expectedMtime: number): void {
        if (!this.db || !Number.isInteger(fileId) || typeof content !== 'string' || content.length > 2000000 || bytes.length > 20 * 1024 * 1024) throw new Error('Invalid document edit');
        const record = this.db.prepare('SELECT path FROM files WHERE id = ? AND is_deleted = 0').get(fileId) as { path: string } | undefined;
        if (!record) throw new Error('Indexed file not found');
        if (createFileVisibilityFilter().isHidden(record.path) || fs.lstatSync(record.path).isSymbolicLink()) throw new Error('This file cannot be edited');
        const descriptor = fs.openSync(record.path, 'r+');
        try {
            const stat = fs.fstatSync(descriptor);
            if (!stat.isFile() || Math.floor(stat.mtimeMs) !== expectedMtime) throw new Error('The file changed since indexing. Refresh the folder before editing.');
            // A local backup preserves the original binary and formatting.
            fs.copyFileSync(record.path, path.join(path.dirname(record.path), '.' + path.basename(record.path) + '.' + Date.now() + '.owlsift-backup'), fs.constants.COPYFILE_EXCL);
            fs.writeFileSync(descriptor, bytes);
            fs.ftruncateSync(descriptor, bytes.length);
        } finally { fs.closeSync(descriptor); }
        const stat = fs.statSync(record.path);
        this.saveFile({ path: record.path, name: path.basename(record.path), extension: path.extname(record.path).slice(1), size: stat.size, mtime: Math.floor(stat.mtimeMs), content });
    }

    public createWorkspaceFolder(parentPath: string, requestedName: string): { name: string; path: string; count: number } {
        if (!this.db || !path.isAbsolute(parentPath)) throw new Error('Choose a parent folder');
        const name = String(requestedName || '').trim();
        if (!name || name.length > 120 || /[\\/:*?"<>|\x00-\x1f]/.test(name) || name.startsWith('.') || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error('Invalid workspace name');
        const parent = fs.realpathSync(parentPath);
        if (!fs.statSync(parent).isDirectory()) throw new Error('Parent folder not found');
        const target = path.join(parent,name);
        fs.mkdirSync(target);
        try {
            this.db.prepare('INSERT INTO indexed_folders(path,name,indexed_count) VALUES(?,?,0)').run(target,name);
        } catch (error) { fs.rmdirSync(target); throw error; }
        return {name,path:target,count:0};
    }

    private workspaceTarget(folderPath: string): string {
        if (!this.db || !path.isAbsolute(folderPath)) throw new Error('Workspace not found');
        const folder = this.db.prepare('SELECT path FROM indexed_folders WHERE path=?').get(folderPath) as {path:string} | undefined;
        if (!folder || !this.isFileVisible(folder.path)) throw new Error('Workspace not found');
        const target = fs.realpathSync(folder.path);
        if (!fs.statSync(target).isDirectory()) throw new Error('Workspace folder is unavailable');
        return path.resolve(folder.path);
    }

    public async importFileToWorkspace(source: string, folderPath: string, maxFiles = 1000): Promise<string> {
        const target = this.workspaceTarget(folderPath);
        if (!this.isFileVisible(source)) throw new Error('Hidden and system files are excluded');
        if (path.relative(path.dirname(fs.realpathSync(source)),fs.realpathSync(target)) === '') {
            this.indexSingleFile(source,folderPath); return source;
        }
        const limit = Math.max(1,Math.min(5000,Math.floor(maxFiles)||1000));
        if ((this.listFolders().find(folder => folder.path === folderPath)?.count ?? 0) >= limit) throw new Error('Folder limit reached');
        const placed = await placeWorkspaceFile(source,target,false,candidate => Boolean(this.db!.prepare('SELECT 1 FROM files WHERE path=?').get(candidate)));
        try { this.indexSingleFile(placed.destination,folderPath); }
        catch (error) { await fs.promises.unlink(placed.destination).catch(() => {}); throw error; }
        return placed.destination;
    }

    private workspaceTransferBusy = false;

    public async transferWorkspaceFiles(request: WorkspaceTransferRequest): Promise<WorkspaceTransferResult> {
        if (this.workspaceTransferBusy) throw new Error('A file operation is already running');
        this.workspaceTransferBusy = true;
        try { return await this.performWorkspaceTransfer(request); }
        finally { this.workspaceTransferBusy = false; }
    }

    private async performWorkspaceTransfer(request: WorkspaceTransferRequest): Promise<WorkspaceTransferResult> {
        if (!this.db || !['copy','move'].includes(request.mode) || !Array.isArray(request.fileIds) || !request.fileIds.length || request.fileIds.length > 5000 || request.fileIds.some(id => !Number.isInteger(id))) throw new Error('Invalid file transfer');
        const target = this.workspaceTarget(request.targetFolderPath);
        const result: WorkspaceTransferResult = {completed:[],failed:[]};
        const limit = Math.max(1,Math.min(5000,Math.floor(request.maxFiles ?? 1000)||1000));
        let count = this.listFolders().find(folder => folder.path === request.targetFolderPath)?.count ?? 0;
        for (const fileId of new Set(request.fileIds)) {
            let placed: Awaited<ReturnType<typeof placeWorkspaceFile>> | undefined;
            let sourceRemoved = false;
            let source = '';
            try {
                const record = this.db.prepare('SELECT id,path,size,mtime,extension,content FROM files WHERE id=? AND is_deleted=0').get(fileId) as {id:number;path:string;size:number;mtime:number;extension:string;content:string} | undefined;
                if (!record || !this.isFileVisible(record.path)) throw new Error('Indexed file is unavailable');
                source = record.path;
                if (request.mode === 'move' && path.relative(path.dirname(fs.realpathSync(source)),fs.realpathSync(target)) === '') {
                    result.completed.push({sourceId:fileId,id:fileId,oldPath:source,path:source,name:path.basename(source)}); continue;
                }
                const relative = path.relative(target,source);
                const alreadyInside = relative !== '..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative);
                if (count >= limit && (request.mode === 'copy' || !alreadyInside)) throw new Error('Folder limit reached');
                placed = await placeWorkspaceFile(source,target,request.mode==='move',candidate => Boolean(this.db!.prepare('SELECT 1 FROM files WHERE path=?').get(candidate)));
                const unchanged = record.size === placed.original.size && Math.floor(record.mtime) === Math.floor(placed.original.mtimeMs);
                let content = unchanged ? record.content : '';
                if (this.readTextExtensions().has('.'+record.extension) && placed.stat.size <= 2*1024*1024 && (!content || record.size !== placed.original.size || Math.floor(record.mtime) !== Math.floor(placed.original.mtimeMs))) {
                    content = await fs.promises.readFile(placed.destination,'utf8');
                }
                const destination = placed.destination, snapshot = placed;
                let newId = fileId;
                this.db.transaction(() => {
                    if (!sameFileVersion(snapshot.original,fs.lstatSync(source))) throw new Error('The source file changed during transfer');
                    if (request.mode === 'move') {
                        this.db!.prepare('UPDATE files SET path=?,name=?,size=?,mtime=?,content=? WHERE id=?').run(destination,path.basename(destination),snapshot.stat.size,Math.floor(snapshot.stat.mtimeMs),content,fileId);
                        this.db!.prepare("DELETE FROM document_scan_queue WHERE kind='content' AND path=?").run(source);
                        this.db!.prepare('DELETE FROM document_scan_pending_content WHERE path=?').run(source);
                        fs.unlinkSync(source); sourceRemoved = true;
                    } else {
                        const insert = this.db!.prepare('INSERT INTO files(path,name,extension,size,mtime,content) VALUES(?,?,?,?,?,?)').run(destination,path.basename(destination),record.extension,snapshot.stat.size,Math.floor(snapshot.stat.mtimeMs),content);
                        newId = Number(insert.lastInsertRowid);
                        this.db!.prepare('INSERT INTO file_tags(file_id,tag) SELECT ?,tag FROM file_tags WHERE file_id=?').run(newId,fileId);
                        this.db!.prepare('INSERT INTO file_notes(file_id,note,updated_at) SELECT ?,note,updated_at FROM file_notes WHERE file_id=?').run(newId,fileId);
                    }
                })();
                if (request.mode === 'copy' || !alreadyInside) count++;
                result.completed.push({sourceId:fileId,id:newId,oldPath:source,path:destination,name:path.basename(destination)});
            } catch (error) {
                if (placed) {
                    let restored = !sourceRemoved;
                    if (sourceRemoved) {
                        try {
                            await fs.promises.copyFile(placed.destination,source,fs.constants.COPYFILE_EXCL);
                            await fs.promises.utimes(source,placed.original.atime,placed.original.mtime);
                            restored = true;
                        } catch { /* Keep the destination if restoring the source is impossible. */ }
                    }
                    if (restored) await fs.promises.unlink(placed.destination).catch(() => {});
                }
                result.failed.push({fileId,message:error instanceof Error ? error.message : String(error)});
            }
            await new Promise<void>(resolve => setImmediate(resolve));
        }
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
        const activePaths = (this.db.prepare('SELECT path FROM files WHERE is_deleted = 0 AND owlsift_file_visible(path) = 1').all() as Array<{ path: string }>)
            .map(({ path: filePath }) => filePath);
        return folders.filter(folder => this.isFileVisible(folder.path)).map((folder) => ({
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
            FROM files WHERE is_deleted = 0 AND owlsift_file_visible(path) = 1 ORDER BY name COLLATE NOCASE
        `).all() as IndexedFileRecord[];
        return this.attachTags(records);
    }

    public getFilePath(fileId: number): string {
        if (!this.db || !Number.isInteger(fileId)) throw new Error('Invalid file id');
        const file = this.db.prepare('SELECT path FROM files WHERE id = ?').get(fileId) as { path: string } | undefined;
        if (!file) throw new Error('Indexed file not found');
        return file.path;
    }

    public renameIndexedFile(fileId: number, requestedName: string): { path: string; name: string; extension: string; size: number; mtime: number } {
        if (!this.db || !Number.isInteger(fileId)) throw new Error('Invalid file id');
        const name = requestedName.trim();
        if (!name || name.length > 180 || name === '.' || name === '..' || /[\\/:*?"<>|\x00-\x1f]/.test(name)) throw new Error('Invalid file name');
        const file = this.db.prepare('SELECT path, name, extension FROM files WHERE id = ? AND is_deleted = 0').get(fileId) as { path: string; name: string; extension: string } | undefined;
        if (!file) throw new Error('Indexed file not found');
        const oldExtension = path.extname(file.name);
        const hasExtension = path.extname(name) !== '';
        const nextName = hasExtension ? name : name + oldExtension;
        if (path.extname(nextName).toLowerCase() !== oldExtension.toLowerCase()) throw new Error('Changing the file extension is not supported');
        const nextPath = path.join(path.dirname(file.path), nextName);
        if (nextPath === file.path) return { path: file.path, name: file.name, extension: file.extension, size: fs.statSync(file.path).size, mtime: fs.statSync(file.path).mtimeMs };
        if (fs.existsSync(nextPath)) throw new Error('A file with that name already exists');
        const stats = fs.statSync(file.path);
        if (!stats.isFile()) throw new Error('Selected path is not a file');
        fs.renameSync(file.path, nextPath);
        try {
            const nextStats = fs.statSync(nextPath);
            this.db.prepare('UPDATE files SET path = ?, name = ?, size = ?, mtime = ? WHERE id = ?').run(nextPath, nextName, nextStats.size, nextStats.mtimeMs, fileId);
            return { path: nextPath, name: nextName, extension: file.extension, size: nextStats.size, mtime: nextStats.mtimeMs };
        } catch (error) {
            try { fs.renameSync(nextPath, file.path); } catch { /* Keep the indexed path aligned whenever the filesystem allows rollback. */ }
            throw error;
        }
    }

    public removeFileRecord(fileId: number): void {
        if (!this.db || !Number.isInteger(fileId)) throw new Error('Invalid file id');
        this.db.prepare('UPDATE files SET is_deleted = 1 WHERE id = ?').run(fileId);
    }

    /** Remove an indexed workspace and hide its files from OwlSift without touching disk. */
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
            const { count } = this.db.prepare('SELECT COUNT(*) AS count FROM files WHERE is_deleted = 0 AND owlsift_file_visible(path) = 1').get() as { count: number };
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
        if (!hasFtsIndex) this.db.exec("INSERT INTO files_fts(files_fts) VALUES('rebuild')");

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
    `);
    }

    /**
     * Индексация или обновление файла в базе
     */
    private fileUpsert: Database.Statement | null = null;

    public saveFile(file: IndexedFile): void { this.saveFiles([file]); }

    public saveFiles(files: IndexedFile[]): void {
        if (!this.db || !files.length) return;
        this.fileUpsert ??= this.db.prepare(`
            INSERT INTO files (path,name,extension,size,mtime,content)
            VALUES (@path,@name,@extension,@size,@mtime,@content)
            ON CONFLICT(path) DO UPDATE SET name=excluded.name, extension=excluded.extension,
                size=excluded.size, mtime=excluded.mtime, content=excluded.content, is_deleted=0
        `);
        this.db.transaction(() => { for (const file of files) this.fileUpsert!.run(file); })();
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
      WHERE files_fts MATCH ? AND f.is_deleted = 0 AND owlsift_file_visible(f.path) = 1
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
            WHERE f.is_deleted = 0 AND owlsift_file_visible(f.path) = 1 AND EXISTS (
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
            this.fileUpsert = null;
        }
    }
}

export const dbManager = new DatabaseManager();
