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
 const records=mappingRecords(mapping),args={scanId:scan.id,templateRootId:'0',templateFrame:[0,0,100,100],priceGroups:[{containerId:'0',items:[{field:'regular',objectIds:['0.0']},{field:'sale',objectIds:['0.1','0.3']},{field:'final',objectIds:['0.2']}],separators:[{objectId:'0.4',leftField:'regular',rightField:'sale'}]}],templateFields:[{field:'regular',objectIds:['0.0']},{field:'sale',objectIds:['0.1']},{field:'final',objectIds:['0.2']}],removeObjectIds:['0.1','0.3','0.4'],layout:[{objectId:'0.0',x:30,y:80,anchorX:.5,anchorY:0},{objectId:'0.2',x:75,y:80,anchorX:.5,anchorY:0}],boards:[{boardId:10,replaceRegion:[0,.7,1,.3],oldObjectIds:['0.0'],reason:'Old footer identified, product retained',placement:[0,0,100,100],changes:[{objectId:'0.0',original:'$99.50',recordId:records[0].id,prefix:'$',anchor:'center'},{objectId:'0.2',original:'$79',recordId:records[1].id,prefix:'$',anchor:'center'}]}]};return {scan,mapping,records,args};
}
const plan=f=>buildTemplatePlan(f.scan,f.mapping,f.args,f.records);
test('default price structure compiles complete cleanup and reflow without optional removal or layout instructions',()=>{
 const f=fixture();delete f.args.removeObjectIds;delete f.args.layout;const p=plan(f),r=p.productTemplate.requests[0];
 assert.deepEqual(r.actions.filter(a=>a.mode==='remove').map(a=>a.objectId).sort(),['0.1','0.3','0.4']);assert.equal(r.actions.at(-1).mode,'price-reflow');assert.deepEqual(r.priceStructure[0].removedFields,['sale']);
 const saved=JSON.parse(JSON.stringify(p));assert.deepEqual(plan(f),saved);assert.equal(saved.productTemplate.decisions.priceGroups.length,1);assert.equal(saved.boards[1].name,'Skip');
});
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
 for(const mutate of [f=>delete f.args.priceGroups,f=>f.args.boards[0].changes.pop(),f=>f.args.boards[0].changes[0].recordSlice=[0,3],f=>f.args.templateFields.push({field:'invented',objectIds:['0.4']}),f=>f.args.boards[0].fieldExclusions=[{recordId:'foreign',reason:'none'}]]){const f=fixture();mutate(f);assert.throws(()=>plan(f));}
 const f=fixture();f.args.removeObjectIds.push('0.2');f.args.layout=f.args.layout.filter(l=>l.objectId!=='0.2');f.args.boards[0].changes.pop();f.args.boards[0].fieldExclusions=[{recordId:f.records[1].id,reason:'User explicitly excluded final price'}];assert.doesNotThrow(()=>plan(f));f.args.boards[0].fieldExclusions[0].reason='';assert.throws(()=>plan(f));
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
test('template native attachment targets the specified artboard index and restores both parent locks on failure',()=>{
 const {placementNative}=require('../sku-template-native.cjs');let restored=[],actions=[];
 function Descriptor(){}for(const key of ['putReference','putBoolean','putInteger'])Descriptor.prototype[key]=function(){};
 function Reference(){}Reference.prototype.putIdentifier=function(_,id){actions.push(['source',id]);};Reference.prototype.putIndex=function(_,index){actions.push(['index',index]);};
 const c=vm.createContext({ActionDescriptor:Descriptor,ActionReference:Reference,DialogModes:{NO:0},sid:s=>s,desc:()=>({getInteger:()=>50}),tplParents:()=>['old-parent'],tplLock:()=> 'target-lock',tplUnlock:()=>{},tplRelock:(_,v)=>restored.push(v),tplRestoreParents:v=>restored.push(v[0]),executeAction:()=>{},enc:JSON.stringify});vm.runInContext(placementNative,c);
 c.tplAttach({}, {id:7}, {id:83});assert.deepEqual(actions,[['source',7],['index',49]]);assert.deepEqual(restored,['target-lock','old-parent']);
 restored=[];c.executeAction=()=>{throw Error('native move rejected');};assert.throws(()=>c.tplAttach({}, {id:7}, {id:83}),/native move rejected/);assert.deepEqual(restored,['target-lock','old-parent']);
});
test('template verification accepts recomputed percentage click points but rejects font or absolute ink changes',()=>{
 const {templateNative,placementNative}=require('../sku-template-native.cjs');const c=vm.createContext({LayerKind:{TEXT:'text'}});vm.runInContext(templateNative+placementNative,c);
 let actual={fontPostScriptName:'A',size:12,textClickPoint:{horizontal:{value:88}}},box=[10,20,100,30];
 c.tplLocate=()=>({name:'Title',kind:'text',textItem:{contents:'hello'}});c.desc=()=>({getObjectValue:()=>actual});c.objectData=v=>v;c.bounds=()=>box;c.sid=s=>s;
 const check={path:[0],name:'Title',target:'hello',styles:{fontPostScriptName:'A',size:12,textClickPoint:{horizontal:{value:77}}},box:[10,20,100,30]};
 assert.doesNotThrow(()=>c.tplVerify({},[check]));actual.fontPostScriptName='B';assert.throws(()=>c.tplVerify({},[check]),/字符样式/);actual.fontPostScriptName='A';box=[20,20,100,30];assert.throws(()=>c.tplVerify({},[check]),/位置/);
});
test('final design audit receives board-specific template prices, exclusions and cleanup requirements',async()=>{
 const {auditDesignFile}=require('../design-document-audit.cjs'),f=fixture(),records=f.records;
 const file={width:220,height:100,layers:[],artboards:f.scan.sourceBoards,composedBoards:f.scan.sourceBoards.map(b=>({...b,templateVerified:b.id===10,templateChanges:b.id===10?[{recordId:records[0].id,target:'$199.50'}]:[],templateRemoved:b.id===10?[{name:'sale-label',original:'Sale'}]:[]})),templateCopy:{records,decisions:{boards:[{boardId:10,fieldExclusions:[{recordId:records[1].id,reason:'User excluded final'}]}]}}};
 const requests=[];const r=await auditDesignFile({file,records,requireDelivery:true,buildRequest:()=>assert.fail('No native layers in this fixture'),getVisual:async({crop})=>[{stage:'current',origin:'exported-jpeg',deliveryEvidence:{reopened:true},crop,dataURL:'mock-jpeg'}],call:async(method,request)=>{requests.push(request);return {audit:{checks:require('../services/design-page-audit.cjs').checks.map(id=>({id,verdict:'pass',evidence:'Mock audit of contract',layerKeys:[]})),designChecks:require('../services/design-composition.cjs').dimensions.map(id=>({id,verdict:'accept',evidence:'Mock contract'})),skillReviews:require('../services/design-plugins/manifest.json').skills.map(s=>({id:s.id,verdict:['design-critique','graphic-judgment'].includes(s.id)?'accept':'not-applicable',evidence:'Mock contract'}))}};}});
 assert.equal(r.passed,true);assert.equal(requests.length,2);assert.equal(requests[0].nativeTemplateReplacement.verified,true);assert.equal(requests[0].nativeTemplateReplacement.removedObjects[0].original,'Sale');assert.equal(requests[0].copyReferences[1].boundInThisBoard,false);assert.equal(requests[1].copyReferences.length,0);assert.equal(requests[1].nativeTemplateReplacement.verified,false);
});

