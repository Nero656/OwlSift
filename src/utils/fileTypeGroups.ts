export const scriptFileExtensions = new Set([
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx', 'vue', 'svelte', 'astro',
  'py', 'pyw', 'java', 'kt', 'kts', 'scala', 'groovy', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp',
  'cs', 'go', 'rs', 'rb', 'php', 'pl', 'pm', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'sql', 'r', 'swift', 'dart', 'lua', 'ex', 'exs', 'erl', 'hrl', 'hs', 'lhs', 'clj', 'cljs',
  'cljc', 'edn', 'elm', 'fs', 'fsx', 'f', 'f90', 'f95', 'm', 'mm', 't', 'vim',
  'yml', 'yaml', 'toml', 'xml', 'html', 'htm', 'css', 'scss', 'sass', 'less',
])

export const imageFileExtensions = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg', 'ico', 'tif', 'tiff',
  'heic', 'heif', 'psd', 'ai', 'eps', 'raw', 'cr2', 'nef', 'arw', 'dng', 'jfif', 'pjpeg', 'pjp',
])


export const documentScanGroups = {
  word: ['pdf', 'doc', 'docx', 'odt', 'rtf'],
  text: ['txt', 'md', 'markdown', 'log', 'html', 'htm', 'json', 'xml', 'yaml', 'yml'],
  sheets: ['csv', 'tsv', 'xls', 'xlsx', 'ods'],
  slides: ['ppt', 'pptx', 'odp'],
  code: [...scriptFileExtensions],
  images: [...imageFileExtensions],
} as const satisfies Record<string, readonly string[]>

export const baseDocumentScanExtensions = [...new Set<string>([
  ...documentScanGroups.word, ...documentScanGroups.text,
  ...documentScanGroups.sheets, ...documentScanGroups.slides,
])]
export const searchableFileExtensions = new Set<string>(Object.values(documentScanGroups).flat())
export const searchableTextExtensions = new Set<string>([
  ...scriptFileExtensions, ...documentScanGroups.text, 'csv', 'tsv',
])
