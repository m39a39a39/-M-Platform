const A4={width:1240,height:1754};
const COLORS={navy:'#102a43',ink:'#1f2933',muted:'#66788a',line:'#d9e2ec',soft:'#f4f7fa',paid:'#16794a'};

const safe=value=>String(value??'');
const money=value=>{
  const n=Number(value);
  return Number.isFinite(n)?new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n):'0.00';
};
const rtl=value=>/[\u0600-\u06FF]/.test(safe(value));
function text(ctx,value,x,y,{size=26,weight=400,align='left',maxWidth,direction}={}){
  ctx.save();
  ctx.font=`${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
  ctx.fillStyle=COLORS.ink;ctx.textAlign=align;ctx.textBaseline='alphabetic';
  ctx.direction=direction||(rtl(value)?'rtl':'ltr');ctx.fillText(safe(value),x,y,maxWidth);ctx.restore();
}
function fitted(ctx,value,x,y,maxWidth,{size=26,weight=400,align='left'}={}){
  let output=safe(value),fontSize=size;ctx.save();
  while(fontSize>18){ctx.font=`${weight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;if(ctx.measureText(output).width<=maxWidth)break;fontSize-=1;}
  if(ctx.measureText(output).width>maxWidth){while(output.length>3&&ctx.measureText(output+'…').width>maxWidth)output=output.slice(0,-1);output+='…';}
  ctx.restore();text(ctx,output,x,y,{size:fontSize,weight,align,maxWidth});
}
function rounded(ctx,x,y,w,h,r,fill,stroke){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);
  if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
}
function customerLines(customer={}){
  return [customer.company,customer.name,customer.address,[customer.country,customer.phone].filter(Boolean).join(' · '),customer.email].filter(Boolean);
}
function drawInvoice(invoice,{orderNo=''}={}){
  const canvas=document.createElement('canvas');canvas.width=A4.width;canvas.height=A4.height;
  const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,A4.width,A4.height);

  ctx.fillStyle=COLORS.navy;ctx.fillRect(0,0,A4.width,185);ctx.fillStyle='#fff';
  ctx.font='800 38px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';ctx.fillText(invoice.company?.nameEn||'GUANGZHOU MIG TRADING CO., LTD.',70,72);
  ctx.font='600 28px -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", Arial, sans-serif';ctx.fillText(invoice.company?.nameZh||'广州米各贸易有限公司',70,118);
  ctx.font='400 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';ctx.fillText(invoice.company?.address||'',70,151);
  ctx.fillText([invoice.company?.phone,invoice.company?.email].filter(Boolean).join('  •  '),70,176);

  const isFinal=invoice.kind==='final';
  text(ctx,isFinal?'FINAL INVOICE':'PROFORMA INVOICE',1170,245,{size:38,weight:800,align:'right'});
  if(isFinal){rounded(ctx,1000,268,170,58,12,'#e8f5ee',COLORS.paid);ctx.fillStyle=COLORS.paid;ctx.font='900 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';ctx.textAlign='center';ctx.fillText('PAID',1085,307);}
  text(ctx,'Invoice No.',70,248,{size:18,weight:600});text(ctx,invoice.number,70,282,{size:28,weight:800});
  text(ctx,'Date',380,248,{size:18,weight:600});text(ctx,new Date(invoice.issuedAt||Date.now()).toLocaleDateString('en-GB'),380,282,{size:25,weight:700});
  text(ctx,'Order No.',650,248,{size:18,weight:600});text(ctx,orderNo||invoice.orderNo||invoice.orderId||'—',650,282,{size:25,weight:700});
  text(ctx,'Currency',830,248,{size:18,weight:600});text(ctx,'SAR – Saudi Riyal',830,282,{size:23,weight:700});

  rounded(ctx,70,350,1100,170,18,COLORS.soft,COLORS.line);text(ctx,'BILL TO',95,390,{size:19,weight:800});
  const lines=customerLines(invoice.customer);lines.slice(0,4).forEach((v,index)=>fitted(ctx,v,95,430+index*30,980,{size:index===0?25:21,weight:index===0?700:500}));

  const top=570,rowH=72;ctx.fillStyle=COLORS.navy;ctx.fillRect(70,top,1100,58);ctx.fillStyle='#fff';
  ctx.font='800 19px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';ctx.textAlign='left';ctx.fillText('PRODUCT',92,top+37);
  ctx.textAlign='center';ctx.fillText('QTY',745,top+37);ctx.fillText('UNIT PRICE',905,top+37);ctx.fillText('TOTAL',1095,top+37);
  const rows=(invoice.items||[]).slice(0,10);
  rows.forEach((item,index)=>{
    const y=top+58+index*rowH;ctx.fillStyle=index%2?'#fff':COLORS.soft;ctx.fillRect(70,y,1100,rowH);
    ctx.strokeStyle=COLORS.line;ctx.beginPath();ctx.moveTo(70,y+rowH);ctx.lineTo(1170,y+rowH);ctx.stroke();
    fitted(ctx,item.description||item.product||item.sku||'Product',92,y+31,570,{size:22,weight:650});
    if(item.sku)fitted(ctx,'SKU: '+item.sku,92,y+56,570,{size:16,weight:400});
    text(ctx,item.quantity,745,y+43,{size:21,weight:600,align:'center'});
    text(ctx,money(item.unitPrice)+' SAR',905,y+43,{size:20,weight:600,align:'center'});
    text(ctx,money(item.total)+' SAR',1095,y+43,{size:20,weight:800,align:'center'});
  });
  const tableBottom=top+58+rows.length*rowH,summaryY=Math.max(tableBottom+45,1365);
  ctx.strokeStyle=COLORS.navy;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(760,summaryY);ctx.lineTo(1170,summaryY);ctx.stroke();
  text(ctx,'TOTAL',790,summaryY+48,{size:24,weight:800});text(ctx,money(invoice.total)+' SAR',1155,summaryY+48,{size:28,weight:900,align:'right'});
  text(ctx,'Saudi Riyal (SAR)',1155,summaryY+78,{size:17,weight:500,align:'right'});

  ctx.strokeStyle=COLORS.line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(70,1620);ctx.lineTo(1170,1620);ctx.stroke();
  text(ctx,'GUANGZHOU MIG TRADING CO., LTD.  ·  广州米各贸易有限公司',70,1660,{size:18,weight:700});
  text(ctx,'Corporate invoice generated by M Platform. No banking details are shown on this document.',70,1692,{size:16,weight:400});
  return canvas;
}
const bytes=value=>new TextEncoder().encode(value);
const concat=parts=>{const total=parts.reduce((sum,p)=>sum+p.length,0),out=new Uint8Array(total);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;};
async function canvasJpeg(canvas){
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(new Error('pdf_image_failed')),'image/jpeg',0.94));
  return new Uint8Array(await blob.arrayBuffer());
}
async function makePdf(canvas){
  const jpeg=await canvasJpeg(canvas),content=bytes('q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n');
  const objects=[null,bytes('<< /Type /Catalog /Pages 2 0 R >>'),bytes('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    bytes('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'),
    concat([bytes(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),jpeg,bytes('\nendstream')]),
    concat([bytes(`<< /Length ${content.length} >>\nstream\n`),content,bytes('endstream')])];
  const header=bytes('%PDF-1.4\n%MIG\n'),parts=[header],offsets=[0];let offset=header.length;
  for(let i=1;i<objects.length;i++){const obj=concat([bytes(`${i} 0 obj\n`),objects[i],bytes('\nendobj\n')]);offsets[i]=offset;parts.push(obj);offset+=obj.length;}
  const xrefOffset=offset;let xref=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let i=1;i<objects.length;i++)xref+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  xref+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;parts.push(bytes(xref));
  return new Blob([concat(parts)],{type:'application/pdf'});
}
export async function downloadInvoicePdf(invoice,{orderNo=''}={}){
  if(!invoice?.number)throw new Error('invoice_unavailable');
  const canvas=drawInvoice(invoice,{orderNo}),pdf=await makePdf(canvas),fileName=`${invoice.number}.pdf`;
  if(typeof File!=='undefined'&&navigator.share&&navigator.canShare){
    const file=new File([pdf],fileName,{type:'application/pdf'});
    if(navigator.canShare({files:[file]})){await navigator.share({files:[file],title:fileName});return;}
  }
  const url=URL.createObjectURL(pdf),link=document.createElement('a');link.href=url;link.download=fileName;link.rel='noopener';document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
