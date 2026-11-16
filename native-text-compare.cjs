const nativeTextCompare=String.raw`
// Photoshop can split equivalent ranges at paragraph boundaries. Compare every
// visible character; ignore only its implicit single terminator, never glyph styles.
function visibleTextDescriptor(t,target){var out={},n=target.length;for(var k in t)if(t.hasOwnProperty(k))out[k]=t[k];var keys=['textStyleRange','paragraphStyleRange'];for(var ki=0;ki<keys.length;ki++){var key=keys[ki],ranges=t[key];if(!ranges||!ranges.length)continue;ranges=compactStyleRanges(ranges,key);var list=[],pos=0;for(var i=0;i<ranges.length;i++){var r=ranges[i];if(r.from<0||r.to<=r.from||r.to>n+1||r.from>n)throw Error('原生样式范围无效');if(r.from===n)continue;if(r.from!==pos)throw Error('原生样式存在缺口或重叠');for(var j=r.from;j<Math.min(n,r.to);j++){var copy={};for(var p in r)if(r.hasOwnProperty(p))copy[p]=r[p];copy.from=j;copy.to=j+1;list.push(copy);}pos=Math.min(n,r.to);}if(key!=='kerningRange'&&pos!==n)throw Error('原生样式未覆盖全部字符');out[key]=list;}return out;}
function visibleTextSame(before,after,target){try{return compatible(visibleTextDescriptor(before,target),visibleTextDescriptor(after,target),'');}catch(_){return false;}}
`;
module.exports={nativeTextCompare};
