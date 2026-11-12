const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {installAgent}=require('../services/agent-integration.cjs');
async function fixture(t,{output=true,importWorkbook,onCommand,onThink,productMappings,runArtboards}={}){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'agent-integration-')),handlers={},events={};const file=path.join(directory,'copy.txt');await fs.writeFile(file,'Approved');let selected=[file],steps=[],last,exported=[],commands=[];
 const settings={credentials:async()=>({mode:'api',apiModel:'test',apiKey:'fixture-secret',apiProtocol:'responses',apiBaseUrl:'https://example.invalid/v1'}),get:async()=>({mode:'api',apiModel:'test',executable:'C:/codex.exe',localModel:'local-test'})};
 const safe=fn=>async(_,v)=>{try{return {ok:true,value:await fn(v)}}catch(e){return {ok:false,error:e.message}}};
 const invoke=(name,value)=>handlers[name]({},value);
 const webContents={send:(channel,data)=>{if(channel==='agent-state')last=data;if(channel==='agent-command'){commands.push(data);queueMicrotask(async()=>{let value;if(onCommand)value=await onCommand(data,invoke);else if(data.tool==='prepare_independent_task')value={ok:true,value:{prepared:true}};else if(data.tool==='export_files')value=await invoke('agent-export',{files:[]});else value={ok:true,value:{files:[]}};events['agent-command-result']({sender:webContents},{id:data.id,ok:value.ok,value:value.value,error:value.error});});}}};
 const service=installAgent({importWorkbook,productMappings,runArtboards,ipcMain:{handle:(n,f)=>handlers[n]=f,on:(n,f)=>events[n]=f},dialog:{showOpenDialog:async()=>({canceled:false,filePaths:selected})},window:()=>({webContents}),dataDirectory:()=>directory,settings:()=>settings,guard:()=>{},isBusy:()=>false,localEnv:()=>process.env,safe,runPhotoshop:async(plan,dir)=>{exported.push(dir);return {saved:1,failed:0};},fetch:()=>assert.fail('Assistant cannot use API'),think:async task=>{assert.equal(task.mode,'local');onThink?.(task);return steps.shift()||{kind:'complete',message:'done',tool:'',arguments:'{}',questions:[]};}});t.after(async()=>{await service.close();await fs.rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:20});});
 if(output){selected=[directory];await invoke('agent-output');selected=[file];}
 return {directory,file,invoke,exported,steps,commands,get last(){return last},select:paths=>selected=paths};}
test('missing or vanished output directory is rejected before task creation or model execution',async t=>{
 const f=await fixture(t,{output:false});let r=await f.invoke('agent-start',{request:'Translate',fileIds:[]});assert.equal(r.ok,false);assert.match(r.error,/先选择输出/);assert.equal(f.last,undefined);assert.equal(f.commands.length,0);
 const temporary=path.join(f.directory,'destination');await fs.mkdir(temporary);f.select([temporary]);assert.equal((await f.invoke('agent-output')).ok,true);await fs.rmdir(temporary);
 r=await f.invoke('agent-start',{request:'Translate',fileIds:[]});assert.equal(r.ok,false);assert.match(r.error,/不存在或不可写/);assert.equal(f.commands.length,0);
});
test('follow-up checks output again before appending attachments or user history',async t=>{
 const f=await fixture(t),destination=path.join(f.directory,'followup-output');await fs.mkdir(destination);f.select([destination]);await f.invoke('agent-output');assert.equal((await f.invoke('agent-start',{request:'Analyze',fileIds:[]})).ok,true);await finished(f);const before=JSON.stringify(f.last.history);await fs.rmdir(destination);
 const result=await f.invoke('agent-followup',{text:'Continue',fileIds:[]});assert.equal(result.ok,false);assert.match(result.error,/不存在或不可写/);assert.equal(JSON.stringify(f.last.history),before);
});
async function finished(f){for(let n=0;n<600;n++){if(f.last&&['completed','failed','stopped'].includes(f.last.status))return;await new Promise(r=>setTimeout(r,5));}throw Error('task did not finish');}

