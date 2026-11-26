import {navigation} from '../services/workspace-navigation.cjs';
import {playSparkitStartup} from './spark-startup.js';
import {installDialogMotion,setMotionTrigger,withMotionTrigger,reducedMotion} from './spark-dialog-motion.js';
import {bindFileDrop} from './file-drop.js';
const paths={
 home:'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
 edit:'M4 4h16v16H4zM4 9h16M9 9v11',
 stack:'m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5',
 globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
 find:'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15M16 16l5 5',
 settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 arrow:'M4 12h16m-6-6 6 6-6 6',
 plus:'M12 4v16M4 12h16',
 folder:'M3 6h7l2 3h9v11H3zM3 6V4h7l2 2',
 clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2',
 spark:'m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z',
 key:'M14 5a5 5 0 1 0 5 5 5 5 0 0 0-5-5M10 14l-7 7M5 19l-2-2M8 16l-2-2',
 check:'m5 12 4 4L19 6',
 upload:'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
 eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'
};
const icon=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.spark}"/></svg>`;
const logo='<span class="spark-logo"><img src="assets/logo1.png" alt="ATK"></span>';

function installMotion(){installDialogMotion();}

export function installSparkit({state,toast,importPaths}){
 installMotion();
 const $=id=>document.getElementById(id),make=(tag,cls,html)=>{const el=document.createElement(tag);el.className=cls;if(html)el.innerHTML=html;return el;};
 document.documentElement.dataset.sparkit='true';
 document.querySelector('.rail')?.remove();
 const titlebar=make('div','spark-titlebar',`${logo}<span>灵搭 Sparkit</span><span class="spark-title-separator"></span><small>文案与排版工作台</small>`);
 document.body.prepend(titlebar);
 const rail=make('aside','spark-sidebar',`<button class="spark-brand" data-route="home" aria-label="灵搭首页">${logo}<span><b>灵搭 <em>Sparkit</em></b><small>为灵感搭把手</small></span></button><div class="spark-nav-label">创作空间</div><nav aria-label="主导航"><button data-route="home">${icon('home')}<span>${navigation.home.label}</span></button><section class="spark-language-nav" aria-label="多语言制作"><button type="button" class="spark-language-heading" data-route="editor" data-nav-parent="true" title="进入模板制作">${icon('globe')}<span>${navigation.multilingual.label}</span></button><button data-route="editor"><span>模板制作</span></button><button data-route="batch"><span>批量修改</span></button></section><button data-route="sku">${icon('stack')}<span>多图改字</span></button><button data-route="bulk">${icon('find')}<span>查找与替换</span></button></nav><div class="spark-sidebar-bottom"><button data-route="settings">${icon('settings')}<span>设置与连接</span></button><div class="spark-lab-label"><span></span>正式版 <small>0.3.54</small></div></div>`);
 document.body.append(rail);
 const home=make('section','spark-home',`<header class="spark-home-header"><div><h1>设计工作区</h1><p>为灵感搭把手</p></div><div class="spark-header-tools"><span>PSD / PSB / AI</span><button class="ghost spark-open-project" data-action="open">${icon('folder')}打开项目 <kbd>Ctrl O</kbd></button><button class="primary" data-action="import">${icon('plus')}导入设计稿</button></div></header>
 <div class="spark-desk-grid"><section class="spark-import-surface" aria-label="导入设计稿"><div class="spark-proof-art" aria-hidden="true"><div class="spark-proof-back"></div><div class="spark-proof-type"><span>Sparkit.</span><b>Aa</b><i>为灵感搭把手</i><div></div></div><div class="spark-proof-glass"><img src="assets/logo1.png" alt=""><span>灵搭</span><small>DESIGN IN MOTION</small></div></div><div class="spark-import-top"><h2>从原稿开始</h2><span>原文件保留，修改另存</span></div><button class="spark-drop-target" data-action="import"><span class="spark-document-stack">${icon('folder')}</span><span><b>选择一份设计稿</b><small>支持拖入 PSD、PSB 或 Illustrator 文件</small></span><span class="spark-import-plus">${icon('plus')}</span></button><div class="spark-format-strip"><span><b>PSD / PSB</b>画板与文字图层</span><span><b>Illustrator</b>可编辑文字与排版</span><button data-action="open">打开已保存项目 ${icon('arrow')}</button></div></section>
 <section class="spark-task-list"><div class="spark-section-heading"><h2>制作任务</h2><span>选择工作方式</span></div><button data-route="sku">${icon('stack')}<span><b>多图改字</b><small>一套替换项，处理多份原稿</small></span>${icon('arrow')}</button><button data-route="batch">${icon('globe')}<span><b>批量修改</b><small>多语言制作 · 沿用已确认的绑定与排版</small></span>${icon('arrow')}</button><button data-route="bulk">${icon('find')}<span><b>查找与替换</b><small>试改确认后，同步其他画布</small></span>${icon('arrow')}</button></section>
 <section class="spark-workspace-files"><div class="spark-section-heading"><div><h2>工作区文件</h2><span id="sparkFileCount">尚未导入</span></div><button class="text-button" data-route="editor">进入模板制作 ${icon('arrow')}</button></div><div class="spark-file-columns"><span>设计稿</span><span>内容</span><span>操作</span></div><div id="sparkProjects" class="spark-project-content"></div><div class="spark-sample-row"><button class="spark-sample-preview" data-action="demo" aria-label="打开内置示例"><img src="assets/demo-preview.png" alt="内置护肤详情页示例"></button><div class="spark-sample-info"><span class="spark-sample-badge">内置示例</span><h3>详情页文案替换</h3><p>原稿、5 个文字层和英文文案。<br>完整体验选字、替换与排版。</p><button class="ghost" data-action="demo">打开示例 ${icon('arrow')}</button></div><div class="spark-sample-flow"><div><span>1</span><b>选择文字层</b><small>在画布或图层列表中选择</small></div><div><span>2</span><b>替换文案</b><small>导入文档，确认每一处对应</small></div><div><span>3</span><b>检查与生成</b><small>调整字号排版，再另存副本</small></div></div></div></section>
 <aside class="spark-desk-guide"><h2>操作速查</h2><dl><div><dt>打开项目</dt><dd>Ctrl O</dd></div><div><dt>返回工作区</dt><dd>Ctrl H</dd></div><div><dt>撤销修改</dt><dd>Ctrl Z</dd></div><div><dt>收回窗口</dt><dd>Esc</dd></div></dl><div class="spark-guide-note">${icon('edit')}<h3>按原稿工作</h3><p>文件与图层在左，画布在中间，文案与排版在右。</p><button class="text-button" data-route="editor">打开模板制作 ${icon('arrow')}</button></div><div class="spark-brand-signature">${logo}<span>灵搭 Sparkit<small>ATK 创作工具</small></span></div></aside></div>`);
 home.id='sparkHome';document.body.append(home);
 const assistantCard=make('button','spark-assistant-card',`<span class="spark-assistant-logo" aria-hidden="true"><img src="assets/logo1.png" alt=""><img class="spark-assistant-wordmark" src="assets/logo1.png" alt=""></span><span class="spark-assistant-copy"><b>AI 助手</b><span>添加文件，描述需求，让助手调用软件开始工作。</span></span><svg class="spark-assistant-art" viewBox="0 0 300 150" fill="none" aria-hidden="true"><path d="M20 115C70 15 175 0 268 62M48 139C132 66 202 60 286 104" stroke="currentColor" stroke-dasharray="3 8"/><path d="m152 23 5 15 15 5-15 5-5 15-5-15-15-5 15-5Zm76 64 3 10 10 3-10 3-3 10-3-10-10-3 10-3Z" stroke="currentColor" stroke-width="1.5"/><circle cx="88" cy="85" r="5" stroke="currentColor"/><circle cx="265" cy="34" r="3" fill="currentColor"/></svg><span class="spark-assistant-cta">开始对话 ${icon('arrow')}</span>`);
 assistantCard.type='button';assistantCard.id='sparkHomeAssistant';assistantCard.dataset.action='assistant';assistantCard.dataset.motionSurface='true';
 home.querySelector('.spark-desk-grid').prepend(assistantCard);
 for(const card of home.querySelectorAll('.spark-desk-grid > *')){
 card.classList.add('spark-interactive-card');let frame=0;
 card.addEventListener('pointermove',event=>{
  if(event.pointerType==='touch'||reducedMotion())return;
  const rect=card.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
  cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{card.style.setProperty('--assistant-x',`${x}px`);card.style.setProperty('--assistant-y',`${y}px`);frame=0;});
 });
 card.addEventListener('pointerleave',()=>{cancelAnimationFrame(frame);frame=0;card.style.removeProperty('--assistant-x');card.style.removeProperty('--assistant-y');});
 }
 const importZone=home.querySelector('.spark-import-surface');
 bindFileDrop(importZone,{extensions:['psd','psb','ai'],multiple:true,onPaths:async paths=>{await route('editor');await importPaths(paths);},onError:message=>toast(message,true)});
 const shell=document.querySelector('.shell');
 shell.querySelector('.brand').innerHTML='模板制作 <span>多语言制作 · 选字 · 改字 · 排版</span>';
 openBatch.textContent='批量修改';
 const pill=shell.querySelector('.pill');pill.innerHTML='<i></i>灵搭 Sparkit';
 // Keep the existing updater and its busy/error states reachable from every workspace.
 const checkUpdate=$('checkUpdate');checkUpdate.hidden=false;
 rail.querySelector('.spark-sidebar-bottom').prepend(checkUpdate);
 for(const id of ['openSkuWorkflow','openBulkReplace','openBatch'])$(id).classList.add('spark-header-secondary');
 const empty=$('empty');empty.querySelector('.empty-icon').innerHTML=icon('upload');
 empty.querySelector('h3').textContent='把设计稿拖到这里';
 empty.querySelector('p').textContent='导入 PSD、PSB 或 AI，开始你的下一次创作。';
 for(const [id,name,subtitle] of [['skuWorkflowDialog','多图改字','一套替换项，处理多份设计。'],['batchDialog','批量修改','复用已经确认的绑定与排版。'],['bulkReplaceDialog','查找与替换','先试改一处，再同步其他画布。']]){
  const d=$(id);d.classList.add('spark-workspace-dialog');d.dataset.sparkRoute={skuWorkflowDialog:'sku',batchDialog:'batch',bulkReplaceDialog:'bulk'}[id];
  const h=d.querySelector('h2');h.textContent=name;const p=d.querySelector('header p')||d.querySelector(':scope > p');if(p)p.textContent=subtitle;
 }
 const settings=$('settingsDialog');settings.querySelector('h2').textContent='设置与连接';
 const bulkEmpty=make('dialog','spark-workspace-dialog spark-bulk-empty',`<div class="dialog-top"><h2>查找与替换</h2><button class="ghost" id="sparkBulkEmptyClose">返回</button></div><div class="spark-bulk-empty-content">${icon('find')}<h3>先放进一份设计稿</h3><p>导入 PSD 或 PSB 后，就能查找原文、试改一处，再同步其他画布。</p><button class="primary" id="sparkBulkEmptyImport">导入设计稿 ${icon('arrow')}</button><small>如需同时处理多份原稿，可使用左侧「多图改字」。</small></div>`);
 bulkEmpty.id='sparkBulkEmpty';document.body.append(bulkEmpty);
 $('sparkBulkEmptyClose').onclick=()=>bulkEmpty.close();
 $('sparkBulkEmptyImport').onclick=async()=>{await bulkEmpty.close();route('editor');$('importPsd').click();};
 const appearance=make('section','spark-appearance',`<h3>外观与动态</h3><div><span><b>减少动态效果</b><small>以淡入淡出替代位移和缩放</small></span><label class="spark-switch"><input type="checkbox" id="sparkReduceMotion" aria-label="减少动态效果"><span></span></label></div><p>已为此预览版使用独立配置与缓存。</p>`);
 settings.querySelector('.dialog-top').after(appearance);
 appearance.insertAdjacentHTML('beforeend','<button class="ghost" id="sparkReplayStartup" type="button">重播启动动画</button>');
 $('sparkReplayStartup').onclick=async()=>{await settings.close();window.sparkitStartup=playSparkitStartup();};
 const motion=$('sparkReduceMotion');motion.checked=localStorage.getItem('sparkit-reduce-motion')==='true';
 document.documentElement.classList.toggle('spark-reduce-motion',motion.checked);
 motion.onchange=()=>{localStorage.setItem('sparkit-reduce-motion',String(motion.checked));document.documentElement.classList.toggle('spark-reduce-motion',motion.checked);};
 let current='home',pageAnimation,resizeFrame;let projectKey='';
 function paintNav(route){for(const b of rail.querySelectorAll('[data-route]')){const active=b.dataset.route===route&&b.dataset.navParent!=='true';b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}}
 function refreshProjects(){
  const target=$('sparkProjects'),files=state.files||[];const key=JSON.stringify(files.map(f=>[f.path,f.name,f.layers?.length,f.format]));if(key===projectKey&&target.childElementCount)return;projectKey=key;target.replaceChildren();
  $('sparkFileCount').textContent=files.length?`${files.length} 份设计稿`:'尚未导入设计稿';
  if(!files.length){target.innerHTML=`<div class="spark-files-empty">${icon('folder')}<span>还没有导入设计稿</span><button class="text-button" data-action="import">选择文件</button></div>`;return;}
  for(const file of files){
   const row=make('button','spark-project-row');const title=document.createElement('b');title.textContent=file.name||'设计稿';const sub=document.createElement('small');sub.textContent=`${file.layers?.length||0} 个文字层 · ${file.format||'PSD'}`;row.innerHTML=icon('edit');const text=document.createElement('span');text.append(title,sub);row.append(text);row.insertAdjacentHTML('beforeend',icon('arrow'));row.onclick=()=>route('editor');target.append(row);
  }
 }
 function route(destination,source){
  setMotionTrigger(source||document.querySelector('.spark-sidebar [data-route="'+destination+'"]'));
  if(destination==='advanced-review'){$('openAdvancedAudit')?.click();return;}
  if(destination==='settings'){$('settings').dispatchEvent(new Event('click'));return;}
  if(['sku','batch','bulk'].includes(destination)){
   if(destination==='bulk'&&!state.files.some(f=>!f.demo&&/\.(psd|psb)$/i.test(f.path))){bulkEmpty.showModal();paintNav('bulk');return;}
   const opener=$({sku:'openSkuWorkflow',batch:'openBatch',bulk:'openBulkReplace'}[destination]);opener.dispatchEvent(new Event('click'));
   const dialog=$({sku:'skuWorkflowDialog',batch:'batchDialog',bulk:'bulkReplaceDialog'}[destination]);if(dialog.open)paintNav(destination);return;
  }
  if(current===destination)return Promise.resolve();
  pageAnimation?.cancel();cancelAnimationFrame(resizeFrame);home.style.willChange='';shell.style.willChange='';
  const backwards=destination==='home';current=destination;paintNav(destination);
  home.hidden=!backwards;shell.hidden=backwards;document.body.dataset.sparkRoute=destination;
  if(backwards)refreshProjects();
  const target=backwards?home:shell;target.style.willChange='transform,opacity';
  pageAnimation=target.animate(reducedMotion()?[{opacity:.65},{opacity:1}]:[{opacity:.7,transform:`translateX(${backwards?-22:22}px)`},{opacity:1,transform:'none'}],{duration:reducedMotion()?90:180,easing:'cubic-bezier(.2,.8,.2,1)'});
  const a=pageAnimation;a.finished.then(()=>{if(pageAnimation===a)target.style.willChange='';}).catch(()=>{});
  if(!backwards)resizeFrame=requestAnimationFrame(()=>{if(current==='editor')window.dispatchEvent(new Event('resize'));});
  return Promise.resolve();
 }
 document.addEventListener('click',async event=>{
  const nav=event.target.closest('[data-route]');if(nav){route(nav.dataset.route,nav);return;}
  const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;
  if(action==='demo'){await route('editor');$('loadDemo').click();}
  else if(action==='import'){await route('editor');$('importPsd').click();}
  else if(action==='open'){await route('editor');$('openProject').click();}
  else if(action==='assistant'){withMotionTrigger(assistantCard,()=>$('openAgentSidebar').click());}
 });
 for(const d of document.querySelectorAll('dialog'))d.addEventListener('close',()=>paintNav(current));
 document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!document.querySelector('dialog[open]')){if(e.key.toLowerCase()==='h'&&!(window.desktop?.platform==='darwin'&&e.metaKey)){e.preventDefault();route('home');}if(e.key.toLowerCase()==='o'){e.preventDefault();route('editor');$('openProject').click();}}});
 shell.hidden=true;home.hidden=false;document.body.dataset.sparkRoute='home';refreshProjects();paintNav('home');
 // Expose only navigation for UI verification, never document mutation or IPC.
 window.sparkitNavigate=route;
 window.sparkitReplayStartup=options=>playSparkitStartup(options);
 if(!window.sparkitBoot?.failed)window.sparkitStartup=playSparkitStartup();
}
