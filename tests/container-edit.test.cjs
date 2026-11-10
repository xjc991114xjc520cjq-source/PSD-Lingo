const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {extractContainers,extractLayers}=require('../metadata.cjs');
const {validateContainerEdits,containerScript}=require('../container-edit.cjs');
const {backgroundScript}=require('../photoshop-preview.cjs');
function shape(id=10){return {id,name:'label',left:10,top:20,right:110,bottom:60,vectorFill:{type:'color',color:{r:1,g:2,b:3}},vectorMask:{},vectorOrigination:{keyDescriptorList:[{keyOriginType:1,keyOriginShapeBoundingBox:{left:10,top:20,right:110,bottom:60},keyOriginRRectRadii:{topLeft:10,topRight:10,bottomRight:10,bottomLeft:10}}]}};}
const edit=()=>({layerId:10,textLayerId:20,sourceBox:[10,20,100,40],box:[15,25,200,50]});
function liveDescriptor(radii=[10,10,10,10]){const origin={hasKey:k=>['keyOriginType','keyOriginRRectRadii'].includes(k),getInteger:()=>1,getObjectValue:()=>({hasKey:()=>true,getUnitDoubleValue:k=>radii[['topLeft','topRight','bottomRight','bottomLeft'].indexOf(k)]})};return {hasKey:k=>['hasVectorMask','keyDescriptorList'].includes(k),getBoolean:()=>true,getList:()=>({count:1,getObjectValue:()=>origin})};}
test('shape extraction normalizes native and PSD stacking, preserves parent, blocks unsafe candidates',()=>{
 const s=shape(),t={id:20,text:{text:'title',shapeType:'point',style:{font:{name:'ArialMT'},fontSize:10}},left:10,top:20,right:50,bottom:40};
 const p={children:[{id:30,name:'group',children:[s,t]}]},n={topFirst:true,children:[{id:30,name:'group',children:[t,s]}]};
 assert.deepEqual(extractContainers(p),extractContainers(n));assert.equal(extractContainers(p)[0].parentId,30);
 assert.ok(extractLayers(p)[0].stackIndex<extractContainers(p)[0].stackIndex);
 for(const extra of [{hidden:true},{protected:{all:true}},{clipping:true},{mask:{}},{vectorFill:{type:'gradient'}},{vectorStroke:{strokeEnabled:true}}])assert.ok(extractContainers({children:[{...s,...extra}]})[0].issues.length);
 assert.ok(extractContainers({topFirst:true,children:[{id:11,clipping:true},s]})[0].issues.length);
 assert.equal(extractContainers({children:[{id:1,left:0,top:0,right:30,bottom:30}]}).length,0);
});
test('container edits require verified source shape, bound text and finite on-canvas target',()=>{
 const options={width:1000,height:1000,textIds:[20],containers:extractContainers({children:[shape()]})};
 validateContainerEdits([edit()],options);validateContainerEdits(undefined);
 for(const mutation of [e=>e.box[2]=0,e=>e.box[0]=-1,e=>e.box[2]=Infinity,e=>e.textLayerId=5,e=>e.layerId=20,e=>e.sourceBox[0]=11]){const e=edit();mutation(e);assert.throws(()=>validateContainerEdits([e],options));}
 assert.throws(()=>validateContainerEdits([edit(),edit()],options));
 assert.throws(()=>validateContainerEdits([edit()],{...options,containers:[{...options.containers[0],issues:['locked']}]}));
});
test('native duplicate live rectangle uses geometry edits without scaling corner radii',()=>{
 let b=[10,20,100,40],resized=0,translated=0;
 const doc={typename:'Document',layers:[]},layer={id:10,typename:'ArtLayer',kind:1,visible:true,allLocked:false,positionLocked:false,grouped:false,parent:doc,
 get bounds(){return [b[0],b[1],b[0]+b[2],b[1]+b[3]].map(n=>({as:()=>n}));},
 resize(x,y){resized++;b[2]*=x/100;b[3]*=y/100;},translate(x,y){translated++;b[0]+=x.value;b[1]+=y.value;}};doc.layers=[layer];
 class Descriptor{constructor(){this.data={};}putReference(k,v){this.data[k]=v;}putInteger(k,v){this.data[k]=v;}putUnitDouble(k,u,v){this.data[k]=v;}putObject(k,t,v){this.data[k]=v.data;}}
 let action;
 const context={LayerKind:{SOLIDFILL:1},DialogModes:{NO:0},ActionDescriptor:Descriptor,UnitValue:function(value){this.value=value;},ActionReference:function(){this.putIdentifier=()=>{};this.putEnumerated=()=>{};},stringIDToTypeID:x=>x,executeActionGet:()=>liveDescriptor(),executeAction:(event,d)=>{assert.equal(event,'changePathDetails');action=d.data;const box=action.keyOriginShapeBBox;b=[box.left,box.top,box.right-box.left,box.bottom-box.top];},doc,edits:[{...edit(),sourceRadii:[10,10,10,10],radii:[10,12,14,16]}]};
 vm.runInNewContext(containerScript+'applyContainers(doc,edits);',context);assert.deepEqual(b,edit().box);assert.equal(resized,0);assert.equal(translated,0);assert.deepEqual(action.keyOriginRRectRadii,{topLeft:10,topRight:12,bottomRight:14,bottomLeft:16});
 b=[11.5,20,100,40];assert.throws(()=>vm.runInNewContext('applyContainers(doc,edits)',context));
 b=edit().sourceBox;layer.allLocked=true;assert.throws(()=>vm.runInNewContext('applyContainers(doc,edits)',context));assert.equal(resized,0);
 layer.allLocked=false;context.executeActionGet=()=>liveDescriptor([1,1,1,1]);assert.throws(()=>vm.runInNewContext('applyContainers(doc,edits)',context),/原始圆角/);
 context.executeActionGet=()=>({hasKey:k=>k==='hasVectorMask',getBoolean:()=>true});assert.throws(()=>vm.runInNewContext('applyContainers(doc,edits)',context),/实时矩形/);
});
test('preview transforms only after creating duplicate and never rasterizes shapes',()=>{
 const s=backgroundScript('C:/a.psd',[20],'C:/b.png',{containerEdits:[edit()]});
 assert.ok(s.indexOf('copy=source.duplicate')<s.indexOf('applyContainers(copy,'));
 assert.ok(s.includes(JSON.stringify([edit()])));assert.ok(!/\.rasterize\(|\.flatten\(/.test(s));
});
test('standalone JSX rejects ancestor masks effects and clipping added after metadata import',()=>{
 const doc={typename:'Document',layers:[]},group={id:30,typename:'LayerSet',visible:true,parent:doc,layers:[]},layer={id:10,typename:'ArtLayer',kind:1,visible:true,parent:group,grouped:false,
 bounds:[10,20,110,60].map(n=>({as:()=>n})),resize(){throw new Error('must not transform');}};
 doc.layers=[group];group.layers=[layer];let unsafe='';
 const context={LayerKind:{SOLIDFILL:1},ActionReference:function(){this.putIdentifier=(_,id)=>{this.id=id;};},stringIDToTypeID:x=>x,
 executeActionGet:r=>({hasKey:k=>r.id===30?k===unsafe:k==='hasVectorMask',getBoolean:()=>true}),doc,edit:edit()};
 vm.runInNewContext(containerScript,context);
 for(const key of ['group','hasUserMask','hasVectorMask','hasFilterMask','layerEffects']){unsafe=key;assert.throws(()=>vm.runInNewContext('checkContainer(doc,edit);',context),/所属分组/);}
 unsafe='';assert.doesNotThrow(()=>vm.runInNewContext('checkContainer(doc,edit);',context));
 const cleanDescriptor=context.executeActionGet;
 context.executeActionGet=r=>r.id!==10?cleanDescriptor(r):({hasKey:k=>['hasVectorMask','strokeStyle'].includes(k),getBoolean:()=>true,getObjectValue:()=>({hasKey:()=>true,getBoolean:()=>true})});
 assert.throws(()=>vm.runInNewContext('checkContainer(doc,edit);',context),/复杂描边/);context.executeActionGet=cleanDescriptor;
 doc.layers.unshift({id:31,grouped:true});assert.throws(()=>vm.runInNewContext('checkContainer(doc,edit);',context),/所属分组包含剪贴/);
});
