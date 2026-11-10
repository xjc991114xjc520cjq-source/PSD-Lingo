const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness(){
 const root=path.resolve(__dirname,'..'),calls={wholeFileReads:0,hashes:0,nativeMetadata:0},fingerprint='verified-6-gib-sha';
 const layer={id:42,name:'Title',original:'Hello',font:'ArialMT',size:40,minSize:30,box:[80,80,200,45],supported:true,issues:[]};
 const metadata={width:800,height:36000,bitsPerChannel:8,colorMode:3,layers:[layer]};
 const state={fingerprint},handlers={};
 const fileIO={inspectFile:async()=>({format:'PSB',width:800,height:36000,stat:{size:6*1024**3}}),hashFile:async()=>{calls.hashes++;if(state.hashWait)await state.hashWait;return state.fingerprint;}};
 const mocks={electron:{app:{isPackaged:false,getPath:()=>'/mock-data',whenReady:()=>({then(){}}),on(){}},ipcMain:{on(){},handle(name,fn){handlers[name]=fn;}},dialog:{}},'node:fs/promises':{readFile:async()=>{calls.wholeFileReads++;throw new Error('PSB full-file read forbidden');}},'./photoshop-file-io.cjs':fileIO,'./photoshop-metadata.cjs':{readPhotoshopMetadata:async()=>{calls.nativeMetadata++;return structuredClone(metadata);}},'./photoshop-preview.cjs':{createBackground:async()=>'data:image/png;base64,cHJldmlldw==',installedFonts(){},decodeBridgeOutput(){}},'./services/authorization.cjs':{helper(){},Authorization:class{}},'./services/codex-settings.cjs':{CodexSettings:class{}},'./services/updates.cjs':{Updates:class{}},'./core.cjs':{validatePlan:p=>p}};
 const context={require:n=>Object.hasOwn(mocks,n)?mocks[n]:require(n.startsWith('.')?path.resolve(root,n):n),module:{exports:{}},__dirname:root,process,Buffer,structuredClone,console};
 vm.runInNewContext(fs.readFileSync(root+'/main.cjs','utf8')+'\nauthorization={assert(){}};updates={assert(){}};module.exports={readPsd,checkPlan,runPhotoshop};',context);
 const plan={files:[{path:'C:/6GiB.psb',fingerprint,jobs:[{layerId:42,original:'Hello',font:'ArialMT',size:40,box:[80,80,200,45],position:{x:100,y:200}}]}]};
 return {api:context.module.exports,calls,state,plan,handlers};
}
test('6 GiB import, source validation and position checks never buffer PSB or send its bytes to renderer',async()=>{
 const {api,calls,plan}=harness();const imported=await api.readPsd('C:/6GiB.psb');assert.equal(imported.format,'PSB');assert.equal(imported.metadata.height,36000);assert.equal(imported.bytes,undefined);await api.checkPlan(plan);assert.equal(calls.wholeFileReads,0);assert.equal(calls.nativeMetadata,1);assert.equal(calls.hashes,3);
});
test('renderer metadata edits cannot mutate private verified source cache',async()=>{
 const {api,plan}=harness();const imported=await api.readPsd('C:/6GiB.psb');imported.metadata.layers[0].original='Forged';await api.checkPlan(plan);plan.files[0].jobs[0].original='Forged';await assert.rejects(api.checkPlan(plan),/元数据校验失败/);
});
test('streamed source changes and invalid positions reject before export without source reallocation',async()=>{
 const {api,state,plan,calls}=harness();await api.readPsd('C:/6GiB.psb');plan.files[0].jobs[0].position.x=800;await assert.rejects(api.checkPlan(plan),/超出画布/);state.fingerprint='changed';await assert.rejects(api.checkPlan(plan),/已发生变化/);assert.equal(calls.wholeFileReads,0);
});
test('preview reserves Photoshop while its streamed fingerprint is pending',async()=>{
 const {api,state,handlers}=harness();await api.readPsd('C:/6GiB.psb');let release;state.hashWait=new Promise(resolve=>{release=resolve;});
 const pending=handlers['preview-background'](null,{path:'C:/6GiB.psb',fingerprint:state.fingerprint,ids:[]});
 await assert.rejects(api.readPsd('C:/another.psb'),/Photoshop 正忙/);const fonts=await handlers['installed-fonts'](null);assert.equal(fonts.ok,false);
 release();state.hashWait=null;assert.equal((await pending).ok,true);await api.readPsd('C:/another.psb');
});
test('export reserves Photoshop during plan validation and releases it on validation failure',async()=>{
 const {api,state,plan}=harness();await api.readPsd('C:/6GiB.psb');let release;state.hashWait=new Promise(resolve=>{release=resolve;});state.fingerprint='changed';
 const pending=api.runPhotoshop(plan);await assert.rejects(api.readPsd('C:/another.psb'),/Photoshop 正忙/);release();state.hashWait=null;
 await assert.rejects(pending,/已发生变化/);await api.readPsd('C:/another.psb');
});
