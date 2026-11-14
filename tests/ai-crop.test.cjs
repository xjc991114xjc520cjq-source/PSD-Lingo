const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');const {illustratorSkuNative}=require('../sku-illustrator.cjs');
const {photoshopAiBridgeNative}=require('../sku-illustrator.cjs');
function frame(source,ink,page,pages=1){const c={};vm.createContext(c);vm.runInContext(illustratorSkuNative,c);return JSON.parse(JSON.stringify(c.aiSourceFrame(source,ink,page,pages)));}
test('artwork import keeps its frame when artwork intersects a smaller artboard',()=>{const ink=[4521.20245,-5162.79755,5725.20245,-6652.70552],page=[4523.16590,-5165.46421,5723.16590,-6650.61759];const result=frame({width:1204,height:1489.91003,resolution:72,crop:7},ink,page);assert.equal(result.kind,'artwork');assert.deepEqual(result.before,ink);});
test('artwork import also keeps its frame when all artwork is outside its artboard',()=>{const ink=[3238.454,-5162.79755,4442.454,-6652.70552];assert.equal(frame({width:1204,height:1489.91003,crop:7},ink,[4523,-5165,5723,-6650]).kind,'artwork');});
test('intentional artboard crop remains the original page even if artwork extends outside it',()=>{const page=[0,100,100,0],ink=[-10,110,120,-20],result=frame({width:100,height:100,crop:1},ink,page);assert.equal(result.kind,'artboard');assert.deepEqual(result.before,page);});
test('placement pixel dimensions are converted through stored resolution instead of treating pixels as AI points',()=>{const ink=[0,100,200,0],page=[0,90,190,0];assert.equal(frame({width:400,height:200,resolution:144,crop:7},ink,page).kind,'artwork');});
test('source crop disambiguates equal-size but offset pages; unknown and multi-page frames cannot silently change the image',()=>{const ink=[0,100,100,0],page=[200,100,300,0];assert.equal(frame({width:100,height:100,crop:7},ink,page).kind,'artwork');assert.equal(frame({width:100,height:100,crop:1},ink,page).kind,'artboard');assert.throws(()=>frame({width:88,height:88,crop:7},ink,page),/均不匹配/);assert.throws(()=>frame({width:100,height:100,crop:7},ink,page,2),/多画板/);});

function replaceFixture({badGeometry=false,empty=false,missingFont=false}={}){
 const original=[11396,9963,12756,9963,12756,11284,11396,11284],ink=[4192.875,1620.979,5529.305,322.219],calls=[],logs={},audit=[];
 const c={WORK:'fixture',fontPresent:()=>!missingFont,sid:x=>x,charIDToTypeID:x=>x,DialogModes:{NO:0},nativeStep(){},desc:()=>({getObjectValue:()=>({size:{width:1336.43,height:1298.76},resolution:{value:72},crop:7})}),objectData:x=>x,
 ActionDescriptor:function(){this.values={};this.putPath=(k,v)=>this.values[k]=v;this.putInteger=(k,v)=>this.values[k]=v;},bounds:()=>empty?[0,0,0,0]:[11491,9964,1252,1236],moveAiLayer(){},write:(file,data)=>logs[file]=data,
 quad:()=>calls.length&&badGeometry?[11396,9963,12647,9963,12647,11199,11396,11199]:original.slice(),project:(q,x,y)=>[q[0]+(q[2]-q[0])*x+(q[6]-q[0])*y,q[1]+(q[3]-q[1])*x+(q[7]-q[1])*y],
 executeAction:(name,a)=>{calls.push({name,...a.values});assert.equal(a.values.Crop,3,'replacement must import the full saved PDF page, not default content bounds');assert.equal(a.values.PgNm,1);}};
 vm.createContext(c);vm.runInContext(photoshopAiBridgeNative,c);
 c.exportAiObject=()=>({fsName:'fixture.ai',remove(){}});c.callAi=()=>({beforeBounds:ink.slice(),afterBounds:ink.slice(),cropPolicy:'artwork',pageRepair:true});
 return {run:()=>c.editAi({activeLayer:{}},{},[{objectFonts:missingFont?['Missing']:[],source:'third crop regression',original:'before',target:'after'}],audit),calls,logs,audit};
}
test('AI replacement explicitly imports the saved page; real third-case crop cannot silently use content bounds',()=>{const f=replaceFixture();f.run();assert.equal(f.calls[0].name,'placedLayerReplaceContents');assert.equal(f.audit.length,1);assert.deepEqual(f.logs['fixture/geometry-last.json'].actualQuad,f.logs['fixture/geometry-last.json'].originalQuad);});
test('AI replacement retains the geometry guard and reports actual and expected corners on mismatch',()=>{const f=replaceFixture({badGeometry:true});assert.throws(f.run,/geometry-last.json/);assert.equal(f.audit.length,0);assert.notDeepEqual(f.logs['fixture/geometry-last.json'].actualQuad,f.logs['fixture/geometry-last.json'].expectedQuad);});
test('AI replacement never accepts transparent content even when optional review is disabled',()=>{const f=replaceFixture({empty:true});assert.throws(f.run,/无可见内容/);assert.equal(f.audit.length,0);});
test('missing font in unrelated text stops an AI object before any edit or replacement',()=>{const f=replaceFixture({missingFont:true});assert.throws(f.run,/同一 AI 对象中的未修改文字/);assert.equal(f.calls.length,0);assert.equal(f.audit.length,0);});

