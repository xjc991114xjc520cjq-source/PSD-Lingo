// On-demand, read-only full-board evidence for the human matching screen.
// Never run a modification/export plan merely to answer a matching question.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
function boardPreviewScript(input,board,output){return `#target photoshop
(function(){var source=null,copy=null,opened=false,previous=null,dialogs=app.displayDialogs,units=app.preferences.rulerUnits,failure=null;try{previous=app.activeDocument;}catch(_){}app.displayDialogs=DialogModes.NO;app.preferences.rulerUnits=Units.PIXELS;
try{var f=new File(${JSON.stringify(input)}),id=${JSON.stringify(board.id)},box=${JSON.stringify(board.box)};
for(var i=0;i<app.documents.length;i++){try{if((/^windows/i.test($.os)?app.documents[i].fullName.fsName.toLowerCase()===f.fsName.toLowerCase():app.documents[i].fullName.fsName===f.fsName))source=app.documents[i];}catch(_){}}
if(source&&!source.saved)throw Error('原稿有未保存的改动，请先保存后再查看画板');if(!source){source=app.open(f);opened=true;}
function find(d,id){for(var i=0;i<d.layers.length;i++){var l=d.layers[i];if(l.id===id)return l;if(l.typename==='LayerSet'){var x=find(l,id);if(x)return x;}}return null;}
if(!find(source,id))throw Error('画板已变化，请重新核对');
copy=source.duplicate('Sparkit board preview',true);copy.flatten();copy.crop([UnitValue(box[0],'px'),UnitValue(box[1],'px'),UnitValue(box[0]+box[2],'px'),UnitValue(box[1]+box[3],'px')]);
if(Math.abs(copy.width.as('px')-box[2])>1||Math.abs(copy.height.as('px')-box[3])>1)throw Error('完整画板范围不一致');var o=new JPEGSaveOptions();o.quality=11;copy.saveAs(new File(${JSON.stringify(output)}),o,true,Extension.LOWERCASE);
}catch(e){failure=e;}finally{try{if(copy)copy.close(SaveOptions.DONOTSAVECHANGES);}catch(_){}try{if(opened&&source)source.close(SaveOptions.DONOTSAVECHANGES);}catch(_){}app.displayDialogs=dialogs;app.preferences.rulerUnits=units;try{if(previous)app.activeDocument=previous;}catch(_){}}if(failure)throw failure;})();`;}
function createBoardPreview({directory,readMapping,isBusy=()=>false,reserve=()=>()=>{},prepare,execute,encode}){
 const pending=new Map();
 return async function preview({id,boardId}){
  const mapping=await readMapping(id),board=mapping.source.boards.find(b=>String(b.id)===String(boardId));
  if(!board)throw Error('当前记录中没有这个画板，请重新打开核对页');
  const key=crypto.createHash('sha256').update(JSON.stringify([mapping.source.path,mapping.source.snapshot,board.id,board.box])).digest('hex');
  if(pending.has(key))return pending.get(key);
  const run=(async()=>{const folder=path.join(directory(),key),image=path.join(folder,'board.jpg');let bytes;
   try{bytes=await fs.readFile(image);}catch(e){if(e.code!=='ENOENT')throw e;}
   if(!bytes){if(isBusy())throw Error('软件正在处理文件，请等当前步骤结束后再查看画板');const release=reserve();try{await fs.mkdir(folder,{recursive:true});await prepare();await execute(folder,boardPreviewScript(mapping.source.path,board,image.replace(/\\/g,'/')));await readMapping(id);bytes=await fs.readFile(image);}catch(e){await fs.rm(image,{force:true}).catch(()=>{});throw e;}finally{release();}}
   return {boardId:board.id,boardName:board.name,width:board.box[2],height:board.box[3],origin:'source-board',dataURL:await encode(bytes)};
  })();pending.set(key,run);try{return await run;}finally{pending.delete(key);}
 };
}
module.exports={boardPreviewScript,createBoardPreview};
