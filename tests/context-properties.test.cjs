const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const code=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../renderer/context-properties.js')],bundle:true,format:'cjs',platform:'node',write:false}).outputFiles[0].text;
const sandbox={module:{exports:{}}};sandbox.exports=sandbox.module.exports;vm.runInNewContext(code,sandbox);
const {contextPosition,installContextProperties}=sandbox.module.exports;
function fixture(){
 const ids={},selectors={},store=new Map(),doc={};
 class Node{
  constructor(tag){this.tagName=tag;this.children=[];this.style={};this.dataset={};this.attrs={};this.listeners={};this.hidden=false;this.classList={toggle(){}};}
  append(...nodes){for(const n of nodes){if(n.parentNode)n.parentNode.children.splice(n.parentNode.children.indexOf(n),1);this.children.push(n);n.parentNode=this;}}
  before(n){const p=this.parentNode;p.children.splice(p.children.indexOf(this),0,n);n.parentNode=p;}
  replaceWith(n){const p=this.parentNode;if(!p)return;if(n.parentNode)n.parentNode.children.splice(n.parentNode.children.indexOf(n),1);p.children.splice(p.children.indexOf(this),1,n);n.parentNode=p;this.parentNode=null;}
  replaceChildren(){for(const n of this.children)n.parentNode=null;this.children=[];}
  setAttribute(k,v){this.attrs[k]=v;}
  closest(s){if(s===this.tagName)return this;return this.parentNode?.closest(s)||null;}
  addEventListener(k,v){this.listeners[k]=v;}
  querySelectorAll(s){return this.children.flatMap(c=>[...(c.tagName===s?[c]:[]),...c.querySelectorAll(s)]);}
  contains(n){return n===this||this.children.some(c=>c.contains(n));}
  getBoundingClientRect(){return {left:parseFloat(this.style.left)||0,top:parseFloat(this.style.top)||0,width:380,height:240};}
 }
 doc.createElement=t=>new Node(t);doc.createComment=()=>new Node('comment');doc.body=new Node('body');doc.querySelector=s=>selectors[s];
 const root=new Node('section'),typo=new Node('section'),smart=new Node('section');root.append(typo,smart);doc.body.append(root);selectors['.typography-editor']=typo;selectors['.smart-detail']=smart;
 for(const id of ['editSize','editFont','editWeight','allowWrap']){const label=new Node('label'),input=new Node('input');label.append(input);(id==='allowWrap'?smart:typo).append(label);ids[id]=input;}
 ids.adaptCurrent={click(){ids.adapted=true;}};const win={innerWidth:1200,innerHeight:800,addEventListener(){},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}};
 let cleared=0;const properties=installContextProperties({$:id=>ids[id],document:doc,window:win,onClear:()=>cleared++});return {properties,ids,root,typo,smart,doc,win,Node,get cleared(){return cleared;}};
}
test('context panel anchors beside text and can be moved beyond the app viewport',()=>{
 const p=contextPosition({left:1100,right:1150,top:750},{width:380,height:240},{width:1200,height:800});assert.equal(p.left,1162);assert.equal(p.top,750);
 const q=contextPosition({left:-100,right:-50,top:-500},{width:380,height:240},{width:300,height:200});assert.equal(q.left,-38);assert.equal(q.top,-500);
});
test('basic text controls use original nodes and restore all controls when deselected',()=>{
 const f=fixture(),control=f.ids.editSize,handler=()=>{};control.onchange=handler;
 f.properties.show({type:'text',id:2,name:'标题',anchor:{left:100,right:200,top:100}});
 const shell=f.properties.element;assert.equal(shell.hidden,false);assert.equal(shell.dataset.kind,'text');assert.ok(shell.contains(control));assert.equal(control.onchange,handler);
 const actions=shell.children[0].children[1];actions.children[1].onclick();assert.equal(actions.children[1].attrs['aria-expanded'],'true');
 f.properties.clear();assert.equal(shell.hidden,true);assert.ok(f.typo.contains(control));assert.ok(f.smart.contains(f.ids.allowWrap));assert.equal(control.onchange,handler);
});
test('text-to-shape switch returns text controls and hides even a pinned property window on deselect',()=>{
 const f=fixture(),shape=new f.Node('section');f.root.append(shape);f.properties.show({type:'text',id:1,anchor:{left:100,right:150,top:100}});
 const actions=f.properties.element.children[0].children[1];actions.children[0].onclick();assert.equal(actions.children[0].attrs['aria-pressed'],'true');
 f.properties.show({type:'shape',id:9,name:'背景',element:shape,anchor:{left:200,right:300,top:200}});assert.ok(f.typo.contains(f.ids.editSize));assert.ok(f.properties.element.contains(shape));
 f.properties.clear();assert.equal(f.properties.isOpen(),false);assert.equal(shape.parentNode,f.root);
});
test('updating geometry retains input focus and close clears canvas selection',()=>{
 const f=fixture();f.properties.show({type:'text',id:1,anchor:{left:10,right:100,top:50}});const label=f.ids.editSize.parentNode;
 f.properties.update({type:'text',id:1,anchor:{left:30,right:120,top:70}});assert.equal(f.ids.editSize.parentNode,label);
 f.properties.element.children[0].children[1].children[2].onclick();assert.equal(f.cleared,1);assert.equal(f.properties.element.hidden,true);
});
