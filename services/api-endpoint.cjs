const DEFAULT_API_BASE_URL='https://api.openai.com/v1';
function normalizeApiBaseUrl(value){
 if(value===undefined||value==='')return DEFAULT_API_BASE_URL;
 if(typeof value!=='string'||value.length>2048||/[\x00-\x20\x7f]/.test(value))throw new Error('API 地址无效，请填写完整 HTTPS 地址（例如 https://api.openai.com/v1）。');
 let url;try{url=new URL(value);}catch{throw new Error('API 地址无效，请填写完整 HTTPS 地址。');}
 const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if((url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))||url.username||url.password||url.search||url.hash)throw new Error('API 地址仅支持 HTTPS（本机 localhost 可用 HTTP），且不能包含账号、密码、查询参数或片段。');
 let pathname=url.pathname.replace(/\/+$/,'');if(!pathname)pathname='/v1';
 // Providers often publish a full request URL instead of the shared API root.
 pathname=pathname.replace(/(\/v1)\/(?:chat\/completions|responses|models)$/,'$1');
 return url.origin+pathname;
}
function normalizeApiProtocol(value){
 const protocol=value===undefined?'auto':value;
 if(!['auto','responses','chat-completions'].includes(protocol))throw new Error('API 协议无效，请选择自动、Responses 或 Chat Completions。');
 return protocol;
}
function apiUrl(base,path){return normalizeApiBaseUrl(base)+'/'+path;}
function apiHost(base){return new URL(normalizeApiBaseUrl(base)).host;}
function authenticationError(status,base){
 const host=apiHost(base);
 return status===401?'API 认证失败（401，'+host+'）：请核对 API 地址与 Key 是否来自同一服务商，并检查 Key 是否有效。':'API 拒绝访问（403，'+host+'）：请检查服务商账号、Key 的模型权限及访问限制。';
}
module.exports={DEFAULT_API_BASE_URL,normalizeApiBaseUrl,normalizeApiProtocol,apiUrl,apiHost,authenticationError};
