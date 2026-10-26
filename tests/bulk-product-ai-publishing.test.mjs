import test from 'node:test';
import assert from 'node:assert/strict';
import {bulkProductAi} from '../backend/modules/bulk-product-ai.mjs';
import {createStoreDB,withLocalAPI,ids} from './helpers/store-db.mjs';

const admin={id:ids.admin,role:'admin',is_owner:true};
const imageId='ffffffff-ffff-4fff-8fff-ffffffffffff';
const image='/api/media/'+imageId;
const product=(id,extra={})=>({
 id,name:'سماعة بلوتوث',nameEn:'Bluetooth earphones',categoryId:'cat',subcategoryId:'',
 description:'سماعة بلوتوث للاستخدام اليومي',descriptionEn:'Bluetooth earphones for daily use',
 sku:'',shortDescription:'',technicalSpecs:'',options:'',images:[image],...extra
});
async function withFixtures(run){
 const pg=await createStoreDB();
 try{
  await pg.query('insert into media(id,owner_id,path,mime) values($1,$2,$3,$4)',[imageId,ids.admin,'admin/bulk-image.png','image/png']);
  return await withLocalAPI(pg,()=>run(pg));
 }finally{await pg.close();}
}
const data=async(pg,id)=>(await pg.query('select data from public_offers where id=$1',[id])).rows[0]?.data;
const total=async pg=>Number((await pg.query('select count(*)::integer n from public_offers')).rows[0].n);

test('reviewed bulk product can publish directly without prices, without first saving as a draft',()=>withFixtures(async pg=>{
 const id='bulkai-11111111-1111-4111-8111-111111111111';
 await assert.rejects(bulkProductAi(admin,{action:'save',id,publish:true,product:product(id)}),{status:400});
 assert.equal(await total(pg),0,'confirmation must be required before database writes');
 const result=await bulkProductAi(admin,{action:'save',id,publish:true,redactionConfirmed:true,product:product(id)});
 assert.equal(result.published,true);
 const d=await data(pg,id);
 assert.equal(d.status,'published');assert.equal(d.storeOwned,true);assert.equal(d.unitPrice,null);
 assert.deepEqual(d.images,[image]);assert.equal(d.translation.titleAr,'سماعة بلوتوث');
 assert.equal((await bulkProductAi(admin,{action:'status',id})).published,true);
 await bulkProductAi(admin,{action:'save',id,publish:true,redactionConfirmed:true,product:product(id)});
 assert.equal(await total(pg),1,'retry must not create a second product');
}));

test('previously saved bulk drafts publish in-place and remain idempotent',()=>withFixtures(async pg=>{
 const id='bulkai-22222222-2222-4222-8222-222222222222';
 const saved=await bulkProductAi(admin,{action:'save',id,product:product(id)});
 assert.equal(saved.published,false);assert.equal((await data(pg,id)).status,'pending');
 const published=await bulkProductAi(admin,{action:'publish',id,redactionConfirmed:true});
 assert.equal(published.published,true);assert.equal((await data(pg,id)).status,'published');
 const again=await bulkProductAi(admin,{action:'publish',id,redactionConfirmed:true});
 assert.equal(again.alreadyPublished,true);assert.equal(await total(pg),1);
}));

test('publication rejects insufficient copy and unauthorized staff while retaining the saved draft',()=>withFixtures(async pg=>{
 const id='bulkai-33333333-3333-4333-8333-333333333333';
 const bad=product(id,{descriptionEn:''});
 await bulkProductAi(admin,{action:'save',id,product:bad});
 await assert.rejects(bulkProductAi(admin,{action:'publish',id,redactionConfirmed:true}),{status:400});
 assert.equal((await data(pg,id)).status,'pending');
 const editor={id:ids.admin,role:'admin',is_owner:false,permissions:['offers.edit']};
 await assert.rejects(bulkProductAi(editor,{action:'publish',id,redactionConfirmed:true}),{status:403});
 await assert.rejects(bulkProductAi(admin,{action:'publish',id,redactionConfirmed:false}),{status:400});
 assert.equal(await total(pg),1);
}));
