const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');

async function main() {
  const parents = process.argv.slice(2);
  if (!parents.length) parents.push(os.tmpdir(), os.tmpdir());
  const perDrive = Number(process.env.OWLSIFT_BENCH_FILES || 2500);
  assert(Number.isSafeInteger(perDrive) && perDrive > 0);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'owlsift-bench-db-'));
  const drives = [];
  let db;
  try {
    const entry = path.resolve(__dirname, '../.electron-tsc/db/sqlite.js');
    const load = createRequire(entry);
    const exports = {};
    let checks = 0, reads = 0;
    const observedFs = { ...fs, promises: { ...fs.promises,
      access: async (...args) => { checks++; return fs.promises.access(...args); },
      open: async (...args) => { checks++; return fs.promises.open(...args); },
      readFile: async (...args) => { reads++; return fs.promises.readFile(...args); },
    } };
    vm.runInNewContext(fs.readFileSync(entry, 'utf8'), { exports, process, console, Buffer, AbortController,
      require: name => name === 'electron' ? { app: { isPackaged:false, getPath:() => scratch, getAppPath:() => scratch } }
        : name === 'node:fs' ? observedFs : load(name),
    }, { filename: entry });
    db = exports.dbManager;
    db.init();
    db.setSystemFileVisibility(true);
    for (const [drive, parent] of parents.entries()) {
      const root = fs.mkdtempSync(path.join(path.resolve(parent), 'owlsift-bench-files-'));
      drives.push(root);
      for (let file = 0; file < perDrive; file++) {
        const folder = path.join(root, String(Math.floor(file / 125)));
        if (file % 125 === 0) fs.mkdirSync(folder);
        const content = 'corpus commontext document benchmark '.repeat(64) +
          ' project' + drive + ' segment' + file + (file % 21 === 0 ? ' chromium needle' : '');
        fs.writeFileSync(path.join(folder, 'file-' + file + '.txt'), content);
      }
    }
    db.listScanDrives = () => drives.map(path => ({ path, label: path }));
    const timing = async fn => {
      checks = reads = 0;
      const lag = monitorEventLoopDelay({ resolution: 10 });
      lag.enable();
      const start = performance.now();
      const indexed = await fn();
      const ms = performance.now() - start;
      lag.disable();
      return { ms: Math.round(ms), filesPerSecond: Math.round(perDrive * drives.length * 1000 / ms),
        indexed, readabilityChecks: checks, contentReads: reads, mainLoopP99ms: +(lag.percentile(99) / 1e6).toFixed(1) };
    };
    const mode = process.env.OWLSIFT_BENCH_MODE || 'ssd';
    const scan = async () => {
      if (process.env.OWLSIFT_BENCH_MULTI === '1') {
        return (await db.scanOsDocuments(drives[0], ['txt'], undefined, false, mode, drives.slice(1))).indexedCount;
      }
      let total = 0;
      for (const drive of drives) total += (await db.scanOsDocuments(drive, ['txt'], undefined, false, mode)).indexedCount;
      return total;
    };
    const full = await timing(scan);
    assert.equal(full.indexed, perDrive * drives.length);
    for (const drive of drives) fs.appendFileSync(path.join(drive, '0', 'file-0.txt'), ' incremental marker');
    const incremental = await timing(scan);
    assert.equal(incremental.indexed, drives.length);
    const query = {};
    for (const term of ['incremental marker', 'needle', 'chromuim', 'commontext', 'notfoundxyz']) {
      const durations = [];
      let count;
      for (let i = 0; i < 8; i++) {
        const start = performance.now();
        count = db.search(term, 10000).length;
        durations.push(performance.now() - start);
      }
      durations.sort((a,b) => a-b);
      query[term] = { count, medianMs: +durations[4].toFixed(1) };
    }
    assert.equal(query['incremental marker'].count, drives.length);
    assert.equal(query.needle.count, query.chromuim.count);
    console.log(JSON.stringify({ logicalDrives: drives.length, devices: [...new Set(drives.map(root => fs.statSync(root).dev))].length,
      files: perDrive * drives.length, mode, full, incremental, query }, null, 2));
  } finally {
    db?.close();
    for (const directory of [...drives, scratch]) fs.rmSync(directory, { recursive:true, force:true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
