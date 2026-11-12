const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {buildTemplatePlan}=require('../sku-template-plan.cjs');
const {mappingRecords}=require('../sku-product-copy.cjs');
const {createProductTemplateEngine,templateReport}=require('../services/sku-product-template-engine.cjs');
const {compositionScript}=require('../photoshop-artboards.cjs');
const {templateNative,inspectScript}=require('../sku-template-native.cjs');
function fixture(){
 const boards=[{id:10,name:'Model-A',box:[0,0,100,100],nativePath:[0]},{id:11,name:'Skip',box:[120,0,100,100],nativePath:[1]}];
 const mapping={id:'mapping',source:{path:'source.psb',boards},approved:{approvalDigest:'approved',boards:[{boardId:10,boardName:'Model-A',action:'use',fields:[{key:'regular',cell:'C1',state:'value',value:'199.50',digest:'199.50'},{key:'sale',cell:'D1',state:'placeholder',value:'/'},{key:'final',cell:'E1',state:'value',value:'159',digest:'159'}]},{boardId:11,action:'skip'}]}};
 const obj=(id,name,kind,box,extra={})=>({id,name,kind,box,localBox:box,visible:true,nativePath:id.split('.').map(Number),steps:[{path:id.split('.').map(Number),name}],...extra});
 const templateInventory={width:100,height:100,issues:[],objects:[obj('0','template','group',[0,70,100,30],{artboard:true}),obj('0.0','regular','text',[10,80,25,10],{original:'$99.50'}),obj('0.1','sale','text',[45,80,20,10],{original:'$30'}),obj('0.2','final','text',[70,80,25,10],{original:'$79'}),obj('0.3','sale-label','text',[40,70,20,8],{original:'Sale'}),obj('0.4','minus','text',[35,80,5,5],{original:'-'})]};
 const scan={version:1,id:'a'.repeat(64),source:{path:'source.psb',fingerprint:'source'},template:{path:'template.psb',fingerprint:'template'},mappingId:'mapping',approvalDigest:'approved',sourceBoards:boards,sourceInventory:{width:220,height:100,objects:[obj('0','Model-A','group',[0,0,100,100],{boardId:10,artboard:true}),obj('0.0','old-footer','group',[0,70,100,30],{boardId:10}),obj('0.1','product','pixel',[10,0,80,70],{boardId:10})]},templateInventory};
 const records=mappingRecords(mapping),args={scanId:scan.id,templateRootId:'0',templateFrame:[0,0,100,100],templateFields:[{field:'regular',objectIds:['0.0']},{field:'sale',objectIds:['0.1']},{field:'final',objectIds:['0.2']}],removeObjectIds:['0.1','0.3','0.4'],layout:[{objectId:'0.0',x:50,y:80,anchorX:.5,anchorY:0}],boards:[{boardId:10,replaceRegion:[0,.7,1,.3],oldObjectIds:['0.0'],reason:'Old footer identified, product retained',placement:[0,0,100,100],changes:[{objectId:'0.0',original:'$99.50',recordId:records[0].id,prefix:'$',anchor:'center'},{objectId:'0.2',original:'$79',recordId:records[1].id,prefix:'$',anchor:'center'}]}]};return {scan,mapping,records,args};
}
const plan=f=>buildTemplatePlan(f.scan,f.mapping,f.args,f.records);
test('template plan replaces only adopted footer and keeps native names positions and exact price provenance',()=>{const f=fixture(),p=plan(f);assert.equal(p.operation,'edit');assert.equal(p.boards[1].name,'Skip');assert.equal(p.productTemplate.requests.length,1);assert.deepEqual(p.productTemplate.requests[0].actions.filter(a=>a.mode==='text').map(a=>a.target),['$199.50','$159']);assert.equal(p.productSourceRecords.length,2);assert.equal(p.productTemplate.requests[0].oldObjects[0].name,'old-footer');});
test('approved board deletion is explicit, preserves skipped exceptions and exports only retained boards at original coordinates',()=>{
 const f=fixture();f.scan.sourceBoards.push({id:12,name:'No table row',box:[240,0,100,100],nativePath:[2]});f.mapping.approved.boards.push({boardId:12,boardName:'No table row',action:'delete',deleteConfirmed:true,reason:'User requested deletion of unmatched board'});f.args.deleteBoardIds=[12];
 const p=plan(f),kept=require('../photoshop-artboard-plan.cjs').validateArtboardPlan(p,{...f.scan.sourceInventory,artboards:f.scan.sourceBoards,layers:[]});assert.deepEqual(kept.map(b=>b.templateId),[10,11]);assert.deepEqual(kept.map(b=>b.box),[[0,0,100,100],[120,0,100,100]]);assert.equal(p.productTemplate.deletedBoards[0].name,'No table row');assert.equal(p.boards[1].name,'Skip');
 for(const ids of [undefined,[],[11],[12,12],[10,12],[999]]){f.args.deleteBoardIds=ids;assert.throws(()=>plan(f),/deleteBoardIds/);}f.args.deleteBoardIds=[12];delete f.mapping.approved.boards[2].deleteConfirmed;assert.throws(()=>plan(f),/明确批准/);
});
test('artboard contract cannot hide a retained board or smuggle deleted boards back into output',()=>{
 const f=fixture();f.mapping.approved.boards[1]={boardId:11,boardName:'Skip',action:'delete',deleteConfirmed:true,reason:'User deletion'};f.args.deleteBoardIds=[11];const p=plan(f),file={...f.scan.sourceInventory,artboards:f.scan.sourceBoards,layers:[]},validate=require('../photoshop-artboard-plan.cjs').validateArtboardPlan;
 for(const mutate of [v=>v.deleteBoardIds=[],v=>v.productTemplate.deletedBoards[0].box=[0,0,1,1],v=>v.productTemplate.deletedBoards[0].name='changed',v=>v.boards.push({name:'Skip',templateId:11,mode:'duplicate',changes:[]}),v=>delete v.productMapping,v=>v.operation='compose']){const copy=structuredClone(p);mutate(copy);assert.throws(()=>validate(copy,file));}
});
test('native board deletion resolves all references before sibling removal and leaves retained coordinates intact',()=>{
 const {boardDeletionNative}=require('../photoshop-artboards.cjs');const layers=[0,1,2,3].map(i=>({id:i,name:'Board '+i,typename:'LayerSet',box:[i*100,0,100,100]})),d={layers};for(const l of layers)l.remove=()=>{layers.splice(layers.indexOf(l),1);};
 const ctx=vm.createContext({locate:(doc,p)=>doc.layers[p[0]],desc:()=>({hasKey:()=>true}),sid:s=>s,rect:l=>l.box,near:(a,b)=>JSON.stringify(a)===JSON.stringify(b),unlock:()=>{}});vm.runInContext(boardDeletionNative,ctx);
 const approvals=[0,2].map(i=>({boardId:i,name:'Board '+i,box:[i*100,0,100,100],nativePath:[i],reason:'Explicit deletion'})),refs=ctx.resolveBoardDeletes(d,approvals),kept=[layers[1],layers[3]].map(l=>({id:l.id,name:l.name,box:l.box})),deleted=ctx.applyBoardDeletes(d,refs,kept);assert.deepEqual(layers.map(l=>l.id),[1,3]);assert.equal(deleted.length,2);layers[0].box[0]=0;assert.throws(()=>ctx.applyBoardDeletes(d,[{layer:layers[1],approval:approvals[1]}],kept),/保留画板/);
});
test('template plan rejects foreign or skipped boards, product deletion, old source approval, stale records and root removal',()=>{
 for(const mutate of [f=>f.args.boards[0].boardId=11,f=>f.args.boards[0].oldObjectIds=['0'],f=>f.args.boards[0].oldObjectIds=['0.1'],f=>f.scan.approvalDigest='stale',f=>f.records[0].target='999',f=>f.args.removeObjectIds.push('0'),f=>f.args.boards.push({...f.args.boards[0],boardId:11}),f=>f.args.boards[0].changes[0].recordId='foreign',f=>f.args.boards[0].changes[0].original='stale']){const f=fixture();mutate(f);assert.throws(()=>plan(f));}
});
test('missing fields cannot retain template sample amounts and all value characters must be used exactly once',()=>{
 for(const mutate of [f=>f.args.removeObjectIds=[],f=>f.args.boards[0].changes.pop(),f=>f.args.boards[0].changes[0].recordSlice=[0,3],f=>f.args.templateFields.push({field:'invented',objectIds:['0.4']}),f=>f.args.boards[0].fieldExclusions=[{recordId:'foreign',reason:'none'}]]){const f=fixture();mutate(f);assert.throws(()=>plan(f));}
 const f=fixture();f.args.removeObjectIds.push('0.2');f.args.boards[0].changes.pop();f.args.boards[0].fieldExclusions=[{recordId:f.records[1].id,reason:'User explicitly excluded final price'}];assert.doesNotThrow(()=>plan(f));f.args.boards[0].fieldExclusions[0].reason='';assert.throws(()=>plan(f));
});
test('mixed currency styles require explicit spans while unsafe scaling and overlapping parent child operations reject',()=>{
 const f=fixture();f.scan.templateInventory.objects[1].styles={textStyleRange:[{from:0,to:1,textStyle:{size:8}},{from:1,to:7,textStyle:{size:16}}]};assert.throws(()=>plan(f),/混合/);f.args.boards[0].changes[0].spans=[{text:'$',sourceStart:0},{text:'199.50',sourceStart:1}];assert.doesNotThrow(()=>plan(f));f.args.boards[0].placement=[0,0,100,80];assert.throws(()=>plan(f),/等比/);
});
test('reports paginate structural metadata without dumping full text descriptors',()=>{const f=fixture(),r=templateReport(f.scan,{limit:2,boardId:10});assert.equal(r.sourceObjects.length,2);assert.equal(r.templateObjects.length,2);assert.equal(r.nextOffset,2);assert.equal(r.templateObjects[0].styles,undefined);assert.throws(()=>templateReport(f.scan,{limit:101}));});
test('background scan persists only metadata and recompiles plans on restart rejecting tampering and changed inputs',async t=>{
 const f=fixture(),d=await fs.mkdtemp(path.join(os.tmpdir(),'template-engine-'));t.after(()=>fs.rm(d,{recursive:true,force:true}));let calls=0,compositions=0,changed=false;
 const config={directory:d,readMapping:async()=>f.mapping,prepare:async()=>{},hash:async p=>p==='source.psb'?'source':p.endsWith('template.jpg')?'image':changed?'changed':'template',execute:async(dir,script)=>{calls++;const kind=path.basename(dir);if(kind==='template')await fs.writeFile(path.join(path.dirname(dir),'template.jpg'),'mock-image');await fs.writeFile(path.join(path.dirname(dir),kind+'.json'),JSON.stringify(kind==='source'?f.scan.sourceInventory:f.scan.templateInventory));assert.ok(script.includes('DONOTSAVECHANGES'));},compose:async args=>{compositions++;return {output:'copy.psb',plan:args.plan};}};
 let engine=createProductTemplateEngine(config);const input={source:f.scan.source,mapping:f.mapping,template:f.scan.template,metadata:{artboards:f.scan.sourceBoards}};
 const scan=await engine.inspect(input);f.args.scanId=scan.id;const r=await engine.configure({...input,args:f.args});assert.equal(calls,2);assert.equal((await fs.readdir(d)).length,1);const bytes=await fs.readFile(path.join(d,scan.id,'scan.json'));assert.ok(bytes.length<18000);
 engine=createProductTemplateEngine(config);await engine.run({source:f.scan.source,plan:r.plan,directory:'unused'});assert.equal(calls,2);assert.equal(compositions,1);
 const corrupt=structuredClone(r.plan);corrupt.productTemplate.requests[0].actions[0].mode='layout';await assert.rejects(engine.run({source:f.scan.source,plan:corrupt}),/不一致/);changed=true;await assert.rejects(engine.validate({source:f.scan.source,plan:r.plan}),/已变化/);changed=false;
 const p=path.join(d,scan.id,'scan.json'),saved=JSON.parse(await fs.readFile(p));saved.scan.templateInventory.objects[1].original='hacked';await fs.writeFile(p,JSON.stringify(saved));await assert.rejects(engine.validate({source:f.scan.source,plan:r.plan}),/损坏/);assert.equal(compositions,1);
});
test('generated native scripts compile and crop guard accepts original decorations but rejects newly clipped edits',()=>{
 const f=fixture(),p=plan(f),script=compositionScript('source.psb',[],p.outputFormat,'output',{operation:'edit',productTemplate:p.productTemplate});new vm.Script(script.replace(/^#target photoshop\s*/,''));new vm.Script(inspectScript('source.psb','out.json').replace(/^#target photoshop\s*/,''));
 const context=vm.createContext({});vm.runInContext(templateNative,context);assert.equal(context.tplNewCrop([-7,70,114,40],[-7,70,114,40],100,100),false);assert.equal(context.tplNewCrop([0,70,100,30],[-2,70,100,30],100,100),true);
});
test('native inventory propagates board identity through nested footer groups without opening pixel contents',()=>{
 const c=vm.createContext({LayerKind:{SMARTOBJECT:'smart',TEXT:'text'}});vm.runInContext(templateNative,c);
 vm.runInContext("boardFor=function(l){return l.board||null;};bounds=function(l){return l.box;};mapped=function(b){return {box:b};};",c);
 const leaf={id:3,name:'background',typename:'ArtLayer',kind:'pixel',visible:true,box:[-2,70,104,35]},footer={id:2,name:'footer',typename:'LayerSet',visible:true,box:leaf.box,layers:[leaf]},ab={id:10,name:'A',typename:'LayerSet',visible:true,box:[0,0,100,100],board:{id:'10',box:[0,0,100,100]},layers:[footer]},doc={width:{as:()=>100},height:{as:()=>100},layers:[ab]};
 const r=c.tplScan(doc,false);assert.ok(r.objects.every(o=>o.boardId===10));assert.equal(r.objects[2].id,'0.0.0');assert.equal(r.objects[2].artboard,false);
 const f=fixture();f.scan.sourceInventory.objects[1].box=[-2,70,104,35];assert.doesNotThrow(()=>plan(f));f.scan.sourceInventory.objects[1].box[1]=60;assert.throws(()=>plan(f),/指定区域/);
});
test('assistant template configuration is undoable and stale or ordinary-edit state never changes the plan',async()=>{
 const esbuild=require('esbuild'),module={exports:{}};vm.runInNewContext(esbuild.buildSync({entryPoints:[path.join(__dirname,'../renderer/agent-workspace.js')],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,{module,exports:module.exports,require,structuredClone,console});
 const f=fixture(),p=plan(f),file={path:'source.psb',fingerprint:'source',format:'PSB',width:220,height:100,layers:[],artboards:f.scan.sourceBoards};const state={files:[file],records:f.records,sourceDocument:{productMappingKey:'mapping:approved'}},transactions=[];let calls=0;
 const run=module.exports.createAgentWorkspace({state,call:async(method,input)=>{calls++;assert.equal(input.templateFileId,'attachment');return input.templateArgs.inspect?{scanId:f.scan.id}:{plan:p,artboards:f.scan.sourceBoards};},selectFile:()=>{},render:()=>{},history:{transaction:(fn,tag)=>{transactions.push(tag);fn();}}});
 const args={...f.args,fileIndex:0,mapping:f.mapping,templateFileId:'attachment'};await run('configure_product_template',args);assert.equal(file.artboardPlan.productTemplate.requests.length,1);assert.deepEqual(transactions,['product-template-plan']);assert.equal(calls,1);const before=JSON.stringify(file);
 await assert.rejects(run('configure_product_template',args,null,()=>false),/过期/);assert.equal(JSON.stringify(file),before);assert.equal(calls,1);
 file.layers.push({recordId:'ordinary'});await assert.rejects(run('configure_product_template',args),/普通修改/);assert.equal(calls,1);
});
function assemblyFixture(fail=false){
 const doc={id:1,typename:'Document'},box=[10,20,100,30],root={layers:[]};let closed=false,unlocked=0;
 const staging={id:2,typename:'Document',layers:[],flatten(){assert.equal(this,staging);},close(){closed=true;}};
 const raster={parent:staging,remove(){staging.layers.splice(staging.layers.indexOf(this),1);}};staging.layers=[raster];
 for(let i=0;i<3;i++)root.layers.push({name:'Layer '+i,box,duplicate(target){assert.equal(target,staging);const child={id:100+i,name:'auto renamed',parent:staging,box:box.slice()};staging.layers.unshift(child);return child;}});
 doc.duplicate=()=>staging;
 function Descriptor(){}Descriptor.prototype.putReference=Descriptor.prototype.putEnumerated=Descriptor.prototype.putBoolean=function(){};
 function Reference(){}Reference.prototype.putIdentifier=Reference.prototype.putClass=Reference.prototype.putEnumerated=function(){};
 const c=vm.createContext({app:{activeDocument:doc},ElementPlacement:{PLACEATBEGINNING:'first'},SaveOptions:{DONOTSAVECHANGES:'no'},DialogModes:{NO:'no'},bounds:l=>l.box,unlock:()=>{unlocked++;return [];},relock:()=>{},sid:s=>s,ActionDescriptor:Descriptor,ActionReference:Reference,enc:JSON.stringify,executeAction(op){if(op==='make'){if(fail)throw Error('native grouping failed');const group={id:500,typename:'LayerSet',parent:staging,layers:staging.layers.slice()};for(const l of group.layers)l.parent=group;staging.layers=[group];staging.activeLayer=group;}}});
 vm.runInContext(require('../sku-template-native.cjs').placementNative,c);c.tplCapture=()=>[];c.tplVerify=()=>{};
 return {c,doc,root,staging,closed:()=>closed,unlocked:()=>unlocked};
}
test('template assembly uses a separate document, preserves copied layer names/order/bounds and leaves source intact',()=>{
 const f=assemblyFixture(),before=f.root.layers.slice();const holder=f.c.tplHolder(f.doc,f.root,true);
 assert.equal(holder.parent,f.staging);assert.deepEqual(holder.layers.map(l=>l.name),['Layer 0','Layer 1','Layer 2']);assert.deepEqual(f.root.layers,before);assert.equal(f.c.app.activeDocument,f.doc);assert.equal(f.unlocked(),1);assert.equal(f.closed(),false);
});
test('template assembly closes only its staging document after grouping failure and restores active document',()=>{
 const f=assemblyFixture(true);assert.throws(()=>f.c.tplHolder(f.doc,f.root,true),/native grouping failed/);assert.equal(f.closed(),true);assert.equal(f.c.app.activeDocument,f.doc);assert.equal(f.root.layers.length,3);
});
test('final design audit receives board-specific template prices, exclusions and cleanup requirements',async()=>{
 const {auditDesignFile}=require('../design-document-audit.cjs'),f=fixture(),records=f.records;
 const file={width:220,height:100,layers:[],artboards:f.scan.sourceBoards,composedBoards:f.scan.sourceBoards.map(b=>({...b,templateVerified:b.id===10,templateChanges:b.id===10?[{recordId:records[0].id,target:'$199.50'}]:[],templateRemoved:b.id===10?[{name:'sale-label',original:'Sale'}]:[]})),templateCopy:{records,decisions:{boards:[{boardId:10,fieldExclusions:[{recordId:records[1].id,reason:'User excluded final'}]}]}}};
 const requests=[];const r=await auditDesignFile({file,records,requireDelivery:true,buildRequest:()=>assert.fail('No native layers in this fixture'),getVisual:async({crop})=>[{stage:'current',origin:'exported-jpeg',deliveryEvidence:{reopened:true},crop,dataURL:'mock-jpeg'}],call:async(method,request)=>{requests.push(request);return {audit:{checks:require('../services/design-page-audit.cjs').checks.map(id=>({id,verdict:'pass',evidence:'Mock audit of contract',layerKeys:[]})),designChecks:require('../services/design-composition.cjs').dimensions.map(id=>({id,verdict:'accept',evidence:'Mock contract'})),skillReviews:require('../services/design-plugins/manifest.json').skills.map(s=>({id:s.id,verdict:['design-critique','graphic-judgment'].includes(s.id)?'accept':'not-applicable',evidence:'Mock contract'}))}};}});
 assert.equal(r.passed,true);assert.equal(requests.length,2);assert.equal(requests[0].nativeTemplateReplacement.verified,true);assert.equal(requests[0].nativeTemplateReplacement.removedObjects[0].original,'Sale');assert.equal(requests[0].copyReferences[1].boundInThisBoard,false);assert.equal(requests[1].copyReferences.length,0);assert.equal(requests[1].nativeTemplateReplacement.verified,false);
});
