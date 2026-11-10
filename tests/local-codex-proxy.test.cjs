const {test}=require('node:test'),assert=require('node:assert/strict');
const {withLocalCodexProxy,selectedProxy}=require('../services/local-codex-proxy.cjs');
test('local child inherits system proxy without changing source environment or NO_PROXY',async()=>{
 const env={Path:'C:/bin',NO_PROXY:'localhost,127.0.0.1',CODEX_HOME:'C:/user/.codex'};let target;
 const actual=await withLocalCodexProxy(env,async url=>{target=url;return 'PROXY 127.0.0.1:7897; DIRECT';});
 assert.equal(target,'https://chatgpt.com');assert.equal(actual.HTTP_PROXY,'http://127.0.0.1:7897');assert.equal(actual.HTTPS_PROXY,actual.HTTP_PROXY);assert.equal(actual.NO_PROXY,env.NO_PROXY);assert.equal(actual.CODEX_HOME,env.CODEX_HOME);assert.equal(env.HTTP_PROXY,undefined);
});
test('explicit CLI proxies in any casing take precedence and do not query the system',async()=>{
 for(const key of ['HTTP_PROXY','https_proxy','All_Proxy']){
  const env={[key]:'http://own-proxy.invalid:8000',no_proxy:'internal.invalid'};
  assert.deepEqual(await withLocalCodexProxy(env,()=>{throw Error('must not resolve');}),env);
 }
});
test('system routes support HTTPS and SOCKS5; DIRECT retains direct routing',()=>{
 assert.equal(selectedProxy('HTTPS proxy.invalid:8443; DIRECT'),'https://proxy.invalid:8443');
 assert.equal(selectedProxy('SOCKS5 [::1]:1080'),'socks5://[::1]:1080');
 assert.equal(selectedProxy('DIRECT; PROXY 127.0.0.1:7897'),null);
 assert.equal(selectedProxy('PROXY name:password@proxy.invalid:8000'),null);
 assert.equal(selectedProxy('PROXY proxy.invalid:8000/path'),null);
 assert.equal(selectedProxy('invalid'),null);
});
test('direct, missing and failed proxy resolution preserve local operation',async()=>{
 const env={NO_PROXY:'local'};
 assert.deepEqual(await withLocalCodexProxy(env,async()=> 'DIRECT'),env);
 assert.deepEqual(await withLocalCodexProxy(env,async()=> {throw Error('PAC unavailable');}),env);
 assert.deepEqual(await withLocalCodexProxy(env),env);
});