test('gift-aware template plans persist full provenance and reject overlapping edits while allowing whole-document templates',()=>{
 const f=fixture(),obj=(id,name,kind,extra={})=>({id,name,kind,box:[50,70,40,20],localBox:[50,70,40,20],visible:true,nativePath:id.split('.').map(Number),steps:[{path:id.split('.').map(Number),name}],...extra});
 f.scan.templateInventory.objects.push(obj('0.5','gifts','group'),obj('0.5.0','gift text','text',{original:'价值79元\r键帽'}));
 f.mapping.approved.boards[0].fields[1]={key:'sale',cell:'D1',state:'value',value:'30',digest:'30'};f.args.removeObjectIds=[];f.args.boards[0].changes.push({objectId:'0.1',original:'$30',recordId:mappingRecords(f.mapping).find(r=>r.context.field==='sale').id,prefix:'$',anchor:'center'});
 f.mapping.approved.boards[0].fields.push({key:'赠品',role:'gift',state:'value',cell:'F1',value:'蓝键帽 价值99元'});
 f.args.gifts={field:'赠品',containerId:'0.5',textObjectId:'0.5.0',textParts:[{text:'价值',sourceStart:0},{token:'value',sourceStart:2},{text:'元\r',sourceStart:4},{token:'name',sourceStart:6}],frame:[50,70,40,20],imageFrame:[.5,0,.5,1],textFrame:[0,0,.5,1]};
 const catalog={directory:'C:/gifts',digest:'catalog',assets:[{name:'蓝键帽',path:'C:/gifts/blue.png',fingerprint:'blue'}]};
 const compile=()=>buildTemplatePlan(f.scan,f.mapping,f.args,mappingRecords(f.mapping),catalog);
 const p=compile();assert.equal(p.productTemplate.requests[0].giftReference.cell,'F1');assert.equal(p.productTemplate.giftCatalog.digest,'catalog');assert.equal(p.productSourceRecords.length,3);assert.equal(JSON.stringify(compile()),JSON.stringify(p));
 for(const id of ['0.5','0.5.0']){f.args.removeObjectIds.push(id);assert.throws(compile,/赠品区域/);f.args.removeObjectIds.pop();}
 f.args.layout.push({objectId:'0.5',x:50,y:70,anchorX:0,anchorY:0});assert.throws(compile,/赠品区域/);f.args.layout.pop();
 f.scan.templateInventory.objects.unshift({id:'@document',kind:'group',document:true,visible:true,nativePath:[],steps:[{path:[],name:'document'}],box:[0,0,100,100]});f.args.templateRootId='@document';assert.equal(compile().productTemplate.requests[0].root.document,true);
});

