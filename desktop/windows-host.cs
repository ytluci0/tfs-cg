using System;
using System.IO;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.ServiceProcess;

// Also used by the explicit administrator-installed service. Paths are fixed
// relative to its protected Program Files installation, never read from IPC.
sealed class BroadcastService : ServiceBase {
 Process child;
 public BroadcastService() { ServiceName="BroadcastCGProduction"; CanStop=true; AutoLog=true; }
 protected override void OnStart(string[] args) {
  string root=AppDomain.CurrentDomain.BaseDirectory;
  var start=new ProcessStartInfo(Path.Combine(root,"BroadcastCG.exe"),"\""+Path.Combine(root,"resources","app.asar","app","server-entry.cjs")+"\" \""+Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),"BroadcastCG","Production")+"\"");
  start.UseShellExecute=false; start.CreateNoWindow=true; start.WorkingDirectory=root; start.EnvironmentVariables["ELECTRON_RUN_AS_NODE"]="1";
  child=Process.Start(start); child.EnableRaisingEvents=true; child.Exited+=(s,e)=>{if(!stopping)Environment.Exit(1);};
 }
 bool stopping=false;
 protected override void OnStop(){stopping=true;if(child!=null&&!child.HasExited){try{File.WriteAllText(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),"BroadcastCG","Production","stop.request"),"");child.WaitForExit(10000);if(!child.HasExited)child.Kill();}catch{}}}
 static int Main(string[] args) {
  try{
   if(args.Length==3&&args[0]=="certificate"){
    using(RSA rsa=RSA.Create(3072)){
     var request=new CertificateRequest("CN=BroadcastCG private production server",rsa,HashAlgorithmName.SHA256,RSASignaturePadding.Pkcs1);
     request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false,false,0,true));
     request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature|X509KeyUsageFlags.KeyEncipherment,true));
     var usage=new OidCollection();usage.Add(new Oid("1.3.6.1.5.5.7.3.1"));request.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(usage,true));
     using(var cert=request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-5),DateTimeOffset.UtcNow.AddYears(2))){
      File.WriteAllBytes(args[1],cert.Export(X509ContentType.Pfx,args[2]));
      using(var hash=SHA256.Create())Console.WriteLine(BitConverter.ToString(hash.ComputeHash(cert.RawData)).Replace("-","").ToLowerInvariant());
     }
    }return 0;
   }
   if(args.Length==0){ServiceBase.Run(new BroadcastService());return 0;}
   throw new ArgumentException("Unsupported host operation.");
  }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
 }
}
