using System;
using System.IO;
using System.Runtime.InteropServices;
// Synthetic fixtures only. This never attaches to the user's workbook.
public static class ExcelFixture {
 [STAThread] public static int Main(string[] args){
  dynamic app=null,book=null;bool owned=false;
  try{
   string dir=Path.GetFullPath(args[0]);Directory.CreateDirectory(dir);
   app=Activator.CreateInstance(Type.GetTypeFromProgID("Excel.Application"));
   if((int)app.Workbooks.Count!=0)throw new Exception("Expected isolated Excel instance");
   owned=true;app.Visible=false;app.DisplayAlerts=false;app.AutomationSecurity=3;app.EnableEvents=false;
   book=app.Workbooks.Add();
   while((int)book.Worksheets.Count<3)book.Worksheets.Add(After:book.Worksheets[book.Worksheets.Count]);
   for(int n=1;n<=3;n++){
    dynamic s=book.Worksheets[n];s.Name=n==1?"中文模拟表":n==2?"横向模拟表":"隐藏页";
    s.Range["A1:D1"].Merge();s.Range["A1"].Value2="排版兼容测试 — 模拟数据";s.Range["A1"].Font.Size=18;
    s.Range["A3"].Value2="项目";s.Range["B3"].Value2="数量";s.Range["C3"].Value2="单价";s.Range["D3"].Value2="合计";
    s.Range["A4"].Value2="测试纸张";s.Range["B4"].Value2=3;s.Range["C4"].Value2=12;s.Range["D4"].Formula="=B4*C4";
    s.Range["A6:D6"].Merge();s.Range["A6"].Value2=n==3?"HIDDEN-NOT-EXPORTED":"EXCEL-SHEET-"+n+"-END";
    s.Range["A8"].Value2="中文、数字、公式、打印区域";
    s.Range["A30"].Value2="OUTSIDE-PRINT-AREA";
    s.Range["A1:D8"].Font.Name="宋体";s.Range["A3:D4"].Borders.LineStyle=1;s.Range["A1:D8"].RowHeight=30;
    s.Range["A:A"].ColumnWidth=28;s.Range["B:D"].ColumnWidth=14;
    s.PageSetup.PrintArea="$A$1:$D$8";s.PageSetup.PaperSize=9;s.PageSetup.Orientation=n==2?2:1;
    s.PageSetup.Zoom=false;s.PageSetup.FitToPagesWide=1;s.PageSetup.FitToPagesTall=1;
    if(n==3)s.Visible=0;
    Marshal.FinalReleaseComObject(s);
   }
   book.Worksheets[1].Activate();book.SaveAs(Path.Combine(dir,"中文表格.xlsx"),51);book.SaveAs(Path.Combine(dir,"旧版表格.xls"),56);
   Console.WriteLine("Created XLSX/XLS fixtures using Excel "+app.Version);return 0;
  }catch(Exception e){Console.Error.WriteLine(e.ToString());return 1;}
  finally{if(book!=null){try{book.Close(false);}catch{}try{Marshal.FinalReleaseComObject(book);}catch{}}if(app!=null){if(owned)try{app.Quit();}catch{}try{Marshal.FinalReleaseComObject(app);}catch{}}}
 }
}
