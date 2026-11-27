const fs=require('node:fs/promises'),crypto=require('node:crypto');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const norm=s=>String(s||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,'');
function joinGiftRows(mapping,rows,config){
 if(!config.field||!['error','none'].includes(config.unmatchedPolicy||'error'))throw Error('请明确补充赠品字段和未匹配产品处理方式');
 if(mapping.approved.boards.some(b=>b.action==='use'&&b.fields.some(f=>f.role==='gift'||f.key===config.field)))throw Error('批准记录已有赠品字段，不能用补充表覆盖');
 return {...mapping,approved:{...mapping.approved,boards:mapping.approved.boards.map(b=>{
  if(b.action!=='use')return b;
  const matches=rows.filter(r=>b.code?norm(r.code)===norm(b.code):norm(r.name)===norm(b.productName));
  if(!matches.length&&config.unmatchedPolicy!=='none')throw Error('赠品表未找到产品：'+b.productName+'；请明确是否无赠品');
  if(new Set(matches.map(r=>r.fields[0].value.trim())).size>1)throw Error('赠品表同一产品有冲突记录：'+b.productName);
  const f=matches[0]?.fields[0]||{key:config.field,role:'gift',state:'missing',value:'',digest:digest(''),cell:'unmatched'};
  return {...b,fields:[...b.fields,{...f,sourceSheet:config.sheet,sourceWorkbookFingerprint:config.workbook.fingerprint}]};
 })}};
}
async function withGiftSource(mapping,config){
 if(!config)return mapping;
 if(!config.workbook?.path||!config.workbook.fingerprint)throw Error('赠品对照表需使用本任务已附加文件');
 const bytes=await fs.readFile(config.workbook.path);if(digest(bytes)!==config.workbook.fingerprint)throw Error('赠品对照表已变化，请更新本任务的赠品配置');
 const book=await require('../translation-workbook.cjs').readTranslationWorkbook(bytes),rows=require('../sku-product-matching.cjs').productRows(book,{sheet:config.sheet,nameColumn:config.nameColumn||'A',codeColumn:config.codeColumn||'B',rowStart:config.rowStart||2,rowEnd:config.rowEnd||100000,fields:[{key:config.field,column:config.valueColumn,role:'gift'}]});
 return joinGiftRows(mapping,rows,config);
}
module.exports={joinGiftRows,withGiftSource};
