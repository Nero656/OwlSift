const fs = require('node:fs');
const path = require('node:path');
const target = path.resolve(__dirname, '..', 'build-resources', 'localmind.db');
fs.mkdirSync(path.dirname(target), { recursive: true });
// This generated release seed must never contain the developer's index.
if (fs.existsSync(target)) fs.unlinkSync(target);
process.env.LOCALMIND_DATABASE_PATH = target;
require('./ensure-database.cjs');