export function installDiagnostics({document:doc=document,desktop=window.desktop}={}){
 if(!desktop?.diagnosticStatus)return;
 const settings=doc.getElementById('settingsDialog');if(!settings)return;
 const panel=doc.createElement('details');panel.className='settings-more diagnostics-panel';panel.innerHTML='<summary>错误上报与排查编号</summary><p class="hint">错误摘要会自动上传，用于跨设备排查。源文件、图片、提示词和登录凭据不上传；断网时先保存在本机。</p><p class="diagnostics-status" role="status" aria-live="polite"></p><dl><dt>最近错误编号</dt><dd class="diagnostics-id">暂无错误记录</dd></dl><div class="editor-buttons"><button class="ghost" type="button" data-diagnostic-copy>复制错误编号</button><button class="ghost" type="button" data-diagnostic-sync>立即同步</button></div>';
 settings.querySelector('.settings-more')?.before(panel);const status=panel.querySelector('.diagnostics-status'),id=panel.querySelector('.diagnostics-id'),copy=panel.querySelector('[data-diagnostic-copy]'),sync=panel.querySelector('[data-diagnostic-sync]');
 const paint=value=>{status.textContent=(value.pending?`${value.pending} 条待上传；`:'')+value.lastStatus+'。'+value.message;id.textContent=value.lastId||'暂无错误记录';copy.disabled=!value.lastId;};
 const load=()=>desktop.diagnosticStatus().then(r=>{if(r.ok)paint(r.value);}).catch(()=>{status.textContent='暂时无法读取诊断状态，制作功能仍可使用。';});
 panel.addEventListener('toggle',()=>{if(panel.open)void load();});desktop.onDiagnosticStatus?.(paint);void load();
 copy.onclick=async()=>{const r=await desktop.diagnosticCopy();status.textContent=r.ok?'已复制错误编号，反馈问题时提供此编号即可。':r.error;};
 sync.onclick=async()=>{sync.disabled=true;sync.textContent='正在同步…';try{const r=await desktop.diagnosticFlush();if(r.ok)paint(r.value);else status.textContent=r.error;}catch{status.textContent='同步暂未完成，记录仍在本机。';}finally{sync.disabled=false;sync.textContent='立即同步';}};
 const report=(operation,error)=>void desktop.reportDiagnostic?.({operation,message:error?.message||String(error),stack:error?.stack||'',code:error?.code||''}).catch(()=>{});
 window.addEventListener('error',event=>report('uncaught-renderer',event.error||Error(event.message)));
 window.addEventListener('unhandledrejection',event=>report('unhandled-promise',event.reason));
 return {panel,paint,load};
}
