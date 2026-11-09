"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchableTextExtensions = exports.searchableFileExtensions = exports.baseDocumentScanExtensions = exports.documentScanGroups = exports.imageFileExtensions = exports.scriptFileExtensions = void 0;
exports.scriptFileExtensions = new Set([
    'js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx', 'vue', 'svelte', 'astro',
    'py', 'pyw', 'java', 'kt', 'kts', 'scala', 'groovy', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp',
    'cs', 'go', 'rs', 'rb', 'php', 'pl', 'pm', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
    'sql', 'r', 'swift', 'dart', 'lua', 'ex', 'exs', 'erl', 'hrl', 'hs', 'lhs', 'clj', 'cljs',
    'cljc', 'edn', 'elm', 'fs', 'fsx', 'f', 'f90', 'f95', 'm', 'mm', 't', 'vim',
    'yml', 'yaml', 'toml', 'xml', 'html', 'htm', 'css', 'scss', 'sass', 'less',
]);
exports.imageFileExtensions = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg', 'ico', 'tif', 'tiff',
    'heic', 'heif', 'psd', 'ai', 'eps', 'raw', 'cr2', 'nef', 'arw', 'dng', 'jfif', 'pjpeg', 'pjp',
]);
exports.documentScanGroups = {
    word: ['pdf', 'doc', 'docx', 'odt', 'rtf'],
    text: ['txt', 'md', 'markdown', 'log', 'html', 'htm', 'json', 'xml', 'yaml', 'yml'],
    sheets: ['csv', 'tsv', 'xls', 'xlsx', 'ods'],
    slides: ['ppt', 'pptx', 'odp'],
    code: [...exports.scriptFileExtensions],
    images: [...exports.imageFileExtensions],
};
exports.baseDocumentScanExtensions = [...new Set([
        ...exports.documentScanGroups.word, ...exports.documentScanGroups.text,
        ...exports.documentScanGroups.sheets, ...exports.documentScanGroups.slides,
    ])];
exports.searchableFileExtensions = new Set(Object.values(exports.documentScanGroups).flat());
exports.searchableTextExtensions = new Set([
    ...exports.scriptFileExtensions, ...exports.documentScanGroups.text, 'csv', 'tsv',
]);
