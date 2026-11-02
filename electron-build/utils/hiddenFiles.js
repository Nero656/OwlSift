"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFileVisibilityFilter = createFileVisibilityFilter;
exports.createAsyncFileVisibilityFilter = createAsyncFileVisibilityFilter;
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const fileVisibility_1 = require("./fileVisibility");
const hiddenEntriesScript = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $ErrorActionPreference = "Stop"; @([System.IO.Directory]::EnumerateFileSystemEntries($env:OWLSIFT_SCAN_PATH) | Where-Object { ([int][System.IO.File]::GetAttributes($_) -band 6) -ne 0 } | ForEach-Object { [System.IO.Path]::GetFileName($_) }) | ConvertTo-Json -Compress';
/** One native attribute lookup per directory, including Windows Hidden and System flags. */
function createFileVisibilityFilter() {
    const cache = new Map();
    const hiddenEntries = (directory) => {
        if (process.platform !== 'win32')
            return new Set();
        if (!cache.has(directory)) {
            const output = (0, node_child_process_1.execFileSync)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', hiddenEntriesScript], {
                encoding: 'utf8', windowsHide: true, timeout: 15000,
                env: { ...process.env, OWLSIFT_SCAN_PATH: directory },
            }).trim();
            const names = output ? JSON.parse(output) : [];
            cache.set(directory, new Set((Array.isArray(names) ? names : [names]).map(name => String(name).toLowerCase())));
        }
        return cache.get(directory);
    };
    const isHidden = (filePath) => {
        if ((0, fileVisibility_1.isHiddenPath)(filePath))
            return true;
        if (process.platform !== 'win32')
            return false;
        let current = node_path_1.default.resolve(filePath);
        while (node_path_1.default.dirname(current) !== current) {
            const parent = node_path_1.default.dirname(current);
            if (hiddenEntries(parent).has(node_path_1.default.basename(current).toLowerCase()))
                return true;
            current = parent;
        }
        return false;
    };
    return { isHidden };
}
/** One JSON-lines PowerShell worker per scan, shared by all directory checks. */
function createAsyncFileVisibilityFilter(signal) {
    const cache = new Map();
    let worker;
    let output = '', serial = 0, disposed = false;
    let failure;
    const pending = new Map();
    const fail = (error) => {
        failure ??= error;
        for (const item of pending.values()) {
            clearTimeout(item.timer);
            item.reject(error);
        }
        pending.clear();
        worker?.kill();
    };
    const dispose = () => {
        if (disposed)
            return;
        disposed = true;
        signal.removeEventListener('abort', abort);
        fail(new Error('Visibility worker stopped'));
    };
    const abort = () => { fail(signal.reason instanceof Error ? signal.reason : new Error('Scan aborted')); };
    signal.addEventListener('abort', abort, { once: true });
    const hiddenEntries = (directory) => {
        signal.throwIfAborted();
        if (failure)
            throw failure;
        if (!cache.has(directory)) {
            if (!worker) {
                const script = `
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'
while (($line = [Console]::ReadLine()) -ne $null) {
    $request = $null
    try {
        $request = $line | ConvertFrom-Json
        $names = @([System.IO.Directory]::EnumerateFileSystemEntries($request.path) | Where-Object { ([int][System.IO.File]::GetAttributes($_) -band 6) -ne 0 } | ForEach-Object { [System.IO.Path]::GetFileName($_) })
        [Console]::WriteLine((@{id=$request.id; names=$names} | ConvertTo-Json -Compress))
    } catch {
        [Console]::WriteLine((@{id=$request.id; error=$_.Exception.Message} | ConvertTo-Json -Compress))
    }
}`;
                worker = (0, node_child_process_1.spawn)('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
                worker.on('error', fail);
                worker.on('exit', () => { if (!disposed)
                    fail(new Error('Visibility worker exited')); });
                worker.stdin?.on('error', fail);
                worker.stderr?.on('data', () => { });
                worker.stdout?.setEncoding('utf8');
                worker.stdout?.on('data', (chunk) => {
                    output += chunk;
                    if (output.length > 16 * 1024 * 1024) {
                        fail(new Error('Visibility response is too large'));
                        return;
                    }
                    let newline;
                    while ((newline = output.indexOf('\n')) >= 0) {
                        const line = output.slice(0, newline).trim();
                        output = output.slice(newline + 1);
                        if (!line)
                            continue;
                        try {
                            const response = JSON.parse(line);
                            const item = pending.get(response.id);
                            if (!item)
                                continue;
                            clearTimeout(item.timer);
                            pending.delete(response.id);
                            if (response.error)
                                item.reject(new Error(response.error));
                            else
                                item.resolve(new Set((response.names ?? []).map(name => String(name).toLowerCase())));
                        }
                        catch {
                            fail(new Error('Invalid visibility response'));
                        }
                    }
                });
            }
            cache.set(directory, new Promise((resolve, reject) => {
                const id = ++serial;
                const timer = setTimeout(() => fail(new Error('Visibility check timed out')), 15000);
                pending.set(id, { resolve, reject, timer });
                worker.stdin.write(JSON.stringify({ id, path: directory }) + '\n');
            }));
        }
        return cache.get(directory);
    };
    const isHidden = async (filePath) => {
        signal.throwIfAborted();
        if ((0, fileVisibility_1.isHiddenPath)(filePath))
            return true;
        if (process.platform !== 'win32')
            return false;
        if (disposed)
            throw new Error('Visibility worker stopped');
        let current = node_path_1.default.resolve(filePath);
        while (node_path_1.default.dirname(current) !== current) {
            signal.throwIfAborted();
            const parent = node_path_1.default.dirname(current);
            if ((await hiddenEntries(parent)).has(node_path_1.default.basename(current).toLowerCase()))
                return true;
            current = parent;
        }
        return false;
    };
    return { isHidden, dispose, get failure() { return failure; } };
}
