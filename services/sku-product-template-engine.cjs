const {templateIdentity,uniqueTemplates}=require('../sku-template-routing.cjs');
// Shared backend for assistant and background callers. Scans contain metadata only.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {hashFile}=require('../photoshop-file-io.cjs');
const {inspectScript}=require('../sku-template-native.cjs');
const {buildTemplatePlan}=require('../sku-template-plan.cjs');
const {mappingRecords}=require('../sku-product-copy.cjs');
function createProductTemplateEngine({directory,helperPath,readMapping,execute=require('../photoshop-preview.cjs').executeScript,prepare=require('../photoshop-preview.cjs').preparePhotoshop,compose=require('../photoshop-artboards.cjs').composeArtboards,hash=hashFile}){
 const pending=new Map(),sourceCache=new Map();
 const base=()=>typeof directory==='function'?directory():directory;
 const equal=(a,b)=>require('./file-identity.cjs').fileKey(a)===require('./file-identity.cjs').fileKey(b);
 const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
 const location=id=>{if(!/^[a-f0-9]{64}$/.test(id||''))throw Error('模板扫描ID无效');return path.join(base(),id);};
 function assertInputs(source,mapping,template){
  if(!mapping?.approved||typeof mapping.source?.path!=='string'||typeof source?.path!=='string'||!source.fingerprint||!equal(mapping.source.path,source.path))throw Error('模板替换需要本原稿的当前产品批准');
  if(!template?.path||!template.fingerprint||! /\.(psd|psb)$/i.test(template.path)||equal(template.path,source.path))throw Error('请附加独立的PSD/PSB模板');
 }
 async function inputs(source,mapping,template,checkedHash=hash){
  assertInputs(source,mapping,template);
  if(await checkedHash(source.path)!==source.fingerprint||await checkedHash(template.path)!==template.fingerprint)throw Error('原稿或模板已变化，请重新导入');
 }
 async function inspect({source,mapping,template,metadata}){
  assertInputs(source,mapping,template);
  const sourceKey=digest([source,mapping.id,mapping.approved.approvalDigest]);
  const id=digest([3,source,template,mapping.id,mapping.approved.approvalDigest]);
  if(pending.has(id))return pending.get(id);
  const job=(async()=>{
   await inputs(source,mapping,template);
   const dir=location(id),file=path.join(dir,'scan.json');
   try{const envelope=JSON.parse(await fs.readFile(file,'utf8'));if(envelope.digest!==digest(envelope.scan)||envelope.scan.id!==id)throw Error('模板扫描记录损坏');sourceCache.set(sourceKey,envelope.scan.sourceInventory);return envelope.scan;}catch(e){if(e.code!=='ENOENT')throw e;}
   if(!metadata?.artboards?.length||mapping.source.boards.length!==metadata.artboards.length||mapping.source.boards.some(b=>!metadata.artboards.some(a=>a.id===b.id&&a.name===b.name&&JSON.stringify(a.box)===JSON.stringify(b.box))))throw Error('原生画板与当前产品批准不一致');
   await fs.mkdir(dir,{recursive:true});await prepare(helperPath);
   const read=async(input,name,deep)=>{const output=path.join(dir,name+'.json');await execute(path.join(dir,name),inspectScript(input,output,{deep,image:deep?path.join(dir,'template.jpg'):undefined,boardIds:deep?undefined:mapping.approved.boards.filter(b=>b.action==='use').map(b=>b.boardId)}));return JSON.parse((await fs.readFile(output,'utf8')).replace(/^\uFEFF/,''));};
   const sourceInventory=sourceCache.get(sourceKey)||await read(source.path,'source',false),templateInventory=await read(template.path,'template',true);
   sourceCache.set(sourceKey,sourceInventory);if(sourceCache.size>8)sourceCache.delete(sourceCache.keys().next().value);
   await inputs(source,mapping,template);
   const templateImage=path.join(dir,'template.jpg');
   templateInventory.objects.unshift({id:'@document',name:path.basename(template.path),kind:'group',document:true,visible:true,nativePath:[],steps:[{path:[],name:path.basename(template.path)}],box:[0,0,templateInventory.width,templateInventory.height],localBox:[0,0,templateInventory.width,templateInventory.height]});
   const scan={version:3,id,source,template,templateImage,templateImageHash:await hash(templateImage),mappingId:mapping.id,approvalDigest:mapping.approved.approvalDigest,sourceInventory,templateInventory,sourceBoards:metadata.artboards};
   await fs.writeFile(file+'.tmp',JSON.stringify({scan,digest:digest(scan)}));await fs.rename(file+'.tmp',file);return scan;
  })();pending.set(id,job);try{return await job;}finally{pending.delete(id);}
 }
 async function catalogs(configs){const result={},byDirectory=new Map();for(const c of configs){if(!c.gifts)continue;const dir=c.gifts.directory;if(!byDirectory.has(dir))byDirectory.set(dir,await require('../sku-gifts.cjs').scanGiftAssets(dir));result[templateIdentity(c)]=byDirectory.get(dir);}return result;}
 async function validate({source,plan}){
  const p=plan.productTemplate;if(!p)throw Error('缺少模板计划');
  const entries=require('../sku-template-routing.cjs').templateSources(p),scans=[],mappings=new Map(),hashes=new Map();let mapping;
  // Share reads only within this validation. No fingerprint survives into the
  // next preview/export/run; compose still performs its own mutation fence.
  const checkedHash=file=>{const key=require('./file-identity.cjs').fileKey(file);if(!hashes.has(key))hashes.set(key,hash(file));return hashes.get(key);};
  for(const entry of entries){
   const envelope=JSON.parse(await fs.readFile(path.join(location(entry.scanId),'scan.json'),'utf8')),scan=envelope.scan;
   if(envelope.digest!==digest(scan)||scan.id!==entry.scanId||!equal(scan.source.path,source.path)||scan.source.fingerprint!==source.fingerprint||JSON.stringify(entry.template)!==JSON.stringify(scan.template))throw Error('模板扫描损坏或不属于本原稿');
   if(!mappings.has(scan.mappingId))mappings.set(scan.mappingId,await readMapping(scan.mappingId));
   const current=mappings.get(scan.mappingId);if(mapping&&(current.id!==mapping.id||current.approved?.approvalDigest!==mapping.approved?.approvalDigest))throw Error('多模板扫描批准不一致');mapping=current;await inputs(source,mapping,scan.template,checkedHash);scans.push(scan);
  }
  const giftCatalog=p.templates?await catalogs(p.decisions.templates):p.decisions.gifts?await require('../sku-gifts.cjs').scanGiftAssets(p.decisions.gifts.directory):undefined;
  mapping=await require('./sku-template-gift-source.cjs').withGiftSource(mapping,p.decisions.giftSource);
  const rebuilt=buildTemplatePlan(p.templates?scans:scans[0],mapping,p.decisions,mappingRecords(mapping),giftCatalog);
  if(JSON.stringify(rebuilt)!==JSON.stringify(plan))throw Error('模板计划与批准字段或扫描记录不一致，请重新配置');
  return {scan:scans[0],scans,plan:rebuilt};
 }
 return {inspect,validate,async configure({source,mapping,template,templates,metadata,args,records=mappingRecords(mapping)}){
  if(args.templates!==undefined){
   if(!Array.isArray(args.templates)||!args.templates.length||args.templates.length>12||!Array.isArray(templates)||templates.length!==args.templates.length||!uniqueTemplates(templates))throw Error('请提供本任务的全部模板附件与配置');
   const scans=[],inspections=new Map();for(const c of args.templates){const input=templates.find(t=>templateIdentity(t)===templateIdentity(c)&&t.templateFileId===c.templateFileId);if(!input)throw Error('模板附件不属于本次配置');const k=JSON.stringify(input.template);if(!inspections.has(k))inspections.set(k,inspect({source,mapping,metadata,template:input.template}));const scan=await inspections.get(k);if(scan.id!==c.scanId)throw Error('多模板扫描已失效，请重新inspect_product_template');scans.push(scan);}
   const allowed=['templateKey','templateFileId','scanId','templateRootId','templateFrame','templateFields','priceGroups','gifts','giftMode','removeObjectIds','layout'];
   const decisions={...Object.fromEntries(['giftSource','outputFormat','documentName','boards','deleteBoardIds'].filter(k=>args[k]!==undefined).map(k=>[k,args[k]])),templates:args.templates.map(c=>Object.fromEntries(allowed.filter(k=>c[k]!==undefined).map(k=>[k,c[k]])))};
   if(['templateFileId','scanId','templateRootId','templateFrame','templateFields','priceGroups','gifts','giftMode','removeObjectIds','layout'].some(k=>args[k]!==undefined))throw Error('多模板不能混用单模板默认值');
   const effective=await require('./sku-template-gift-source.cjs').withGiftSource(mapping,decisions.giftSource);
   return {plan:buildTemplatePlan(scans,effective,decisions,records,await catalogs(decisions.templates)),artboards:scans[0].sourceBoards};
  }
  const scan=await inspect({source,mapping,template,metadata});if(args.scanId!==scan.id)throw Error('模板扫描已失效，请重新inspect_product_template');
  const decisions=Object.fromEntries(['giftSource','scanId','templateFileId','templateRootId','templateFrame','outputFormat','documentName','templateFields','priceGroups','gifts','giftMode','removeObjectIds','layout','boards','deleteBoardIds'].filter(k=>args[k]!==undefined).map(k=>[k,args[k]]));
  const giftCatalog=decisions.gifts?await require('../sku-gifts.cjs').scanGiftAssets(decisions.gifts.directory):undefined;const effective=await require('./sku-template-gift-source.cjs').withGiftSource(mapping,decisions.giftSource);return {plan:buildTemplatePlan(scan,effective,decisions,records,giftCatalog),artboards:scan.sourceBoards};
 },async run(args){const {scan,plan}=await validate(args);return compose({...args,plan,metadata:{...scan.sourceInventory,artboards:scan.sourceBoards,layers:[]},helperPath});}};
}
function templateReport(scan,{offset=0,limit=100,boardId}={}){
 if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw Error('模板对象分页参数无效');
 const compact=({styles,fonts,steps,...o})=>({...o,fonts,mixedStyleRuns:styles?.textStyleRange?.map(r=>({from:r.from,to:r.to,style:Object.fromEntries(['fontPostScriptName','fontName','fontStyleName','size','impliedFontSize','tracking','baselineShift','horizontalScale','verticalScale','fauxBold','fauxItalic','autoLeading','leading','color','strikethrough'].filter(k=>r.textStyle?.[k]!==undefined).map(k=>[k,r.textStyle[k]]))}))});
 const source=scan.sourceInventory.objects.filter(o=>boardId===undefined||o.boardId===boardId),template=scan.templateInventory.objects;
 return {toolContract:require('./agent-template-contract.cjs').contract('configure_product_template'),templateRoots:template.filter(o=>o.visible&&o.steps?.length===1&&['group','smart'].includes(o.kind)).map(o=>({id:o.id,name:o.name,box:o.box})),defaultPricePolicy:'价格项减少默认删除完整标签/金额/失效符号并回收空槽。配置priceGroups声明完整阅读组和运算关系，主价独立容器；有效0保留，用户完整布局优先，最终JPG仍须审验。',scanId:scan.id,boards:scan.sourceBoards,sourceObjects:source.slice(offset,offset+limit).map(compact),templateObjects:template.slice(offset,offset+limit).map(compact),sourceTotal:source.length,templateTotal:template.length,offset,nextOffset:offset+limit<Math.max(source.length,template.length)?offset+limit:null,templateCanvas:[0,0,scan.templateInventory.width,scan.templateInventory.height],issues:scan.templateInventory.issues};
}
module.exports={createProductTemplateEngine,templateReport};