test('assistant forwards cross-sheet search and workbook images while blocking image reads inside text batches',async t=>{
 const calls=[],f=await fixture(t,{importWorkbook:async(file,options)=>{calls.push(options);return options.image?{name:'copy.xlsx',referenceFileId:'xlsx-reference:verified',images:['data:image/png;base64,YQ==']}:{matches:[]};}}),book=path.join(f.directory,'copy.xlsx');await fs.writeFile(book,'workbook fixture');
 const picked=await f.invoke('agent-files',{paths:[book]}),fileId=picked.value[0].id;
 const tool=args=>({kind:'tool',message:'Read workbook',tool:'read_document',arguments:JSON.stringify({fileId,...args}),questions:[]});
 f.steps.push(tool({search:['Full original sentence']}),tool({image:{sheet:'海报',media:'xl/media/image.png'}}));
 await f.invoke('agent-start',{request:'Locate exact poster copy',fileIds:[fileId]});await finished(f);
 assert.equal(f.last.status,'completed');assert.deepEqual(calls,[{search:{queries:['Full original sentence'],sheet:undefined,offset:undefined}},{image:{sheet:'海报',media:'xl/media/image.png'}}]);assert.equal(f.last.referenceImages[0].fileId,'xlsx-reference:verified');assert.equal(f.commands.length,0);
 calls.length=0;f.steps.push({kind:'tool',message:'Invalid image batch',tool:'read_batch',arguments:JSON.stringify({queries:[{tool:'read_document',arguments:{fileId,image:{sheet:'海报',media:'xl/media/image.png'}}}]}),questions:[]});await f.invoke('agent-start',{request:'read',fileIds:[fileId]});await finished(f);assert.equal(f.last.status,'failed');assert.equal(calls.length,0);
});

test('readonly batch reads allowlisted documents and returns independent results without write RPC',async t=>{
 const f=await fixture(t),picked=await f.invoke('agent-files'),id=picked.value[0].id;
 f.steps.push({kind:'tool',message:'Read independent data',tool:'read_batch',arguments:JSON.stringify({queries:[{tool:'attachments',arguments:{}},{tool:'read_document',arguments:{fileId:id}}]}),questions:[]});await f.invoke('agent-start',{request:'Read only',fileIds:[id]});await finished(f);assert.equal(f.last.status,'completed');const r=f.last.history.find(h=>h.type==='tool_result').result;assert.equal(r.items[1].result.text,'Approved');assert.equal(f.commands.length,0);
});
test('batch cannot smuggle a write or read paths outside task attachments',async t=>{
 for(const query of [{tool:'export_files',arguments:{}},{tool:'read_document',arguments:{fileId:'unattached'}}]){const f=await fixture(t);f.steps.push({kind:'tool',message:'Invalid batch',tool:'read_batch',arguments:JSON.stringify({queries:[query]}),questions:[]});await f.invoke('agent-start',{request:'Read only',fileIds:[]});await finished(f);assert.equal(f.last.status,'failed');assert.equal(f.commands.length,0);assert.equal(f.exported.length,0);}
});
test('attachments are allowlisted and changed files must be explicitly reattached',async t=>{const f=await fixture(t);let picked=await f.invoke('agent-files');assert.equal(picked.ok,true);await fs.writeFile(f.file,'Modified document');let started=await f.invoke('agent-start',{request:'read',fileIds:[picked.value[0].id]});assert.equal(started.ok,false);assert.match(started.error,/已变化/);const unsupported=path.join(f.directory,'unsafe.exe');await fs.writeFile(unsupported,'fixture');picked=await f.invoke('agent-files',{paths:[unsupported]});assert.equal(picked.ok,false);assert.match(picked.error,/格式/);});
test('native export is authorized only inside export tool and writes into task subdirectory',async t=>{const f=await fixture(t);const denied=await f.invoke('agent-export',{files:[]});assert.equal(denied.ok,false);f.select([f.directory]);await f.invoke('agent-output');f.steps.push({kind:'tool',message:'export',tool:'export_files',arguments:'{}',questions:[]});const started=await f.invoke('agent-start',{request:'export a copy',fileIds:[]});assert.equal(started.ok,true);await finished(f);assert.equal(f.exported.length,1);assert.equal(path.dirname(f.exported[0]),f.directory);assert.ok(path.basename(f.exported[0]).startsWith('Sparkit-'));assert.equal(f.last.status,'completed');assert.equal((await f.invoke('agent-export',{files:[]})).ok,false);});

