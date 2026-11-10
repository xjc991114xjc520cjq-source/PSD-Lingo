const copySignature=records=>JSON.stringify(records.map(({id,target,digest,original,context})=>[id,target,digest,original,context]));
export function captureBindingRequest(state){
 const files=state.files,records=state.records,signature=copySignature(records),targets=new Map();
 files.forEach((f,fi)=>f.layers.forEach((layer,li)=>{if(!layer.recordId&&!layer.skipExport)targets.set(fi+':'+li,{file:f,layer});}));
 return {files,records,signature,targets,request:{layers:[...targets].map(([layerKey,{file,layer}])=>({layerKey,file:file.name,name:layer.name,original:layer.original,group:layer.group,boardNames:layer.boardNames,box:layer.box,font:layer.font,size:layer.size})),records:records.map(({id,key,original,target,source,context})=>({id,key,original,target,source,context}))}};
}
export function applyBindingResult(state,capture,matches){
 if(state.files!==capture.files||state.records!==capture.records||copySignature(state.records)!==capture.signature)throw new Error('项目或文案已更换，本次对应结果未应用，请重新查找。');
 const valid=new Set(state.records.map(r=>r.id)),seen=new Set();let bound=0;
 for(const match of matches||[]){const target=capture.targets.get(match?.layerKey);if(!target||seen.has(match.layerKey)||!valid.has(match.recordId))continue;seen.add(match.layerKey);const {file,layer}=target;if(!state.files.includes(file)||!file.layers.includes(layer)||layer.recordId||layer.skipExport)continue;layer.recordId=match.recordId;layer.suggestedId=null;delete layer.customText;delete layer.copyAdjustment;bound++;}
 return {bound,unmatched:[...capture.targets.values()].filter(({layer})=>!layer.recordId&&!layer.skipExport).length};
}
