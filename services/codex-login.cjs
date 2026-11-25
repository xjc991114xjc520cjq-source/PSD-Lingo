const {CodexAppSession}=require('./codex-app-session.cjs');
class CodexLogin{
 constructor({credentials,open,env=()=>process.env,createSession=options=>new CodexAppSession(options)}){Object.assign(this,{credentials,open,env,createSession});}
 async connect(onEvent=()=>{}){const c=await this.credentials();const app=this.createSession({executable:c.executable,env:await this.env(),onEvent});try{await app.initialize();return app;}catch(e){app.close();throw e;}}
 async status(){const app=await this.connect();try{const r=await app.request('account/read',{refreshToken:false});return {signedIn:!!r.account,accountType:r.account?.type||null,pending:!!this.active};}finally{app.close();}}
 async start(){if(this.starting||this.active)throw Error('Codex 登录正在进行，请完成浏览器登录或先取消');this.starting=true;let app;
  try{app=await this.connect((method)=>{if(method==='account/login/completed'||method==='transport/closed')this.close();});
   const r=await app.request('account/login/start',{type:'chatgpt'}),url=new URL(r.authUrl);
   if(url.protocol!=='https:'||url.username||url.password||!['auth.openai.com','auth0.openai.com','chatgpt.com'].includes(url.hostname)||typeof r.loginId!=='string')throw Error('Codex 返回了无效登录地址');
   this.active={app,id:r.loginId};this.timer=setTimeout(()=>this.cancel().catch(()=>{}),10*60*1000);this.timer.unref?.();await this.open(url.href);return {pending:true};
  }catch(e){app?.close();this.close();throw e;}finally{this.starting=false;}
 }
 async cancel(){const active=this.active;try{if(active)await active.app.request('account/login/cancel',{loginId:active.id});}finally{this.close();}return {pending:false};}
 close(){clearTimeout(this.timer);const active=this.active;this.active=null;active?.app.close();}
}
module.exports={CodexLogin};
