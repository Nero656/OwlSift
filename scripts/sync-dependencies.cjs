const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function syncDependencies(mode = 'nuxt', cwd = process.cwd(), run = spawnSync) {
  const manifest = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  const lock = path.join(cwd, 'package-lock.json');
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(path.join(cwd, 'package.json')));
  if (fs.existsSync(lock)) hash.update(fs.readFileSync(lock));
  hash.update([mode, process.platform, process.arch, process.versions.node].join(':'));
  const fingerprint = hash.digest('hex');
  const stamp = path.join(cwd, 'node_modules', '.localmind-dependencies-' + mode);
  const complete = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).every(name =>
    fs.existsSync(path.join(cwd, 'node_modules', name, 'package.json')));
  if (complete && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === fingerprint) return false;

  console.log('Synchronizing ' + mode + ' dependencies with package.json and package-lock.json...');
  const args = [fs.existsSync(lock) ? 'ci' : 'install', '--include=dev', '--no-audit', '--no-fund'];
  // The web service does not use Electron or native SQLite. Their install scripts
  // require a different runtime and are handled by the Electron service.
  if (mode === 'nuxt') args.push('--ignore-scripts');
  const result = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd, stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Dependency installation failed: ' + result.status);
  fs.mkdirSync(path.dirname(stamp), { recursive: true });
  fs.writeFileSync(stamp, fingerprint);
  return true;
}
module.exports = { syncDependencies };
if (require.main === module) {
  try { syncDependencies(process.argv[2] || 'nuxt'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
