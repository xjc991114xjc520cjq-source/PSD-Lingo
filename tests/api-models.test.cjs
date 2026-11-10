const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {listApiModels,modelIds,MODELS_URL,MAX_BYTES}=require('../services/api-models.cjs');
const list=ids=>({object:'list',data:ids.map(id=>({object:'model',id}))});
const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const settings={pending:Promise.resolve(),read:async()=>({mode:'local',apiKey:'saved-key',apiModel:'',executable:''})};
test('fetches official endpoint with unsaved key, sorts/deduplicates IDs without reading saved settings',async()=>{
 let calls=0;
 const result=await listApiModels({apiKey:' entered-key ',apiBaseUrl:'https://api.openai.com/v1'},{settings:{read:()=>assert.fail('must not decrypt')},fetch:async(url,options)=>{
   calls++;assert.equal(url,MODELS_URL);assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer entered-key');assert.equal(options.redirect,'error');assert.equal(options.body,undefined);
   return response(list(['gpt-z','gpt-a','gpt-z','ft:gpt-example:test']));
 }});
 assert.deepEqual(result,{models:['ft:gpt-example:test','gpt-a','gpt-z']});assert.equal(calls,1);assert(!JSON.stringify(result).includes('entered-key'));
});
test('empty input resolves saved key after pending save even with local mode and no model',async()=>{
 let ready=false,read=false;const s={pending:Promise.resolve().then(()=>{ready=true;}),read:async()=>{assert(ready);read=true;return {mode:'local',apiKey:'saved-key',apiModel:''};}};
 assert.deepEqual(await listApiModels({apiKey:''},{settings:s,fetch:async(_,o)=>{assert.equal(o.headers.Authorization,'Bearer saved-key');return response(list([]));}}),{models:[]});assert(read);
});
test('missing or malformed keys are rejected before network access',async()=>{
 const fetch=()=>assert.fail('network must not run');
 for(const value of [null,[],{apiKey:123},{apiKey:'a\nb'},{apiKey:'x'.repeat(8193)}])await assert.rejects(listApiModels(value,{settings,fetch}));
 await assert.rejects(listApiModels({},{settings:{read:async()=>({apiKey:''})},fetch}),/请先填写 API Key/);
});
test('errors are readable and never expose remote body, key or transport errors',async()=>{
 for(const status of [401,403,429,500]){
  await assert.rejects(listApiModels({apiKey:'private-key'},{fetch:async()=>new Response('private-key remote secret',{status})}),e=>{assert(!e.message.includes('private-key'));assert(!e.message.includes('remote secret'));return /API|频繁|失败/.test(e.message);});
 }
 await assert.rejects(listApiModels({apiKey:'private-key'},{fetch:async()=>{throw new Error('private-key');}}),/无法连接 API/);
});
test('malformed JSON, schema and unsafe IDs are rejected',async()=>{
 for(const value of [{object:'invalid',data:[]},{object:'list',data:[{object:'invalid',id:'gpt-x'}]},list(['bad\nmodel']),list(['bad\0model']),list(['  ']),list(['x'.repeat(201)]),{object:'list',data:Array(10001).fill({object:'model',id:'gpt-x'})}])assert.throws(()=>modelIds(value),/格式无效/);
 await assert.rejects(listApiModels({apiKey:'key'},{fetch:async()=>new Response('not JSON')}),/格式无效/);
});
test('bounds response size based on both declared length and actual streamed bytes',async()=>{
 await assert.rejects(listApiModels({apiKey:'key'},{fetch:async()=>new Response('{}',{headers:{'content-length':String(MAX_BYTES+1)}})}),/格式无效/);
 let cancelled=false,count=0;
 const body=new ReadableStream({pull(c){count++;c.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}});
 await assert.rejects(listApiModels({apiKey:'key'},{fetch:async()=>new Response(body)}),/格式无效/);
 assert(cancelled);assert(count<=5);
});
test('timeout bounds stalled fetch and aborts its request',async()=>{
 let signal;await assert.rejects(listApiModels({apiKey:'key'},{timeoutMs:15,fetch:async(_,o)=>{signal=o.signal;return new Promise(()=>{});}}),/超时/);assert(signal.aborted);
});
test('timeout also bounds response body stalls',async()=>{
 let signal,cancelled=false;await assert.rejects(listApiModels({apiKey:'key'},{timeoutMs:15,fetch:async(_,o)=>{signal=o.signal;return new Response(new ReadableStream({start(){},cancel(){cancelled=true;}}));}}),/超时/);assert(signal.aborted);assert(cancelled);
});
test('IPC resolves private credentials only in main and uses Electron system-proxy fetch',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../main.cjs'),'utf8'),preload=fs.readFileSync(path.join(__dirname,'../preload.cjs'),'utf8');
 assert.match(main,/ipcMain\.handle\('list-api-models',safe\(input=>listApiModels\(input,\{settings:codexSettings,fetch:\(\.\.\.args\)=>net\.fetch\(\.\.\.args\)\}\)\)\)/);
 assert.match(preload,/listApiModels: value => ipcRenderer\.invoke\('list-api-models', value\)/);
});
test('model lookup uses unsaved or saved third-party base URL without exposing keys',async()=>{
 const fetch=async(url,o)=>{assert.equal(url,'https://provider.invalid/api/v1/models');assert.equal(o.headers.Authorization,'Bearer saved-key');return response(list(['provider-text']));};
 assert.deepEqual(await listApiModels({apiBaseUrl:'https://provider.invalid/api/v1/'},{settings,fetch}),{models:['provider-text']});
 const saved={read:async()=>({apiKey:'saved-key',apiBaseUrl:'https://provider.invalid/api/v1'})};await listApiModels({}, {settings:saved,fetch});
});
test('authentication failures distinguish 401 and 403 without remote body disclosure',async()=>{
 for(const status of [401,403])await assert.rejects(listApiModels({apiKey:'private-key',apiBaseUrl:'https://provider.invalid/api/v1'},{fetch:async()=>new Response('secret',{status})}),error=>error.message.includes(String(status))&&error.message.includes('provider.invalid')&&!error.message.includes('private-key')&&!error.message.includes('secret'));
});
test('compatible provider lists allow omitted object fields and non-ASCII or Cloudflare IDs',()=>{
 assert.deepEqual(modelIds({data:[{id:'@cf/vendor/model'},{id:'中文文本模型'},{id:' model-alias '},{id:'@cf/vendor/model'}]}),['@cf/vendor/model','model-alias','中文文本模型']);
 assert.deepEqual(modelIds({object:'list',data:[{id:'<script>'}]}),['<script>']);
});