test('native JPG proof cache tracks document IDs without retaining closed source handles',()=>{
 const script=compositionScript('source.psb',[],'PSB','output',{productTemplate:{}}),start=script.indexOf('function jpg('),end=script.indexOf('\n',start),proofDocs=[],proofSources=[],saved=[];let copies=0;
 const doc=id=>({id,duplicate(){copies++;return {flatten(){},duplicate(){return {crop(){},width:{as:()=>100},height:{as:()=>100},saveAs(file){saved.push(file);},close(){}};}};}});
 function UnitValue(v){return v;}function File(v){return v;}function JPEGSaveOptions(){}
 const c=vm.createContext({proofDocs,proofSources,app:{},UnitValue,File,JPEGSaveOptions,Extension:{LOWERCASE:'lower'},SaveOptions:{DONOTSAVECHANGES:'no'},ResampleMethod:{BICUBIC:'bicubic'}});vm.runInContext(script.slice(start,end),c);
 c.jpg(doc(1),{box:[0,0,100,100]},'first.jpg');c.jpg(doc(1),{box:[0,0,100,100]},'same.jpg');c.jpg(doc(2),{box:[0,0,100,100]},'second.jpg');assert.equal(copies,2);assert.deepEqual(proofSources,[1,2]);assert.equal(saved.length,3);
});

