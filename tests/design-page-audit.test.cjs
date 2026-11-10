const fixtureChecks=()=>require('../services/design-composition.cjs').dimensions.map(id=>({id,verdict:'accept',evidence:'Fixture actual composition was inspected'}));
const {test}=require('node:test'),assert=require('node:assert/strict');
const {checks,validateAudit,auditPrompt}=require('../services/design-page-audit.cjs');
const {auditDesignFile}=require('../design-document-audit.cjs');
const {measuredSpaceOptions}=require('../design-space-options.cjs');
const {buildDesignLayoutRequest}=require('../design-layout-context.cjs');
const passed=()=>({designChecks:fixtureChecks(),checks:checks.map(id=>({id,verdict:'pass',evidence:'Rendered reading relationship inspected',layerKeys:[]}))});

test('page cache preserves failures and invalidates on new copy, visuals, model/rules/references or explicit review',async()=>{
 const file={fingerprint:'original',width:500,height:800,layers:[{id:7,box:[30,30,80,20],size:20,font:'Arial',recordId:'r',boardNames:['p'],boardBox:[0,0,500,800]}]},records=[{id:'r',target:'Complete copy'}],cache=new Map();let calls=0,image='first',context='task/model/rules/reference/1';
 const options={file,records,cache,buildRequest:buildDesignLayoutRequest,getVisual:async({crop})=>[{stage:'current',crop,dataURL:image}],call:async()=>{calls++;const v=passed();v.checks[0].verdict='fail';return {audit:v};}};
 const run=extra=>auditDesignFile({...options,cacheIdentity:context,...extra});
 assert.equal((await run()).passed,false);assert.equal(calls,2);const cached=await run();assert.equal(cached.passed,false);assert.equal(cached.reusedBoards,1);assert.equal(calls,2);
 context='task/model/rules/reference/2';await run();assert.equal(calls,4);records[0].target='Revised complete copy';await run();assert.equal(calls,6);image='changed image';await run();assert.equal(calls,8);await run({forceReview:true});assert.equal(calls,10);
 let cancelled=false;await assert.rejects(run({getVisual:async({crop})=>{cancelled=true;return [{stage:'current',crop,dataURL:image}];},isCancelled:()=>cancelled}),/任务已变化/);assert.equal(calls,10);
});
test('audit compares inherited source relationships without exempting new damage or explicitly requested repairs',()=>{
 const prompt=auditPrompt({layers:[]});for(const term of ['先比较source与current','原稿沿用','新增实质遮挡','可读性损失','用户要求修正','不能证明视觉关系不变','移动合法文字'])assert.ok(prompt.includes(term),term);
});
test('planning and both reviews share role and actual reading-impact policy across unseen artwork',()=>{
 const policy=require('../services/design-page-audit.cjs').interferencePolicy;
 for(const term of ['功能性分隔线','背景光效','本身不是错误','小数点','单位','阅读顺序','具体信息丢失','不因“原稿沿用”才获豁免','原稿已有也不是','不把审美偏好升级为制作错误'])assert.ok(policy.includes(term),term);
 assert.ok(auditPrompt({layers:[]}).includes(policy));assert.ok(require('../services/design-visual-review.cjs').reviewPrompt({}).includes(policy));
 const request={version:1,selectedLayerKey:'unseen',canvas:{width:800,height:900},layers:[{layerKey:'unseen',box:[20,20,200,30],sourceBox:[20,20,200,30],size:24,font:'Arial',bound:true,target:'Unseen approved text'}],containers:[]};
 assert.ok(require('../services/ai-layout.cjs').designPrompt(request).includes(policy));
});
test('hide-only edits still require whole-page rendered audit, including artwork-only pages',async()=>{
 const o={objectId:'g:1',sourceIdentity:'original',kind:'outline-candidate',box:[20,20,60,10],boardBox:[0,0,500,800],boardNames:['A']};
 const file={width:500,height:800,layers:[],artworkObjects:[o],artworkHides:[{objectId:o.objectId,sourceIdentity:o.sourceIdentity,reason:'Duplicate'}]};let seen;
 const result=await auditDesignFile({file,records:[],buildRequest:()=>assert.fail('No invented text anchor'),getVisual:async()=>[{stage:'current'}],call:async(_n,request)=>{seen=request;const v=passed();v.checks[1].layerKeys=['g:1'];return {audit:v};}});
 assert.equal(result.passed,true);assert.equal(seen.visibilityEdits.length,1);assert.equal(seen.artworkObjects[0].hidden,true);assert.equal(seen.activeBoard.name,'A');
});
test('page acceptance fails for missing, repeated, uncertain or invented audit identities',()=>{
 const r={layers:[{layerKey:'fresh'}]};assert.equal(validateAudit(passed(),r).passed,true);
 for(const id of checks){const v=passed();v.checks.find(c=>c.id===id).verdict='uncertain';assert.equal(validateAudit(v,r).passed,false);}
 for(const change of [v=>v.checks.pop(),v=>v.checks[1].id=v.checks[0].id,v=>v.checks[0].layerKeys=['wrong-page'],v=>v.checks[0].evidence='',v=>v.checks[0].verdict='improved']){const v=passed();change(v);assert.throws(()=>validateAudit(v,r));}
});
test('read-only audit can identify a known container without treating it as editable text',()=>{const v=passed();v.checks[4].layerKeys=['1000087'];assert.equal(validateAudit(v,{layers:[],containers:[{id:'1000087'}]}).passed,true);assert.throws(()=>validateAudit(v,{layers:[],containers:[]}));});
test('full page audit includes unbound and mixed text and contextual copy, across reordered pages',async()=>{
 for(const reverse of [false,true]){
  const layers=[{id:19,box:[100,30,100,25],sourceBox:[100,30,100,25],size:20,font:'Arial',recordId:'a',boardNames:['A'],boardBox:[0,0,500,600],original:'Source'},
   {id:72,box:[120,100,70,50],size:35,font:'Arial',issues:['mixed'],boardNames:['A'],boardBox:[0,0,500,600],original:'Unbound mixed specification'},
   {id:3,box:[600,30,100,25],size:22,font:'Arial',recordId:'b',boardNames:['B'],boardBox:[500,0,600,600],original:'Other'}];
  if(reverse)layers.reverse();const file={width:1100,height:600,layers,containers:[]},before=JSON.stringify(file),seen=[];
  const records=[{id:'a',target:'A new language',context:{imageCandidates:[{media:'anchor'}]}},{id:'b',target:'Another heading'},{id:'unused',target:'A price component',context:{imageCandidates:[{media:'anchor'}]}}];
  const out=await auditDesignFile({file,records,buildRequest:buildDesignLayoutRequest,getVisual:async({crop})=>[{stage:'current',crop}],call:async(_n,r)=>{seen.push(r);const v=passed();if(r.activeBoard.name==='A'){assert.ok(r.layers.some(l=>l.layerKey==='72'&&!l.bound));assert.ok(r.copyReferences.some(c=>c.id==='unused'&&!c.boundInThisBoard));v.checks[0]={id:'copyCoverage',verdict:'fail',evidence:'Missing approved price component',layerKeys:[]};}return {audit:v};}});
  assert.equal(out.passed,false);assert.equal(out.boards.length,2);assert.equal(out.failures.length,1);assert.equal(JSON.stringify(file),before);assert.ok(seen.every(r=>r.layers.every(l=>l.boardNames[0]===r.activeBoard.name)));
 }
});
test('unclear full-page audit receives fresh matching detail images; actual defects remain failures',async()=>{
 for(const corrected of [true,false]){
  const file={width:1200,height:1600,layers:[{id:7,box:[650,1300,180,50],size:40,font:'Arial',recordId:'r',boardNames:['p'],boardBox:[0,0,1200,1600]}],containers:[]},crops=[];let calls=0;
  const result=await auditDesignFile({file,records:[{id:'r',target:'Complete parameter'}],buildRequest:buildDesignLayoutRequest,getVisual:async({crop})=>{crops.push(crop);return [{stage:'source',crop},{stage:'current',crop}];},call:async(_n,r)=>{calls++;const v=passed();if(calls===1||!corrected)v.checks[5]={id:'clearance',verdict:calls===1?'uncertain':'fail',evidence:'Check parameter and diagonal line',layerKeys:['7']};if(calls===2){assert.ok(r.visuals.some(v=>v.stage==='current'&&v.crop[2]<file.width));assert.equal(r.detailReview.previousChecks[5].verdict,'uncertain');assert.ok(r.visuals.length<=8);}return {audit:v};}});
  assert.equal(calls,2);assert.equal(result.passed,corrected);assert.equal(result.boards[0].initialChecks[5].verdict,'uncertain');assert.ok(result.boards[0].detailCrops.length>0);assert.ok(crops.every(c=>c[0]>=0&&c[1]>=0&&c[0]+c[2]<=1200&&c[1]+c[3]<=1600));
 }
});
test('detail review rejects unrelated or stale crop evidence',async()=>{
 const file={width:500,height:800,layers:[{id:7,box:[30,30,80,20],size:20,font:'Arial',recordId:'r',boardNames:['p'],boardBox:[0,0,500,800]}]};let images=0;
 await assert.rejects(auditDesignFile({file,records:[{id:'r',target:'Target'}],buildRequest:buildDesignLayoutRequest,getVisual:async()=>[{stage:'current',crop:++images===1?[0,0,500,800]:[0,0,1,1]}],call:async()=>{const v=passed();v.checks[5].verdict='uncertain';return {audit:v};}}),/对应区域/);
});
test('audit detects cancellation and absent rendered evidence rather than silently passing',async()=>{
 const file={width:100,height:100,layers:[{id:7,box:[1,1,50,10],size:10,font:'Arial',recordId:'r',boardNames:['p'],boardBox:[0,0,100,100]}],containers:[]},options={file,records:[{id:'r',target:'New'}],buildRequest:buildDesignLayoutRequest,getVisual:async()=>[],call:()=>assert.fail('No image')};
 await assert.rejects(auditDesignFile(options),/实际当前画面/);await assert.rejects(auditDesignFile({...options,isCancelled:()=>true}),/任务已变化/);
});
test('space alternatives use approved text and peer sizes without treating old narrow frame as usable space',()=>{
 for(const width of [500,940]){
  const l={id:1,font:'Arial',size:40,box:[50,50,50,90],recordId:'r',boardBox:[0,0,width,900],boardNames:['p'],manual:{size:25},customText:'Approved replacement'},f={width,height:900,layers:[l,{...l,id:99,manual:{size:30}}]};const before=JSON.stringify(f);
  const o=measuredSpaceOptions({file:f,layer:l,record:{target:'Other reference'},fitText:(c,r)=>{assert.equal(c.textLayout.sourceText,'Approved replacement');assert.equal(c.box[2],width);return {width:c.manual.size*12,height:c.manual.size,lines:['Approved replacement']};}});
  assert.deepEqual(o.candidates.map(c=>c.size),[25,40,30]);assert.equal(o.availableRegion,'unknown-until-visual-obstacle-review');assert.equal(JSON.stringify(f),before);
 }
});
