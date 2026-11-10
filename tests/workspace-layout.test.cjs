const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const code=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../renderer/workspace-layout.js')],bundle:true,format:'cjs',platform:'node',write:false}).outputFiles[0].text;
const sandbox={module:{exports:{}},exports:{}};sandbox.exports=sandbox.module.exports;vm.runInNewContext(code,sandbox);
const {clampWorkspaceLayout,clampPreviewSplit,readWorkspaceLayout,installWorkspaceLayout}=sandbox.module.exports;
class Node{
 constructor(width=1200){this.width=width;this.children=[];this.dataset={};this.attributes={};this.events={};this.hidden=false;this.style={setProperty(k,v){this[k]=v;}};const classes=new Set;this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)};}
 append(node){node.parent=this;this.children.push(node);}insertBefore(node,before){this.children=this.children.filter(n=>n!==node);this.children.splice(this.children.indexOf(before),0,node);node.parent=this;}remove(){this.parent.children=this.parent.children.filter(n=>n!==this);}
 setAttribute(k,v){this.attributes[k]=v;}getBoundingClientRect(){return {width:this.width};}addEventListener(k,fn){(this.events[k]??=[]).push(fn);}removeEventListener(k,fn){this.events[k]=(this.events[k]||[]).filter(x=>x!==fn);}
 fire(k,options={}){let prevented=false;for(const fn of this.events[k]||[])fn({button:0,pointerId:7,clientX:100,preventDefault(){prevented=true;},...options});return prevented;}
 setPointerCapture(id){this.capture=id;}releasePointerCapture(id){if(this.capture===id)this.capture=null;}
}
function fixture({stored=null,denied=false}={}){
 const main=new Node,comparison=new Node(600),replacement=new Node;comparison.append(new Node);comparison.append(replacement);
 const doc=new Node,win=new Node;doc.body=new Node;doc.createElement=()=>new Node;doc.querySelector=()=>main;doc.getElementById=id=>id==='comparison'?comparison:replacement;
 let saved=stored,changes=0,removed=0;const storage={getItem(){if(denied)throw Error('denied');return saved;},setItem(k,v){if(denied)throw Error('denied');saved=v;},removeItem(){if(denied)throw Error('denied');saved=null;removed++;}};
 win.localStorage=storage;win.small=false;win.matchMedia=()=>({matches:win.small});
 const api=installWorkspaceLayout({document:doc,window:win,onResize:()=>changes++});
 return {main,comparison,replacement,doc,win,api,get saved(){return saved;},get changes(){return changes;},get removed(){return removed;},split:type=>[...main.children,...comparison.children].find(n=>n.dataset.split===type)};
}
test('workspace geometry preserves a usable center and both preview panes at extreme requests',()=>{
 for(const width of [0,400,832,1200,2000])for(const left of [-1e5,230,1e5]){
  const result=clampWorkspaceLayout({left,right:1e5,original:99},width),room=Math.max(0,width-32),factor=Math.min(1,room/800);
  assert.ok(result.left>=180*factor);assert.ok(result.right>=260*factor);assert.ok(room-result.left-result.right>=360*factor-1e-8);
 }
 assert.equal(clampPreviewSplit(0,610),25);assert.equal(clampPreviewSplit(100,610),75);assert.equal(clampPreviewSplit(80,200),50);
});
test('malformed and inaccessible saved preferences safely retain defaults',()=>{
 for(const stored of ['{','null','[]','{"left":"bad","right":null,"original":"x"}']){
  const result=readWorkspaceLayout({getItem:()=>stored});assert.equal(result.left,230);assert.equal(result.right,325);assert.equal(result.original,50);
 }
 const f=fixture({denied:true});assert.doesNotThrow(()=>{f.split('left').fire('keydown',{key:'ArrowRight'});f.api.reset();});
});
test('dragging panel boundaries persists, clamps, and restores original cursor after release',()=>{
 const f=fixture(),left=f.split('left');f.doc.body.style.cursor='crosshair';f.doc.body.style.userSelect='text';
 left.fire('pointerdown');f.doc.fire('pointermove',{clientX:160});assert.equal(f.api.getLayout().left,290);assert.equal(f.saved,null);
 f.doc.fire('pointerup');assert.equal(JSON.parse(f.saved).left,290);assert.equal(f.doc.body.style.cursor,'crosshair');assert.equal(f.doc.body.style.userSelect,'text');assert.equal(left.capture,null);assert.ok(f.changes>0);
 const reloaded=fixture({stored:f.saved});assert.equal(reloaded.api.getLayout().left,290);
 const right=f.split('right');right.fire('pointerdown');f.doc.fire('pointermove',{clientX:80});assert.equal(f.api.getLayout().right,345);f.doc.fire('pointerup');
});
test('cancel, blur and unrelated pointers do not commit a partial resize',()=>{
 const f=fixture(),left=f.split('left');left.fire('pointerdown');f.doc.fire('pointermove',{pointerId:99,clientX:200});assert.equal(f.api.getLayout().left,230);
 f.doc.fire('pointermove',{clientX:200});f.doc.fire('pointercancel');assert.equal(f.api.getLayout().left,230);assert.equal(f.saved,null);
 left.fire('pointerdown');f.doc.fire('pointermove',{clientX:200});f.win.fire('blur');assert.equal(f.api.getLayout().left,230);assert.equal(left.capture,null);
});
test('keyboard, preview split, reset and browser resize work without touching document edit state',()=>{
 const f=fixture(),preview=f.split('preview'),right=f.split('right');assert.equal(preview.attributes.role,'separator');assert.equal(preview.attributes['aria-orientation'],'vertical');
 assert.equal(preview.fire('keydown',{key:'ArrowRight',shiftKey:true}),true);assert.ok(f.api.getLayout().original>50);preview.fire('keydown',{key:'Home'});assert.equal(f.api.getLayout().original,50);
 right.fire('keydown',{key:'ArrowLeft',shiftKey:true});assert.equal(f.api.getLayout().right,365);right.fire('dblclick');assert.equal(f.api.getLayout().right,325);
 f.main.width=900;f.win.fire('resize');const value=f.api.getLayout();assert.ok(900-32-value.left-value.right>=360);f.api.reset();assert.equal(f.saved,null);assert.equal(f.removed,1);
});
test('narrow editor retains usable splitters; explicit stacked layout and hidden replacement hide them',()=>{
 const f=fixture();f.replacement.hidden=true;f.win.fire('resize');assert.equal(f.split('preview').hidden,true);
 f.win.small=true;f.main.width=600;f.win.fire('resize');const left=f.split('left');assert.equal(left.hidden,false);left.fire('pointerdown');assert.equal(left.capture,7);f.doc.fire('pointermove',{clientX:200});f.doc.fire('pointerup');assert.ok(f.api.getLayout().left>0);
 assert.ok(Number(left.attributes['aria-valuemax'])>=Number(left.attributes['aria-valuemin']));
 f.main.classList.add('workspace-stacked');f.win.fire('resize');assert.equal(left.hidden,true);left.fire('pointerdown');assert.equal(left.capture,null);
 f.api.destroy();assert.equal(f.main.children.length,0);assert.equal(f.comparison.children.length,2);assert.equal(f.main.classList.contains('workspace-resizable'),false);
});
