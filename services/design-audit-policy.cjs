// Transport windows bound live images, not the user's files or audit coverage.
const MAX_PAGES=6;
function windows(items){
 const out=[];let batch=[],bytes=0,images=0;
 for(const item of items){const r=item.request||item,vs=[...(r.visuals||[]),...(r.giftVisualReferences||[])],n=vs.length+(r.assistantReferenceIds?.length||0),weight=JSON.stringify(r).length;
  if(batch.length&&(batch.length>=MAX_PAGES||images+n>16||bytes+weight>8*1024*1024)){out.push(batch);batch=[];bytes=0;images=0;}
  batch.push(item);bytes+=weight;images+=n;
 }if(batch.length)out.push(batch);return out;
}
module.exports={MAX_PAGES,windows};
