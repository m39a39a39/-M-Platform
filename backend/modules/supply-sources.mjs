import {randomUUID} from 'node:crypto';
import {one,db,rpc,assert} from '../lib/supabase.mjs';
import {can} from './auth.mjs';
import {active,open} from './records.mjs';
import {checkImages,validateContent,assertProductTaxonomy} from './mutations.mjs';
const id=value=>assert(typeof value==='string'&&/^[A-Za-z0-9-]{1,80}$/.test(value),400);
export function supplyTerms(raw){
 const result={};for(const key of ['unitPrice','moq','stock','leadTime']){const n=Number(raw[key]);assert(raw[key]!==''&&raw[key]!==undefined&&Number.isFinite(n)&&n<1e9&&(key==='stock'?n>=0:n>0),400,'أكمل سعر التوريد والحد الأدنى والمخزون ومدة التجهيز');if(key!=='unitPrice')assert(Number.isInteger(n),400,'أدخل كمية ومدة صحيحة');result[key]=n;}
 assert(['SAR','USD','CNY','AED','EUR'].includes(raw.currency),400,'عملة غير صالحة');assert(typeof raw.country==='string'&&raw.country.trim()&&raw.country.length<=80,400,'حدد بلد التوريد');return {...result,currency:raw.currency,country:raw.country.trim()};
}
export function ownSource(row){const d=row.data;return {id:row.id,version:row.version,productId:d.productId||null,status:d.status,terms:d.terms,proposal:d.proposal||null,reviewNote:d.reviewNote||'',createdAt:row.created_at};}
export async function submitSupplySource(user,body={}){
 assert(user?.role==='supplier'&&active(user),403);const terms=supplyTerms(body.terms||body);let productId=null,proposal=null;
 if(body.sourceId){id(body.sourceId);const existing=await one('supply_sources',body.sourceId);assert(existing&&existing.owner_id===user.id,403);assert(existing.version===body.version,409,'حدّث عرض التوريد');assert(existing.data.productId,400,'أعد تقديم اقتراح المنتج للمراجعة');const now=new Date().toISOString();await rpc('commit_changes',{actor:user.id,changes:[{table:'supply_sources',id:existing.id,version:existing.version,ownerId:user.id,data:{...existing.data,terms,status:'pending',reviewNote:'',updatedAt:now},action:'supply_resubmit'}]});return {ok:true,sourceId:existing.id};}

 if(body.productId){id(body.productId);const p=await one('public_offers',body.productId);assert(open(p)&&p.data.status==='published',404,'المنتج غير متاح');productId=p.id;assert(!(await db('supply_sources',`owner_id=eq.${user.id}&data->>productId=eq.${encodeURIComponent(productId)}`)).length,409,'لديك عرض توريد لهذا المنتج بالفعل');}
 else {const p=body.proposal||body;proposal=Object.fromEntries(['sku','product','specs','images','categoryId','subcategoryId'].map(k=>[k,p[k]??(k==='images'?[]:'')]));validateContent('publicOffers',{...proposal,...terms,leadTime:String(terms.leadTime),stock:String(terms.stock)});await checkImages(proposal.images,user);assert(proposal.images.length,400,'أضف صورة للمنتج');await assertProductTaxonomy({...proposal,country:terms.country},{required:true,activeOnly:true});}
 const sourceId=randomUUID(),now=new Date().toISOString();await rpc('commit_changes',{actor:user.id,changes:[{table:'supply_sources',id:sourceId,version:0,ownerId:user.id,data:{productId,proposal,terms,status:'pending',createdAt:now},action:'supply_submit'}]});return {ok:true,sourceId};
}
export async function reviewSupplySource(user,body={}){
 assert(can(user,'offers.edit')&&can(user,'publish'),403);id(body.id);const row=await one('supply_sources',body.id);assert(row&&row.version===body.version,409,'حدّث عروض التوريد');assert(row.data.status==='pending',409,'تمت مراجعة هذا العرض');assert(active(await one('profiles',row.owner_id)),409,'المورد غير فعال');
 assert(['approve','reject'].includes(body.action),400);const now=new Date().toISOString(),data={...row.data,status:body.action==='approve'?'approved':'rejected',reviewedAt:now,reviewedBy:user.id,reviewNote:String(body.note||'').trim()};assert(data.reviewNote.length<=2000,400);const changes=[];
 if(body.action==='approve'){
  let productId=row.data.productId||body.productId;
  if(productId){id(productId);const product=await one('public_offers',productId);assert(open(product)&&product.data.status==='published',409,'اختر منتجًا منشورًا');assert(!(await db('supply_sources',`owner_id=eq.${row.owner_id}&data->>productId=eq.${encodeURIComponent(productId)}`)).some(s=>s.id!==row.id),409,'هذا المورد مرتبط بالمنتج بالفعل');}
  else {
   const p=row.data.proposal;assert(p,400);assert(can(user,'translate')&&body.redactionConfirmed===true,403,'راجع المحتوى العام والترجمة');
   const tr=body.translation;assert(tr&&['titleAr','titleEn','descriptionAr','descriptionEn'].every(k=>typeof tr[k]==='string'&&tr[k].trim()&&tr[k].length<=10000),400,'أكمل العنوان والوصف باللغتين');
   for(const value of Object.values(tr))assert(!/(?:https?:\/\/|www\.|wa\.me|@[a-z0-9]|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+|00)\d[\d\s()-]{7,})/i.test(value),400,'احذف بيانات التواصل من المحتوى العام');
   const salePrice=Number(body.salePrice);assert(Number.isFinite(salePrice)&&salePrice>0&&salePrice<=1e9,400,'حدد سعر البيع للمتجر');
   const sameSku=await db('public_offers',`data->>sku=eq.${encodeURIComponent(p.sku||'')}&data->>status=eq.published&data->>deletedAt=is.null`);assert(!sameSku.length,409,'يوجد منتج بهذا الرمز؛ اربط العرض بالمنتج الموجود بدل إنشاء منتج مكرر');
   const proposed=Object.fromEntries(['sku','images','categoryId','subcategoryId'].map(k=>[k,p[k]??(k==='images'?[]:'')]));
   const t=row.data.terms,d={...proposed,product:tr.titleAr,specs:tr.descriptionAr,translation:tr,country:t.country,unitPrice:salePrice,currency:body.currency||t.currency,moq:t.moq,stock:String(t.stock),leadTime:String(t.leadTime),status:'published',storeOwned:true,createdAt:now};validateContent('publicOffers',d);await assertProductTaxonomy(d,{required:true,activeOnly:true});
   const legacy=row.data.legacyProductId?await one('public_offers',row.data.legacyProductId):null;assert(!legacy||legacy.data.status==='source_review',409,'المنتج السابق تغير');productId=legacy?.id||randomUUID();changes.push({table:'public_offers',id:productId,version:legacy?.version||0,ownerId:null,data:d,action:'store_product_create'});
  }
  data.productId=productId;
 }
 changes.push({table:'supply_sources',id:row.id,version:row.version,ownerId:row.owner_id,data,action:'supply_'+body.action});await rpc('commit_changes',{actor:user.id,changes});return {ok:true,productId:data.productId};
}
export async function approvedSource(productId,supplierId){
 const sources=await db('supply_sources',`owner_id=eq.${encodeURIComponent(supplierId)}&data->>productId=eq.${encodeURIComponent(productId)}&data->>status=eq.approved`);
 assert(sources.length===1&&active(await one('profiles',supplierId)),409,'اختر موردًا معتمدًا لهذا المنتج');return sources[0];
}
