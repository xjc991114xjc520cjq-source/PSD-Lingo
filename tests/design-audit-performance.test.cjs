const {test}=require('node:test'),assert=require('node:assert/strict');
const {auditDesignFile}=require('../design-document-audit.cjs');
const {buildDesignLayoutRequest}=require('../design-layout-context.cjs');
const pass=()=>({checks:require('../services/design-page-audit.cjs').checks.map(id=>({id,verdict:'pass',evidence:'实际交付图层级与文案已核对',layerKeys:[]})),designChecks:require('../services/design-composition.cjs').dimensions.map(id=>({id,verdict:'accept',evidence:'实际整页关系已核对'})),skillReviews:require('../services/design-plugins/manifest.json').skills.map(s=>({id:s.id,verdict:['design-critique','graphic-judgment'].includes(s.id)?'accept':'not-applicable',evidence:'已按适用范围检查实际图'}))});
function fixture(n=54){const file={fingerprint:'same-source',width:n*100,height:100,layers:Array.from({length:n},(_,i)=>({id:i+1,original:'Original',recordId:'r'+i,font:'Arial',size:10,box:[i*100+10,10,50,20],boardNames:['SKU'+i],boardBox:[i*100,0,100,100]})),containers:[]};return {file,records:file.layers.map(l=>({id:l.recordId,target:'Approved'+l.id}))};}
test('54 distinct final boards stream six at a time, use nine exchanges, retain every verdict and reuse all 54 receipts',async()=>{
 const {file,records}=fixture(),cache=new Map(),prepared=[],seen=[],progress=[];let calls=0;
 const options={file,records,cache,cacheIdentity:'same task/model/rules',requireDelivery:true,buildRequest:buildDesignLayoutRequest,onProgress:p=>progress.push(p.current),getVisual:async({crop,currentOnly})=>{prepared.push(crop[0]);return [{stage:'current',dataURL:'actual-jpg-'+crop[0],crop,origin:'exported-jpeg',deliveryEvidence:{reopened:true,jpegHash:String(crop[0])}}];},call:()=>assert.fail('No individual review on clear batch'),callBatch:async pages=>{
  calls++;if(calls===1)assert.equal(prepared.length,6,'must start review before preparing all 54');
  assert.ok(pages.length<=6);for(const p of pages){assert.equal(p.layers.length,1);assert.equal(p.copyReferences.length,1);seen.push(p.activeBoard.name);}return {pages:pages.map(()=>({audit:pass()}))};
 }};
 const first=await auditDesignFile(options);assert.equal(first.passed,true);assert.equal(calls,9);assert.equal(new Set(seen).size,54);assert.equal(first.boards.length,54);assert.equal(cache.size,54);assert.ok([...cache.keys()].every(k=>k.length===64));assert.ok(progress.every((n,i)=>i===0||n>=progress[i-1]));assert.equal(progress.at(-1),54);
 const second=await auditDesignFile(options);assert.equal(second.reusedBoards,54);assert.equal(calls,9);assert.equal(second.performance.initialExchanges,0);
 records[27].target='Revised approved copy';await auditDesignFile({...options,call:async(_name,p)=>{calls++;assert.equal(p.activeBoard.name,'SKU27');return {audit:pass()};}});assert.equal(calls,10,'only changed board invalidates its review');
});
test('uncertain pages share detail exchanges and never reload source images for current-only crops',async()=>{
 const {file,records}=fixture(6);let batches=0,details=0;
 const result=await auditDesignFile({file,records,requireDelivery:false,buildRequest:buildDesignLayoutRequest,getVisual:async({crop,currentOnly})=>{if(crop[2]<100){assert.equal(currentOnly,true);details++;}return [{stage:'current',crop,dataURL:'jpeg',origin:'exported-jpeg',deliveryEvidence:{reopened:true}}];},call:()=>assert.fail('detail pages should share their exchange'),callBatch:async pages=>{batches++;return {pages:pages.map((p,i)=>{const audit=pass();if(!p.detailReview&&i<2){audit.checks[5]={id:'clearance',verdict:'uncertain',evidence:'小字需放大辨认',layerKeys:[p.layers[0].layerKey]};}return {audit};})};}});
 assert.equal(batches,2);assert.equal(details,2);assert.equal(result.boards.length,6);assert.equal(result.passed,true);assert.equal(result.performance.detailPages,2);
});
test('missing approved information remains unresolved without wasting a detail render',async()=>{
 const {file,records}=fixture(1);let renders=0,calls=0;const result=await auditDesignFile({file,records,buildRequest:buildDesignLayoutRequest,getVisual:async({crop})=>{renders++;return [{stage:'current',crop}];},call:async()=>{calls++;const audit=pass();audit.checks[0].verdict='uncertain';audit.checks[0].evidence='缺少批准表格资料，无法确认文案归属';return {audit};}});
 assert.equal(result.passed,false);assert.equal(renders,1);assert.equal(calls,1);assert.equal(result.performance.detailPages,0);
});
test('final review prompt requires only completed JPG and approved copy, not source comparison or repeat crops',()=>{
 const prompt=require('../services/design-page-audit.cjs').auditPrompt({layers:[],finalDelivery:{jpegPath:'completed.jpg',reopened:true}},{includeSchema:false});
 assert.ok(prompt.includes('不需要原稿对照图'));assert.ok(prompt.includes('不读取或校验工程文件'));assert.ok(prompt.includes('不要自动请求局部图'));assert.ok(!prompt.includes('先比较source与current'));assert.ok(!prompt.includes('Schema：{'));
});
