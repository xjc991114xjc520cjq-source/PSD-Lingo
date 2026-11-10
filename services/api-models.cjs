const {apiUrl,apiHost,normalizeApiBaseUrl,authenticationError}=require('./api-endpoint.cjs');
const MODELS_URL=apiUrl(undefined,'models');
const MAX_BYTES=2*1024*1024;
const FORMAT_ERROR='API 返回的模型列表格式无效，请稍后刷新。';
function validateKey(value){
  if(typeof value!=='string'||value.length>8192||/[\r\n\0]/.test(value))throw new Error('API Key 格式无效，请重新填写。');
  return value.trim();
}
async function resolveConnection(input,settings){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('模型列表请求无效。');
  const entered=input.apiKey===undefined?'':validateKey(input.apiKey);
  if(entered&&input.apiBaseUrl!==undefined)return {apiKey:entered,apiBaseUrl:normalizeApiBaseUrl(input.apiBaseUrl)};
  // Reading the key is independent of the saved provider mode and model selection.
  await settings?.pending;
  const saved=settings?await settings.read():{},key=entered||validateKey(saved.apiKey||'');
  if(!key)throw new Error('请先填写 API Key，再获取可用模型；也可使用本机已保存的 API Key。');
  return {apiKey:key,apiBaseUrl:normalizeApiBaseUrl(input.apiBaseUrl===undefined?saved.apiBaseUrl:input.apiBaseUrl)};
}
async function boundedJson(response,signal){
  const declared=response.headers?.get('content-length');
  if(declared&&Number(declared)>MAX_BYTES)throw new Error(FORMAT_ERROR);
  if(!response.body?.getReader)throw new Error(FORMAT_ERROR);
  const reader=response.body.getReader(),chunks=[];let size=0;
  const abort=()=>{reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',abort,{once:true});
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES)throw new Error(FORMAT_ERROR);chunks.push(Buffer.from(value));}
    try{return JSON.parse(Buffer.concat(chunks,size).toString('utf8'));}catch{throw new Error(FORMAT_ERROR);}
  }finally{signal.removeEventListener('abort',abort);reader.cancel().catch(()=>{});reader.releaseLock();}
}
function modelIds(value){
  if(!value||(value.object!==undefined&&value.object!=='list')||!Array.isArray(value.data)||value.data.length>10000)throw new Error(FORMAT_ERROR);
  const ids=[];
  for(const item of value.data){
    if(!item||(item.object!==undefined&&item.object!=='model')||typeof item.id!=='string'||!item.id.trim()||item.id.length>200||/[\x00-\x1f\x7f-\x9f]/.test(item.id))throw new Error(FORMAT_ERROR);
    ids.push(item.id.trim());
  }
  return [...new Set(ids)].sort();
}
async function listApiModels(input={}, {settings,fetch=globalThis.fetch,timeoutMs=20000}={}){
  const {apiKey,apiBaseUrl}=await resolveConnection(input,settings),controller=new AbortController();let timer;
  const timedOut=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('获取模型列表超时，请检查网络后点击“刷新模型”。'));},timeoutMs);});
  const request=(async()=>{
    let response;
    try{response=await fetch(apiUrl(apiBaseUrl,'models'),{method:'GET',headers:{Authorization:'Bearer '+apiKey,Accept:'application/json'},redirect:'error',signal:controller.signal});}
    catch{throw new Error('无法连接 API（'+apiHost(apiBaseUrl)+'），请检查地址和网络后点击“刷新模型”。');}
    if(!response.ok){
      response.body?.cancel().catch(()=>{});
      if(response.status===401||response.status===403)throw new Error(authenticationError(response.status,apiBaseUrl));
      if(response.status===429)throw new Error('获取模型列表过于频繁或 API 配额不足，请稍后刷新。');
      throw new Error('获取模型列表失败，请稍后刷新。');
    }
    let value;try{value=await boundedJson(response,controller.signal);}catch{throw new Error(FORMAT_ERROR);}
    return {models:modelIds(value)};
  })();
  try{return await Promise.race([request,timedOut]);}finally{clearTimeout(timer);controller.abort();}
}
module.exports={listApiModels,modelIds,MODELS_URL,MAX_BYTES};
