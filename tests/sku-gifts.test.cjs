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
 const a=giftAction(fixture()),b=giftAction(fixture('蓝键帽 价值99元+鼠标垫 价值69元'));assert.equal(a.gifts.length,1);assert.equal(b.gifts.length,2);assert.equal(a.gifts[0].spans.map(s=>s.text).join(''),'蓝键帽\n价值99元');assert.equal(b.gifts[1].asset.fingerprint,'mat');assert.equal(a.reference.cell,'E2');
 const empty=giftAction(fixture(''));assert.equal(empty.gifts.length,0);assert.equal(empty.emptyRemoves[0].objectId,'0.1');assert.equal(a.emptyRemoves.length,0);
});
test('gift contract rejects price overlap, unknown assets, omitted name/value, invented claims and unsafe frames',()=>{
 for(const edit of [f=>f.config.containerId='0',f=>f.config.textParts=[{token:'value',sourceStart:0}],f=>f.config.textParts=[{token:'name',sourceStart:0}],f=>f.config.textParts.push({text:'Guaranteed best!',sourceStart:0}),f=>f.config.imageFrame=[0,0,1,1],f=>f.config.emptyRemoveObjectIds=['0'],f=>f.catalog.assets=[],f=>f.config.frame=[0,0,-1,100]]){const f=fixture();edit(f);assert.throws(()=>giftAction(f));}
});

