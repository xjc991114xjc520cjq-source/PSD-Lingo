const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const code=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../renderer/api-models.js')],bundle:true,format:'cjs',platform:'node',write:false}).outputFiles[0].text;
function fixture(call,{saved=true}={}){
 const elements=new Map(),timers=new Map();let next=0;
 const $=id=>{if(!elements.has(id))elements.set(id,{value:id==='aiMode'?'api':id==='codexModel'?'existing-model':'',open:id==='settingsDialog',textContent:'',disabled:false,options:[],listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},replaceChildren(...items){this.options=items;this.value='';},append(option){this.options.push(option);}});return elements.get(id);};
 const sandbox={module:{exports:{}},exports:{}};sandbox.exports=sandbox.module.exports;vm.runInNewContext(code,sandbox);
 const lifecycle=sandbox.module.exports.installApiModels({$,call,hasSavedKey:()=>saved,createOption:(value,textContent)=>({value,textContent}),schedule:fn=>{timers.set(++next,fn);return next;},unschedule:id=>timers.delete(id)});
 return {$,lifecycle,timers,flush(){for(const fn of timers.values())fn();timers.clear();}};
}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
test('fetches saved-key models on opening and refresh without replacing manually chosen model',async()=>{
 const calls=[],f=fixture(async(name,payload)=>{calls.push([name,payload]);return {models:['gpt-one','gpt-two']};});
 await f.lifecycle.opened();assert.equal(calls[0][0],'listApiModels');assert.equal(calls[0][1].apiKey,undefined);assert.equal(calls[0][1].apiBaseUrl,'https://api.openai.com/v1');assert.equal(calls[0][1].apiProtocol,'auto');assert.equal(f.$('codexModel').value,'existing-model');assert.equal(f.$('apiModelChoices').options.length,3);
 f.$('apiModelChoices').value='gpt-two';f.$('apiModelChoices').onchange();assert.equal(f.$('codexModel').value,'gpt-two');
 await f.$('refreshApiModels').onclick();assert.equal(calls.length,2);assert.equal(f.$('apiModelChoices').value,'gpt-two');
});
test('no saved key gives guidance and entering key debounces discovery without saving',async()=>{
 const calls=[],f=fixture(async(name,payload)=>{calls.push([name,payload]);return {models:[]};},{saved:false});
 await f.lifecycle.opened();assert.equal(calls.length,0);assert.match(f.$('apiModelsState').textContent,/填写 API Key/);
 f.$('apiKey').value='first';f.$('apiKey').listeners.input();f.$('apiKey').value='second';f.$('apiKey').listeners.input();assert.equal(f.timers.size,1);
 f.$('apiKey').listeners.blur();await Promise.resolve();assert.equal(calls.length,1);assert.equal(calls[0][1].apiKey,'second');assert.equal(f.timers.size,0);assert.equal(f.$('codexModel').value,'existing-model');
});
test('key edits, mode switches and dialog close discard stale results',async()=>{
 for(const change of ['key','url','protocol','mode','close']){
  const pending=deferred(),f=fixture(()=>pending.promise);const loading=f.lifecycle.opened();
  if(change==='key'){f.$('apiKey').value='new-key';f.$('apiKey').listeners.input();}
  if(change==='url'){f.$('apiBaseUrl').value='https://provider.example/v1';f.$('apiBaseUrl').listeners.input();}
  if(change==='protocol'){f.$('apiProtocol').value='chat-completions';f.$('apiProtocol').listeners.change();}
  if(change==='mode'){f.$('aiMode').value='local';f.lifecycle.modeChanged();}
  if(change==='close'){f.$('settingsDialog').open=false;f.$('settingsDialog').listeners.close();}
  pending.resolve({models:['stale-model']});await loading;assert.equal(f.$('apiModelChoices').options.length,1,change);assert.equal(f.$('refreshApiModels').disabled,false,change);
 }
});
test('model discovery uses unsaved third-party URL, protocol and key on debounce and refresh',async()=>{
 const calls=[],f=fixture(async(name,payload)=>{calls.push([name,payload]);return {models:['provider-model']};});
 f.$('apiBaseUrl').value='https://provider.example/api/v1';f.$('apiBaseUrl').listeners.input();f.$('apiProtocol').value='chat-completions';f.$('apiProtocol').listeners.change();f.$('apiKey').value='provider-key';f.$('apiKey').listeners.input();assert.equal(f.timers.size,1);
 f.$('apiBaseUrl').listeners.blur();await Promise.resolve();assert.equal(calls.length,1);assert.equal(calls[0][1].apiBaseUrl,'https://provider.example/api/v1');assert.equal(calls[0][1].apiProtocol,'chat-completions');assert.equal(calls[0][1].apiKey,'provider-key');assert.equal(f.$('codexModel').value,'existing-model');
 await f.$('refreshApiModels').onclick();assert.equal(calls.length,2);assert.equal(calls[1][1].apiBaseUrl,calls[0][1].apiBaseUrl);
});
test('unavailable third-party model listing preserves manual entry with actionable guidance',async()=>{
 const f=fixture(async()=>{throw new Error('接口拒绝模型列表请求（403）。');});f.$('apiBaseUrl').value='https://provider.example/v1';await f.lifecycle.opened();
 assert.match(f.$('apiModelsState').textContent,/403/);assert.match(f.$('apiModelsState').textContent,/不代表文案对应不可用/);assert.match(f.$('apiModelsState').textContent,/手动填写模型名称/);assert.equal(f.$('codexModel').value,'existing-model');assert.equal(f.$('refreshApiModels').disabled,false);
});
test('a later refresh wins over an earlier response and fetch failure preserves manual model',async()=>{
 const old=deferred(),current=deferred();let count=0;const f=fixture(()=>++count===1?old.promise:current.promise);
 const first=f.lifecycle.opened(),second=f.$('refreshApiModels').onclick();current.resolve({models:['current']});await second;old.resolve({models:['stale']});await first;
 assert.equal(f.$('apiModelChoices').options[1].value,'current');assert.equal(f.$('codexModel').value,'existing-model');
 const failure=fixture(async()=>{throw new Error('连接失败');});await failure.lifecycle.opened();assert.match(failure.$('apiModelsState').textContent,/连接失败/);assert.equal(failure.$('refreshApiModels').disabled,false);assert.equal(failure.$('codexModel').value,'existing-model');
});
