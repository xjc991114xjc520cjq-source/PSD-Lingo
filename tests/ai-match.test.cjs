const {test}=require('node:test'),assert=require('node:assert/strict');
const {matchCopy,localEnvironment,validateLocalExecutable,safeLocalReason,localFailure}=require('../services/ai-match.cjs');
const request={layers:[{layerKey:'psd:1',original:'中文标题'}],records:[{id:'record:1',target:'Title'}]};
const matches=[{layerKey:'psd:1',recordId:'record:1',reason:'对应标题'}];
const api={mode:'api',apiKey:'test-secret',apiModel:'test-model'};
const local={mode:'local',executable:'C:/codex.exe',localModel:''};
const response=(value,status=200)=>({ok:status===200,status,json:async()=>value});
const envelope=items=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({matches:items})}]}],usage:{input_tokens:10,output_tokens:20}});
test('binding progress reports real stages, contains no credentials and observers cannot break matching',async()=>{const events=[];await matchCopy(request,api,{onProgress:value=>events.push(value),fetch:async()=>response(envelope(matches))});assert.deepEqual(events.map(v=>v.stage),['prepared','waiting','validated']);assert.ok(!JSON.stringify(events).includes(api.apiKey));await matchCopy(request,api,{onProgress:()=>{throw Error('observer');},fetch:async()=>response(envelope(matches))});});
test('API provider uses Responses structured output and no CLI or working directory',async()=>{
 let captured;const controller=new AbortController();
 const result=await matchCopy(request,api,{signal:controller.signal,fetch:async(url,options)=>{captured={url,options};return response(envelope(matches));},loadSdk:()=>{throw new Error('API must not import SDK');}});
 assert.deepEqual(result.matches,matches);assert.equal(result.usage.output_tokens,20);assert.equal(captured.url,'https://api.openai.com/v1/responses');assert.equal(captured.options.method,'POST');assert.equal(captured.options.headers.Authorization,'Bearer test-secret');assert.equal(captured.options.signal,controller.signal);
 const body=JSON.parse(captured.options.body);assert.equal(body.model,'test-model');assert.equal(body.store,false);assert.equal(body.text.format.type,'json_schema');assert.equal(body.text.format.strict,true);assert.equal(body.text.format.schema.additionalProperties,false);assert.equal(body.tools,undefined);assert.match(body.input,/不得调用工具/);
});
test('local provider uses existing login home without API key or network API',async()=>{
 let options,threadOptions,runOptions;class Codex{constructor(value){options=value;}startThread(value){threadOptions=value;return {run:async(prompt,value)=>{runOptions=value;assert.match(prompt,/中文标题/);return {finalResponse:JSON.stringify({matches}),usage:{turn:1}};}};}}
 const signal=new AbortController().signal;
 const result=await matchCopy(request,{...local,apiKey:'must-never-leak'},{signal,workingDirectory:'C:/empty',env:{CODEX_HOME:'C:/existing-login',HOME:'C:/user',OPENAI_API_KEY:'bad',CODEX_API_KEY:'bad',OPENAI_BASE_URL:'bad',Path:'C:/bin'},fetch:()=>{throw new Error('local must not fetch');},validateExecutable:async()=>{},loadSdk:async()=>({Codex})});
 assert.deepEqual(result.matches,matches);assert.equal(options.apiKey,undefined);assert.equal(options.baseUrl,undefined);assert.equal(options.codexPathOverride,'C:/codex.exe');assert.equal(options.env.CODEX_HOME,'C:/existing-login');assert.equal(options.env.OPENAI_API_KEY,undefined);assert.equal(options.env.CODEX_API_KEY,undefined);assert.equal(options.env.OPENAI_BASE_URL,undefined);assert.equal(options.env.Path,'C:/bin');assert.equal(options.config.features.shell_tool,false);assert.deepEqual(options.config.mcp_servers,{});
 assert.equal(threadOptions.model,undefined);assert.equal(threadOptions.sandboxMode,'read-only');assert.equal(threadOptions.approvalPolicy,'never');assert.equal(threadOptions.networkAccessEnabled,false);assert.equal(threadOptions.webSearchMode,'disabled');assert.equal(runOptions.signal,signal);assert.equal(runOptions.outputSchema.required[0],'matches');
});
test('local optional model is passed and env sanitization is case insensitive',async()=>{
 let chosen;class Codex{startThread(options){chosen=options.model;return {run:async()=>({finalResponse:JSON.stringify({matches})})};}}
 await matchCopy(request,{...local,localModel:'my-local-model'},{workingDirectory:'C:/empty',validateExecutable:async()=>{},loadSdk:async()=>({Codex})});assert.equal(chosen,'my-local-model');assert.deepEqual(localEnvironment({openai_api_key:'bad',codex_api_key:'bad',OpenAI_Base_Url:'bad',HOME:'user',UNSET:undefined}),{HOME:'user'});
});
test('unknown references, duplicate layers and malformed match objects never escape output validation',async()=>{
 const invalid=[{...matches[0],layerKey:'unknown'},{...matches[0],recordId:'unknown'},null,{...matches[0],reason:17},...matches,matches[0]];
 const result=await matchCopy(request,api,{fetch:async()=>response(envelope(invalid))});assert.deepEqual(result.matches,matches);
 await assert.rejects(matchCopy(request,api,{fetch:async()=>response(envelope(Array(501).fill(matches[0])))}),/格式无效/);
 await assert.rejects(matchCopy(request,api,{fetch:async()=>response({output:[{type:'message',content:[{type:'output_text',text:'broken JSON'}]}]})}),/JSON/);
});
test('invalid input and provider credentials reject before any provider call',async()=>{
 const deps={fetch:()=>{throw new Error('should not fetch');},loadSdk:()=>{throw new Error('should not load');}};
 await assert.rejects(matchCopy({layers:Array(501).fill({layerKey:'a'}),records:[]},api,deps),/范围/);
 await assert.rejects(matchCopy({layers:[{}],records:[]},api,deps),/格式/);
 await assert.rejects(matchCopy(request,{mode:'api',apiModel:'model'},deps),/API Key/);
 await assert.rejects(matchCopy(request,{mode:'local'},deps),/程序/);
 await assert.rejects(matchCopy(request,{mode:'other'},deps),/连接方式/);
});
test('API errors are actionable without leaking provider content or secrets',async()=>{
 for(const [status,pattern] of [[401,/Key/],[403,/权限/],[429,/配额/],[500,/HTTP 500/]])await assert.rejects(matchCopy(request,api,{fetch:async()=>response({error:{message:'test-secret'}},status)}),error=>pattern.test(error.message)&&!error.message.includes('test-secret'));
 await assert.rejects(matchCopy(request,api,{fetch:async()=>{throw new Error('test-secret');}}),/网络/);
 await assert.rejects(matchCopy(request,api,{fetch:async()=>response({status:'incomplete'})}),/不完整/);
 await assert.rejects(matchCopy(request,api,{fetch:async()=>response({output:[{type:'message',content:[{type:'refusal',refusal:'no'}]}]})}),/未能完成/);
});
test('local login failure instructs login and cancellation reaches both providers',async()=>{
 class Codex{startThread(){return {run:async()=>{throw new Error('401 Unauthorized secret');}};}}
 await assert.rejects(matchCopy(request,local,{workingDirectory:'C:/empty',validateExecutable:async()=>{},loadSdk:async()=>({Codex})}),/codex login/);
 const controller=new AbortController();await assert.rejects(matchCopy(request,api,{signal:controller.signal,fetch:async()=>{controller.abort();throw new Error('aborted');}}),/取消或超时/);
 const localAbort=new AbortController();class CancelCodex{startThread(){return {run:async(_,options)=>{assert.equal(options.signal,localAbort.signal);localAbort.abort();throw new Error('aborted');}};}}
 await assert.rejects(matchCopy(request,local,{signal:localAbort.signal,workingDirectory:'C:/empty',validateExecutable:async()=>{},loadSdk:async()=>({Codex:CancelCodex})}),/取消或超时/);
});
test('local executable preflight rejects wrappers, stale files, directories and invalid Windows binaries',async()=>{
 const opts={platform:'win32',io:{stat:async()=>({isFile:()=>true}),open:async()=>({read:async buffer=>{buffer.write('MZ');return {bytesRead:2};},close:async()=>{}})}};
 await validateLocalExecutable('C:/native/codex.exe',opts);
 await assert.rejects(validateLocalExecutable('C:/npm/codex.cmd',opts),/原生 codex.exe/);
 await assert.rejects(validateLocalExecutable('codex.exe',opts),/完整路径/);
 await assert.rejects(validateLocalExecutable('C:/old/codex.exe',{...opts,io:{stat:async()=>{throw Object.assign(Error(),{code:'ENOENT'});}}}),/自动查找/);
 await assert.rejects(validateLocalExecutable('C:/codex.exe',{...opts,io:{stat:async()=>({isFile:()=>false})}}),/文件夹/);
 let closed=false;await assert.rejects(validateLocalExecutable('C:/codex.exe',{...opts,io:{...opts.io,open:async()=>({read:async()=>({bytesRead:0}),close:async()=>{closed=true;}})}}),/有效 Windows/);assert.equal(closed,true);
});
test('local errors retain actionable reasons while redacting credentials, bearer tokens and URL secrets',async()=>{
 const secret='my-private-auth-key';const detail=safeLocalReason(Error('Error: connection refused https://name:password@host.invalid/api?token=hidden\nOPENAI_API_KEY='+secret+'\nBearer abcdef\nsk-proj-123456789'),{apiKey:secret},{CUSTOM_AUTH_TOKEN:'abcdef'});
 for(const value of [secret,'abcdef','password@','token=hidden','sk-proj-123456789'])assert.equal(detail.includes(value),false);
 assert.match(detail,/connection refused/);assert.ok(detail.length<=800);
 for(const [message,pattern] of [['invalid model: model not found',/模型不可用/],['unexpected argument --old-flag',/不兼容/],['connection refused by proxy',/连接失败/],['authentication failed',/codex login/],['Error loading authorization_policy.toml: malformed config',/运行失败/]]){
  class Codex{startThread(){return {run:async()=>{throw Error(message);}};}}
  await assert.rejects(matchCopy(request,local,{workingDirectory:'C:/empty',validateExecutable:async()=>{},loadSdk:async()=>({Codex})}),error=>pattern.test(error.message)&&error.message.includes(message));
 }
 assert.match(localFailure(Object.assign(Error('spawn failed'),{code:'ENOENT'}),local,{}).message,/自动查找/);
});
test('local preflight rejects before SDK load and auto-binding prompt omits uncertain pairs',async()=>{
 await assert.rejects(matchCopy(request,local,{workingDirectory:'C:/empty',validateExecutable:async()=>{throw Error('保存的 Codex 程序已不存在');},loadSdk:()=>{throw Error('should not load');}}),/自动查找/);
 class Codex{startThread(){return {run:async prompt=>{assert.match(prompt,/结果会自动绑定/);assert.doesNotMatch(prompt,/用户仍会逐条确认/);return {finalResponse:JSON.stringify({matches})};}};}}
 await matchCopy(request,local,{workingDirectory:'C:/empty',validateExecutable:async()=>{},loadSdk:async()=>({Codex})});
});
test('local WindowsApps spawn denial recovers using another validated native CLI only',async()=>{
 const denied='C:/Program Files/WindowsApps/OpenAI.Codex/app/resources/codex.exe',valid='C:/Users/test/AppData/Local/OpenAI/Codex/bin/hash/codex.exe';const started=[],validated=[];let searches=0;
 class Codex{constructor(options){this.path=options.codexPathOverride;}startThread(){return {run:async()=>{started.push(this.path);if(this.path===denied)throw Object.assign(Error('spawn EPERM'),{code:'EPERM',syscall:'spawn'});return {finalResponse:JSON.stringify({matches})};}};}}
 const result=await matchCopy(request,{...local,executable:denied},{workingDirectory:'C:/empty',validateExecutable:async path=>validated.push(path),loadSdk:async()=>({Codex}),discoverExecutables:async()=>{searches++;return {candidates:[denied,'C:/WindowsApps/other/codex.exe','C:/npm/codex.cmd',valid,valid]};}});
 assert.equal(searches,1);assert.deepEqual(started,[denied,valid]);assert.deepEqual(validated,[denied,valid]);assert.equal(result.executableUsed,valid);assert.deepEqual(result.matches,matches);
});
test('local execution never retries a started task or switches executable on generic permission error',async()=>{
 for(const error of [Error('Codex Exec exited with code 1: 401 Unauthorized'),Object.assign(Error('permission denied after startup'),{code:'EPERM'}),Error('network connection failed')]){
  class Codex{startThread(){return {run:async()=>{throw error;}};}}
  let searched=false;await assert.rejects(matchCopy(request,local,{workingDirectory:'C:/empty',validateExecutable:async()=>{},loadSdk:async()=>({Codex}),discoverExecutables:async()=>{searched=true;return {candidates:['C:/native/codex.exe']};}}));assert.equal(searched,false);
 }
});
test('local recovery bounds spawn attempts and stops at an alternative that starts but fails',async()=>{
 const started=[];class Codex{constructor(options){this.path=options.codexPathOverride;}startThread(){return {run:async()=>{started.push(this.path);throw Object.assign(Error('spawn EACCES'),{code:'EACCES',syscall:'spawn C:/codex.exe'});}};}}
 await assert.rejects(matchCopy(request,local,{workingDirectory:'C:/empty',validateExecutable:async()=>{},loadSdk:async()=>({Codex}),discoverExecutables:async()=>({candidates:Array.from({length:9},(_,i)=>'C:/native'+i+'/codex.exe')})}),/拒绝/);assert.equal(started.length,4);
 const attempts=[];class NetworkCodex{constructor(options){this.path=options.codexPathOverride;}startThread(){return {run:async()=>{attempts.push(this.path);if(this.path===local.executable)throw Object.assign(Error('spawn EPERM'),{code:'EPERM',syscall:'spawn'});throw Error('network connection failed');}};}}
 await assert.rejects(matchCopy(request,local,{workingDirectory:'C:/empty',validateExecutable:async()=>{},loadSdk:async()=>({Codex:NetworkCodex}),discoverExecutables:async()=>({candidates:['C:/native1/codex.exe','C:/native2/codex.exe']})}),/连接失败/);assert.equal(attempts.length,2);
});
