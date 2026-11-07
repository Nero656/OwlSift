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
    stat: async (...args) => {
      const stat = await fs.promises.stat(...args)
      const device = observe.device?.(args[0])
      if (device !== undefined) stat.dev = device
      return stat
    },
    lstat: async (...args) => { observe.stat?.(args[0]); return fs.promises.lstat(...args) },
    readdir: async (...args) => { observe.open?.(args[0]); return fs.promises.readdir(...args) },
    opendir: async (...args) => { observe.opened?.push(args[0]); observe.open?.(args[0]); return fs.promises.opendir(...args) },
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
    assert.equal(db.documentScanStatus().contentTotal, f.total)
    assert.equal(db.documentScanStatus().contentProcessed, 100)
    assert.equal(db.documentScanStatus().scanTotal, f.total)
    assert.equal(db.documentScanStatus().scanProcessed, 100)
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

test('indexes isolate folders, search data, and scan checkpoints across switches and restarts', async () => {
  const { scratch, drive, first, second } = fixture(12)
  let manager = loadDatabase(scratch)
  try {
    await manager.indexFolder(first)
    const original = manager.search('first').map(file => file.path).sort().join(',')
    assert.ok(original.includes(path.join(first, '0.txt')))
    manager.close()
    fs.unlinkSync(path.join(scratch, 'index-catalog.json'))
    manager = loadDatabase(scratch)
    assert.equal(manager.listIndexes().activeId, 'default')
    assert.equal(manager.search('first').map(file => file.path).sort().join(','), original)
    manager.createIndex('Archive')
    const archive = manager.listIndexes().indexes.find(index => index.name === 'Archive').id
    const scan = manager.scanOsDocuments(drive, ['txt'], [first])
    assert.throws(() => manager.switchIndex(archive), /finish/)
    await scan

    manager.switchIndex(archive)
    assert.equal(manager.listFolders().length, 0)
    assert.equal(manager.search('first').length, 0)
    await manager.indexFolder(second)
    assert.equal(manager.listFolders()[0].path, second)
    assert.equal(manager.search('second').length, 12)
    manager.close()

    manager = loadDatabase(scratch)
    assert.equal(manager.listIndexes().activeId, archive)
    assert.equal(manager.search('second').length, 12)
    assert.throws(() => manager.deleteIndex(archive), /Switch/)
    manager.switchIndex('default')
    assert.equal(manager.listFolders()[0].path, first)
    assert.equal(manager.search('first').map(file => file.path).sort().join(','), original)
    assert.equal(manager.search('second').length, 0)
    manager.deleteIndex(archive)
    assert.equal(manager.listIndexes().indexes.length, 1)
    assert.equal(fs.readFileSync(path.join(second, '0.txt'), 'utf8'), 'second 0')
  } finally {
    manager.close()
    fs.rmSync(scratch, { recursive: true, force: true })
  }
})

test('incremental rescans replace old search content when many files share search words', async () => {
  const { scratch, drive, first } = fixture(0)
  let duringContent
  const manager = loadDatabase(scratch, { read: () => { duringContent = manager.documentScanStatus() } })
  try {
    await manager.scanOsDocuments(drive, ['txt'], [first], false, 'hdd')
    for (let i = 0; i < 2; i++) fs.writeFileSync(path.join(first, i + '.txt'), 'newneedle text ' + i)
    const result = await manager.scanOsDocuments(drive, ['txt'], [first], false, 'ssd')
    assert.equal(result.indexedCount, 2)
    assert.equal(duringContent.scanTotal, 3)
    assert.equal(duringContent.scanProcessed, 1)
    assert.equal(manager.search('newneedle').length, 2)
    assert.equal(manager.search('first').length, 1)
  } finally {
    manager.close()
    fs.rmSync(scratch, { recursive: true, force: true })
  }
})


test('protected files and folders are counted once and accessible siblings still index after resume', async () => {
  const { scratch, drive, first, second } = fixture(220)
  const protectedFolder = path.join(drive, 'blocked')
  let protectedFile
  const unreadableContent = path.join(first, '0.txt')
  fs.mkdirSync(protectedFolder)
  fs.writeFileSync(path.join(protectedFolder, 'secret.txt'), 'must not be indexed')
  const denied = () => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }) }
  let db
  const observe = {
    open: folder => { if (folder === protectedFolder) denied() },
    stat: file => { if (file === protectedFile) denied() },
    read: file => { if (file === unreadableContent) denied() },
  }
  db = loadDatabase(scratch, { ...observe, stat: file => {
    if (!protectedFile && file.startsWith(second + path.sep)) protectedFile = file
    observe.stat(file)
    const key = process.platform === 'win32' ? protectedFile?.toLowerCase() : protectedFile
    if (key && file.startsWith(second + path.sep) && db.documentScanStatus().indexedCount >= 100 &&
        db.db.prepare('SELECT 1 FROM document_scan_skips WHERE path = ?').get(key)) db.stopDocumentScan()
  } })
  try {
    assert.equal((await db.scanOsDocuments(drive, ['txt'], undefined, false, 'hdd')).cancelled, true)
    assert.ok(db.documentScanStatus().skippedCount > 0)
    db.close()
    db = loadDatabase(scratch, observe)
    const result = await db.scanOsDocuments(drive, ['txt'], undefined, true)
    assert.equal(result.skippedCount, 3)
    assert.equal(result.indexedCount, 221)
    assert.equal(db.listFiles().length, 221)
    assert.ok(!db.listFiles().some(file => file.path.includes('secret.txt') || file.path === protectedFile || file.path === unreadableContent))
  } finally {
    db.close()
    fs.rmSync(scratch, { recursive: true, force: true })
  }
})


