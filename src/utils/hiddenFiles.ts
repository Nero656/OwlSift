import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isHiddenPath } from './fileVisibility';

/** One native attribute lookup per directory, including Windows Hidden and System flags. */
export function createFileVisibilityFilter() {
    const cache = new Map<string, Set<string>>();
    const hiddenEntries = (directory: string): Set<string> => {
        if (process.platform !== 'win32') return new Set();
        if (!cache.has(directory)) {
            const script = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $ErrorActionPreference = "Stop"; @([System.IO.Directory]::EnumerateFileSystemEntries($env:OWLSIFT_SCAN_PATH) | Where-Object { ([int][System.IO.File]::GetAttributes($_) -band 6) -ne 0 } | ForEach-Object { [System.IO.Path]::GetFileName($_) }) | ConvertTo-Json -Compress';
            const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
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
