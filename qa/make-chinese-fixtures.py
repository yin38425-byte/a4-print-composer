"""Synthetic Chinese layout fixtures only; no genuine invoice or personal data."""
from io import BytesIO
import base64,json
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image,ImageDraw,ImageFont
font_path=r'C:\Windows\Fonts\simhei.ttf'
pdfmetrics.registerFont(TTFont('ChineseQA',font_path))
buf=BytesIO(); c=canvas.Canvas(buf,pagesize=(600,360))
for n in (1,2):
 c.setFont('ChineseQA',22);c.drawString(24,320,'中文排版测试样张 — 非真实发票')
 c.setFont('ChineseQA',16)
 for i,text in enumerate(['用途：仅验证汉字、数字及标点显示','测试文字：购买方、销售方、价税合计','测试金额：壹仟贰佰叁拾肆元伍角陆分','数字示例：1234.56（不代表真实交易）',f'来源页码：第 {n} 页，共 2 页']):
  c.drawString(24,275-i*38,text)
 c.rect(12,12,576,336);c.showPage()
c.save()
files={'chinese-multipage.pdf':base64.b64encode(buf.getvalue()).decode()}
for ext in ('png','jpg'):
 im=Image.new('RGB',(1000,500),'white');d=ImageDraw.Draw(im);f=ImageFont.truetype(font_path,36)
 for i,t in enumerate(['中文图片排版测试 — 非真实发票','不进行文字识别：只保留图片内容','购买方 / 销售方 / 金额 / 测试标点￥','文件格式：'+ext.upper()]):d.text((30,40+i*100),t,font=f,fill=(20,50,40))
 d.rectangle((10,10,990,490),outline=(30,100,90),width=3)
 out=BytesIO();im.save(out,format='JPEG' if ext=='jpg' else 'PNG');files['chinese-image.'+ext]=base64.b64encode(out.getvalue()).decode()
print(json.dumps(files))