test('AI analysis includes missing fonts from unrelated text only in an object that may be edited',()=>{
 const data={texts:2,entries:[{index:0,name:'target',original:'SALE',fonts:['Ready'],styles:[],problems:[],visible:true},{index:1,name:'price',original:'180',fonts:['Missing'],styles:[],problems:[],visible:true}]};
 const c={RULE:{},desc:()=>({getObjectValue:()=>({size:{width:100,height:100},resolution:{value:72},crop:1})}),objectData:v=>v,sid:v=>v,fontPresent:n=>n==='Ready',layerKey:()=> '0',hits:()=>1,textPlan:s=>({exact:s==='SALE'?'MEGA':s,related:[]})};vm.createContext(c);vm.runInContext(photoshopAiBridgeNative,c);c.exportAiObject=()=>({fsName:'fixture.ai',remove(){}});c.callAi=()=>data;
 const result={matches:[],related:[],skipped:[]};c.scanAi({}, {},[{path:[0]}],{},true,false,'object',result);assert.equal(result.matches.length,1);assert.deepEqual(Array.from(result.matches[0].objectFonts),['Ready','Missing']);assert.equal(result.fontResources.length,1);assert.equal(result.fontResources[0].aiIndex,1);assert.equal(result.fontResources[0].problems[0],'缺少字体 Missing');
 data.sourceFrameIssue='AI 原始裁切尺寸不一致';const guarded={matches:[],related:[],skipped:[]};c.scanAi({}, {},[{path:[0]}],{},true,false,'mismatched object',guarded);assert.ok(guarded.matches[0].problems.includes(data.sourceFrameIssue));data.entries[0].original='UNCHANGED';const unrelated={matches:[],related:[],skipped:[]};c.scanAi({}, {},[],{},true,false,'untouched object',unrelated);assert.equal(unrelated.fontResources,undefined);
});

test('font repair groups and clears object resource blockers using a representative without changing user decisions',()=>{
 const {fontGroups,refreshPlan}=require('../font-recheck.cjs');const resource={key:'0/@ai.1',engine:'illustrator',steps:[{path:[0]}],source:'object/price',original:'180',aiIndex:1,problems:['缺少字体 Missing']};
 const plan={id:'p',input:'source.psd',matches:[],related:[],fontResources:[resource],blockers:['object/price：缺少字体 Missing'],variantDecisions:[{selected:false}]};const groups=fontGroups([plan],['Missing']);assert.equal(groups.length,1);assert.equal(groups[0].representative.entry.aiIndex,1);const next=refreshPlan(plan,new Set(['illustrator::Missing']));assert.deepEqual(next.blockers,[]);assert.deepEqual(next.fontResources[0].problems,[]);assert.deepEqual(next.variantDecisions,plan.variantDecisions);assert.equal(plan.blockers.length,1);
});
test('AI bundled fonts are checked from its own installation instead of treating document placeholders as installed',()=>{const c={app:{path:{fsName:'D:/Illustrator'}},File:function(path){this.exists=path==='D:/Illustrator/Support Files/Required/Fonts/AdobeSongStd-Light.otf';this.length=this.exists?1000:0;}};vm.createContext(c);vm.runInContext(illustratorSkuNative,c);assert.equal(c.aiPrivateFontPresent('AdobeSongStd-Light'),true);assert.equal(c.aiPrivateFontPresent('MissingPlaceholder'),false);assert.equal(c.aiPrivateFontPresent('../AdobeSongStd-Light'),false);});
test('Bebas author download is explicitly allowed without permitting other font downloads from that host',()=>{const {allowedUrl}=require('../services/font-repair.cjs');assert.equal(allowedUrl('https://dl.dafont.com/dl/?f=bebas'),true);assert.equal(allowedUrl('https://dl.dafont.com/dl/?f=anythingelse'),false);assert.equal(allowedUrl('https://dl.dafont.com/dl/?f=bebas&redirect=evil'),false);});

test('BridgeTalk request round-trips multiline copy, NUL, Unicode separators, quotes and Windows paths without toSource',()=>{
 const {jsonNative}=require('../native-json.cjs');
 const c={WORK:'D:/test',AI_RUNNER:'function(req){return enc(req);}',write(){},$: {sleep(){}}};
 c.BridgeTalk=function(){this.send=()=>this.onResult({body:vm.runInContext(this.body,c)});};c.BridgeTalk.getSpecifier=()=> 'illustrator';
 vm.createContext(c);vm.runInContext(jsonNative+photoshopAiBridgeNative,c);
 for(const value of ['first\rsecond\r','first\nsecond','nul\u0000end','sep\u2028line\u2029end','quote"slash\\', 'D:\\设计\\稿件.ai']){
  const request={operation:'apply',original:value,target:value+' changed',edits:[{original:value}],file:value};
  Object.defineProperty(request,'toSource',{get(){throw Error('unsafe Adobe serialization');}});
  const result=c.callAi(request);assert.equal(result.original,value);assert.equal(result.target,value+' changed');assert.equal(result.edits[0].original,value);assert.equal(result.file,value);
 }
});
