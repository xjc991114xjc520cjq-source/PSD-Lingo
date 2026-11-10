const test=require('node:test'),assert=require('node:assert/strict');
const {rectangleRadii,eligibleContainers,recommendedContainer,replacementBounds,containerOverflow,expandsIntoNeighbour,activeContainerEdits,fitContainer}=require('../container-fit.cjs');
function fixture(){const text={id:1,box:[100,100,100,20],group:'features',stackIndex:2,alignment:'left'},shape={id:2,kind:'shape',shapeType:'rectangle',radii:[20,20,20,20],name:'Pill',box:[90,90,120,40],group:'features',stackIndex:3,issues:[]},file={width:1000,height:2000,containers:[shape]};return {text,shape,file};}
test('container recommendations require a unique eligible shape below text in the same group',()=>{const {file,text,shape}=fixture();assert.equal(recommendedContainer(file,text).recommended,shape);file.containers.push({...shape,id:3});assert.equal(recommendedContainer(file,text).recommended,null);assert.equal(recommendedContainer(file,text).ambiguous,true);file.containers[1].issues=['locked'];assert.equal(eligibleContainers(file,text).length,1);shape.stackIndex=1;assert.equal(recommendedContainer(file,text).recommended,null);});
test('large backgrounds and shapes not containing source text are not candidates',()=>{const {file,text,shape}=fixture();file.containers=[{...shape,box:[0,0,1000,2000]},{...shape,id:3,box:[110,100,40,40]}];assert.equal(eligibleContainers(file,text).length,0);});
test('native parent IDs disambiguate equally named Photoshop groups',()=>{const {file,text,shape}=fixture();text.parentId=10;shape.parentId=11;assert.equal(recommendedContainer(file,text).recommended,null);shape.parentId=10;assert.equal(recommendedContainer(file,text).recommended,shape);});
test('replacement ink bounds respect alignment and measured stretch without scaling twice',()=>{const {text}=fixture();text.position={x:200,y:300};text.manual={stretchX:200};text.alignment='center';assert.deepEqual(replacementBounds(text,{width:160,height:30}),[170,300,160,30]);text.alignment='right';assert.deepEqual(replacementBounds(text,{width:160,height:30}),[140,300,160,30]);});
test('container fitting expands native geometry and keeps source padding and metadata',()=>{const {file,text,shape}=fixture(),before=JSON.stringify(shape);const result=fitContainer(file,text,shape,{width:250,height:30});assert.equal(result.ok,true);assert.deepEqual(result.box,[90,90,270,50]);assert.deepEqual(result.padding,[10,10,10,10]);assert.equal(JSON.stringify(shape),before);assert.equal(containerOverflow(shape.box,[100,100,250,30]).major,true);});
test('fitting never shrinks existing container and rejects out-of-canvas expansion',()=>{const {file,text,shape}=fixture();assert.deepEqual(fitContainer(file,text,shape,{width:50,height:10}).box,shape.box);text.position={x:950,y:100};assert.equal(fitContainer(file,text,shape,{width:100,height:20}).ok,false);});
test('batch changed visual box still uses immutable original sourceBox for padding',()=>{const {file,text,shape}=fixture();text.sourceBox=text.box;text.box=[400,100,300,30];text.position={x:400,y:100};const result=fitContainer(file,text,shape,{width:300,height:30});assert.equal(result.ok,true);assert.deepEqual(result.padding,[10,10,10,10]);assert.deepEqual(result.box,[90,90,620,50]);});
test('automatic fitting blocks newly overlapping neighbours but permits existing backdrops',()=>{const {file,shape}=fixture(),box=[90,90,270,40];assert.equal(expandsIntoNeighbour(file,shape,box,{id:4,box:[0,0,1000,2000]}),false);assert.equal(expandsIntoNeighbour(file,shape,box,{id:4,box:[80,80,300,200]}),false);assert.equal(expandsIntoNeighbour(file,shape,box,{id:4,box:[250,90,100,40]}),true);});
test('shared container edit moves to an active associated text when the original owner is skipped',()=>{
 const edit={layerId:20,textLayerId:1,sourceBox:[0,0,100,30],box:[0,0,200,30]},file={containerEdits:[edit],layers:[{id:1,recordId:'a',containerId:20,skipExport:true},{id:2,recordId:'b',containerId:20}]};
 const active=activeContainerEdits(file);assert.equal(active.length,1);assert.equal(active[0].textLayerId,2);assert.equal(edit.textLayerId,1);active[0].box[2]=999;assert.equal(edit.box[2],200);
 file.layers[1].issues=['locked'];assert.equal(activeContainerEdits(file).length,0);
});
test('legacy template container edits retain active owner only while association is undefined',()=>{
 const file={containerEdits:[{layerId:20,textLayerId:1,sourceBox:[0,0,100,30],box:[0,0,200,30]}],layers:[{id:1,recordId:'a'}]};assert.equal(activeContainerEdits(file).length,1);file.layers[0].containerId=null;assert.equal(activeContainerEdits(file).length,0);file.layers.push({id:2,recordId:'b',containerId:20});assert.equal(activeContainerEdits(file)[0].textLayerId,2);file.layers[1].recordId=null;assert.equal(activeContainerEdits(file).length,0);
});

