const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {validateArtworkHides,nativeArtwork}=require('../artwork-visibility.cjs');
const {validatePlan}=require('../core.cjs');
const object={objectId:'g:7',sourceIdentity:'native-identity',kind:'outline-candidate',box:[10,20,90,15],boardBox:[0,0,500,800],boardNames:['A']},edit={objectId:object.objectId,sourceIdentity:object.sourceIdentity,reason:'Local before/after confirms a complete duplicate message'};
test('visibility edits require source identity, bounded native candidates and no simultaneous text rewrite',()=>{
 assert.equal(validateArtworkHides([edit],{objects:[object]})[0],edit);
 for(const [edits,options]of [[[edit,edit],{}],[[{...edit,delete:true}],{}],[[{...edit,objectId:'raster:7'}],{}],[[edit],{format:'PSD'}],[[edit],{objects:[]}],[[edit],{objects:[{...object,sourceIdentity:'changed'}]}],[[edit],{objects:[{...object,kind:'raster'}]}],[[edit],{objects:[{...object,layerId:4}],jobs:[{layerId:4}]}]])assert.throws(()=>validateArtworkHides(edits,options));
});
test('hide-only native plans are allowed while unsupported file formats remain rejected',()=>{
 const plan={version:1,records:[],files:[{path:'source.ai',fingerprint:'verified',artworkHides:[edit],jobs:[]}]};assert.equal(validatePlan(plan),plan);assert.throws(()=>validatePlan({...plan,files:[{...plan.files[0],path:'source.psd'}]}));
});
function nativeFixture(scale=1){
 const doc={typename:'Document'},layer={typename:'Layer',visible:true,locked:false,parent:doc},points=[{anchor:[10,20],leftDirection:[10,20],rightDirection:[10,20]}];
 const path=()=>({typename:'PathItem',closed:true,filled:true,stroked:false,pathPoints:points});
 const group={typename:'GroupItem',uuid:'stable',parent:layer,geometricBounds:[10,100,100,85],pageItems:[path(),path()]};group.pageItems.forEach(p=>p.parent=group);
 const bad={...group,uuid:'raster',pageItems:[{typename:'RasterItem'}]},big={...group,uuid:'product',geometricBounds:[0,800,500,0]};
 const d={groupItems:[group,bad,big],textFrames:[]},scope={d,encode:JSON.stringify,boardBox:()=>[0,0,500*scale,800*scale],boardNames:()=>['A']};vm.createContext(scope);vm.runInContext(nativeArtwork,scope);return {scope,d,group};
}
test('native catalogue rejects mixed artwork and large product groups; stable identities survive visibility actions',()=>{
 for(const scale of [1,2]){const {scope,d,group}=nativeFixture(scale);const objects=scope.aiArtwork(d,[0,800,500,0]);assert.equal(objects.length,1);const o=objects[0];assert.equal(o.objectId,'g:0');scope.applyAiArtwork(d,[0,800,500,0],[{objectId:o.objectId,sourceIdentity:o.sourceIdentity}]);assert.equal(group.hidden,true);
  group.hidden=false;group.geometricBounds=[10,100,101,85];assert.throws(()=>scope.applyAiArtwork(d,[0,800,500,0],[o]),/身份变化/);
 }
});
test('native hides validate all objects before mutation and reject parent-child overlap',()=>{
 const {scope,d,group}=nativeFixture();const [o]=scope.aiArtwork(d,[0,800,500,0]);assert.throws(()=>scope.applyAiArtwork(d,[0,800,500,0],[o,{objectId:'g:2',sourceIdentity:'invented'}]),/身份变化/);assert.equal(group.hidden,undefined);
 const child={...group,uuid:'child',parent:group,pageItems:group.pageItems.map(p=>({...p}))};child.pageItems.forEach(p=>p.parent=child);d.groupItems.push(child);const objects=scope.aiArtwork(d,[0,800,500,0]);assert.throws(()=>scope.applyAiArtwork(d,[0,800,500,0],objects),/父子/);assert.equal(group.hidden,undefined);
});
