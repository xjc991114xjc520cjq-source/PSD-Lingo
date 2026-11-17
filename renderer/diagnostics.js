export function installDiagnostics({document:doc=document,desktop=window.desktop}={}){
 if(!desktop?.diagnosticStatus)return;
 const records=doc.getElementById('openWorkRecords');if(!records)return;
 const entry=doc.createElement('button');entry.type='button';entry.id='openDiagnostics';entry.setAttribute('aria-haspopup','dialog');entry.setAttribute('aria-controls','diagnosticsDialog');entry.setAttribute('aria-expanded','false');entry.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5m0 3v1"/></svg><span>错误上报</span>';records.after(entry);
 const dialog=doc.createElement('dialog');dialog.id='diagnosticsDialog';dialog.setAttribute('aria-labelledby','diagnosticsTitle');dialog.innerHTML='<div class="dialog-top"><h2 id="diagnosticsTitle">错误上报</h2><button class="ghost" type="button" data-diagnostic-close>关闭</button></div>';
 const panel=doc.createElement('div');panel.className='diagnostics-panel';panel.innerHTML='<p class="hint">遇到问题时，把错误编号和当时的操作发给我们，便于定位这台电脑上的错误。</p><p class="diagnostics-status" role="status" aria-live="polite"></p><dl><dt>最近错误编号</dt><dd class="diagnostics-id">暂无错误记录</dd></dl><div class="editor-buttons"><button class="ghost" type="button" data-diagnostic-copy>复制错误编号</button><button class="ghost" type="button" data-diagnostic-sync>立即同步</button></div><p class="hint">错误摘要自动上传，断网时先保存在本机。源文件、图片、提示词和登录凭据不上传。</p>';
 dialog.append(panel);doc.body.append(dialog);const status=panel.querySelector('.diagnostics-status'),id=panel.querySelector('.diagnostics-id'),copy=panel.querySelector('[data-diagnostic-copy]'),sync=panel.querySelector('[data-diagnostic-sync]');
 const paint=value=>{status.textContent=(value.pending?`${value.pending} 条待上传；`:'')+value.lastStatus+'。'+value.message;id.textContent=value.lastId||'暂无错误记录';copy.disabled=!value.lastId;};
 const load=()=>desktop.diagnosticStatus().then(r=>{if(r.ok)paint(r.value);}).catch(()=>{status.textContent='暂时无法读取诊断状态，制作功能仍可使用。';});
 entry.onclick=()=>{if(!dialog.open)dialog.showModal();entry.classList.add('active');entry.setAttribute('aria-expanded','true');void load();};dialog.querySelector('[data-diagnostic-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{entry.classList.remove('active');entry.setAttribute('aria-expanded','false');entry.focus();});desktop.onDiagnosticStatus?.(paint);void load();
 copy.onclick=async()=>{const r=await desktop.diagnosticCopy();status.textContent=r.ok?'已复制错误编号，反馈问题时提供此编号即可。':r.error;};
 sync.onclick=async()=>{sync.disabled=true;sync.textContent='正在同步…';try{const r=await desktop.diagnosticFlush();if(r.ok)paint(r.value);else status.textContent=r.error;}catch{status.textContent='同步暂未完成，记录仍在本机。';}finally{sync.disabled=false;sync.textContent='立即同步';}};
 const report=(operation,error)=>void desktop.reportDiagnostic?.({operation,message:error?.message||String(error),stack:error?.stack||'',code:error?.code||''}).catch(()=>{});
 window.addEventListener('error',event=>report('uncaught-renderer',event.error||Error(event.message)));
 window.addEventListener('unhandledrejection',event=>report('unhandled-promise',event.reason));
 return {entry,dialog,panel,paint,load};
}
