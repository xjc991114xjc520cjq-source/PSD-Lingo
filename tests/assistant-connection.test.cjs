const {test}=require('node:test'),assert=require('node:assert/strict');
const {assistantCredentials,requireLocalAssistant}=require('../services/assistant-connection.cjs');
test('assistant uses saved local model and executable without requesting API credentials',async()=>{
 const result=await assistantCredentials({get:async()=>({mode:'api',executable:'local.exe',localModel:'selected',apiKey:'private'}),credentials:()=>assert.fail('No API')},{discover:()=>assert.fail('Already configured')});
 assert.deepEqual(result,{mode:'local',executable:'local.exe',localModel:'selected',model:'selected'});
 assert.equal(requireLocalAssistant(result),result);assert.throws(()=>requireLocalAssistant({mode:'api'}),/只允许本机/);
});
test('assistant discovers only executable and fails explicitly when local Codex is unavailable',async()=>{
 const saved=[],settings={get:async()=>({mode:'api',localModel:'chosen'}),save:async v=>saved.push(v)};
 assert.equal((await assistantCredentials(settings,{discover:async()=>({path:'discovered.exe'})})).localModel,'chosen');
 assert.deepEqual(saved,[{executable:'discovered.exe'}]);
 await assert.rejects(assistantCredentials(settings,{discover:async()=>({})}),/安装并登录本机/);
});
