using System;
using System.IO;
using System.Text;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Runtime.InteropServices;
using System.Reflection;
class DeviceService {
 [StructLayout(LayoutKind.Sequential)]struct Rect{public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")]static extern bool GetClientRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")]static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")]static extern bool ShowWindowAsync(IntPtr h,int command);
 static bool PreparePhotoshop(){bool restored=false;foreach(var p in Process.GetProcessesByName("Photoshop")){IntPtr h=p.MainWindowHandle;Rect r;if(h!=IntPtr.Zero&&GetClientRect(h,out r)&&(IsIconic(h)||r.Right-r.Left<800||r.Bottom-r.Top<600)){ShowWindowAsync(h,9);ShowWindowAsync(h,3);restored=true;}}if(restored)Thread.Sleep(350);return restored;}
 static void PhotoshopScript(string file){
  string full=Path.GetFullPath(file);if(!File.Exists(full)||!String.Equals(Path.GetExtension(full),".jsx",StringComparison.OrdinalIgnoreCase))throw new Exception("Photoshop script file is missing or invalid");
  Type type=Type.GetTypeFromProgID("Photoshop.Application");if(type==null)throw new Exception("Photoshop COM registration unavailable");object ps=null;
  try{ps=Activator.CreateInstance(type);type.InvokeMember("DoJavaScriptFile",BindingFlags.InvokeMethod,null,ps,new object[]{full});}
  catch(TargetInvocationException e){throw new Exception("Photoshop script failed: "+(e.InnerException??e).Message,e.InnerException??e);}
  finally{if(ps!=null&&Marshal.IsComObject(ps))Marshal.FinalReleaseComObject(ps);}
 }
 static JavaScriptSerializer json=new JavaScriptSerializer();
 [DllImport("gdi32.dll",CharSet=CharSet.Unicode)]static extern int AddFontResourceEx(string file,uint flags,IntPtr reserved);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr SendMessageTimeout(IntPtr window,uint message,IntPtr wParam,IntPtr lParam,uint flags,uint timeout,out IntPtr result);
 static void InstallFont(string file){
  string full=Path.GetFullPath(file),ext=Path.GetExtension(full).ToLowerInvariant();if(!File.Exists(full)||(ext!=".ttf"&&ext!=".otf"&&ext!=".ttc"))throw new Exception("Invalid font file");
  byte[] header=new byte[4];using(var stream=File.OpenRead(full)){if(stream.Length<12||stream.Length>80*1024*1024||stream.Read(header,0,4)!=4)throw new Exception("Invalid font size");}
  string magic=Encoding.ASCII.GetString(header);if(!(header[0]==0&&header[1]==1&&header[2]==0&&header[3]==0)&&magic!="OTTO"&&magic!="ttcf"&&magic!="true")throw new Exception("Invalid font header");
  string directory=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Microsoft","Windows","Fonts");Directory.CreateDirectory(directory);string name="PSD-Lingo-"+Path.GetFileName(full),dest=Path.Combine(directory,name);if(!File.Exists(dest))File.Copy(full,dest,false);
  if(AddFontResourceEx(dest,0,IntPtr.Zero)==0)throw new Exception("Windows could not load font");using(var key=Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows NT\CurrentVersion\Fonts")){key.SetValue(Path.GetFileNameWithoutExtension(name)+" (TrueType)",dest,Microsoft.Win32.RegistryValueKind.String);}IntPtr result;SendMessageTimeout(new IntPtr(0xffff),0x001D,IntPtr.Zero,IntPtr.Zero,2,2000,out result);
 }
 static byte[] entropy=Encoding.UTF8.GetBytes("PSDLingo.Authorization.License.v1");
 static byte[] Decode(string s){return Convert.FromBase64String(s);}
 static CngKey Key(){const string name="PSDLingo.Device.v1";if(CngKey.Exists(name)){var existing=CngKey.Open(name);if(existing.Algorithm!=CngAlgorithm.ECDsaP256||existing.ExportPolicy!=CngExportPolicies.None){existing.Dispose();throw new Exception("Device key policy mismatch");}return existing;}var p=new CngKeyCreationParameters();p.ExportPolicy=CngExportPolicies.None;p.KeyUsage=CngKeyUsages.Signing;return CngKey.Create(CngAlgorithm.ECDsaP256,name,p);}
 static string Public(CngKey k){byte[] blob=k.Export(CngKeyBlobFormat.EccPublicBlob);byte[] prefix=Decode("MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE");byte[] spki=new byte[prefix.Length+64];Buffer.BlockCopy(prefix,0,spki,0,prefix.Length);Buffer.BlockCopy(blob,8,spki,prefix.Length,64);return Convert.ToBase64String(spki);}
 static void Main(string[] args){try{if(args.Length==2&&args[0]=="update"){Update(args[1]);return;}Console.OutputEncoding=new UTF8Encoding(false);var r=json.Deserialize<Dictionary<string,string>>(Console.ReadLine());string op=r["op"];if(op=="install-font"){InstallFont(r["path"]);Console.WriteLine(json.Serialize(new{installed=true}));return;}if(op=="photoshop-script"){PhotoshopScript(r["path"]);Console.WriteLine(json.Serialize(new{completed=true}));return;}if(op=="prepare-photoshop"){Console.WriteLine(json.Serialize(new{restored=PreparePhotoshop()}));return;}if(op=="protect"||op=="unprotect"){byte[] input=Decode(r["value"]);byte[] output=op=="protect"?ProtectedData.Protect(input,entropy,DataProtectionScope.CurrentUser):ProtectedData.Unprotect(input,entropy,DataProtectionScope.CurrentUser);Console.WriteLine(json.Serialize(new{value=Convert.ToBase64String(output)}));return;}using(var k=Key()){if(op=="identity"){Console.WriteLine(json.Serialize(new{spki=Public(k)}));return;}if(op=="sign"){using(var e=new ECDsaCng(k)){e.HashAlgorithm=CngAlgorithm.Sha256;Console.WriteLine(json.Serialize(new{signature=Convert.ToBase64String(e.SignData(Decode(r["value"])))}));return;}}throw new Exception("Unknown operation");}}catch(Exception e){Console.Error.WriteLine(e.Message);Environment.ExitCode=1;}}
 // A launcher may inherit resources/app as its working directory. Release that
 // directory before the swap; otherwise the updater can lock its own target.
 static void UpdateMove(string from,string to){for(int i=0;;i++){try{Directory.Move(from,to);return;}catch(IOException){if(i>=99)throw;Thread.Sleep(100);}}}
 static Process UpdateStart(ProcessStartInfo info){for(int i=0;;i++){try{return Process.Start(info);}catch(System.ComponentModel.Win32Exception e){if(i>=99||(e.NativeErrorCode!=32&&e.NativeErrorCode!=33))throw;Thread.Sleep(100);}}}
 static bool UpdateAcknowledged(string ack,string nonce){try{using(var f=new FileStream(ack,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete))using(var reader=new StreamReader(f))return reader.ReadToEnd()==nonce;}catch(IOException){return false;}}
 // This updater only swaps the resources/app payload. It never accepts user-data paths.
 static void Update(string ticketPath){var t=json.Deserialize<Dictionary<string,string>>(File.ReadAllText(ticketPath));string exe=Path.GetFullPath(t["exe"]),app=Path.GetFullPath(t["app"]),staged=Path.GetFullPath(t["staged"]),backup=app+".previous",ack=Path.GetFullPath(t["ack"]);string expected=Path.Combine(Path.GetDirectoryName(exe),"resources","app");if(app!=expected||staged!=app+".next"||Path.GetDirectoryName(ack)!=Path.GetDirectoryName(ticketPath))throw new Exception("Invalid updater paths");Directory.SetCurrentDirectory(Path.GetDirectoryName(ticketPath));int pid=int.Parse(t["pid"]);try{Process.GetProcessById(pid).WaitForExit(60000);if(!Process.GetProcessById(pid).HasExited)throw new Exception("Old application still running");}catch(ArgumentException){}
 if(Directory.Exists(backup))throw new Exception("Previous backup must be reviewed before updating");bool swapped=false;Process child=null;try{UpdateMove(app,backup);UpdateMove(staged,app);swapped=true;child=UpdateStart(new ProcessStartInfo(exe,"--update-ack=\""+ack+"\" --update-nonce="+t["nonce"]){WorkingDirectory=Path.GetDirectoryName(exe),UseShellExecute=false,CreateNoWindow=true});bool ready=false;for(int i=0;i<600;i++){Thread.Sleep(100);if(child.HasExited)break;if(UpdateAcknowledged(ack,t["nonce"])){ready=true;break;}}if(!ready)throw new Exception("New application did not acknowledge startup");File.WriteAllText(ticketPath+".result","success"); // Retain one known-good backup; main prunes it before the next verified update.
 }catch(Exception e){if(child!=null&&!child.HasExited){child.Kill();child.WaitForExit();}if(swapped&&Directory.Exists(app))UpdateMove(app,app+".failed-"+DateTime.UtcNow.Ticks);if(Directory.Exists(backup)&&!Directory.Exists(app))UpdateMove(backup,app);File.WriteAllText(ticketPath+".result","rolled back: "+e.Message);UpdateStart(new ProcessStartInfo(exe){WorkingDirectory=Path.GetDirectoryName(exe),UseShellExecute=false,CreateNoWindow=true});}}
}
