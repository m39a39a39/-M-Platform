import test from 'node:test';
import assert from 'node:assert/strict';
import {bulkProductAi} from '../backend/modules/bulk-product-ai.mjs';
import {createStoreDB,withLocalAPI,ids} from './helpers/store-db.mjs';

const admin={id:'00000000-0000-4000-8000-000000000001',role:'admin',is_owner:true,permissions:[]};
test('bulk product creation requires an admin with product permission',async()=>{
 await assert.rejects(bulkProductAi(null,{action:'analyze',image:'anything'}),e=>e.status===403);
 await assert.rejects(bulkProductAi({id:'x',role:'admin',is_owner:false,permissions:[]},{action:'save',id:'bulkai-00000000-0000-4000-8000-000000000002'}),e=>e.status===403);
});
test('bulk AI refuses unsupported image payloads without making paid AI calls',async()=>{
 await assert.rejects(bulkProductAi(admin,{action:'analyze',image:'data:text/plain;base64,YQ=='}),e=>e.status===400);
 await assert.rejects(bulkProductAi(admin,{action:'analyze',image:'data:image/jpeg;base64,'+'A'.repeat(480001)}),e=>e.status===400);
});
test('bulk AI rejects malformed product identifiers before any database operation',async()=>{
 await assert.rejects(bulkProductAi(admin,{action:'status',id:'another-product-id'}),e=>e.status===400);
 await assert.rejects(bulkProductAi(admin,{action:'save',id:'bulkai-abc'}),e=>e.status===400);
});

const selectedImage='/api/media/'+ids.media;
const newProduct=(id,extra={})=>({id,name:'سماعة بلوتوث',nameEn:'Bluetooth earphones',description:'سماعات بلوتوث للاستخدام اليومي',descriptionEn:'Bluetooth earphones for everyday use',categoryId:'cat',subcategoryId:'',images:[selectedImage],...extra});
test('publish saved bulk draft using existing authorized studio path; prices stay absent and retries are idempotent',async()=>{
 const pg=await createStoreDB();
 const id='bulkai-11111111-1111-4111-8111-111111111111';
 try{
  await pg.query('update media set owner_id=$1 where id=$2',[ids.admin,ids.media]);
  await withLocalAPI(pg,async()=>{
   const owner={id:ids.admin,role:'admin',is_owner:true,permissions:[]};
   const saved=await bulkProductAi(owner,{action:'save',id,product:newProduct(id)});
   assert.equal(saved.saved,true);assert.equal(saved.published,false);
   assert.deepEqual(await bulkProductAi(owner,{action:'status',id}),{saved:true,published:false,id});
   await assert.rejects(bulkProductAi(owner,{action:'publish',id}),{status:400});
   assert.equal((await bulkProductAi(owner,{action:'publish',id,redactionConfirmed:true})).published,true);
   assert.equal((await bulkProductAi(owner,{action:'publish',id,redactionConfirmed:true})).alreadyPublished,true);
   const data=(await pg.query('select data from public_offers where id=$1',[id])).rows[0].data;
   assert.equal(data.status,'published');assert.equal(data.unitPrice,null);
   assert.equal(data.translation.titleAr,'سماعة بلوتوث');assert.equal(data.images[0],selectedImage);
   assert.equal((await pg.query('select count(*)::int n from public_offers where id=$1',[id])).rows[0].n,1);
  });
 }finally{await pg.close();}
});
test('direct publish of new bulk image creates a published, price-free product exactly once',async()=>{
 const pg=await createStoreDB();
 const id='bulkai-22222222-2222-4222-8222-222222222222';
 try{
  await pg.query('update media set owner_id=$1 where id=$2',[ids.admin,ids.media]);
  await withLocalAPI(pg,async()=>{
   const owner={id:ids.admin,role:'admin',is_owner:true,permissions:[]};
   await assert.rejects(bulkProductAi(owner,{action:'save',id,publish:true,product:newProduct(id)}),{status:400});
   await assert.rejects(bulkProductAi(owner,{action:'save',id,publish:true,redactionConfirmed:true,product:newProduct(id,{descriptionEn:''})}),{status:400});
   const result=await bulkProductAi(owner,{action:'save',id,publish:true,redactionConfirmed:true,product:newProduct(id)});
   assert.equal(result.published,true);
   const retry=await bulkProductAi(owner,{action:'save',id,publish:true,redactionConfirmed:true,product:newProduct(id)});
   assert.equal(retry.alreadyPublished,true);
   const db=(await pg.query('select data from public_offers where id=$1',[id])).rows[0].data;
   assert.equal(db.unitPrice,null);assert.equal(db.status,'published');assert.equal(db.translation.descriptionEn,'Bluetooth earphones for everyday use');
   assert.equal((await pg.query('select count(*)::int n from public_offers where id=$1',[id])).rows[0].n,1);
  });
 }finally{await pg.close();}
});
test('bulk publish denies edit-only staff and unrelated product identities',async()=>{
 const pg=await createStoreDB();
 const id='bulkai-33333333-3333-4333-8333-333333333333';
 try{
  await pg.query('update media set owner_id=$1 where id=$2',[ids.admin,ids.media]);
  await withLocalAPI(pg,async()=>{
   const owner={id:ids.admin,role:'admin',is_owner:true,permissions:[]};
   await bulkProductAi(owner,{action:'save',id,product:newProduct(id)});
   const staff={id:ids.other,role:'admin',is_owner:false,permissions:['offers.edit']};
   await assert.rejects(bulkProductAi(staff,{action:'publish',id,redactionConfirmed:true}),{status:403});
   await assert.rejects(bulkProductAi(staff,{action:'status',id}),{status:403});
   await assert.rejects(bulkProductAi(staff,{action:'save',id,publish:true,redactionConfirmed:true,product:newProduct(id)}),{status:403});
  });
 }finally{await pg.close();}
});

