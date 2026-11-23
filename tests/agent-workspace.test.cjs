const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path'),esbuild=require('esbuild');
const compiled=esbuild.buildSync({entryPoints:[path.resolve(__dirname,'../renderer/agent-workspace.js')],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const mod={exports:{}};vm.runInNewContext(compiled,{module:mod,exports:mod.exports,require,structuredClone,console,TextEncoder,crypto:require('node:crypto').webcrypto});
const {createAgentWorkspace}=mod.exports;

test('layout reuse commits once and invalidates for changes to task, model/rules, content, references and force flag',async()=>{
 const code=esbuild.buildSync({entryPoints:[path.resolve(__dirname,'../renderer/agent-workspace.js')],bundle:true,platform:'node',format:'cjs',write:false,external:['../design-layout-planner.cjs']}).outputFiles[0].text;
 let plans=0,commits=0,context={taskId:'first',revision:0,model:'selected',knowledge:['r1'],warnings:[]};const out={exports:{}};
 vm.runInNewContext(code,{module:out,exports:out.exports,structuredClone,console,require:name=>name.endsWith('design-layout-planner.cjs')?{planAiFile:async({file})=>{plans++;return {accepted:[{id:1,candidate:{manual:{size:30}}}],working:file,failures:[]};}}:require(name)});
 const state={files:[{fingerprint:'source',layers:[{id:1,recordId:'r',box:[0,0,100,20]}]}],records:[{id:'r',target:'Approved'}]};const run=out.exports.createAgentWorkspace({state,call:async()=>context,selectFile:()=>{},selectedLayer:()=>{},history:{transaction:fn=>{commits++;fn();}},render:()=>{}}),args={fileIndex:0};
 await run('design_layout',args);assert.equal((await run('design_layout',args)).reused,true);assert.equal(plans,1);assert.equal(commits,1);
 for(const change of [()=>context.revision++,()=>context.model='new-model',()=>context.knowledge=['r2'],()=>state.records[0].target='Updated copy',()=>state.files[0].layers[0].manual.size=35,()=>context.taskId='next-task']){change();await run('design_layout',args);assert.equal((await run('design_layout',args)).reused,true);}
 assert.equal(plans,7);assert.equal((await run('design_layout',{...args,replan:true})).stoppedNoProgress,true);assert.equal(plans,7);await run('design_layout',{...args,referenceFileIds:['new-reference']});assert.equal(plans,8);context.warnings=['Invalid rule file'];await run('design_layout',args);await run('design_layout',args);assert.equal(plans,10);
});
function fixture(call=async()=>{}){const state={files:[{name:'source.ai',path:'source.ai',layers:[{id:1,name:'Title',original:'标题',issues:[]},{id:2,name:'kept',recordId:'old',issues:[]}]}],records:[{id:'old',target:'Old'},{id:'new',target:'New'}]},transactions=[];return {state,transactions,run:createAgentWorkspace({state,call,history:{transaction:(fn,reason)=>{transactions.push(reason);fn();}},render:()=>{},selectFile:()=>{},selectedLayer:()=>{},importOriginal:async()=>{},getVisual:()=>[],makePlan:async()=>({files:[]})})};}
test('full font configuration needs no copy document and is atomic across all editable targets',async()=>{
 let reads=0;const f=fixture(async name=>{assert.equal(name,'installedFonts');reads++;return [{name:'New-Regular',family:'New',style:'Regular'}];}),file=f.state.files[0];file.format='AI';file.layers=file.layers.map(l=>({...l,original:l.original||'Original',font:'Old',supported:true}));const original=JSON.stringify(file.layers),records=JSON.stringify(f.state.records);
 const r=await f.run('configure_typography',{fileIndex:0,font:'New-Regular',tracking:0});assert.equal(r.changed,2);assert.equal(f.transactions.at(-1),'font-change');assert.equal(file.layers[1].recordId,'old');assert.equal(JSON.stringify(f.state.records),records);assert.equal(file.layers[0].original,'标题');
 const saved=JSON.stringify(file);await assert.rejects(f.run('configure_typography',{fileIndex:0,font:'New-Regular',overrides:[{layerId:1,sizeScale:.9,reason:'visual'}]}),/未授权/);assert.equal(JSON.stringify(file),saved);assert.equal(reads,1);assert.notEqual(JSON.stringify(file.layers),original);
});
test('native font configuration preserves prior translated targets, mixed spans, geometry and unrelated records',async()=>{
 const f=fixture(async()=>[{name:'New-Regular',family:'New',style:'Regular'}]),file=f.state.files[0];Object.assign(file,{format:'PSB',width:400,height:300,nativeTextScanId:'scan',layers:[{id:'native:a',name:'Mixed',original:'$79',font:'Old',nativePath:[0,0],boardId:1,issues:[],mixedStyleRuns:[{from:0,to:1,size:14},{from:1,to:3,size:30}]},{id:'native:b',name:'Body',original:'Body\nNext',font:'Old',nativePath:[0,1],boardId:1,issues:[]}],artboards:[{id:1,name:'A',box:[0,0,400,300],nativePath:[0]}]});f.state.records=[{id:'r',target:'€199',digest:'d'}];
 await f.run('configure_native_text',{fileIndex:0,scanId:'scan',changes:[{layerId:'native:a',original:'$79',recordIds:['r'],spans:[{text:'€',sourceStart:0},{text:'199',sourceStart:1}],reason:'approved',layout:{coordinateSpace:'object-document',offset:[2,4]}}]});
 await f.run('configure_typography',{fileIndex:0,font:'New-Regular',autoSize:true,overrides:[{layerId:'native:a',sizeScale:.9,reason:'实际标题视觉宽度'}]});const a=file.artboardPlan.boards[0].changes.find(c=>c.layerId==='native:a'),b=file.artboardPlan.boards[0].changes.find(c=>c.layerId==='native:b');assert.equal(a.target,'€199');assert.equal(a.layout.typography.sizeScale,.9);assert.deepEqual(JSON.parse(JSON.stringify(a.layout.offset)),[2,4]);assert.equal(a.spans.length,2);assert.equal(b.target,'Body\nNext');assert.equal(file.layers[0].original,'$79');assert.ok(f.state.records.some(r=>r.id==='r'));assert.equal(f.state.records.length,2);
});
test('native scan expansion retains configured copy and layout, and rejects changed targets without mutation',async()=>{
 let changed=false,calls=0;const layer={id:'native:a',original:'Original',nativePath:[0],boardId:1,issues:[]},boards=[{id:1,name:'A',box:[0,0,400,300],nativePath:[0]}];
 const f=fixture(async(name,args)=>{calls++;assert.equal(args.nativeTextScanId,calls===1?'first':'second');return {nativeTextScanId:'second',artboards:boards,layers:[{...layer,original:changed?'Unexpected':'Original'},{id:'native:b',original:'Other',boardId:1,nativePath:[1],issues:[]}]};}),file=f.state.files[0];
 Object.assign(file,{format:'PSB',width:400,height:300,nativeTextScanId:'first',layers:[layer],artboards:boards});f.state.records=[{id:'r',target:'Approved'}];
 await f.run('configure_native_text',{fileIndex:0,scanId:'first',documentName:'Kept',changes:[{layerId:layer.id,original:'Original',recordIds:['r'],spans:[{text:'Approved',sourceStart:0}],reason:'approved',layout:{coordinateSpace:'object-document',offset:[2,3]}}]});
 const before=JSON.stringify(file.artboardPlan.boards);await f.run('inspect_native_text',{fileIndex:0,boardIds:[1]});assert.equal(JSON.stringify(file.artboardPlan.boards),before);assert.equal(file.artboardPlan.documentName,'Kept');assert.equal(file.artboardPlan.nativeTextScanId,'second');assert.equal(f.state.records.length,1);
 const stateBefore=JSON.stringify(file),commits=f.transactions.length;changed=true;await assert.rejects(f.run('inspect_native_text',{fileIndex:0}),/来源或样式变化/);assert.equal(JSON.stringify(file),stateBefore);assert.equal(f.transactions.length,commits);
});

test('mixed style edits use an undo transaction, reject missing copy and preserve independent parameter labels',async()=>{
 const f=fixture(),file=f.state.files[0];file.format='AI';Object.assign(file.layers[0],{original:'1亿次',issues:['混合文字样式尚不支持'],alignment:'center'});
 const target='Lifespan: 100 Million Keystrokes';f.state.records.push({id:'life',target,digest:require('../core.cjs').hash(target)});
 const args={layerKey:'0:0',recordId:'life',part:'parameter-value',spans:[{text:'100 Million',sourceStart:0},{text:' Keystrokes',sourceStart:1}],reason:'Preserve original mixed number typography'};
 await assert.rejects(f.run('edit_mixed_text',{...args,spans:[{text:'100',sourceStart:0}]}));assert.equal(f.transactions.length,0);
 const result=await f.run('edit_mixed_text',args);assert.equal(result.changed,true);assert.equal(file.mixedTextEdits[0].target,'100 Million Keystrokes');assert.equal(file.layers[1].recordId,'old');assert.equal(file.layers[0].original,'1亿次');assert.equal(f.transactions[0],'ai-mixed-text');
 const workspace=await f.run('workspace',{});assert.equal(workspace.files[0].layers[0].mixedTextEdit.target,'100 Million Keystrokes');
 await f.run('edit_mixed_text',{layerKey:'0:0',restore:true});assert.equal(file.mixedTextEdits.length,0);assert.equal(f.transactions.at(-1),'ai-mixed-text-restore');
});

test('assistant cannot remove a mixed-style parameter value through either text or artwork tools',async()=>{
 const f=fixture(),file=f.state.files[0];Object.assign(file,{format:'AI',fingerprint:'source',artworkObjects:[{objectId:'t:1',layerId:1,sourceIdentity:'source'}]});
 Object.assign(file.layers[0],{original:'3.55±0.3mm',issues:['混合文字样式尚不支持']});
 await assert.rejects(f.run('set_text_presence',{layerKey:'0:0',mode:'clear',reason:'Put the entire parameter in the label'}),/原有参数数值/);
 await assert.rejects(f.run('set_artwork_visibility',{fileIndex:0,objectId:'t:1',hidden:true,mode:'clear',reason:'Remove repeated old value'}),/原有参数数值/);assert.equal(f.transactions.length,0);
});
test('copy-edit of a compound parameter row cannot replace the original label with value-plus-label prose',async()=>{
 const f=fixture(),file=f.state.files[0];Object.assign(file.layers[0],{original:'总行程',box:[50,145,100,20]});file.layers.push({id:3,original:'3.55±0.3mm',box:[50,100,100,40],font:'Display-Bold',size:38,issues:['mixed']});
 f.state.records.push({id:'parameter',original:'3.55±0.3MM 总行程',target:'Total Travel: 3.55 ± 0.3 mm'});
 await f.run('edit_text',{changes:[{layerKey:'0:0',recordIds:['parameter'],reason:'Approved translation row'}]});assert.equal(file.layers[0].customText,'Total Travel');assert.equal(file.layers[2].font,'Display-Bold');assert.equal(file.layers[2].size,38);assert.equal(file.layers[2].skipExport,undefined);
});

test('same attachment selection import preserves bindings; changed identity requires explicit replacement',async()=>{
 let reads=0;const f=fixture(async()=>{reads++;return {records:[{id:'fresh',target:'Approved'}],name:'copy',fingerprint:'doc'};});const args={path:'D:/copy.xlsx',attachmentIdentity:'v1',selection:{segments:[{sheet:'EN'}]},replaceExisting:true};await f.run('import_document',args);f.state.files[0].layers[0].recordId='fresh';f.state.files[0].layers[0].customText='User adjustment';const result=await f.run('import_document',{...args,replaceExisting:false});assert.equal(result.reused,true);assert.equal(reads,1);assert.equal(f.state.files[0].layers[0].customText,'User adjustment');await assert.rejects(f.run('import_document',{...args,attachmentIdentity:'v2',replaceExisting:false}),/现有绑定/);await assert.rejects(f.run('import_document',{...args,selection:{segments:[{sheet:'RU'}]},replaceExisting:false}),/现有绑定/);
});
test('assistant must inspect exact source object before reversible hiding; restore preserves prior text state',async()=>{
 const o={objectId:'t:1',sourceIdentity:'verified',kind:'editable-text',layerId:1,box:[20,20,80,20],boardBox:[0,0,500,800],boardNames:['A']};
 const f=fixture(async(name,args)=>{assert.equal(name,'inspectArtwork');assert.equal(args.objectId,o.objectId);return {object:o,images:['before','without'],evidence:[{stage:'object-before'}]};});
 Object.assign(f.state.files[0],{format:'AI',fingerprint:'source',artworkObjects:[o]});
 const args={fileIndex:0,objectId:o.objectId,hidden:true,reason:'Confirmed complete repeated language'};
 await assert.rejects(f.run('set_artwork_visibility',args),/inspect_artwork/);assert.equal(f.state.files[0].artworkHides,undefined);
 assert.equal((await f.run('artwork_objects',{fileIndex:0})).objects.length,1);await f.run('inspect_artwork',args);
 await f.run('set_artwork_visibility',args);assert.equal(f.state.files[0].layers[0].visible,false);assert.equal(f.state.files[0].layers[0].skipExport,true);assert.equal(f.transactions.at(-1),'ai-artwork-visibility');
 const persisted=JSON.parse(JSON.stringify(f.state.files[0]));assert.equal(persisted.artworkHides[0].sourceIdentity,'verified');
 await f.run('set_artwork_visibility',{...args,hidden:false});assert.equal(f.state.files[0].artworkHides.length,0);assert.equal(f.state.files[0].layers[0].visible,true);assert.equal(f.state.files[0].layers[0].skipExport,false);
});
test('stale object inspection never authorizes hiding',async()=>{
 const f=fixture(async()=>({object:{sourceIdentity:'different'},images:[]}));Object.assign(f.state.files[0],{format:'AI',artworkObjects:[{objectId:'g:1',sourceIdentity:'source'}]});await assert.rejects(f.run('inspect_artwork',{fileIndex:0,objectId:'g:1'}),/已变化/);assert.equal(f.transactions.length,0);
});
test('software bindings modify actual workspace through undo transaction and keep existing bindings',async()=>{const f=fixture();const result=await f.run('bind_copy',{matches:[{layerKey:'0:0',recordId:'new'},{layerKey:'0:1',recordId:'new'}]});assert.equal(result.bound,1);assert.equal(f.state.files[0].layers[0].recordId,'new');assert.equal(f.state.files[0].layers[1].recordId,'old');assert.deepEqual(f.transactions,['ai-binding']);});
test('selected assistant model reaches nested matching and discarded responses cannot modify project',async()=>{let request,current=true;const f=fixture(async(name,args)=>{request={name,args};current=false;return {matches:[{layerKey:'0:0',recordId:'new'}]};});await assert.rejects(f.run('auto_bind',{},'selected',()=>current),/过期/);assert.equal(request.args.assistantModel,'selected');assert.equal(f.state.files[0].layers[0].recordId,undefined);});
test('document replacement requires explicit flag and stale parsed results keep current bindings',async()=>{let reads=0,current=true;const f=fixture(async()=>{reads++;current=false;return {records:[{id:'x',target:'x'}],name:'new'};});await assert.rejects(f.run('import_document',{path:'copy.txt'}),/现有绑定/);assert.equal(reads,0);await assert.rejects(f.run('import_document',{path:'copy.txt',replaceExisting:true},'',()=>current),/未替换/);assert.equal(f.state.files[0].layers[1].recordId,'old');});
test('export blocked layers return to AI instead of opening a hidden confirmation dialog',async()=>{const f=fixture(()=>assert.fail('No export'));f.state.files[0].layers[1].issues=['unsupported'];const result=await f.run('export_files',{});assert.equal(result.exported,false);assert.equal(result.blocked.length,1);});

test('copy merge retains full imported records, edits only target layer and uses undo transaction',async()=>{const f=fixture();const result=await f.run('edit_text',{changes:[{layerKey:'0:0',recordIds:['old','new'],separator:'\n',reason:'两条译文对应同一文字对象'}]});assert.equal(result.edited,1);assert.equal(f.state.files[0].layers[0].customText,'Old\nNew');assert.equal(f.state.records[0].target,'Old');assert.equal(f.state.files[0].layers[1].customText,undefined);assert.equal(f.transactions[0],'ai-copy-edit');});
test('copy edits validate every change before mutation and cannot edit skipped or unsupported text',async()=>{const f=fixture();await assert.rejects(f.run('edit_text',{changes:[{layerKey:'0:1',text:'Updated',reason:'时间已确认'},{layerKey:'0:99',text:'x',reason:'x'}]}),/不存在/);assert.equal(f.state.files[0].layers[1].customText,undefined);f.state.files[0].layers[1].skipExport=true;await assert.rejects(f.run('edit_text',{changes:[{layerKey:'0:1',text:'Updated',reason:'x'}]}),/跳过/);});
test('bound preview refuses original-only images so assistant cannot mistake source for translation',async()=>{const f=fixture();await assert.rejects(f.run('preview',{fileIndex:0}),/替换预览缺失/);});

test('assistant can inspect a verified artboard and local detail without changing the workspace',async()=>{
 const state={files:[{width:1000,height:800,layers:[{id:7,box:[300,100,50,20],boardNames:['Panel B'],boardBox:[250,0,500,800]}]}],records:[]};const before=JSON.stringify(state);let seen;
 const run=createAgentWorkspace({state,selectFile:()=>{},getVisual:async options=>{seen=options;return [{stage:'source',crop:options.crop,quality:'original-source',dataURL:'image'}];}});
 const workspace=await run('workspace',{});assert.deepEqual(Array.from(workspace.files[0].layers[0].boardBox),[250,0,500,800]);
 await run('preview',{fileIndex:0,boardName:'Panel B'});assert.deepEqual(Array.from(seen.crop),[250,0,500,800]);
 const result=await run('preview',{fileIndex:0,crop:[300,100,100,100]});assert.deepEqual(Array.from(result.evidence[0].crop),[300,100,100,100]);assert.equal(JSON.stringify(state),before);
 for(const args of [{boardName:'unknown'},{boardName:'Panel B',crop:[0,0,100,100]},{crop:[-1,0,10,10]},{crop:[900,0,200,20]},{crop:[0,0,NaN,10]}])await assert.rejects(run('preview',{fileIndex:0,...args}),/范围|请选择/);
});
test('targeted visual repair rejects duplicate, cross-file and unbound layer references before rendering',async()=>{const f=fixture(()=>assert.fail('No request before validation'));for(const layerKeys of [[],['0:1','0:1'],['1:1'],['0:0'],['0:999'],['bad']])await assert.rejects(f.run('design_layout',{fileIndex:0,layerKeys}),/复修|文字/);assert.equal(f.transactions.length,0);});

test('assistant import recognizes Windows path case and slash variants without reimporting',async()=>{const state={files:[{name:'source.ai',path:'D:\\Artwork\\Source.ai',layers:[]}],records:[]};const execute=createAgentWorkspace({state,importOriginal:()=>assert.fail('Already imported'),selectFile:()=>{}});const result=await execute('import_source',{path:'d:/artwork/source.ai'});assert.equal(result.files.length,1);});

test('native normalized import path is accepted after actual import',async()=>{const state={files:[],records:[]};const execute=createAgentWorkspace({state,importOriginal:async()=>state.files.push({name:'source.ai',path:'D:\\Artwork\\Source.ai',layers:[]}),selectFile:()=>{}});assert.equal((await execute('import_source',{path:'d:/artwork/source.ai'})).files.length,1);});

test('source import delivers available whole-page image with correct current-stage gate',async()=>{for(const bound of [false,true]){const state={files:[{name:'a.ai',path:'D:/a.ai',layers:[{recordId:bound?'r':null}]}],records:[]};let required;const run=createAgentWorkspace({state,selectFile:()=>{},getVisual:async options=>{required=options.requireCurrent;return [{stage:bound?'current':'source',crop:[0,0,100,100],dataURL:'actual-page'}];}});const r=await run('import_source',{path:'D:/a.ai'});assert.equal(required,bound);assert.equal(r.images[0],'actual-page');assert.equal(r.evidence[0].stage,bound?'current':'source');}});
test('failed automatic preview does not pretend a successful import failed',async()=>{const state={files:[],records:[]};const run=createAgentWorkspace({state,selectFile:()=>{},importOriginal:async()=>state.files.push({path:'D:/a.ai',layers:[]}),getVisual:async()=>{throw Error('Preview unavailable')}});const r=await run('import_source',{path:'D:/a.ai'});assert.equal(r.files.length,1);assert.match(r.previewNotice,/原稿已导入/);assert.equal(r.images,undefined);});

test('assistant creates approved editable text, preserves binding across hide-clear-restore, and rejects invalid edits without a transaction',async()=>{
 const f=fixture(),file=f.state.files[0];Object.assign(file,{format:'AI',width:500,height:800});Object.assign(file.layers[0],{supported:true,boardNames:['A'],boardBox:[0,0,500,800],box:[20,30,100,20],visible:true});
 const args={fileIndex:0,boardName:'A',recordIds:['new'],box:[30,50,300,60],style:{font:'ArialMT',size:30,color:'#123456',alignment:'center'},reason:'Approved missing title'};
 const before=JSON.stringify(file);await assert.rejects(f.run('create_text',{...args,recordIds:['invented']}));assert.equal(JSON.stringify(file),before);assert.equal(f.transactions.length,0);
 const added=await f.run('create_text',args);assert.equal(added.layerKey,'0:2');const l=file.layers[2];assert.equal(l.customText,'New');assert.equal(l.id,-1);assert.equal(l.nativeCreation.color,'#123456');
 l.manual={size:27};l.position={x:30,y:50};
 for(const mode of ['hidden','clear']){await f.run('set_text_presence',{layerKey:added.layerKey,mode,reason:'Approved operation'});assert.equal(l.visible,false);assert.equal(l.nativeDisposition,mode);}
 await f.run('set_text_presence',{layerKey:added.layerKey,mode:'restore',reason:'Restore'});assert.equal(l.visible,true);assert.equal(l.skipExport,false);assert.equal(l.customText,'New');assert.equal(l.manual.size,27);assert.equal(l.position.x,30);
 await f.run('set_text_presence',{layerKey:'0:0',mode:'clear',reason:'Old heading replaced'});assert.equal(file.layers[0].nativeDisposition,'clear');assert.equal(file.layers[0].original,'标题');
 const n=f.transactions.length;await assert.rejects(f.run('set_text_presence',{layerKey:'0:999',mode:'hidden',reason:'Invalid'}));assert.equal(f.transactions.length,n);
});

test('whole-page diagnosis automatically guides the next joint layout, while unchanged failed replans reuse the result',async()=>{
 const {buildDesignLayoutRequest}=require('../design-layout-context.cjs'),manifest=require('../services/design-plugins/manifest.json');let revision=0,proposals=0,received;
 const l={id:7,name:'Title',original:'Source',font:'Arial',size:30,box:[30,30,250,50],boardNames:['A'],boardBox:[0,0,500,800],recordId:'r',issues:[]},state={files:[{path:'source.ai',format:'AI',fingerprint:'original',width:500,height:800,layers:[l]}],records:[{id:'r',target:'Approved'}]};
 const repair={id:'title-group',sourceChecks:['check:hierarchy'],layerKeys:['7'],problem:'Title and description grouping lacks hierarchy',cause:'Independent role sizing',action:'Coordinate complete title group and reconnect description',acceptance:'Distinct roles and intentional group whitespace',dependsOn:[]};
 const call=async(name,r)=>{if(name==='agentCacheContext')return {taskId:'task',revision,model:'selected',warnings:[]};if(name==='agentExport')return {saved:1,failed:0,results:[{output:'final.ai',delivery:{reopened:true,verified:true,boards:[{name:'A',crop:[0,0,500,800]}]}}]};if(name==='agentDeliveryVisual')return {stage:'current',crop:r.crop,origin:'exported-jpeg',deliveryEvidence:{reopened:true},dataURL:'actual-jpg'};if(name==='suggestLayout'&&r.phase==='audit')return {repairGuidanceVersion:1,audit:{checks:require('../services/design-page-audit.cjs').checks.map(id=>({id,verdict:id==='hierarchy'?'fail':'pass',evidence:'Actual rendered grouping inspected',layerKeys:['7']})),designChecks:require('../services/design-composition.cjs').dimensions.map(id=>({id,verdict:'accept',evidence:'Other rendered relationships inspected'})),skillReviews:manifest.skills.map(s=>({id:s.id,verdict:'accept',evidence:'Applicable rendered relationship inspected'})),repairPlan:[repair]}};if(name==='suggestLayout'){proposals++;received=r;return {proposals:[],rejected:[]};}return true;};
 const run=createAgentWorkspace({state,call,buildRequest:buildDesignLayoutRequest,fitText:()=>({ok:true,width:150,height:30}),getVisual:async({crop}={})=>[{stage:'current',crop:crop||[0,0,500,800],dataURL:'actual'}],makePlan:async()=>({files:[{path:'source.ai'}]}),selectFile:()=>{},selectedLayer:()=>{},history:{transaction:fn=>fn()},render:()=>{}});
 assert.equal((await run('export_files',{})).qualityPassed,false);await run('design_layout',{fileIndex:0});assert.equal(received.priorWholePageRepairPlan[0].id,'title-group');assert.equal(proposals,1);assert.equal((await run('design_layout',{fileIndex:0,replan:true})).stoppedNoProgress,true);assert.equal(proposals,1);revision++;await run('design_layout',{fileIndex:0});assert.equal(proposals,2);assert.equal(received.priorWholePageRepairPlan.length,0);
});

test('independent workspace preparation removes all old operations, rejects stale reset before mutation',async()=>{
 const f=fixture();Object.assign(f.state.files[0],{artworkHides:[{objectId:'old'}],containerEdits:[{}],mixedTextEdits:[{}]});f.state.sourceDocument={old:true};let resets=0;
 const run=createAgentWorkspace({state:f.state,resetWorkspace:()=>{resets++;Object.assign(f.state,{files:[],records:[],sourceDocument:null,docName:'',docFingerprint:''})}});
 await assert.rejects(run('prepare_independent_task',{},'',()=>false),/过期/);assert.equal(resets,0);
 const result=await run('prepare_independent_task',{});assert.equal(result.prepared,true);assert.equal(f.state.files.length,0);assert.equal(f.state.records.length,0);assert.equal(f.state.sourceDocument,null);assert.equal(resets,1);
});

test('explicit export scope excludes old blocked files before validation, planning, export and audits',async()=>{
 const f=fixture();f.state.files[0].layers[1].issues=['old invalid'];f.state.files.push({name:'06.psd',path:'06.psd',layers:[]});let scope,calls=0;
 const run=createAgentWorkspace({state:f.state,selectFile:()=>{},makePlan:async options=>{scope=options.fileIndices;return {files:[]}},call:async name=>{if(name==='agentExport'){calls++;return {results:[],saved:0,failed:0}};return null}});
 const r=await run('export_files',{fileIndices:[1]});assert.deepEqual([...scope],[1]);assert.equal(calls,1);assert.equal(r.blocked,undefined);assert.deepEqual([...r.audits],[]);
 for(const fileIndices of [[],[2],[-1],[1,1],['1']])await assert.rejects(run('export_files',{fileIndices}),/fileIndices/);
});

test('native PSB scan and mixed plan share approved records and preserve all boards without ordinary edit loss',async()=>{
 const f=fixture(async(name,args)=>{assert.equal(name,'agentArtboards');assert.equal(args.action,'metadata');return {nativeTextScanId:'scan',layers:[{id:'native:p',name:'Mixed',original:'$79',nativePath:[0,0],box:[20,20,70,30],boardId:1,issues:[],mixedStyleRuns:[{signature:'small'},{signature:'large'}]}],artboards:[{id:1,name:'A',box:[0,0,400,300],nativePath:[0]}]};});
 const file=f.state.files[0];Object.assign(file,{format:'PSB',width:400,height:300,layers:[]});await f.run('inspect_native_text',{fileIndex:0});f.state.records=[{id:'r',target:'€199',digest:'d'}];
 const args={fileIndex:0,scanId:'scan',changes:[{layerId:'native:p',original:'$79',recordIds:['r'],spans:[{text:'€',sourceStart:0},{text:'199',sourceStart:1}],anchor:'right',reason:'Approved mixed price'}]};await f.run('configure_native_text',args);assert.equal(file.artboardPlan.boards[0].changes[0].target,'€199');assert.equal(file.artboardPlan.operation,'edit');assert.equal(file.artboardPlan.nativeTextScanId,'scan');await f.run('configure_native_text',args);assert.equal(f.transactions.at(-1),'native-text-plan');
 await assert.rejects(f.run('configure_native_text',{...args,scanId:'foreign'}),/原生文字/);file.layers[0].manual={size:20};const before=JSON.stringify(file.artboardPlan);await assert.rejects(f.run('configure_native_text',args),/其他编辑/);assert.equal(JSON.stringify(file.artboardPlan),before);
});

test('reattached same-path source refreshes stale metadata without silently discarding edits',async()=>{let imports=0;const state={files:[],records:[]},run=createAgentWorkspace({state,call:async()=>{},history:{transaction:fn=>fn()},render:()=>{},selectFile:()=>{},importOriginal:async paths=>{imports++;const f={path:paths[0],name:'source.psb',format:'PSB',layers:[{id:imports,original:'source'+imports,issues:[]}]};const i=state.files.findIndex(x=>x.path===f.path);if(i<0)state.files.push(f);else state.files[i]=f;}});
 await run('import_source',{path:'D:/source.psb',attachmentIdentity:'first'});await run('import_source',{path:'D:/source.psb',attachmentIdentity:'first'});assert.equal(imports,1);await run('import_source',{path:'D:/source.psb',attachmentIdentity:'second'});assert.equal(imports,2);state.files[0].layers[0].recordId='approved';await assert.rejects(run('import_source',{path:'D:/source.psb',attachmentIdentity:'third'}),/已有修改/);assert.equal(imports,2);await run('import_source',{path:'D:/source.psb',attachmentIdentity:'third',replaceExisting:true});assert.equal(imports,3);
});

test('native text updates merge per object, retain document settings, and reject invalid batches atomically',async()=>{
 const f=fixture(),file=f.state.files[0];Object.assign(file,{format:'PSB',width:400,height:300,nativeTextScanId:'scan',layers:[{id:'native:a',name:'Title',original:'Title',nativePath:[0,0],boardId:1,issues:[]},{id:'native:b',name:'Body',original:'Body',nativePath:[0,1],boardId:1,issues:[]}],artboards:[{id:1,name:'A',box:[0,0,400,300],nativePath:[0]}]});f.state.records=[{id:'r',target:'标题: Approved headlineSecond line\n说明: Approved body',digest:'d'}];
 const change=(id,text)=>({layerId:id,original:id==='native:a'?'Title':'Body',recordIds:['r'],spans:[{text,sourceStart:0}],reason:'Approved fragment'});
 await f.run('configure_native_text',{fileIndex:0,scanId:'scan',outputFormat:'PSB',documentName:'Saved name',changes:[change('native:a','Approved headline\rSecond line')]});
 const updated=await f.run('configure_native_text',{fileIndex:0,scanId:'scan',changes:[change('native:b','Approved body')]});assert.equal(updated.changes,2);assert.equal(file.artboardPlan.documentName,'Saved name');assert.equal(file.artboardPlan.outputFormat,'PSB');assert.equal(file.artboardPlan.boards[0].changes[0].target,'Approved headline\rSecond line');
 const before=JSON.stringify(file.artboardPlan);await assert.rejects(f.run('configure_native_text',{fileIndex:0,scanId:'scan',changes:[change('native:b','Invented')]}),/native:b/);assert.equal(JSON.stringify(file.artboardPlan),before);
 await assert.rejects(f.run('design_layout',{fileIndex:0}),e=>e.code==='NATIVE_PLAN_WORKFLOW'&&e.fileIndex===0&&/configure_native_text/.test(e.message));assert.equal(JSON.stringify(file.artboardPlan),before);
 await f.run('configure_native_text',{fileIndex:0,scanId:'scan',replace:true,changes:[change('native:b','Approved body')]});assert.equal(file.artboardPlan.boards[0].changes.length,1);
});

test('native layout repairs preserve other objects and validate all local parameters before committing',async()=>{
 const f=fixture(),file=f.state.files[0];Object.assign(file,{format:'PSB',width:400,height:300,nativeTextScanId:'scan',layers:['a','b'].map((id,i)=>({id:'native:'+id,name:id,original:'Original '+id,nativePath:[0,i],boardId:1,issues:[]})),artboards:[{id:1,name:'A',box:[0,0,400,300],nativePath:[0]}]});f.state.records=[{id:'a',target:'Approved A'},{id:'b',target:'Approved B'}];const change=(id,layout)=>({layerId:'native:'+id,original:'Original '+id,recordIds:[id],spans:[{text:'Approved '+id.toUpperCase(),sourceStart:0}],reason:'Visual repair',...(layout?{layout}:{})});await f.run('configure_native_text',{fileIndex:0,scanId:'scan',changes:[change('a'),change('b')]});const layout={coordinateSpace:'object-document',offset:[12,28],leading:36};await f.run('configure_native_text',{fileIndex:0,scanId:'scan',changes:[change('a',layout)]});assert.deepEqual(JSON.parse(JSON.stringify(file.artboardPlan.boards[0].changes.find(c=>c.layerId==='native:a').layout)),layout);assert.equal(file.artboardPlan.boards[0].changes.length,2);const prior=JSON.stringify(file.artboardPlan),commits=f.transactions.length;await assert.rejects(f.run('configure_native_text',{fileIndex:0,scanId:'scan',changes:[change('a',{coordinateSpace:'page',offset:[0,2]})]}),/局部坐标/);assert.equal(JSON.stringify(file.artboardPlan),prior);assert.equal(f.transactions.length,commits);
});

test('assistant workspace and prompt use the navigation contract bundled with the application',async()=>{
 const r=await fixture().run('workspace',{});assert.equal(r.navigation.home.label,'首页');assert.deepEqual(JSON.parse(JSON.stringify(r.navigation.multilingual.children)),[{label:'模板制作',route:'editor'},{label:'批量修改',route:'batch'}]);
 const task={files:[],history:[],request:'Test'};const guide=require('../services/workspace-navigation.cjs').assistantGuide;for(const native of [false,true])assert.ok(require('../services/agent-task.cjs').promptFor(task,{native}).includes(guide));
});
