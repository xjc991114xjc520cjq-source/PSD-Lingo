// Model discovery never changes the user's current model automatically.
export function installApiModels({$,call,hasSavedKey,createOption=(value,label)=>{const option=document.createElement('option');option.value=value;option.textContent=label;return option;},schedule=setTimeout,unschedule=clearTimeout}){
  let generation=0,timer;
  const status=$('apiModelsState'),refresh=$('refreshApiModels'),choices=$('apiModelChoices'),model=$('codexModel');
  const active=()=>$('settingsDialog').open&&$('aiMode').value==='api';
  const connection=()=>({apiKey:$('apiKey').value.trim(),apiBaseUrl:$('apiBaseUrl').value.trim()||'https://api.openai.com/v1',apiProtocol:$('apiProtocol').value||'auto'});
  const signature=()=>JSON.stringify(connection());
  function clearChoices(){choices.replaceChildren(createOption('','选择账号可见模型，也可在下方手动输入'));choices.disabled=true;}
  function invalidate(){generation++;if(timer!==undefined){unschedule(timer);timer=undefined;}refresh.disabled=false;}
  async function load(){
    invalidate();if(!active())return;
    const ticket=generation,config=connection(),stamp=signature(),key=config.apiKey;clearChoices();
    if(!key&&!hasSavedKey()){status.textContent='填写 API Key 后自动获取模型；无需先保存。';return;}
    refresh.disabled=true;status.textContent='正在获取此 API Key 可用的模型…';
    try{
      const result=await call('listApiModels',{apiBaseUrl:config.apiBaseUrl,apiProtocol:config.apiProtocol,...(key?{apiKey:key}:{})});
      if(ticket!==generation||!active()||signature()!==stamp)return;
      const models=Array.isArray(result?.models)?result.models:[];
      for(const name of models)choices.append(createOption(name,name));
      choices.disabled=!models.length;choices.value=models.includes(model.value.trim())?model.value.trim():'';
      status.textContent=models.length?'已获取 '+models.length+' 个模型。请选择支持文本输出的模型；也可手动填写服务商提供的名称。':'此接口未返回模型。可手动填写服务商提供的模型名称后保存。';
    }catch(error){
      if(ticket!==generation||!active()||signature()!==stamp)return;
      status.textContent='模型列表获取失败：'+error.message+' 第三方服务可能不开放模型列表，列表失败不代表文案对应不可用；可手动填写模型名称后保存并尝试。';
    }finally{if(ticket===generation)refresh.disabled=false;}
  }
  refresh.onclick=load;
  choices.onchange=()=>{if(choices.value)model.value=choices.value;};
  model.addEventListener('input',()=>{choices.value=Array.from(choices.options).some(option=>option.value===model.value.trim())?model.value.trim():'';});
  function connectionChanged(){
    invalidate();clearChoices();if(!active())return;
    status.textContent=$('apiKey').value.trim()||hasSavedKey()?'等待从当前接口获取模型…':'填写 API Key 后自动获取模型；无需先保存。';
    timer=schedule(()=>{timer=undefined;void load();},650);
  }
  for(const id of ['apiKey','apiBaseUrl']){$(id).addEventListener('input',connectionChanged);$(id).addEventListener('blur',()=>{if(timer!==undefined)void load();});}
  $('apiProtocol').addEventListener('change',connectionChanged);
  $('settingsDialog').addEventListener('close',invalidate);
  $('settingsDialog').addEventListener('cancel',invalidate);
  clearChoices();
  return {opened:load,modeChanged(){invalidate();clearChoices();if(active())void load();},invalidate};
}
