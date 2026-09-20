
const MAX_ROWS=500;
const MAX_WORKBOOK_BYTES=30*1024*1024;
const MAX_IMAGE_BYTES=5*1024*1024;
const ALLOWED_CURRENCIES=new Set(['USD','SAR','AED','CNY','EUR']);
import {resolveTaxonomyId} from './catalog-taxonomy.js';
const FIELD_ALIASES={
  sku:['sku','رمز المنتج','كود المنتج'],
  product:['product name','product','name','اسم المنتج','المنتج','اسم'],
  specs:['description','specifications','specs','الوصف','المواصفات'],
  unitPrice:['price','unit price','السعر','سعر الوحدة'],
  currency:['currency','العملة'],
  moq:['moq','minimum order','minimum order quantity','الحد الأدنى','الحد الادنى','الحد الأدنى للطلب'],
  stock:['stock','inventory','المخزون'],
  leadTime:['production days','lead time','production time','مدة الإنتاج','مدة الانتاج','أيام الإنتاج','ايام الانتاج'],
  category:['category','main category','التصنيف','التصنيف الرئيسي'],
  subcategory:['subcategory','sub category','التصنيف الفرعي'],
  country:['supply country','country of supply','origin country','بلد التوريد','دولة التوريد'],
  validUntil:['valid until','expiry date','expires','صالح حتى','تاريخ الصلاحية']
};
const IMAGE_ALIASES=Array.from({length:5},(_,i)=>[
  'image '+(i+1),'image'+(i+1),'photo '+(i+1),'photo'+(i+1),'صورة '+(i+1),'الصورة '+(i+1),'صورة'+(i+1),'الصورة'+(i+1)
]);

const textDecoder=new TextDecoder('utf-8');
const xmlDecode=value=>String(value??'')
  .replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"')
  .replaceAll('&apos;',"'").replaceAll('&amp;','&').trim();
const norm=value=>String(value??'').replace(/[\u200e\u200f\ufeff]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const contact=value=>/(?:https?:\/\/|www\.|wa\.me|@[a-z0-9]|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+|00)\d[\d\s()-]{7,})/i.test(String(value||''));
const colIndex=letters=>[...String(letters||'').toUpperCase()].reduce((n,c)=>n*26+(c.charCodeAt(0)-64),0)-1;
const resolvePath=(source,target)=>{
  if(!target)return '';
  if(target.startsWith('/'))return target.slice(1);
  const parts=source.split('/');parts.pop();
  for(const part of target.split('/')){
    if(!part||part==='.')continue;
    if(part==='..')parts.pop();else parts.push(part);
  }
  return parts.join('/');
};
const relsPath=source=>{
  const parts=source.split('/'),file=parts.pop();
  return [...parts,'_rels',file+'.rels'].join('/');
};
const attr=(tag,name)=>{
  const safe=String(name).replace(/[.*+?^$()|[\]\\]/g,'\\$&');
  const m=String(tag).match(new RegExp('(?:^|\\s)'+safe+'="([^"]*)"'));
  return m?xmlDecode(m[1]):'';
};
const tagText=(block,name)=>{
  const re=new RegExp('<(?:[\\w-]+:)?'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?'+name+'>','i');
  const m=String(block).match(re);return m?xmlDecode(m[1].replace(/<[^>]+>/g,'')):'';
};
const relationships=xml=>{
  const out=new Map();
  for(const m of String(xml).matchAll(/<Relationship\b[^>]*\/?>/g)){
    const id=attr(m[0],'Id'),target=attr(m[0],'Target');
    if(id&&target)out.set(id,target);
  }
  return out;
};
const uint16=(v,o)=>v.getUint16(o,true),uint32=(v,o)=>v.getUint32(o,true);

function zipReader(buffer){
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);
  let eocd=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-66000);i--){
    if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}
  }
  if(eocd<0)throw new Error('invalid_xlsx');
  const entriesCount=uint16(view,eocd+10),centralOffset=uint32(view,eocd+16),entries=new Map();
  let p=centralOffset;
  for(let i=0;i<entriesCount;i++){
    if(uint32(view,p)!==0x02014b50)throw new Error('invalid_xlsx');
    const method=uint16(view,p+10),compressedSize=uint32(view,p+20),size=uint32(view,p+24);
    const nameLen=uint16(view,p+28),extraLen=uint16(view,p+30),commentLen=uint16(view,p+32),localOffset=uint32(view,p+42);
    const name=textDecoder.decode(bytes.subarray(p+46,p+46+nameLen));
    entries.set(name,{method,compressedSize,size,localOffset});
    p+=46+nameLen+extraLen+commentLen;
  }
  async function read(name){
    const e=entries.get(name);if(!e)return null;
    const lp=e.localOffset;
    if(uint32(view,lp)!==0x04034b50)throw new Error('invalid_xlsx');
    const nameLen=uint16(view,lp+26),extraLen=uint16(view,lp+28),start=lp+30+nameLen+extraLen;
    const compressed=bytes.slice(start,start+e.compressedSize);
    if(e.method===0)return compressed;
    if(e.method!==8||typeof DecompressionStream==='undefined')throw new Error('unsupported_xlsx_compression');
    const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return {entries,read};
}

