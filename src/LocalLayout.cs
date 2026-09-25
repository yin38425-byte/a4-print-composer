using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;

public static class LocalLayout {
    static TcpListener listener;
    static string root, token, origin;
    static volatile bool running=true;
    static readonly object conversionLock=new object();
    const int MaxBytes=100*1024*1024;
    const string AppVersion="__APP_VERSION__";
    [STAThread]
    public static int Main(string[] args) {
        string statePath=null, url=null;
        bool headless=args.Length>0 && args[0]=="--headless";
        try {
            root=AppDomain.CurrentDomain.BaseDirectory;
            if(!File.Exists(Path.Combine(root,"index.html")) || !File.Exists(Path.Combine(root,"OfficeConvert.exe")))
                throw new FileNotFoundException("请先完整解压交付包，再打开启动程序。index.html与OfficeConvert.exe需要和启动程序放在一起。");
            string runtime=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"LocalLayout");
            Directory.CreateDirectory(runtime);
            token=Guid.NewGuid().ToString("N");
            listener=new TcpListener(IPAddress.Loopback,0); listener.Start(8);
            origin="http://127.0.0.1:"+((IPEndPoint)listener.LocalEndpoint).Port;
            url=origin+"/"+token+"/";
            // Installation folders may be read-only; never write runtime state there.
            statePath=Path.Combine(runtime,"session-"+Process.GetCurrentProcess().Id+".txt");
            File.WriteAllText(statePath,url,Encoding.UTF8);
            var thread=new Thread(Accept); thread.IsBackground=true; thread.Start();
            if(headless) {Thread.Sleep(30*60*1000);}
            else {
                Application.EnableVisualStyles();
                var form=new Form {Text="文档拼版 v"+AppVersion+" · 本地助手",Width=550,Height=240,StartPosition=FormStartPosition.CenterScreen};
                var text=new Label {Text="本地助手正在运行 · v"+AppVersion+"\n\nWord、Excel、PPT、PDF、图片可在浏览器中一起排版。\n处理文件时请保留此窗口；关闭后停止转换服务。",Dock=DockStyle.Fill,Padding=new Padding(20),AutoSize=false};
                var address=new TextBox {Text=url,ReadOnly=true,Dock=DockStyle.Bottom};
                var button=new Button {Text="打开排版页面",Dock=DockStyle.Bottom,Height=38};
                button.Click+=(s,e)=>OpenBrowser(url); form.Controls.Add(text); form.Controls.Add(address); form.Controls.Add(button);
                form.Shown+=(s,e)=>OpenBrowser(url); Application.Run(form);
            }
        } catch(Exception e) {
            string error="无法启动文档拼版：\n"+e.Message;
            Console.Error.WriteLine(error);
            if(!headless)MessageBox.Show(error,"启动失败",MessageBoxButtons.OK,MessageBoxIcon.Error);
            return 1;
        } finally {running=false;if(listener!=null)listener.Stop();try{if(statePath!=null && File.ReadAllText(statePath,Encoding.UTF8)==url)File.Delete(statePath);}catch{}}
        return 0;
    }
    static void OpenBrowser(string url) {
        try{Process.Start(new ProcessStartInfo(url){UseShellExecute=true});}
        catch(Exception){MessageBox.Show("本地助手已启动。浏览器未能自动打开，请复制窗口中的地址，粘贴到Edge或Chrome地址栏。","打开浏览器",MessageBoxButtons.OK,MessageBoxIcon.Information);}
    }
    static void Accept() {
        while(running)try {var client=listener.AcceptTcpClient();ThreadPool.QueueUserWorkItem(_=>Handle(client));}catch{if(!running)return;}
    }
    static void Reply(NetworkStream stream,int status,string type,byte[] body) {
        string headers="HTTP/1.1 "+status+" Result\r\nContent-Type: "+type+"\r\nContent-Length: "+body.Length+"\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'self' blob: data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-src blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'\r\n\r\n";
        byte[] h=Encoding.ASCII.GetBytes(headers);stream.Write(h,0,h.Length);stream.Write(body,0,body.Length);
    }
    static void Fail(NetworkStream s,int code,string message){Reply(s,code,"text/plain; charset=utf-8",Encoding.UTF8.GetBytes(message));}
    static void Handle(TcpClient client) {
        using(client) {client.ReceiveTimeout=15000;client.SendTimeout=15000;using(var s=client.GetStream())try {
            var header=new List<byte>();int b;
            while((b=s.ReadByte())!=-1) {header.Add((byte)b);int n=header.Count;
                if(n>16384){Fail(s,431,"请求头过长");return;}
                if(n>=4 && header[n-4]==13 && header[n-3]==10 && header[n-2]==13 && header[n-1]==10)break;
            }
            var lines=Encoding.ASCII.GetString(header.ToArray()).Split(new[]{"\r\n"},StringSplitOptions.None);
            var req=lines[0].Split(' ');if(req.Length!=3){Fail(s,400,"请求无效");return;}
            var fields=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
            for(int i=1;i<lines.Length;i++){int p=lines[i].IndexOf(':');if(p>0){string key=lines[i].Substring(0,p);if(fields.ContainsKey(key)){Fail(s,400,"请求头重复");return;}fields[key]=lines[i].Substring(p+1).Trim();}}
            string host;if(!fields.TryGetValue("Host",out host)||host!=origin.Substring(7)){Fail(s,403,"仅允许本机页面访问");return;}
            string suppliedOrigin;if(fields.TryGetValue("Origin",out suppliedOrigin)&&suppliedOrigin!=origin){Fail(s,403,"来源不匹配");return;}
            if(fields.ContainsKey("Transfer-Encoding")){Fail(s,400,"不支持分块请求");return;}
            if(req[0]=="GET" && req[1]=="/"+token+"/") {
                string html=File.ReadAllText(Path.Combine(root,"index.html"),Encoding.UTF8).Replace("__SESSION_TOKEN__",token);
                Reply(s,200,"text/html; charset=utf-8",Encoding.UTF8.GetBytes(html));return;
            }
            if(req[0]=="GET" && req[1]=="/"+token+"/health") {Reply(s,200,"application/json",Encoding.UTF8.GetBytes("{\"local\":true,\"version\":\""+AppVersion+"\"}"));return;}
            string assetPrefix="/"+token+"/assets/pdfjs/";
            if(req[0]=="GET" && req[1].StartsWith(assetPrefix)) {
                string name=req[1].Substring(assetPrefix.Length);
                if(!System.Text.RegularExpressions.Regex.IsMatch(name,@"\A(pdf\.min\.mjs|pdf\.worker\.min\.mjs|cmaps/[A-Za-z0-9_.-]+\.bcmap|standard_fonts/[A-Za-z0-9_.-]+\.(pfb|ttf))\z")) {Fail(s,404,"资源不存在");return;}
                string file=Path.Combine(root,"assets","pdfjs",name.Replace('/',Path.DirectorySeparatorChar));
                if(!File.Exists(file)){Fail(s,404,"缺少预览资源，请完整解压交付包");return;}
                Reply(s,200,name.EndsWith(".mjs")?"text/javascript; charset=utf-8":"application/octet-stream",File.ReadAllBytes(file));return;
            }
            string auth;
            if(req[0]!="POST"||!req[1].StartsWith("/"+token+"/convert/")||!fields.TryGetValue("X-Local-Token",out auth)||auth!=token){Fail(s,403,"请求未授权");return;}
            string ext=req[1].Substring(("/"+token+"/convert/").Length);
            if(ext!="docx"&&ext!="doc"&&ext!="rtf"&&ext!="xls"&&ext!="xlsx"&&ext!="ppt"&&ext!="pptx"){Fail(s,415,"支持 DOCX、DOC、RTF、XLS、XLSX、PPT、PPTX");return;}
            int length;string len;
            if(!fields.TryGetValue("Content-Length",out len)||!int.TryParse(len,out length)||length<1||length>MaxBytes){Fail(s,413,"文件应为1字节至100MB");return;}
            var data=new byte[length];int read=0;while(read<length){int n=s.Read(data,read,length-read);if(n==0)throw new IOException("文件未传完");read+=n;}
            if(!Monitor.TryEnter(conversionLock)){Fail(s,409,"正在转换另一份文档，请完成后重试");return;}
            try{Reply(s,200,"application/pdf",ConvertDocument(data,ext));}finally{Monitor.Exit(conversionLock);}
        }catch(Exception e){try{Fail(s,422,e.Message);}catch{}}}}
    static byte[] ConvertDocument(byte[] data,string ext) {
        string job=Path.Combine(Path.GetTempPath(),"local-layout-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(job);
        try {
            string input=Path.Combine(job,"input."+ext), output=Path.Combine(job,"output.pdf");File.WriteAllBytes(input,data);
            bool spreadsheet=ext=="xls"||ext=="xlsx";
            bool presentation=ext=="ppt"||ext=="pptx";
            string engine=presentation?(Type.GetTypeFromProgID("PowerPoint.Application")!=null?"PowerPoint.Application":"KWPP.Application"):spreadsheet?(Type.GetTypeFromProgID("Excel.Application")!=null?"Excel.Application":"KET.Application"):(Type.GetTypeFromProgID("Word.Application")!=null?"Word.Application":"KWPS.Application");
            var info=new ProcessStartInfo(Path.Combine(root,"OfficeConvert.exe"),"\""+input+"\" \""+output+"\" "+engine) {UseShellExecute=false,CreateNoWindow=true,RedirectStandardError=true,RedirectStandardOutput=true};
            using(var process=Process.Start(info)) {
                if(!process.WaitForExit(300000)){process.Kill();throw new Exception("文档转换超时，未生成结果。请检查是否有办公软件弹窗，或文档过于复杂。");}
                string error=process.StandardError.ReadToEnd();
                if(process.ExitCode!=0)throw new Exception(String.IsNullOrWhiteSpace(error)?"办公软件转换失败，请确认相应桌面版可正常使用":error);
            }
            return File.ReadAllBytes(output);
        } finally {try{Directory.Delete(job,true);}catch{}}
    }
}
