// The work assistant has one provider. General matching settings may still use API.
async function assistantCredentials(settings,{discover=require('./codex-discovery.cjs').discoverCodex}={}){
 const saved=await settings.get();let executable=saved.executable;
 if(!executable){const found=await discover({});executable=found.path;if(!executable)throw Error('请先安装并登录本机 Codex');await settings.save({executable});}
 return {mode:'local',executable,localModel:saved.localModel||'',model:saved.localModel||''};
}
function requireLocalAssistant(credentials){if(credentials?.mode!=='local')throw Error('AI 工作助手只允许本机 Codex，不能使用或回退到 API');return credentials;}
module.exports={assistantCredentials,requireLocalAssistant};
