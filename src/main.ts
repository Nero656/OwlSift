import { registerModelIpc } from './services/modelIpc';
import type { WorkspaceTransferRequest } from './types/workspace';
import type { DocumentScanRequest } from './types/documentScan';
import { requestComfy, type ComfyRequest } from './services/comfyTransport';
import { app, BrowserWindow, dialog, ipcMain, shell, protocol, net } from 'electron';
import path from 'path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dbManager } from './db/sqlite';

protocol.registerSchemesAsPrivileged([{
    scheme: 'localmind',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

if (!app.isPackaged && process.platform === 'linux') {
    app.commandLine.appendSwitch('ozone-platform', 'x11');
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('disable-dev-shm-usage');
}
const customUserData = app.commandLine.getSwitchValue('user-data-dir');
if (customUserData) {
    const directory = path.resolve(customUserData);
    fs.mkdirSync(directory, { recursive: true });
    app.setPath('userData', directory);
} else if (app.isPackaged) {
    // Preserve existing profiles and SQLite indexes after the OwlSift rename.
    const directory = path.join(app.getPath('appData'), 'LocalMind');
    fs.mkdirSync(directory, { recursive: true });
    app.setPath('userData', directory);
}

let win: BrowserWindow | null = null;

function createWindow(): void {
    win = new BrowserWindow({
        show: !app.commandLine.hasSwitch('smoke-test'),
        title: 'OwlSift',
        icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (app.isPackaged) {
        void win.loadURL('localmind://app/');
    } else {
        void win.loadURL(process.env.ELECTRON_RENDERER_URL || 'http://localhost:3000');
    }
}

app.whenReady().then(() => {
    registerModelIpc(ipcMain);
    if (app.isPackaged) {
        const root = path.join(process.resourcesPath, 'app');
        protocol.handle('localmind', request => {
            const url = new URL(request.url);
            if (url.hostname !== 'app') return new Response('Not found', { status: 404 });
            const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
            const relative = path.relative(root, file);
            if (relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Forbidden', { status: 403 });
            let target = file;
            if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
            if (!fs.existsSync(target) && !path.extname(url.pathname)) target = path.join(root, 'index.html');
            if (!fs.existsSync(target)) return new Response('Not found', { status: 404 });
            return net.fetch(pathToFileURL(target).toString());
        });
    }
    ipcMain.handle('app:open-ai-doc', (_event, id: string) => {
        const docs: Record<string, string> = {
            nuxtTheme: 'https://ui.nuxt.com/theme',
            ollamaDocs: 'https://ollama.com/download',
            ollamaModels: 'https://docs.ollama.com/api/tags',
            ollamaApi: 'https://docs.ollama.com/api/openai-compatibility',
            ollamaFaq: 'https://docs.ollama.com/faq',
            lmServer: 'https://lmstudio.ai/docs/developer/core/server/settings',
            lmCompat: 'https://lmstudio.ai/docs/developer/openai-compat',
            openaiStart: 'https://developers.openai.com/api/docs/quickstart',
            openaiKeys: 'https://platform.openai.com/api-keys',
            openaiErrors: 'https://developers.openai.com/api/docs/guides/error-codes',
            geminiApi: 'https://ai.google.dev/gemini-api/docs/openai',
            deepseekApi: 'https://api-docs.deepseek.com/api/list-models/',
        };
        if (!Object.hasOwn(docs, id)) throw new Error('Unknown documentation link');
        return shell.openExternal(docs[id]);
    });
    ipcMain.handle('app:open-external', (_event, href: string) => {
        const url = new URL(href);
        if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported link protocol');
        return shell.openExternal(url.href);
    });
    ipcMain.handle('app:open-donation', () => shell.openExternal('https://www.donationalerts.com/r/nero_656'));
    try {
        dbManager.init();
    } catch (error) {
        console.error('Failed to initialize SQLite:', error);
    }

    ipcMain.handle('comfy:request', (_event, request: ComfyRequest) => requestComfy(request));
    ipcMain.handle('app:get-version', (): string => app.getVersion());
    ipcMain.handle('db:get-status', () => dbManager.getStatus());
    ipcMain.handle('db:list-indexes', () => dbManager.listIndexes());
    ipcMain.handle('db:create-index', (_event, name: string) => dbManager.createIndex(name));
    ipcMain.handle('db:set-scan-mode', (_event, mode: unknown) => dbManager.setScanMode(mode));
    let indexOperations = 0;
    const handleIndexOperation: typeof ipcMain.handle = (channel, handler) => {
        ipcMain.handle(channel, async (event, ...args) => {
            indexOperations++;
            try { return await handler(event, ...args); }
            finally { indexOperations--; }
        });
    };
    ipcMain.handle('db:switch-index', (_event, id: string) => {
        if (indexOperations) throw new Error('Wait for indexing or file operations to finish.');
        dbManager.switchIndex(id);
    });
    ipcMain.handle('db:delete-index', async (_event, request: { id: string; language: string }) => {
        const index = dbManager.listIndexes().indexes.find(item => item.id === request.id);
        if (!index) throw new Error('Index not found.');
        const ru = request.language === 'ru';
        const { response } = await dialog.showMessageBox(win!, {
            type: 'warning',
            message: ru ? 'Удалить индекс «' + index.name + '»?' : 'Delete the index “' + index.name + '”?',
            detail: ru ? 'Будет удалена только база индекса. Исходные файлы останутся на диске.' : 'Only the index database will be deleted. Your original files will remain untouched.',
            buttons: ru ? ['Отмена', 'Удалить индекс'] : ['Cancel', 'Delete index'],
            defaultId: 0,
            cancelId: 0,
        });
        if (response === 1) dbManager.deleteIndex(index.id);
    });
    handleIndexOperation('files:set-system-visibility', (_event, include: boolean) => dbManager.setSystemFileVisibility(include));
    handleIndexOperation('files:list', () => dbManager.listFiles());
    handleIndexOperation('files:open', async (_event, fileId: number) => {
        const error = await shell.openPath(dbManager.getFilePath(fileId));
        if (error) throw new Error(error);
    });
    handleIndexOperation('files:rename', (_event, data: { fileId: number; name: string }) => dbManager.renameIndexedFile(data.fileId, data.name));
    handleIndexOperation('files:show-in-folder', (_event, fileId: number) => {
        shell.showItemInFolder(dbManager.getFilePath(fileId));
    });
    // This action only hides the record from OwlSift. It never removes the disk file.
    handleIndexOperation('files:delete', (_event, data: { fileId: number }) => dbManager.removeFileRecord(data.fileId));
    handleIndexOperation('files:get-image-preview', (_event, fileId: number) => dbManager.getImagePreview(fileId));
    handleIndexOperation('files:folders', () => dbManager.listFolders());
    handleIndexOperation('files:search', (_event, query: string) => dbManager.search(query));
    handleIndexOperation('files:search-documents', (_event, query: string) => dbManager.search(query, 10000));
    handleIndexOperation('files:list-scan-drives', () => dbManager.listScanDrives());
    handleIndexOperation('files:scan-os-documents', (_event, data: DocumentScanRequest) => dbManager.scanOsDocuments(data.drivePath, data.extensions, data.folderPaths, data.resume, data.mode, data.additionalDrivePaths));
    handleIndexOperation('files:document-scan-status', () => dbManager.documentScanStatus());
    handleIndexOperation('files:stop-document-scan', () => dbManager.stopDocumentScan());
    handleIndexOperation('files:choose-scan-folders', async (_event, data: { drivePath: string }) => {
        const [root] = await dbManager.documentScanRoots(data.drivePath);
        const result = await dialog.showOpenDialog(win!, { defaultPath: root, properties: ['openDirectory', 'multiSelections'] });
        if (result.canceled || !result.filePaths.length) return null;
        return dbManager.documentScanRoots(data.drivePath, result.filePaths);
    });
    handleIndexOperation('files:choose-and-index', async (_event, data: { maxFiles?: number } = {}) => {
        const result = await dialog.showOpenDialog(win!, {
            properties: ['openDirectory']
        });
        if (result.canceled || !result.filePaths[0]) return null;
        return dbManager.indexFolder(result.filePaths[0], data.maxFiles);
    });
    handleIndexOperation('folders:index-drop', (_event, data: { paths: string[]; maxFiles?: number }) => {
        if (!Array.isArray(data?.paths)) throw new Error('Invalid folder drop');
        return dbManager.indexDroppedFolders(data.paths, data.maxFiles);
    });
    handleIndexOperation('folders:default-location', () => app.getPath('desktop'));
    handleIndexOperation('folders:choose-parent', async () => {
        const result = await dialog.showOpenDialog(win!, {properties:['openDirectory'],defaultPath:app.getPath('desktop')});
        return result.canceled ? null : result.filePaths[0] ?? null;
    });
    handleIndexOperation('folders:create', (_event, data: {parentPath:string;name:string}) => dbManager.createWorkspaceFolder(data.parentPath,data.name));
    handleIndexOperation('files:transfer-workspace', (_event, data: WorkspaceTransferRequest) => dbManager.transferWorkspaceFiles(data));
    handleIndexOperation('files:import-drop', async (_event, data: {filePath:string;folderPath?:string;maxFiles:number}) => {
        if (!path.isAbsolute(data.filePath)) throw new Error('Invalid file');
        if (data.folderPath) return dbManager.importFileToWorkspace(data.filePath,data.folderPath,data.maxFiles);
        await dbManager.indexImportedFile(data.filePath); return data.filePath;
    });
    handleIndexOperation('files:choose-and-index-file', async (_event, data: {folderPath?:string;maxFiles?:number} = {}) => {
        const result = await dialog.showOpenDialog(win!, {properties:['openFile','multiSelections'],defaultPath:data.folderPath});
        if (result.canceled || !result.filePaths.length) return null;
        let indexedCount = 0, skippedCount = 0;
        for (const source of result.filePaths) {
            try {
                if (data.folderPath) await dbManager.importFileToWorkspace(source,data.folderPath,data.maxFiles);
                else await dbManager.indexImportedFile(source);
                indexedCount++;
            } catch { skippedCount++; }
        }
        return {folderPath:data.folderPath ?? path.dirname(result.filePaths[0]!),indexedCount,skippedCount,limit:data.maxFiles ?? 1000};
    });
    handleIndexOperation('files:create-in-folder', (_event, data: { folderPath: string; fileName: string; content: string; bytes?: number[] }) => {
        return dbManager.createFileInFolder(data.folderPath, data.fileName, data.content ?? '', data.bytes ? Buffer.from(data.bytes) : undefined);
    });
    handleIndexOperation('files:edit-content', (_event, data: { fileId: number; content: string; bytes: number[]; expectedMtime: number }) => {
        dbManager.editIndexedFile(data.fileId, data.content, Buffer.from(data.bytes), data.expectedMtime);
    });
    handleIndexOperation('files:get-bytes', async (_event, fileId: number) => {
        const bytes = await fs.promises.readFile(dbManager.getFilePath(fileId));
        return Uint8Array.from(bytes).buffer;
    });
    handleIndexOperation('files:get-content', (_event, fileId: number) => dbManager.getFileContent(fileId));
    handleIndexOperation('files:add-tag', (_event, data: { fileId: number; tag: string }) => dbManager.addFileTag(data.fileId, data.tag));
    handleIndexOperation('files:remove-tag', (_event, data: { fileId: number; tag: string }) => dbManager.removeFileTag(data.fileId, data.tag));
    handleIndexOperation('files:set-note', (_event, data: { fileId: number; note: string }) => dbManager.setFileNote(data.fileId, data.note));
    handleIndexOperation('files:delete-from-disk', async (_event, data: { fileId: number; mode: 'trash' | 'permanent' }) => {
        const filePath = dbManager.getFilePath(data.fileId);
        if (data.mode === 'permanent') fs.unlinkSync(filePath);
        else await shell.trashItem(filePath);
        dbManager.removeFileRecord(data.fileId);
    });
    handleIndexOperation('folders:remove-from-index', (_event, folderPath: string) => dbManager.removeFolderFromIndex(folderPath));

    ipcMain.on('app:minimize', (): void => {
        win?.minimize();
    });

    ipcMain.on('app:maximize', (): void => {
        if (!win) return;
        win.isMaximized() ? win.unmaximize() : win.maximize();
    });

    ipcMain.on('app:close', (): void => {
        win?.close();
    });

    createWindow();
});

app.on('window-all-closed', (): void => {
    dbManager.close();
    if (process.platform !== 'darwin') app.quit();
});
