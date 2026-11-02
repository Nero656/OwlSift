const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const { createRequire } = require('node:module')

function loadDatabase(scratch, observe = {}) {
  const filename = path.resolve(__dirname, '../.electron-tsc/db/sqlite.js')
  const localRequire = createRequire(filename)
  const nativeFs = { ...fs, promises: {
    ...fs.promises,
    opendir: async (...args) => { observe.opened?.push(args[0]); return fs.promises.opendir(...args) },
    readFile: async (...args) => { observe.read?.(args[0]); return fs.promises.readFile(...args) },
  } }
  const exports = {}
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    exports, console, process, Buffer, AbortController, setImmediate,
    require: name => name === 'electron'
      ? { app: { isPackaged: false, getPath: () => scratch, getAppPath: () => path.join(scratch, 'no-seed') } }
            : name === 'node:fs' ? nativeFs
        : name === 'better-sqlite3' && observe.sql ? function Database(file) {
          return new (localRequire(name))(file, { verbose: statement => observe.sql.push(statement) })
        } : localRequire(name),
  }, { filename })
  const manager = exports.dbManager
  manager.init()
  manager.setSystemFileVisibility(true)
  manager.listScanDrives = () => [{ path: path.join(scratch, 'drive'), label: 'test' }]
  return manager
}
function fixture(count = 250) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'owlsift-scan-'))
  const drive = path.join(scratch, 'drive'), first = path.join(drive, 'A'), second = path.join(drive, 'B')
  fs.mkdirSync(first, { recursive: true }); fs.mkdirSync(second)
  for (let i = 0; i < 3; i++) fs.writeFileSync(path.join(first, i + '.txt'), 'first ' + i)
  for (let i = 0; i < count; i++) fs.writeFileSync(path.join(second, i + '.txt'), 'second ' + i)
  return { scratch, drive, first, second, total: count + 3 }
}

test('metadata batches survive stop and database reopen; completed directories are not revisited', async () => {
  const f = fixture()
  let db, reads = 0
  const opened = [], batches = []
  db = loadDatabase(f.scratch, { opened, read: () => {
    reads++
    assert.equal(db.getStatus().fileCount, f.total, 'all metadata must be visible before reading content')
    assert.equal(db.documentScanStatus().phase, 'content')
  } })
  try {
    const save = db.saveFiles.bind(db)
    db.saveFiles = files => { batches.push(files.length); save(files); if (batches.length === 2) db.stopDocumentScan() }
    const paused = await db.scanOsDocuments(f.drive, ['txt'], [f.first, f.second])
    assert.equal(paused.cancelled, true); assert.equal(paused.indexedCount, 103)
    assert.equal(reads, 0); assert.equal(db.getStatus().fileCount, 103)
    assert.equal(db.documentScanStatus().resumable, true)
    db.close()
    opened.length = 0
    db = loadDatabase(f.scratch, { opened, read: () => { reads++; assert.equal(db.getStatus().fileCount, f.total) } })
    assert.equal(db.documentScanStatus().running, false)
    const resumed = await db.scanOsDocuments(f.drive, ['txt'], [f.first, f.second], true)
    assert.equal(resumed.cancelled, false); assert.equal(resumed.indexedCount, f.total)
    assert(!opened.includes(f.first), 'completed directory must not be reopened')
    assert.equal(db.getStatus().fileCount, f.total)
    assert.equal(reads, f.total)
    assert(batches.every(size => size <= 100))
    assert.equal(db.documentScanStatus().resumable, false)
    assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM files WHERE content = ?').get('').n, 0)
    assert.equal((await db.scanOsDocuments(f.drive, ['txt'], [f.first, f.second])).indexedCount, 0)
    assert.equal(reads, f.total, 'unchanged contents must not be read again')
  } finally { db.close() }
})

test('starting a fresh scan retains content work for unchanged metadata from an interrupted scan', async () => {
  const f = fixture(120), db = loadDatabase(f.scratch)
  try {
    const save = db.saveFiles.bind(db)
    db.saveFiles = files => { save(files); db.stopDocumentScan() }
    await db.scanOsDocuments(f.drive, ['txt'], [f.first])
    assert.equal(db.getStatus().fileCount, 3)
    db.saveFiles = save
    await db.scanOsDocuments(f.drive, ['txt'], [f.second])
    assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM document_scan_pending_content').get().n, 3)
    const result = await db.scanOsDocuments(f.drive, ['txt'], [f.first])
    assert.equal(result.indexedCount, 0)
    assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM files WHERE content = ?').get('').n, 0)
    assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM document_scan_pending_content').get().n, 0)
  } finally { db.close() }
})