test('assistant receives folder path then lists, reads and imports discovered files through software',async t=>{
 const f=await fixture(t),dir=path.join(f.directory,'selected-folder');await fs.mkdir(dir);await fs.writeFile(path.join(dir,'copy.txt'),'Read only when requested');await fs.writeFile(path.join(dir,'source.ai'),'Artwork stays at source path');
 const picked=await f.invoke('agent-files',{paths:[dir]});assert.equal(picked.ok,true);assert.equal(picked.value[0].type,'folder');assert.equal(JSON.stringify(picked.value).includes('Read only'),false);
 let round=0;const tool=(name,args)=>({kind:'tool',message:name,tool:name,arguments:JSON.stringify(args),questions:[]});
 f.steps.shift=()=>{round++;if(round===1)return tool('list_folder',{fileId:picked.value[0].id});const items=f.last.history.find(h=>h.type==='tool_result'&&h.tool==='list_folder').result.items;if(round===2)return tool('read_document',{fileId:items.find(x=>x.name==='copy.txt').id});if(round===3)return tool('import_source',{fileId:items.find(x=>x.name==='source.ai').id});};
 await f.invoke('agent-start',{request:'先查看目录，再按需读取文案和导入原稿',fileIds:[picked.value[0].id]});await finished(f);
 assert.equal(f.last.status,'completed',f.last.error);assert.equal(f.last.files.length,1);assert.equal(f.last.history.find(h=>h.type==='tool_result'&&h.tool==='read_document').result.text,'Read only when requested');assert.equal(f.commands.find(x=>x.tool==='import_source').args.path,path.join(dir,'source.ai'));
});


test('project choices persist for new tasks while follow-up keeps the original project snapshot',async t=>{
 const f=await fixture(t),chosen=await f.invoke('agent-project-save',{name:'助手项目',parentDirectory:f.directory});assert.equal(chosen.ok,true);assert.equal(chosen.value.directory,path.join(f.directory,'助手项目'));
 await f.invoke('agent-start',{request:'Analyze',fileIds:[]});await finished(f);assert.equal(f.last.codexProject.name,'助手项目');const firstKey=f.last.codexProject.key;
 await f.invoke('agent-project-save',{name:'新项目',parentDirectory:f.directory});await f.invoke('agent-followup',{text:'Continue',fileIds:[]});await finished(f);assert.equal(f.last.codexProject.key,firstKey);
 await f.invoke('agent-start',{request:'New task',fileIds:[]});await finished(f);assert.equal(f.last.codexProject.name,'新项目');assert.notEqual(f.last.codexProject.key,firstKey);
 const get=await f.invoke('agent-project');assert.equal(get.value.name,'新项目');assert.equal((await fs.stat(path.join(f.directory,'agent-project.json'))).isFile(),true);
});

