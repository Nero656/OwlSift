"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFileVisibilityFilter = createFileVisibilityFilter;
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const fileVisibility_1 = require("./fileVisibility");
/** One native attribute lookup per directory, including Windows Hidden and System flags. */
function createFileVisibilityFilter() {
    const cache = new Map();
    const hiddenEntries = (directory) => {
        if (process.platform !== 'win32')
            return new Set();
        if (!cache.has(directory)) {
            const script = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $ErrorActionPreference = "Stop"; @([System.IO.Directory]::EnumerateFileSystemEntries($env:OWLSIFT_SCAN_PATH) | Where-Object { ([int][System.IO.File]::GetAttributes($_) -band 6) -ne 0 } | ForEach-Object { [System.IO.Path]::GetFileName($_) }) | ConvertTo-Json -Compress';
            const output = (0, node_child_process_1.execFileSync)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
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
