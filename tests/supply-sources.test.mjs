import test from 'node:test';import assert from 'node:assert/strict';
import {createStoreDB,applySourceMigration,withLocalAPI,ids} from './helpers/store-db.mjs';
import {submitSupplySource,reviewSupplySource} from '../backend/modules/supply-sources.mjs';
import {snapshot} from '../backend/modules/records.mjs';
import {mutate,moderate} from '../backend/modules/mutations.mjs';
import {createCartOrder} from '../backend/modules/cart-orders.mjs';
import {assignSupplier} from '../backend/modules/fulfillment.mjs';
const admin={id:ids.admin,role:'admin',is_owner:true},supplier={id:ids.supplier,role:'supplier'},other={id:ids.other,role:'supplier'},client={id:ids.client,role:'client'};
const terms={unitPrice:5,currency:'SAR',moq:2,stock:100,leadTime:7,country:'China'};
const proposal={sku:'SKU-1',product:'منتج',specs:'وصف المنتج',categoryId:'cat',subcategoryId:'',images:['/api/media/'+ids.media]};
const translation={titleAr:'منتج المتجر',titleEn:'Store product',descriptionAr:'وصف المنتج',descriptionEn:'Product description'};
test('actual SQL: supplier proposals, two approved sources, private views, admin assignment and stable sale price',async()=>{
 const pg=await createStoreDB();try{await withLocalAPI(pg,async()=>{
 await assert.rejects(()=>submitSupplySource(client,{terms,proposal}),e=>e.status===403);
 const submission=await submitSupplySource(supplier,{terms,proposal});assert.equal((await snapshot(null)).publicOffers.length,0);
 await assert.rejects(()=>reviewSupplySource(supplier,{id:submission.sourceId,version:1,action:'approve'}),e=>e.status===403);
 const approved=await reviewSupplySource(admin,{id:submission.sourceId,version:1,action:'approve',salePrice:20,currency:'SAR',translation,redactionConfirmed:true});
 const pid=approved.productId;let products=(await snapshot(null)).publicOffers;assert.equal(products.length,1);assert.equal(products[0].unitPrice,20);
 const row=(await pg.query('select * from public_offers where id=$1',[pid])).rows[0];assert.equal(row.owner_id,null);assert.equal(row.data.storeOwned,true);
 const second=await submitSupplySource(other,{productId:pid,terms:{...terms,unitPrice:7}});await reviewSupplySource(admin,{id:second.sourceId,version:1,action:'approve'});
 assert.equal((await snapshot(null)).publicOffers.length,1);
 await assert.rejects(()=>submitSupplySource(other,{productId:pid,terms}),e=>e.status===409);
 const s1=await snapshot(supplier),s2=await snapshot(other);assert.equal(s1.supplySources.length,1);assert.equal(s1.supplySources[0].terms.unitPrice,5);assert.equal(s2.supplySources[0].terms.unitPrice,7);assert.equal(s1.supplySources[0].supplierId,undefined);assert.equal((await snapshot(client)).supplySources.length,0);
 await assert.rejects(()=>mutate(supplier,{collection:'publicOffers',id:pid,version:1,patch:{unitPrice:1}}),e=>e.status===403);
 await assert.rejects(()=>moderate(supplier,{kind:'public',id:pid,action:'delete',reason:'delete'}),e=>e.status===403);
 const order=await createCartOrder(client,{items:[{offerId:pid,quantity:3}],delivery:{name:'PRIVATE CUSTOMER',phone:'PRIVATE PHONE',country:'SA',address:'PRIVATE ADDRESS'}});
 assert.equal((await snapshot(supplier)).interests.length,0);assert.equal((await snapshot(other)).interests.length,0);
 const parent=(await pg.query('select * from requests where id=$1',[order.orderId])).rows[0],line=parent.data.cartItems[0];
 await assignSupplier(admin,{collection:'requests',id:parent.id,version:parent.version,assignments:[{interestId:line.interestId,supplierId:ids.other}]});
 const delivered=await snapshot(other);assert.equal(delivered.interests.length,1);assert.equal(delivered.interests[0].unitPrice,7);assert.equal(delivered.interests[0].total,21);assert.ok(!JSON.stringify(delivered).includes('PRIVATE'));assert.equal((await snapshot(supplier)).interests.length,0);
 await mutate(other,{collection:'interests',id:delivered.interests[0].id,version:delivered.interests[0].version,patch:{supplierOrderStatus:'confirmed'}});
 const parentAfter=(await pg.query('select data from requests where id=$1',[order.orderId])).rows[0].data;assert.equal(parentAfter.orderStage,0);assert.equal(parentAfter.trackingStatus,'received');
 const customer=await snapshot(client);assert.equal(customer.requests[0].cartTotal,60);assert.equal(customer.interests[0].supplyTerms,undefined);assert.equal(customer.interests[0].assignedSupplierId,undefined);
 await pg.query('update profiles set blocked_at=now() where id=$1',[ids.supplier]);assert.equal((await snapshot(null)).publicOffers.length,1);
 await assert.rejects(()=>pg.query('select public.commit_changes($1,$2)',[ids.admin,JSON.stringify([{table:'public_offers',id:'duplicate-product',ownerId:null,version:0,data:{...row.data,sku:'sku-1'},action:'test'}])]),e=>e.message.includes('product SKU already exists'));assert.equal((await pg.query('select count(*)::int as count from public_offers')).rows[0].count,1);
 await assert.rejects(()=>submitSupplySource(supplier,{sourceId:second.sourceId,version:2,terms}),e=>e.status===403);
 await submitSupplySource(other,{sourceId:second.sourceId,version:2,terms:{...terms,unitPrice:8}});assert.equal((await snapshot(other)).supplySources[0].status,'pending');assert.equal((await snapshot(other)).interests[0].unitPrice,7);assert.equal((await snapshot(null)).publicOffers[0].unitPrice,20);
 // A duplicate approved source fails in SQL even if application checks race.
 await assert.rejects(()=>pg.query('insert into supply_sources(id,owner_id,data) values($1,$2,$3)',['duplicate',ids.other,JSON.stringify({productId:pid,status:'approved'})]),e=>e.code==='23505');
 await pg.exec('set role authenticated');await assert.rejects(()=>pg.query('select * from supply_sources'),e=>e.code==='42501');await pg.exec('reset role');
 await pg.exec('set role anon');await assert.rejects(()=>pg.query('select public.commit_changes($1,$2)',[ids.supplier,'[]']),e=>e.code==='42501');await pg.exec('reset role');
 });}finally{await pg.close();}
});
test('actual SQL migration preserves legacy product identity and source terms without auto-assigning new orders',async()=>{
 const pg=await createStoreDB({migrate:false});try{
 const product={...proposal,...terms,stock:'100',leadTime:'7',status:'published',translation};await pg.query('insert into public_offers(id,owner_id,data) values($1,$2,$3)',['legacy',ids.supplier,JSON.stringify(product)]);
 await pg.query('insert into interests(id,owner_id,offer_id,data) values($1,$2,$3,$4)',['unassigned',ids.client,'legacy',JSON.stringify({orderFlowVersion:2,orderStage:0,trackingStatus:'supplier_confirmation'})]);
 await pg.query('insert into public_offers(id,owner_id,data) values($1,$2,$3)',['pending-product',ids.other,JSON.stringify({...product,sku:'PENDING-1',status:'pending'})]);
 await applySourceMigration(pg);assert.equal((await pg.query('select owner_id from public_offers')).rows[0].owner_id,null);const sources=(await pg.query('select * from supply_sources')).rows;assert.equal(sources.length,2);const original=sources.find(s=>s.data.productId==='legacy');assert.equal(original.data.terms.unitPrice,5);const pending=sources.find(s=>s.data.legacyProductId==='pending-product');await withLocalAPI(pg,async()=>{const result=await reviewSupplySource(admin,{id:pending.id,version:pending.version,action:'approve',salePrice:30,translation,redactionConfirmed:true});assert.equal(result.productId,'pending-product');});assert.equal((await pg.query('select count(*)::int as count from public_offers')).rows[0].count,2);assert.equal((await pg.query('select data from interests')).rows[0].data.assignedSupplierId,undefined);
 const security=(await pg.query("select relrowsecurity from pg_class where relname='supply_sources'")).rows[0];assert.equal(security.relrowsecurity,true);
 }finally{await pg.close();}
});
