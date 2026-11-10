// Installer colors are compiled from the exact stylesheet used by the app.
// Updating the shared CSS tokens therefore updates both application and setup UI.
function installerTheme(css){
 const clean=css.replace(/\/\*[\s\S]*?\*\//g,''),tokens={};
 for(const root of clean.matchAll(/:root\s*\{([^}]*)\}/g))for(const value of root[1].matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g))tokens[value[1]]=value[2].trim();
 function color(value,trail=[]){
  value=value?.trim();const variable=value?.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)$/);
  if(variable){if(trail.includes(variable[1]))throw Error('Installer theme token cycle: '+trail.join(' -> '));return color(tokens[variable[1]]||variable[2],[...trail,variable[1]]);}
  if(/^#[a-f0-9]{3}$/i.test(value))value='#'+value.slice(1).split('').map(n=>n+n).join('');
  if(/^#[a-f0-9]{6}$/i.test(value))return [1,3,5].map(i=>parseInt(value.slice(i,i+2),16));
  const rgb=value?.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);if(rgb&&rgb.slice(1).every(n=>Number(n)<=255))return rgb.slice(1).map(Number);
  const named={white:[255,255,255],black:[0,0,0]};if(named[value?.toLowerCase()])return named[value.toLowerCase()];
  throw Error('Installer theme color is missing or unsupported: '+value);
 }
 return {Surface:color(tokens['--dialog-surface']),Ink:color(tokens['--ink']),Muted:color(tokens['--dialog-muted']),Accent:color(tokens['--green'])};
}
function installerThemeSource(css){return 'using System.Drawing;\nstatic class SetupTheme {\n'+Object.entries(installerTheme(css)).map(([name,rgb])=>' public static readonly Color '+name+' = Color.FromArgb('+rgb.join(',')+');').join('\n')+'\n}\n';}
module.exports={installerTheme,installerThemeSource};