test('independent tasks reset before model, keep follow-up state and reject out-of-task exports before writes',async t=>{
 const plans=[],seen=[],f=await fixture(t,{onThink:task=>seen.push({prepared:task.workspacePrepared,paths:[...task.sourcePaths]}),onCommand:async(data,invoke)=>{
  if(data.tool==='prepare_independent_task')return {ok:true,value:{prepared:true}};
  if(data.tool==='export_files'){const r=await invoke('agent-export',plans.shift());return r;}
  return {ok:true,value:{imported:true}};
 }}),source=path.join(f.directory,'06.ai'),stale=path.join(f.directory,'05.ai');await fs.writeFile(source,'new source');const id=(await f.invoke('agent-files',{paths:[source]})).value[0].id;
 const tool=(name,args={})=>({kind:'tool',message:name,tool:name,arguments:JSON.stringify(args),questions:[]});
 plans.push({files:[{path:stale}]});f.steps.push(tool('import_source',{fileId:id}),tool('export_files'));
 await f.invoke('agent-start',{request:'Only new source',fileIds:[id],workspaceMode:'independent'});await finished(f);
 assert.equal(seen[0].prepared,true);assert.deepEqual(seen[0].paths,[]);assert.equal(f.commands[0].tool,'prepare_independent_task');assert.equal(f.exported.length,0);assert.match(f.last.error,/本独立任务以外/);assert.deepEqual(f.last.sourcePaths,[source]);assert.equal(f.last.workspaceMode,'independent');
 plans.push({files:[{path:source}]});f.steps.push(tool('export_files'));await f.invoke('agent-followup',{text:'Continue with correct scope',fileIds:[id]});await finished(f);
 assert.equal(f.last.status,'completed',f.last.error);assert.equal(f.exported.length,1);assert.equal(f.commands.filter(c=>c.tool==='prepare_independent_task').length,1);
});

test('independent workspace reset failure blocks all model execution',async t=>{
 let calls=0;const f=await fixture(t,{onThink:()=>calls++,onCommand:async()=>({ok:false,error:'reset failed'})});await f.invoke('agent-start',{request:'new',fileIds:[],workspaceMode:'independent'});await finished(f);assert.equal(calls,0);assert.equal(f.last.status,'failed');assert.match(f.last.error,/reset failed/);
});

 test('product workflow requires confirmed identity and same task attachments before renderer operations',async t=>{
  let record,reads=0;const service={read:async()=>{reads++;return record;}};const f=await fixture(t,{productMappings:service});const source=path.join(f.directory,'source.psb'),book=path.join(f.directory,'products.xlsx');await fs.writeFile(source,'synthetic attachment');await fs.writeFile(book,'synthetic workbook');const picked=await f.invoke('agent-files',{paths:[source,book]}),[a,b]=picked.value;
  record={id:'mapping',source:{path:source},workbook:{path:book},report:{},approved:null};const op=tool=>({kind:'tool',message:'product operation',tool,arguments:JSON.stringify({mappingId:'mapping',sourceFileId:a.id,workbookFileId:b.id}),questions:[]});
  f.steps.push(op('import_product_mapping'));await f.invoke('agent-start',{request:'Match products',fileIds:[a.id,b.id]});await finished(f);assert.equal(f.last.status,'failed');assert.match(f.last.error,/用户确认/);assert.equal(f.commands.length,0);
  record.approved={approvalDigest:'approved',boards:[]};f.steps.push(op('import_product_mapping'));await f.invoke('agent-start',{request:'Import confirmed products',fileIds:[a.id,b.id]});await finished(f);assert.equal(f.last.status,'completed');assert.equal(f.commands.at(-1).tool,'import_product_mapping');assert.equal(f.commands.at(-1).args.mapping.approved.approvalDigest,'approved');
  record.workbook.path=path.join(f.directory,'different.xlsx');f.steps.push(op('configure_product_copy'));await f.invoke('agent-start',{request:'Prevent foreign mapping',fileIds:[a.id,b.id]});await finished(f);assert.equal(f.last.status,'failed');assert.match(f.last.error,/本任务附件/);assert.equal(reads,3);
 });

