const {test}=require('node:test'),assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {FileSearch,typoDistance}=require('../.electron-tsc/services/fuzzySearch');
function fixture(){
 const db=new Database(':memory:');db.function('owlsift_file_visible',p=>p.includes('/hidden/')?0:1);
 db.exec(`CREATE TABLE files(id INTEGER PRIMARY KEY,path TEXT,name TEXT,extension TEXT,size INTEGER,mtime INTEGER,content TEXT,is_deleted INTEGER DEFAULT 0);CREATE TABLE file_tags(file_id INTEGER,tag TEXT);
 CREATE VIRTUAL TABLE files_fts USING fts5(name,content,content='files',content_rowid='id',tokenize='unicode61');
 CREATE TRIGGER files_ai AFTER INSERT ON files BEGIN INSERT INTO files_fts(rowid,name,content)VALUES(new.id,new.name,new.content);END;
 CREATE TRIGGER files_au AFTER UPDATE ON files BEGIN INSERT INTO files_fts(files_fts,rowid,name,content)VALUES('delete',old.id,old.name,old.content);INSERT INTO files_fts(rowid,name,content)VALUES(new.id,new.name,new.content);END;
 CREATE TRIGGER files_ad AFTER DELETE ON files BEGIN INSERT INTO files_fts(files_fts,rowid,name,content)VALUES('delete',old.id,old.name,old.content);END;`);
 const search=new FileSearch(db);search.initialize();
 const insert=db.prepare('INSERT INTO files(path,name,extension,size,mtime,content) VALUES(?,?,?,0,0,?)');
 return {db,search,add(name,content='',path='/docs/'+name){return Number(insert.run(path,name,'txt',content).lastInsertRowid)},find(q){return search.search(q,50)}};
}
test('exact filenames and phrases precede fuzzy results, with filename relevance above content',()=>{
 const f=fixture();try{
  const typo=f.add('budgte report.txt'),body=f.add('notes.txt','budget report'),exact=f.add('budget report.txt');
  const ids=f.find('budget report').map(r=>r.id);assert(ids.indexOf(exact)<ids.indexOf(body));assert(ids.indexOf(body)<ids.indexOf(typo));
 }finally{f.db.close()}
});
test('misspelled words, multiword phrases, and Cyrillic match filenames and indexed content',()=>{
 const f=fixture();try{
  const accent=f.add('café menu.txt');assert(f.find('cfae menu').some(r=>r.id===accent));
  const budget=f.add('annual budget.txt'),content=f.add('meeting.txt','financial planning for next year'),ru=f.add('договор поставки.txt','согласование документа');
  for(const [q,id]of [['annula budgte',budget],['financail planing',content],['договро поставки',ru],['соглсаование докумнта',ru]])assert(f.find(q).some(r=>r.id===id),q);
 }finally{f.db.close()}
});
test('quoted punctuation and FTS operators are treated as literal search text, with bounded typo distance',()=>{
 const f=fixture();try{
  f.add('report-2026.txt','budget');assert(f.find('report-2026').length);assert(f.find('"report"').length);
  for(const q of ['*','OR','NOT','"',':','(report) AND','%_',''])assert.doesNotThrow(()=>f.find(q));
  assert.equal(typoDistance('report','reprot',1),1);assert.equal(typoDistance('planet','plan',1),2);
  assert.equal(f.find('zzzzzzzz').length,0);
 }finally{f.db.close()}
});
test('dictionary migrates existing FTS, follows edits/renames/deletes, and never returns hidden or deleted files',()=>{
 const f=fixture();try{
  const a=f.add('contract.txt','initial'),b=f.add('contract hidden.txt','','/hidden/contract'),c=f.add('contract deleted.txt');
  f.db.prepare('UPDATE files SET is_deleted=1 WHERE id=?').run(c);
  assert.deepEqual(f.find('contrcat').map(r=>r.id),[a]);
  f.db.prepare('UPDATE files SET name=?,content=? WHERE id=?').run('invoice.txt','accounting',a);
  assert(f.find('invocie').some(r=>r.id===a));assert(!f.find('contrcat').some(r=>r.id===a));
  f.db.prepare('DELETE FROM files WHERE id=?').run(a);assert(!f.find('invocie').length);
  f.db.exec('DROP TABLE search_grams;DROP TRIGGER search_word_insert;DROP TABLE search_words');
  const restored=new FileSearch(f.db);restored.initialize();assert(restored.suggestions('contrcat').includes('contract'));
  assert.deepEqual(restored.search('contrcat',50),[]);
 }finally{f.db.close()}
});
test('large indexes reuse persistent vocabulary and avoid reading all file bodies per query',()=>{
 const f=fixture();try{
  f.db.transaction(()=>{for(let i=0;i<15000;i++)f.add('document '+i+'.txt','reference identifier'+i+' unrelated material');})();
  const target=f.add('quarterly budget.txt','financial forecast');
  const start=performance.now();for(let i=0;i<12;i++)assert(f.find('quaterly budgte').some(r=>r.id===target));
  const average=(performance.now()-start)/12;console.log('15001 documents: average fuzzy search '+average.toFixed(1)+' ms');
  assert(average<500,'search should stay below 500 ms on fixture');
  const plan=f.db.prepare("EXPLAIN QUERY PLAN SELECT word FROM search_grams WHERE gram IN ('bud','udg')").all();assert(plan.some(row=>/SEARCH.*PRIMARY KEY/.test(row.detail)));
  const reopened=new FileSearch(f.db);reopened.initialize();assert(reopened.search('quaterly budgte',50).some(r=>r.id===target));
 }finally{f.db.close()}
});

