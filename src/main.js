"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var electron_1 = require("electron");
var path_1 = require("path");
electron_1.app.commandLine.appendSwitch('ozone-platform', 'x11');
electron_1.app.commandLine.appendSwitch('no-sandbox');
electron_1.app.commandLine.appendSwitch('disable-gpu');
electron_1.app.commandLine.appendSwitch('disable-gpu-sandbox');
electron_1.app.commandLine.appendSwitch('disable-software-rasterizer');
electron_1.app.commandLine.appendSwitch('disable-dev-shm-usage');
electron_1.app.commandLine.appendSwitch('in-process-gpu');
var win = null;
function createWindow() {
    win = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.ts'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    win.loadURL('http://nuxt:3000');
}
electron_1.app.whenReady().then(function () {
    electron_1.ipcMain.handle('app:get-version', function () { return electron_1.app.getVersion(); });
    electron_1.ipcMain.on('app:minimize', function () {
        win === null || win === void 0 ? void 0 : win.minimize();
    });
    electron_1.ipcMain.on('app:maximize', function () {
        if (!win)
            return;
        win.isMaximized() ? win.unmaximize() : win.maximize();
    });
    electron_1.ipcMain.on('app:close', function () {
        win === null || win === void 0 ? void 0 : win.close();
    });
    createWindow();
});
electron_1.app.on('window-all-closed', function () {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