async function readXml(zip,path){
  const data=await zip.read(path);return data?textDecoder.decode(data):'';
}

function parseSharedStrings(xml){
  const out=[];
  for(const m of String(xml).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)){
    let value='';
    for(const t of m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g))value+=xmlDecode(t[1]);
    out.push(value);
  }
  return out;
}
function parseSheet(xml,shared){
  const rows=new Map();
  for(const rm of String(xml).matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)){
    const rowNo=Number(attr(rm[1],'r')||0);if(!rowNo)continue;
    const cells=new Map();
    for(const cm of rm[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)){
      const ref=attr(cm[1],'r'),type=attr(cm[1],'t'),letters=(ref.match(/[A-Z]+/i)||[''])[0],col=colIndex(letters);
      let value='';
      if(type==='inlineStr'){
        for(const t of cm[2].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g))value+=xmlDecode(t[1]);
      }else{
        const raw=tagText(cm[2],'v');
        value=type==='s'?shared[Number(raw)]??'':raw;
      }
      cells.set(col,String(value??'').trim());
    }
    rows.set(rowNo,cells);
  }
  return rows;
}
function findFirstWorksheet(workbookXml,relsXml){
  const sheetTag=String(workbookXml).match(/<sheet\b[^>]*\/?>/);
  if(!sheetTag)return 'xl/worksheets/sheet1.xml';
  const rid=attr(sheetTag[0],'r:id'),rels=relationships(relsXml),target=rels.get(rid);
  return target?resolvePath('xl/workbook.xml',target):'xl/worksheets/sheet1.xml';
}
function findDrawingPath(sheetXml,sheetPath,sheetRelsXml){
  const drawing=String(sheetXml).match(/<drawing\b[^>]*\/?>/);if(!drawing)return '';
  const rid=attr(drawing[0],'r:id'),rels=relationships(sheetRelsXml),target=rels.get(rid);
  return target?resolvePath(sheetPath,target):'';
}
function bytesToDataUrl(bytes,mime){
  let binary='';
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return 'data:'+mime+';base64,'+btoa(binary);
}
async function parseImages(zip,drawingPath){
  if(!drawingPath)return [];
  const drawingXml=await readXml(zip,drawingPath),relXml=await readXml(zip,relsPath(drawingPath)),rels=relationships(relXml),images=[];
  const anchorRe=/<(?:xdr:)?(?:twoCellAnchor|oneCellAnchor)\b[^>]*>([\s\S]*?)<\/(?:xdr:)?(?:twoCellAnchor|oneCellAnchor)>/g;
  for(const am of drawingXml.matchAll(anchorRe)){
    const block=am[1],from=(block.match(/<(?:xdr:)?from\b[^>]*>([\s\S]*?)<\/(?:xdr:)?from>/)||[])[1]||'';
    const row=Number(tagText(from,'row')),col=Number(tagText(from,'col'));
    const embed=(block.match(/r:embed="([^"]+)"/)||[])[1];if(!embed||!Number.isFinite(row)||!Number.isFinite(col))continue;
    const target=rels.get(embed);if(!target)continue;
    const path=resolvePath(drawingPath,target),bytes=await zip.read(path);if(!bytes)continue;
    const ext=(path.split('.').pop()||'').toLowerCase();
    const mime=ext==='png'?'image/png':ext==='jpg'||ext==='jpeg'?'image/jpeg':ext==='webp'?'image/webp':'';
    images.push({row:row+1,col,path,mime,size:bytes.length,source:mime?bytesToDataUrl(bytes,mime):''});
  }
  return images;
}
function sheetCellMetadata(xml){
  const out=new Map();
  for(const m of String(xml).matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)){
    const attrs=m[1]||m[3]||'',ref=attr(attrs,'r'),vm=Number(attr(attrs,'vm')||0);
    if(!ref||!vm)continue;
    const letters=(ref.match(/[A-Z]+/i)||[''])[0],row=Number((ref.match(/\d+/)||['0'])[0]),col=colIndex(letters);
    if(row>0&&col>=0)out.set(vm,{row,col});
  }
  return out;
}
function metadataRichIndexes(xml){
  const out=[];
  const block=(String(xml).match(/<valueMetadata\b[^>]*>([\s\S]*?)<\/valueMetadata>/i)||[])[1]||'';
  for(const bk of block.matchAll(/<bk\b[^>]*>([\s\S]*?)<\/bk>/g)){
    const rc=(bk[1].match(/<rc\b[^>]*\/?>/)||[])[0]||'',raw=attr(rc,'v');
    out.push(raw===''?null:Number(raw));
  }
  return out;
}
function richValueRelationSlots(xml){
  const out=[];
  for(const rv of String(xml).matchAll(/<rv\b[^>]*>([\s\S]*?)<\/rv>/g)){
    const values=[...rv[1].matchAll(/<v\b([^>]*)>([\s\S]*?)<\/v>/g)];
    let slot=null;
    for(const v of values){
      const kind=attr(v[1],'kind'),raw=xmlDecode(v[2].replace(/<[^>]+>/g,''));
      if(kind==='rel'){slot=Number(raw);break;}
    }
    if(slot===null&&values.length){
      const raw=xmlDecode(values[0][2].replace(/<[^>]+>/g,''));
      if(/^-?\d+$/.test(raw))slot=Number(raw);
    }
    out.push(Number.isFinite(slot)?slot:null);
  }
  return out;
}
function richValueRelIds(xml){
  return [...String(xml).matchAll(/<rel\b[^>]*\/?>/g)].map(m=>attr(m[0],'r:id')).filter(Boolean);
}
async function parseCellImages(zip,sheetXml){
  const cellByVm=sheetCellMetadata(sheetXml);
  if(!cellByVm.size)return [];
  const metadataXml=await readXml(zip,'xl/metadata.xml');
  if(!metadataXml)return [];
  const richIndexes=metadataRichIndexes(metadataXml);
  if(!richIndexes.length)return [];
  const paths=[...zip.entries.keys()];
  const richValuePath=paths.find(p=>/^xl\/richData\/(?:rd)?richvalue\.xml$/i.test(p));
  const richRelPath=paths.find(p=>/^xl\/richData\/richValueRel\.xml$/i.test(p));
  if(!richValuePath||!richRelPath)return [];
  const richValues=richValueRelationSlots(await readXml(zip,richValuePath));
  const relIds=richValueRelIds(await readXml(zip,richRelPath));
  const relMap=relationships(await readXml(zip,relsPath(richRelPath)));
  const images=[];
  for(const [vm,cell] of cellByVm){
    const richIndex=richIndexes[vm-1];
    if(richIndex===null||richIndex===undefined)continue;
    const slot=richValues[richIndex];
    if(slot===null||slot===undefined)continue;
    const rid=relIds[slot],target=relMap.get(rid);
    if(!target)continue;
    const path=resolvePath(richRelPath,target),bytes=await zip.read(path);
    if(!bytes)continue;
    const ext=(path.split('.').pop()||'').toLowerCase();
    const mime=ext==='png'?'image/png':ext==='jpg'||ext==='jpeg'?'image/jpeg':ext==='webp'?'image/webp':ext==='gif'?'image/gif':ext==='bmp'?'image/bmp':'';
    images.push({row:cell.row,col:cell.col,path,mime,size:bytes.length,source:mime?bytesToDataUrl(bytes,mime):''});
  }
  return images;
}

