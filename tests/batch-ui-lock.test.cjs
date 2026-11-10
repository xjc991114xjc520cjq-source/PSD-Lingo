const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const code=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../renderer/batch.js')],bundle:true,format:'cjs',platform:'node',write:false}).outputFiles[0].text;
function fixture({makePlan=async()=>({}),call=async()=>null}={}){
 const elements=new Map(),errors=[];
 const $=id=>{if(!elements.has(id))elements.set(id,{value:id==='batchFit'?'adapt':id==='batchMinimum'?'60':'',disabled:false,checked:false,textContent:'',classList:{add(){},remove(){}},listeners:{},addEventListener(name,handler){this.listeners[name]=handler;},replaceChildren(){},append(){},before(){},after(){},closest(){return this;},showModal(){},close(){}});return elements.get(id);};
 const sandbox={module:{exports:{}},exports:{},window:{desktop:{onBatchProgress(){}}},document:{createElement:()=>({append(){},prepend(){},setAttribute(){},addEventListener(){},replaceChildren(){}})}};sandbox.exports=sandbox.module.exports;vm.runInNewContext(code,sandbox);
 sandbox.module.exports.installBatch({$,call,toast:message=>errors.push(message),state:{files:[]},makePlan});
 return {$,errors};
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
test('template load locks all setup and run actions until completion',async()=>{
 const pending=deferred(),calls=[];const {$,errors}=fixture({call:async name=>{calls.push(name);return pending.promise;}});
 const loading=$('loadBatchTemplate').onclick();
 for(const id of ['saveBatchTemplate','loadBatchTemplate','chooseLanguageFolder','runBatch','closeBatch'])assert.equal($(id).disabled,true,id);
 await $('saveBatchTemplate').onclick();await $('chooseLanguageFolder').onclick();await $('runBatch').onclick();
 assert.deepEqual(calls,['loadBatchTemplate']);assert.equal(errors.length,3);
 let prevented=false;$('batchDialog').listeners.cancel({preventDefault(){prevented=true;}});assert.equal(prevented,true);
 pending.resolve({path:'template.json',template:{name:'模板',plan:{files:[],records:[]},bindings:[]}});await loading;
 assert.equal($('loadBatchTemplate').disabled,false);assert.equal($('chooseLanguageFolder').disabled,false);assert.equal($('closeBatch').disabled,false);
});
test('save planning failure unlocks setup controls and later actions can run',async()=>{
 const pending=deferred(),calls=[];const {$,errors}=fixture({makePlan:()=>pending.promise,call:async name=>{calls.push(name);return null;}});
 const saving=$('saveBatchTemplate').onclick();assert.equal($('loadBatchTemplate').disabled,true);
 await $('loadBatchTemplate').onclick();assert.equal(calls.length,0);
 pending.reject(new Error('计划失败'));await saving;assert.equal($('saveBatchTemplate').disabled,false);assert.match(errors.at(-1),/计划失败/);
 await $('loadBatchTemplate').onclick();assert.deepEqual(calls,['loadBatchTemplate']);
});
