'use strict';
// Shared by Photoshop/Illustrator scripts and Node regression tests (ES3).
const styleMapNative=String.raw`
function characterMap(a,b){
 if(a===b){var same=[];for(var k=0;k<b.length;k++)same.push(k);return same;}
 var prefix=0,suffix=0;while(prefix<a.length&&prefix<b.length&&a.charAt(prefix)===b.charAt(prefix))prefix++;while(suffix<a.length-prefix&&suffix<b.length-prefix&&a.charAt(a.length-1-suffix)===b.charAt(b.length-1-suffix))suffix++;
 var x=a.substring(prefix,a.length-suffix),y=b.substring(prefix,b.length-suffix),map=[],i,j;
 for(i=0;i<prefix;i++)map.push(i);
 if(x.length*y.length>4000000)throw Error('单层文字变化过多，请拆分替换以校验混合样式');
 var dp=[];for(i=0;i<=x.length;i++){dp[i]=[];for(j=0;j<=y.length;j++)dp[i][j]=0;}
 for(i=x.length-1;i>=0;i--)for(j=y.length-1;j>=0;j--)dp[i][j]=x.charAt(i)===y.charAt(j)?1+dp[i+1][j+1]:Math.max(dp[i+1][j],dp[i][j+1]);
 var anchors=[[-1,-1]];i=0;j=0;while(i<x.length&&j<y.length){if(x.charAt(i)===y.charAt(j)){anchors.push([i,j]);i++;j++;}else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;}anchors.push([x.length,y.length]);
 for(var q=1;q<anchors.length;q++){var prev=anchors[q-1],next=anchors[q],oldStart=prev[0]+1,oldCount=next[0]-oldStart,newCount=next[1]-prev[1]-1;for(j=0;j<newCount;j++){var at=oldCount?oldStart+Math.min(oldCount-1,Math.floor(j*oldCount/newCount)):Math.max(0,Math.min(a.length-1,prefix+oldStart)-prefix);map.push(Math.max(0,Math.min(a.length-1,prefix+at)));}if(next[1]<y.length)map.push(prefix+next[0]);}
 for(i=0;i<suffix;i++)map.push(a.length-suffix+i);return map;
}
`;
module.exports={styleMapNative};
