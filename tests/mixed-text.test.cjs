const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {makeMixedEdit,validateMixedEdits,mixedIssue}=require('../mixed-text.cjs'),{hash,validatePlan}=require('../core.cjs');
const layer={id:1,original:'1亿次',alignment:'center',issues:[mixedIssue],box:[20,20,200,80],font:'Bebas',size:80,boardNames:['Page'],boardBox:[0,0,600,600]},record={id:'life',target:'Lifespan: 100 Million Keystrokes',digest:hash('Lifespan: 100 Million Keystrokes')};
const args={recordId:'life',part:'parameter-value',spans:[{text:'100 Million',sourceStart:0},{text:' Keystrokes',sourceStart:1}],reason:'Translate approved value, preserve display and secondary styles'};
test('mixed parameter value retains approved source and requires explicit complete style mapping',()=>{
 const e=makeMixedEdit(layer,args,[record]);assert.equal(e.target,'100 Million Keystrokes');assert.equal(e.scale,1);assert.equal(e.anchor,'center');assert.equal(e.sourceDigest,record.digest);
 for(const patch of [{spans:[{text:'100',sourceStart:0}]},{spans:[{text:e.target,sourceStart:20}]},{recordId:'missing'},{part:'label'},{scale:0},{spans:[{text:e.target,sourceStart:.5}]}])assert.throws(()=>makeMixedEdit(layer,{...args,...patch},[record]));
 assert.throws(()=>makeMixedEdit({...layer,issues:[mixedIssue,'文字或上级锁定']},args,[record]));assert.throws(()=>validateMixedEdits([e],{records:[{...record,target:'Changed',digest:hash('Changed')}]}));
 assert.throws(()=>validateMixedEdits([e,e]));assert.throws(()=>validateMixedEdits([e],{format:'PSD'}));assert.deepEqual(validateMixedEdits([],{format:'PSD'}),[]);
});
test('mixed-only native plan exports without fake ordinary text jobs, rejects conflicting operations',()=>{
 const e=makeMixedEdit(layer,args,[record]),file={path:'source.ai',name:'source.ai',fingerprint:'unchanged',jobs:[],mixedTextEdits:[e]},plan={version:1,records:[record],files:[file]};assert.equal(validatePlan(plan),plan);
 assert.throws(()=>validatePlan({...plan,files:[{...file,textActions:[{layerId:1,mode:'clear',original:layer.original,font:'Bebas',size:80,box:layer.box,reason:'Hide value'}]}]}),/混合文字/);
 assert.throws(()=>validatePlan({...plan,files:[{...file,path:'source.psd'}]}),/仅支持AI/);
});
function nativeFixture(){
 const font={name:'Bebas',family:'Bebas'},secondary={name:'Secondary',family:'Secondary'},style=(font,size)=>({textFont:font,size,tracking:0,leading:size*1.2,autoLeading:false,horizontalScale:100,verticalScale:100,baselineShift:0,fillColor:'#fff',strokeColor:'#000'});
 const t={hidden:false,locked:false,kind:1,orientation:1,story:{textFrames:[]},matrix:{mValueA:1,mValueB:0,mValueC:0,mValueD:1},parent:{typename:'Document'},characters:[{contents:'1',characterAttributes:style(font,80)},{contents:'亿',characterAttributes:style(secondary,40)},{contents:'次',characterAttributes:style(secondary,40)}],translate(x,y){this.dx=x;this.dy=y;}};
 let contents=layer.original;Object.defineProperty(t,'contents',{get:()=>contents,set:v=>{contents=v;t.characters=[...v].map(contents=>({contents,characterAttributes:style(font,16)}));}});
 let holders=0;const d={textFrames:[t]};d.textFrames.add=()=>{holders++;return {set contents(v){this.characters=[{characterAttributes:{}}]},remove(){holders--}};};
 const c={TextType:{PATHTEXT:9},TextOrientation:{HORIZONTAL:1},app:{textFonts:{getByName:()=>font}},inkBounds:frame=>[0,80,frame.characters.reduce((n,x)=>n+x.characterAttributes.size,0),0]};
 vm.createContext(c);vm.runInContext(require('../illustrator.cjs').native,c);c.inkBounds=frame=>[0,80,frame.characters.reduce((n,x)=>n+x.characterAttributes.size,0),0];return {c,d,t,get holders(){return holders;}};
}
test('native mixed edit preserves original display and secondary fonts within the same text frame and cleans templates',()=>{
 const f=nativeFixture(),e=makeMixedEdit(layer,args,[record]);f.c.applyMixedText(f.d,[0,600,600,0],[e]);assert.equal(f.d.textFrames.length,1);assert.equal(f.d.textFrames[0],f.t);assert.equal(f.t.contents,e.target);assert.equal(f.holders,0);
 for(let i=0;i<e.target.length;i++){assert.equal(f.t.characters[i].characterAttributes.textFont.name,i<11?'Bebas':'Secondary');assert.equal(f.t.characters[i].characterAttributes.size,i<11?80:40);}
 assert.equal(f.t.dy,0);assert.ok(f.t.dx<0);const snap=f.c.mixedSnapshot(f.d,[e]);f.c.verifyMixedSnapshot(f.d,[e],snap);f.t.characters[0].characterAttributes.size=40;assert.throws(()=>f.c.verifyMixedSnapshot(f.d,[e],snap),/保存重开/);
});
test('native mixed edit rejects changed or locked source before any write and cleans templates on failure',()=>{
 for(const mutate of [f=>f.t.locked=true,f=>f.t.contents='Changed']){const f=nativeFixture();mutate(f);const before=f.t.contents;assert.throws(()=>f.c.applyMixedText(f.d,[0,600,600,0],[makeMixedEdit(layer,args,[record])]));assert.equal(f.t.contents,before);assert.equal(f.holders,0);}
 const f=nativeFixture();f.c.app.textFonts.getByName=()=>{throw Error('Missing font');};assert.throws(()=>f.c.applyMixedText(f.d,[],[makeMixedEdit(layer,args,[record])]),/Missing font/);assert.equal(f.holders,0);assert.equal(f.t.contents,layer.original);
});
test('mixed edit participates in artboard selection and audit copy context without enabling ordinary font replacement',()=>{
 const e=makeMixedEdit(layer,args,[record]),file={format:'AI',width:600,height:600,layers:[layer],mixedTextEdits:[e]};
 const {deliveryBoardsFor}=require('../design-document-audit.cjs');assert.deepEqual(deliveryBoardsFor(file,[record]),[{name:'Page',crop:[0,0,600,600]}]);
 const request=require('../design-layout-context.cjs').buildDesignLayoutRequest({file,layer,records:[record],auditOnly:true});assert.equal(request.layers[0].target,e.target);assert.equal(request.layers[0].immutable,true);assert.equal(request.layers[0].bound,false);assert.equal(request.layers[0].nativeMixedEdit.recordId,record.id);
});

test('native mixed style copying restores NoColor after strokeWeight side effects',()=>{
 const f=nativeFixture(),dst={};let stroke='NoColor';Object.defineProperty(dst,'strokeWeight',{set(){stroke='RGBColor'}});Object.defineProperty(dst,'strokeColor',{set(v){stroke=v},get(){return stroke}});
 const src={...f.t.characters[0].characterAttributes,strokeWeight:0,strokeColor:'NoColor'};f.c.mixedCopy(src,dst,1);assert.equal(dst.strokeColor,'NoColor');
});

test('reopen snapshot follows the same mixed object after another text frame is removed',()=>{
 const f=nativeFixture(),e=makeMixedEdit(layer,args,[record]);f.c.applyMixedText(f.d,[],[e]);const unrelated={characters:[],contents:'unrelated'};f.d.textFrames.unshift(unrelated);const snapshot=f.c.mixedSnapshot(f.d,[{...e,layerId:2}],[f.t]);assert.equal(snapshot[0].id,2);f.d.textFrames.shift();const after=f.c.mixedSnapshot(f.d,[{...e,layerId:2}],[f.t]);assert.equal(after[0].id,1);f.c.verifyMixedSnapshot(f.d,[{...e,layerId:2}],after);
});
