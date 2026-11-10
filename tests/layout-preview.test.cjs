const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path'),esbuild=require('esbuild');
const compiled=esbuild.buildSync({entryPoints:[process.env.LAYOUT_PREVIEW_SOURCE||path.resolve(__dirname,'../renderer/layout-editor.js')],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
function fixture({selected=true,binding=false,missing=false}={}){
 const nodes=new Map(),draws=[];
 const node=()=>({dataset:{},style:{},addEventListener(){},classList:{add(){},remove(){}},getContext:()=>({drawImage:(...args)=>draws.push(args)}),toDataURL:()=> 'data:image/png;base64,fixture'});
 const $=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
 const document={querySelectorAll:()=>[],createElement:node},window={addEventListener(){}};
 const mod={exports:{}};vm.runInNewContext(compiled,{module:mod,exports:mod.exports,require,document,window,console,setTimeout,clearTimeout});
 const l={id:1,box:[40,1800,300,600],alignment:'center',issues:[],...(binding?{recordId:'copy'}:{})},f={fingerprint:'synthetic-source',preview:'original',width:1000,height:4000,layers:[l]};
 Object.assign($('art'),{dataset:{image:'original'},width:500,height:2000});let fits=0;
 const editor=mod.exports.createLayoutEditor({$,file:()=>f,layer:()=>selected?l:null,record:id=>!id||missing?undefined:{target:'Translated'},fitText:(_,r)=>{fits++;return {width:r.target.length*10,height:50};}});
 return {editor,l,f,draws,fits:()=>fits};
}
test('unbound original full preview never fits absent target copy',()=>{const f=fixture();const images=f.editor.designVisuals({scope:'full'});assert.equal(images.length,1);assert.equal(images[0].stage,'source');assert.deepEqual(Array.from(images[0].crop),[0,0,1000,4000]);assert.equal(f.fits(),0);assert.equal(f.l.recordId,undefined);});
test('whole artwork can be previewed without selected text, including zero text layers',()=>{const f=fixture({selected:false});f.f.layers=[];assert.equal(f.editor.designVisuals({scope:'full'}).length,1);assert.equal(f.editor.designVisuals().length,1);assert.equal(f.fits(),0);});
test('scoped unbound source crop does not manufacture copy or move source text',()=>{const f=fixture();const before=JSON.stringify(f.l),images=f.editor.designVisuals();assert.equal(images.length,1);assert.ok(images[0].crop[1]>0);assert.equal(f.fits(),0);assert.equal(JSON.stringify(f.l),before);});
test('bound scoped preview still measures visible replacement glyphs',()=>{const f=fixture({binding:true});assert.equal(f.editor.designVisuals().length,1);assert.equal(f.fits(),1);});
test('dangling scoped binding reports meaningful error instead of hiding missing copy',()=>{const f=fixture({binding:true,missing:true});assert.throws(()=>f.editor.designVisuals(),/绑定的文案记录不存在/);assert.equal(f.fits(),0);});
test('board crop preserves full-document coordinates and crops the source image horizontally',()=>{const f=fixture();const images=f.editor.designVisuals({scope:'full',crop:[200,1000,400,1000]});assert.deepEqual(Array.from(images[0].crop),[200,1000,400,1000]);assert.deepEqual(Array.from(f.draws[0]).slice(1,5),[100,500,200,500]);assert.throws(()=>f.editor.designVisuals({crop:[-1,0,400,500]}),/范围无效/);});
