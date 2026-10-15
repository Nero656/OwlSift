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
}

let win: BrowserWindow | null = null;

function createWindow(): void {
    win = new BrowserWindow({
        show: !app.commandLine.hasSwitch('smoke-test'),
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
            lmServer: 'https://lmstudio.ai/docs/developer/core/server/settings',
            lmCompat: 'https://lmstudio.ai/docs/developer/openai-compat',
            openaiStart: 'https://developers.openai.com/api/docs/quickstart',
            openaiKeys: 'https://platform.openai.com/api-keys',
            openaiErrors: 'https://developers.openai.com/api/docs/guides/error-codes',
        };
        if (!Object.hasOwn(docs, id)) throw new Error('Unknown documentation link');
        return shell.openExternal(docs[id]);
    });
    ipcMain.handle('app:open-donation', () => shell.openExternal('https://www.donationalerts.com/r/nero_656'));
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
    ipcMain.handle('files:import-drop', (_event, data: { filePath: string; folderPath?: string; maxFiles: number }) => {
        if (!path.isAbsolute(data.filePath) || !fs.statSync(data.filePath).isFile()) throw new Error('Invalid file');
        let target = data.filePath;
        if (data.folderPath) {
            const folder = dbManager.listFolders().find(folder => folder.path === data.folderPath);
            if (!folder || !fs.statSync(folder.path).isDirectory()) throw new Error('Folder not found');
            const limit = Math.max(1, Math.min(5000, Number(data.maxFiles) || 1000));
            if (folder.count >= limit) throw new Error('Folder limit reached');
            target = path.join(folder.path, path.basename(data.filePath));
            if (path.resolve(target) !== path.resolve(data.filePath)) {
                const ext = path.extname(target), base = path.basename(target, ext);
                let suffix = 1;
                while (fs.existsSync(target)) target = path.join(folder.path, base + ' (' + suffix++ + ')' + ext);
                fs.copyFileSync(data.filePath, target, fs.constants.COPYFILE_EXCL);
            }
        }
        dbManager.indexSingleFile(target, data.folderPath);
        return target;
    });
    ipcMain.handle('files:choose-and-index-file', async (_event, data: { folderPath?: string } = {}) => {
        const result = await dialog.showOpenDialog(win!, {
            properties: ['openFile'],
            defaultPath: data.folderPath,
        });
        if (result.canceled || !result.filePaths[0]) return null;
        return dbManager.indexSingleFile(result.filePaths[0], data.folderPath);
    });
    ipcMain.handle('files:create-in-folder', (_event, data: { folderPath: string; fileName: string; content: string; bytes?: number[] }) => {
        return dbManager.createFileInFolder(data.folderPath, data.fileName, data.content ?? '', data.bytes ? Buffer.from(data.bytes) : undefined);
    });
    ipcMain.handle('files:get-bytes', (_event, fileId: number) => Array.from(fs.readFileSync(dbManager.getFilePath(fileId))));
    ipcMain.handle('files:get-content', (_event, fileId: number) => dbManager.getFileContent(fileId));
    ipcMain.handle('files:add-tag', (_event, data: { fileId: number; tag: string }) => dbManager.addFileTag(data.fileId, data.tag));
    ipcMain.handle('files:remove-tag', (_event, data: { fileId: number; tag: string }) => dbManager.removeFileTag(data.fileId, data.tag));
    ipcMain.handle('files:set-note', (_event, data: { fileId: number; note: string }) => dbManager.setFileNote(data.fileId, data.note));
    ipcMain.handle('files:delete-from-disk', async (_event, data: { fileId: number; mode: 'trash' | 'permanent' }) => {
        const filePath = dbManager.getFilePath(data.fileId);
        if (data.mode === 'permanent') fs.unlinkSync(filePath);
        else await shell.trashItem(filePath);
        dbManager.removeFileRecord(data.fileId);
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
