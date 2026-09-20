import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBulkProductWorkbook} from '../src/bulk-excel.js';

const enc=new TextEncoder();
const le16=n=>new Uint8Array([n&255,(n>>>8)&255]);
const le32=n=>new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);
const concat=parts=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let o=0;for(const p of parts){out.set(p,o);o+=p.length;}return out;};
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^(0xedb88320&-(crc&1));}return (crc^0xffffffff)>>>0;}
function zip(files){
  const locals=[],centrals=[];let offset=0;
  for(const [name,value] of Object.entries(files)){
    const n=enc.encode(name),data=typeof value==='string'?enc.encode(value):value,crc=crc32(data);
    const local=concat([le32(0x04034b50),le16(20),le16(0),le16(0),le16(0),le16(0),le32(crc),le32(data.length),le32(data.length),le16(n.length),le16(0),n,data]);
    const central=concat([le32(0x02014b50),le16(20),le16(20),le16(0),le16(0),le16(0),le16(0),le32(crc),le32(data.length),le32(data.length),le16(n.length),le16(0),le16(0),le16(0),le16(0),le32(0),le32(offset),n]);
    locals.push(local);centrals.push(central);offset+=local.length;
  }
  const ld=concat(locals),cd=concat(centrals);
  return concat([ld,cd,le32(0x06054b50),le16(0),le16(0),le16(centrals.length),le16(centrals.length),le32(cd.length),le32(ld.length),le16(0)]);
}
const cell=(ref,value)=>'<c r="'+ref+'" t="inlineStr"><is><t>'+value+'</t></is></c>';

test('parses product name and modern Excel Place in Cell image',async()=>{
  const headers=[
    cell('A1','SKU'),cell('B1','Image 1\nالصورة 1'),cell('C1','Product Name\nاسم المنتج'),
    cell('D1','Description / الوصف'),cell('E1','Price / السعر'),cell('F1','Currency / العملة'),
    cell('G1','MOQ / الحد الأدنى'),cell('H1','Stock / المخزون'),
    cell('I1','Production Days / مدة الإنتاج'),cell('J1','Category / التصنيف'),
    cell('K1','Supply Country / بلد التوريد')
  ].join('');
  const values=[
    cell('A2','MG825'),'<c r="B2" vm="1"><v>0</v></c>',cell('C2','MG 825 Earbuds'),
    cell('D2','Wireless TWS earbuds'),'<c r="E2"><v>8.5</v></c>',cell('F2','USD'),
    '<c r="G2"><v>100</v></c>','<c r="H2"><v>5000</v></c>','<c r="I2"><v>7</v></c>',
    cell('J2','Audio'),cell('K2','China')
  ].join('');
  const sheet='<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">'+headers+'</row><row r="2">'+values+'</row></sheetData></worksheet>';
  const bytes=zip({
    '[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':'<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Products" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':sheet,
    'xl/metadata.xml':'<?xml version="1.0"?><metadata><valueMetadata count="1"><bk><rc t="1" v="0"/></bk></valueMetadata></metadata>',
    'xl/richData/richValue.xml':'<?xml version="1.0"?><rvData><rv type="0"><v kind="rel">0</v></rv></rvData>',
    'xl/richData/richValueRel.xml':'<?xml version="1.0"?><rvRel xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><rels><rel r:id="rId1"/></rels></rvRel>',
    'xl/richData/_rels/richValueRel.xml.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="image" Target="../media/image1.png"/></Relationships>',
    'xl/media/image1.png':Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0])
  });
  const file={name:'in-cell.xlsx',size:bytes.length,async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}};
  const rows=await parseBulkProductWorkbook(file,{categories:[{id:'audio',nameAr:'سماعات',nameEn:'Audio',active:true}]});
  assert.equal(rows.length,1);
  assert.equal(rows[0].product,'MG 825 Earbuds');
  assert.equal(rows[0].images.length,1);
  assert.equal(rows[0].images[0].mime,'image/png');
  assert.equal(rows[0].categoryId,'audio');
  assert.deepEqual(rows[0].errors,[]);
});
