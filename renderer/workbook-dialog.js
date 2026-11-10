// Uses the existing document import route; choosing a range never clears edits.
export function workbookDialog(book,load,{document:doc=globalThis.document}={}){
 return new Promise(resolve=>{
  const previous=doc.activeElement,el=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;},dialog=el('dialog');dialog.className='app-dialog workbook-dialog';dialog.id='workbookDialog';dialog.setAttribute('aria-labelledby','workbookTitle');
  const title=el('h2','选择表格中的语言与文案区块');title.id='workbookTitle';
  const intro=el('p',book.name+' · 每个区块单独指定工作表、原文列、目标列和行范围。图片锚点仅作来源线索；不会自动判定为画板。');
  const rows=el('div'),status=el('p'),preview=el('div'),actions=el('div');actions.className='dialog-actions';status.setAttribute('role','status');status.setAttribute('aria-live','polite');preview.className='workbook-preview';
  const add=el('button','新增文案区块'),check=el('button','预览所选文案'),accept=el('button','使用这些文案'),cancel=el('button','取消');accept.className='primary';accept.disabled=true;for(const b of [add,check,cancel])b.className='ghost';
  const definitions=[];let result=null,busy=false,closed=false;
  const invalidate=()=>{result=null;accept.disabled=true;preview.replaceChildren();};
  function label(text,input){const n=el('label',text);n.append(input);return n;}
  function addRow(){const row=el('div'),sheet=el('select'),source=el('input'),target=el('input'),first=el('input'),last=el('input'),split=el('input'),remove=el('button','移除');row.className='workbook-range';for(const s of book.sheets){const o=el('option',s.name+' · '+s.rows+' 行');o.value=s.name;sheet.append(o);}sheet.value=book.sheets.find(s=>s.rows>0)?.name||book.sheets[0].name;
   source.value='F';target.value='G';first.type=last.type='number';first.min=last.min='1';first.value='2';split.type='checkbox';split.checked=false;remove.className='text-button';
   const defaults=()=>{const s=book.sheets.find(s=>s.name===sheet.value);source.value=s.suggestedSource||'F';target.value=s.suggestedTargets[0]?.column||'G';last.value=String(Math.max(2,s.rows));invalidate();};defaults();sheet.onchange=defaults;
   const definition={row,sheet,source,target,first,last,split};definitions.push(definition);
   row.append(label('工作表',sheet),label('原文列（如 F 或 F:I）',source),label('目标列（如 G 或 L:O）',target),label('起始行',first),label('结束行',last),label('原译逐行数量一致时拆成多条',split),remove);
   for(const input of [source,target,first,last,split])input.addEventListener('input',invalidate);
   remove.onclick=()=>{definitions.splice(definitions.indexOf(definition),1);row.remove();invalidate();};rows.append(row);invalidate();
  }
  const finish=value=>{if(closed||busy)return;closed=true;dialog.close();dialog.remove();if(previous?.isConnected)previous.focus();resolve(value);};
  check.onclick=async()=>{if(busy)return;busy=true;check.disabled=true;add.disabled=true;cancel.disabled=true;rows.inert=true;accept.disabled=true;status.textContent='正在解析所选文字区域…';try{const selection={segments:definitions.map(d=>({sheet:d.sheet.value,sourceColumns:d.source.value,targetColumns:d.target.value,rowStart:Number(d.first.value),rowEnd:Number(d.last.value),splitLines:d.split.checked}))};result=await load(selection);preview.replaceChildren();const table=el('table'),head=el('tr');for(const t of ['来源','原文','目标文案'])head.append(el('th',t));table.append(head);for(const r of result.records.slice(0,40)){const tr=el('tr');for(const t of [r.source,r.original||'（缺少原文）',r.target])tr.append(el('td',t));table.append(tr);}preview.append(table);status.textContent='共 '+result.records.length+' 条；预览前 40 条。'+(result.notices.length?' 有 '+result.notices.length+' 项提示。':'');for(const n of result.notices.slice(0,30))preview.append(el('p',n.source+'：'+n.text+' · '+(n.action||'')));accept.disabled=false;}catch(e){result=null;status.textContent=e.message;}finally{busy=false;check.disabled=add.disabled=cancel.disabled=false;rows.inert=false;}};
  add.onclick=addRow;cancel.onclick=()=>finish(null);accept.onclick=()=>finish(result);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});actions.append(cancel,add,check,accept);dialog.append(title,intro,rows,status,preview,actions);doc.body.append(dialog);addRow();dialog.showModal();
 });
}
