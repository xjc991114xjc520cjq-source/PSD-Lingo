export function installWorkflow({$,state,file,layer,selectFile,selectedLayer}){
 const make=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n;};
 const content=document.querySelector('.binding-content'),panel=document.querySelector('.binding-panel');
 const binding=make('div','binding-step'),layout=make('div','layout-step');binding.id='bindingStep';layout.id='layoutStep';
 const children=[...content.children];let editing=false;for(const n of children){if(n.classList.contains('divider'))editing=true;(editing?layout:binding).append(n);}content.append(binding,layout);
 const context=make('div','inspector-context'),heading=make('div','inspector-selection-heading'),name=make('b','','尚未选择文字层');name.id='inspectorLayerName';
 heading.append(name,make('span','muted','原文字'));context.append(heading,$('originalText'),$('bindingState'));binding.querySelector('.field-label')?.remove();
 const skip=$('skipLayer').closest('label');skip.classList.add('skip-current');context.append(skip);
 const tabs=document.querySelector('.binding-tabs');tabs.before(context);panel.querySelector('.panel-title h2').textContent='文字与排版';panel.querySelector('.panel-title .tag').textContent='当前文字层';
 $('bindingTab').textContent='替换文案';$('layoutTab').textContent='文字排版';
 for(const [id,section] of [['bindingTab',binding],['layoutTab',layout]]){$(id).setAttribute('aria-controls',section.id);section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby',id);}
 function tab(mode,{focus=false}={}){if(mode==='layout'&&!layer()?.recordId)mode='binding';const adjust=mode==='layout';binding.hidden=adjust;layout.hidden=!adjust;panel.dataset.mode=mode;for(const [id,active] of [['bindingTab',!adjust],['layoutTab',adjust]]){$(id).setAttribute('aria-selected',String(active));$(id).tabIndex=active?0:-1;}if(focus)$(adjust?'layoutTab':'bindingTab').focus();}
 $('bindingTab').onclick=()=>tab('binding');$('layoutTab').onclick=()=>tab('layout');
 tabs.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const adjust=e.key==='End'||(e.key!=='Home'&&panel.dataset.mode!=='layout');tab(adjust?'layout':'binding',{focus:true});};
 function fold(element,title,open=false){const d=make('details','option-group');d.open=open;d.append(make('summary','',title));element.before(d);d.append(element);return d;}
 const docTools=make('div','document-tools'),docSource=document.querySelector('.doc-source'),splitControls=document.querySelector('.split-controls');binding.prepend(docTools);docTools.append(docSource,splitControls);fold(splitControls,'文案拆分设置');
 const ai=document.querySelector('.ai-copy-helper'),quick=make('div','inspector-quick-actions'),quickHint=make('small','','绑定全部未设置 · 排版仅当前文字');
 quickHint.title='AI 根据原文字和文档内容绑定全部未设置文字；自动适配使用本地排版规则调整当前文字，结果请在预览中检查。';
 quick.append($('codexSuggest'),$('adaptCurrent'),quickHint);context.after(quick);ai.remove();
 $('codexSuggest').className='primary compact';$('codexSuggest').title='AI 根据原文字和文档条目自动绑定全部未设置文字；不翻译、不编写文案，可用 Ctrl+Z 撤回。';
 $('adaptCurrent').className='ghost compact';$('adaptCurrent').textContent='自动适配排版';$('adaptCurrent').title='结合文字区域、相邻留白与可编辑矩形容器调整。优先保留字号并居中容器文字；保留文案与字体，不调用 AI。图片内容需预览确认。Ctrl+Z 可撤回。';
 const apply=make('div','copy-apply-actions');apply.append($('confirmBinding'),$('clearBinding'));binding.append(apply);$('confirmBinding').textContent='应用选中文案';$('clearBinding').textContent='取消此处替换';
 const summary=make('div','inspector-copy-summary'),target=make('div','inspector-target-text'),change=make('button','text-button','更换文案');target.id='inspectorTargetText';change.id='changeBoundCopy';change.type='button';summary.append(make('span','field-label','当前替换文案'),target,change);layout.prepend(summary);
 function chooseCopy(){tab('binding');$('searchRecords').focus();}change.onclick=chooseCopy;$('chooseDifferentCopy').onclick=chooseCopy;
 const typography=document.querySelector('.typography-editor'),textEditor=document.querySelector('.text-content-editor');summary.after(typography,textEditor);
 fold(document.querySelector('.alignment-editor'),'多处文字对齐与分布');
 const smartStart=layout.querySelector('.label-row'),smart=make('div','smart-detail');let n=smartStart;while(n){const next=n.nextElementSibling;smart.append(n);n=next;}layout.append(smart);fold(smart,'自动适配设置与文字试样');
 const grid=document.querySelector('.typography-grid'),extra=make('div','extra-typography');for(const id of ['editStretchX','editStretchY','editTracking','editLeading'])extra.append($(id).closest('label'));grid.after(extra);fold(extra,'字间距、行间距与拉伸');
 const position=document.querySelector('.position-controls');position.append($('resetPosition'));fold(position,'精确位置');
 const next=make('button','ghost compact','下一个未设置 →');next.id='nextUnbound';next.type='button';const progress=make('small','','');progress.id='inspectorProgress';const actions=make('div','binding-actions');actions.append(progress,next);panel.append(actions);
 next.onclick=()=>{const pending=state.files.flatMap((f,fi)=>f.layers.map((l,li)=>({l,fi,li}))).filter(x=>!x.l.recordId&&!x.l.skipExport);const current=pending.findIndex(x=>x.fi===state.fileIndex&&x.li===state.layerIndex);const item=pending[(current+1)%pending.length];if(!item)return;if(item.fi!==state.fileIndex)selectFile(item.fi);selectedLayer(item.li);tab('binding');};
 const confirm=$('confirmBinding').onclick;$('confirmBinding').onclick=e=>{if(state.batchPreviewId||layer()?.skipExport||$('confirmBinding').disabled)return;confirm(e);if(layer()?.recordId)tab('layout');update();};
 const adapt=$('adaptCurrent').onclick;$('adaptCurrent').onclick=e=>{if(!layer()?.recordId||layer()?.skipExport||$('adaptCurrent').disabled)return;adapt(e);tab('layout');update();};
 let aiBusy=false;const suggest=$('codexSuggest').onclick;$('codexSuggest').onclick=async e=>{if(aiBusy||state.batchPreviewId||$('codexSuggest').disabled)return;aiBusy=true;try{await suggest(e);}finally{aiBusy=false;update();}};
 const steps=[...document.querySelectorAll('.step')];steps.forEach((s,i)=>{s.tabIndex=0;s.setAttribute('role','button');s.onclick=()=>{if(i===0)$('importPsd').click();if(i===1){if(!state.records.length)$('importDoc').click();else tab('binding');}if(i===2)tab('layout');if(i===3)$('check').click();};s.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();s.click();}};});
 let identity='',wasBound=false;
 function update(){
  const layers=state.files.flatMap(f=>f.layers),active=layers.filter(l=>l.recordId&&!l.skipExport),pending=layers.filter(l=>!l.recordId&&!l.skipExport),real=state.files.some(f=>!f.demo),l=layer(),bound=!!l?.recordId,id=state.fileIndex+':'+state.layerIndex+':'+(file()?.path||file()?.name||'');
  if(id!==identity){identity=id;content.scrollTop=0;tab(bound?'layout':'binding');}else if(bound&&!wasBound)tab('layout');if(!bound&&panel.dataset.mode==='layout')tab('binding');wasBound=bound;
  const hasArtwork=state.files.some(f=>f.artworkHides?.length||f.layers.some(l=>!l.nativeCreation&&l.nativeDisposition));
  name.textContent=l?.name||'尚未选择文字层';context.dataset.empty=String(!l);$('originalText').title=l?.original||'';const r=state.records.find(r=>r.id===l?.recordId);target.textContent=typeof l?.customText==='string'?l.customText:r?.target||'尚未应用替换文案';
  $('skipLayer').disabled=!l||!!l.artworkHidden;next.disabled=!pending.length;progress.textContent=layers.length?(layers.length-pending.length)+' / '+layers.length+' 处已设置':'先导入原稿';
  $('codexSuggest').disabled=aiBusy||!!state.batchPreviewId||!pending.length||!state.records.length;$('codexSuggest').textContent=aiBusy?'正在查找并绑定…':'AI 自动绑定文案';$('exactMatch').disabled=!!state.batchPreviewId||!l||!state.records.length;$('adaptCurrent').disabled=!bound||!r||!!l?.skipExport;
  $('check').disabled=!layers.length;$('run').disabled=!!state.batchPreviewId||!real||(!active.length&&!hasArtwork);$('export').disabled=!!state.batchPreviewId||!real||(!active.length&&!hasArtwork);$('layoutTab').disabled=!bound;$('clearBinding').hidden=!bound;$('confirmBinding').disabled=!!state.batchPreviewId||!l||!!l.skipExport||!state.records.some(r=>r.id===state.chosen);$('clearBinding').disabled=!!state.batchPreviewId||!bound;
  let title,hint,action,targetId,step;
  if(!layers.length){title='导入原稿';hint='拖入含独立文字层的 PSD / PSB / AI，或打开已有项目。';action='导入 PSD / PSB / AI';targetId='importPsd';step=0;}
  else if(hasArtwork&&!active.length){title='检查隐藏效果并生成副本';hint='查看真实当前画面，确认只隐藏重复内容；可Ctrl+Z撤回。';action='检查替换清单';targetId='check';step=2;}
  else if(!state.records.length){title='导入目标语言文档';hint='支持 Word、TXT、CSV 和 TSV，每条文案对应一处文字。';action='导入文案文档';targetId='importDoc';step=1;}
  else if(!active.length||pending.length){title='选择文字，应用文档文案';hint='选中文字层 → 应用一条文案 → 在预览中调整。不改的文字勾选保留原文。';action=bound?'下一处文字':'选择替换文案';targetId=bound?'nextUnbound':'bindingTab';step=1;}
  else{title='检查预览并生成文件';hint='按当前预览生成副本；原 PSD / PSB / AI 不覆盖。';action='检查替换清单';targetId='check';step=state.checked?3:2;}
  $('guideTitle').textContent=title;$('guideHint').textContent=hint;$('guideAction').textContent=action;$('guideAction').onclick=()=>{$(targetId).click();if(targetId==='bindingTab')$('searchRecords').focus();};steps.forEach((s,i)=>{s.classList.toggle('current',i===step);s.setAttribute('aria-current',i===step?'step':'false');});$('overallText').textContent=active.length+' 处替换 · '+layers.filter(l=>l.skipExport).length+' 处保留';$('overallDetail').textContent=pending.length?pending.length+' 处未设置，导出时保留原文':'按确认的预览生成 PSD / PSB / AI';
 }
 binding.addEventListener('click',()=>update());$('searchRecords').addEventListener('input',()=>update());
 tab('binding');return {update};
}
