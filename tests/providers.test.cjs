const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http'),os=require('node:os'),{EventEmitter}=require('node:events');
const {defaultLocalModels,restoreLocalModels,emptyConnection,connectProfile,invalidateConnection}=require('../.electron-tsc/services/localProviders');
const {modelBase,discoverModels,fetchModel,parseModelList,ProviderError}=require('../.electron-tsc/services/modelTransport');
const {registerModelIpc}=require('../.electron-tsc/services/modelIpc');
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};

test('legacy settings migrate only their provider and independent profiles round-trip',()=>{
 const old={localModel:{provider:'ollama',enabled:true,endpoint:'http://192.168.1.42:13000',model:'custom',apiKey:'secret',systemPrompt:'test'}};
 const migrated=restoreLocalModels(old);
 assert.equal(migrated.localProvider,'ollama');assert.equal(migrated.localModels.ollama.endpoint,old.localModel.endpoint);
 assert.equal(migrated.localModels.lmstudio.endpoint,'http://127.0.0.1:1234/v1');assert.equal(migrated.localModels.lmstudio.model,'');
 migrated.localModels.lmstudio.endpoint='http://192.168.1.9:5678/v1';migrated.localModels.lmstudio.model='other';
 assert.deepEqual(restoreLocalModels(JSON.parse(JSON.stringify(migrated))),migrated);
 assert.equal(restoreLocalModels({localModel:{endpoint:'http://old:1234',enabled:true}}).localModels.lmstudio.endpoint,'http://old:1234');
});
test('both providers connect concurrently and edits/failure/reconnect affect only their owner',async()=>{
 const models=defaultLocalModels(),states={ollama:emptyConnection(),lmstudio:emptyConnection()},a=defer(),b=defer();
 const first=connectProfile(states.ollama,models.ollama,()=>a.promise),second=connectProfile(states.lmstudio,models.lmstudio,()=>b.promise);
 b.resolve(['lm']);await second;a.resolve(['ollama']);await first;
 assert.equal(states.ollama.status,'ok');assert.equal(states.lmstudio.status,'ok');assert.equal(models.lmstudio.model,'lm');
 const snapshot=JSON.stringify({state:states.lmstudio,config:models.lmstudio});
 models.ollama.endpoint='http://192.168.1.2:11435';invalidateConnection(states.ollama,models.ollama);
 assert.equal(states.ollama.status,'idle');assert.equal(models.ollama.model,'ollama');
 await assert.rejects(connectProfile(states.ollama,models.ollama,async()=>{throw new Error('offline')}));
 assert.equal(JSON.stringify({state:states.lmstudio,config:models.lmstudio}),snapshot);
 await connectProfile(states.ollama,models.ollama,async()=>['new']);assert.equal(models.ollama.model,'ollama','existing model selection is never silently replaced');
});
test('late discovery cannot change edited settings or overwrite a newer connection',async()=>{
 const config=defaultLocalModels().ollama,state=emptyConnection(),old=defer();
 const pending=connectProfile(state,config,()=>old.promise);
 config.endpoint='http://192.168.1.5:11434';invalidateConnection(state,config);
 await connectProfile(state,config,async()=>['new-host']);old.resolve(['old-host']);await pending;
 assert.deepEqual(state.models,['new-host']);assert.equal(config.model,'new-host');
 const slower=defer(),one=connectProfile(state,config,()=>slower.promise);
 await connectProfile(state,config,async()=>['latest']);slower.resolve(['stale']);await one;assert.deepEqual(state.models,['latest']);
});
test('empty lists are successful but malformed model responses are errors',async()=>{
 assert.deepEqual(parseModelList('ollama',{models:[]}),[]);
 for(const payload of [{},{data:[]},{models:[{}]},{models:'bad'},null])assert.throws(()=>parseModelList('ollama',payload),e=>e.code==='response');
 assert.deepEqual(parseModelList('lmstudio',{data:[{id:'a'},{id:'a'}]}),['a']);
});
test('addresses preserve LAN host, custom port and proxy prefix, without duplicating v1',()=>{
 assert.equal(modelBase('ollama','http://192.168.1.22:2222/v1/','models'),'http://192.168.1.22:2222/api/tags');
 assert.equal(modelBase('ollama','http://[::1]:11434/','chat'),'http://[::1]:11434/v1/chat/completions');
 assert.equal(modelBase('lmstudio','http://192.168.1.2:7777/proxy/v1','chat'),'http://192.168.1.2:7777/proxy/v1/chat/completions');
 for(const url of ['192.168.1.2:1234','file:///etc/passwd','http://user:secret@localhost:1234','http://localhost:1234?key=secret'])assert.throws(()=>modelBase('lmstudio',url,'models'),e=>e.code==='address');
});
async function serverFixture() {
 const calls=[];
 const server=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  calls.push({path:req.url,auth:req.headers.authorization,body:body?JSON.parse(body):null});
  res.setHeader('Content-Type','application/json');
  if(req.url.startsWith('/auth/')&&req.headers.authorization!=='Bearer test-token'){res.writeHead(401);return res.end(JSON.stringify({error:'private-secret-upstream'}))}
  if(req.url.startsWith('/invalid/'))return res.end('{not JSON');
  if(req.url.startsWith('/html/')){res.setHeader('Content-Type','text/html');return res.end('<html>UI</html>')}
  if(req.url.endsWith('/api/tags'))return res.end(JSON.stringify({models:[{name:'ollama-lan'}]}));
  if(req.url.endsWith('/v1/models'))return res.end(JSON.stringify({data:[{id:'lm-lan'}]}));
  if(req.url.startsWith('/slow/')){res.setHeader('Content-Type','text/event-stream');res.write('data: '+JSON.stringify({choices:[{delta:{content:'waiting'}}]})+'\n\n');return;}
  if(req.url.endsWith('/v1/chat/completions')){
   res.setHeader('Content-Type','text/event-stream');res.write('data: '+JSON.stringify({choices:[{delta:{content:'LAN reply'}}]})+'\n\n');return setTimeout(()=>res.end('data: [DONE]\n\n'),10);
  }
  res.writeHead(404);res.end('{}');
 });
 await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));
 const ip=Object.values(os.networkInterfaces()).flat().find(n=>n.family==='IPv4'&&!n.internal)?.address;
 assert(ip,'Test requires a non-loopback interface');
 return {calls,base:'http://'+ip+':'+server.address().port,close:()=>new Promise(r=>{server.closeAllConnections();server.close(r)})};
}
test('discovery and streaming chat use a non-loopback interface and custom port for both providers',async()=>{
 const f=await serverFixture();try{
  for(const provider of ['ollama','lmstudio']){
   const config={provider,endpoint:f.base+'/auth',apiKey:'test-token'};
   assert.deepEqual(await discoverModels(config),[provider==='ollama'?'ollama-lan':'lm-lan']);
   const response=await fetchModel({...config,operation:'chat',model:'selected-model',messages:[{role:'user',content:'hello'}]});
   assert.match(await response.text(),/LAN reply/);
   assert.equal(f.calls.at(-1).body.model,'selected-model');assert.equal(f.calls.at(-1).auth,'Bearer test-token');
  }
 }finally{await f.close()}
});
test('network, timeout, CORS-like failures, auth and invalid API responses are actionable and redact secrets',async()=>{
 const f=await serverFixture();try{
  const request={provider:'lmstudio',endpoint:f.base+'/auth',operation:'models'};
  await assert.rejects(fetchModel(request),e=>e.code==='auth'&&e.status===401&&!e.message.includes('private-secret'));
  await assert.rejects(discoverModels({...request,endpoint:f.base+'/invalid'}),e=>e.code==='response');
  await assert.rejects(fetchModel({...request,endpoint:f.base+'/html'}),e=>e.code==='response');
  await assert.rejects(fetchModel({...request,endpoint:f.base},undefined,async()=>{throw new TypeError('Failed to fetch secret-token')}),e=>e.code==='network'&&/CORS/.test(e.message)&&/firewall/.test(e.message)&&!e.message.includes('secret-token'));
  await assert.rejects(fetchModel(request,undefined,async()=>{throw new DOMException('timeout','TimeoutError')}),e=>e.code==='timeout');
  const controller=new AbortController();controller.abort();await assert.rejects(fetchModel(request,controller.signal),e=>e.code==='cancelled');
 }finally{await f.close()}
});
test('Electron bridge forwards streamed bytes and scopes cancellation to the requesting window',async()=>{
 const f=await serverFixture();try{
  const handlers=new Map(),ipc={handle:(name,handler)=>handlers.set(name,handler)};registerModelIpc(ipc);
  const sender=new EventEmitter();sender.id=1;sender.isDestroyed=()=>false;
  let chunks='';const done=defer();sender.send=(_,message)=>{if(message.bytes)chunks+=Buffer.from(message.bytes).toString();if(message.done)done.resolve();if(message.error)done.reject(new Error(message.error.message))};
  const result=await handlers.get('ai:request')({sender},{id:'sample',provider:'ollama',endpoint:f.base,operation:'chat',model:'a'});
  assert.equal(result.status,200);await done.promise;assert.match(chunks,/LAN reply/);assert.equal(sender.listenerCount('destroyed'),0);
  const bad=await handlers.get('ai:request')({sender},{id:'bad',provider:'lmstudio',endpoint:f.base+'/auth',operation:'models'});assert.equal(bad.error.code,'auth');
  assert.equal(sender.listenerCount('destroyed'),0);
 }finally{await f.close()}
});

