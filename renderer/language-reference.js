import {installLanguageRecipe} from './language-recipe.js';
import {showTaskProgress,confirmAction} from './dialogs.js';
export function installLanguageReference({$,call,state,toast,setupAction}){
 const recipeUi=installLanguageRecipe({$,call,state,toast,setupAction});
 let plan=null,rows=[],activeProgress=null;
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const number=(value,label)=>{const n=el('input');n.type='number';n.step='any';n.value=value;n.setAttribute('aria-label',label);return n;};
 window.desktop?.onLanguageReferenceProgress?.(p=>{activeProgress?.update({indeterminate:true,message:[p.phase,p.board?'画板「'+p.board+'」':'',p.current&&p.total?'第 '+p.current+' / '+p.total+' 个画板':''].filter(Boolean).join(' · ')});});
 const withProgress=async(title,action)=>{activeProgress=showTaskProgress({title});try{return await action();}finally{activeProgress.close();activeProgress=null;}};
 $('analyzeLanguageReference').onclick=async()=>{try{await setupAction(async()=>{
  const source=state.files[state.fileIndex];if(!source||source.format!=='AI')throw Error('请先在工作台导入 AI 原稿。');
  await withProgress('核对原稿与已确认的语言成稿',async()=>{
   activeProgress.update({indeterminate:true,message:'读取独立副本的画板、文字样式和图形。'});
   const result=await call('analyzeLanguageReference',{source:source.path});if(!result)return;showPlan(result);
  });
 });}catch(e){toast(e.message,true);$('languageReferenceStatus').textContent=e.message;}};
 $('runLanguageReference').onclick=async()=>{try{await setupAction(async()=>{
  if(!plan)throw Error('请先核对参考成稿');const chosen=rows.filter(r=>r.selected.checked);if(!chosen.length)throw Error('请选择画板');
  if(!await confirmAction('将为 '+chosen.length+' 个画板另存可编辑副本。参考稿的价格、日期、活动文案将作为本轮批准目标；配图或活动不同的画板请使用逐项译文模式。',{title:'确认本轮多语言目标',acceptLabel:'另存工作副本'}))return;
  await withProgress('生成多语言工作副本',async()=>{
   const overrides=chosen.filter(r=>r.mode.checked).map(r=>{const b=plan.source.boards[r.mapping.sourceIndex].rect;return {sourceIndex:r.mapping.sourceIndex,frames:r.frames.map(({frame,text,size,leading,position,x,y})=>({sourceFrameIndex:frame.index,original:frame.contents,text:text.value,size:Number(size.value),leading:Number(leading.value),tracking:0,...(position.checked?{position:[b[0]+Number(x.value),b[1]-Number(y.value)]}:{})}))};});
   const adjustments=chosen.filter(r=>!r.mode.checked).flatMap(r=>{const b=plan.source.boards[r.mapping.sourceIndex].rect;return r.targets.filter(t=>t.enabled.checked).map(t=>({sourceIndex:r.mapping.sourceIndex,referenceFrameIndex:t.frame.index,color:t.color.value,...(!t.size.disabled?{size:Number(t.size.value)}:{}),position:[b[0]+Number(t.x.value),b[1]-Number(t.y.value)]}));});
   const result=await call('runLanguageReference',{planId:plan.id,mappings:chosen.map(r=>r.mapping),overrides,adjustments,exportJpg:$('languageReferenceJpg').checked});if(!result)return;
   $('languageReferenceStatus').textContent='已另存：'+result.output+'。'+result.changes.length+' 个画板；图片和非文字路径校验通过。'+(result.reopenVerified?'保存重开审查通过，已导出 '+result.jpgFiles.length+' 张 JPG。':'请在原生文件中审核文字与排版。');
  });
 });}catch(e){toast(e.message,true);$('languageReferenceStatus').textContent=e.message;}};
 function showPlan(value){plan=value;rows=[];$('languageReferenceBoards').replaceChildren();
   for(const m of plan.mappings){
    const box=el('details'),summary=el('summary'),selected=el('input'),mode=el('input');selected.type=mode.type='checkbox';selected.checked=m.selected;selected.disabled=m.referenceIndex===null;summary.append(selected,el('span',m.sourceName+' · '+m.reason));selected.onclick=e=>e.stopPropagation();box.append(summary);
    const label=el('label','保留此画板原布局，逐项输入译文（配图／权益与参考成稿不同时使用）');label.prepend(mode);box.append(label);
    const fields=el('div');fields.hidden=true;
    const frames=plan.source.frames.filter(f=>f.visible&&f.boardIds.length===1&&f.boardIds[0]===m.sourceIndex).map(f=>{
     const row=el('label',f.contents),text=el('textarea'),size=number(f.runs[0]?.size||16,'字号 · '+f.index),leading=number(f.runs[0]?.leading||20,'行距 · '+f.index),position=el('input'),sb=plan.source.boards[m.sourceIndex].rect,x=number(f.bounds[0]-sb[0],'距画板左侧 · '+f.index),y=number(sb[1]-f.bounds[1],'距画板上侧 · '+f.index);position.type='checkbox';text.value=f.contents;text.rows=3;text.setAttribute('aria-label','译文 · '+f.index);row.append(text,el('span','字号'),size,el('span','行距'),leading,position,el('span','同时设置位置（pt）：左'),x,el('span','上'),y);fields.append(row);return {frame:f,text,size,leading,position,x,y};
    });
    const targetFields=el('details');targetFields.append(el('summary','按原稿底色调整参考文字颜色、字号和位置'));targetFields.append(el('p','仅勾选的文字会调整。混合样式保留各段字号；位置以原稿画板左上角为原点，单位 pt。'));
    const targets=plan.reference.frames.filter(f=>f.visible&&f.boardIds.length===1&&f.boardIds[0]===m.referenceIndex).map(f=>{
     const row=el('label',f.contents),enabled=el('input'),color=el('input'),size=number(f.runs[0]?.size||16,'参考字号 · '+f.index),rb=plan.reference.boards[m.referenceIndex].rect,x=number(f.bounds[0]-rb[0],'参考左侧 · '+f.index),y=number(rb[1]-f.bounds[1],'参考上侧 · '+f.index);enabled.type='checkbox';color.type='color';const rgb=/rgb\((\d+),(\d+),(\d+)\)/.exec(f.runs[0]?.color||'');color.value=rgb?'#'+rgb.slice(1).map(n=>Number(n).toString(16).padStart(2,'0')).join(''):'#ffffff';color.setAttribute('aria-label','字色 · '+f.index);size.disabled=f.runs.length!==1;row.prepend(enabled);row.append(el('span','字色'),color,el('span','字号'),size,el('span','左'),x,el('span','上'),y);targetFields.append(row);return {frame:f,enabled,color,size,x,y};
    });
    mode.onchange=()=>{fields.hidden=!mode.checked;targetFields.hidden=mode.checked;};box.append(fields,targetFields);$('languageReferenceBoards').append(box);rows.push({mapping:m,selected,mode,frames,targets});
   }
   $('runLanguageReference').disabled=false;$('languageReferenceStatus').textContent='已找到 '+plan.mappings.filter(m=>m.selected).length+' 组同名同尺寸画板。仅使用参考文字与样式，保留原稿图片和路径。请核对价格、日期、权益及字色与原底色的对比。';
 }
 return {captureWork:()=>({plan,open:[...$('languageReferenceBoards').querySelectorAll('details')].map(n=>n.open),values:[...$('languageReferenceBoards').querySelectorAll('input,textarea,select')].map(n=>({value:n.value,checked:n.checked})),recipe:recipeUi.captureWork()}),restoreWork(saved){recipeUi.restoreWork(saved?.recipe);if(!saved?.plan){plan=null;rows=[];$('languageReferenceBoards').replaceChildren();$('runLanguageReference').disabled=true;$('languageReferenceStatus').textContent='尚未核对参考成稿';return;}showPlan(saved.plan);[...$('languageReferenceBoards').querySelectorAll('input,textarea,select')].forEach((n,i)=>{if(!saved.values?.[i])return;n.value=saved.values[i].value;n.checked=saved.values[i].checked;});for(const r of rows)r.mode.onchange();[...$('languageReferenceBoards').querySelectorAll('details')].forEach((n,i)=>n.open=!!saved.open?.[i]);}};
}