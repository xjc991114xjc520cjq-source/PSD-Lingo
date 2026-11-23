using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32;
// Resolve installed versioned COM registrations; attach before activating a new process.
static class AdobeConnection {
 public static object Connect(string name,out Type selected) {
  var ids=new List<string>();string prefix=name+".Application";ids.Add(prefix);
  try{object active=Marshal.GetActiveObject(prefix);selected=Type.GetTypeFromProgID(prefix);if(selected!=null)return active;Marshal.ReleaseComObject(active);}catch{}
  try {foreach(string id in Registry.ClassesRoot.GetSubKeyNames())if(id.StartsWith(prefix+".",StringComparison.OrdinalIgnoreCase)&&!ids.Contains(id))ids.Add(id);}catch{}
  ids.Sort(delegate(string a,string b){if(a==prefix)return -1;if(b==prefix)return 1;Version av,bv;Version.TryParse(a.Substring(Math.Min(a.Length,prefix.Length)).TrimStart('.'),out av);Version.TryParse(b.Substring(Math.Min(b.Length,prefix.Length)).TrimStart('.'),out bv);return (bv??new Version()).CompareTo(av??new Version());});
  foreach(string id in ids)try{object active=Marshal.GetActiveObject(id);selected=Type.GetTypeFromProgID(id);if(selected!=null)return active;Marshal.ReleaseComObject(active);}catch{}
  Exception last=null;foreach(string id in ids)try{Type t=Type.GetTypeFromProgID(id);if(t==null)continue;object instance=Activator.CreateInstance(t);selected=t;return instance;}catch(Exception e){last=e;}
  selected=null;throw new Exception(name+" 自动连接失败；未发现可用的通用或版本化 COM 接口，请检查安装注册及运行权限。"+(last==null?"":" [0x"+last.HResult.ToString("X8")+"] "+last.Message),last);
 }
}
