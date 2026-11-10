const {test}=require('node:test'),assert=require('node:assert/strict');
const {matchCopy}=require('../services/ai-match.cjs');
const credentials={mode:'api',apiKey:'private-test-key',apiModel:'provider-model',apiBaseUrl:'https://provider.invalid/api/v1'};
const request={layers:[{layerKey:'layer1',original:'Original'}],records:[{id:'record1',target:'Target'}]};
const matches=[{layerKey:'layer1',recordId:'record1',reason:'exact'}];
const reply=(value,status=200)=>({ok:status===200,status,json:async()=>value});
const chat=()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({matches})}}],usage:{total_tokens:12}});
test('explicit Chat Completions uses provider URL and JSON object contract without loading CLI',async()=>{
 let calls=0;const result=await matchCopy(request,{...credentials,apiProtocol:'chat-completions'},{fetch:async(url,options)=>{
  calls++;assert.equal(url,'https://provider.invalid/api/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer private-test-key');assert.equal(options.redirect,'error');
  const body=JSON.parse(options.body);assert.equal(body.response_format.type,'json_object');assert.equal(body.model,'provider-model');assert.equal(body.store,false);assert.equal(body.tools,undefined);assert.match(body.messages[0].content,/JSON Schema/);assert.match(body.messages[1].content,/Original/);return reply(chat());
 },loadSdk:()=>assert.fail('must not load CLI')});assert.deepEqual(result.matches,matches);assert.equal(result.usage.total_tokens,12);assert.equal(calls,1);
});
test('auto retries once as Chat Completions only after unsupported Responses endpoint',async()=>{
 for(const status of [404,405,501]){
  const urls=[];const result=await matchCopy(request,{...credentials,apiProtocol:'auto'},{fetch:async url=>{urls.push(url);return urls.length===1?reply({error:{message:'Endpoint not supported'}},status):reply(chat());}});
  assert.deepEqual(result.matches,matches);assert.deepEqual(urls,['https://provider.invalid/api/v1/responses','https://provider.invalid/api/v1/chat/completions']);
 }
});
test('auto never retries authorization, quota, model or ambiguous400 errors',async()=>{
 for(const [status,error] of [[401,{}],[403,{}],[429,{}],[400,{message:'Unsupported response_format'}],[404,{code:'model_not_found'}],[404,{message:'Requested model unavailable'}],[500,{}]]){
  let calls=0;await assert.rejects(matchCopy(request,credentials,{fetch:async()=>{calls++;return reply({error},status);}}));assert.equal(calls,1);
 }
});
test('explicit Responses protocol never changes protocol after unsupported endpoint',async()=>{
 let calls=0;await assert.rejects(matchCopy(request,{...credentials,apiProtocol:'responses'},{fetch:async()=>{calls++;return reply({error:{message:'Unsupported endpoint'}},404);}}),/HTTP 404/);assert.equal(calls,1);
});
test('Chat output validates known references and rejects malformed, refused or truncated output',async()=>{
 const invalid={...chat(),choices:[{message:{content:JSON.stringify({matches:[...matches,{...matches[0],layerKey:'unknown'}]})}}]};
 assert.deepEqual((await matchCopy(request,{...credentials,apiProtocol:'chat-completions'},{fetch:async()=>reply(invalid)})).matches,matches);
 for(const value of [{choices:[{message:{content:'not JSON'}}]},{choices:[{finish_reason:'length',message:{content:'{}'}}]},{choices:[{message:{refusal:'no'}}]},{}])await assert.rejects(matchCopy(request,{...credentials,apiProtocol:'chat-completions'},{fetch:async()=>reply(value)}));
});
test('provider details retain useful errors but strip key and sensitive URL fields',async()=>{
 await assert.rejects(matchCopy(request,credentials,{fetch:async()=>reply({error:{message:'unsupported response_format private-test-key https://name:password@provider.invalid/path?token=secret'}},400)}),error=>{
  assert.match(error.message,/unsupported response_format/);for(const secret of ['private-test-key','password@','token=secret'])assert(!error.message.includes(secret));return true;
 });
});
test('API matching rejects oversized streamed responses and cancels reading',async()=>{
 let cancelled=false,count=0;const body=new ReadableStream({pull(c){count++;c.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}});
 await assert.rejects(matchCopy(request,credentials,{fetch:async()=>new Response(body)}),/响应过大/);assert(cancelled);assert(count<=5);
});
