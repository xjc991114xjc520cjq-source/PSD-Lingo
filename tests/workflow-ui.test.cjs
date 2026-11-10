const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const code=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../renderer/workflow.js')],bundle:true,format:'cjs',platform:'node',write:false}).outputFiles[0].text;
// Small DOM harness exercises the real controller, including nodes moved between panels.
class Element{
 constructor(tag='div',className='',id=''){this.tagName=tag;this.className=className;this.id=id;this.children=[];this.parentElement=null;this.attributes={};this.dataset={};this.listeners={};this.textContent='';this.hidden=false;this.disabled=false;this.value='';this.classList={contains:c=>this.className.split(' ').includes(c),add:c=>{this.className+=' '+c;},toggle:(c,v)=>{this.className=this.className.split(' ').filter(x=>x!==c).concat(v?[c]:[]).join(' ');}};}
 append(...nodes){for(const n of nodes){n.remove();n.parentElement=this;this.children.push(n);}}
 prepend(...nodes){for(const n of nodes)n.remove();for(const n of nodes)n.parentElement=this;this.children.unshift(...nodes);}
 before(...nodes){const p=this.parentElement,index=p.children.indexOf(this);for(const n of nodes)n.remove();for(const n of nodes)n.parentElement=p;p.children.splice(index,0,...nodes);}
 after(...nodes){const p=this.parentElement;for(const n of nodes)n.remove();const index=p.children.indexOf(this);for(const n of nodes)n.parentElement=p;p.children.splice(index+1,0,...nodes);}
 remove(){if(this.parentElement){const p=this.parentElement;p.children.splice(p.children.indexOf(this),1);this.parentElement=null;}}
 get nextElementSibling(){return this.parentElement?.children[this.parentElement.children.indexOf(this)+1];}
 matches(s){return s[0]==='.'?this.classList.contains(s.slice(1)):s[0]==='#'?this.id===s.slice(1):this.tagName===s;}
 descendants(){return this.children.flatMap(c=>[c,...c.descendants()]);}
 querySelectorAll(selector){const parts=selector.split(' '),last=parts.pop();return this.descendants().filter(n=>{if(!n.matches(last))return false;let parent=n.parentElement;for(let i=parts.length-1;i>=0;i--){while(parent&&!parent.matches(parts[i]))parent=parent.parentElement;if(!parent)return false;parent=parent.parentElement;}return true;});}
 querySelector(s){return this.querySelectorAll(s)[0]||null;}
 closest(s){for(let n=this;n;n=n.parentElement)if(n.matches(s))return n;return null;}
 setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k];}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}focus(){this.focused=true;}
 click(){if(this.disabled)return;this.onclick?.({});for(let n=this;n;n=n.parentElement)for(const fn of n.listeners.click||[])fn({});}
}
function fixture({bound=false,skip=false,records=true}={}){
 const root=new Element(),elements=new Map();
 const add=(parent,tag,cls,id)=>{const n=new Element(tag,cls,id);parent.append(n);if(id)elements.set(id,n);return n;};
 const panel=add(root,'section','binding-panel'),title=add(panel,'div','panel-title');add(title,'h2');add(title,'span','tag');
 const doc=add(panel,'div','doc-source');add(doc,'button','','importDoc');const split=add(panel,'div','split-controls');
 const tabs=add(panel,'div','binding-tabs');add(tabs,'button','','bindingTab');add(tabs,'button','','layoutTab');
 const content=add(panel,'div','binding-content');add(content,'div','field-label');add(content,'div','','originalText');
 const searchLabel=add(content,'div','field-label label-row');add(searchLabel,'button','','exactMatch');add(content,'input','','searchRecords');add(content,'div','','records');
 const ai=add(content,'div','ai-copy-helper');add(ai,'button','','codexSuggest');add(ai,'small');
 for(const id of ['bindingState','confirmBinding','clearBinding'])add(content,'button','',id);
 add(content,'div','divider');add(content,'div','alignment-editor');add(content,'div','divider');add(content,'div','text-content-editor');
 const typography=add(content,'div','typography-editor'),grid=add(typography,'div','typography-grid');
 for(const id of ['editSize','editFont','editWeight','editStretchX','editStretchY','editTracking','editLeading'])add(add(grid,'label'),'input','',id);
 add(typography,'div','position-controls');add(typography,'button','','resetPosition');add(add(typography,'label'),'input','','skipLayer');
 add(content,'div','divider');add(content,'div','label-row');add(content,'div','','proof');add(content,'button','','adaptCurrent');add(content,'button','','chooseDifferentCopy');
 for(const id of ['importPsd','check','run','export','guideTitle','guideHint','guideAction','overallText','overallDetail'])add(root,'button','',id);
 for(let i=0;i<4;i++)add(root,'div','step');
 const $=id=>elements.get(id)||root.descendants().find(n=>n.id===id);
 const l={id:1,name:'主标题',original:'中文原稿',recordId:bound?'a':null,skipExport:skip},second={id:2,name:'副标题',recordId:null,skipExport:false};
 const state={files:[{path:'test.psd',layers:[l,second]}],records:records?[{id:'a',target:'Target copy'}]:[],fileIndex:0,layerIndex:0,chosen:null};
 const file=()=>state.files[state.fileIndex],layer=()=>file()?.layers[state.layerIndex];let controller,suggest=async()=>{};
 $('confirmBinding').onclick=()=>{layer().recordId=state.chosen;controller.update();};$('codexSuggest').onclick=e=>suggest(e);$('adaptCurrent').onclick=()=>{delete layer().manual;controller.update();};
 const sandbox={module:{exports:{}},exports:{},document:{createElement:tag=>new Element(tag),querySelector:s=>root.querySelector(s),querySelectorAll:s=>root.querySelectorAll(s)}};sandbox.exports=sandbox.module.exports;vm.runInNewContext(code,sandbox);
 controller=sandbox.module.exports.installWorkflow({$,state,file,layer,selectFile:i=>{state.fileIndex=i;},selectedLayer:i=>{state.layerIndex=i;controller.update();}});controller.update();
 return {$,state,l,second,panel,content,root,controller,setSuggest:fn=>suggest=fn};
}
test('selection and skip remain available in either tab; ordinary render preserves selected tab',()=>{
 const f=fixture({bound:true});assert.equal(f.panel.dataset.mode,'layout');assert.equal(f.$('originalText').closest('.inspector-context').parentElement,f.panel);assert.equal(f.$('skipLayer').closest('.inspector-context').parentElement,f.panel);
 f.$('bindingTab').click();f.controller.update();assert.equal(f.panel.dataset.mode,'binding');assert.equal(f.$('layoutTab').getAttribute('aria-controls'),'layoutStep');
 f.$('bindingTab').parentElement.onkeydown({key:'ArrowRight',preventDefault(){}});assert.equal(f.panel.dataset.mode,'layout');assert.equal(f.$('layoutTab').focused,true);
});
test('manual apply changes only current layer then opens typography; next ignores kept original',()=>{
 const f=fixture();f.state.chosen='a';f.controller.update();f.$('confirmBinding').click();assert.equal(f.l.recordId,'a');assert.equal(f.second.recordId,null);assert.equal(f.panel.dataset.mode,'layout');assert.equal(f.$('inspectorTargetText').textContent,'Target copy');
 f.$('changeBoundCopy').click();assert.equal(f.panel.dataset.mode,'binding');assert.equal(f.$('searchRecords').focused,true);
 f.l.skipExport=true;f.l.recordId=null;f.controller.update();f.$('nextUnbound').click();assert.equal(f.state.layerIndex,1);assert.equal(f.$('skipLayer').closest('.inspector-context').parentElement,f.panel);
});
test('kept-original layer cannot apply replacement; no selection and no doc remain actionable',()=>{
 const f=fixture({skip:true});f.state.chosen='a';f.controller.update();assert.equal(f.$('confirmBinding').disabled,true);f.$('confirmBinding').onclick({});assert.equal(f.l.recordId,null);
 const empty=fixture({records:false});assert.equal(empty.$('codexSuggest').disabled,true);empty.state.files=[];empty.controller.update();assert.equal(empty.$('skipLayer').disabled,true);assert.equal(empty.$('layoutTab').disabled,true);assert.equal(empty.$('nextUnbound').disabled,true);
});
test('async AI remains locked during rerender, auto bind opens layout and batch preview cannot rebind',async()=>{
 const f=fixture();let finish;const pending=new Promise(resolve=>finish=resolve);f.setSuggest(async()=>{await pending;f.l.recordId='a';f.controller.update();});
 const running=f.$('codexSuggest').onclick({});f.controller.update();assert.equal(f.$('codexSuggest').disabled,true);finish();await running;assert.equal(f.panel.dataset.mode,'layout');assert.equal(f.$('codexSuggest').textContent,'AI 自动绑定文案');
 f.state.batchPreviewId='fr';f.state.chosen='a';f.controller.update();for(const id of ['confirmBinding','clearBinding','codexSuggest','exactMatch','run','export'])assert.equal(f.$(id).disabled,true,id);
});
test('AI binding and current-text adaptation stay above tabs in both modes, with honest scope and guards',()=>{
 const f=fixture({bound:true}),quick=f.$('codexSuggest').closest('.inspector-quick-actions');
 assert.equal(quick.parentElement,f.panel);assert.equal(f.$('adaptCurrent').parentElement,quick);assert.ok(f.panel.children.indexOf(quick)<f.panel.children.indexOf(f.$('bindingTab').parentElement));assert.equal(quick.closest('details'),null);
 f.$('bindingTab').click();f.l.manual={size:18};f.$('adaptCurrent').click();assert.equal(f.l.manual,undefined);assert.equal(f.panel.dataset.mode,'layout');assert.match(f.$('adaptCurrent').title,/不调用 AI/);
 f.l.skipExport=true;f.l.manual={size:20};f.controller.update();assert.equal(f.$('adaptCurrent').disabled,true);f.$('adaptCurrent').onclick({});assert.equal(f.l.manual.size,20);
 f.l.skipExport=false;f.state.batchPreviewId='de';f.controller.update();assert.equal(f.$('codexSuggest').disabled,true);assert.equal(f.$('adaptCurrent').disabled,false);
 f.l.recordId=null;f.controller.update();assert.equal(f.$('adaptCurrent').disabled,true);
});