function multiFixture(){
 const f=fixture(),second={...f.scan.sourceBoards[1]},fields=structuredClone(f.mapping.approved.boards[0].fields);f.mapping.approved.boards[1]={boardId:second.id,boardName:second.name,action:'use',fields};
 f.scan.sourceInventory.objects.push({...structuredClone(f.scan.sourceInventory.objects[1]),id:'1.0',boardId:11,nativePath:[1,0],steps:[{path:[1,0],name:'old-footer'}],box:[120,70,100,30]});
 f.scan.sourceBoards.push({id:12,name:'Retained',box:[240,0,100,100],nativePath:[2]});f.mapping.approved.boards.push({boardId:12,boardName:'Retained',action:'skip'});
 const scan2=structuredClone(f.scan);scan2.id='b'.repeat(64);scan2.template={path:'template-B.psb',fingerprint:'template-B'};scan2.templateInventory.objects[1].original='$88.50';
 const {boards,scanId,...config}=f.args,records=mappingRecords(f.mapping),b=structuredClone(boards[0]);b.boardId=11;b.oldObjectIds=['1.0'];b.placement=[120,0,100,100];b.changes=b.changes.map(c=>({...c,recordId:records.find(r=>r.context.boardId===11&&r.context.field===records.find(r=>r.id===c.recordId).context.field).id}));b.changes[0].original='$88.50';
 f.scans=[f.scan,scan2];f.records=records;f.args={templates:[{...config,templateFileId:'A',scanId:f.scan.id},{...structuredClone(config),templateFileId:'B',scanId:scan2.id}],boards:[{...boards[0],templateFileId:'A',scanId:f.scan.id},{...b,templateFileId:'B',scanId:scan2.id}]};return f;
}
const multiPlan=f=>buildTemplatePlan(f.scans,f.mapping,f.args,f.records,f.catalogs);
test('multi-template plan routes colliding object IDs through independent scans in one full source plan',()=>{
 const f=multiFixture(),p=multiPlan(f);assert.equal(p.productTemplate.version,2);assert.equal(p.productTemplate.templates.length,2);assert.equal(p.productTemplate.requests[0].actions.find(a=>a.mode==='text').original,'$99.50');assert.equal(p.productTemplate.requests[1].actions.find(a=>a.mode==='text').original,'$88.50');assert.deepEqual(p.productTemplate.requests.map(r=>r.templateFileId),['A','B']);assert.equal(p.boards.length,3);assert.equal(p.boards[2].name,'Retained');assert.equal(p.productSourceRecords.length,4);assert.deepEqual(multiPlan(f),JSON.parse(JSON.stringify(p)));new vm.Script(compositionScript('source.psb',[],'PSB','out',{productTemplate:p.productTemplate}).replace(/^#target photoshop\s*/,''));
});
test('multi-template refuses partial routes, swapped scans, extra templates, stale approvals and cross-product changes',()=>{
 for(const mutate of [f=>f.args.boards.pop(),f=>f.args.boards[1].templateFileId='A',f=>f.args.templates[1].scanId=f.args.templates[0].scanId,f=>f.scans[1].approvalDigest='old',f=>f.scans[1].source.fingerprint='other',f=>f.scans[1].sourceInventory.objects[0].name='changed',f=>f.args.boards[1].changes[0].recordId=f.records[0].id,f=>f.args.templateRootId='0',f=>f.args.boards[0].oldObjectIds=['1.0']]){const f=multiFixture();mutate(f);assert.throws(()=>multiPlan(f));}
});
test('empty approved gift field supports a genuine no-gift template and never drops actual gifts',()=>{
 const f=multiFixture();for(const b of f.mapping.approved.boards.filter(b=>b.action==='use'))b.fields.push({key:'gift',role:'gift',value:'  ',state:'value',cell:'F'+b.boardId});for(const t of f.args.templates)t.giftMode='none';assert.doesNotThrow(()=>multiPlan(f));f.mapping.approved.boards[1].fields.at(-1).value='蓝键帽 价值99元';assert.throws(()=>multiPlan(f),/无赠品模板/);
});
test('terminal range normalization accepts only implicit suffix and rejects visible glyph style changes',()=>{
 const c=vm.createContext({});vm.runInContext(templateNative,c);
 const a={textKey:'¥688',textStyleRange:[{from:0,to:1,textStyle:{fontPostScriptName:'A',size:12}},{from:1,to:4,textStyle:{fontPostScriptName:'A',size:24}},{from:4,to:5,textStyle:{fontPostScriptName:'A',size:12}}],paragraphStyleRange:[{from:0,to:5,paragraphStyle:{justification:'center'}}]},b=structuredClone(a);b.textStyleRange[1].to=5;b.textStyleRange.pop();
 const same=(x,y)=>c.tplTextSame(vm.runInContext('('+JSON.stringify(x)+')',c),vm.runInContext('('+JSON.stringify(y)+')',c),'¥688');assert.equal(same(a,b),true);
 for(const change of [v=>v.textStyleRange[1].textStyle.size=12,v=>v.textStyleRange[1].textStyle.fontPostScriptName='B',v=>v.textStyleRange[1].from=2,v=>v.textStyleRange[1].to=6,v=>v.paragraphStyleRange[0].paragraphStyle.justification='left']){const bad=structuredClone(b);change(bad);assert.equal(same(a,bad),false);}assert.equal(a.textStyleRange[1].to,4);
});
test('native template pool selects exact file and scan and closes only documents it opened',()=>{
 const pool=[],existing={saved:true,fullName:{fsName:'A.psd'},close(){assert.fail('closed user document');}},closed=[],app={documents:[existing],open:f=>({saved:true,fullName:f,close(){closed.push(f.fsName);}})};
 function File(p){this.fsName=p;this.exists=true;}const c=vm.createContext({app,File,SaveOptions:{DONOTSAVECHANGES:'no'}});vm.runInContext(require('../sku-template-native.cjs').templatePoolNative,c);c.tplOpenTemplates([{templateFileId:'A',scanId:'a',template:{path:'A.psd'}},{templateFileId:'B',scanId:'b',template:{path:'B.psb'}}],pool);assert.equal(c.tplPoolDoc(pool,{templateFileId:'A',scanId:'a'}),existing);assert.equal(c.tplPoolDoc(pool,{templateFileId:'B',scanId:'b'}).fullName.fsName,'B.psb');assert.throws(()=>c.tplPoolDoc(pool,{templateFileId:'B',scanId:'a'}),/路由/);c.tplCloseTemplates(pool);assert.deepEqual(closed,['B.psb']);
});

test('multi-template backend persists one plan, reuses source inspection and rejects second-template tampering after restart',async t=>{
 const f=multiFixture(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'multi-template-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));let sourceReads=0,templateReads=0,changed=false,composed=0;
 const config={directory:dir,readMapping:async()=>f.mapping,prepare:async()=>{},hash:async p=>p==='source.psb'?'source':p.endsWith('template.jpg')?'image':p==='template-B.psb'?(changed?'changed':'template-B'):'template',execute:async(d,script)=>{const name=path.basename(d);if(name==='source')sourceReads++;else{templateReads++;await fs.writeFile(path.join(path.dirname(d),'template.jpg'),'image');}const inventory=name==='source'?f.scan.sourceInventory:script.includes('template-B.psb')?f.scans[1].templateInventory:f.scan.templateInventory;await fs.writeFile(path.join(path.dirname(d),name+'.json'),JSON.stringify(inventory));},compose:async input=>{composed++;assert.equal(input.plan.productTemplate.templates.length,2);return {output:'one.psb'};}};
 const input={source:f.scan.source,mapping:f.mapping,metadata:{artboards:f.scan.sourceBoards}},engine=createProductTemplateEngine(config),templates=[];
 for(const [i,s]of f.scans.entries()){const scan=await engine.inspect({...input,template:s.template});f.args.templates[i].scanId=scan.id;f.args.boards[i].scanId=scan.id;templates.push({templateFileId:f.args.templates[i].templateFileId,template:s.template});}
 const configured=await engine.configure({...input,templates,args:f.args,records:f.records});assert.equal(sourceReads,1);assert.equal(templateReads,2);
 const restored=JSON.parse(JSON.stringify(configured.plan));await createProductTemplateEngine(config).run({source:input.source,plan:restored});assert.equal(composed,1);assert.equal(sourceReads,1);
 const bad=structuredClone(restored);bad.productTemplate.requests[1].templateFileId='A';await assert.rejects(engine.validate({source:input.source,plan:bad}),/不一致/);changed=true;await assert.rejects(engine.validate({source:input.source,plan:restored}),/已变化/);assert.equal(composed,1);
});

test('mixed template routing applies approved deletion once and keeps skipped boards in place',()=>{
 const f=multiFixture(),deleted={id:13,name:'Delete approved',box:[360,0,100,100],nativePath:[3]};for(const s of f.scans)s.sourceBoards.push(structuredClone(deleted));f.mapping.approved.boards.push({boardId:13,boardName:deleted.name,action:'delete',deleteConfirmed:true,reason:'Explicit deletion'});f.args.deleteBoardIds=[13];const p=multiPlan(f);assert.equal(p.boards.length,3);assert.deepEqual(p.productTemplate.deletedBoards.map(b=>b.boardId),[13]);assert.deepEqual(p.productTemplate.requests.map(r=>r.boardId),[10,11]);f.args.deleteBoardIds=[12];assert.throws(()=>multiPlan(f),/deleteBoardIds/);
});
