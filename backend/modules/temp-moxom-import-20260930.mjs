import {randomUUID} from 'node:crypto';
import {db,rpc,assert} from '../lib/supabase.mjs';
import {uploadProductImages} from './media.mjs';
import {assertProductTaxonomy,validateContent} from './mutations.mjs';

const ADMIN_ID='e729ac18-9ee3-4a8b-bcc0-fcb0e308f3e9';
const round2=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;

export async function importMoxom20260930(items){
  assert(Array.isArray(items)&&items.length>0&&items.length<=10,400,'Invalid import batch');
  const user={id:ADMIN_ID,role:'admin'},results=[];
  for(const item of items){
    try{
      const sku=String(item.sku||'').trim();
      assert(/^[A-Za-z0-9._-]{1,80}$/.test(sku),400,'Invalid SKU');
      const existing=await db('public_offers',`data->>sku=eq.${encodeURIComponent(sku)}&data->>deletedAt=is.null&limit=1`);
      if(existing.length){results.push({sku,ok:true,skipped:true,id:existing[0].id});continue;}
      const data={
        sku,
        product:String(item.titleAr||'').trim(),
        specs:String(item.descriptionAr||'').trim(),
        translation:{
          titleAr:String(item.titleAr||'').trim(),
          titleEn:String(item.titleEn||'').trim(),
          descriptionAr:String(item.descriptionAr||'').trim(),
          descriptionEn:String(item.descriptionEn||'').trim()
        },
        images:[],
        categoryId:String(item.categoryId||'').trim(),
        subcategoryId:String(item.subcategoryId||'').trim(),
        country:'China',
        unitPrice:round2(Number(item.rmbPrice)/1.6),
        currency:'SAR',
        moq:Number(item.moq),
        stock:'0',
        leadTime:'7',
        status:'published',
        storeOwned:true,
        brand:'MOXOM',
        manufacturerModel:String(item.manufacturerModel||sku),
        sourceCurrency:'CNY',
        sourceUnitPrice:Number(item.rmbPrice),
        sourceCatalog:String(item.sourceCatalog||'MOXOM Price List 2026-09-24'),
        imageSource:String(item.imageSource||'Official MOXOM price-list row'),
        createdAt:new Date().toISOString()
      };
      validateContent('publicOffers',{...data,images:['placeholder']});
      await assertProductTaxonomy(data,{required:true,activeOnly:true});
      const mime=String(item.imageMime||'image/webp');
      assert(['image/jpeg','image/png','image/webp'].includes(mime),400,'Invalid image MIME');
      const imageData=`data:${mime};base64,${item.imageBase64}`;
      data.images=await uploadProductImages(user,[imageData]);
      const id=randomUUID();
      await rpc('commit_changes',{actor:ADMIN_ID,changes:[{
        table:'public_offers',id,version:0,ownerId:null,data,action:'moxom_catalog_import'
      }]});
      results.push({sku,ok:true,id,price:data.unitPrice,images:data.images.length});
    }catch(error){
      results.push({sku:item?.sku||'',ok:false,error:String(error?.message||error)});
    }
  }
  return results;
}