function editorFixture(){
 const vm=require('node:vm'),path=require('node:path');let panel;
 function node(tag){const n={tag,children:[],style:{},dataset:{},hidden:false,append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(){},setPointerCapture(){},hasPointerCapture(){return false;}};let value='';
  Object.defineProperty(n,'value',{get(){return tag==='select'&&!n.children.some(o=>o.value===value)?'':value;},set(v){value=String(v);}});Object.defineProperty(n,'options',{get(){return n.children;}});
  if(tag==='section')Object.defineProperty(n,'innerHTML',{set(){const header=node('div'),mode=node('select'),recommend=node('option'),auto=node('option'),check=node('button'),row=node('div'),select=node('select'),grid=node('div'),actions=node('div'),adapt=node('button'),reset=node('button'),message=node('p');recommend.value='recommend';auto.value='auto';mode.append(recommend,auto);mode.value='recommend';header.append(mode,check);row.append(select);actions.append(adapt,reset);n.append(header,row,grid,actions,message);n.querySelectorAll=selector=>selector==='select'?[mode,select]:[check,adapt,reset];n.querySelector=()=>message;}});
  return n;
 }
 const stage=node('div');stage.dataset.scale='.5';const note={before(value){panel=value;}};
 const code=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../renderer/container-editor.js')],bundle:true,format:'cjs',platform:'node',write:false}).outputFiles[0].text;
 const sandbox={module:{exports:{}},exports:{},document:{createElement:node},window:{addEventListener(){}}};sandbox.exports=sandbox.module.exports;vm.runInNewContext(code,sandbox);
 const f=fixture();f.text.recordId='r1';f.text.issues=[];f.file.layers=[f.text];const state={files:[f.file],checked:true},reasons=[];let changes=0,transactions=0;
 const editor=sandbox.module.exports.createContainerEditor({$:id=>id==='refreshBackground'?note:stage,state,file:()=>f.file,layer:()=>f.text,record:()=>({target:'replacement'}),fitText:()=>({width:250,height:30}),changed:()=>changes++,transaction:(fn,reason)=>{transactions++;reasons.push(reason);fn();},toast(){},floating(content,{onVisibilityChange}){panel=content;let open=false;return {isOpen:()=>open,show(){open=true;onVisibilityChange(true);},hide(){open=false;onVisibilityChange(false);}};}});
 return {...f,state,editor,panel,stage,reasons,changes:()=>changes,transactions:()=>transactions};
}
test('container editor check is nonmutating in recommendation mode and sync never loops changed',()=>{const f=editorFixture();const result=f.editor.check({auto:false});assert.equal(result.major,1);assert.equal(f.changes(),0);assert.equal(f.file.containerEdits,undefined);f.editor.sync();f.editor.draw();assert.equal(f.changes(),0);assert.equal(f.stage.children[0].hidden,false);assert.match(f.stage.children[0].style.cssText,/pointer-events:none/);});
test('container editor auto check edits once despite full-page backdrop and supports opting out',()=>{const f=editorFixture();f.file.containers.push({...f.shape,id:3,box:[0,0,1000,2000]});const result=f.editor.check({auto:true});assert.equal(result.adjusted,1);assert.equal(f.transactions(),1);assert.equal(f.changes(),1);assert.equal(f.text.containerId,f.shape.id);assert.equal(JSON.stringify(f.editor.edits()[0].box),'[90,90,270,50]');assert.equal(f.state.checked,false);
 assert.deepEqual(f.reasons,['auto-container']);const candidate=f.panel.querySelectorAll('select')[1];candidate.value='';candidate.onchange();assert.equal(f.text.containerId,null);assert.equal(f.editor.edits().length,0);assert.deepEqual(f.reasons,['auto-container','manual']);
});
test('container editor auto mode leaves ambiguous or newly colliding shapes unchanged',()=>{const f=editorFixture();f.file.containers.push({...f.shape,id:3});assert.equal(f.editor.check({auto:true}).ambiguous,1);assert.equal(f.changes(),0);f.file.containers[1].box=[250,90,100,40];assert.equal(f.editor.check({auto:true}).blocked,1);assert.equal(f.changes(),0);assert.equal(f.file.containerEdits,undefined);});
test('container outline stays hidden until tool window opens and closing never clears edits',()=>{const f=editorFixture();f.editor.sync();assert.equal(f.stage.children[0].hidden,true);f.editor.check({auto:true});assert.equal(f.stage.children[0].hidden,false);const edits=JSON.stringify(f.editor.edits());f.editor.hide();assert.equal(f.stage.children[0].hidden,true);assert.equal(JSON.stringify(f.editor.edits()),edits);f.editor.show();assert.equal(f.stage.children[0].hidden,false);});
test('rectangle corner-only edits persist, linked edits share four values and reset restores source',()=>{
 const f=editorFixture();f.editor.sync();const row=f.panel.children.at(-1),corners=row.children.slice(1).map(label=>label.children[0]);
 corners[0].value='8';corners[0].onchange();assert.deepEqual(Array.from(f.file.containerEdits[0].radii),[8,8,8,8]);assert.deepEqual(Array.from(f.file.containerEdits[0].sourceRadii),[20,20,20,20]);assert.deepEqual(Array.from(f.file.containerEdits[0].box),f.shape.box);
 row.children[0].children[0].checked=false;corners[2].value='3';corners[2].onchange();assert.deepEqual(Array.from(f.file.containerEdits[0].radii),[8,8,3,8]);
 f.panel.querySelectorAll('button')[2].onclick();assert.equal(f.file.containerEdits.length,0);assert.equal(f.transactions(),3);
});
test('rectangle dimension edits and automatic fitting preserve manual corner pixels',()=>{
 const f=editorFixture();f.editor.sync();const row=f.panel.children.at(-1),corners=row.children.slice(1).map(label=>label.children[0]);corners[0].value='8';corners[0].onchange();
 const width=f.panel.children[2].children[2].children[0];width.value='240';width.onchange();assert.equal(f.file.containerEdits[0].box[2],240);assert.deepEqual(Array.from(f.file.containerEdits[0].radii),[8,8,8,8]);
 f.editor.check({auto:true});assert.equal(f.file.containerEdits[0].box[2],270);assert.deepEqual(Array.from(f.file.containerEdits[0].radii),[8,8,8,8]);
});
test('ordinary vector paths are never automatically stretched or offered corner controls',()=>{
 const f=editorFixture();delete f.shape.shapeType;delete f.shape.radii;f.editor.sync();const row=f.panel.children.at(-1);assert.equal(row.children[1].children[0].disabled,true);assert.equal(f.panel.children[2].children[2].children[0].disabled,true);
 assert.equal(fitContainer(f.file,f.text,f.shape,{width:250,height:30}).ok,false);assert.equal(f.editor.check({auto:true}).adjusted,0);assert.equal(f.file.containerEdits,undefined);
});
test('active edit snapshots independently clone source and edited corner arrays',()=>{
 const f=fixture();f.file.layers=[{...f.text,recordId:'r1',containerId:f.shape.id}];f.file.containerEdits=[{layerId:f.shape.id,textLayerId:f.text.id,sourceBox:f.shape.box,box:f.shape.box,sourceRadii:[20,20,20,20],radii:[1,2,3,4]}];const result=activeContainerEdits(f.file);result[0].radii[0]=99;result[0].sourceRadii[0]=99;assert.equal(f.file.containerEdits[0].radii[0],1);assert.equal(f.file.containerEdits[0].sourceRadii[0],20);
});
test('corner geometry preserves independent corner pixels until adjacent edges overlap',()=>{assert.deepEqual(rectangleRadii([30,0,0,0],[0,0,100,40]),[30,0,0,0]);assert.deepEqual(rectangleRadii([30,30,30,30],[0,0,100,40]),[20,20,20,20]);assert.equal(rectangleRadii([-1,0,0,0],[0,0,100,40]),null);});
test('native glyph bounds may overhang the rectangle by two pixels without losing its unique source relationship',()=>{
 const {file,text,shape}=fixture();text.box=[70,122,178,36];text.size=24;shape.box=[72,110,218,52];assert.equal(recommendedContainer(file,text).recommended,shape);assert.equal(fitContainer(file,text,shape,{width:220,height:30}).ok,true);text.box[0]=50;assert.equal(recommendedContainer(file,text).recommended,null);
});
test('manual shape list includes editable unmatched shapes while recommendations remain conservative',()=>{
 const f=editorFixture();f.file.containers.push({...f.shape,id:99,name:'Other rectangle',box:[400,400,100,50]});f.editor.sync();const candidate=f.panel.querySelectorAll('select')[1];assert.ok(candidate.options.some(option=>option.value==='99'));assert.equal(recommendedContainer(f.file,f.text).recommended.id,f.shape.id);
});
