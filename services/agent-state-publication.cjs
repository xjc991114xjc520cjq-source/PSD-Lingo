// Progress frames carry live status, not a second copy of the entire transcript.
// Terminal frames are always standalone for work-record and reconnect consumers.
function createStatePublication({send,save=()=>{},now=Date.now}){
 let prior,lastSaved=0;
 return state=>{
  const terminal=['completed','failed','stopped'].includes(state.status),length=state.history?.length||0;
  const unchanged=prior&&prior.id===state.id&&prior.length===length&&prior.status===state.status&&prior.revision===state.revision&&prior.question===state.question;
  if(unchanged&&!terminal){const {history,...frame}=state;send({...frame,historyUnchanged:true,historyLength:length});}else send(state);
  const time=now();if(!unchanged||terminal||time-lastSaved>=1000){save(state);lastSaved=time;}
  prior={id:state.id,length,status:state.status,revision:state.revision,question:state.question};
 };
}
function restoreStateFrame(frame,current){
 if(!frame?.historyUnchanged)return frame;
 if(current?.id!==frame.id||current.history?.length!==frame.historyLength)return null;
 const {historyUnchanged,historyLength,...state}=frame;return {...state,history:current.history};
}
module.exports={createStatePublication,restoreStateFrame};
