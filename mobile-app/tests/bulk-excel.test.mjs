import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBulkProductTemplate,
  normalizeSupplyCountry,
  parseBulkProductWorkbook,
  validateBulkProductRows
} from '../src/bulk-excel.js';

test('normalizes supported supply countries',()=>{
  assert.equal(normalizeSupplyCountry('الصين'),'China');
  assert.equal(normalizeSupplyCountry('中国'),'China');
  assert.equal(normalizeSupplyCountry('UAE'),'United Arab Emirates');
  assert.equal(normalizeSupplyCountry('الإمارات العربية المتحدة'),'United Arab Emirates');
  assert.equal(normalizeSupplyCountry('Saudi Arabia'),'');
});

test('bulk row validation checks required fields and existing SKU safely',()=>{
  const image={mime:'image/jpeg',size:1200,source:'data:image/jpeg;base64,/9j/AA=='};
  const categories=[{id:'audio',nameAr:'سماعات',nameEn:'Audio',active:true}];
  const existingOffers=[{id:'offer-1',version:4,sku:'MG825'}];
  const rows=validateBulkProductRows([{
    rowNumber:2,sku:'MG825',product:'TWS Earbuds',specs:'Bluetooth earbuds',
    unitPrice:'8.5',currency:'usd',moq:'100',stock:'5000',leadTime:'7',
    category:'سماعات',country:'الصين',validUntil:'2026-12-31',images:[image]
  }],{categories,existingOffers});
  assert.deepEqual(rows[0].errors,[]);
  assert.equal(rows[0].currency,'USD');
  assert.equal(rows[0].categoryId,'audio');
  assert.equal(rows[0].country,'China');
  assert.equal(rows[0].duplicateOfferId,'offer-1');
  assert.equal(rows[0].duplicateAction,'skip');
  assert.ok(rows[0].warnings.includes('existing_sku'));
});

test('bulk validation catches duplicate SKU within workbook',()=>{
  const image={mime:'image/png',size:1200,source:'data:image/png;base64,iVBORw0KGgo='};
  const categories=[{id:'audio',nameAr:'سماعات',nameEn:'Audio',active:true}];
  const base={product:'X',specs:'Y',unitPrice:'1',currency:'USD',moq:'1',stock:'1',leadTime:'1',category:'audio',country:'China',images:[image]};
  const rows=validateBulkProductRows([
    {rowNumber:2,sku:'ABC',...base},
    {rowNumber:3,sku:'ABC',...base}
  ],{categories});
  assert.ok(rows.every(r=>r.errors.includes('duplicate_sku')));
});

test('generated template is a readable xlsx with expected headers',async()=>{
  const bytes=buildBulkProductTemplate();
  const file={
    name:'template.xlsx',
    size:bytes.length,
    async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}
  };
  await assert.rejects(
    ()=>parseBulkProductWorkbook(file,{categories:[]}),
    error=>error?.message==='no_products'
  );
});
