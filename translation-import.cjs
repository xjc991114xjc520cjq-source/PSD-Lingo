const fs=require('node:fs/promises'),path=require('node:path');
const {hash}=require('./core.cjs');
const {readTranslationWorkbook,workbookSummary,recordsFromWorkbook}=require('./translation-workbook.cjs');
// A single parsed workbook is retained. Image payloads are never inflated.
function createWorkbookImporter(){
 let cached=null;
 return async function importWorkbook(file,options={}){
  const stat=await fs.stat(file);if(!stat.isFile()||stat.size>512*1024*1024)throw Error('请选择 512 MB 以内的 XLSX 文件');
  const stamp=[file,stat.size,stat.mtimeMs,stat.ctimeMs].join('|');
  if(!cached||cached.stamp!==stamp){const bytes=await fs.readFile(file),fingerprint=hash(bytes),book=await readTranslationWorkbook(bytes);cached={stamp,fingerprint,book};}
  const {fingerprint,book}=cached,name=path.basename(file);
  if(options.fingerprint&&options.fingerprint!==fingerprint)throw Error('表格已变化，请重新选择范围');
  const base={path:file,name,fingerprint,format:'xlsx',rawText:null,splitMode:'line'};
  if(options.page){const {sheet,rowStart=1,rowEnd=Number(rowStart)+39}=options.page,s=book.sheets.find(s=>s.name===sheet);if(!s)throw Error('工作表不存在');const first=Number(rowStart),last=Number(rowEnd);if(!Number.isInteger(first)||!Number.isInteger(last)||first<1||last<first||last-first>=60)throw Error('每次可读 1 至 60 行');return {name,fingerprint,sheet:s.name,cells:s.cells.filter(r=>r.row>=first&&r.row<=last),imageAnchors:s.images.filter(r=>r.rowStart<=last&&(r.rowEnd||r.rowStart)>=first)};}
  if(!options.selection)return {...base,selectionRequired:true,sheets:workbookSummary(book)};
  const parsed=recordsFromWorkbook(book,options.selection,name);
  return {...base,...parsed,selectionRequired:false};
 };
}
module.exports={createWorkbookImporter};
