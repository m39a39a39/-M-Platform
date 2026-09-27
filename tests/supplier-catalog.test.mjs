import test from 'node:test';import assert from 'node:assert/strict';
import {createStoreDB,withLocalAPI,ids} from './helpers/store-db.mjs';
import {supplierCatalog,supplierCatalogQuery} from '../backend/modules/supplier-catalog.mjs';
import {snapshot} from '../backend/modules/records.mjs';
const supplier={id:ids.supplier,role:'supplier'};
test('supplier catalog: bounded pages, combined filters, literal search, privacy and permissions on actual SQL',async()=>{
 const pg=await createStoreDB();try{await pg.exec('alter table public_offers add column display_no bigint');
 for(let i=0;i<45;i++)await pg.query('insert into public_offers(id,owner_id,data,display_no) values($1,null,$2,$3)',[crypto.randomUUID(),JSON.stringify({storeOwned:true,status:'published',product:'منتج '+i,sku:'SKU-'+i,categoryId:i%2?'a':'b',subcategoryId:i%2?'a1':'b1',country:i%3?'China':'UAE',translation:{titleEn:'Product '+i},unitPrice:9,supplierCost:2,supplierId:ids.other,contact:'secret'}),10000+i]);
 await withLocalAPI(pg,async()=>{
 const get=p=>supplierCatalog(supplier,new URLSearchParams(p));
 const first=await get({});const second=await get({page:2});const third=await get({page:3});assert.equal(first.items.length,20);assert.equal(second.items.length,20);assert.equal(third.items.length,5);assert.equal(third.hasMore,false);assert.equal(new Set([...first.items,...second.items,...third.items].map(p=>p.id)).size,45);assert.doesNotMatch(JSON.stringify(first),/supplierCost|supplierId|secret/);
 assert.equal((await snapshot(supplier)).publicOffers.length,0);
 const combined=await get({q:'SKU-1',category:'a',subcategory:'a1',country:'China'});assert.ok(combined.items.length>0);assert.ok(combined.items.every(p=>p.sku.includes('SKU-1')&&p.categoryId==='a'&&p.subcategoryId==='a1'&&p.country==='China'));
 assert.equal((await get({q:'#10003'})).items[0].displayNo,10003);
 assert.equal((await get({q:'Product 44'})).items.length,1);
 for(const q of ['%','*','_(x),data->>status.eq.pending','"'])assert.equal((await get({q})).items.length,0);
 await assert.rejects(()=>supplierCatalog({id:ids.client,role:'client'},new URLSearchParams()),e=>e.status===403);
 await assert.rejects(()=>supplierCatalog({...supplier,blocked_at:new Date().toISOString()},new URLSearchParams()),e=>e.status===403);
 for(const p of [{pageSize:1000},{page:0},{page:1.5},{q:'x'.repeat(201)}])assert.throws(()=>supplierCatalogQuery(new URLSearchParams(p)));
 });}finally{await pg.close();}
});
