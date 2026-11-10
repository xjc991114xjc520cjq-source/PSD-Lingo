// Electron resolves the user's existing system/PAC proxy. Native Codex does not
// inherit Electron's network stack, so supply the selected route to this child
// only. An explicit CLI proxy always takes precedence; global settings stay intact.
function selectedProxy(value){
 if(typeof value!=='string')return null;
 for(const route of value.split(';')){
  const item=route.trim();if(/^DIRECT$/i.test(item))return null;
  const match=/^(PROXY|HTTPS|SOCKS5)\s+(\S+)$/i.exec(item);if(!match)continue;
  const protocol={PROXY:'http:',HTTPS:'https:',SOCKS5:'socks5:'}[match[1].toUpperCase()];
  try{const url=new URL(protocol+'//'+match[2]);if(!url.hostname||!/:\d{1,5}$/.test(match[2])||url.username||url.password||!['','/'].includes(url.pathname)||url.search||url.hash)continue;return url.origin==='null'?protocol+'//'+url.host:url.origin;}catch{}
 }
 return null;
}
async function withLocalCodexProxy(env,resolveProxy,targetUrl='https://chatgpt.com'){
 const result=Object.fromEntries(Object.entries(env||{}).filter(([,value])=>value!==undefined));
 if(Object.entries(result).some(([key,value])=>/^(?:https?|all)_proxy$/i.test(key)&&String(value).trim()))return result;
 if(typeof resolveProxy!=='function')return result;
 let proxy;try{proxy=selectedProxy(await resolveProxy(targetUrl));}catch{return result;}
 if(proxy){result.HTTP_PROXY=proxy;result.HTTPS_PROXY=proxy;}
 return result;
}
module.exports={withLocalCodexProxy,selectedProxy};
