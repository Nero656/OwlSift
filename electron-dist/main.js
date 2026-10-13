"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_http_1 = require("node:http");
const node_fs_1 = __importDefault(require("node:fs"));
const path_1 = __importDefault(require("path"));
const sqlite_1 = require("./db/sqlite");
electron_1.app.commandLine.appendSwitch('ozone-platform', 'x11');
electron_1.app.commandLine.appendSwitch('no-sandbox');
electron_1.app.commandLine.appendSwitch('disable-gpu');
electron_1.app.commandLine.appendSwitch('disable-gpu-sandbox');
electron_1.app.commandLine.appendSwitch('disable-software-rasterizer');
electron_1.app.commandLine.appendSwitch('disable-dev-shm-usage');
electron_1.app.commandLine.appendSwitch('in-process-gpu');
let win = null;
let rendererServer = null;
const rendererMimeTypes = {
    '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm',
};
function servePackagedRenderer() {
    const rendererRoot = path_1.default.join(process.resourcesPath, 'app');
    rendererServer = (0, node_http_1.createServer)((request, response) => {
        let requestPath;
        try {
            requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
        }
        catch {
            response.writeHead(400).end();
            return;
        }
        const filePath = path_1.default.resolve(rendererRoot, `.${requestPath}`);
        if (filePath !== rendererRoot && !filePath.startsWith(`${rendererRoot}${path_1.default.sep}`)) {
            response.writeHead(403).end();
            return;
        }
        let resolvedPath = filePath;
        try {
            if (node_fs_1.default.statSync(resolvedPath).isDirectory())
                resolvedPath = path_1.default.join(resolvedPath, 'index.html');
            if (!node_fs_1.default.statSync(resolvedPath).isFile())
                throw new Error('Not a file');
        }
        catch {
            if (path_1.default.extname(filePath)) {
                response.writeHead(404).end();
                return;
            }
            resolvedPath = path_1.default.join(rendererRoot, 'index.html');
        }
        response.writeHead(200, {
            'Content-Type': rendererMimeTypes[path_1.default.extname(resolvedPath).toLowerCase()] ?? 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff',
        });
        node_fs_1.default.createReadStream(resolvedPath).on('error', () => response.destroy()).pipe(response);
    });
    return new Promise((resolve, reject) => {
        rendererServer.once('error', reject);
        rendererServer.listen(0, '127.0.0.1', () => {
            const address = rendererServer.address();
            if (!address || typeof address === 'string') {
                reject(new Error('Could not start the packaged renderer server'));
                return;
            }
            resolve(`http://127.0.0.1:${address.port}`);
        });
    });
}
async function createWindow() {
    win = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    const rendererUrl = electron_1.app.isPackaged
        ? await servePackagedRenderer()
        : process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:3000';
    await win.loadURL(rendererUrl);
}
electron_1.app.whenReady().then(() => {
    try {
        sqlite_1.dbManager.init();
    }
    catch (error) {
        console.error('Failed to initialize SQLite:', error);
    }
    electron_1.ipcMain.handle('app:get-version', () => electron_1.app.getVersion());
    electron_1.ipcMain.handle('db:get-status', () => sqlite_1.dbManager.getStatus());
    electron_1.ipcMain.handle('files:list', () => sqlite_1.dbManager.listFiles());
    electron_1.ipcMain.handle('files:add-tag', (_event, data) => sqlite_1.dbManager.addFileTag(data.fileId, data.tag));
    electron_1.ipcMain.handle('files:remove-tag', (_event, data) => sqlite_1.dbManager.removeFileTag(data.fileId, data.tag));
    electron_1.ipcMain.handle('files:set-note', (_event, data) => sqlite_1.dbManager.setFileNote(data.fileId, data.note));
    electron_1.ipcMain.handle('files:open', async (_event, fileId) => {
        const filePath = sqlite_1.dbManager.getFilePath(fileId);
        const error = await electron_1.shell.openPath(filePath);
        if (error)
            throw new Error(error);
    });
    electron_1.ipcMain.handle('files:show-in-folder', (_event, fileId) => {
        const filePath = sqlite_1.dbManager.getFilePath(fileId);
        if (!node_fs_1.default.existsSync(filePath))
            throw new Error('Indexed file does not exist on disk');
        electron_1.shell.showItemInFolder(filePath);
    });
    electron_1.ipcMain.handle('files:delete', async (_event, data) => {
        if (data.mode !== 'trash' && data.mode !== 'permanent')
            throw new Error('Invalid delete mode');
        const filePath = sqlite_1.dbManager.getFilePath(data.fileId);
        if (node_fs_1.default.existsSync(filePath)) {
            if (!node_fs_1.default.statSync(filePath).isFile())
                throw new Error('Indexed path is not a file');
            if (data.mode === 'trash')
                await electron_1.shell.trashItem(filePath);
            else
                node_fs_1.default.unlinkSync(filePath);
        }
        sqlite_1.dbManager.removeFileRecord(data.fileId);
    });
    electron_1.ipcMain.handle('files:get-image-preview', (_event, fileId) => sqlite_1.dbManager.getImagePreview(fileId));
    electron_1.ipcMain.handle('files:folders', () => sqlite_1.dbManager.listFolders());
    electron_1.ipcMain.handle('files:search', (_event, query) => sqlite_1.dbManager.search(query));
    electron_1.ipcMain.handle('files:choose-and-index', async () => {
        const result = await electron_1.dialog.showOpenDialog(win, {
            properties: ['openDirectory']
        });
        if (result.canceled || !result.filePaths[0])
            return null;
        return sqlite_1.dbManager.indexFolder(result.filePaths[0]);
    });
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
    void createWindow().catch(error => console.error('Could not open LocalMind window:', error));
});
electron_1.app.on('before-quit', () => rendererServer?.close());
electron_1.app.on('window-all-closed', () => {
    sqlite_1.dbManager.close();
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