test('single gift reading band uses independent slots and reordered truthful text; multiple and empty routes remain independent',()=>{
 const config=fixture().config;
 config.singleLayout={frame:[100,20,500,80],imageFrame:[.65,.1,.35,.8],textFrame:[0,0,.6,1],unitAlignment:'slots',textParts:[{token:'name',sourceStart:6},{text:'\n',sourceStart:5},{text:'价值',sourceStart:0},{token:'value',sourceStart:2},{text:'元',sourceStart:4}]};
 config.multipleLayout={axis:'vertical',textAnchor:'left'};
 const compile=value=>giftAction({...fixture(value),config:JSON.parse(JSON.stringify(config))});
 const a=compile('蓝键帽 价值99元'),b=compile('蓝键帽 价值99元+鼠标垫 价值69元'),empty=compile('');
 assert.deepEqual(a.frame,[100,20,500,80]);assert.equal(a.unitAlignment,'slots');assert.equal(a.reference.layoutVariant,'singleLayout');assert.equal(a.gifts[0].spans.map(s=>s.text).join(''),'蓝键帽\n价值99元');
 assert.equal(b.axis,'vertical');assert.deepEqual(b.frame,config.frame);assert.equal(b.reference.layoutVariant,'multipleLayout');assert.equal(b.gifts.length,2);assert.equal(empty.emptyRemoves.length,1);assert.equal(empty.reference.layoutVariant,undefined);
 for(const override of [{containerId:'0.2'},{directory:'/other'},null,[],{imageFrame:[0,0,1,1]},{textParts:[{token:'name',sourceStart:6},{text:'新营销文案',sourceStart:0}]}]){const f=fixture();f.config.singleLayout=override;assert.throws(()=>giftAction(f));}
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
test('single gift compacts visible text and image instead of retaining large slot gaps across sizes',()=>{
 const c=vm.createContext({});vm.runInContext(require('../sku-gift-native.cjs').giftNative,c);
 for(const size of [1,2,4]){const cell=[100*size,20*size,400*size,100*size],text=[0,0,80*size,40*size],image=[900,0,110*size,80*size],p=c.giftCompact(cell,text,image);assert.equal(p.scale,1);assert.ok(p.gap<=12*size);assert.ok(Math.abs(p.image[0]-(p.text[0]+text[2])-p.gap)<1e-8);assert.equal((p.text[0]+p.image[0]+image[2])/2,cell[0]+cell[2]/2);assert.equal(p.text[1]+text[3]/2,p.image[1]+image[3]/2);}
 const long=c.giftCompact([0,0,200,100],[0,0,150,40],[0,0,100,50]);assert.ok(long.scale<1);assert.equal(long.text[0],0);assert.throws(()=>c.giftCompact([0,0,100,50],[0,0,100,40],[0,0,20,20]),/放不下/);
});
test('gift supporting copy keeps explicit source identity and cannot capture price or duplicate main text',()=>{
 const f=fixture();f.objects.push({...f.objects[2],id:'0.0.1',nativePath:[0,0,1],steps:[{path:[0,0,1]}],original:'原有说明'});f.config.supportingTextObjectIds=['0.0.1'];assert.deepEqual(giftAction(f).supportingPaths,[[0,0,1]]);
 for(const ids of [['0.2'],['0.0.0'],['0.0.1','0.0.1']]){f.config.supportingTextObjectIds=ids;assert.throws(()=>giftAction(f),/附属说明/);}
});

test('reordered gift paragraphs keep line breaks inside their actual paragraph and inherit the matching source style',()=>{
 class Descriptor{constructor(v){this.v={...v};}getInteger(k){return this.v[k];}putInteger(k,v){this.v[k]=v;}}
 class List{constructor(items=[]){this.items=items;this.count=items.length;}getObjectValue(i){return new Descriptor(this.items[i].v);}getObjectType(){return 'paragraph';}putObject(k,v){this.items.push(v);this.count++;}}
 const c=vm.createContext({sid:k=>k,ActionList:List});vm.runInContext(require('../sku-gift-native.cjs').giftNative,c);
 const old=new List([new Descriptor({from:0,to:6,style:'value'}),new Descriptor({from:6,to:12,style:'name'})]);let actual;
 const td={putList(k,v){actual=v.items.map(x=>x.v);}},spans=[{text:'New',sourceStart:6},{text:'\r',sourceStart:5},{text:'价值',sourceStart:0},{text:'9',sourceStart:2},{text:'元',sourceStart:4}];
 c.giftParagraphs(td,old,'New\r价值9元',spans);assert.deepEqual(actual,[{from:0,to:4,style:'name'},{from:4,to:9,style:'value'}]);
 assert.equal(old.items[0].v.to,6);assert.equal(old.items[1].v.from,6);
});

test('gift PNG pool is bounded by size and count, reuses immutable inputs, and never closes user documents',()=>{
 const docs=[],closed=[];let opened=0;
 const user={path:'user.png',saved:true,close(){assert.fail('user document closed');}};docs.push(user);
 const c=vm.createContext({File:function(p){this.path=p;},SaveOptions:{DONOTSAVECHANGES:0},tplDocs:()=>docs.slice(),tplKnown:(d,a)=>a.includes(d),app:{open(f){const existing=docs.find(d=>d.path===f.path);if(existing)return existing;opened++;const d={path:f.path,saved:true,close(){closed.push(this.path);docs.splice(docs.indexOf(this),1);}};docs.push(d);return d;}}});vm.runInContext(require('../sku-gift-native.cjs').giftNative,c);
 const asset=name=>({path:name,fingerprint:name,width:100,height:100});
 const a=c.giftImageSource(asset('one.png'));assert.equal(c.giftImageSource(asset('one.png')).doc,a.doc);assert.equal(opened,1);
 c.giftImageSource(asset('two.png'));c.giftImageSource(asset('three.png'));assert.deepEqual(closed,['one.png']);assert.equal(c.giftImagePool.length,2);
 assert.equal(c.giftImageSource(asset('user.png')).close,false);assert.equal(c.giftImagePool.length,2);
 const big=c.giftImageSource({...asset('big.png'),width:2048,height:2048});assert.equal(big.close,true);big.doc.close();
 c.giftImagePool[0].doc.saved=false;assert.throws(()=>c.giftImageSource(asset('two.png')),/未保存修改/);c.giftCloseImages();assert.equal(c.giftImagePool.length,0);assert.ok(docs.includes(user));
});

test('empty gift fields explicitly mean no gifts and do not inherit the price placeholder policy',()=>{
 const book={sheets:[{name:'活动',cells:[{row:2,column:1,value:'键盘N1'},{row:2,column:2,value:'1'},{row:2,column:3,value:'99'}]}]},selection={sheet:'活动',category:'键盘',fields:[{key:'价格',column:'C',role:'price'},{key:'赠品',column:'D',role:'gift'}]},rows=productRows(book,selection),report=matchProducts([{id:1,name:'N1'}],rows,{category:'键盘'});
 const approved=confirmMapping(report,{identityDigest:report.identityDigest,choices:[{boardId:1,rowId:rows[0].id,action:'use',reason:'exact'}]});assert.equal(approved.boards[0].fields[1].state,'missing');
});

test('single gift synchronizes intrinsic and transformed leading without changing font size',()=>{
 class D{constructor(v){this.v=v;}hasKey(k){return k in this.v;}getList(k){return this.v[k];}getObjectValue(k){return this.v[k];}getDouble(k){return this.v[k];}getUnitDoubleValue(k){return this.v[k];}putBoolean(k,v){this.v[k]=v;}putUnitDouble(k,u,v){this.v[k]=v;}putObject(k,t,v){this.v[k]=v;}putList(k,v){this.v[k]=v;}}
 class L{constructor(items=[]){this.items=items;}get count(){return this.items.length;}getObjectValue(i){return this.items[i];}getObjectType(){return 'textStyleRange';}putObject(t,v){this.items.push(v);}}
 const c=vm.createContext({sid:s=>s,charIDToTypeID:s=>s,ActionList:L});vm.runInContext(require('../sku-gift-native.cjs').giftNative,c);const style=new D({size:15,impliedLeading:30}),td=new D({transform:new D({yx:0,yy:.96}),textStyleRange:new L([new D({textStyle:style})])});c.giftTightText(td);assert.equal(style.v.size,15);assert.equal(style.v.autoLeading,false);assert.ok(Math.abs(style.v.leading-17.25)<.00001);assert.ok(Math.abs(style.v.impliedLeading-16.56)<.00001);
});

test('native character checks tolerate one 16-bit RGB conversion step only, retaining font and geometry checks',()=>{
 const c=vm.createContext({});vm.runInContext(require('../sku-workflow.cjs').skuNative,c);
 assert.equal(c.compatible(22.8925707936287,22.8913491591811,'.textStyleRange.0.textStyle.color.red'),true);
 assert.equal(c.compatible(.08484770296491,.08415000251262,'.textStyleRange.0.textStyle.color.grain'),true);
 assert.equal(c.compatible(22.8925,22.90,'.textStyleRange.0.textStyle.color.red'),false);
 assert.equal(c.compatible(15,15.002,'.textStyleRange.0.textStyle.size.value'),false);
 assert.equal(c.compatible('FontA','FontB','.textStyle.fontPostScriptName'),false);
});

test('multi-gift template replaces original independent text/image slots and retains plus and decorations',()=>{
 const f=fixture('蓝键帽 价值99元+鼠标垫 价值69元');
 f.objects[2].box=[20,20,65,33];
 const obj=(id,kind,original,box)=>({id,kind,original,box,steps:[{path:id.split('.').map(Number)}],nativePath:id.split('.').map(Number)});
 f.objects.push(obj('0.0.1','smart',null,[100,10,71,59]),obj('0.0.2','text','+',[200,30,13,13]),obj('0.0.3','smart',null,[350,10,66,56]),obj('0.0.4','text','旧鼠标垫',[260,40,76,13]),obj('0.0.5','text','价值69元\r',[260,20,66,18]));
 // Use actual paragraph separators, not literal backslash characters.
 f.objects.at(-1).original='价值69元\r'.replace('\\r','\r');
 const a=giftAction(f);assert.equal(a.templateSlots.length,2);
 assert.deepEqual(a.templateSlots.map(s=>s.imagePath),[[0,0,1],[0,0,3]]);
 assert.deepEqual(a.templateSlots[0].imageBox,[100,10,71,59]);
 assert.equal(a.templateSlots[0].texts[0].spans.map(s=>s.text).join(''),'价值99元\n蓝键帽');
 assert.deepEqual(a.templateSlots[1].texts.map(t=>t.spans.map(s=>s.text).join('')),['鼠标垫','价值69元\r']);
 assert.ok(a.templateSlots.every(s=>s.texts.every(t=>t.original!=='+')));
 assert.equal(giftAction({...f,approved:fixture().approved}).templateSlots,null);
});

test('mixed gift container declares replaceable children while preserving its background and badge',()=>{
 const f=fixture();f.config.contentObjectIds=['0.0.0'];const r=giftAction(f);assert.deepEqual(r.contentPaths,[[0,0,0]]);assert.equal(f.objects.length,5);f.config.contentObjectIds=['0.0'];assert.throws(()=>giftAction(f),/赠品内容/);
});
