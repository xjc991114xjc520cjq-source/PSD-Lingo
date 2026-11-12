// Official headless entry point, using the same engine as assistant preview/export.
// Invoke with Electron: <electron> services/sku-template-background.cjs job.json result.json
const fs=require('node:fs/promises'),path=require('node:path');
const {app}=require('electron');
async function main(){
 const [jobPath,resultPath]=process.argv.slice(2);if(!path.isAbsolute(jobPath||'')||!path.isAbsolute(resultPath||'')||!/\.json$/i.test(resultPath))throw Error('需要绝对路径的job.json和新的result.json');
 try{await fs.access(resultPath);throw Error('结果文件已存在，拒绝覆盖');}catch(e){if(e.code!=='ENOENT')throw e;}
 const job=JSON.parse(await fs.readFile(jobPath,'utf8'));
 if(!['inspect','configure','run'].includes(job.action)||['sourcePath','mappingDirectory','cacheDirectory'].some(k=>!path.isAbsolute(job[k]||'')))throw Error('后台任务参数无效');
 const mappings=require('./sku-product-mappings.cjs').createProductMappings(()=>job.mappingDirectory),mapping=await mappings.read(job.mappingId);
 const {hashFile}=require('../photoshop-file-io.cjs'),source={path:job.sourcePath,fingerprint:await hashFile(job.sourcePath)};
 const {backgroundTemplates,validateBackgroundTemplates}=require('./sku-template-background-inputs.cjs'),templates=await backgroundTemplates(job,hashFile),template=job.templates?undefined:templates[0].template;
 const helperPath=job.helperPath||path.join(__dirname,'bin/psd-lingo-service.exe');
 const {createProductTemplateEngine,templateReport}=require('./sku-product-template-engine.cjs'),engine=createProductTemplateEngine({directory:job.cacheDirectory,helperPath,readMapping:id=>mappings.read(id)});
 let result;
 if(job.action==='run'){
  if(!path.isAbsolute(job.outputDirectory||''))throw Error('需要新的绝对输出目录');
  if(job.plan?.productMapping?.id!==mapping.id||job.plan.productMapping.approvalDigest!==mapping.approved?.approvalDigest)throw Error('运行计划与本次产品批准不一致');
  validateBackgroundTemplates(job.plan.productTemplate,templates);
  // A new, empty directory is reserved; engine.run validates before writing artwork.
  await fs.mkdir(job.outputDirectory,{recursive:false});
  result=await engine.run({source,plan:job.plan,directory:job.outputDirectory,onProgress:v=>console.error(v.label||'处理中')});
  result.visualAcceptance='未进行模型或人工设计审验；必须审阅最终全部画板JPG，不能将原生重开验证当作设计通过';
 }else{
  const metadata=await require('../photoshop-metadata.cjs').readPhotoshopMetadata(path.join(job.cacheDirectory,'metadata-'+require('node:crypto').randomUUID()),source.path,{helperPath});
  const input={source,template,...(job.templates?{templates}:{}),mapping,metadata};
  result=job.action==='inspect'?templateReport(await engine.inspect(input),job.page):await engine.configure({...input,args:job.args});
 }
 await fs.writeFile(resultPath,JSON.stringify(result,null,2),{flag:'wx'});
}
app.whenReady().then(main).then(()=>app.exit(0),e=>{console.error(e.stack||e.message);app.exit(1);});