test('Electron cancellation cannot abort a different window request and closes only the owned stream',async()=>{
 const f=await serverFixture();try{
  const handlers=new Map();registerModelIpc({handle:(key,handler)=>handlers.set(key,handler)});
  const sender=new EventEmitter();sender.id=99;sender.isDestroyed=()=>false;
  const firstChunk=defer(),ended=defer();let endedEarly=false;
  sender.send=(_,chunk)=>{if(chunk.bytes)firstChunk.resolve();if(chunk.error){endedEarly=true;ended.resolve(chunk.error)}};
  await handlers.get('ai:request')({sender},{id:'owned',provider:'lmstudio',operation:'chat',endpoint:f.base+'/slow',model:'test'});
  await firstChunk.promise;
  handlers.get('ai:cancel')({sender:{id:100}},'owned');
  await new Promise(r=>setTimeout(r,10));assert.equal(endedEarly,false);
  handlers.get('ai:cancel')({sender},'owned');
  assert.equal((await ended.promise).code,'cancelled');assert.equal(sender.listenerCount('destroyed'),0);
 }finally{await f.close()}
});

function loadRendererTransport(fetcher,bridge) {
 const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
 const source=fs.readFileSync(require('node:path').join(__dirname,'../app/utils/localModelTransport.ts'),'utf8').replaceAll('import.meta.client',bridge?'true':'false');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const transport=require('../.electron-tsc/services/modelTransport'),exports={};
 vm.runInNewContext(code,{exports,require:()=>({...transport,fetchModel:(request,signal)=>transport.fetchModel(request,signal,fetcher)}),fetch:fetcher,window:{electron:bridge},crypto:require('node:crypto').webcrypto,Date,Math,ReadableStream,Uint8Array,Response,DOMException});
 return exports.localModelResponse;
}
test('browser transport falls back on CORS-like failures, but never retries authentication or invalid API replies',async()=>{
 const calls=[],config={provider:'ollama',operation:'models',endpoint:'http://192.168.1.20:11434',apiKey:'sample-token'};
 const response=await loadRendererTransport(async(url,options)=>{
  calls.push({url,options});if(url!=='/api/ai/request')throw new TypeError('Blocked by CORS');
  return new Response(JSON.stringify({models:[{name:'proxied'}]}),{headers:{'Content-Type':'application/json'}});
 })(config);
 assert.equal((await response.json()).models[0].name,'proxied');assert.equal(calls.length,2);
 assert.equal(JSON.parse(calls[1].options.body).apiKey,'sample-token');
 let count=0;await assert.rejects(loadRendererTransport(async()=>{count++;return new Response('{}',{status:401,headers:{'Content-Type':'application/json'}})})(config),e=>e.code==='auth');assert.equal(count,1);
 count=0;await assert.rejects(loadRendererTransport(async()=>{count++;return new Response('<html>',{headers:{'Content-Type':'text/html'}})})(config),e=>e.code==='response');assert.equal(count,1);
 await assert.rejects(loadRendererTransport(async url=>{if(url==='/api/ai/request')return new Response('<html>not found</html>',{status:404});throw new TypeError('CORS')})(config),e=>e.code==='network'&&/CORS/.test(e.message));
});
test('renderer bridge reconstructs streamed responses and unsubscribes its listener',async()=>{
 const listeners=new Set(),bridge={on:(_,fn)=>{listeners.add(fn);return()=>listeners.delete(fn)},invoke:async(channel,request)=>{
  if(channel!=='ai:request')return;
  queueMicrotask(()=>{for(const fn of [...listeners]){fn({id:request.id,bytes:[123,125]});fn({id:request.id,done:true})}});
  return {status:200,contentType:'application/json'};
 }};
 const response=await loadRendererTransport(()=>{throw new Error('native requests must not use renderer fetch')},bridge)({provider:'lmstudio',operation:'models',endpoint:'http://192.168.1.20:1234'});
 assert.deepEqual(await response.json(),{});assert.equal(listeners.size,0);
});

