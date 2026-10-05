import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';

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
            preload: path.join(__dirname, 'preload.ts'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    win.loadURL('http://nuxt:3000');
}

app.whenReady().then(() => {
    ipcMain.handle('app:get-version', (): string => app.getVersion());

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
    if (process.platform !== 'darwin') app.quit();
});