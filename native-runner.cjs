const {isIllustrator}=require('./illustrator.cjs');
// Keep each engine's successes visible even if the other engine cannot start.
async function runNativePlan(plan,{illustrator,photoshop}){
 const results=new Array(plan.files.length);
 for(const [match,run] of [[isIllustrator,illustrator],[f=>!isIllustrator(f),photoshop]]){
  const indices=plan.files.map((f,i)=>match(f)?i:-1).filter(i=>i>=0);
  if(!indices.length)continue;
  const files=indices.map(i=>plan.files[i]);
  let batch;
  try{batch=await run({...plan,files});}catch(e){batch=files.map(f=>({file:f.name,error:e.message,status:'原生程序执行失败'}));}
  indices.forEach((index,i)=>{results[index]=batch?.[i]||{file:files[i].name,error:'原生程序未返回此文件的执行结果'};});
  if(batch?.some(r=>r.uncertain)){for(let i=0;i<results.length;i++)if(!results[i])results[i]={file:plan.files[i].name,error:'原生操作结果不确定，未开始此文件',status:'未执行'};break;}
 }
 return {results,saved:results.filter(r=>r.output&&!r.error).length,failed:results.filter(r=>r.error).length,...(results.some(r=>r.uncertain)?{uncertain:true,message:'Illustrator 脚本已提交但结果不确定；已保留可能生成的副本并停止后续操作，请检查输出后再继续。'}:{})};
}
module.exports={runNativePlan};
