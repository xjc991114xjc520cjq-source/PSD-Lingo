const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {parseGifts,matchGifts,scanGiftAssets,giftAction}=require('../sku-gifts.cjs');
const {mappingRecords}=require('../sku-product-copy.cjs');
const {productRows,confirmMapping,matchProducts}=require('../sku-product-matching.cjs');
test('gift cells preserve product-name plus signs and match full asset names without guessing colors or values',()=>{
 const catalog={assets:[{name:'RS6+蓝键帽',fingerprint:'blue'},{name:'粉色爱心键帽',fingerprint:'pink'}]};
 const gifts=matchGifts('RS6+蓝键帽 价值99元＋粉色爱心键帽 价值0元',catalog);assert.deepEqual(gifts.map(g=>[g.name,g.value,g.asset.fingerprint]),[['RS6+蓝键帽','99','blue'],['粉色爱心键帽','0','pink']]);
 for(const value of ['', ' ', '/', '—'])assert.deepEqual(parseGifts(value),[]);
 assert.throws(()=>matchGifts('爱心键帽 价值79元',catalog),/缺失或重名/);assert.throws(()=>matchGifts('粉色爱心键帽 价值89元',{assets:[{name:'粉色爱心键帽'},{name:'粉色 爱心键帽'}]}),/重名/);
 assert.throws(()=>parseGifts('键帽和鼠标垫各一个'),/无法安全分解/);
});
test('gift columns retain approval provenance but never become price copy records',()=>{
 const book={sheets:[{name:'活动',cells:[{row:2,column:1,value:'键盘N1蓝'},{row:2,column:2,value:'001'},{row:2,column:3,value:'0'},{row:2,column:4,value:'蓝键帽 价值99元'}]}]};
 const selection={sheet:'活动',category:'键盘',fields:[{key:'到手',column:'C',role:'price'},{key:'赠品',column:'D',role:'gift'}]},rows=productRows(book,selection),report=matchProducts([{id:1,name:'N1蓝'}],rows,{category:'键盘'}),approved=confirmMapping(report,{identityDigest:report.identityDigest,choices:[{boardId:1,rowId:rows[0].id,action:'use',reason:'exact'}]});
 assert.equal(approved.boards[0].fields[1].role,'gift');assert.equal(approved.boards[0].fields[1].cell,'D2');const records=mappingRecords({id:'map',approved});assert.equal(records.length,1);assert.equal(records[0].target,'0');assert.equal(records[0].context.field,'到手');
});
function fixture(value='蓝键帽 价值99元'){
 const obj=(id,kind,original)=>({id,kind,original,steps:[{path:id.split('.').map(Number),name:id}],nativePath:id.split('.').map(Number)});
 const objects=[obj('0','group'),obj('0.0','group'),obj('0.0.0','text','价值79元\n爱心键帽'),obj('0.1','text','赠送'),obj('0.2','text','¥100')];
 const config={field:'赠品',containerId:'0.0',textObjectId:'0.0.0',textParts:[{text:'价值',sourceStart:0},{token:'value',sourceStart:2},{text:'元\n',sourceStart:4},{token:'name',sourceStart:6}],frame:[0,0,400,100],axis:'horizontal',imageFrame:[.5,0,.5,1],textFrame:[0,0,.5,1],emptyRemoveObjectIds:['0.1']};
 return {config,objects,catalog:{assets:[{name:'蓝键帽',path:'/blue.png',fingerprint:'blue'},{name:'鼠标垫',path:'/mat.png',fingerprint:'mat'}]},approved:{fields:[{key:'赠品',role:'gift',state:value?'value':'missing',value,cell:'E2'}]},priceFields:[{field:'price',objectIds:['0.2']}]};
}
test('gift actions create per-product slots and copy truthful names/value styles, empty products clear badge instead of carrying old gifts',()=>{
 const a=giftAction(fixture()),b=giftAction(fixture('蓝键帽 价值99元+鼠标垫 价值69元'));assert.equal(a.gifts.length,1);assert.equal(b.gifts.length,2);assert.equal(a.gifts[0].spans.map(s=>s.text).join(''),'价值99元\n蓝键帽');assert.equal(b.gifts[1].asset.fingerprint,'mat');assert.equal(a.reference.cell,'E2');
 const empty=giftAction(fixture(''));assert.equal(empty.gifts.length,0);assert.equal(empty.emptyRemoves[0].objectId,'0.1');assert.equal(a.emptyRemoves.length,0);
});
test('gift contract rejects price overlap, unknown assets, omitted name/value, invented claims and unsafe frames',()=>{
 for(const edit of [f=>f.config.containerId='0',f=>f.config.textParts=[{token:'value',sourceStart:0}],f=>f.config.textParts=[{token:'name',sourceStart:0}],f=>f.config.textParts.push({text:'Guaranteed best!',sourceStart:0}),f=>f.config.imageFrame=[0,0,1,1],f=>f.config.emptyRemoveObjectIds=['0'],f=>f.catalog.assets=[],f=>f.config.frame=[0,0,-1,100]]){const f=fixture();edit(f);assert.throws(()=>giftAction(f));}
});
test('gift directory scanner detects actual PNG bytes, hashes, empty alpha, duplicates and changed files without copying originals',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sparkit-gifts-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
 await fs.writeFile(path.join(dir,'蓝键帽.png'),png);const a=await scanGiftAssets(dir,{imageInfo:()=>[0,0,1,1]});assert.equal(a.assets[0].name,'蓝键帽');assert.equal(a.assets[0].width,1);assert.equal((await fs.readdir(dir)).length,1);
 await fs.writeFile(path.join(dir,'蓝键帽.png'),Buffer.concat([png,Buffer.from('changed')]));const b=await scanGiftAssets(dir,{imageInfo:()=>[0,0,1,1]});assert.notEqual(a.digest,b.digest);await fs.writeFile(path.join(dir,'bad.png'),'not an image');await assert.rejects(scanGiftAssets(dir,{imageInfo:()=>[0,0,1,1]}),/无效PNG/);
});
test('native gift region math supports single and multiple horizontal/vertical items without stretching shapes',()=>{
 const c=vm.createContext({});vm.runInContext(require('../sku-gift-native.cjs').giftNative,c);assert.deepEqual(Array.from(c.giftBox([.5,0,.5,1],[100,20,200,100])),[200,20,100,100]);assert.deepEqual(Array.from(c.giftBox([0,.5,1,.5],[100,20,200,100])),[100,70,200,50]);
 assert.doesNotThrow(()=>new vm.Script(require('../photoshop-artboards.cjs').compositionScript('C:/input.psb',[],'PSB','C:/out',{productTemplate:{}}).replace(/^#target photoshop/,'')));
});

test('empty gift fields explicitly mean no gifts and do not inherit the price placeholder policy',()=>{
 const book={sheets:[{name:'活动',cells:[{row:2,column:1,value:'键盘N1'},{row:2,column:2,value:'1'},{row:2,column:3,value:'99'}]}]},selection={sheet:'活动',category:'键盘',fields:[{key:'价格',column:'C',role:'price'},{key:'赠品',column:'D',role:'gift'}]},rows=productRows(book,selection),report=matchProducts([{id:1,name:'N1'}],rows,{category:'键盘'});
 const approved=confirmMapping(report,{identityDigest:report.identityDigest,choices:[{boardId:1,rowId:rows[0].id,action:'use',reason:'exact'}]});assert.equal(approved.boards[0].fields[1].state,'missing');
});

test('native character checks tolerate one 16-bit RGB conversion step only, retaining font and geometry checks',()=>{
 const c=vm.createContext({});vm.runInContext(require('../sku-workflow.cjs').skuNative,c);
 assert.equal(c.compatible(22.8925707936287,22.8913491591811,'.textStyleRange.0.textStyle.color.red'),true);
 assert.equal(c.compatible(.08484770296491,.08415000251262,'.textStyleRange.0.textStyle.color.grain'),true);
 assert.equal(c.compatible(22.8925,22.90,'.textStyleRange.0.textStyle.color.red'),false);
 assert.equal(c.compatible(15,15.002,'.textStyleRange.0.textStyle.size.value'),false);
 assert.equal(c.compatible('FontA','FontB','.textStyle.fontPostScriptName'),false);
});
