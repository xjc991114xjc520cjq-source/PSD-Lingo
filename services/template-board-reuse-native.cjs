// Cached documents are read-only donors. Never close a document owned by the user.
const native=String.raw`
function reuseBoard(d,ab,b,cached,pool){
 var entry=null;for(var i=0;i<pool.length;i++)if(pool[i].path===cached.output)entry=pool[i];
 if(!entry){var before=tplDocs(),donor=app.open(new File(cached.output));entry={path:cached.output,doc:donor,owned:!tplKnown(donor,before)};pool.push(entry);}
 var donor=entry.doc;if(!donor.saved)throw Error('已完成画板副本有未保存修改，请先处理：'+b.name);
 var layer=null;for(var i=0;i<donor.layers.length;i++)if(donor.layers[i].name===b.name){if(layer)throw Error('已完成画板名称不唯一：'+b.name);layer=donor.layers[i];}
 if(!layer||!near(rect(layer),b.box))throw Error('已完成画板缓存结构失效：'+b.name);
 app.activeDocument=d;d.activeLayer=ab;app.activeDocument=donor;
 var retained=layer.duplicate(ab,ElementPlacement.PLACEBEFORE);app.activeDocument=d;
 if(retained.parent.typename!=='Document'||retained.parent.id!==d.id)throw Error('已完成画板复制容器异常：'+b.name);
 ab.allLocked=false;ab.remove();
 // Photoshop may reposition a duplicated artboard to avoid the destination's
 // existing board. Restore the entire board, including its contents, together.
 var placed=rect(retained);if(Math.abs(placed[2]-b.box[2])>.15||Math.abs(placed[3]-b.box[3])>.15)throw Error('已完成画板复制尺寸异常：'+b.name);
 if(!near(placed,b.box)){retained.allLocked=false;retained.translate(b.box[0]-placed[0],b.box[1]-placed[1]);}
 if(!near(rect(retained),b.box))setBoardRect(retained,b.box);
 if(!near(rect(retained),b.box))throw Error('已完成画板复制位置异常：'+b.name);
 checkpoint('复用已完成画板 '+b.name);return retained;
}
function closeReuseDocs(pool){for(var i=pool.length-1;i>=0;i--)if(pool[i].owned)try{pool[i].doc.close(SaveOptions.DONOTSAVECHANGES);}catch(_){} }
`;
module.exports={native};
