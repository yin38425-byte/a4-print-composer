using System;
using System.IO;
using System.Runtime.InteropServices;
// Converts only the generated legacy fixture to PPT for compatibility testing.
public static class PptFixture {
    [STAThread] public static int Main(string[] args) {
        dynamic app=null, doc=null; bool owned=false;
        try {
            app=Activator.CreateInstance(Type.GetTypeFromProgID("PowerPoint.Application"));
            if((int)app.Presentations.Count!=0)throw new Exception("Close existing PowerPoint documents before running fixture creation.");
            owned=true;app.AutomationSecurity=3;app.DisplayAlerts=1;
            doc=app.Presentations.Open(Path.GetFullPath(args[0]),-1,0,0);
            doc.SaveAs(Path.GetFullPath(args[1]),1);
            if(args.Length>2){
                doc.Close();Marshal.FinalReleaseComObject(doc);doc=null;
                doc=app.Presentations.Add(0);doc.PageSetup.SlideWidth=864;doc.PageSetup.SlideHeight=486;
                dynamic first=doc.Slides.Add(1,12);
                first.Shapes.AddTextbox(1,40,20,780,60).TextFrame.TextRange.Text="PPTX-1 中文演示：多格式混合排版";
                first.Shapes.AddPicture(Path.Combine(args[2],"video-poster.png"),0,-1,72,130,288,162);
                dynamic second=doc.Slides.Add(2,12);
                second.Shapes.AddTextbox(1,40,20,780,60).TextFrame.TextRange.Text="PPTX-2 视频封面验证：红色与青色";
                dynamic video=second.Shapes.AddMediaObject2(Path.Combine(args[2],"synthetic-video.avi"),0,-1,144,108,576,324);
                video.MediaFormat.SetDisplayPictureFromFile(Path.Combine(args[2],"video-poster.png"));
                Console.WriteLine("Embedded video duration(ms): "+video.MediaFormat.Length);
                dynamic third=doc.Slides.Add(3,12);
                third.Shapes.AddTextbox(1,40,20,780,60).TextFrame.TextRange.Text="PPTX-3 隐藏页也应按原顺序导入";
                third.SlideShowTransition.Hidden=-1;
                doc.SaveAs(Path.Combine(args[2],"native-video.pptx"),24);
            }
            Console.WriteLine("Created legacy PPT using PowerPoint "+app.Version);return 0;
        } catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
        finally {
            if(doc!=null){try{doc.Close();}catch{}try{Marshal.FinalReleaseComObject(doc);}catch{}}
            if(app!=null){if(owned)try{app.Quit();}catch{}try{Marshal.FinalReleaseComObject(app);}catch{}}
        }
    }
}
