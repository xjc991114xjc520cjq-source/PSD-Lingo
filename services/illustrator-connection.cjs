// One in-process native script at a time, including writing its JSX file.
function createScriptQueue(){let tail=Promise.resolve();return action=>{const next=tail.then(action);tail=next.catch(()=>{});return next;};}
function bridgeError(output,code){
 const detail=String(output||'无法连接 Adobe Illustrator，请安装并启动后重试').trim();
 const error=Error(detail);error.nativePhase=code===20?'preflight':code===21?'script':'connection';error.uncertain=code===21;
 return error;
}
module.exports={createScriptQueue,bridgeError};
