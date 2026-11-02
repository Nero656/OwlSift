const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, '.output', 'public', 'licenses');
fs.mkdirSync(target, { recursive: true });
fs.copyFileSync(path.join(root, 'app', 'assets', 'fonts', 'LICENSE-DejaVu.txt'), path.join(target, 'DejaVu.txt'));
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(target, 'OwlSift.txt'));