const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm')
const { createRequire } = require('node:module')
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'owlsift-workspaces-'))
  const filename = path.resolve(__dirname,'../.electron-tsc/db/sqlite.js'), req = createRequire(filename), exports = {}
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{exports,process,console,Buffer,AbortController,setImmediate,require:name=>name==='electron'?{app:{isPackaged:false,getPath:()=>root,getAppPath:()=>path.join(root,'empty-app')}}:req(name)})
  const db=exports.dbManager; db.init(); db.setSystemFileVisibility(true)
  const a=db.createWorkspaceFolder(root,'A'), b=db.createWorkspaceFolder(root,'B')
  return {root,db,a,b,add(name,content='original bytes') {const file=path.join(a.path,name);fs.writeFileSync(file,content);db.indexSingleFile(file,a.path);return db.listFiles().find(item=>item.path===file)}}
}
test('workspace creation is physical, registered, non-overwriting and validates names',()=>{
 const f=fixture();try{
  assert(fs.statSync(f.a.path).isDirectory());assert(f.db.listFolders().some(folder=>folder.path===f.a.path))
  for(const name of ['../escape','..','.secret','CON','bad/name','bad.']) assert.throws(()=>f.db.createWorkspaceFolder(f.root,name))
  assert.throws(()=>f.db.createWorkspaceFolder(f.root,'A'));assert(fs.statSync(f.a.path).isDirectory())
 }finally{f.db.close()}
})
test('copy/move preserve bytes, notes, tags, stable move id and folder counts',async()=>{
 const f=fixture();try{
  const file=f.add('sample.txt','hello workspace')
  f.db.addFileTag(file.id,'important');f.db.setFileNote(file.id,'a note')
  const copy=await f.db.transferWorkspaceFiles({fileIds:[file.id],targetFolderPath:f.b.path,mode:'copy'})
  assert.equal(copy.failed.length,0);assert.notEqual(copy.completed[0].id,file.id);assert.equal(fs.readFileSync(file.path,'utf8'),'hello workspace')
  const copied=f.db.listFiles().find(item=>item.id===copy.completed[0].id)
  assert.equal(copied.note,'a note');assert(copied.tags.includes('important'));assert.equal(fs.readFileSync(copied.path,'utf8'),'hello workspace')
  const moved=await f.db.transferWorkspaceFiles({fileIds:[file.id],targetFolderPath:f.b.path,mode:'move'})
  assert.equal(moved.failed.length,0);assert.equal(moved.completed[0].id,file.id);assert(!fs.existsSync(file.path))
  assert.equal(path.basename(moved.completed[0].path),'sample (1).txt')
  const updated=f.db.listFiles().find(item=>item.id===file.id);assert.equal(updated.note,'a note');assert(updated.tags.includes('important'))
  assert.equal(f.db.listFolders().find(folder=>folder.path===f.b.path).count,2)
  assert.equal(f.db.search('hello').length,2)
 }finally{f.db.close()}
})
test('collisions never overwrite files, same-folder moves are no-ops and duplicates get new ids',async()=>{
 const f=fixture();try{
  const file=f.add('same.txt');fs.writeFileSync(path.join(f.b.path,'same.txt'),'existing target')
  const copy=await f.db.transferWorkspaceFiles({fileIds:[file.id,file.id],targetFolderPath:f.b.path,mode:'copy'})
  assert.equal(copy.completed.length,1);assert.equal(path.basename(copy.completed[0].path),'same (1).txt')
  assert.equal(fs.readFileSync(path.join(f.b.path,'same.txt'),'utf8'),'existing target')
  const same=await f.db.transferWorkspaceFiles({fileIds:[file.id],targetFolderPath:f.a.path,mode:'move'})
  assert.equal(same.completed[0].path,file.path);assert(fs.existsSync(file.path))
 }finally{f.db.close()}
})
test('batch errors preserve sources and report per-file failures',async()=>{
 const f=fixture();try{
  const one=f.add('one.txt'),two=f.add('two.txt')
  const result=await f.db.transferWorkspaceFiles({fileIds:[one.id,two.id,999999],targetFolderPath:f.b.path,mode:'move',maxFiles:1})
  assert.equal(result.completed.length,1);assert.equal(result.failed.length,2);assert(fs.existsSync(two.path));assert(!fs.existsSync(one.path))
  await assert.rejects(f.db.transferWorkspaceFiles({fileIds:[two.id],targetFolderPath:f.root,mode:'copy'}),/Workspace not found/)
 }finally{f.db.close()}
})
test('import copies into a workspace while retaining the external original',async()=>{
 const f=fixture();try{
  const external=path.join(f.root,'outside.txt');fs.writeFileSync(external,'outside')
  const destination=await f.db.importFileToWorkspace(external,f.b.path)
  assert.equal(path.dirname(destination),f.b.path);assert.equal(fs.readFileSync(external,'utf8'),'outside');assert.equal(fs.readFileSync(destination,'utf8'),'outside')
  const second=await f.db.importFileToWorkspace(external,f.b.path);assert.notEqual(destination,second)
 }finally{f.db.close()}
})
test('database failure during a move keeps the original and removes the allocated destination',async()=>{
 const f=fixture();try{
  const file=f.add('rollback.txt')
  f.db.db.exec("CREATE TRIGGER fail_move BEFORE UPDATE OF path ON files BEGIN SELECT RAISE(ABORT,'test failure'); END")
  const result=await f.db.transferWorkspaceFiles({fileIds:[file.id],targetFolderPath:f.b.path,mode:'move'})
  assert.equal(result.failed.length,1);assert.equal(fs.readFileSync(file.path,'utf8'),'original bytes');assert.equal(fs.readdirSync(f.b.path).length,0)
  assert.equal(f.db.listFiles().find(item=>item.id===file.id).path,file.path)
 }finally{f.db.close()}
})
test('move falls back to copy on EXDEV and still preserves source data on failure',async()=>{
 const f=fixture();const original=fs.promises.link;try{
  const file=f.add('cross.txt');fs.promises.link=async()=>{throw Object.assign(new Error('cross device'),{code:'EXDEV'})}
  const result=await f.db.transferWorkspaceFiles({fileIds:[file.id],targetFolderPath:f.b.path,mode:'move'})
  assert.equal(result.failed.length,0);assert.equal(fs.readFileSync(result.completed[0].path,'utf8'),'original bytes');assert(!fs.existsSync(file.path))
 }finally{fs.promises.link=original;f.db.close()}
})