test('browser project search uses cached postings with exact priority and typo-tolerant phrases',()=>{
 const {BrowserSearch}=require('../.electron-tsc/services/browserSearch');
 const files=[{id:1,name:'budgte report.txt',content:'',tags:[]},{id:2,name:'budget report.txt',content:'financial planning',tags:[]},{id:3,name:'notes.txt',content:'annual budget report',tags:['important']}];
 const index=new BrowserSearch(files);
 assert.equal(index.search('budget report')[0].id,2);
 assert(index.search('budgte reprot').some(f=>f.id===2));
 assert(index.search('financail planing').some(f=>f.id===2));
 assert.equal(index.search('#important')[0].id,3);
 assert.equal(index.search('unrelatedword').length,0);
});


test('search tiers fill the limit with distinct phrase, word and prefix matches before tags', () => {
 const f = fixture();
 try {
  const phrase = f.add('phrase.txt', 'annual planning');
  const words = f.add('words.txt', 'planning for the annual review');
  const prefix = f.add('prefix.txt', 'annually planning');
  const tagged = f.add('tagged.txt');
  f.db.prepare('INSERT INTO file_tags VALUES (?, ?)').run(tagged, 'annual');
  assert.deepEqual(f.search.search('annual planning', 3).map(row => row.id), [phrase, words, prefix]);
  assert.deepEqual(f.search.search('annual planning', 4).map(row => row.id), [phrase, words, prefix, tagged]);
  assert.match(f.search.search('annual planning', 1)[0].contentMatch, /annual planning/);
 } finally { f.db.close(); }
});


test('browser and desktop find literal filename fragments with case folding', () => {
 const { BrowserSearch } = require('../.electron-tsc/services/browserSearch');
 const f = fixture();
 try {
  const name = 'Annual_Quarterly-Отчёт.pdf';
  const filename = f.add(name, '', '/docs/nested/' + name);
  const index = new BrowserSearch([{ id: filename, name, tags: [] }]);
  for (const search of [f.find, query => index.search(query)]) {
   for (const query of ['ArTeR', 'ТЧЁ', '_', 'arter .PDF']) {
    assert.deepEqual(search(query).map(row => row.id), [filename], query);
   }
   for (const query of ['', '   ', 'zqxnomatch']) assert.deepEqual(search(query), [], query);
  }
 } finally { f.db.close(); }
});
