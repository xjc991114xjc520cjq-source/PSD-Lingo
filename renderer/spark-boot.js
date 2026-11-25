// Install before the renderer bundle so its first paint cannot expose the workspace.
(()=>{
 const root=document.documentElement;let timer,failed=false;
 root.dataset.platform=window.desktop?.platform||'';
 const release=()=>{root.classList.remove('spark-booting');document.getElementById('sparkBootCover')?.remove();};
 const cleanup=()=>{clearTimeout(timer);window.removeEventListener('error',onError,true);};
 const fail=()=>{if(!root.classList.contains('spark-booting'))return;failed=true;cleanup();release();};
 const onError=event=>{if(event.target?.tagName==='SCRIPT'||event.error)fail();};
 window.sparkitBoot={get failed(){return failed;},handoff(){cleanup();release();}};
 window.addEventListener('error',onError,true);
 timer=setTimeout(fail,12000);
})();
