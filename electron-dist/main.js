"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
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
function createWindow() {
    win = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    win.loadURL('http://nuxt:3000');
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
    electron_1.ipcMain.handle('files:open', async (_event, fileId) => {
        const error = await electron_1.shell.openPath(sqlite_1.dbManager.getFilePath(fileId));
        if (error)
            throw new Error(error);
    });
    electron_1.ipcMain.handle('files:show-in-folder', (_event, fileId) => {
        electron_1.shell.showItemInFolder(sqlite_1.dbManager.getFilePath(fileId));
    });
    // This action only hides the record from LocalMind. It never removes the disk file.
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
