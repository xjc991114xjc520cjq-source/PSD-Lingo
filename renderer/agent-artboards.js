import {makeArtboardPlan,validateArtboardPlan,renameArtboardPlan,arrangeArtboardPlan,renamePlannedArtboards} from '../photoshop-artboard-plan.cjs';
import {auditDesignFile} from '../design-document-audit.cjs';
export function configureArtboards(file,args,records){
 if(args.restore===true){delete file.artboardPlan;return;}
 if(file.layers.some(l=>l.recordId||l.nativeCreation||l.nativeDisposition||l.manual||l.position||l.copyAdjustment)||file.containerEdits?.length||file.mixedTextEdits?.length||file.artworkHides?.length)throw Error('请先撤回普通改字或对象修改，再配置画板；画板改字应在boards.changes中一次指定，避免遗漏已有修改');
 file.artboardPlan=args.arrangeOnly?arrangeArtboardPlan(file,args):args.renameOnly?(file.artboardPlan?renamePlannedArtboards(file,args):renameArtboardPlan(file,args)):makeArtboardPlan(file,args,records);
}
function validateSources(file,records){if(file.artboardPlan.productSourceRecords?.some(r=>!records.some(x=>x.id===r.id&&x.target===r.target&&x.digest===r.digest)))throw Error('产品字段已变化，请重新configure_product_copy');for(const b of file.artboardPlan.boards)for(const c of b.changes){if(c.sourceRecords?.some(r=>!records.some(x=>x.id===r.id&&x.target===r.target&&x.digest===r.digest)))throw Error('画板批准文案已变化，请重新configure_artboards');}validateArtboardPlan(file.artboardPlan,file);}
export async function previewArtboards({file,args,records,call,isCurrent}){
 validateSources(file,records);const r=await call('agentArtboards',{action:'preview',source:{path:file.path,fingerprint:file.fingerprint},plan:file.artboardPlan,boardName:args.boardName,crop:args.crop,offset:args.offset,limit:args.limit});if(!isCurrent())throw Error('任务已变化，画板预览已丢弃');
 return {fileIndex:args.fileIndex,format:r.format,shownBoards:r.shownBoards,nextOffset:r.nextOffset,boards:r.boards.map(b=>({name:b.name,box:b.box})),images:r.visuals.map(v=>v.dataURL),evidence:r.visuals.map(({dataURL,...v})=>v),reused:r.reused};
}
export async function exportArtboards({file,records,call,fitText,buildRequest,getVisual,isCurrent,cache,cacheIdentity,forceReview}){
 validateSources(file,records);const signature=JSON.stringify([file.artboardPlan,records]),source={path:file.path,fingerprint:file.fingerprint},plan=file.artboardPlan;
 const native=await call('agentArtboards',{action:'export',source,plan});if(!isCurrent()||signature!==JSON.stringify([file.artboardPlan,records]))throw Error('任务或文案已变化，已保存画板副本保留但未通过审验');
 const composed={...file,artboardPlan:undefined,format:native.format,width:native.metadata.width,height:native.metadata.height,fingerprint:native.fingerprint,layers:native.metadata.layers,containers:native.metadata.containers,artboards:native.metadata.artboards,composedBoards:native.boards};
 const actualVisual=async options=>{
  const b=native.boards.find(b=>options.crop[0]>=b.box[0]&&options.crop[1]>=b.box[1]&&options.crop[0]+options.crop[2]<=b.box[0]+b.box[2]+.1&&options.crop[1]+options.crop[3]<=b.box[1]+b.box[3]+.1);if(!b)throw Error('找不到当前审验画板');
  const current=await call('agentArtboards',{action:'visual',source,plan,boardName:b.name,crop:options.crop});const visuals=[current];if(b.sourceImage)visuals.unshift(await call('agentArtboards',{action:'visual',source,plan,boardName:b.name,crop:options.crop,sourceOnly:true}));return visuals;
 };
 const nativeRequest=options=>{const request=buildRequest({...options,fitText:undefined}),f=options.file;request.nativeArtboardComposition={verifiedEditable:true,verifiedCharacterStyles:true,layers:f.layers.filter(l=>l.nativeVerifiedText).map(l=>({id:l.id,target:l.customText,visibleBox:l.box,styles:l.mixedStyleRuns?.map(s=>({from:s.from,to:s.to,font:s.font,size:s.size}))})),note:'此处字形、完整字符样式及锚点已由Photoshop保存重开验证；第一字符可能仅为小货币符号，不代表整行字号。只按实际最终JPG评价整体设计和可见字形，不使用浏览器的单字体拟合代替原生混合样式。'};return request;};
 const audit=await auditDesignFile({file:composed,records,fitText:undefined,buildRequest:nativeRequest,getVisual:actualVisual,requireDelivery:true,call,cache,cacheIdentity,forceReview,isCancelled:()=>!isCurrent(),onProgress:p=>{void call('agentToolProgress',p).catch(()=>{});}});
 if(!isCurrent()||signature!==JSON.stringify([file.artboardPlan,records]))throw Error('最终画板审验期间任务或文案已变化');
 await call('agentArtboards',{action:'verify',source,plan});
 const failures=audit.failures||[];
 return {saved:1,exported:true,results:[{file:file.name,output:native.output,format:native.format,fallbackReason:native.fallbackReason,delivery:native.delivery}],failed:0,qualityPassed:audit.passed===true,audits:[{file:file.name,...audit}],failures,deliveryStages:[{file:file.name,nativeSave:'saved',nativeReopen:'passed',jpeg:'passed',finalAudit:audit.passed?'passed':'failed'}],visualAcceptance:audit.passed?'同一可编辑文件内的全部画板已保存重开、字符样式及最终JPG审验通过，仍待用户视觉确认':'可编辑画板副本已保留，按整页审验问题修改configure_artboards后再导出，不重复尝试相同计划'};
}
