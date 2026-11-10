// Measurements are alternatives for visual planning, never automatic approval.
function measuredSpaceOptions({file,layer,record,fitText}){
 if(!fitText||!record)return null;
 const target=typeof layer.customText==='string'?layer.customText:record.target;
 const board=layer.boardBox||[0,0,file.width,file.height],current=layer.manual?.size||layer.size;
 const peers=file.layers.filter(l=>l.boardNames?.length===1&&l.boardNames[0]===layer.boardNames?.[0]&&l.size>=layer.size*.8&&l.size<=layer.size*1.2).map(l=>l.manual?.size||l.size).sort((a,b)=>a-b);
 const sizes=[...new Set([current,layer.size,peers.length?peers[Math.floor(peers.length/2)]:current])];
 const paragraphs=String(target).replace(/\r\n?/g,'\n').split('\n').map(p=>[p]);
 return {basis:'font-measured-alternatives-not-visual-approval',availableRegion:'unknown-until-visual-obstacle-review',boardWidth:board[2],candidates:sizes.map(size=>{
  const l={...layer,box:[board[0],board[1],Math.max(board[2],1),Math.max(board[3],1)],manual:{...layer.manual,enabled:true,size,tracking:layer.manual?.tracking??layer.tracking,leading:size*1.2},textLayout:{sourceText:target,paragraphs}};
  const fit=fitText(l,record);return {size,widthForUnwrappedParagraphs:fit.width,visibleHeight:fit.height,lines:fit.lines?.length,withinBoardWidth:fit.width<=board[2]};
 })};
}
module.exports={measuredSpaceOptions};