function headerVariants(value){
  const raw=String(value??'').replace(/[\u200e\u200f\ufeff]/g,'').trim();
  return [...new Set([norm(raw),...raw.split(/[\\/|\n\r•·:؛-]+/).map(norm)].filter(Boolean))];
}
function findHeader(rows){
  let best=null;
  for(const [rowNo,cells] of [...rows].filter(([n])=>n<=10)){
    const matches={};
    for(const [col,value] of cells){
      const variants=headerVariants(value);
      for(const [field,aliases] of Object.entries(FIELD_ALIASES))if(variants.some(v=>aliases.includes(v)))matches[field]=col;
      IMAGE_ALIASES.forEach((aliases,i)=>{if(variants.some(v=>aliases.includes(v)))matches['image'+(i+1)]=col;});
    }
    const score=Object.keys(matches).length;
    if(!best||score>best.score)best={rowNo,matches,score};
  }
  if(!best||best.score<6)throw new Error('headers_not_found');
  return best;
}
function excelDate(value){
  const s=String(value||'').trim();if(!s)return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  const n=Number(s);
  if(Number.isFinite(n)&&n>20000&&n<100000){
    const d=new Date(Date.UTC(1899,11,30)+n*86400000);
    return d.toISOString().slice(0,10);
  }
  const d=new Date(s);return Number.isNaN(d.getTime())?s:d.toISOString().slice(0,10);
}
function taxonomyId(value,rows){return resolveTaxonomyId(value,rows);}
export function normalizeSupplyCountry(value,rows=[]){return taxonomyId(value,rows);}

