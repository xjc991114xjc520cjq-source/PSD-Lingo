const {randomUUID}=require('node:crypto');
// A suspended deterministic software operation asks its owning Codex to supply
// analysis. No second model/session is launched, and no write is replayed.
class AnalysisExchange{
 constructor(run){this.pending=null;this.finished=false;this.waiters=[];this.done=Promise.resolve().then(run).then(result=>{this.result=result;},error=>{this.error=error;}).finally(()=>{this.finished=true;this.wake();});}
 wake(){for(const resolve of this.waiters.splice(0))resolve();}
 ask(request){if(this.cancelled)throw this.cancelled;if(this.pending||this.finished)throw Error('当前分析交接状态无效');return new Promise((resolve,reject)=>{this.pending={id:randomUUID(),request,resolve,reject};this.wake();});}
 async next(){while(!this.pending&&!this.finished)await new Promise(resolve=>this.waiters.push(resolve));if(this.pending){const {id,request}=this.pending;return {analysisRequired:{id,taskName:request.taskName,prompt:request.prompt,outputSchema:request.outputSchema},images:request.images||[]};}if(this.error)throw this.error;return {operationResult:this.result};}
 async submit(id,answer){if(!this.pending||this.pending.id!==id||typeof answer!=='string'||answer.length>2000000)throw Error('分析请求已变化或回答无效，未应用');const pending=this.pending;this.pending=null;pending.resolve(answer);return this.next();}
 cancel(reason=Error('任务已暂停、终止或收到新说明，未应用待分析结果')){this.cancelled=reason;if(this.pending){const pending=this.pending;this.pending=null;pending.reject(reason);}}
}
module.exports={AnalysisExchange};
