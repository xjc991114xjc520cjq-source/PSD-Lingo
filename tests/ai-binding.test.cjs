const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const load=async()=>import('data:text/javascript;base64,'+Buffer.from(await fs.readFile(path.join(__dirname,'../renderer/ai-binding.js'),'utf8')).toString('base64'));
function fixture(){return {files:[{layers:[{name:'title',original:'标题'},{name:'body',original:'描述'},{name:'kept',recordId:'a'},{name:'skip',skipExport:true}]}],records:[{id:'a',target:'Title'},{id:'b',target:'Body'}]};}

test('a compound translation row binds only the label and preserves its separate mixed-style parameter value',async()=>{
 const {captureBindingRequest,applyBindingResult}=await load();
 for(const [source,value,target,preserved]of [['总行程','3.55±0.3mm','Total Travel: 3.55 ± 0.3 mm',true],['使用寿命','1亿次','Rated Lifespan: 100 Million Keystrokes',false]]){
  const number={id:1,original:value,font:'Display-Bold',size:38,box:[50,100,150,40],issues:['混合文字样式尚不支持']},label={id:2,original:source,font:'Body-Regular',size:19,box:[65,145,120,20]};
  const state={files:[{layers:[number,label]}],records:[{id:'r',original:value+' '+source,target}]},before=JSON.stringify(number);
  const result=applyBindingResult(state,captureBindingRequest(state),[{layerKey:'0:1',recordId:'r'}]);assert.equal(JSON.stringify(number),before);assert.equal(label.customText,target.split(':')[0]);assert.equal(result.parameterComponents[0].preserved,preserved);assert.equal(result.parameterComponents[0].valueSupported,false);
 }
});
test('ambiguous or distant parameter values are not automatically split into a label',async()=>{
 const {parameterParts}=await load(),label={original:'总行程',box:[0,100,80,20]},value={original:'3.55mm',box:[700,100,100,40]},record={original:'3.55mm 总行程',target:'Total Travel: 3.55 mm'};
 assert.equal(parameterParts({layers:[label,value]},label,record),null);value.box=[0,60,100,40];assert.equal(parameterParts({layers:[label,value,{...value}]},label,record),null);
});
test('AI result binds valid targets directly and preserves manual bindings and skipped layers',async()=>{const {captureBindingRequest,applyBindingResult}=await load(),s=fixture(),c=captureBindingRequest(s);assert.equal(c.request.layers.length,2);const summary=applyBindingResult(s,c,[{layerKey:'0:0',recordId:'a'},{layerKey:'0:0',recordId:'b'},{layerKey:'0:1',recordId:'missing'},{layerKey:'0:2',recordId:'b'},{layerKey:'0:3',recordId:'b'}]);assert.deepEqual(summary,{bound:1,unmatched:1});assert.equal(s.files[0].layers[0].recordId,'a');assert.equal(s.files[0].layers[2].recordId,'a');assert.equal(s.files[0].layers[3].recordId,undefined);});
test('manual edits made during lookup win and document/project changes reject stale response',async()=>{const {captureBindingRequest,applyBindingResult}=await load(),s=fixture(),c=captureBindingRequest(s);s.files[0].layers[0].recordId='b';s.files[0].layers[1].skipExport=true;assert.deepEqual(applyBindingResult(s,c,[{layerKey:'0:0',recordId:'a'},{layerKey:'0:1',recordId:'b'}]),{bound:0,unmatched:0});s.records[0].target='Changed';assert.throws(()=>applyBindingResult(s,c,[]),/已更换/);const next=fixture(),request=captureBindingRequest(next);next.files=[...next.files];assert.throws(()=>applyBindingResult(next,request,[]),/已更换/);});
