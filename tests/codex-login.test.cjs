const test=require('node:test'),assert=require('node:assert/strict');
const {CodexLogin}=require('../services/codex-login.cjs');
function fixture(reply){const calls=[],opened=[];let event;const app={closed:false,initialize:async()=>{},request:async(method,args)=>{calls.push({method,args});return reply(method,args);},close(){this.closed=true;}};const service=new CodexLogin({credentials:async()=>({executable:'/app/codex'}),env:()=>({}),open:async url=>opened.push(url),createSession:opts=>{event=opts.onEvent;return app;}});return {service,app,calls,opened,event:(...v)=>event(...v)};}
test('Codex login opens only official HTTPS auth and keeps the callback session alive',async t=>{
 const f=fixture(()=>({authUrl:'https://auth.openai.com/oauth/authorize?state=fixture',loginId:'id'}));t.after(()=>f.service.close());
 assert.deepEqual(await f.service.start(),{pending:true});assert.equal(f.opened.length,1);assert.equal(f.app.closed,false);
 await assert.rejects(f.service.start(),/正在进行/);f.event('account/login/completed',{success:true});assert.equal(f.app.closed,true);
});
test('Codex login rejects alternate hosts, embedded credentials and non-HTTPS URLs',async()=>{
 for(const authUrl of ['http://auth.openai.com/a','https://auth.openai.com.evil.invalid/a','https://user:secret@auth.openai.com/a','file:///tmp/login']){const f=fixture(()=>({authUrl,loginId:'id'}));await assert.rejects(f.service.start());assert.equal(f.opened.length,0);assert.equal(f.app.closed,true);}
});
test('login status exposes no account credentials and cancellation targets only its own login',async()=>{
 const f=fixture(method=>method==='account/read'?{account:{type:'chatgpt',accessToken:'must-not-return'}}:{authUrl:'https://auth.openai.com/oauth/authorize',loginId:'only-this'});
 assert.deepEqual(await f.service.status(),{signedIn:true,accountType:'chatgpt',pending:false});
 await f.service.start();await f.service.cancel();assert.deepEqual(f.calls.at(-1),{method:'account/login/cancel',args:{loginId:'only-this'}});
});