test('global enable migration preserves existing profiles and explicit opt-out',()=>{
 const {restoreGlobalEnabled}=require('../.electron-tsc/services/localProviders');
 assert.equal(restoreGlobalEnabled({}),false);
 assert.equal(restoreGlobalEnabled({modelProvider:'global',globalModel:{model:'saved',apiKey:'saved-key'}}),true);
 assert.equal(restoreGlobalEnabled({modelProvider:'local',globalModel:{apiKey:'saved-key'}}),true);
 assert.equal(restoreGlobalEnabled({modelProvider:'global',globalModel:{enabled:false,model:'saved',apiKey:'saved-key'}}),false);
 const profile={enabled:true,endpoint:'http://api.test/v1',model:'saved',apiKey:'saved-key'};
 profile.enabled=false;const restored=JSON.parse(JSON.stringify(profile));assert.equal(restored.model,'saved');assert.equal(restored.apiKey,'saved-key');assert.equal(restoreGlobalEnabled({globalModel:restored}),false);
});
test('only enabled request providers are offered, independent of stale connection caches',()=>{
 const {enabledRequestProviders}=require('../.electron-tsc/services/localProviders');
 const settings={localModels:defaultLocalModels(),globalModel:{enabled:false}};
 assert.deepEqual(enabledRequestProviders(settings),[]);
 settings.localModels.ollama.enabled=true;assert.deepEqual(enabledRequestProviders(settings),['ollama']);
 settings.globalModel.enabled=true;assert.deepEqual(enabledRequestProviders(settings),['ollama','global']);
 settings.localModels.ollama.enabled=false;settings.localModels.lmstudio.enabled=true;assert.deepEqual(enabledRequestProviders(settings),['lmstudio','global']);
 settings.localModels.lmstudio.enabled=false;settings.globalModel.enabled=false;assert.deepEqual(enabledRequestProviders(settings),[]);
});