test('copy preserves modification time and concurrent transfer requests are rejected',async()=>{
 const f=fixture();try{
  const file=f.add('date.txt');const original=fs.statSync(file.path)
  const pending=f.db.transferWorkspaceFiles({fileIds:[file.id],targetFolderPath:f.b.path,mode:'copy'})
  await assert.rejects(f.db.transferWorkspaceFiles({fileIds:[file.id],targetFolderPath:f.b.path,mode:'move'}),/already running/)
  const result=await pending;assert.equal(result.failed.length,0)
  assert(Math.abs(fs.statSync(result.completed[0].path).mtimeMs-original.mtimeMs)<1)
 }finally{f.db.close()}
})
test('a source changed while copying is retained and its partial destination is removed',async()=>{
 const f=fixture(),copy=fs.promises.copyFile;try{
  const file=f.add('change.txt')
  fs.promises.copyFile=async(...args)=>{await copy(...args);fs.writeFileSync(file.path,'new user data during copy')}
  const result=await f.db.transferWorkspaceFiles({fileIds:[file.id],targetFolderPath:f.b.path,mode:'copy'})
  assert.equal(result.failed.length,1);assert.equal(fs.readFileSync(file.path,'utf8'),'new user data during copy');assert.equal(fs.readdirSync(f.b.path).length,0)
 }finally{fs.promises.copyFile=copy;f.db.close()}
})
test('externally modified binary files do not inherit stale indexed text',async()=>{
 const f=fixture();try{
  const file=f.add('document.pdf')
  f.db.db.prepare('UPDATE files SET content=? WHERE id=?').run('stale cached text',file.id)
  fs.writeFileSync(file.path,'changed binary bytes with a different length')
  const result=await f.db.transferWorkspaceFiles({fileIds:[file.id],targetFolderPath:f.b.path,mode:'copy'})
  assert.equal(result.failed.length,0)
  assert.equal(f.db.getFileContent(result.completed[0].id),'')
 }finally{f.db.close()}
})
