const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness(){
 const root=path.resolve(__dirname,'..'),handlers={},calls={dialogs:0,reads:[],psds:[]},state={directory:false,size:20,text:'第一条\n第二条',cancel:false};
 const io={stat:async()=>({size:state.size,isFile:()=>!state.directory}),readFile:async(p,encoding)=>{calls.reads.push(p);return encoding?state.text:Buffer.from(state.text);}};
 const mocks={'./services/diagnostic-cloud.cjs':{createDiagnosticCloud:()=>({record:async()=>'',close(){}}),createAgentDiagnostics:()=>()=>{}},electron:{app:{isPackaged:false,getVersion:()=> 'test',getPath:()=>'/mock',whenReady:()=>new Promise(()=>{}),on(){}},ipcMain:{on(){},handle:(n,f)=>handlers[n]=f},dialog:{showOpenDialog:async()=>{calls.dialogs++;return {canceled:state.cancel,filePaths:['C:/示例.TXT']};}}},'node:fs/promises':io,'./photoshop-file-io.cjs':{},'./photoshop-metadata.cjs':{},'./photoshop-preview.cjs':{},'./services/authorization.cjs':{Authorization:class{}},'./services/codex-settings.cjs':{CodexSettings:class{}},'./services/updates.cjs':{Updates:class{}},'./batch.cjs':{validateTemplate:t=>t}};
 const context={require:n=>Object.hasOwn(mocks,n)?mocks[n]:require(n.startsWith('.')?path.resolve(root,n):n),module:{exports:{}},__dirname:root,process,Buffer,structuredClone,console};
 vm.runInNewContext(fs.readFileSync(root+'/main.cjs','utf8')+'\nreadPsd=async p=>{__calls.psds.push(p);return {path:p};};checkPlan=async p=>p;',Object.assign(context,{__calls:calls}));
 return {calls,state,run:(channel,value)=>handlers[channel](null,value)};
}
test('dropped PSD and PSB use the existing import path without dialogs and deduplicate',async()=>{
 const {run,calls}=harness(),r=await run('import-psd',{paths:['C:/中文.PSD','C:/高图.psb','C:/中文.PSD']});assert.equal(r.ok,true);assert.equal(r.value.length,2);assert.equal(calls.psds.length,2);assert.equal(calls.dialogs,0);
});
test('drop path validation rejects relative, unsupported, directories and invalid lists before importing',async()=>{
 for(const paths of [['relative.psd'],['C:/bad.txt'],[],null,Array(101).fill('C:/a.psd')]){const {run,calls}=harness(),r=await run('import-psd',{paths});assert.equal(r.ok,false);assert.equal(calls.psds.length,0);assert.equal(calls.dialogs,0);}
 const {run,state,calls}=harness();state.directory=true;assert.equal((await run('import-psd',{paths:['C:/folder.psd']})).ok,false);assert.equal(calls.psds.length,0);
});
test('dropped language document preserves splitting and skips dialog; large file is accepted without a size gate',async()=>{
 const {run,state,calls}=harness();let r=await run('import-document',{path:'C:/中文.TXT',splitMode:'line'});assert.equal(r.ok,true);assert.equal(r.value.records.length,2);assert.equal(r.value.splitMode,'line');assert.equal(calls.dialogs,0);state.size=20*1024*1024+1;calls.reads.length=0;r=await run('import-document',{path:'C:/中文.txt'});assert.equal(r.ok,true);assert.equal(r.value.records.length,2);assert.equal(calls.reads.length,1);
});
test('project and batch template drops use supplied JSON path without dialogs',async()=>{
 const {run,state,calls}=harness();state.text=JSON.stringify({version:1,files:[],records:[]});let r=await run('load-project',{path:'C:/绑定.psdlingo.json'});assert.equal(r.ok,true);state.text=JSON.stringify({plan:{files:[]}});r=await run('load-batch-template',{path:'C:/模板.psdlingo-template.json'});assert.equal(r.ok,true);assert.equal(r.value.path,path.normalize('C:/模板.psdlingo-template.json'));assert.equal(calls.dialogs,0);assert.equal((await run('load-project',{path:'C:/bad.exe'})).ok,false);
});
test('click imports still show dialog and cancellation keeps old return contracts',async()=>{
 const {run,state,calls}=harness();assert.equal((await run('import-document')).ok,true);state.cancel=true;assert.equal((await run('import-document')).value,null);assert.equal((await run('import-psd')).value.length,0);assert.equal((await run('load-project')).value,null);assert.equal((await run('load-batch-template')).value,null);assert.equal(calls.dialogs,5);
});
test('preload exposes synchronous webUtils drop path bridge and optional IPC paths',()=>{
 let desktop;const calls=[];vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../preload.cjs'),'utf8'),{process:{platform:'darwin'},require:()=>({contextBridge:{exposeInMainWorld:(_,value)=>desktop=value},webUtils:{getPathForFile:f=>f.nativePath||''},ipcRenderer:{invoke:(...args)=>{calls.push(args);},on(){},removeListener(){}}})});
 assert.equal(desktop.platform,'darwin');assert.deepEqual(Array.from(desktop.getDroppedPaths([{nativePath:'C:/中文.psd'},{}])),['C:/中文.psd']);desktop.importPsd({paths:['C:/中文.psd']});desktop.loadProject({path:'C:/项目.json'});desktop.loadBatchTemplate({path:'C:/模板.json'});assert.equal(calls[0][0],'import-psd');assert.equal(calls[0][1].paths[0],'C:/中文.psd');assert.equal(calls[1][1].path,'C:/项目.json');assert.equal(calls[2][1].path,'C:/模板.json');
});
