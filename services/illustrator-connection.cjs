// One in-process native script at a time, including writing its JSX file.
function createScriptQueue(){let tail=Promise.resolve();return action=>{const next=tail.then(action);tail=next.catch(()=>{});return next;};}
function bridgeError(output,code){
 const detail=String(output||'无法连接 Adobe Illustrator，请安装并启动后重试').trim();
 const error=Error(detail);error.nativePhase=code===20?'preflight':code===21?'script':'connection';error.uncertain=code===21;if(code===20)error.code=/preflight timed out/i.test(detail)?"adobe_preflight_timeout":"adobe_preflight_failed";
 return error;
}
module.exports={createScriptQueue,bridgeError};
