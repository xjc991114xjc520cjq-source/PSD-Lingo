const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalizeApiBaseUrl,normalizeApiProtocol,apiUrl,authenticationError}=require('../services/api-endpoint.cjs');
test('API base defaults and custom version prefixes normalize without changing provider',()=>{
 assert.equal(normalizeApiBaseUrl(), 'https://api.openai.com/v1');assert.equal(normalizeApiBaseUrl('https://example.invalid/'),'https://example.invalid/v1');
 assert.equal(apiUrl('https://example.invalid/api/v1/','models'),'https://example.invalid/api/v1/models');
 assert.equal(apiUrl('http://localhost:8000/v1','responses'),'http://localhost:8000/v1/responses');assert.equal(normalizeApiBaseUrl('http://[::1]:8000'),'http://[::1]:8000/v1');
});
test('API address refuses unsafe schemes, credentials, query strings and control characters',()=>{
 for(const input of ['http://example.invalid/v1','https://user:secret@example.invalid/v1','https://example.invalid?token=secret','https://example.invalid#secret','ftp://example.invalid','https://example.invalid/\napi',null,42])assert.throws(()=>normalizeApiBaseUrl(input),/API 地址/);
});
test('API protocols migrate to auto and authentication errors identify only safe host',()=>{
 assert.equal(normalizeApiProtocol(),'auto');for(const value of ['auto','responses','chat-completions'])assert.equal(normalizeApiProtocol(value),value);assert.throws(()=>normalizeApiProtocol('other'));
 assert.match(authenticationError(401,'https://example.invalid/private-path'),/401，example.invalid/);assert.doesNotMatch(authenticationError(403,'https://example.invalid/private-path'),/private-path/);
});
test('pasted complete versioned endpoint becomes a shared base without stripping arbitrary paths',()=>{
 for(const suffix of ['chat/completions','responses','models']){
  assert.equal(normalizeApiBaseUrl('https://provider.invalid/v1/'+suffix+'/'),'https://provider.invalid/v1');
  assert.equal(apiUrl('https://provider.invalid/api/v1/'+suffix,'models'),'https://provider.invalid/api/v1/models');
 }
 assert.equal(normalizeApiBaseUrl('https://provider.invalid/custom/models'),'https://provider.invalid/custom/models');
});
