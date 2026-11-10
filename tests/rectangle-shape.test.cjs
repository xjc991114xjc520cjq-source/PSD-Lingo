const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeRadii,getRectangleGeometry}=require('../rectangle-shape.cjs');
const {extractContainers}=require('../metadata.cjs');
const {validateContainerEdits}=require('../container-edit.cjs');
const live=()=>({keyDescriptorList:[{keyOriginType:1,keyOriginShapeBoundingBox:{left:10,top:20,right:110,bottom:60},keyOriginRRectRadii:{topLeft:10,topRight:11,bottomRight:12,bottomLeft:13}}]});
test('live rectangle identity comes from origin metadata, not a similar generic path',()=>{
 assert.equal(getRectangleGeometry({vectorMask:{}}),null);
 const m=live();assert.deepEqual(getRectangleGeometry({vectorOrigination:m}),{shapeType:'rectangle',shapeBox:[10,20,100,40],radii:[10,11,12,13]});
 for(const mutation of [m=>m.keyDescriptorList.push({...m.keyDescriptorList[0]}),m=>m.keyDescriptorList[0].keyShapeInvalidated=true,m=>m.keyDescriptorList[0].keyOriginType=2,m=>m.keyDescriptorList[0].keyOriginRRectRadii.topLeft=-1,m=>m.keyDescriptorList[0].transform=[1,.5,0,1,0,0]]){const m=live();mutation(m);assert.equal(getRectangleGeometry({vectorOrigination:m}),null);}
 m.keyDescriptorList[0].transform=[1,0,0,1,0,0];assert.equal(getRectangleGeometry({vectorOrigination:m}).shapeType,'rectangle');
});
test('rectangle dimensional edits retain pixel radii, only clamp when adjacent corners overlap',()=>{
 assert.deepEqual(normalizeRadii([10,20,30,40],[0,0,1000,500]),[10,20,30,40]);
 assert.deepEqual(normalizeRadii([40,40,40,40],[0,0,200,40]),[20,20,20,20]);
 assert.deepEqual(normalizeRadii([30,10,5,5],[0,0,100,40]),[30,10,5,5]);
 for(const r of [[1,2,3],[-1,0,0,0],[NaN,0,0,0]])assert.throws(()=>normalizeRadii(r,[0,0,100,40]));
});
test('backend rejects arbitrary path resize and stale source radii while allowing legacy move',()=>{
 const shape={id:10,containerKind:'shape',left:10,top:20,right:110,bottom:60},options={width:1000,height:1000,textIds:[20],containers:extractContainers({children:[shape]})};
 const e={layerId:10,textLayerId:20,sourceBox:[10,20,100,40],box:[20,30,100,40]};
 assert.doesNotThrow(()=>validateContainerEdits([e],options));assert.throws(()=>validateContainerEdits([{...e,box:[20,30,200,40]}],options),/矩形/);
 options.containers=extractContainers({children:[{...shape,vectorOrigination:live()}]});
 const edit={...e,box:[20,30,200,40]};validateContainerEdits([edit],options);assert.deepEqual(edit.radii,[10,11,12,13]);
 assert.throws(()=>validateContainerEdits([{...e,sourceRadii:[0,0,0,0]}],options),/原始圆角/);
});