test('bulk AI saves selected supply country and MOQ and rejects invalid choices',async()=>{
 const pg=await createStoreDB();
 const selectedId='bulkai-44444444-4444-4444-8444-444444444444';
 try{
  await pg.query('update media set owner_id=$1 where id=$2',[ids.admin,ids.media]);
  await pg.query('update settings set data=$1',[JSON.stringify({
   categories:[{id:'cat',nameAr:'منتجات',nameEn:'Products',active:true}],
   subcategories:[],
   supplyCountries:[
    {id:'China',nameAr:'الصين',nameEn:'China',active:true},
    {id:'United Arab Emirates',nameAr:'الإمارات',nameEn:'United Arab Emirates',active:true}
   ]
  })]);
  await withLocalAPI(pg,async()=>{
   const owner={id:ids.admin,role:'admin',is_owner:true,permissions:[]};
   const supplied=newProduct(selectedId,{country:'United Arab Emirates',moq:120});
   const saved=await bulkProductAi(owner,{action:'save',id:selectedId,product:supplied});
   assert.equal(saved.saved,true);
   const data=(await pg.query('select data from public_offers where id=$1',[selectedId])).rows[0].data;
   assert.equal(data.country,'United Arab Emirates');
   assert.equal(data.moq,120);
   assert.equal(data.unitPrice,null);
   const invalidId='bulkai-55555555-5555-4555-8555-555555555555';
   await assert.rejects(bulkProductAi(owner,{action:'save',id:invalidId,product:newProduct(invalidId,{country:'Unknown',moq:10})}),{status:400});
   await assert.rejects(bulkProductAi(owner,{action:'save',id:invalidId,product:newProduct(invalidId,{country:'China',moq:0})}),{status:400});
   await assert.rejects(bulkProductAi(owner,{action:'save',id:invalidId,product:newProduct(invalidId,{country:'China',moq:1.5})}),{status:400});
  });
 }finally{await pg.close();}
});
