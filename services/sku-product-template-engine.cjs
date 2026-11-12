// Shared backend for assistant and background callers. Scans contain metadata only.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {hashFile}=require('../photoshop-file-io.cjs');
const {inspectScript}=require('../sku-template-native.cjs');
const {buildTemplatePlan}=require('../sku-template-plan.cjs');
const {mappingRecords}=require('../sku-product-copy.cjs');
function createProductTemplateEngine({directory,helperPath,readMapping,execute=require('../photoshop-preview.cjs').executeScript,prepare=require('../photoshop-preview.cjs').preparePhotoshop,compose=require('../photoshop-artboards.cjs').composeArtboards,hash=hashFile}){
 const pending=new Map();
 const base=()=>typeof directory==='function'?directory():directory;
 const equal=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
 const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
 const location=id=>{if(!/^[a-f0-9]{64}$/.test(id||''))throw Error('模板扫描ID无效');return path.join(base(),id);};
 async function inputs(source,mapping,template){
  if(!mapping?.approved||!equal(mapping.source.path,source.path))throw Error('模板替换需要本原稿的当前产品批准');
  if(!template?.path||!template.fingerprint||! /\.(psd|psb)$/i.test(template.path)||equal(template.path,source.path))throw Error('请附加独立的PSD/PSB模板');
  if(await hash(source.path)!==source.fingerprint||await hash(template.path)!==template.fingerprint)throw Error('原稿或模板已变化，请重新导入');
 }
 async function inspect({source,mapping,template,metadata}){
  await inputs(source,mapping,template);
  const id=digest([2,source,template,mapping.id,mapping.approved.approvalDigest]);
  if(pending.has(id))return pending.get(id);
  const job=(async()=>{
   const dir=location(id),file=path.join(dir,'scan.json');
   try{const envelope=JSON.parse(await fs.readFile(file,'utf8'));if(envelope.digest!==digest(envelope.scan)||envelope.scan.id!==id)throw Error('模板扫描记录损坏');return envelope.scan;}catch(e){if(e.code!=='ENOENT')throw e;}
   if(!metadata?.artboards?.length||mapping.source.boards.length!==metadata.artboards.length||mapping.source.boards.some(b=>!metadata.artboards.some(a=>a.id===b.id&&a.name===b.name&&JSON.stringify(a.box)===JSON.stringify(b.box))))throw Error('原生画板与当前产品批准不一致');
   await fs.mkdir(dir,{recursive:true});await prepare(helperPath);
   const read=async(input,name,deep)=>{const output=path.join(dir,name+'.json');await execute(path.join(dir,name),inspectScript(input,output,{deep,image:deep?path.join(dir,'template.jpg'):undefined,boardIds:deep?undefined:mapping.approved.boards.filter(b=>b.action==='use').map(b=>b.boardId)}));return JSON.parse((await fs.readFile(output,'utf8')).replace(/^\uFEFF/,''));};
   const sourceInventory=await read(source.path,'source',false),templateInventory=await read(template.path,'template',true);
   await inputs(source,mapping,template);
   const templateImage=path.join(dir,'template.jpg');
   const scan={version:2,id,source,template,templateImage,templateImageHash:await hash(templateImage),mappingId:mapping.id,approvalDigest:mapping.approved.approvalDigest,sourceInventory,templateInventory,sourceBoards:metadata.artboards};
   await fs.writeFile(file+'.tmp',JSON.stringify({scan,digest:digest(scan)}));await fs.rename(file+'.tmp',file);return scan;
  })();pending.set(id,job);try{return await job;}finally{pending.delete(id);}
 }
 async function validate({source,plan}){
  const p=plan.productTemplate;if(!p)throw Error('缺少模板计划');
  const envelope=JSON.parse(await fs.readFile(path.join(location(p.scanId),'scan.json'),'utf8')),scan=envelope.scan;
  if(envelope.digest!==digest(scan)||scan.id!==p.scanId||!equal(scan.source.path,source.path)||scan.source.fingerprint!==source.fingerprint)throw Error('模板扫描损坏或不属于本原稿');
  const mapping=await readMapping(scan.mappingId);await inputs(source,mapping,scan.template);
  const rebuilt=buildTemplatePlan(scan,mapping,p.decisions,mappingRecords(mapping));
  if(JSON.stringify(rebuilt)!==JSON.stringify(plan))throw Error('模板计划与批准字段或扫描记录不一致，请重新配置');
  return {scan,plan:rebuilt};
 }
 return {inspect,validate,async configure({source,mapping,template,metadata,args,records=mappingRecords(mapping)}){
  const scan=await inspect({source,mapping,template,metadata});if(args.scanId!==scan.id)throw Error('模板扫描已失效，请重新inspect_product_template');
  const decisions=Object.fromEntries(['scanId','templateFileId','templateRootId','templateFrame','outputFormat','documentName','templateFields','priceGroups','removeObjectIds','layout','boards','deleteBoardIds'].filter(k=>args[k]!==undefined).map(k=>[k,args[k]]));
  return {plan:buildTemplatePlan(scan,mapping,decisions,records),artboards:scan.sourceBoards};
 },async run(args){const {scan,plan}=await validate(args);return compose({...args,plan,metadata:{...scan.sourceInventory,artboards:scan.sourceBoards,layers:[]},helperPath});}};
}
function templateReport(scan,{offset=0,limit=100,boardId}={}){
 if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw Error('模板对象分页参数无效');
 const compact=({styles,fonts,steps,...o})=>({...o,fonts,mixedStyleRuns:styles?.textStyleRange?.map(r=>({from:r.from,to:r.to,style:Object.fromEntries(['fontPostScriptName','fontName','fontStyleName','size','impliedFontSize','tracking','baselineShift','horizontalScale','verticalScale','fauxBold','fauxItalic','autoLeading','leading','color','strikethrough'].filter(k=>r.textStyle?.[k]!==undefined).map(k=>[k,r.textStyle[k]]))}))});
 const source=scan.sourceInventory.objects.filter(o=>boardId===undefined||o.boardId===boardId),template=scan.templateInventory.objects;
 return {defaultPricePolicy:'价格项减少默认删除完整标签/金额/失效符号并回收空槽。配置priceGroups声明完整阅读组和运算关系，主价独立容器；有效0保留，用户完整布局优先，最终JPG仍须审验。',scanId:scan.id,boards:scan.sourceBoards,sourceObjects:source.slice(offset,offset+limit).map(compact),templateObjects:template.slice(offset,offset+limit).map(compact),sourceTotal:source.length,templateTotal:template.length,offset,nextOffset:offset+limit<Math.max(source.length,template.length)?offset+limit:null,templateCanvas:[0,0,scan.templateInventory.width,scan.templateInventory.height],issues:scan.templateInventory.issues};
}
module.exports={createProductTemplateEngine,templateReport};
