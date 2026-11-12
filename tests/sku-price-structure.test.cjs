const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {priceStructure}=require('../sku-price-structure.cjs');
const {priceReflowNative}=require('../sku-price-reflow-native.cjs');
function fixture(missing=['b']){
 const node=(id,box,kind='text',original='Label')=>({id,box,localBox:box,kind,original,steps:[{path:id.split('.').map(Number),name:id}],nativePath:id.split('.').map(Number)});
 const objects=[node('0',[0,0,400,100],'group')];const items=[],fields=[];
 ['a','b','c'].forEach((field,i)=>{const group='0.'+i;objects.push(node(group,[i*140,10,100,70],'group'),node(group+'.0',[i*140,10,100,20],'text','label '+field),node(group+'.1',[i*140,50,80,30],'text','¥0'));items.push({field,objectIds:[group]});fields.push({field,objectIds:[group+'.1']});});
 objects.push(node('0.3',[110,50,20,20],'text','-'),node('0.4',[250,50,20,20],'text','−'),node('0.5',[0,90,100,10],'text','MODEL-A-2'));
 const groups=[{containerId:'0',preserveObjectIds:['0.5'],items,separators:[{objectId:'0.3',leftField:'a',rightField:'b'},{objectId:'0.4',leftField:'b',rightField:'c'}]}];
 return {objects,fields,root:objects[0],groups,approved:{fields:['a','b','c'].map(key=>({key,state:missing.includes(key)?'placeholder':'value',value:missing.includes(key)?'/':'0',recordId:key}))}};
}
test('price reduction defaults clear whole labels and amounts, remove only invalid relations, and reclaim 3 to 2 to 1 slots',()=>{
 const two=priceStructure(fixture(['c']));assert.deepEqual(new Set(two.removeIds),new Set(['0.2','0.4']));assert.deepEqual(two.reflows[0].items.map(i=>i.field),['a','b']);assert.equal(two.reflows[0].separators[0].leftField,'a');
 const one=priceStructure(fixture(['b','c']));assert.deepEqual(new Set(one.removeIds),new Set(['0.1','0.2','0.3','0.4']));assert.equal(one.reflows[0].items.length,1);assert.equal(one.reflows[0].separators.length,0);assert.ok(!one.removeIds.includes('0.5'));
 const other=priceStructure(fixture(['a']));assert.deepEqual(other.reflows[0].items.map(i=>i.field),['b','c']);assert.ok(!other.removeIds.includes('0.4'));
});
test('zero values remain, missing semantic mapping and orphan symbols block completion, valid minus cannot be manually removed',()=>{
 const f=fixture([]),p=priceStructure(f);assert.deepEqual(p.removeIds,[]);assert.deepEqual(p.reflows,[]);
 const missing=fixture();delete missing.groups;assert.throws(()=>priceStructure(missing),/priceGroups/);
 const orphan=fixture(['c']);orphan.groups[0].separators.pop();assert.throws(()=>priceStructure(orphan),/未归属|孤立符号/);
 const label=fixture(['c']);label.objects.push({...label.objects.at(-1),id:'0.6',nativePath:[0,6],steps:[{path:[0,6],name:'extra label'}],original:'unassigned label'});assert.throws(()=>priceStructure(label),/未归属标签/);
 const valid=fixture(['c']);valid.removes=['0.3'];assert.throws(()=>priceStructure(valid),/有效分隔符/);
 const active=fixture(['c']);active.removes=['0.0'];assert.throws(()=>priceStructure(active),/有效价格/);
});
test('main price and nested smart-document containers remain independent and manual layout overrides must be complete',()=>{
 const f=fixture(['b']);f.groups[0].items.pop();f.groups[0].separators.pop();f.objects=f.objects.filter(o=>o.id!=='0.4');f.groups.push({containerId:'0',items:[{field:'c',objectIds:['0.2']}],separators:[]});
 // Keep unrelated main price outside detail envelope and declare the sole surviving relation.
 const r=priceStructure(f);assert.deepEqual(r.reflows[0].items.map(i=>i.field),['a']);assert.equal(r.summary.length,1);assert.ok(!r.removeIds.includes('0.2'));
 const nested=fixture(['c']);for(const o of nested.objects)o.steps.unshift({path:[4],name:'Embedded PSD'});const n=priceStructure(nested);assert.equal(n.reflows[0].steps.length,2);
 const partial=fixture(['c']);partial.layout=[{objectId:'0.0'}];assert.throws(()=>priceStructure(partial),/覆盖全部/);
 partial.layout=[{objectId:'0.0'},{objectId:'0.1'},{objectId:'0.3'}];assert.equal(priceStructure(partial).reflows.length,0);assert.equal(priceStructure(partial).summary[0].layout,'explicit');
});
function native(){const c=vm.createContext({bounds:l=>l.box.slice(),tplParents:()=>[],tplRestoreParents:()=>{},unlock:()=>[],relock:()=>{},UnitValue:v=>v});vm.runInContext(priceReflowNative,c);return c;}
function layer(box){return {box:box.slice(),translate(x,y){this.box[0]+=x;this.box[1]+=y;}};}
test('native reflow uses changed visible widths, centers one item, and keeps meaningful operator visually between groups',()=>{
 const c=native(),a=layer([0,0,70,30]),b=layer([280,0,50,30]),s=layer([150,0,10,10]);
 c.priceReflow({axis:'horizontal',envelope:[0,0,360,30],items:[{field:'a',nodes:[a]},{field:'b',nodes:[b]}],symbols:[{layer:s,left:'a',right:'b'}]});
 assert.equal(a.box[0],80);assert.equal(b.box[0],230);assert.equal(s.box[0]+5,(a.box[0]+70+b.box[0])/2);assert.equal(s.box[1]+5,15);
 const only=layer([230,0,50,30]);c.priceReflow({axis:'horizontal',envelope:[0,0,360,30],items:[{field:'b',nodes:[only]}],symbols:[]});assert.equal(only.box[0],155);
 const tall=layer([10,200,30,20]);c.priceReflow({axis:'vertical',envelope:[0,0,50,300],items:[{field:'x',nodes:[tall]}],symbols:[]});assert.equal(tall.box[1],140);assert.equal(tall.box[0],10);
});
test('native reflow rejects overflow and impossible operator spacing before moving any original object',()=>{
 const c=native(),a=layer([0,0,70,30]),b=layer([90,0,60,30]),s=layer([80,0,30,10]),before=a.box.slice();const p={axis:'horizontal',envelope:[0,0,100,30],items:[{field:'a',nodes:[a]},{field:'b',nodes:[b]}],symbols:[{layer:s,left:'a',right:'b'}]};assert.throws(()=>c.priceReflow(p),/超出/);assert.deepEqual(a.box,before);p.envelope[2]=150;assert.throws(()=>c.priceReflow(p),/运算符/);assert.deepEqual(a.box,before);
});
