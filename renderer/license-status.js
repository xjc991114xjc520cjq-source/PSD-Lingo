// Authorization validity and the short offline lease are deliberately separate.
export function timestamp(value){
 if(value===null||value===undefined||value==='')return null;
 const n=typeof value==='number'||/^\d+(?:\.\d+)?$/.test(String(value))?Number(value):Date.parse(value);
 const ms=typeof value==='number'||/^\d+(?:\.\d+)?$/.test(String(value))?(n<1e11?n*1000:n):n;
 return Number.isFinite(ms)&&Math.abs(ms)<=8640000000000000?ms:null;
}
export function formatRemaining(seconds){
 if(!Number.isFinite(seconds))return '未提供';
 if(seconds<=0)return '已到期';const n=Math.ceil(seconds);
 const days=Math.floor(n/86400),hours=Math.floor(n%86400/3600),minutes=Math.floor(n%3600/60),s=n%60;
 return days?`${days} 天 ${hours} 小时 ${minutes} 分 ${s} 秒`:hours?`${hours} 小时 ${minutes} 分 ${s} 秒`:minutes?`${minutes} 分 ${s} 秒`:`${s} 秒`;
}
// Count complete calendar years, clamping leap-day anniversaries to February 28.
// Remaining days come from the real interval after that anniversary, never years * 365.
export function formatCalendarRemaining(startMs,endMs){
 if(!Number.isFinite(startMs)||!Number.isFinite(endMs))return '未提供';
 if(endMs<=startMs)return '已到期';
 const start=new Date(startMs),end=new Date(endMs);
 function anniversary(years){const year=start.getUTCFullYear()+years,month=start.getUTCMonth(),last=new Date(Date.UTC(year,month+1,0)).getUTCDate(),date=new Date(startMs);date.setUTCFullYear(year,month,Math.min(start.getUTCDate(),last));return date.getTime();}
 let years=end.getUTCFullYear()-start.getUTCFullYear();if(years>0&&anniversary(years)>endMs)years--;
 if(years<1)return formatRemaining((endMs-startMs)/1000);
 const n=Math.ceil((endMs-anniversary(years))/1000),days=Math.floor(n/86400),hours=Math.floor(n%86400/3600),minutes=Math.floor(n%3600/60),seconds=n%60;
 return `${years} 年 ${days} 天 ${hours} 小时 ${minutes} 分 ${seconds} 秒`;
}
export function authorizationView(a={},elapsedMs=0){
 if(!a.enabled)return {label:'本地测试',kind:'local',type:'本地测试（未启用授权服务）',start:null,end:null,remaining:'不适用',lease:'不适用',message:'此版本未连接授权服务，没有授权期限。'};
 const leaseRemaining=Math.max(0,(Number.isFinite(a.remainingMilliseconds)?a.remainingMilliseconds/1000:Number(a.remainingSeconds||0))-elapsedMs/1000),active=!!a.active&&leaseRemaining>0;
 const server=timestamp(a.serverNowUtc),end=timestamp(a.licenseExpiresAtUtc),permanent=a.licensePermanent===true;
 const remaining=permanent?'永久有效':end!==null&&server!==null?formatCalendarRemaining(server+elapsedMs,end):'服务端未提供';
 return {label:active?'授权有效':a.code==='license_expired'?'授权到期':'需要授权',kind:active?'active':'inactive',type:({free:'免费许可',standard:'标准许可',trial:'试用许可',permanent:'永久许可'})[a.licenseType]||'服务端未提供',start:timestamp(a.licenseStartsAtUtc),end,remaining,lease:formatRemaining(leaseRemaining),message:!active&&a.active?'离线凭证已到期，请刷新授权。':a.message||'请输入许可证激活。',permanent};
}
export function installLicenseStatus({$,openSettings=()=>{}}){
 const button=document.createElement('button');button.id='licenseStatusButton';button.className='license-status-button';button.type='button';button.textContent='读取授权…';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','licenseStatusPopover');$('openBatch').after(button);
 const panel=document.createElement('section');panel.id='licenseStatusPopover';panel.className='license-status-popover';panel.hidden=true;panel.setAttribute('aria-label','授权详情');
 const title=document.createElement('div');title.className='license-status-title';const heading=document.createElement('h2');heading.textContent='授权详情';const close=document.createElement('button');close.type='button';close.className='ghost';close.textContent='收起';close.setAttribute('aria-label','收起授权详情');title.append(heading,close);panel.append(title);
 const rows={};for(const [key,label] of [['type','授权类型'],['start','授权开始'],['end','授权到期'],['remaining','授权剩余'],['lease','离线凭证剩余']]){const row=document.createElement('div');row.className='license-status-row';const name=document.createElement('span'),value=document.createElement('strong');name.textContent=label;row.append(name,value);panel.append(row);rows[key]=value;}
 const note=document.createElement('p');note.className='hint';const clock=document.createElement('p');clock.className='hint';clock.textContent='日期按本机时区显示；倒计时依据服务端时间。离线凭证不是授权有效期。';const manage=document.createElement('button');manage.type='button';manage.className='ghost wide';manage.textContent='管理／刷新授权';panel.append(note,clock,manage);document.body.append(panel);
 let state={},received=performance.now();const fmt=n=>n===null?'服务端未提供':new Date(n).toLocaleString('zh-CN',{hour12:false});
 function paint(){const v=authorizationView(state,Math.max(0,performance.now()-received));button.textContent=v.label;button.dataset.status=v.kind;button.title='查看授权类型、有效期和剩余时间';rows.type.textContent=v.type;rows.start.textContent=v.kind==='local'?'不适用':fmt(v.start);rows.end.textContent=v.kind==='local'?'不适用':v.permanent?'永久有效':fmt(v.end);rows.remaining.textContent=v.remaining;rows.lease.textContent=v.lease;note.textContent=v.message;}
 function position(){const r=button.getBoundingClientRect();panel.style.left=Math.max(12,Math.min(r.left,window.innerWidth-panel.offsetWidth-12))+'px';panel.style.top=Math.min(r.bottom+8,Math.max(12,window.innerHeight-panel.offsetHeight-12))+'px';}
 function setOpen(open){panel.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open){paint();position();}else if(panel.contains(document.activeElement))button.focus();}
 button.onclick=()=>setOpen(panel.hidden);close.onclick=()=>setOpen(false);manage.onclick=()=>{setOpen(false);openSettings();};
 document.addEventListener('pointerdown',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!button.contains(e.target))setOpen(false);});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.stopPropagation();setOpen(false);}});window.addEventListener('resize',()=>{if(!panel.hidden)position();});
 const timer=setInterval(paint,1000);window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
 return {update(a){state=a||{};received=performance.now();paint();},button,panel};
}