test('template tools accept only current attachments and forward trusted template identity through the software RPC',async t=>{
 let mapping,calls=0;const f=await fixture(t,{productMappings:{read:async()=>mapping},runArtboards:async input=>{calls++;assert.equal(input.templateAction,'inspect_product_template');assert.equal(input.templateInput.path,template);assert.match(input.templateInput.fingerprint,/^[a-f0-9]{64}$/);return {scanId:'verified'};},onCommand:async(data,invoke)=>{
  assert.equal(data.tool,'inspect_product_template');assert.equal(data.args.templateInput.path,template);
  return invoke('agent-artboards',{action:'metadata',source:{path:source,fingerprint:'source'},productMapping:'mapping',templateFileId:data.args.templateFileId,templateArgs:{}});
 }});const source=path.join(f.directory,'source.psb'),book=path.join(f.directory,'products.xlsx'),template=path.join(f.directory,'footer.psb');await fs.writeFile(source,'source');await fs.writeFile(book,'workbook');await fs.writeFile(template,'template');
 const picked=(await f.invoke('agent-files',{paths:[source,book,template]})).value;mapping={id:'mapping',source:{path:source},workbook:{path:book},approved:{approvalDigest:'approved'}};
 const op=id=>({kind:'tool',message:'inspect',tool:'inspect_product_template',arguments:JSON.stringify({sourceFileId:picked[0].id,workbookFileId:picked[1].id,mappingId:'mapping',templateFileId:id}),questions:[]});
 f.steps.push(op(picked[2].id));await f.invoke('agent-start',{request:'Inspect footer',fileIds:picked.map(x=>x.id)});await finished(f);assert.equal(f.last.status,'completed',f.last.error);assert.equal(calls,1);
 f.steps.push(op(picked[2].id));await f.invoke('agent-start',{request:'No foreign attachments',fileIds:picked.slice(0,2).map(x=>x.id)});await finished(f);assert.equal(f.last.status,'failed');assert.match(f.last.error,/不属于本任务/);assert.equal(calls,1);
});

test('multi-template assistant RPC forwards all trusted sources and rejects a missing second attachment',async t=>{
 let mapping,calls=0;const f=await fixture(t,{productMappings:{read:async()=>mapping},runArtboards:async input=>{calls++;assert.equal(input.templateAction,'configure_product_template');assert.deepEqual(input.templateInputs.map(t=>t.template.path),[a,b]);assert.ok(input.templateInputs.every(t=>/^[a-f0-9]{64}$/.test(t.template.fingerprint)));assert.equal(input.templateArgs.templates[1].giftMode,'none');return {plan:{}};},onCommand:async(data,invoke)=>invoke('agent-artboards',{action:'metadata',source:{path:source,fingerprint:'source'},productMapping:'mapping',templateArgs:data.args})});
 const source=path.join(f.directory,'source.psb'),book=path.join(f.directory,'book.xlsx'),a=path.join(f.directory,'A.psd'),b=path.join(f.directory,'B.psb');for(const p of [source,book,a,b])await fs.writeFile(p,p);const picked=(await f.invoke('agent-files',{paths:[source,book,a,b]})).value;mapping={id:'mapping',source:{path:source},workbook:{path:book},approved:{approvalDigest:'approved'}};
 const op=()=>({kind:'tool',message:'configure',tool:'configure_product_template',arguments:JSON.stringify({sourceFileId:picked[0].id,workbookFileId:picked[1].id,mappingId:'mapping',templates:[{templateFileId:picked[2].id,scanId:'a'},{templateFileId:picked[3].id,scanId:'b',giftMode:'none'}]}),questions:[]});
 f.steps.push(op());await f.invoke('agent-start',{request:'Route two templates',fileIds:picked.map(p=>p.id)});await finished(f);assert.equal(f.last.status,'completed',f.last.error);assert.equal(calls,1);
 f.steps.push(op());await f.invoke('agent-start',{request:'Reject foreign second template',fileIds:picked.slice(0,3).map(p=>p.id)});await finished(f);assert.equal(f.last.status,'failed');assert.match(f.last.error,/不属于本任务/);assert.equal(calls,1);
});