test('folder indexing counts a directory it cannot open without counting descendants', async () => {
  const { scratch, first } = fixture(0)
  const blocked = path.join(first, 'blocked')
  fs.mkdirSync(blocked)
  fs.writeFileSync(path.join(blocked, 'private.txt'), 'protected')
  const db = loadDatabase(scratch, {
    open: folder => {
      if (folder === blocked) throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
    },
  })
  try {
    const result = await db.indexFolder(first)
    assert.equal(result.indexedCount, 3)
    assert.equal(result.skippedCount, 1)
    assert.equal(db.search('private').length, 0)
  } finally {
    db.close()
    fs.rmSync(scratch, { recursive: true, force: true })
  }
})


test('large scans make content searchable during discovery and resume without rereading committed content', async () => {
  const f = fixture(5250)
  let db, firstReadStatus, stopStatus
  const reads = []
  db = loadDatabase(f.scratch, { read: file => {
    reads.push(file)
    if (reads.length === 1) firstReadStatus = db.documentScanStatus()
    if (reads.length === 101) {
      stopStatus = db.documentScanStatus()
      db.stopDocumentScan()
    }
  } })
  try {
    const stopped = await db.scanOsDocuments(f.drive, ['txt'], [f.first, f.second], false, 'ssd')
    assert.equal(stopped.cancelled, true)
    assert.equal(firstReadStatus.phase, 'metadata')
    assert.ok(firstReadStatus.indexedCount >= 5000)
    assert.equal(firstReadStatus.scanTotal, null)
    assert.equal(stopStatus.phase, 'metadata')
    assert.equal(stopStatus.contentCount, 100)
    assert.equal(db.search('first').length, 3)

    const committed = new Set(reads.slice(0, 100))
    db.close()
    let finalStatus
    const reread = []
    db = loadDatabase(f.scratch, { read: file => {
      if (committed.has(file)) reread.push(file)
      if (!finalStatus && db.documentScanStatus().phase === 'content') finalStatus = db.documentScanStatus()
    } })
    const result = await db.scanOsDocuments(f.drive, ['txt'], [f.first, f.second], true)
    assert.equal(result.cancelled, false)
    assert.equal(result.indexedCount, f.total)
    assert.deepEqual(reread, [])
    assert.equal(finalStatus.contentTotal, f.total)
    assert.equal(finalStatus.scanTotal, f.total)
    assert.equal(db.search('second', f.total).length, 5250)
  } finally {
    db.close()
    fs.rmSync(f.scratch, { recursive: true, force: true })
  }
})


test('rescans backfill unchanged PDFs, DOCX, ODT and text from legacy metadata-only records', async () => {
  const { PDFDocument, StandardFonts } = require('pdf-lib')
  const { zipSync, strToU8 } = require('fflate')
  const { scratch, drive, first } = fixture(0)
  const pdf = await PDFDocument.create()
  const page = pdf.addPage()
  page.drawText('pdfbodyneedle', { font: await pdf.embedFont(StandardFonts.Helvetica) })
  const formats = [
    ['pdf', await pdf.save(), 'pdfbodyneedle'],
    ['docx', zipSync({'word/document.xml':strToU8('<w:document><w:p><w:r><w:t>wordbody</w:t></w:r><w:r><w:t>needle</w:t></w:r></w:p></w:document>')}), 'wordbodyneedle'],
    ['odt', zipSync({'content.xml':strToU8('<office:document><text:p>odtbodyneedle &amp; more</text:p></office:document>')}), 'odtbodyneedle'],
    ['txt', 'plainbodyneedle', 'plainbodyneedle'],
  ]
  const manager = loadDatabase(scratch)
  try {
    for (const [extension, bytes] of formats) {
      const file = path.join(first, 'backfill.' + extension)
      fs.writeFileSync(file, bytes)
      const stat = fs.statSync(file)
      manager.saveFile({path:file,name:path.basename(file),extension,size:stat.size,mtime:Math.floor(stat.mtimeMs),content:''})
    }
    assert.equal(manager.search('pdfbodyneedle').length, 0)
    const result = await manager.scanOsDocuments(drive, ['txt','pdf','docx','odt'], [first], false, 'hdd')
    assert.equal(result.skippedCount, 0)
    for (const [extension,,term] of formats) {
      const match = manager.search(term).find(file => file.extension === extension)
      assert.ok(match, 'Missing body match for ' + extension)
      assert.ok(match.contentMatch.includes(String.fromCharCode(1) + term + String.fromCharCode(2)))
    }
    assert.equal(manager.search('backfill')[0].contentMatch, undefined)
    assert.equal((await manager.scanOsDocuments(drive, ['txt','pdf','docx','odt'], [first], false, 'ssd')).indexedCount, 0)
  } finally {
    manager.close()
    fs.rmSync(scratch, { recursive: true, force: true })
  }
})