test('content-stage cancellation resumes without rereading committed content batches', async () => {
  const f = fixture(250)
  let db, readCount = 0
  const readPaths = []
  db = loadDatabase(f.scratch, { read: file => {
    readCount++; readPaths.push(file)
    if (readCount === 101) db.stopDocumentScan()
  } })
  try {
    const result = await db.scanOsDocuments(f.drive, ['txt'], [f.first, f.second])
    assert.equal(result.cancelled, true)
    assert.equal(db.documentScanStatus().phase, 'content')
    assert.equal(db.documentScanStatus().contentCount, 100)
    const committed = new Set(readPaths.slice(0, 100))
    db.close()
    db = loadDatabase(f.scratch, { read: file => assert(!committed.has(file)) })
    await db.scanOsDocuments(f.drive, ['txt'], [f.first, f.second], true)
    assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM files WHERE content = ?').get('').n, 0)
  } finally { db.close() }
})

test('concurrent requests, empty scopes and out-of-drive folders do not discard the checkpoint', async () => {
  const f = fixture(3), db = loadDatabase(f.scratch)
  try {
    const running = db.scanOsDocuments(f.drive, ['txt'], [f.first])
    await assert.rejects(db.scanOsDocuments(f.drive, ['txt'], [f.second]), /already running/)
    db.stopDocumentScan(); await running
    await assert.rejects(db.scanOsDocuments(f.drive, [], [f.first]), /extension/)
    await assert.rejects(db.scanOsDocuments(f.drive, ['txt'], []), /folder/)
    await assert.rejects(db.scanOsDocuments(f.drive, ['txt'], [f.scratch]), /selected drive/)
    assert(db.documentScanStatus().resumable)
    await db.scanOsDocuments(f.drive, ['txt'], [f.first], true)
    assert.equal(db.documentScanStatus().resumable, false)
  } finally { db.close() }
})


test('disk writes use bounded batches rather than one commit per file', async t => {
  const f = fixture(250), sql = [], db = loadDatabase(f.scratch, { sql })
  try {
    sql.length = 0
    await db.scanOsDocuments(f.drive, ['txt'], [f.first, f.second])
    const commits = sql.filter(statement => statement.trim().toUpperCase() === 'COMMIT').length
    assert(commits < 20, `unexpected transaction count: ${commits}`)
    t.diagnostic(`${f.total} files: ${commits} commits for metadata, contents and checkpoints`)
  } finally { db.close() }
})

test('a file changed during a paused directory scan receives its latest content on resume', async () => {
  const f = fixture(120), db = loadDatabase(f.scratch)
  try {
    const save = db.saveFiles.bind(db)
    db.saveFiles = files => { save(files); db.stopDocumentScan() }
    await db.scanOsDocuments(f.drive, ['txt'], [f.second])
    const changed = db.db.prepare('SELECT path FROM document_scan_queue WHERE kind=? LIMIT 1').get('content').path
    fs.writeFileSync(changed, 'changed after pause with a different size')
    db.saveFiles = save
    await db.scanOsDocuments(f.drive, ['txt'], [f.second], true)
    assert.equal(db.db.prepare('SELECT content FROM files WHERE path=?').get(changed).content, 'changed after pause with a different size')
  } finally { db.close() }
})


test('visibility checks share one worker and cancellation rejects in-flight requests', async () => {
  const { EventEmitter } = require('node:events')
  const { PassThrough, Writable } = require('node:stream')
  const filename = path.resolve(__dirname, '../.electron-tsc/utils/hiddenFiles.js')
  const localRequire = createRequire(filename), exports = {}
  let starts = 0, reply = true, killed = 0
  const spawn = () => {
    starts++
    const child = new EventEmitter()
    child.stdout = new PassThrough(); child.stderr = new PassThrough()
    child.stdin = new Writable({ write(data, _encoding, done) {
      const request = JSON.parse(data.toString())
      if (reply) setImmediate(() => child.stdout.write(JSON.stringify({ id: request.id, names: ['hidden.txt'] }) + '\n'))
      done()
    } })
    child.kill = () => { killed++; return true }
    return child
  }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    exports, process: { platform: 'win32', env: process.env }, Buffer, setTimeout, clearTimeout,
    require: name => name === 'node:child_process' ? { spawn } : localRequire(name),
  })
  const controller = new AbortController(), filter = exports.createAsyncFileVisibilityFilter(controller.signal)
  try {
    assert.equal(await filter.isHidden(path.join(os.tmpdir(), 'A', 'normal.txt')), false)
    assert.equal(await filter.isHidden(path.join(os.tmpdir(), 'B', 'hidden.txt')), true)
    assert.equal(starts, 1)
    reply = false
    const waiting = filter.isHidden(path.join(os.tmpdir(), 'C', 'normal.txt'))
    controller.abort()
    await assert.rejects(waiting, /aborted/i)
    assert(killed > 0)
  } finally { filter.dispose() }
})
