import {one,rpc,assert,HttpError} from '../lib/supabase.mjs';
import {can} from './auth.mjs';
import {buildProductDraftReference,generateProductDraft} from './admin-ai.mjs';
import {saveStudioProduct} from './studio.mjs';

const validId=id=>typeof id==='string'&&/^bulkai-[a-f0-9-]{36}$/i.test(id);
const permitted=user=>assert(user?.role==='admin'&&(can(user,'offers.create')||can(user,'offers.edit')),403,'صلاحية إضافة المنتجات مطلوبة / Product creation permission required');
const owned=(row,user)=>row&&row.owner_id===user.id&&row.data?.createdByAdmin===user.id&&row.data?.bulkImportId===undefined;
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
    return {saved:true,id:current.id};
  }
  if(action==='save'){
    if(current){assert(owned(current,user),409,'هذا المعرّف مستخدم / Product ID already used');return {saved:true,id:body.id,alreadySaved:true};}
    const p=body.product;
    assert(p&&typeof p==='object'&&!Array.isArray(p),400,'بيانات غير صالحة / Invalid product data');
    assert(p.id===body.id,400,'عدم تطابق المعرّف / ID mismatch');
    assert(Array.isArray(p.images)&&p.images.length===1,400,'صورة واحدة لكل منتج / One image per product');
    assert(String(p.name||'').trim()&&String(p.nameEn||'').trim()&&String(p.categoryId||'').trim(),400,'أكمل الاسم باللغتين والتصنيف / Complete names and category');
    const settings=(await one('settings','site'))?.data||{};
    const countries=Array.isArray(settings.supplyCountries)?settings.supplyCountries.filter(x=>x.active!==false):[];
    const country=countries.find(x=>x.id==='China')?.id||countries[0]?.id||'China';
    const product={id:body.id,version:0,status:'draft',name:p.name,nameEn:p.nameEn,
      sku:p.sku||'BULK-AI-'+body.id.slice(-12).replaceAll('-','').toUpperCase(),
      shortDescription:p.shortDescription||'',description:p.description||'',descriptionEn:p.descriptionEn||'',
      technicalSpecs:p.technicalSpecs||'',options:p.options||'',notes:'',categoryId:p.categoryId,
      subcategoryId:p.subcategoryId||'',images:p.images,
      country,price:null,currency:'SAR',moq:1,stock:'',stockUnlimited:true,leadDays:7,tiers:[]};
    try{await saveStudioProduct(user,{product});}
    catch(error){
      // A concurrent retry may have committed successfully before this request returned.
      const saved=await one('public_offers',body.id).catch(()=>null);
      if(owned(saved,user))return {saved:true,id:body.id,alreadySaved:true};
      throw error;
    }
    return {saved:true,id:body.id,alreadySaved:false};
  }
  throw new HttpError(400,'إجراء غير صالح / Invalid action');
}
