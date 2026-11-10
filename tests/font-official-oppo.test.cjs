const test=require('node:test'),assert=require('node:assert/strict');
const {allowedUrl,download}=require('../services/font-repair.cjs');
test('current official OPPO package is constrained to its exact URL and uses the official referer',async()=>{
 const url='https://coloros-website-cn.allawnfs.com/font/OPPOSans3.0.zip';assert.equal(allowedUrl(url),true);
 for(const candidate of [url+'?redirect=other',url.replace('OPPOSans3.0.zip','other.zip'),url.replace('https:','http:')])assert.equal(allowedUrl(candidate),false);
 let captured;const bytes=await download(url,{fetch:async(u,options)=>{captured={u,options};return new Response(Buffer.from('font-package'));}});
 assert.equal(captured.u,url);assert.equal(captured.options.headers.Referer,'https://www.coloros.com/');assert.equal(bytes.toString(),'font-package');
 await assert.rejects(download(url,{fetch:async()=>new Response(null,{status:302,headers:{location:'https://example.com/font.zip'}})}),/官方/);
});
