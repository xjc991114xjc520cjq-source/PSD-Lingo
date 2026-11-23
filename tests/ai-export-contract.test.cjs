const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {smartFit,manualStyleFor}=require('../layout.cjs');
const {hash,validatePlan,jsxForPlan}=require('../core.cjs');
const {planAiFile}=require('../design-layout-planner.cjs');
const {validateDesignOutput,schema}=require('../services/ai-layout.cjs');
const {activeContainerEdits}=require('../container-fit.cjs');
const app=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
function fixture(){
 const text='Approved Spanish copy',records=[{id:'r',target:text,digest:hash(text)}];
 const file={path:'D:/fixture.psd',name:'fixture.psd',fingerprint:'a'.repeat(64),width:1000,height:1000,layers:[{id:1,recordId:'r',name:'Title',original:'原稿',font:'ArialMT',size:30,minSize:20,tracking:0,leading:36,alignment:'left',box:[20,20,400,80],issues:[]}]};
 const fitText=(l,r)=>{const m=l.manual?manualStyleFor(l):{};return smartFit({text:r.target,size:m.size??l.size,minSize:m.size??l.minSize,width:l.box[2],height:l.box[3],tracking:m.tracking??0,leading:m.leading??36,allowWrap:true},(t,s)=>({width:t.length*s*.45,height:s,ascent:s*.8}));};
 return {records,file,fitText};
}
function workspace(f,learning={}){
 const state={files:[f.file],records:f.records,fileIndex:0,layerIndex:0};let renders=0;
 const context={typographyEditsFor:require('../services/typography.cjs').typographyEditsFor,textActionsFor:require('../native-text-objects.cjs').textActionsFor,structuredClone,state,manualStyleFor,activeContainerEdits,layoutLearning:learning,startLearningTask:action=>Promise.resolve().then(action).catch(()=>{}),fitText:f.fitText,record:id=>f.records.find(r=>r.id===id),policyFor:()=>({allowWrap:true,allowLeading:false,trackingLimit:0}),file:()=>state.files[state.fileIndex],layer:()=>state.files[state.fileIndex].layers[state.layerIndex],contextProperties:null,containerEditor:null,layoutEditor:null,render:()=>renders++,focusBoundLayer(){}};
 const select=app.slice(app.indexOf('function selectedLayer('),app.indexOf('\nfunction selectFile('));
 const plans=app.slice(app.indexOf('function previewLayoutFor('),app.indexOf('\nfunction task('));
 vm.runInNewContext(select+'\n'+plans+'\nglobalThis.api={makePlan,selectedLayer};',context);return {...context.api,state,renders:()=>renders};
}
test('AI contract carries all Photoshop typography through preview and actual PSD script validation',async()=>{
 const f=fixture();let request;
 const result=await planAiFile({...f,scope:'current',layerId:1,call:async(_method,r)=>{request=r;const l=r.layers[0];return {proposals:validateDesignOutput({proposals:[{layerKey:l.layerKey,box:[20,20,400,80],font:l.font,weight:l.weight,stretchX:l.stretchX,stretchY:l.stretchY,size:28,tracking:0,leading:34,alignment:'left',reason:'Keep source hierarchy',containerEdit:null}]},r)};}});
 assert.equal(result.accepted.length,1);f.file=result.working;
 for(const key of ['font','weight','stretchX','stretchY','size','tracking','leading']){assert.ok(schema.properties.proposals.items.required.includes(key));assert.ok(Object.hasOwn(request.layers[0],key));}
 const w=workspace(f),before=JSON.stringify(f.file.layers);w.selectedLayer(0);w.selectedLayer(0);assert.equal(JSON.stringify(f.file.layers),before);
 const plan=await w.makePlan();validatePlan(plan);const jsx=jsxForPlan(plan);assert.ok(jsx.includes('ArialMT'));assert.ok(jsx.includes('Approved Spanish copy'));assert.equal(plan.files[0].jobs[0].manual.enabled,true);assert.equal(plan.files[0].jobs[0].manual.weight,'original');assert.equal(plan.files[0].jobs[0].manual.size,28);
});
test('legacy AI fields are completed from existing source without changing the project',async()=>{
 const f=fixture();f.file.layers[0].manual={size:28,tracking:4,leading:34};const before=JSON.stringify(f.file),w=workspace(f);const plan=await w.makePlan();validatePlan(plan);assert.equal(JSON.stringify(f.file),before);const m=plan.files[0].jobs[0].manual;assert.equal(m.font,'ArialMT');assert.equal(m.size,28);assert.equal(m.tracking,4);assert.equal(m.leading,34);assert.equal(m.stretchX,100);
});
test('learning throws, rejects or never resolves without preventing export plan creation',async()=>{
 for(const prepareExport of [()=>{throw Error('snapshot failed');},async()=>{throw Error('disk failed');},()=>new Promise(()=>{})]){const f=fixture(),w=workspace(f,{prepareExport});let resolved=false;const plan=await w.makePlan().then(p=>{resolved=true;return p;});assert.equal(resolved,true);validatePlan(plan);}
});
test('AI missing or changed font, weight or stretch never reaches preview',()=>{
 const {buildDesignLayoutRequest}=require('../design-layout-context.cjs'),f=fixture(),r=buildDesignLayoutRequest({file:f.file,layer:f.file.layers[0],records:f.records,fitText:f.fitText});
 const valid={layerKey:'1',box:[20,20,400,80],font:'ArialMT',weight:'original',stretchX:100,stretchY:100,size:28,tracking:0,leading:34,alignment:'left',reason:'Preserve source',containerEdit:null};
 for(const key of ['font','weight','stretchX','stretchY']){const missing={...valid};delete missing[key];assert.throws(()=>validateDesignOutput({proposals:[missing]},r));}
 for(const patch of [{font:'OtherFont'},{weight:'bold'},{stretchX:90},{stretchY:90}])assert.throws(()=>validateDesignOutput({proposals:[{...valid,...patch}]},r));
});

test('whole-document font edits produce real export plans without a copy document and compose after approved copy edits',async()=>{
 const f=fixture();f.file.layers[0].typography={font:'Arial-BoldMT',tracking:12,sizeScale:.9};delete f.file.layers[0].recordId;f.records=[];
 const plan=await workspace(f).makePlan();validatePlan(plan);assert.equal(plan.files[0].jobs.length,0);assert.equal(plan.files[0].typographyEdits[0].original,'原稿');assert.equal(plan.files[0].typographyEdits[0].typography.sizeScale,.9);assert.ok(jsxForPlan(plan).includes('nativeTypographyEdits'));
 const bound=fixture();bound.file.layers[0].typography={font:'Arial-BoldMT'};const combined=await workspace(bound).makePlan();validatePlan(combined);assert.equal(combined.files[0].typographyEdits[0].target,combined.files[0].jobs[0].previewLayout.text);
});
