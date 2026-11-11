const copySignature=records=>JSON.stringify(records.map(({id,target,digest,original,context})=>[id,target,digest,original,context]));
const parameterKey=text=>String(text||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
export const isParameterValue=text=>/^\d[\d\s.,±+\-×/%°µμa-zA-Z亿万千百次]*$/.test(String(text||'').trim());
// A row in a translation table may combine a value and label that are separate
// source objects. Keep that object structure instead of painting the row twice.
export function parameterParts(file,layer,record){
 const source=/^(.+?)\s+([\p{Script=Han}][\p{Script=Han}\s（）()]+)$/u.exec(String(record?.original||'').trim()),target=/^([^:：]+)[:：]\s*(.+)$/.exec(String(record?.target||'').trim());
 if(!source||!target||!isParameterValue(source[1])||parameterKey(layer.original)!==parameterKey(source[2]))return null;
 const values=file.layers.filter(l=>l!==layer&&!l.skipExport&&l.visible!==false&&parameterKey(l.original)===parameterKey(source[1])&&(!layer.boardBox||JSON.stringify(layer.boardBox)===JSON.stringify(l.boardBox)));
 if(values.length!==1)return null;const value=values[0];
 if(layer.box&&value.box){const a=layer.box,b=value.box;if(Math.abs(a[0]+a[2]/2-b[0]-b[2]/2)>Math.max(a[2],b[2])||Math.abs(a[1]-b[1])>Math.max(a[3],b[3])*5)return null;}
 return {label:target[1].trim(),targetValue:target[2].trim(),valueLayerId:value.id,preserved:parameterKey(value.original)===parameterKey(target[2]),valueSupported:!value.issues?.length};
}
export function captureBindingRequest(state){
 const files=state.files,records=state.records,signature=copySignature(records),targets=new Map();
 files.forEach((f,fi)=>f.layers.forEach((layer,li)=>{if(!layer.recordId&&!layer.skipExport)targets.set(fi+':'+li,{file:f,layer});}));
 return {files,records,signature,targets,request:{layers:[...targets].map(([layerKey,{file,layer}])=>({layerKey,file:file.name,name:layer.name,original:layer.original,group:layer.group,boardNames:layer.boardNames,box:layer.box,font:layer.font,size:layer.size})),records:records.map(({id,key,original,target,source,context})=>({id,key,original,target,source,context}))}};
}
export function applyBindingResult(state,capture,matches){
 if(state.files!==capture.files||state.records!==capture.records||copySignature(state.records)!==capture.signature)throw new Error('项目或文案已更换，本次对应结果未应用，请重新查找。');
 const valid=new Set(state.records.map(r=>r.id)),seen=new Set(),components=[];let bound=0;
 for(const match of matches||[]){const target=capture.targets.get(match?.layerKey);if(!target||seen.has(match.layerKey)||!valid.has(match.recordId))continue;seen.add(match.layerKey);const {file,layer}=target;if(!state.files.includes(file)||!file.layers.includes(layer)||layer.recordId||layer.skipExport)continue;layer.recordId=match.recordId;layer.suggestedId=null;delete layer.customText;delete layer.copyAdjustment;
  const part=parameterParts(file,layer,state.records.find(r=>r.id===match.recordId));if(part){layer.customText=part.label;layer.copyAdjustment={text:part.label,recordIds:[match.recordId],reason:'原参数值与标签为独立对象，仅翻译标签，保留数值的字体、字重与层级'};components.push({layerKey:match.layerKey,...part});}bound++;}
 return {bound,unmatched:[...capture.targets.values()].filter(({layer})=>!layer.recordId&&!layer.skipExport).length,...(components.length?{parameterComponents:components,note:'参数值保持独立；preserved=false的值仍需单独按批准文案翻译，不得隐藏并塞入小标签。混合样式不支持时报告能力缺口。'}:{})};
}