function crc32(bytes){
  let crc=0xffffffff;
  for(const b of bytes){
    crc^=b;
    for(let i=0;i<8;i++)crc=(crc>>>1)^(0xedb88320&-(crc&1));
  }
  return (crc^0xffffffff)>>>0;
}
const le16=n=>new Uint8Array([n&255,(n>>>8)&255]);
const le32=n=>new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);
function concatBytes(parts){
  const size=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(size);let off=0;
  for(const p of parts){out.set(p,off);off+=p.length;}return out;
}
function zipStoredFiles(files){
  const enc=new TextEncoder(),locals=[],centrals=[];let offset=0;
  for(const [name,text] of Object.entries(files)){
    const nameBytes=enc.encode(name),data=enc.encode(text),crc=crc32(data);
    const local=concatBytes([
      le32(0x04034b50),le16(20),le16(0),le16(0),le16(0),le16(0),le32(crc),le32(data.length),le32(data.length),
      le16(nameBytes.length),le16(0),nameBytes,data
    ]);
    const central=concatBytes([
      le32(0x02014b50),le16(20),le16(20),le16(0),le16(0),le16(0),le16(0),le32(crc),le32(data.length),le32(data.length),
      le16(nameBytes.length),le16(0),le16(0),le16(0),le16(0),le32(0),le32(offset),nameBytes
    ]);
    locals.push(local);centrals.push(central);offset+=local.length;
  }
  const centralData=concatBytes(centrals),localData=concatBytes(locals),count=centrals.length;
  const end=concatBytes([le32(0x06054b50),le16(0),le16(0),le16(count),le16(count),le32(centralData.length),le32(localData.length),le16(0)]);
  return concatBytes([localData,centralData,end]);
}
const xesc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const lettersFromIndex=i=>{let s='',n=i+1;while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;};
export function buildBulkProductTemplate(){
  const headers=['SKU','Image 1 / الصورة 1','Image 2 / الصورة 2','Image 3 / الصورة 3','Image 4 / الصورة 4','Image 5 / الصورة 5','Product Name / اسم المنتج','Description / الوصف','Price / السعر','Currency / العملة','MOQ / الحد الأدنى','Stock / المخزون','Production Days / مدة الإنتاج','Main Category / التصنيف الرئيسي','Subcategory / التصنيف الفرعي','Supply Country / بلد التوريد','Valid Until / صالح حتى'];
  const cells=headers.map((h,i)=>`<c r="${lettersFromIndex(i)}1" t="inlineStr"><is><t>${xesc(h)}</t></is></c>`).join('');
  const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${cells}</row></sheetData></worksheet>`;
  const files={
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Products" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':sheet
  };
  return zipStoredFiles(files);
}
export async function downloadBulkProductTemplate(){
  const name='M-Platform-products-template.xlsx';
  const type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const bytes=buildBulkProductTemplate();
  const file=new File([bytes],name,{type});
  if(typeof navigator!=='undefined'&&typeof navigator.share==='function'&&
     (!navigator.canShare||navigator.canShare({files:[file]}))){
    try{
      await navigator.share({files:[file],title:'M Platform Excel template'});
      return {method:'share'};
    }catch(error){
      if(error?.name==='AbortError')return {method:'cancelled'};
    }
  }
  const blob=new Blob([bytes],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
  return {method:'download'};
}


export function validateBulkProductRows(input,{categories=[],subcategories=[],supplyCountries=[],existingOffers=[]}={}){
  const rows=input.map(r=>({...r,errors:[],warnings:[],duplicateOfferId:'',duplicateOfferVersion:0}));
  const skuCounts=new Map();
  rows.forEach(r=>skuCounts.set(norm(r.sku),(skuCounts.get(norm(r.sku))||0)+1));
  const existingBySku=new Map((existingOffers||[]).filter(o=>o.sku).map(o=>[norm(o.sku),o]));
  for(const r of rows){
    const errors=[],warnings=[];
    r.sku=String(r.sku||'').trim().slice(0,80);
    r.product=String(r.product||'').trim().slice(0,300);
    r.specs=String(r.specs||'').trim().slice(0,10000);
    r.currency=String(r.currency||'').trim().toUpperCase();
    r.categoryId=taxonomyId(r.category||r.categoryId,categories);
    r.subcategoryId=taxonomyId(r.subcategory||r.subcategoryId,subcategories.filter(x=>!r.categoryId||x.parentId===r.categoryId));
    r.country=normalizeSupplyCountry(r.country,supplyCountries)||String(r.country||'').trim();
    r.validUntil=excelDate(r.validUntil);
    if(!/^[A-Za-z0-9._-]{1,80}$/.test(r.sku))errors.push('sku');
    if(skuCounts.get(norm(r.sku))>1)errors.push('duplicate_sku');
    if(!r.product)errors.push('product');
    if(!r.specs)errors.push('specs');
    if(contact(r.product)||contact(r.specs))errors.push('contact');
    if(!(Number(r.unitPrice)>0))errors.push('unitPrice');
    if(!ALLOWED_CURRENCIES.has(r.currency))errors.push('currency');
    if(!(Number.isInteger(Number(r.moq))&&Number(r.moq)>0))errors.push('moq');
    if(r.stock!==''&&r.stock!==undefined&&!(Number.isFinite(Number(r.stock))&&Number(r.stock)>=0))errors.push('stock');
    if(!(Number(r.leadTime)>0))errors.push('leadTime');
    if(!r.categoryId)errors.push('category');
    if((r.subcategory||r.subcategoryId)&&!r.subcategoryId)errors.push('subcategory');
    if(!supplyCountries.some(x=>x.id===r.country))errors.push('country');
    if(r.validUntil&&!/^\d{4}-\d{2}-\d{2}$/.test(r.validUntil))errors.push('validUntil');
    r.images=(r.images||[]).filter(Boolean).slice(0,5);
    if(!r.images.length)errors.push('images');
    if(r.images.some(img=>!img.mime||img.size>MAX_IMAGE_BYTES))errors.push('image_format');
    const existing=existingBySku.get(norm(r.sku));
    if(existing){
      r.duplicateOfferId=existing.id;r.duplicateOfferVersion=existing.version;
      r.duplicateAction=r.duplicateAction||'skip';
      warnings.push('existing_sku');
    }else r.duplicateAction='create';
    r.errors=[...new Set(errors)];r.warnings=[...new Set(warnings)];
  }
  return rows;
}

export async function parseBulkProductWorkbook(file,context={}){
  if(!file||!String(file.name||'').toLowerCase().endsWith('.xlsx'))throw new Error('xlsx_only');
  if(file.size>MAX_WORKBOOK_BYTES)throw new Error('workbook_too_large');
  const buffer=await file.arrayBuffer(),zip=zipReader(buffer);
  const workbookXml=await readXml(zip,'xl/workbook.xml'),workbookRels=await readXml(zip,'xl/_rels/workbook.xml.rels');
  const sheetPath=findFirstWorksheet(workbookXml,workbookRels);
  const sheetXml=await readXml(zip,sheetPath);
  if(!sheetXml)throw new Error('invalid_xlsx');
  const shared=parseSharedStrings(await readXml(zip,'xl/sharedStrings.xml'));
  const sheetRows=parseSheet(sheetXml,shared),header=findHeader(sheetRows),sheetRels=await readXml(zip,relsPath(sheetPath));
  const drawingPath=findDrawingPath(sheetXml,sheetPath,sheetRels);
  const pictures=[...(await parseImages(zip,drawingPath)),...(await parseCellImages(zip,sheetXml))];
  const rows=[];
  for(const [rowNo,cells] of [...sheetRows].sort((a,b)=>a[0]-b[0])){
    if(rowNo<=header.rowNo)continue;
    const get=field=>cells.get(header.matches[field])??'';
    const hasData=['sku','product','specs','unitPrice','moq'].some(k=>String(get(k)).trim());
    const rowImages=[];
    for(let i=1;i<=5;i++){
      const col=header.matches['image'+i];
      if(col===undefined)continue;
      const pic=pictures.find(x=>x.row===rowNo&&x.col===col);
      if(pic)rowImages.push(pic);
    }
    if(!hasData&&!rowImages.length)continue;
    rows.push({
      rowNumber:rowNo,sku:get('sku'),product:get('product'),specs:get('specs'),
      unitPrice:get('unitPrice'),currency:get('currency'),moq:get('moq'),stock:get('stock'),
      leadTime:get('leadTime'),category:get('category'),categoryId:'',subcategory:get('subcategory'),subcategoryId:'',
      country:get('country'),validUntil:get('validUntil'),images:rowImages,duplicateAction:'create'
    });
    if(rows.length>MAX_ROWS)throw new Error('too_many_rows');
  }
  if(!rows.length)throw new Error('no_products');
  return validateBulkProductRows(rows,context);
}
