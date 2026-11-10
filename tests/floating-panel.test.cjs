const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const code=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../renderer/floating-panel.js')],bundle:true,format:'cjs',platform:'node',write:false}).outputFiles[0].text;
const sandbox={module:{exports:{}}};sandbox.exports=sandbox.module.exports;vm.runInNewContext(code,sandbox);
const {clampFloatingRect,floatingGestureRect,installFloatingPanel}=sandbox.module.exports;
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(saved){
 const store=new Map(saved?[['psd-lingo.container-window',JSON.stringify(saved)]]:[]),listeners={};
 const doc={activeElement:null,createElement:tag=>node(tag)};
 function node(tag){return {tag,children:[],dataset:{},style:{},attributes:{},hidden:false,classList:{add(){},toggle(){}},append(...children){this.children.push(...children);},setAttribute(key,value){this.attributes[key]=value;},contains(target){return this===target||this.children.some(child=>child.contains(target));},focus(){doc.activeElement=this;},setPointerCapture(){},hasPointerCapture(){return false;}};}
 doc.body=node('body');const win={innerWidth:1200,innerHeight:800,localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},addEventListener:(event,listener)=>listeners[event]=listener};
 const content=node('section'),button=node('button'),changes=[];
 const panel=installFloatingPanel(content,{title:'文字背景容器',button,document:doc,window:win,onVisibilityChange:value=>changes.push(value)});
 return {panel,content,button,doc,win,store,listeners,changes,shell:panel.element,header:panel.element.children[0]};
}
test('floating geometry stays finite and permits travel outside the app viewport',()=>{
 for(const viewport of [{width:1200,height:800},{width:240,height:180},{width:1,height:1}]){const r=clampFloatingRect({left:5000,top:-600,width:Infinity,height:NaN},viewport);for(const n of Object.values(r))assert.ok(Number.isFinite(n));assert.equal(r.left,5000);assert.equal(r.top,-600);assert.ok(r.width>=280&&r.height>=180);}
});
test('eight edge directions resize from the requested edges without moving unrelated bounds',()=>{
 const rect={left:100,top:100,width:380,height:340};
 assert.deepEqual(plain(floatingGestureRect(rect,'move',20,-10)),{left:120,top:90,width:380,height:340});
 assert.deepEqual(plain(floatingGestureRect(rect,'nw',20,10)),{left:120,top:110,width:360,height:330});
 assert.deepEqual(plain(floatingGestureRect(rect,'se',20,10)),{left:100,top:100,width:400,height:350});
 assert.equal(floatingGestureRect(rect,'n',20,10).width,380);assert.equal(floatingGestureRect(rect,'e',20,10).top,100);
});
test('tool window defaults hidden, mounts outside preview, opens and returns focus on close',()=>{
 const f=fixture();assert.equal(f.shell.hidden,true);assert.equal(f.doc.body.children[0],f.shell);assert.equal(f.shell.children[1],f.content);assert.equal(f.button.attributes['aria-controls'],f.shell.id);
 f.button.onclick();assert.equal(f.panel.isOpen(),true);assert.equal(f.button.attributes['aria-expanded'],'true');assert.equal(f.doc.activeElement,f.header.children[0]);
 f.header.children[1].children[1].onclick();assert.equal(f.shell.hidden,true);assert.equal(f.doc.activeElement,f.button);assert.equal(f.button.attributes['aria-expanded'],'false');
});
test('collapse, keyboard move, resize, persistence and viewport restoration retain user layout',()=>{
 const f=fixture();f.panel.show();const caption=f.header.children[0];let prevented=0;
 caption.onkeydown({key:'ArrowLeft',shiftKey:true,preventDefault(){prevented++;},stopPropagation(){}});assert.equal(f.shell.style.left,'780px');
 const resize=f.shell.children.find(child=>child.dataset.direction==='e');resize.onkeydown({key:'ArrowRight',shiftKey:true,preventDefault(){},stopPropagation(){}});assert.equal(f.shell.style.width,'390px');
 f.header.children[1].children[0].onclick();assert.equal(f.content.hidden,true);assert.equal(f.shell.style.height,'auto');
 const saved=JSON.parse(f.store.get('psd-lingo.container-window'));assert.equal(saved.open,true);assert.equal(saved.collapsed,true);assert.equal(saved.rect.width,390);assert.equal(prevented,1);
 f.win.innerWidth=300;f.win.innerHeight=240;f.listeners.resize();assert.ok(parseFloat(f.shell.style.width)>=280);f.win.innerWidth=1200;f.win.innerHeight=800;f.listeners.resize();assert.equal(f.shell.style.width,'390px');
 const restored=fixture(saved);assert.equal(restored.panel.isOpen(),true);assert.equal(restored.content.hidden,true);assert.equal(restored.shell.style.left,'780px');restored.panel.reset();assert.equal(restored.content.hidden,false);assert.equal(restored.shell.style.width,'380px');
});
test('drag handles update panel geometry and Escape only closes the tool window',()=>{
 const f=fixture();f.panel.show();const target=f.header,event={button:0,pointerId:1,clientX:100,clientY:100,currentTarget:target,target:f.header.children[0],preventDefault(){},stopPropagation(){}};target.onpointerdown(event);target.onpointermove({...event,clientX:130,clientY:125});target.onpointerup(event);assert.equal(f.shell.style.left,'820px');assert.equal(f.shell.style.top,'137px');
 f.shell.onkeydown({key:'Escape',preventDefault(){},stopPropagation(){}});assert.equal(f.panel.isOpen(),false);assert.equal(JSON.parse(f.store.get('psd-lingo.container-window')).open,false);
});
