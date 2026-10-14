import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
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
    ipcMain.handle('files:open', async (_event, fileId: number) => {
        const error = await shell.openPath(dbManager.getFilePath(fileId));
        if (error) throw new Error(error);
    });
    ipcMain.handle('files:show-in-folder', (_event, fileId: number) => {
        shell.showItemInFolder(dbManager.getFilePath(fileId));
    });
    // This action only hides the record from LocalMind. It never removes the disk file.
    ipcMain.handle('files:delete', (_event, data: { fileId: number }) => dbManager.removeFileRecord(data.fileId));
    ipcMain.handle('files:get-image-preview', (_event, fileId: number) => dbManager.getImagePreview(fileId));
    ipcMain.handle('files:folders', () => dbManager.listFolders());
    ipcMain.handle('files:search', (_event, query: string) => dbManager.search(query));
    ipcMain.handle('files:choose-and-index', async (_event, data: { maxFiles?: number } = {}) => {
        const result = await dialog.showOpenDialog(win!, {
            properties: ['openDirectory']
        });
        if (result.canceled || !result.filePaths[0]) return null;
        return dbManager.indexFolder(result.filePaths[0], data.maxFiles);
    });
    ipcMain.handle('folders:remove-from-index', (_event, folderPath: string) => dbManager.removeFolderFromIndex(folderPath));

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
