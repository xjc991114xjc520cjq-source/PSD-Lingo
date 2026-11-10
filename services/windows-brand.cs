using System;
using System.IO;
using System.Linq;
using System.Diagnostics;
using System.Threading;
using System.Runtime.InteropServices;
using System.Collections.Generic;
class SparkitBrand {
 delegate bool EnumName(IntPtr module,IntPtr type,IntPtr name,IntPtr data);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr BeginUpdateResource(string file,bool delete);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool UpdateResource(IntPtr update,IntPtr type,IntPtr name,ushort language,byte[] bytes,uint length);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool EndUpdateResource(IntPtr update,bool discard);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern IntPtr LoadLibraryEx(string file,IntPtr reserved,uint flags);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern bool EnumResourceNames(IntPtr module,IntPtr type,EnumName callback,IntPtr data);
 [DllImport("kernel32.dll")]static extern bool FreeLibrary(IntPtr module);
 [DllImport("shell32.dll")]static extern void SHChangeNotify(uint id,uint flags,IntPtr item1,IntPtr item2);
 static void Check(bool ok){if(!ok)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());}
 static void Patch(string exe,string icon){
  byte[] ico=File.ReadAllBytes(icon);int count=BitConverter.ToUInt16(ico,4);if(count<1||count>20||BitConverter.ToUInt16(ico,2)!=1)throw new Exception("Invalid ICO");
  var groups=new List<int>();IntPtr lib=LoadLibraryEx(exe,IntPtr.Zero,2|32);
  if(lib!=IntPtr.Zero){EnumResourceNames(lib,(IntPtr)14,(m,t,n,d)=>{if(n.ToInt64()<=65535)groups.Add(n.ToInt32());return true;},IntPtr.Zero);FreeLibrary(lib);}
  if(groups.Count==0)groups.Add(1);
  byte[] group=new byte[6+14*count];Array.Copy(ico,group,6);
  IntPtr update=BeginUpdateResource(exe,false);if(update==IntPtr.Zero)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());bool commit=false;
  try{
   for(int i=0;i<count;i++){int entry=6+16*i,length=BitConverter.ToInt32(ico,entry+8),offset=BitConverter.ToInt32(ico,entry+12);if(offset<0||length<0||offset>ico.Length-length)throw new Exception("ICO bounds");byte[] image=new byte[length];Array.Copy(ico,offset,image,0,length);foreach(ushort lang in new ushort[]{0,1033})Check(UpdateResource(update,(IntPtr)3,(IntPtr)(i+1),lang,image,(uint)length));Array.Copy(ico,entry,group,6+14*i,12);group[6+14*i+12]=(byte)(i+1);}
   foreach(int id in groups)foreach(ushort lang in new ushort[]{0,1033})Check(UpdateResource(update,(IntPtr)14,(IntPtr)id,lang,group,(uint)group.Length));
   commit=true;
  }finally{Check(EndUpdateResource(update,!commit));}
  SHChangeNotify(0x08000000,0,IntPtr.Zero,IntPtr.Zero);
 }
 static bool Same(string a,string b){return Path.GetFullPath(a).Equals(Path.GetFullPath(b),StringComparison.OrdinalIgnoreCase);}
 static void Shortcuts(string exe,string icon){
  var dirs=new[]{Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),@"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar")};
  dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
  foreach(string dir in dirs){if(!Directory.Exists(dir))continue;foreach(string file in Directory.GetFiles(dir,"*",SearchOption.AllDirectories))try{
   string ext=Path.GetExtension(file);bool matches=false;
   if(ext.Equals(".lnk",StringComparison.OrdinalIgnoreCase)){dynamic link=shell.CreateShortcut(file);if(!string.IsNullOrWhiteSpace((string)link.TargetPath)&&Same((string)link.TargetPath,exe)){link.IconLocation=icon+",0";link.Description="灵搭 Sparkit · 为灵感搭把手";link.Save();matches=true;}}
   else if(ext.Equals(".url",StringComparison.OrdinalIgnoreCase)){var lines=File.ReadAllLines(file);string url=lines.FirstOrDefault(l=>l.StartsWith("URL=",StringComparison.OrdinalIgnoreCase));Uri uri;if(url!=null&&Uri.TryCreate(url.Substring(4),UriKind.Absolute,out uri)&&uri.IsFile&&Same(uri.LocalPath,exe)){File.WriteAllText(file,"[InternetShortcut]\r\nURL="+new Uri(exe).AbsoluteUri+"\r\nIconFile="+icon+"\r\nIconIndex=0\r\n",System.Text.Encoding.Unicode);matches=true;}}
   if(matches&&Path.GetFileNameWithoutExtension(file).Equals("PSD Lingo",StringComparison.OrdinalIgnoreCase)){string renamed=Path.Combine(Path.GetDirectoryName(file),"灵搭 Sparkit"+ext);if(!File.Exists(renamed))File.Move(file,renamed);}
  }catch{}}
  SHChangeNotify(0x08000000,0,IntPtr.Zero,IntPtr.Zero);
 }
 static int Main(string[] args){try{
  if(args.Length<3)throw new Exception("mode exe ico required");string mode=args[0],exe=Path.GetFullPath(args[1]),icon=Path.GetFullPath(args[2]);
  if(!Path.GetFileName(exe).Equals("PSD Lingo.exe",StringComparison.OrdinalIgnoreCase)||!File.Exists(icon))throw new Exception("Unexpected branding target");
  if(mode=="patch"){Patch(exe,icon);return 0;}
  if(mode=="shortcuts"){Shortcuts(exe,icon);return 0;}
  if(mode=="after-exit"){
   int pid=int.Parse(args[3]);try{Process.GetProcessById(pid).WaitForExit();}catch(ArgumentException){}
   for(int i=0;i<150;i++)try{Patch(exe,icon);if(args.Length>4)File.WriteAllText(args[4],"ok");return 0;}catch{Thread.Sleep(200);}
   throw new Exception("Executable icon remained locked");
  }
  throw new Exception("Unknown mode");
 }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}}
}
