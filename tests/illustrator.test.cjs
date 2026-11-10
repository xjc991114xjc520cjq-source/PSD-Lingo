const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {native,script,isIllustrator,assertAi}=require('../illustrator.cjs');
const {runNativePlan}=require('../native-runner.cjs');
const {outputName}=require('../batch.cjs');
const {hash}=require('../core.cjs');
function context(extra={}){const c={...extra};vm.createContext(c);vm.runInContext(native,c);return c;}
function plan(){const target='日本語タイトル';return {version:1,records:[{id:'r',target,digest:hash(target)}],files:[{name:'源.ai',path:'D:/源.ai',format:'AI',fingerprint:'a'.repeat(64),width:600,height:900,jobs:[{layerId:1,original:'中文',font:'ArialMT',size:30,minSize:20,box:[20,20,300,60],recordId:'r',target,previewLayout:{text:target,breaks:[],font:'ArialMT',weight:'original',size:28,tracking:0,leading:34,stretchX:100,stretchY:100,box:[20,20,280,50]}}]}]};}
test('AI plans keep document provenance and reject PS-specific geometry',()=>{
 const p=plan();assert.equal(assertAi(p),p);assert.equal(isIllustrator('D:/A.AI'),true);assert.equal(outputName('原稿.ai','日本語.txt','AI'),'原稿_日本語.ai');
 p.files[0].jobs[0].target='invented';assert.throws(()=>assertAi(p),/并非/);
 const q=plan();delete q.files[0].jobs[0].previewLayout;assert.throws(()=>assertAi(q),/预览参数/);
 q.files[0].path='D:/bad.psd';assert.throws(()=>assertAi(q),/非 AI/);
});
test('multi-artboard coordinates map upper-left screen to native Y-up bounds',()=>{
 const c=context();c.doc={artboards:[{artboardRect:[-40,900,560,0]},{artboardRect:[600,800,1200,-100]}]};
 assert.deepEqual(Array.from(vm.runInContext('rect(doc)',c)),[-40,900,1200,-100]);c.frame={geometricBounds:[0,850,200,800],hidden:true};assert.deepEqual(Array.from(vm.runInContext('box(frame,rect(doc))',c)),[40,50,200,50]);
});
test('native serializer preserves multilingual text and cannot inject executable code',()=>{
 const c=context();c.data={text:'中文、日本語 "quoted"\n\\Path\t'+'\u0000',values:[1,true,null]};const encoded=vm.runInContext('encode(data)',c);assert.deepEqual(JSON.parse(encoded),c.data);
 new vm.Script(script('write("out",{ok:true});','out').replace(/^#target illustrator\n/,''));
});

test('native source size accepts ExtendScript JSON rounding but refuses actual changes',()=>{
 const c=context();c.actual=17.18701934814453;c.serialized=17.1870193481445;
 assert.equal(vm.runInContext('actual===serialized',c),false);
 assert.equal(vm.runInContext('sameNativeSize(actual,serialized)',c),true);
 for(const changed of [17.18702,17.2,NaN,Infinity,'17.1870193481445']){c.changed=changed;assert.equal(vm.runInContext('sameNativeSize(actual,changed)',c),false);}
});
test('font selection resolves actual family weight and refuses unavailable synthetic weight',()=>{
 const c=context();c.app={textFonts:[{name:'A-Regular',family:'A',style:'Regular'},{name:'A-Bold',family:'A',style:'Bold'}]};c.app.textFonts.getByName=n=>{const f=c.app.textFonts.find(f=>f.name===n);if(!f)throw Error('missing');return f;};
 assert.equal(vm.runInContext('fontFor("A-Regular","bold").name',c),'A-Bold');assert.throws(()=>vm.runInContext('fontFor("A-Regular","black")',c),/字重/);assert.throws(()=>vm.runInContext('fontFor("missing","original")',c),/缺少字体/);
});
test('mixed native export dispatch preserves original ordering and other engine successes',async()=>{
 const p={files:[{path:'a.psd',name:'a'},{path:'b.ai',name:'b'},{path:'c.psb',name:'c'}]};let seen;
 const result=await runNativePlan(p,{illustrator:async p=>{seen=p.files;return [{file:'b',output:'b.ai'}];},photoshop:async()=>{throw Error('PS unavailable');}});
 assert.equal(seen.length,1);assert.equal(result.saved,1);assert.equal(result.failed,2);assert.deepEqual(result.results.map(r=>r.file),['a','b','c']);assert.equal(result.results[1].output,'b.ai');
});
test('Illustrator-only operation never invokes Photoshop backend',async()=>{
 const p=plan();const result=await runNativePlan(p,{illustrator:async p=>p.files.map(f=>({file:f.name,output:'out.ai'})),photoshop:()=>{throw Error('must not call');}});assert.equal(result.saved,1);assert.equal(result.failed,0);
});

test('uncertain Illustrator result prevents starting the other native engine',async()=>{
 const result=await runNativePlan({files:[{path:'a.ai',name:'a'},{path:'b.psd',name:'b'}]},{illustrator:async()=>[{file:'a',uncertain:true,pendingOutput:'copy.ai',error:'RPC response lost'}],photoshop:()=>assert.fail('Do not continue uncertain native work')});assert.equal(result.uncertain,true);assert.equal(result.saved,0);assert.equal(result.failed,2);assert.equal(result.results[1].status,'未执行');
});
test('native text application carries preview typography, line breaks and position',()=>{
 const font={name:'ArialMT',family:'Arial',style:'Regular'};
 const c=context({app:{redraw(){},textFonts:{getByName(){return font;}}},TextType:{AREATEXT:'area'},Justification:{LEFT:'left',CENTER:'center',RIGHT:'right'}});
 const p=plan().files[0].jobs[0];p.previewLayout={...p.previewLayout,text:'日本語\nタイトル',stretchX:110,stretchY:90,tracking:12};p.alignment='center';c.job=p;c.r=[-40,900,560,0];c.frame={contents:'中文',kind:'point',geometricBounds:[10,850,210,820],duplicate(){return {createOutline(){return {geometricBounds:[10,850,210,820],remove(){}};}};},textRange:{characterAttributes:{horizontalScale:120,verticalScale:100},paragraphAttributes:{}},translate(x,y){this.delta=[x,y];}};
 vm.runInContext('apply(frame,job,r)',c);
 assert.equal(c.frame.contents,'日本語\rタイトル');assert.equal(c.frame.textRange.characterAttributes.horizontalScale,132);assert.equal(c.frame.textRange.characterAttributes.verticalScale,90);assert.equal(c.frame.textRange.characterAttributes.leading,34);assert.equal(c.frame.textRange.paragraphAttributes.justification,'center');assert.deepEqual(c.frame.delta,[-30,30]);
});
