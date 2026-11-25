export function installCodexLogin({$,call}){
 if(window.desktop?.platform!=='darwin')return;
 const panel=document.createElement('div');panel.className='editor-buttons';
 const note=document.createElement('p');note.className='hint';note.setAttribute('role','status');note.textContent='Mac 已内置 Codex。首次请登录你的账号；内置助手会话保存在 Sparkit 工作记录中。';
 const buttons=['登录 Codex','检查登录','取消登录'].map(text=>{const b=document.createElement('button');b.type='button';b.className='ghost';b.textContent=text;panel.append(b);return b;});
 buttons.forEach((b,i)=>b.id=['loginCodex','checkCodexLogin','cancelCodexLogin'][i]);
 $('codexDiscoveryState').after(panel,note);
 const label=$('codexPath').closest('.path-picker')?.previousElementSibling;if(label)label.textContent='Codex 程序位置（Mac 已内置，可另选）';
 async function run(action){buttons.forEach(b=>b.disabled=true);try{await action();}catch(e){note.textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}}
 buttons[0].onclick=()=>run(async()=>{if($('codexPath').value)await call('saveCodexSettings',{executable:$('codexPath').value});await call('codexLoginStart');note.textContent='请在刚打开的浏览器中完成 Codex 账号登录，然后点击“检查登录”。';});
 buttons[1].onclick=()=>run(async()=>{const r=await call('codexLoginStatus');note.textContent=r.signedIn?'Codex 已登录，可以使用 AI 工作助手。':r.pending?'浏览器登录尚未完成。':'Codex 尚未登录，请点击“登录 Codex”。';});
 buttons[2].onclick=()=>run(async()=>{await call('codexLoginCancel');note.textContent='已取消本次登录；已有账号登录保持原状态。';});
}
