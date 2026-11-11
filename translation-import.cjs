const fs=require('node:fs/promises'),path=require('node:path');
const {hash}=require('./core.cjs');
const {readTranslationWorkbook,workbookSummary,recordsFromWorkbook}=require('./translation-workbook.cjs');
// Retain one parsed workbook; inflate only a specifically requested reference image.
function createWorkbookImporter(){
 let cached=null;
 return async function importWorkbook(file,options={}){
  const stat=await fs.stat(file);if(!stat.isFile()||stat.size>512*1024*1024)throw Error('请选择 512 MB 以内的 XLSX 文件');
  const stamp=[file,stat.size,stat.mtimeMs,stat.ctimeMs].join('|');
  if(!cached||cached.stamp!==stamp){const bytes=await fs.readFile(file),fingerprint=hash(bytes),book=await readTranslationWorkbook(bytes);cached={stamp,fingerprint,book};}
  const {fingerprint,book}=cached,name=path.basename(file);
  if(options.fingerprint&&options.fingerprint!==fingerprint)throw Error('表格已变化，请重新选择范围');
  const base={path:file,name,fingerprint,format:'xlsx',rawText:null,splitMode:'line'};
  if(options.search){
   const {queries,sheet,offset=0}=options.search;
   if(!Array.isArray(queries)||!queries.length||queries.length>8||queries.some(q=>typeof q!=='string'||q.length>500||!q.trim())||!Number.isInteger(offset)||offset<0)throw Error('表格查找需要 1 至 8 条短文案和有效 offset');
   const normalize=s=>s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
   const terms=queries.map(normalize);if(terms.some(q=>!q))throw Error('查找文案不能只有空白或标点');
   const sheets=sheet?book.sheets.filter(s=>s.name===sheet):book.sheets;if(!sheets.length)throw Error('工作表不存在');
   const matches=[];
   for(const s of sheets){const rows=new Map();for(const c of s.cells){if(!rows.has(c.row))rows.set(c.row,{cells:[],matchedCells:[]});const row=rows.get(c.row);row.cells.push(c);const value=normalize(c.value);if(terms.some(q=>value.includes(q)))row.matchedCells.push(c.address);}
    for(const [row,{cells,matchedCells}]of rows)if(matchedCells.length)matches.push({sheet:s.name,row,matchedCells,cells,imageAnchors:s.images.filter(i=>i.rowStart<=row&&(i.rowEnd===null||i.rowEnd>=row))});
   }
   return {name,fingerprint,scope:sheet||'all-sheets',totalMatches:matches.length,offset,nextOffset:offset+20<matches.length?offset+20:null,matches:matches.slice(offset,offset+20),notice:'同名产品可能出现在多个工作表。按原稿完整文案组合和内嵌参照图确认区块；邻近补充句不自动加入原稿。'};
  }
  if(options.image){
   const {sheet,media}=options.image,s=book.sheets.find(s=>s.name===sheet),anchor=s?.images.find(i=>i.media===media);
   if(!anchor||!/^xl\/media\/[^/]+\.(png|jpe?g|webp)$/i.test(media))throw Error('请选择该工作表实际返回的参照图 media');
   const bytes=await fs.readFile(file);if(hash(bytes)!==fingerprint)throw Error('表格已变化，请重新读取参照图');
   const zip=await require('jszip').loadAsync(bytes),entry=zip.file(media);if(!entry||entry._data?.uncompressedSize>8*1024*1024)throw Error('表格参照图缺失或超过 8 MB');
   const image=await entry.async('nodebuffer');if(image.length>8*1024*1024)throw Error('表格参照图超过 8 MB');
   const referenceFileId='xlsx-reference:'+hash(JSON.stringify([file,sheet,media,fingerprint]));
   return {name,fingerprint,sheet,media,referenceFileId,imageAnchors:s.images.filter(i=>i.media===media),images:['data:image/'+path.extname(media).slice(1).toLowerCase().replace('jpg','jpeg')+';base64,'+image.toString('base64')]};
  }
  if(options.page){const {sheet,rowStart=1,rowEnd=Number(rowStart)+39}=options.page,s=book.sheets.find(s=>s.name===sheet);if(!s)throw Error('工作表不存在');const first=Number(rowStart),last=Number(rowEnd);if(!Number.isInteger(first)||!Number.isInteger(last)||first<1||last<first||last-first>=60)throw Error('每次可读 1 至 60 行');return {name,fingerprint,sheet:s.name,cells:s.cells.filter(r=>r.row>=first&&r.row<=last),imageAnchors:s.images.filter(r=>r.rowStart<=last&&(r.rowEnd||r.rowStart)>=first)};}
  if(!options.selection)return {...base,selectionRequired:true,sheets:workbookSummary(book)};
  const parsed=recordsFromWorkbook(book,options.selection,name);
  return {...base,...parsed,selectionRequired:false};
 };
}
module.exports={createWorkbookImporter};