test('document scan indexes source text and makes common images searchable by filename', async () => {
  const { scratch, drive, first } = fixture(0)
  const observedReads = []
  const manager = loadDatabase(scratch, { read: file => observedReads.push(path.basename(file)) })
  try {
    const sourceFiles = ['ts', 'cpp', 'py', 'jsx', 'tsx', 'hpp', 'cs', 'go', 'rs']
    const imageFiles = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff']
    sourceFiles.forEach((extension, index) => {
      fs.writeFileSync(path.join(first, 'source.' + extension), 'uniquebodyword' + index)
    })
    imageFiles.forEach(extension => {
      fs.writeFileSync(path.join(first, 'referencepicture.' + extension), 'notforcontentindex')
    })
    const result = await manager.scanOsDocuments(drive, [...sourceFiles, ...imageFiles], [first], false, 'hdd')
    assert.equal(result.indexedCount, sourceFiles.length + imageFiles.length)
    assert.equal(result.skippedCount, 0)
    for (const [index, extension] of sourceFiles.entries()) {
      assert.equal(manager.search('uniquebodyword' + index)[0]?.extension, extension)
    }
    assert.equal(manager.search('referencepicture').length, imageFiles.length)
    assert.equal(manager.search('notforcontentindex').length, 0)
    assert.equal(observedReads.length, sourceFiles.length)
  } finally {
    manager.close()
    fs.rmSync(scratch, { recursive: true, force: true })
  }
})


test('multi-drive checkpoint resumes all lanes without re-reading committed files', { skip: process.platform === 'win32' }, async () => {
  const f = fixture(120)
  const secondDrive = path.join(f.scratch, 'another-drive')
  fs.renameSync(f.second, secondDrive)
  const drives = [f.drive, secondDrive].map(path => ({ path, label: path }))
  const readRoots = new Set()
  let manager
  const open = observe => {
    const db = loadDatabase(f.scratch, { device: root => root === secondDrive ? 2 : 1, ...observe })
    db.listScanDrives = () => drives
    return db
  }
  try {
    manager = open({ read: file => {
      readRoots.add(file.startsWith(secondDrive + path.sep) ? secondDrive : f.drive)
      if (readRoots.size === 2) manager.stopDocumentScan()
    } })
    const paused = await manager.scanOsDocuments(f.drive, ['txt'], undefined, false, 'ssd', [secondDrive])
    assert.equal(paused.cancelled, true)
    assert.deepEqual([...readRoots].sort(), [f.drive, secondDrive].sort())
    assert.deepEqual(Array.from(manager.documentScanStatus().additionalDrivePaths), [secondDrive])
    assert.equal(manager.db.prepare("SELECT count(DISTINCT lane) AS n FROM document_scan_queue").get().n, 2)
    const committed = new Set(manager.db.prepare('SELECT path FROM files WHERE text_indexed=1').all().map(row => row.path))
    manager.close()

    manager = open({ read: file => assert(!committed.has(file)) })
    const result = await manager.scanOsDocuments(f.drive, ['txt'], undefined, true)
    assert.equal(result.cancelled, false)
    assert.equal(result.indexedCount, f.total)
    assert.equal(manager.search('first', 1000).length, 3)
    assert.equal(manager.search('second', 1000).length, 120)
    assert.equal(manager.documentScanStatus().resumable, false)
    let rereads = 0
    manager.close()
    manager = open({ read: () => { rereads++ } })
    const incremental = await manager.scanOsDocuments(f.drive, ['txt'], undefined, false, 'ssd', [secondDrive])
    assert.equal(incremental.indexedCount, 0)
    assert.equal(rereads, 0)
  } finally {
    manager?.close()
    fs.rmSync(f.scratch, { recursive: true, force: true })
  }
})
