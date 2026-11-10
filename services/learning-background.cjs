// PSD generation owns its own success/failure. Learning is best-effort work
// after export, never awaited by Photoshop or held under its busy lock.
function createLearningBackground({notify=()=>{},limit=4}={}){
 let nextId=0;const active=new Set();
 function start(action){
  if(active.size>=limit)return {skipped:true,message:'后台记录繁忙，本次跳过学习，不影响已生成文件。'};
  const taskId=++nextId;active.add(taskId);
  Promise.resolve().then(action).then(outcome=>finish({taskId,outcome}),error=>finish({taskId,outcome:{error:'学习记录未完成，不影响已生成文件：'+error.message}}));
  function finish(value){active.delete(taskId);try{notify(value);}catch{}}
  return {pending:true,taskId};
 }
 return {start,get pending(){return active.size;}};
}
module.exports={createLearningBackground};
