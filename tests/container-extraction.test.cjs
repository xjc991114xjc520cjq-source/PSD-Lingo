const test=require('node:test'),assert=require('node:assert/strict');
const {validateExtractedContainers,extractedMetadata,extractionScript}=require('../container-extraction.cjs');
const {validateContainerEdits}=require('../container-edit.cjs');
const {backgroundScript}=require('../photoshop-preview.cjs');
const vm=require('node:vm');
const fingerprint='a'.repeat(64),item=()=>({id:-1,name:'背景容器',box:[20,20,200,80],radii:[12,12,12,12],fill:'#123456',background:'#ffffff',sourceFingerprint:fingerprint,anchorTextId:4});
const context={width:500,height:500,fingerprint,layers:[{id:4,supported:true,box:[30,30,100,30]}]};
test('extracted rectangle validates original provenance, anchor geometry and virtual shape metadata',()=>{
 const items=validateExtractedContainers([item()],context),containers=extractedMetadata(items);
 assert.equal(containers[0].shapeType,'rectangle');assert.equal(containers[0].extracted,true);
 assert.doesNotThrow(()=>validateContainerEdits([{layerId:-1,textLayerId:4,sourceBox:[20,20,200,80],box:[20,20,240,100]}],{width:500,height:500,textIds:[4],containers}));
 for(const change of [{id:1},{sourceFingerprint:'b'.repeat(64)},{box:[400,20,200,80]},{fill:'red'},{anchorTextId:5},{radii:[-1,0,0,0]}])assert.throws(()=>validateExtractedContainers([{...item(),...change}],context));
 assert.throws(()=>validateExtractedContainers([item()],{...context,layers:[{id:4,supported:true,box:[300,300,30,30]}]}));
 assert.throws(()=>validateExtractedContainers([item(),{...item(),id:-2}],context),/重叠/);
 assert.doesNotThrow(()=>validateExtractedContainers([{...item(),cleanupBox:[18,18,204,84]}],context));
 for(const cleanupBox of [[21,20,199,80],[0,0,253,130],[-1,18,224,84],[18,18,NaN,84]])assert.throws(()=>validateExtractedContainers([{...item(),cleanupBox}],context));
});
test('preview creates editable native rectangles only after duplication and never overwrites original',()=>{
 const script=backgroundScript('source.psd',[4],'background.png',{extractedContainers:[item()]});
 assert.ok(script.indexOf('copy=source.duplicate')<script.indexOf('var nativeEdits=materializeExtracted(copy,'));
 assert.match(extractionScript,/contentLayer/);assert.match(extractionScript,/Rctn/);assert.match(extractionScript,/editLiveRectangle/);
 assert.match(extractionScript,/clean.move\(anchor,ElementPlacement.PLACEAFTER\)/);
 assert.match(extractionScript,/copy.layerId=map/);assert.doesNotMatch(extractionScript,/rasterize|merge|source\.save/);
});
function nativeFixture(){
 const doc={typename:'Document',layers:[]},moves=[],created=[],descriptors=new Map();
 const layer=(id,box,parent=doc,extra={})=>({id,typename:'ArtLayer',kind:'text',name:String(id),visible:true,allLocked:false,grouped:false,opacity:100,fillOpacity:100,blendMode:'normal',parent,bounds:box.map(v=>({as:()=>v})),...extra});
 const top=layer(4,[30,30,130,50]),lower=layer(5,[30,60,130,80]);doc.layers=[top,lower];
 const context={LayerKind:{TEXT:'text'},BlendMode:{NORMAL:'normal',PASSTHROUGH:'pass'},ElementPlacement:{PLACEAFTER:'after',PLACEBEFORE:'before'},stringIDToTypeID:s=>s,ActionReference:function(){this.putIdentifier=(type,id)=>{this.id=id;};},executeActionGet:ref=>({hasKey:key=>Object.hasOwn(descriptors.get(ref.id)||{},key),getBoolean:key=>descriptors.get(ref.id)?.[key]}),findContainer:(c,id)=>{for(const l of c.layers){if(l.id===id)return l;if(l.layers){const r=context.findContainer(l,id);if(r)return r;}}return null;},checkContainer:()=>{}};
 vm.createContext(context);vm.runInContext(extractionScript,context);let next=100;
 context.extractionRectangle=(d,name,box)=>{created.push({name,box});return {id:next++,name,move:(target,place)=>moves.push({name,target:target.name,place})};};
 return {doc,top,lower,layer,moves,created,descriptors,context};
}
test('native materialization inserts below every intersecting text sibling and maps virtual edits',()=>{
 const f=nativeFixture(),entry={...item(),cleanupBox:[18,18,204,84]},mapped=f.context.materializeExtracted(f.doc,[entry],[{layerId:-1,textLayerId:4}]);
 assert.equal(f.moves[0].target,'5');assert.equal(f.moves[0].place,'after');assert.equal(f.moves[1].place,'before');assert.equal(mapped[0].layerId,101);
 assert.deepEqual(f.created[0].box,entry.cleanupBox);assert.deepEqual(f.created[1].box,entry.box);
 assert.equal(f.doc.layers.length,2);assert.equal(f.doc.layers[0],f.top);
});
test('native insertion rejects foreign-group text, clipping, masks and nonopaque groups',()=>{
 const foreign=nativeFixture(),group={id:20,name:'group',typename:'LayerSet',visible:true,allLocked:false,grouped:false,opacity:100,fillOpacity:100,blendMode:'pass',parent:foreign.doc,layers:[]};
 group.layers=[foreign.layer(6,[30,50,130,70],group)];foreign.doc.layers.push(group);
 assert.throws(()=>foreign.context.materializeExtracted(foreign.doc,[item()],[]),/不同分组/);assert.equal(foreign.moves.length,0);
 for(const extra of [{grouped:true},{opacity:90},{fillOpacity:50},{blendMode:'multiply'}]){const f=nativeFixture();Object.assign(f.lower,extra);assert.throws(()=>f.context.materializeExtracted(f.doc,[item()],[]));assert.equal(f.moves.length,0);}
 for(const flag of ['hasUserMask','hasVectorMask','hasFilterMask','layerEffects']){const f=nativeFixture();f.descriptors.set(5,{[flag]:true});assert.throws(()=>f.context.materializeExtracted(f.doc,[item()],[]));assert.equal(f.moves.length,0);}
 for(const extra of [{opacity:90},{grouped:true},{blendMode:'multiply'},{mask:true}]){const f=nativeFixture(),parent={id:30,name:'parent',typename:'LayerSet',visible:true,allLocked:false,grouped:false,opacity:100,fillOpacity:100,blendMode:'pass',parent:f.doc,layers:[f.top,f.lower],...extra};f.top.parent=parent;f.lower.parent=parent;f.doc.layers=[parent];if(extra.mask)f.descriptors.set(30,{hasFilterMask:true});assert.throws(()=>f.context.materializeExtracted(f.doc,[item()],[]));assert.equal(f.moves.length,0);}
});
