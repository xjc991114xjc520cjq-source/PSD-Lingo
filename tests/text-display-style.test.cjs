const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {displayText}=require('../text-display-style.cjs');
const {smartFit}=require('../layout.cjs');
test('native all caps affects visible measurement and cache without altering approved text',()=>{
 const source=fs.readFileSync(require.resolve('../renderer/app.js'),'utf8');
 const ctx={measureText(text){return {width:[...text].reduce((n,c)=>n+(/[A-Z]/.test(c)?12:6),0),actualBoundingBoxAscent:15,actualBoundingBoxDescent:3};}};
 const c={displayText,smartFit,layoutCache:new Map(),layoutText:(_l,text)=>text,document:{createElement:()=>({getContext:()=>ctx})}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function fitText('),source.indexOf('function adjustmentSummary(')),c);
 c.layer={font:'Arial',size:20,minSize:20,box:[0,0,250,90],tracking:0,leading:24,smart:{allowWrap:false}};c.record={target:'Product Name\nColor'};
 const normal=vm.runInContext('fitText(layer,record)',c);c.layer.capitalization='all-caps';const caps=vm.runInContext('fitText(layer,record)',c);
 assert.ok(caps.width>normal.width);assert.deepEqual(Array.from(caps.lines),['Product Name','Color']);assert.equal(c.record.target,'Product Name\nColor');
 assert.equal(displayText(caps.lines[0],c.layer.capitalization),'PRODUCT NAME');assert.equal(c.layoutCache.size,2);
});
test('native caps enters mixed-style detection and planner context',()=>{
 const {native}=require('../illustrator.cjs');const c={FontCapsOption:{ALLCAPS:1,SMALLCAPS:2,ALLSMALLCAPS:3,NORMALCAPS:4}};vm.createContext(c);vm.runInContext(native,c);
 c.a={textFont:{name:'Arial'},size:20,fillColor:{typename:'RGBColor',red:0,green:0,blue:0},capitalization:1};
 assert.equal(vm.runInContext('capitalization(a)',c),'all-caps');const upper=vm.runInContext('signature(a)',c);c.a.capitalization=4;assert.notEqual(vm.runInContext('signature(a)',c),upper);
 const {buildDesignLayoutRequest}=require('../design-layout-context.cjs');const layer={id:1,recordId:'r',box:[0,0,200,50],font:'Arial',size:20,capitalization:'all-caps'};
 const request=buildDesignLayoutRequest({file:{width:300,height:500,layers:[layer]},layer,records:[{id:'r',target:'Product Name'}]});assert.equal(request.layers[0].capitalization,'all-caps');assert.equal(request.layers[0].target,'Product Name');
});
