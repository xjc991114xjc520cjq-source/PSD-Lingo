const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeNativeMetadata,metadataScript}=require('../photoshop-metadata.cjs');
test('generated JSX syntax is valid without executing Photoshop',()=>{const vm=require('node:vm');assert.doesNotThrow(()=>new vm.Script(metadataScript('C:/sample.psb','C:/result.json').replace(/^#target photoshop/,'')));});
function fixture(){return {width:1200,height:36000,resolution:144,bitsPerChannel:8,colorMode:3,children:[{id:42,name:'Editable',isText:true,bounds:[12,20,612,80],dom:{font:'ArialMT',text:'Sample'},descriptor:{textKey:{textKey:'Sample',orientation:'horizontal',transform:{xx:1.5,xy:0,yx:0,yy:2,tx:0,ty:0},warp:{warpStyle:'warpNone'},textShape:[{char:'paint'}],textStyleRange:[{from:0,to:7,textStyle:{fontPostScriptName:'ArialMT',size:{value:12,unit:'pointsUnit'},tracking:10,autoLeading:false,leading:{value:15,unit:'pointsUnit'},color:{red:30,green:60,blue:90}}}],paragraphStyleRange:[{from:0,to:7,paragraphStyle:{align:'center'}}]}}}]};}
test('large native metadata retains editable ID, transformed pixel size, bounds and paragraph style',()=>{const m=normalizeNativeMetadata(fixture()),l=m.layers[0];assert.equal(m.height,36000);assert.equal(l.id,42);assert.equal(l.original,'Sample');assert.equal(l.font,'ArialMT');assert.equal(l.size,48);assert.equal(l.leading,60);assert.equal(l.scaleX,1.5);assert.equal(l.scaleY,2);assert.equal(l.aspectScale,.75);assert.deepEqual(l.box,[12,20,600,60]);assert.equal(l.alignment,'center');assert.equal(l.supported,true);});
test('Action Manager grain key preserves RGB green, including explicit zero',()=>{const f=fixture(),color=f.children[0].descriptor.textKey.textStyleRange[0].textStyle.color;color.grain=color.green;delete color.green;assert.equal(normalizeNativeMetadata(f).layers[0].color,'rgb(30,60,90)');color.green=0;assert.equal(normalizeNativeMetadata(f).layers[0].color,'rgb(30,0,90)');});
test('hidden and locked groups propagate to descendants',()=>{const f=fixture();f.children=[{id:1,name:'Group',hidden:true,locked:true,children:f.children}];const l=normalizeNativeMetadata(f).layers[0];assert.equal(l.group,'Group');assert.equal(l.supported,false);assert.ok(l.issues.includes('隐藏文字层'));assert.ok(l.issues.includes('文字层或分组已锁定'));});
test('rotation, mirroring, paragraph, vertical, warp, path and clipping restrictions remain conservative',()=>{const cases=[['rotation',t=>t.transform.xy=.3,'旋转'],['mirror',t=>t.transform.xx=-1,'旋转'],['paragraph',t=>t.textShape[0].char='box','段落'],['vertical',t=>t.orientation='vertical','竖排'],['warp',t=>t.warp.warpStyle='warpArc','变形'],['path',t=>t.textShape[0].path={points:[1]},'路径']];for(const [name,change,issue] of cases){const f=fixture();change(f.children[0].descriptor.textKey);const l=normalizeNativeMetadata(f).layers[0];assert.equal(l.supported,false,name);assert.ok(l.issues.some(s=>s.includes(issue)),name);}for(const flag of ['group','hasUserMask','hasVectorMask','hasFilterMask']){const f=fixture();f.children[0].descriptor[flag]=true;assert.ok(normalizeNativeMetadata(f).layers[0].issues.some(s=>s.includes('蒙版')),flag);}});
test('mixed style ranges include subtle differences; synthetic final character ignored',()=>{const f=fixture(),t=f.children[0].descriptor.textKey;t.textStyleRange.push({from:3,to:6,textStyle:{...t.textStyleRange[0].textStyle,fauxBold:true}});assert.ok(normalizeNativeMetadata(f).layers[0].issues.includes('混合文字样式暂不支持'));t.textStyleRange[1].from=6;t.textStyleRange[1].to=7;assert.equal(normalizeNativeMetadata(f).layers[0].supported,true);});
test('missing transform, warp, style metadata, substituted fonts and invalid bounds cannot silently pass',()=>{for(const key of ['transform','warp','textStyleRange']){const f=fixture();delete f.children[0].descriptor.textKey[key];assert.equal(normalizeNativeMetadata(f).layers[0].supported,false,key);}const f=fixture();f.children[0].dom.font='OtherFont';assert.ok(normalizeNativeMetadata(f).layers[0].issues.some(s=>s.includes('替换')));f.children[0].bounds=[NaN,0,1,2];assert.equal(normalizeNativeMetadata(f).layers[0].supported,false);});
test('JSX has no document mutation, closes only documents it opens and restores active document',()=>{const s=metadataScript('C:/sample.psb','C:/result.json');assert.ok(s.includes('if(source&&!source.saved)'));assert.ok(s.includes('if(opened&&source)'));assert.ok(s.includes('app.activeDocument=previous'));assert.ok(!s.includes('bringToFront'));assert.ok(!s.includes('executeAction('));assert.ok(!s.includes('.saveAs('));assert.ok(s.includes('executeActionGet(r)'));});
test('generated JSX executes against mocked Photoshop, writes valid Unicode JSON and restores existing document',()=>{
 const vm=require('node:vm'),unit=n=>({as:()=>n});let output='',closed=false;
 const old={name:'user-work'},text='译文 "quoted" \\ path\r\nSecond line';
 const doc={saved:true,bitsPerChannel:8,mode:3,width:unit(800),height:unit(36000),resolution:72,layers:[{id:42,name:'Title 译文',visible:true,allLocked:false,pixelsLocked:true,typename:'ArtLayer',kind:'text',bounds:[unit(1),unit(2),unit(200),unit(40)],textItem:{contents:text,font:'ArialMT'}}],close(mode){assert.equal(mode,'discard');closed=true;}};
 const app={activeDocument:old,documents:[],displayDialogs:'prior',open:()=>doc};
 function File(p){this.exists=true;this.fsName=p;this.open=()=>true;this.write=s=>{output+=s;};this.close=()=>{};}
 function ActionReference(){this.putIdentifier=()=>{};}
 vm.runInNewContext(metadataScript('C:/sample.psb','C:/result.json').replace(/^#target photoshop/,''),{app,File,ActionReference,stringIDToTypeID:s=>s,executeActionGet:()=>({count:0,hasKey:k=>k==='layerLocking',getObjectValue:()=>({hasKey:()=>true,getBoolean:()=>false})}),LayerKind:{TEXT:'text'},BitsPerChannelType:{EIGHT:8,SIXTEEN:16},DocumentMode:{RGB:3},DialogModes:{NO:'none'},SaveOptions:{DONOTSAVECHANGES:'discard'}});
 const data=JSON.parse(output);assert.equal(data.children[0].locked,false,'Action Manager lock flags override non-pixel DOM pixelsLocked');assert.equal(data.children[0].dom.text,text);assert.equal(data.children[0].name,'Title 译文');assert.equal(data.width,800);assert.ok(closed);assert.equal(app.activeDocument,old);assert.equal(app.displayDialogs,'prior');
});

test('native text-shape transform is an authoritative fallback for ordinary Photoshop point text',()=>{const f=fixture(),t=f.children[0].descriptor.textKey;t.textShape[0].transform=t.transform;delete t.transform;const l=normalizeNativeMetadata(f).layers[0];assert.equal(l.supported,true);assert.equal(l.size,48);delete t.textShape[0].transform;assert.ok(normalizeNativeMetadata(f).layers[0].issues.some(i=>i.includes('缺少文字变换')));});

function runMetadata({badField,descriptorFailure=false,boundsFailure=false,nested=false,openFailure=false}={}){
 const vm=require('node:vm'),unit=n=>({as:()=>n});let output='',closed=0;
 const old={name:'user-work'},good={id:43,name:'Good',visible:true,typename:'ArtLayer',kind:'text',bounds:[1,2,200,40].map(unit),textItem:{contents:'Sample',font:'ArialMT'}};
 const bad={...good,id:42,name:'Bad',textItem:{...good.textItem}};
 const error=()=>{throw Object.assign(Error('图层不包含文本。'),{number:54});};
 if(badField==='textItem')Object.defineProperty(bad,'textItem',{get:error});
 else if(badField)Object.defineProperty(bad.textItem,badField,{get:error});
 if(boundsFailure)Object.defineProperty(bad,'bounds',{get:error});
 const desc=o=>{const keys=Object.keys(o);return {count:keys.length,getKey:i=>keys[i],hasKey:k=>k in o,getType:k=>typeof o[k]==='string'?'str':typeof o[k]==='number'?'num':typeof o[k]==='boolean'?'bool':Array.isArray(o[k])?'list':'obj',getString:k=>o[k],getDouble:k=>o[k],getBoolean:k=>o[k],getObjectValue:k=>desc(o[k]),getList:k=>{const a=o[k];return {...desc(a),getKey:undefined};}};};
 const group={id:1,name:'Group',visible:true,typename:'LayerSet',layers:[bad,good]};
 const doc={saved:true,bitsPerChannel:8,mode:3,width:unit(1200),height:unit(36000),resolution:144,layers:nested?[group]:[bad,good],close(){closed++;}};
 const app={version:'test',activeDocument:old,documents:[],displayDialogs:'prior',open:openFailure?error:()=>doc};
 function File(p){this.exists=true;this.fsName=p;this.open=()=>true;this.write=s=>{output=s;return true;};this.close=()=>{};}
 function ActionReference(){this.putIdentifier=(_,id)=>{this.id=id;};}
 vm.runInNewContext(metadataScript('C:/sample.psb','C:/result.json').replace(/^#target photoshop/,''),{app,File,ActionReference,stringIDToTypeID:s=>s,typeIDToStringID:s=>s,executeActionGet:r=>{if(descriptorFailure&&r.id===42)error();return desc(r.id===1?{}:fixture().children[0].descriptor);},LayerKind:{TEXT:'text',SOLIDFILL:'shape'},DescValueType:{STRINGTYPE:'str',DOUBLETYPE:'num',BOOLEANTYPE:'bool',OBJECTTYPE:'obj',LISTTYPE:'list'},BitsPerChannelType:{EIGHT:8,SIXTEEN:16},DocumentMode:{RGB:3},DialogModes:{NO:'none'},SaveOptions:{DONOTSAVECHANGES:'discard'}});
 assert.equal(app.activeDocument,old);assert.equal(app.displayDialogs,'prior');assert.equal(closed,openFailure?0:1);
 return JSON.parse(output);
}
test('TEXT-kind DOM failures use authoritative descriptors and do not interrupt sibling or nested text',()=>{
 for(const badField of ['textItem','contents','font'])for(const nested of [false,true]){
  const raw=runMetadata({badField,nested}),m=normalizeNativeMetadata(raw);assert.equal(m.layers.length,2);
  for(const l of m.layers){assert.equal(l.original,'Sample');assert.equal(l.supported,true,JSON.stringify(l.issues));}
  assert.equal(m.layers[0].metadataReadWarnings[0].number,54);assert.equal(m.layers[1].metadataReadWarnings,undefined);
 }
});
test('unreadable native descriptions remain blocked and cannot discard readable siblings',()=>{
 const m=normalizeNativeMetadata(runMetadata({descriptorFailure:true,nested:true}));assert.equal(m.layers.length,2);assert.equal(m.layers[0].supported,false);assert.equal(m.layers[0].original,'Sample');assert.equal(m.layers[0].metadataReadFailure.stage,'原生文字描述');assert.equal(m.layers[1].supported,true);
 const raw=runMetadata({descriptorFailure:true,badField:'textItem'}),n=normalizeNativeMetadata(raw);assert.equal(n.layers.length,2);assert.equal(n.layers[0].original,'');assert.equal(n.layers[0].supported,false);assert.equal(n.layers[1].supported,true);
});
test('bounds failure only blocks the affected text; read-only open failure carries an exact receipt',()=>{
 const m=normalizeNativeMetadata(runMetadata({boundsFailure:true}));assert.equal(m.layers[0].supported,false);assert.ok(m.layers[0].issues.includes('无法读取文字可见边界'));assert.equal(m.layers[1].supported,true);
 const failed=runMetadata({openFailure:true});assert.equal(failed.readFailure.stage,'打开原稿');assert.equal(failed.readFailure.number,54);assert.equal(failed.children,undefined);
});
test('read-only failure receipts are definite failures, interrupted bridges stay uncertain and stale receipts are removed',async()=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ps-meta-'));
 try{const input=path.join(dir,'source.psb'),output=path.join(dir,'metadata.json');await fs.writeFile(input,'original');
  const read=require('../photoshop-metadata.cjs').readPhotoshopMetadata;
  await assert.rejects(read(dir,input,{prepare:async()=>{},execute:async()=>{await fs.writeFile(output,JSON.stringify(runMetadata({openFailure:true})));}}),e=>e.code==='PHOTOSHOP_METADATA_READ_FAILED'&&e.uncertain===false&&e.phase==='打开原稿'&&!e.message.includes('已有副本'));
  await assert.rejects(read(dir,input,{prepare:async()=>{},execute:async()=>{await assert.rejects(fs.access(output));throw Object.assign(Error('bridge lost'),{uncertain:true});}}),e=>e.uncertain===true);
  assert.equal(await fs.readFile(input,'utf8'),'original');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
