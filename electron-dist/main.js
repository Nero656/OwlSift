"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
    electron_1.ipcMain.handle('files:set-system-visibility', (_event, include) => sqlite_1.dbManager.setSystemFileVisibility(include));
    electron_1.ipcMain.handle('files:list', () => sqlite_1.dbManager.listFiles());
    electron_1.ipcMain.handle('files:open', async (_event, fileId) => {
        const error = await electron_1.shell.openPath(sqlite_1.dbManager.getFilePath(fileId));
        if (error)
            throw new Error(error);
    });
    electron_1.ipcMain.handle('files:show-in-folder', (_event, fileId) => {
        electron_1.shell.showItemInFolder(sqlite_1.dbManager.getFilePath(fileId));
    });
    // This action only hides the record from OwlSift. It never removes the disk file.
    electron_1.ipcMain.handle('files:delete', (_event, data) => sqlite_1.dbManager.removeFileRecord(data.fileId));
    electron_1.ipcMain.handle('files:get-image-preview', (_event, fileId) => sqlite_1.dbManager.getImagePreview(fileId));
    electron_1.ipcMain.handle('files:folders', () => sqlite_1.dbManager.listFolders());
    electron_1.ipcMain.handle('files:search', (_event, query) => sqlite_1.dbManager.search(query));
    electron_1.ipcMain.handle('files:choose-and-index', async (_event, data = {}) => {
        const result = await electron_1.dialog.showOpenDialog(win, {
            properties: ['openDirectory']
        });
        if (result.canceled || !result.filePaths[0])
            return null;
        return sqlite_1.dbManager.indexFolder(result.filePaths[0], data.maxFiles);
    });
    electron_1.ipcMain.handle('files:import-drop', (_event, data) => {
        if (!path_1.default.isAbsolute(data.filePath) || !node_fs_1.default.statSync(data.filePath).isFile())
            throw new Error('Invalid file');
        if (!sqlite_1.dbManager.isFileVisible(data.filePath))
            throw new Error('System and hidden files are excluded by the current settings');
        let target = data.filePath;
        if (data.folderPath) {
            const folder = sqlite_1.dbManager.listFolders().find(folder => folder.path === data.folderPath);
            if (!folder || !node_fs_1.default.statSync(folder.path).isDirectory())
                throw new Error('Folder not found');
            const limit = Math.max(1, Math.min(5000, Number(data.maxFiles) || 1000));
            if (folder.count >= limit)
                throw new Error('Folder limit reached');
            target = path_1.default.join(folder.path, path_1.default.basename(data.filePath));
            if (path_1.default.resolve(target) !== path_1.default.resolve(data.filePath)) {
                const ext = path_1.default.extname(target), base = path_1.default.basename(target, ext);
                let suffix = 1;
                while (node_fs_1.default.existsSync(target))
                    target = path_1.default.join(folder.path, base + ' (' + suffix++ + ')' + ext);
                node_fs_1.default.copyFileSync(data.filePath, target, node_fs_1.default.constants.COPYFILE_EXCL);
            }
        }
        sqlite_1.dbManager.indexSingleFile(target, data.folderPath);
        return target;
    });
    electron_1.ipcMain.handle('files:choose-and-index-file', async (_event, data = {}) => {
        const result = await electron_1.dialog.showOpenDialog(win, {
            properties: ['openFile'],
            defaultPath: data.folderPath,
        });
        if (result.canceled || !result.filePaths[0])
            return null;
        return sqlite_1.dbManager.indexSingleFile(result.filePaths[0], data.folderPath);
    });
    electron_1.ipcMain.handle('files:create-in-folder', (_event, data) => {
        return sqlite_1.dbManager.createFileInFolder(data.folderPath, data.fileName, data.content ?? '', data.bytes ? Buffer.from(data.bytes) : undefined);
    });
    electron_1.ipcMain.handle('files:edit-content', (_event, data) => {
        sqlite_1.dbManager.editIndexedFile(data.fileId, data.content, Buffer.from(data.bytes), data.expectedMtime);
    });
    electron_1.ipcMain.handle('files:get-bytes', (_event, fileId) => Array.from(node_fs_1.default.readFileSync(sqlite_1.dbManager.getFilePath(fileId))));
    electron_1.ipcMain.handle('files:get-content', (_event, fileId) => sqlite_1.dbManager.getFileContent(fileId));
    electron_1.ipcMain.handle('files:add-tag', (_event, data) => sqlite_1.dbManager.addFileTag(data.fileId, data.tag));
    electron_1.ipcMain.handle('files:remove-tag', (_event, data) => sqlite_1.dbManager.removeFileTag(data.fileId, data.tag));
    electron_1.ipcMain.handle('files:set-note', (_event, data) => sqlite_1.dbManager.setFileNote(data.fileId, data.note));
    electron_1.ipcMain.handle('files:delete-from-disk', async (_event, data) => {
        const filePath = sqlite_1.dbManager.getFilePath(data.fileId);
        if (data.mode === 'permanent')
            node_fs_1.default.unlinkSync(filePath);
        else
            await electron_1.shell.trashItem(filePath);
        sqlite_1.dbManager.removeFileRecord(data.fileId);
    });
    electron_1.ipcMain.handle('folders:remove-from-index', (_event, folderPath) => sqlite_1.dbManager.removeFolderFromIndex(folderPath));
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
