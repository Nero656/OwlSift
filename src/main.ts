import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'path';
import { dbManager } from './db/sqlite';

app.commandLine.appendSwitch('ozone-platform', 'x11');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('in-process-gpu');

let win: BrowserWindow | null = null;

function createWindow(): void {
    win = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    win.loadURL('http://nuxt:3000');
}

app.whenReady().then(() => {
    try {
        dbManager.init();
    } catch (error) {
        console.error('Failed to initialize SQLite:', error);
    }

    ipcMain.handle('app:get-version', (): string => app.getVersion());
    ipcMain.handle('db:get-status', () => dbManager.getStatus());
    ipcMain.handle('files:list', () => dbManager.listFiles());
    ipcMain.handle('files:add-tag', (_event, data: { fileId: number; tag: string }) =>
        dbManager.addFileTag(data.fileId, data.tag));
    ipcMain.handle('files:remove-tag', (_event, data: { fileId: number; tag: string }) =>
        dbManager.removeFileTag(data.fileId, data.tag));
    ipcMain.handle('files:set-note', (_event, data: { fileId: number; note: string }) =>
        dbManager.setFileNote(data.fileId, data.note));
    ipcMain.handle('files:open', async (_event, fileId: number) => {
        const filePath = dbManager.getFilePath(fileId);
        const error = await shell.openPath(filePath);
        if (error) throw new Error(error);
    });
    ipcMain.handle('files:show-in-folder', (_event, fileId: number) => {
        const filePath = dbManager.getFilePath(fileId);
        if (!fs.existsSync(filePath)) throw new Error('Indexed file does not exist on disk');
        shell.showItemInFolder(filePath);
    });
    ipcMain.handle('files:delete', async (_event, data: { fileId: number; mode: 'trash' | 'permanent' }) => {
        if (data.mode !== 'trash' && data.mode !== 'permanent') throw new Error('Invalid delete mode');
        const filePath = dbManager.getFilePath(data.fileId);
        if (fs.existsSync(filePath)) {
            if (!fs.statSync(filePath).isFile()) throw new Error('Indexed path is not a file');
            if (data.mode === 'trash') await shell.trashItem(filePath);
            else fs.unlinkSync(filePath);
        }
        dbManager.removeFileRecord(data.fileId);
    });
    ipcMain.handle('files:get-image-preview', (_event, fileId: number) => dbManager.getImagePreview(fileId));
    ipcMain.handle('files:folders', () => dbManager.listFolders());
    ipcMain.handle('files:search', (_event, query: string) => dbManager.search(query));
    ipcMain.handle('files:choose-and-index', async () => {
        const result = await dialog.showOpenDialog(win!, {
            properties: ['openDirectory']
        });
        if (result.canceled || !result.filePaths[0]) return null;
        return dbManager.indexFolder(result.filePaths[0]);
    });

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
