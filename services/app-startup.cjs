// A hidden Electron window may never emit ready-to-show on some GPU/drivers.
// Page load is an independent readiness signal; the boot cover owns first paint.
function revealWindow(window,{focus=false}={}){
 if(!window||window.isDestroyed())return false;
 if(window.isMinimized?.())window.restore();
 if(!window.isVisible())window.show();
 if(focus)window.focus();return true;
}
function watchWindowStartup(window,{timeoutMs=12000,onTimeout=()=>{}}={}){
 let timer;const clear=()=>clearTimeout(timer),show=()=>{clear();revealWindow(window);};
 window.once('ready-to-show',show);window.webContents.once('did-finish-load',show);
 window.once('closed',clear);timer=setTimeout(()=>{if(!window.isDestroyed()&&!window.isVisible()){onTimeout();revealWindow(window);}},timeoutMs);timer.unref?.();
 return clear;
}
module.exports={revealWindow,watchWindowStartup};
