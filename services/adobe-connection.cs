using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using System.IO;
using System.Diagnostics;
using System.Threading;
// Resolve installed versioned COM registrations; attach before activating a new process.
static class AdobeConnection {
 public static object Connect(string name,out Type selected) {return Connect(name,out selected,true);}
 static object Connect(string name,out Type selected,bool allowLaunch) {
  var ids=new List<string>();string prefix=name+".Application";ids.Add(prefix);
  try{object active=Marshal.GetActiveObject(prefix);selected=Type.GetTypeFromProgID(prefix);if(selected!=null)return active;Marshal.ReleaseComObject(active);}catch{}
  try {foreach(string id in Registry.ClassesRoot.GetSubKeyNames())if(id.StartsWith(prefix+".",StringComparison.OrdinalIgnoreCase)&&!ids.Contains(id))ids.Add(id);}catch{}
  ids.Sort(delegate(string a,string b){if(a==prefix)return -1;if(b==prefix)return 1;Version av,bv;Version.TryParse(a.Substring(Math.Min(a.Length,prefix.Length)).TrimStart('.'),out av);Version.TryParse(b.Substring(Math.Min(b.Length,prefix.Length)).TrimStart('.'),out bv);return (bv??new Version()).CompareTo(av??new Version());});
  foreach(string id in ids)try{object active=Marshal.GetActiveObject(id);selected=Type.GetTypeFromProgID(id);if(selected!=null)return active;Marshal.ReleaseComObject(active);}catch{}
  Exception last=null;foreach(string id in ids)try{Type t=Type.GetTypeFromProgID(id);if(t==null)continue;object instance=Activator.CreateInstance(t);selected=t;return instance;}catch(Exception e){last=e;}
  if(allowLaunch&&Process.GetProcessesByName(name).Length==0){string exe=FindExecutable(name);if(exe!=null){var info=new ProcessStartInfo(exe);info.UseShellExecute=false;info.WindowStyle=ProcessWindowStyle.Hidden;Process.Start(info);for(int i=0;i<30;i++){Thread.Sleep(1000);try{return Connect(name,out selected,false);}catch{}}}}
  selected=null;throw new Exception(name+" 自动连接失败；未发现可用的通用或版本化 COM 接口，请检查安装注册及运行权限。"+(last==null?"":" [0x"+last.HResult.ToString("X8")+"] "+last.Message),last);
 }

 static string FindExecutable(string name){
  foreach(RegistryHive hive in new[]{RegistryHive.LocalMachine,RegistryHive.CurrentUser})foreach(RegistryView view in new[]{RegistryView.Registry64,RegistryView.Registry32})try{using(var root=RegistryKey.OpenBaseKey(hive,view))using(var key=root.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\"+name+".exe")){var value=key==null?null:Convert.ToString(key.GetValue(null));if(!String.IsNullOrEmpty(value)&&File.Exists(value.Trim('"')))return value.Trim('"');}}catch{}
  foreach(string programs in new[]{Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86)}){string adobe=Path.Combine(programs,"Adobe");if(!Directory.Exists(adobe))continue;try{var dirs=Directory.GetDirectories(adobe,"Adobe "+name+"*");Array.Sort(dirs,StringComparer.OrdinalIgnoreCase);Array.Reverse(dirs);foreach(string dir in dirs)foreach(string relative in new[]{name+".exe",@"Support Files\Contents\Windows\"+name+".exe"}){string file=Path.Combine(dir,relative);if(File.Exists(file))return file;}}catch{}}
  return null;
 }
}
