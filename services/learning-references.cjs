// Backend credentials never enter this module or the renderer.
const {validateLayoutPng}=require('./layout-memory.cjs');
function referenceQuery(request){const chosen=request.layers.filter(l=>request.scope==='full'?request.selectedLayerKeys.includes(l.layerKey):l.layerKey===request.selectedLayerKey),first=chosen[0];return {targetText:chosen.map(l=>l.target).join(' ').slice(0,4000),font:first.font,width:first.box[2],height:first.box[3]};}
async function retrieveReferences(request,fetchReferences){
 if(!fetchReferences)return {references:[],total:0,searchScope:'unavailable',warning:'尚未连接 GitHub 案例检索，未使用历史参考'};
 try{const r=await fetchReferences(referenceQuery(request));if(r.searchScope!=='all-archived-history'||!Array.isArray(r.references))throw Error('检索范围不完整');
 const references=[];for(const item of r.references.slice(0,2)){
  const c=item.case;if(!/^[a-f0-9]{64}$/.test(item.id)||item.status!=='archived'||!c||c.version!==2||!Array.isArray(c.changes)||!Array.isArray(c.crop))continue;
  const images=[];for(const stage of ['source','substituted','final']){const im=c.images?.[stage];if(!im||!['native-background','original-source'].includes(im.quality))throw Error('参考截图不完整');let bytes,mime;if(im.dataURL?.startsWith('data:image/png;base64,')){bytes=validateLayoutPng(im.dataURL,300000);mime='png';}else if(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(im.dataURL||'')){bytes=Buffer.from(im.dataURL.split(',')[1],'base64');if(bytes.length>225000||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw Error('参考 JPEG 无效');mime='jpeg';}else throw Error('参考图像格式无效');images.push({bytes,url:im.dataURL,extension:mime,metadata:{caseId:item.id,stage,crop:c.crop,quality:im.quality}});}
  const {images:unused,...metadata}=c;references.push({id:item.id,archiveUrl:item.archiveUrl,matchReason:item.matchReason,metadata,images});
 }
 return {references,total:Number(r.total)||0,searchScope:r.searchScope,warning:r.warning||''};
 }catch{return {references:[],total:0,searchScope:'unavailable',warning:'GitHub 完整案例读取失败，本次未使用历史参考，请稍后重试'};}
}
module.exports={referenceQuery,retrieveReferences};
