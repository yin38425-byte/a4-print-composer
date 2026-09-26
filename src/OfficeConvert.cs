using System;
using System.IO;
using System.Runtime.InteropServices;
using System.IO.Compression;
using System.Linq;
using System.Diagnostics;

// Runs in a dedicated STA worker. Only task-owned temporary inputs are opened.
public static class OfficeConvert {
    const int MaxPages=300;
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint processId);
    [STAThread]
    public static int Main(string[] args) {
        if(args.Length != 3) return 2;
        string input=Path.GetFullPath(args[0]), output=Path.GetFullPath(args[1]);
        string engine=args[2]; dynamic app=null, doc=null; bool owned=false; uint presentationProcess=0;
        bool timed=Environment.GetEnvironmentVariable("LOCAL_LAYOUT_TIMING")=="1";
        var clock=timed?Stopwatch.StartNew():null;
        var ext=Path.GetExtension(input).ToLowerInvariant();bool spreadsheet=ext==".xls"||ext==".xlsx", presentation=ext==".ppt"||ext==".pptx";
        try {
            if(presentation?(engine!="PowerPoint.Application"&&engine!="KWPP.Application"):spreadsheet?(engine!="Excel.Application"&&engine!="KET.Application"):(engine!="Word.Application"&&engine!="KWPS.Application"))throw new Exception("无效的转换程序");
            if(ext!=".doc" && ext!=".docx" && ext!=".rtf" && !spreadsheet && !presentation) throw new Exception("转换支持 DOC、DOCX、RTF、XLS、XLSX、PPT、PPTX");
            if(new FileInfo(input).Length>100*1024*1024) throw new Exception("文件超过100MB");
            Validate(input,ext);
            Timing(clock,"validate");
            var type=Type.GetTypeFromProgID(engine);
            if(type==null) throw new Exception(presentation?"未找到可用的 PowerPoint 或 WPS 演示桌面版":spreadsheet?"未找到可用的 Excel 或 WPS 表格桌面版":"未找到可用的 Word 或 WPS 桌面版");
            app=Activator.CreateInstance(type);
            Timing(clock,"office-start");
            if((presentation?(int)app.Presentations.Count:spreadsheet?(int)app.Workbooks.Count:(int)app.Documents.Count)!=0)throw new Exception("转换接口连接到了已有文档的办公窗口，请保存并关闭办公文档后重试");
            owned=true;if(!presentation)app.Visible=false;app.AutomationSecurity=3;
            if(presentation)try {GetWindowThreadProcessId(new IntPtr((int)app.HWND),out presentationProcess);}catch{}
            // Supply impossible passwords so encrypted files do not block on a prompt.
            string password=Guid.NewGuid().ToString("N").Substring(0,15);
            if(presentation){
                app.DisplayAlerts=1; // ppAlertsNone; PowerPoint does not allow Application.Visible=false.
                doc=OpenPresentation(app,input); // read-only, no presentation window
                Timing(clock,"open");
                if((bool)doc.HasVBProject)throw new Exception("不支持带宏演示文稿，请另存为不含宏的PPTX后重试");
                if((int)doc.Slides.Count>MaxPages)throw new Exception("演示文稿超过300页，请拆分后再试");
                // One slide per PDF page, in source order, including hidden slides. No notes/handouts.
                // Some Office versions ignore PrintHiddenSlides. Change only this read-only, temporary copy.
                for(int i=1;i<=(int)doc.Slides.Count;i++){
                    dynamic slide=doc.Slides[i],transition=null;
                    try {transition=slide.SlideShowTransition;transition.Hidden=0;}
                    finally {if(transition!=null)Marshal.FinalReleaseComObject(transition);Marshal.FinalReleaseComObject(slide);}
                }
                Timing(clock,"inspect");
                doc.ExportAsFixedFormat(output,2,2,0,1,1,-1,new DispatchWrapper(null),1,"",false,false,true,true,false);
                Timing(clock,"export");
            }else if(spreadsheet){
                app.DisplayAlerts=false;app.EnableEvents=false;app.AskToUpdateLinks=false;
                doc=app.Workbooks.Open(Filename:input,UpdateLinks:0,ReadOnly:true,Password:password,WriteResPassword:password,
                    IgnoreReadOnlyRecommended:true,Notify:false,AddToMru:false,CorruptLoad:0);
                Timing(clock,"open");
                if((bool)doc.HasVBProject||(int)doc.Excel4MacroSheets.Count>0||(int)doc.Excel4IntlMacroSheets.Count>0)throw new Exception("不支持带宏表格，请另存为不含宏的XLSX后重试");
                if((int)doc.Connections.Count>0)throw new Exception("不支持外部数据连接，请先保存静态副本");
                Timing(clock,"inspect");
                doc.ExportAsFixedFormat(Type:0,Filename:output,Quality:0,IncludeDocProperties:false,IgnorePrintAreas:false,OpenAfterPublish:false);
                Timing(clock,"export");
            }else{
            app.DisplayAlerts=0;
            doc=app.Documents.Open(FileName:input,ConfirmConversions:false,ReadOnly:true,
                AddToRecentFiles:false,PasswordDocument:password,WritePasswordDocument:password,
                Visible:false,OpenAndRepair:false,NoEncodingDialog:true);
            Timing(clock,"open");
            if((int)doc.ComputeStatistics(2)>MaxPages) throw new Exception("文档超过300页，请拆分后再试");
            Timing(clock,"inspect");
            doc.ExportAsFixedFormat(output,17,false);
            Timing(clock,"export");
            }
            if(!File.Exists(output) || new FileInfo(output).Length<5) throw new Exception("没有生成PDF");
            // The PDF is complete here. The local helper can serve it while this
            // process finishes releasing Office COM objects.
            Console.WriteLine("OK"); Console.Out.Flush(); return 0;
        } catch(Exception e) {
            Console.Error.WriteLine((presentation?"PowerPoint":spreadsheet?"Excel":"Word")+"转换失败："+e.Message); return 1;
        } finally {
            if(doc!=null) {try {if(presentation){doc.Saved=-1;doc.Close();}else if(spreadsheet)doc.Close(false);else doc.Close(0);} catch{} try{Marshal.FinalReleaseComObject(doc);}catch{}}
            Timing(clock,"document-close");
            if(app!=null) {if(owned)try{if(spreadsheet||presentation)app.Quit();else app.Quit(0);}catch{} try{Marshal.FinalReleaseComObject(app);}catch{}}
            Timing(clock,"office-quit");
            // PowerPoint is a single-instance COM server. Let the owned instance finish exiting
            // before the caller starts the next conversion; never terminate other Office processes.
            if(presentation&&owned){
                doc=null;app=null;GC.Collect();GC.WaitForPendingFinalizers();
                Timing(clock,"com-finalize");
                if(presentationProcess!=0)try{using(var process=System.Diagnostics.Process.GetProcessById((int)presentationProcess))process.WaitForExit(5000);}catch{}
                Timing(clock,"wait-office-exit");
            }
            Timing(clock,"close");
        }
    }
    static void Timing(Stopwatch clock,string stage) {
        if(clock!=null)Console.Error.WriteLine("TIMING "+stage+" "+clock.ElapsedMilliseconds+"ms");
    }
    static dynamic OpenPresentation(dynamic app,string input) {
        // PowerPoint can briefly reject Open while its automation server is starting.
        for(int attempt=0;;attempt++) {
            try {return app.Presentations.Open(input,-1,0,0);}
            catch(COMException) {if(attempt>=2)throw;System.Threading.Thread.Sleep(700);}
        }
    }
    static void Validate(string input,string ext) {
        if(ext==".docx"||ext==".xlsx"||ext==".pptx") {
            try {using(var zip=ZipFile.OpenRead(input)) {
                if(zip.GetEntry(ext==".pptx"?"ppt/presentation.xml":ext==".xlsx"?"xl/workbook.xml":"word/document.xml")==null||zip.GetEntry("[Content_Types].xml")==null)throw new Exception("缺少文档内容");
                if(zip.Entries.Sum(e=>e.Length)>200L*1024*1024)throw new Exception("文档解压后过大");
                foreach(var entry in zip.Entries) {
                    if(entry.FullName.EndsWith("vbaProject.bin",StringComparison.OrdinalIgnoreCase))throw new Exception("不支持带宏文档");
                    if(ext==".xlsx"&&(entry.FullName.StartsWith("xl/macrosheets/",StringComparison.OrdinalIgnoreCase)||entry.FullName.StartsWith("xl/externalLinks/",StringComparison.OrdinalIgnoreCase)||entry.FullName.StartsWith("xl/queryTables/",StringComparison.OrdinalIgnoreCase)||entry.FullName=="xl/connections.xml"))throw new Exception("不支持宏或外部数据连接，请另存为静态XLSX");
                    if(entry.FullName.EndsWith(".rels",StringComparison.OrdinalIgnoreCase))using(var reader=new StreamReader(entry.Open())) {
                        var xml=new System.Xml.XmlDocument();xml.XmlResolver=null;
                        var settings=new System.Xml.XmlReaderSettings {DtdProcessing=System.Xml.DtdProcessing.Prohibit,XmlResolver=null,MaxCharactersInDocument=4*1024*1024};
                        using(var xr=System.Xml.XmlReader.Create(reader,settings))xml.Load(xr);
                        foreach(System.Xml.XmlElement rel in xml.GetElementsByTagName("Relationship"))
                            if(rel.GetAttribute("TargetMode")=="External"&&!rel.GetAttribute("Type").EndsWith("/hyperlink"))throw new Exception("文档含外部链接资源，请先在办公软件中嵌入资源再处理");
                    }
                }
            }}catch(Exception e){throw new Exception(ext.ToUpperInvariant()+"无效或不受支持："+e.Message);}
        } else {
            byte[] header=new byte[8];using(var stream=File.OpenRead(input))stream.Read(header,0,header.Length);
            if((ext==".doc"||ext==".xls"||ext==".ppt")&&!header.SequenceEqual(new byte[]{0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1}))throw new Exception("文档内容与扩展名不符");
            if(ext==".rtf" && System.Text.Encoding.ASCII.GetString(header).IndexOf("{\\rtf",StringComparison.Ordinal)!=0)throw new Exception("RTF内容无效");
        }
    }
}
