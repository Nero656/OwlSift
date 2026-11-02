import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { isHiddenPath } from './fileVisibility';

const hiddenEntriesScript = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $ErrorActionPreference = "Stop"; @([System.IO.Directory]::EnumerateFileSystemEntries($env:OWLSIFT_SCAN_PATH) | Where-Object { ([int][System.IO.File]::GetAttributes($_) -band 6) -ne 0 } | ForEach-Object { [System.IO.Path]::GetFileName($_) }) | ConvertTo-Json -Compress';

/** One native attribute lookup per directory, including Windows Hidden and System flags. */
export function createFileVisibilityFilter() {
    const cache = new Map<string, Set<string>>();
    const hiddenEntries = (directory: string): Set<string> => {
        if (process.platform !== 'win32') return new Set();
        if (!cache.has(directory)) {

            const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', hiddenEntriesScript], {
                encoding: 'utf8', windowsHide: true, timeout: 15000,
                env: { ...process.env, OWLSIFT_SCAN_PATH: directory },
            }).trim();
            const names: unknown = output ? JSON.parse(output) : [];
            cache.set(directory, new Set((Array.isArray(names) ? names : [names]).map(name => String(name).toLowerCase())));
        }
        return cache.get(directory)!;
    };
    const isHidden = (filePath: string): boolean => {
        if (isHiddenPath(filePath)) return true;
        if (process.platform !== 'win32') return false;
        let current = path.resolve(filePath);
        while (path.dirname(current) !== current) {
            const parent = path.dirname(current);
            if (hiddenEntries(parent).has(path.basename(current).toLowerCase())) return true;
            current = parent;
        }
        return false;
    };
    return { isHidden };
}

/** One JSON-lines PowerShell worker per scan, shared by all directory checks. */
export function createAsyncFileVisibilityFilter(signal: AbortSignal) {
    const cache = new Map<string, Promise<Set<string>>>();
    let worker: ReturnType<typeof spawn> | undefined;
    let output = '', serial = 0, disposed = false;
    let failure: Error | undefined;
    const pending = new Map<number, {resolve: (names: Set<string>) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>}>();
    const fail = (error: Error) => {
        failure ??= error;
        for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); }
        pending.clear();
        worker?.kill();
    };
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        signal.removeEventListener('abort', abort);
        fail(new Error('Visibility worker stopped'));
    };
    const abort = () => { fail(signal.reason instanceof Error ? signal.reason : new Error('Scan aborted')); };
    signal.addEventListener('abort', abort, {once:true});
    const hiddenEntries = (directory: string): Promise<Set<string>> => {
        signal.throwIfAborted();
        if (failure) throw failure;
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
                worker = spawn('powershell.exe', ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')], {windowsHide:true,stdio:['pipe','pipe','pipe']});
                worker.on('error', fail);
                worker.on('exit', () => { if (!disposed) fail(new Error('Visibility worker exited')); });
                worker.stdin?.on('error', fail);
                worker.stderr?.on('data', () => { /* Drain diagnostics without retaining file paths. */ });
                worker.stdout?.setEncoding('utf8');
                worker.stdout?.on('data', (chunk: string) => {
                    output += chunk;
                    if (output.length > 16*1024*1024) { fail(new Error('Visibility response is too large')); return; }
                    let newline: number;
                    while ((newline = output.indexOf('\n')) >= 0) {
                        const line = output.slice(0,newline).trim(); output = output.slice(newline+1);
                        if (!line) continue;
                        try {
                            const response = JSON.parse(line) as {id:number; names?:string[]; error?:string};
                            const item = pending.get(response.id);
                            if (!item) continue;
                            clearTimeout(item.timer); pending.delete(response.id);
                            if (response.error) item.reject(new Error(response.error));
                            else item.resolve(new Set((response.names ?? []).map(name => String(name).toLowerCase())));
                        } catch { fail(new Error('Invalid visibility response')); }
                    }
                });
            }
            cache.set(directory, new Promise((resolve,reject) => {
                const id = ++serial;
                const timer = setTimeout(() => fail(new Error('Visibility check timed out')), 15000);
                pending.set(id,{resolve,reject,timer});
                worker!.stdin!.write(JSON.stringify({id,path:directory})+'\n');
            }));
        }
        return cache.get(directory)!;
    };
    const isHidden = async (filePath: string): Promise<boolean> => {
        signal.throwIfAborted();
        if (isHiddenPath(filePath)) return true;
        if (process.platform !== 'win32') return false;
        if (disposed) throw new Error('Visibility worker stopped');
        let current = path.resolve(filePath);
        while (path.dirname(current) !== current) {
            signal.throwIfAborted();
            const parent = path.dirname(current);
            if ((await hiddenEntries(parent)).has(path.basename(current).toLowerCase())) return true;
            current = parent;
        }
        return false;
    };
    return {isHidden,dispose,get failure() { return failure; }};
}
