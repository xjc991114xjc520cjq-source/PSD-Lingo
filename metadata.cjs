const {getRectangleGeometry}=require('./rectangle-shape.cjs');
function extractLayers(psd) {
  const result = [];
  function walk(nodes, parents = [], inheritedHidden = false, inheritedLocked = false) {
    for (const layer of nodes || []) {
      const hidden = inheritedHidden || !!layer.hidden;
      const locked = inheritedLocked || Object.values(layer.protected || {}).some(Boolean);
      if (layer.text) {
        const t = layer.text, style = t.style || t.styleRuns?.[0]?.style || {}, tr = t.transform || [1,0,0,1,0,0];
        const issues = [];
        if (!Number.isInteger(layer.id)) issues.push('缺少 Photoshop 图层 ID');
        if (hidden) issues.push('隐藏文字层');
        if (locked) issues.push('文字层或分组已锁定');
        if (!style.font?.name || !style.fontSize) issues.push('字体元数据不完整');
        if (t.shapeType !== 'point') issues.push('段落 / 未知文字类型暂不支持自动导出');
        if (t.orientation === 'vertical') issues.push('竖排文字暂不支持');
        const validTransform = tr.length === 6 && tr.every(Number.isFinite);
        const axisScaled = validTransform && tr[0] > 0 && tr[3] > 0 && Math.abs(tr[1]) <= 1e-7 && Math.abs(tr[2]) <= 1e-7;
        if (!axisScaled) issues.push('旋转、倾斜或镜像变换暂不支持（普通缩放已支持）');
        // PSD style size is before the text matrix; browser estimates need visible pixel size.
        const scaleY = axisScaled ? tr[3] : 1;
        const visibleSize = (style.fontSize || 16) * scaleY;
        if (t.warp?.style && t.warp.style !== 'none') issues.push('变形文字暂不支持');
        if (t.textPath?.bezierCurve?.controlPoints?.length || t.textPath?.data?.frameMatrix?.length) issues.push('路径文字暂不支持');
        if (layer.clipping || layer.mask || layer.vectorMask || layer.realMask) issues.push('剪贴 / 蒙版文字暂不支持');
        const signatures = new Set((t.styleRuns || []).filter(r => r.length > 0).map(r => JSON.stringify(Object.fromEntries(Object.entries({...style, ...r.style}).sort(([a],[b]) => a.localeCompare(b))))));
        if (signatures.size > 1) issues.push('混合文字样式暂不支持');
        const left = layer.left || 0, top = layer.top || 0, width = (layer.right || 0) - left, height = (layer.bottom || 0) - top;
        if (width <= 0 || height <= 0) issues.push('文字可见边界为空');
        const color = style.fillColor || {}; const cssColor = 'r' in color ? `rgb(${color.r},${color.g},${color.b})` : '#294638';
        result.push({id: layer.id, name: layer.name || '未命名文字', group: parents.join(' / '), original: t.text,
          font: style.font?.name || '', size: visibleSize, minSize: Math.max(1, visibleSize * .75),
          scaleX: axisScaled ? tr[0] : 1, scaleY, aspectScale: axisScaled ? tr[0] / tr[3] : 1,
          box: [left, top, Math.max(1, width), Math.max(1, height)], color: cssColor,
          alignment: t.paragraphStyle?.justification || 'left', tracking: style.tracking || 0, leading: (style.leading || (style.fontSize || 16) * 1.2) * scaleY,
          supported: issues.length === 0, issues, recordId: null, suggestedId: null});
      }
      if (layer.children) walk(layer.children, [...parents, layer.name || '分组'], hidden, locked);
    }
  }
  walk(psd.children);
  const positions=new Map();let stackIndex=0;
  function order(nodes,parentId=null){for(const l of psd.topFirst?(nodes||[]):[...(nodes||[])].reverse()){positions.set(l.id,{stackIndex:stackIndex++,parentId});if(l.children)order(l.children,l.id);}}
  order(psd.children);for(const l of result)Object.assign(l,positions.get(l.id));return result;
}
function extractContainers(psd){
  const result=[];let stackIndex=0;
  function walk(nodes,parents=[],parentId=null,hidden=false,locked=false,unsafe=false){
    const ordered=psd.topFirst?(nodes||[]):[...(nodes||[])].reverse();
    for(let i=0;i<ordered.length;i++){
      const l=ordered[i],index=stackIndex++,isHidden=hidden||!!l.hidden,isLocked=locked||Object.values(l.protected||{}).some(Boolean);
      if(!l.text&&!l.children&&(l.containerKind==='shape'||l.vectorFill&&l.vectorMask)){
        const box=[l.left,l.top,l.right-l.left,l.bottom-l.top],issues=[];
        if(!Number.isInteger(l.id))issues.push('缺少图层 ID');
        if(isHidden)issues.push('图层或分组隐藏');if(isLocked)issues.push('图层或分组锁定');
        if(l.clipping||ordered[i-1]?.clipping)issues.push('包含剪贴关系');
        if(unsafe||l.mask||l.realMask||l.effects||l.containerUnsafe||l.vectorFill&&l.vectorFill.type!=='color'||l.vectorStroke?.strokeEnabled)issues.push('包含蒙版、效果或复杂填充');
        if(box.some(v=>!Number.isFinite(v))||box[2]<=0||box[3]<=0)issues.push('图层边界无效');
        const rectangle=getRectangleGeometry(l);
        result.push({id:l.id,name:l.name||'未命名形状',group:parents.join(' / '),box,kind:'shape',shapeType:rectangle?'rectangle':'path',...(rectangle||{}),stackIndex:index,parentId,issues});
      }
      if(l.children)walk(l.children,[...parents,l.name||'分组'],l.id,isHidden,isLocked,unsafe||!!(l.clipping||l.mask||l.vectorMask||l.realMask||l.effects||l.containerUnsafe));
    }
  }
  walk(psd.children);return result;
}
module.exports = {extractLayers,extractContainers};
