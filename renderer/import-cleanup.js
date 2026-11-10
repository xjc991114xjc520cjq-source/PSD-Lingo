// These actions only detach imports from the working project. They never touch
// source files, saved projects or exported files on disk.
export function removeImportedFile(state,index){
  if(!Number.isInteger(index)||index<0||index>=state.files.length)return false;
  const selected=state.files[state.fileIndex],removed=state.files[index];
  state.files.splice(index,1);
  if(!state.files.length){state.fileIndex=0;state.layerIndex=0;state.chosen=null;}
  else if(selected!==removed){state.fileIndex=Math.max(0,state.files.indexOf(selected));}
  else{
    state.fileIndex=Math.min(index,state.files.length-1);state.layerIndex=0;
    const first=state.files[state.fileIndex].layers?.[0];
    state.chosen=first?.recordId||first?.suggestedId||null;
  }
  state.checked=false;state.comparing=undefined;
  return true;
}

export function clearImportedFiles(state){
  const changed=state.files.length>0;
  state.files=[];state.fileIndex=0;state.layerIndex=0;state.chosen=null;
  state.checked=false;state.comparing=undefined;
  return changed;
}

export function clearImportedDocument(state){
  const changed=!!(state.records.length||state.docName||state.docFingerprint||state.sourceDocument||state.files.some(file=>file.containerEdits?.length||(file.layers||[]).some(layer=>layer.recordId||layer.suggestedId||typeof layer.customText==='string'||layer.transformSelected)));
  state.records=[];state.docName='';state.docFingerprint='';state.sourceDocument=null;
  state.chosen=null;state.checked=false;state.comparing=undefined;
  for(const file of state.files){
    // Container changes belong to replacement layouts. Without a document there
    // must be no modified shapes over the original source preview.
    delete file.containerEdits;
    for(const layer of file.layers||[]){
      layer.recordId=null;layer.suggestedId=null;
      delete layer.customText;delete layer.transformSelected;
    }
  }
  // Keep reusable manual typography/positions and explicit skip decisions; they
  // have no visual or export effect until another document is bound.
  return changed;
}
