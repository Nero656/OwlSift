"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const modelIpc_1 = require("./services/modelIpc");
const comfyTransport_1 = require("./services/comfyTransport");
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_url_1 = require("node:url");
const sqlite_1 = require("./db/sqlite");
electron_1.protocol.registerSchemesAsPrivileged([{
        scheme: 'localmind',
        privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    }]);
if (!electron_1.app.isPackaged && process.platform === 'linux') {
    electron_1.app.commandLine.appendSwitch('ozone-platform', 'x11');
    electron_1.app.commandLine.appendSwitch('no-sandbox');
    electron_1.app.commandLine.appendSwitch('disable-dev-shm-usage');
}
const customUserData = electron_1.app.commandLine.getSwitchValue('user-data-dir');
if (customUserData) {
    const directory = path_1.default.resolve(customUserData);
    node_fs_1.default.mkdirSync(directory, { recursive: true });
    electron_1.app.setPath('userData', directory);
}
else if (electron_1.app.isPackaged) {
    // Preserve existing profiles and SQLite indexes after the OwlSift rename.
    const directory = path_1.default.join(electron_1.app.getPath('appData'), 'LocalMind');
    node_fs_1.default.mkdirSync(directory, { recursive: true });
    electron_1.app.setPath('userData', directory);
}
let win = null;
function createWindow() {
    win = new electron_1.BrowserWindow({
        show: !electron_1.app.commandLine.hasSwitch('smoke-test'),
        title: 'OwlSift',
        icon: path_1.default.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    if (electron_1.app.isPackaged) {
        void win.loadURL('localmind://app/');
    }
    else {
        void win.loadURL(process.env.ELECTRON_RENDERER_URL || 'http://localhost:3000');
    }
}
electron_1.app.whenReady().then(() => {
    (0, modelIpc_1.registerModelIpc)(electron_1.ipcMain);
    if (electron_1.app.isPackaged) {
        const root = path_1.default.join(process.resourcesPath, 'app');
        electron_1.protocol.handle('localmind', request => {
            const url = new URL(request.url);
            if (url.hostname !== 'app')
                return new Response('Not found', { status: 404 });
            const file = path_1.default.resolve(root, '.' + decodeURIComponent(url.pathname));
            const relative = path_1.default.relative(root, file);
            if (relative.startsWith('..') || path_1.default.isAbsolute(relative))
                return new Response('Forbidden', { status: 403 });
            let target = file;
            if (node_fs_1.default.existsSync(target) && node_fs_1.default.statSync(target).isDirectory())
                target = path_1.default.join(target, 'index.html');
            if (!node_fs_1.default.existsSync(target) && !path_1.default.extname(url.pathname))
                target = path_1.default.join(root, 'index.html');
            if (!node_fs_1.default.existsSync(target))
                return new Response('Not found', { status: 404 });
            return electron_1.net.fetch((0, node_url_1.pathToFileURL)(target).toString());
        });
    }
    electron_1.ipcMain.handle('app:open-ai-doc', (_event, id) => {
        const docs = {
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
        if (!Object.hasOwn(docs, id))
            throw new Error('Unknown documentation link');
        return electron_1.shell.openExternal(docs[id]);
    });
    electron_1.ipcMain.handle('app:open-external', (_event, href) => {
        const url = new URL(href);
        if (!['https:', 'http:'].includes(url.protocol))
            throw new Error('Unsupported link protocol');
        return electron_1.shell.openExternal(url.href);
    });
    electron_1.ipcMain.handle('app:open-donation', () => electron_1.shell.openExternal('https://www.donationalerts.com/r/nero_656'));
    try {
        sqlite_1.dbManager.init();
    }
    catch (error) {
        console.error('Failed to initialize SQLite:', error);
    }
    electron_1.ipcMain.handle('comfy:request', (_event, request) => (0, comfyTransport_1.requestComfy)(request));
    electron_1.ipcMain.handle('app:get-version', () => electron_1.app.getVersion());
    electron_1.ipcMain.handle('db:get-status', () => sqlite_1.dbManager.getStatus());
    electron_1.ipcMain.handle('db:list-indexes', () => sqlite_1.dbManager.listIndexes());
    electron_1.ipcMain.handle('db:create-index', (_event, name) => sqlite_1.dbManager.createIndex(name));
    electron_1.ipcMain.handle('db:set-scan-mode', (_event, mode) => sqlite_1.dbManager.setScanMode(mode));
    let indexOperations = 0;
    const handleIndexOperation = (channel, handler) => {
        electron_1.ipcMain.handle(channel, async (event, ...args) => {
            indexOperations++;
            try {
                return await handler(event, ...args);
            }
            finally {
                indexOperations--;
            }
        });
    };
    electron_1.ipcMain.handle('db:switch-index', (_event, id) => {
        if (indexOperations)
            throw new Error('Wait for indexing or file operations to finish.');
        sqlite_1.dbManager.switchIndex(id);
    });
    electron_1.ipcMain.handle('db:delete-index', async (_event, request) => {
        const index = sqlite_1.dbManager.listIndexes().indexes.find(item => item.id === request.id);
        if (!index)
            throw new Error('Index not found.');
        const ru = request.language === 'ru';
        const { response } = await electron_1.dialog.showMessageBox(win, {
            type: 'warning',
            message: ru ? 'Удалить индекс «' + index.name + '»?' : 'Delete the index “' + index.name + '”?',
            detail: ru ? 'Будет удалена только база индекса. Исходные файлы останутся на диске.' : 'Only the index database will be deleted. Your original files will remain untouched.',
            buttons: ru ? ['Отмена', 'Удалить индекс'] : ['Cancel', 'Delete index'],
            defaultId: 0,
            cancelId: 0,
        });
        if (response === 1)
            sqlite_1.dbManager.deleteIndex(index.id);
    });
    handleIndexOperation('files:set-system-visibility', (_event, include) => sqlite_1.dbManager.setSystemFileVisibility(include));
    handleIndexOperation('files:list', () => sqlite_1.dbManager.listFiles());
    handleIndexOperation('files:open', async (_event, fileId) => {
        const error = await electron_1.shell.openPath(sqlite_1.dbManager.getFilePath(fileId));
        if (error)
            throw new Error(error);
    });
    handleIndexOperation('files:rename', (_event, data) => sqlite_1.dbManager.renameIndexedFile(data.fileId, data.name));
    handleIndexOperation('files:show-in-folder', (_event, fileId) => {
        electron_1.shell.showItemInFolder(sqlite_1.dbManager.getFilePath(fileId));
    });
    // This action only hides the record from OwlSift. It never removes the disk file.
    handleIndexOperation('files:delete', (_event, data) => sqlite_1.dbManager.removeFileRecord(data.fileId));
    handleIndexOperation('files:get-image-preview', (_event, fileId) => sqlite_1.dbManager.getImagePreview(fileId));
    handleIndexOperation('files:folders', () => sqlite_1.dbManager.listFolders());
    handleIndexOperation('files:search', (_event, query) => sqlite_1.dbManager.search(query));
    handleIndexOperation('files:search-documents', (_event, query) => sqlite_1.dbManager.search(query, 10000));
    handleIndexOperation('files:list-scan-drives', () => sqlite_1.dbManager.listScanDrives());
    handleIndexOperation('files:scan-os-documents', (_event, data) => sqlite_1.dbManager.scanOsDocuments(data.drivePath, data.extensions, data.folderPaths, data.resume, data.mode, data.additionalDrivePaths));
    handleIndexOperation('files:document-scan-status', () => sqlite_1.dbManager.documentScanStatus());
    handleIndexOperation('files:stop-document-scan', () => sqlite_1.dbManager.stopDocumentScan());
    handleIndexOperation('files:choose-scan-folders', async (_event, data) => {
        const [root] = await sqlite_1.dbManager.documentScanRoots(data.drivePath);
        const result = await electron_1.dialog.showOpenDialog(win, { defaultPath: root, properties: ['openDirectory', 'multiSelections'] });
        if (result.canceled || !result.filePaths.length)
            return null;
        return sqlite_1.dbManager.documentScanRoots(data.drivePath, result.filePaths);
    });
    handleIndexOperation('files:choose-and-index', async (_event, data = {}) => {
        const result = await electron_1.dialog.showOpenDialog(win, {
            properties: ['openDirectory']
        });
        if (result.canceled || !result.filePaths[0])
            return null;
        return sqlite_1.dbManager.indexFolder(result.filePaths[0], data.maxFiles);
    });
    handleIndexOperation('folders:index-drop', (_event, data) => {
        if (!Array.isArray(data?.paths))
            throw new Error('Invalid folder drop');
        return sqlite_1.dbManager.indexDroppedFolders(data.paths, data.maxFiles);
    });
    handleIndexOperation('folders:default-location', () => electron_1.app.getPath('desktop'));
    handleIndexOperation('folders:choose-parent', async () => {
        const result = await electron_1.dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: electron_1.app.getPath('desktop') });
        return result.canceled ? null : result.filePaths[0] ?? null;
    });
    handleIndexOperation('folders:create', (_event, data) => sqlite_1.dbManager.createWorkspaceFolder(data.parentPath, data.name));
    handleIndexOperation('files:transfer-workspace', (_event, data) => sqlite_1.dbManager.transferWorkspaceFiles(data));
    handleIndexOperation('files:import-drop', async (_event, data) => {
        if (!path_1.default.isAbsolute(data.filePath))
            throw new Error('Invalid file');
        if (data.folderPath)
            return sqlite_1.dbManager.importFileToWorkspace(data.filePath, data.folderPath, data.maxFiles);
        await sqlite_1.dbManager.indexImportedFile(data.filePath);
        return data.filePath;
    });
    handleIndexOperation('files:choose-and-index-file', async (_event, data = {}) => {
        const result = await electron_1.dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], defaultPath: data.folderPath });
        if (result.canceled || !result.filePaths.length)
            return null;
        let indexedCount = 0, skippedCount = 0;
        for (const source of result.filePaths) {
            try {
                if (data.folderPath)
                    await sqlite_1.dbManager.importFileToWorkspace(source, data.folderPath, data.maxFiles);
                else
                    await sqlite_1.dbManager.indexImportedFile(source);
                indexedCount++;
            }
            catch {
                skippedCount++;
            }
        }
        return { folderPath: data.folderPath ?? path_1.default.dirname(result.filePaths[0]), indexedCount, skippedCount, limit: data.maxFiles ?? 1000 };
    });
    handleIndexOperation('files:create-in-folder', (_event, data) => {
        return sqlite_1.dbManager.createFileInFolder(data.folderPath, data.fileName, data.content ?? '', data.bytes ? Buffer.from(data.bytes) : undefined);
    });
    handleIndexOperation('files:edit-content', (_event, data) => {
        sqlite_1.dbManager.editIndexedFile(data.fileId, data.content, Buffer.from(data.bytes), data.expectedMtime);
    });
    handleIndexOperation('files:get-bytes', async (_event, fileId) => {
        const bytes = await node_fs_1.default.promises.readFile(sqlite_1.dbManager.getFilePath(fileId));
        return Uint8Array.from(bytes).buffer;
    });
    handleIndexOperation('files:get-content', (_event, fileId) => sqlite_1.dbManager.getFileContent(fileId));
    handleIndexOperation('files:add-tag', (_event, data) => sqlite_1.dbManager.addFileTag(data.fileId, data.tag));
    handleIndexOperation('files:remove-tag', (_event, data) => sqlite_1.dbManager.removeFileTag(data.fileId, data.tag));
    handleIndexOperation('files:set-note', (_event, data) => sqlite_1.dbManager.setFileNote(data.fileId, data.note));
    handleIndexOperation('files:delete-from-disk', async (_event, data) => {
        const filePath = sqlite_1.dbManager.getFilePath(data.fileId);
        if (data.mode === 'permanent')
            node_fs_1.default.unlinkSync(filePath);
        else
            await electron_1.shell.trashItem(filePath);
        sqlite_1.dbManager.removeFileRecord(data.fileId);
    });
    handleIndexOperation('folders:remove-from-index', (_event, folderPath) => sqlite_1.dbManager.removeFolderFromIndex(folderPath));
    electron_1.ipcMain.on('app:minimize', () => {
        win?.minimize();
    });
    electron_1.ipcMain.on('app:maximize', () => {
        if (!win)
            return;
        win.isMaximized() ? win.unmaximize() : win.maximize();
    });
    electron_1.ipcMain.on('app:close', () => {
        win?.close();
    });
    createWindow();
});
electron_1.app.on('window-all-closed', () => {
    sqlite_1.dbManager.close();
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
