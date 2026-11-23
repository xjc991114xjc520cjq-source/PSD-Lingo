const fs=require('node:fs/promises'),path=require('node:path');
// A per-native-job mailbox. Photoshop waits on its own request; Node dispatches
// directly through Illustrator COM when BridgeTalk cannot discover the app.
async function withIllustratorMailbox(directory,run,{execute=require('../illustrator.cjs').executeScript,runner=require('../sku-illustrator.cjs').aiRunner(require('../text-style-map.cjs').styleMapNative),interval=100}={}){
 let closed=false,handled=0;
 const request=path.join(directory,'ai-com-request.json'),response=path.join(directory,'ai-com-response.json');
 const pump=(async()=>{while(!closed){let item;try{item=JSON.parse((await fs.readFile(request,'utf8')).replace(/^\uFEFF/,''));}catch{}if(item&&Number.isSafeInteger(item.id)&&item.id>handled){handled=item.id;let result;try{
   if(!['analyze','apply','verify','fontcheck'].includes(item.request?.operation))throw Error('Unsupported Illustrator mailbox operation');
   const input=path.resolve(item.request.file||''),base=path.resolve(directory);
   if(path.dirname(input)!==base||!/^object-\d+\.ai$/i.test(path.basename(input)))throw Error('Illustrator mailbox input is outside the native job');
   if(await fs.stat(path.join(directory,'cancel.flag')).then(()=>true,()=>false))throw Error('任务已取消，未提交Illustrator脚本');
   const output=path.join(directory,'ai-com-result-'+item.id+'.json');
   const req={...item.request,traceFile:path.join(directory,'ai-status.json')};
   const source='#target illustrator\n(function(){var result=('+runner+')('+JSON.stringify(req)+');var f=new File('+JSON.stringify(output.replace(/\\/g,'/'))+');f.encoding="UTF8";if(!f.open("w"))throw Error("Cannot write Illustrator result");f.write(result);f.close();})();';
   await execute(path.join(directory,'ai-com-'+item.id),source);
   result=JSON.parse((await fs.readFile(output,'utf8')).replace(/^\uFEFF/,''));
  }catch(e){result={error:'Illustrator 独立COM通道失败：'+e.message,code:e.uncertain?'AI_COM_EXECUTION_UNCERTAIN':'AI_COM_CONNECTION_FAILED',uncertain:!!e.uncertain};}
  const temp=response+'.tmp';await fs.writeFile(temp,JSON.stringify({id:item.id,result}));
  // Windows readers (including Photoshop) can briefly hold the old receipt open.
  // Retry only publishing the completed receipt, never the Adobe operation.
  for(let attempt=0;;attempt++){try{await fs.rename(temp,response);break;}catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code)||attempt>=40)throw e;await new Promise(resolve=>setTimeout(resolve,50));}}
 }if(!closed)await new Promise(resolve=>setTimeout(resolve,interval));}})();
 // Always observe the pump rejection, including while the native job is waiting.
 let pumpFailure;pump.catch(e=>{pumpFailure=e;});
 try{const result=await run();if(pumpFailure)throw pumpFailure;return result;}finally{closed=true;await pump;}
}
module.exports={withIllustratorMailbox};
