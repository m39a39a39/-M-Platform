import test from 'node:test';
import assert from 'node:assert/strict';
import {createStoreDB,withLocalAPI,ids} from './helpers/store-db.mjs';
import {bulkSupplySources} from '../backend/modules/bulk-supply-sources.mjs';
import {submitSupplySource,reviewSupplySource,approvedSource} from '../backend/modules/supply-sources.mjs';
import {snapshot} from '../backend/modules/records.mjs';
const admin={id:ids.admin,role:'admin',is_owner:true},supplier={id:ids.supplier,role:'supplier'};
const terms={unitPrice:5,currency:'SAR',moq:2,stock:100,leadTime:7,country:'China'};
const proposal={sku:'BULK-1',product:'منتج',specs:'وصف',categoryId:'cat',subcategoryId:'',images:['/api/media/'+ids.media]};
test('bulk source editing validates permissions, commits atomically, rejects stale versions and soft deletes',async()=>{
 const pg=await createStoreDB();try{await withLocalAPI(pg,async()=>{
 const a=await submitSupplySource(supplier,{terms,proposal});const b=await submitSupplySource(supplier,{terms,proposal:{...proposal,sku:'BULK-2'}});
 const item=(id,patch,version=1)=>({id,version,patch});
 await assert.rejects(()=>bulkSupplySources(supplier,{items:[item(a.sourceId,{terms:{stock:0}})]}),e=>e.status===403);
 await assert.rejects(()=>bulkSupplySources({...admin,is_owner:false,permissions:['offers.edit']},{items:[{id:a.sourceId,version:1,delete:true}]}),e=>e.status===403);
 await assert.rejects(()=>bulkSupplySources(admin,{items:[item(a.sourceId,{terms:{stock:0}}),item(b.sourceId,{terms:{moq:-1}})]}),e=>e.status===400);
 assert.equal((await snapshot(admin)).supplySources.find(s=>s.id===a.sourceId).terms.stock,100);
 await assert.rejects(()=>bulkSupplySources(admin,{items:[item(a.sourceId,{terms:{stock:0}}),item(a.sourceId,{terms:{stock:2}})]}),e=>e.status===400);
 await assert.rejects(()=>bulkSupplySources(admin,{items:Array.from({length:21},()=>item(a.sourceId,{terms:{stock:0}}))}),e=>e.status===400);
 await bulkSupplySources(admin,{items:[item(a.sourceId,{terms:{stock:0},proposal:{product:'اسم جديد'}}),item(b.sourceId,{terms:{unitPrice:9}})]});
 let sources=(await snapshot(admin)).supplySources;assert.equal(sources.find(s=>s.id===a.sourceId).terms.stock,0);assert.equal(sources.find(s=>s.id===a.sourceId).proposal.product,'اسم جديد');
 await assert.rejects(()=>bulkSupplySources(admin,{items:[item(a.sourceId,{terms:{stock:5}})]}),e=>e.status===409);
 await bulkSupplySources(admin,{items:[{id:a.sourceId,version:2,delete:true}]});
 assert.equal((await snapshot(admin)).supplySources.length,1);assert.equal((await snapshot(supplier)).supplySources.length,1);
 await assert.rejects(()=>reviewSupplySource(admin,{id:a.sourceId,version:3,action:'reject'}),e=>e.status===409);
 const deleted=(await pg.query('select data from supply_sources where id=$1',[a.sourceId])).rows[0];assert.ok(deleted.data.deletedAt);assert.equal(deleted.data.status,'rejected');
 });}finally{await pg.close();}
});
test('editing approved terms requires re-review; removing a source preserves its store product',async()=>{
 const pg=await createStoreDB();try{await withLocalAPI(pg,async()=>{
 const a=await submitSupplySource(supplier,{terms,proposal});
 const approved=await reviewSupplySource(admin,{id:a.sourceId,version:1,action:'approve',salePrice:20,currency:'SAR',translation:{titleAr:'منتج',titleEn:'Product',descriptionAr:'وصف',descriptionEn:'Description'},redactionConfirmed:true});
 await bulkSupplySources(admin,{items:[{id:a.sourceId,version:2,patch:{terms:{unitPrice:8}}}]});
 assert.equal((await snapshot(admin)).supplySources[0].status,'pending');assert.equal((await snapshot(null)).publicOffers[0].unitPrice,20);
 await assert.rejects(()=>approvedSource(approved.productId,supplier.id),e=>e.status===409);
 await reviewSupplySource(admin,{id:a.sourceId,version:3,action:'approve'});
 await bulkSupplySources(admin,{items:[{id:a.sourceId,version:4,delete:true}]});
 assert.equal((await snapshot(null)).publicOffers[0].id,approved.productId);
 await assert.rejects(()=>approvedSource(approved.productId,supplier.id),e=>e.status===409);
 await assert.rejects(()=>submitSupplySource(supplier,{sourceId:a.sourceId,version:5,terms}),e=>e.status===403);
 });}finally{await pg.close();}
});
