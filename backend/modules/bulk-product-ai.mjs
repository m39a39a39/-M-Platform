import {one,rpc,assert,HttpError} from '../lib/supabase.mjs';
import {can} from './auth.mjs';
import {buildProductDraftReference,generateProductDraft} from './admin-ai.mjs';
import {saveStudioProduct,publishCreatedProduct} from './studio.mjs';

const validId=id=>typeof id==='string'&&/^bulkai-[a-f0-9-]{36}$/i.test(id);
const permitted=user=>assert(user?.role==='admin'&&(can(user,'offers.create')||can(user,'offers.edit')),403,'صلاحية إضافة المنتجات مطلوبة / Product creation permission required');
const owned=(row,user)=>row&&row.owner_id===user.id&&row.data?.storeOwned===true&&row.data?.createdByAdmin===user.id&&!row.data?.deletedAt&&row.data?.bulkImportId===undefined;
const publishAllowed=user=>assert(can(user,'offers.create'),403,'صلاحية نشر منتجاتك مطلوبة / Permission to publish your own products required');
const privacyConfirmed=body=>assert(body.redactionConfirmed===true,400,'راجع الأسماء والأوصاف والصور وأكد النشر / Review copy and images, then confirm publication');
async function publishOwned(user,row){
  publishAllowed(user);
  assert(owned(row,user),403,'لا يمكنك نشر هذا المنتج / Cannot publish this product');
  if(row.data.status==='published')return {saved:true,published:true,id:row.id,alreadyPublished:true};
  assert(['pending','review'].includes(row.data.status),409,'لا يمكن نشر حالة المنتج الحالية / Product cannot be published from its current status');
  try{await publishCreatedProduct(user,{id:row.id,redactionConfirmed:true});}
  catch(error){
    // A timed-out or concurrent request may have published the same product.
    const latest=await one('public_offers',row.id).catch(()=>null);
    if(owned(latest,user)&&latest.data.status==='published')return {saved:true,published:true,id:row.id,alreadyPublished:true};
    throw error;
  }
  return {saved:true,published:true,id:row.id,alreadyPublished:false};
}
export async function bulkProductAi(user,body={}){
  permitted(user);
  const action=body.action;
  if(action==='analyze'){
    assert(typeof body.image==='string'&&body.image.length<=480000&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(body.image),400,'صورة تحليل غير صالحة / Invalid image');
    const limit=await rpc('consume_chat_rate_limit',{p_key:'bulk-product-ai:'+user.id,p_limit:160,p_window_seconds:3600});
    assert(limit?.allowed,429,'وصلت إلى حد التحليل لهذه الساعة. النتائج السابقة محفوظة؛ أكمل لاحقًا / Hourly AI limit reached');
    const settings=(await one('settings','site'))?.data||{};
    const apiKey=String(process.env.OPENAI_API_KEY||'').trim();
    assert(apiKey,503,'خدمة الذكاء الاصطناعي غير مهيأة / AI is not configured');
    const model=String(process.env.OPENAI_ADMIN_MODEL||process.env.OPENAI_CHAT_MODEL||'gpt-6-luna').replace(/^openai\//,'');
    const result=await generateProductDraft(user,{images:[body.image],notes:'Prioritize the most specific visible product type and a clear retail-ready title in Arabic and English. Do not use generic electronic product labels when the type is identifiable. Never invent attributes, brands or model numbers.',sku:''},{apiKey,model,state:{settings}});
    const draft=result.draft||{},ref=buildProductDraftReference({settings});
    return {draft:{...draft,sku:/^MG-AI-/.test(draft.sku||'')?'':draft.sku},taxonomy:ref,needsReview:!draft.name||!draft.categoryId||result.needsMoreImages};
  }
  assert(validId(body.id),400,'معرّف عملية الإضافة غير صالح / Invalid bulk product ID');
  const current=await one('public_offers',body.id);
  if(action==='status'){
    if(!current)return {saved:false};
    assert(owned(current,user),403,'منتج غير مصرح / Unauthorized product');
    return {saved:true,published:current.data.status==='published',id:current.id};
  }
  if(action==='publish'){
    publishAllowed(user);privacyConfirmed(body);
    assert(current,404,'احفظ المنتج أولًا قبل نشره / Save the product before publishing');
    return publishOwned(user,current);
  }
  if(action==='save'){
    const publishNow=body.publish===true;
    if(publishNow){publishAllowed(user);privacyConfirmed(body);}
    if(current){
      assert(owned(current,user),409,'هذا المعرّف مستخدم / Product ID already used');
      return publishNow?publishOwned(user,current):{saved:true,published:current.data.status==='published',id:body.id,alreadySaved:true};
    }
    const p=body.product;
    assert(p&&typeof p==='object'&&!Array.isArray(p),400,'بيانات غير صالحة / Invalid product data');
    assert(p.id===body.id,400,'عدم تطابق المعرّف / ID mismatch');
    assert(Array.isArray(p.images)&&p.images.length===1,400,'صورة واحدة لكل منتج / One image per product');
    assert(String(p.name||'').trim()&&String(p.nameEn||'').trim()&&String(p.categoryId||'').trim(),400,'أكمل الاسم باللغتين والتصنيف / Complete names and category');
    const settings=(await one('settings','site'))?.data||{};
    const countries=Array.isArray(settings.supplyCountries)?settings.supplyCountries.filter(x=>x.active!==false):[];
    const country=countries.find(x=>x.id==='China')?.id||countries[0]?.id||'China';
    if(publishNow)assert(String(p.description||'').trim()&&String(p.descriptionEn||'').trim(),400,'أكمل الوصف بالعربية والإنجليزية قبل النشر / Complete both descriptions before publishing');
    const product={id:body.id,version:0,status:publishNow?'active':'draft',name:p.name,nameEn:p.nameEn,
      sku:p.sku||'BULK-AI-'+body.id.slice(-12).replaceAll('-','').toUpperCase(),
      shortDescription:p.shortDescription||'',description:p.description||'',descriptionEn:p.descriptionEn||'',
      technicalSpecs:p.technicalSpecs||'',options:p.options||'',notes:'',categoryId:p.categoryId,
      subcategoryId:p.subcategoryId||'',images:p.images,
      country,price:null,currency:'SAR',moq:1,stock:'',stockUnlimited:true,leadDays:7,tiers:[]};
    try{await saveStudioProduct(user,{product,redactionConfirmed:publishNow});}
    catch(error){
      // A concurrent retry may have committed successfully before this request returned.
      const saved=await one('public_offers',body.id).catch(()=>null);
      if(owned(saved,user)){
        if(publishNow)return publishOwned(user,saved);
        return {saved:true,published:saved.data.status==='published',id:body.id,alreadySaved:true};
      }
      throw error;
    }
    return {saved:true,published:publishNow,id:body.id,alreadySaved:false};
  }
  throw new HttpError(400,'إجراء غير صالح / Invalid action');
}
