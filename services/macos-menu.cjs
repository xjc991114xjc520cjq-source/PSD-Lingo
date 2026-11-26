function installMacMenu({Menu,platform=process.platform}){
 if(platform!=='darwin')return;
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:'灵搭 Sparkit',submenu:[{role:'about'},{type:'separator'},{role:'services'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},
  {label:'编辑',submenu:[{role:'undo',registerAccelerator:false},{role:'redo',registerAccelerator:false},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
  {label:'窗口',submenu:[{role:'minimize'},{role:'zoom'},{role:'front'}]}
 ]));
}
module.exports={installMacMenu};
