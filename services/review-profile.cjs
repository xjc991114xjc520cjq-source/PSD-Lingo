const profiles=['delivery','advanced'];
function normalize(value){if(value===undefined||value===null||value==='')return 'delivery';if(!profiles.includes(value))throw Error('审验模式无效');return value;}
function policy(value){return normalize(value)==='advanced'?'完整设计审验：在纠错之外，主动检查整页构图、标题组轮廓、层级节奏、阅读区与光学间距，提出有证据、可执行且相互协调的设计提升。一次列齐，合并同根因问题。':'成品检查：核对批准文案与日期、价格、遗漏、重复及明显视觉问题（遮挡、不可辨认、明显失衡或不合理断行）。画面正确就通过；不要为主观偏好提出重设计、结构候选或细枝末节的提升建议，不把可读背景装饰当错误。仍须检查真实视觉关系，不能只看文本或字符框数值。';}
module.exports={normalize,policy};
