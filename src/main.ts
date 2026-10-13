import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { createServer, type Server } from 'node:http';
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
let rendererServer: Server | null = null;

const rendererMimeTypes: Record<string, string> = {
    '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm',
};

function servePackagedRenderer(): Promise<string> {
    const rendererRoot = path.join(process.resourcesPath, 'app');
    rendererServer = createServer((request, response) => {
        let requestPath: string;
        try {
            requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
        } catch {
            response.writeHead(400).end();
            return;
        }

        const filePath = path.resolve(rendererRoot, `.${requestPath}`);
        if (filePath !== rendererRoot && !filePath.startsWith(`${rendererRoot}${path.sep}`)) {
            response.writeHead(403).end();
            return;
        }

        let resolvedPath = filePath;
        try {
            if (fs.statSync(resolvedPath).isDirectory()) resolvedPath = path.join(resolvedPath, 'index.html');
            if (!fs.statSync(resolvedPath).isFile()) throw new Error('Not a file');
        } catch {
            if (path.extname(filePath)) {
                response.writeHead(404).end();
                return;
            }
            resolvedPath = path.join(rendererRoot, 'index.html');
        }

        response.writeHead(200, {
            'Content-Type': rendererMimeTypes[path.extname(resolvedPath).toLowerCase()] ?? 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff',
        });
        fs.createReadStream(resolvedPath).on('error', () => response.destroy()).pipe(response);
    });

    return new Promise((resolve, reject) => {
        rendererServer!.once('error', reject);
        rendererServer!.listen(0, '127.0.0.1', () => {
            const address = rendererServer!.address();
            if (!address || typeof address === 'string') {
                reject(new Error('Could not start the packaged renderer server'));
                return;
            }
            resolve(`http://127.0.0.1:${address.port}`);
        });
    });
}

async function createWindow(): Promise<void> {
    win = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    const rendererUrl = app.isPackaged
        ? await servePackagedRenderer()
        : process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:3000';
    await win.loadURL(rendererUrl);
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
    // Removing an item from the app only hides its database record; it never touches the source file.
    ipcMain.handle('files:delete', (_event, data: { fileId: number }) => dbManager.removeFileRecord(data.fileId));
    ipcMain.handle('files:delete-from-disk', async (_event, data: { fileId: number; mode: 'trash' | 'permanent' }) => {
        const filePath = dbManager.getFilePath(data.fileId);
        if (data.mode === 'trash') {
            await shell.trashItem(filePath);
        } else if (data.mode === 'permanent') {
            await fs.promises.unlink(filePath);
        } else {
            throw new Error('Invalid file deletion mode');
        }
        dbManager.removeFileRecord(data.fileId);
    });
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

    void createWindow().catch(error => console.error('Could not open LocalMind window:', error));
});

app.on('before-quit', () => rendererServer?.close());

app.on('window-all-closed', (): void => {
    dbManager.close();
    if (process.platform !== 'darwin') app.quit();
});
