const {randomUUID}=require('node:crypto');
// A suspended deterministic software operation asks its owning Codex to supply
// analysis. No second model/session is launched, and no write is replayed.
class AnalysisExchange{
 constructor(run){this.pending=null;this.finished=false;this.waiters=[];this.done=Promise.resolve().then(run).then(result=>{this.result=result;},error=>{this.error=error;}).finally(()=>{this.finished=true;this.wake();});}
 wake(){for(const resolve of this.waiters.splice(0))resolve();}
 ask(request){if(this.cancelled)throw this.cancelled;if(this.pending||this.finished)throw Error('当前分析交接状态无效');return new Promise((resolve,reject)=>{this.pending={id:randomUUID(),request,resolve,reject};this.wake();});}
 async next(){while(!this.pending&&!this.finished)await new Promise(resolve=>this.waiters.push(resolve));if(this.pending){const {id,request}=this.pending;return {analysisRequired:{id,taskName:request.taskName,outputShape:require('./analysis-contract.cjs').shape(request.outputSchema),outputSchema:request.outputSchema,prompt:request.prompt,...(request.sharedInstructions?{sharedInstructions:request.sharedInstructions}:{})},images:request.images||[]};}if(this.error)throw this.error;return {operationResult:this.result};}
 async submit(id,answer){
  if(!this.pending||this.pending.id!==id||typeof answer!=='string'||answer.length>2000000)throw Error('分析请求已变化或回答无效，未应用');
  const pending=this.pending;
  // Validate with the operation's actual parser BEFORE releasing its continuation.
  // A malformed answer must not throw away measured/rendered candidate work.
  try{pending.request.validateAnswer?.(answer);}catch(error){
   pending.rejections=(pending.rejections||0)+1;
   if(pending.rejections>=3){this.pending=null;const stopped=Error('当前阶段连续3次分析校验未通过，已停止，未应用无效结果：'+error.message);stopped.contractIssues=error.contractIssues;pending.reject(stopped);return this.next();}
   return {analysisCorrection:{id,taskName:pending.request.taskName,error:String(error.message).slice(0,2000),...(error.contractIssues?{issues:error.contractIssues}:{}),outputShape:require('./analysis-contract.cjs').shape(pending.request.outputSchema),attempt:pending.rejections,remainingAttempts:3-pending.rejections,instruction:'一次修齐issues列出的全部字段。outputShape只表示数据类型，不是文案或审验结论；字段名必须精确，不能猜别名或省略必填字段。原分析请求、schema和图像仍有效。保留已有分析与候选，用相同analysisId重新提交完整JSON。不得重启软件操作、重复渲染、编造方案依据，或把revise/uncertain改为accept来绕过审验。'},completedStagesRetained:true};
  }
  this.pending=null;pending.resolve(answer);return this.next();
 }
 cancel(reason=require('./operation-error.cjs').interrupted()){this.cancelled=reason;if(this.pending){const pending=this.pending;this.pending=null;pending.reject(reason);}}
}
module.exports={AnalysisExchange};
