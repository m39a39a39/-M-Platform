import {one,db,rpc,assert} from '../lib/supabase.mjs';
import {can} from './auth.mjs';
import {active} from './records.mjs';
import {checkImages,validateContent,normalizeCategories,normalizeSubcategories} from './mutations.mjs';

const text=(v,max=10000)=>{assert(typeof v==='string'&&v.length<=max,400,'نص غير صالح أو طويل جدًا');return v.trim();};
const list=(v,max)=>{assert(Array.isArray(v)&&v.length<=max,400,'عدد العناصر يتجاوز الحد المسموح');return v;};
const id=v=>{assert(typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v),400,'معرف غير صالح');return v;};
const media=v=>{assert(!v||/^\/api\/media\/[a-f0-9-]{36}$/.test(v),400,'ارفع الصورة إلى المنصة');return v||'';};
export function normalizeStore(input){
  assert(input&&typeof input==='object',400);const t=input.theme||{};
  assert(/^#[0-9a-f]{6}$/i.test(t.color)&&[0,8,16,24].includes(Number(t.round)),400,'تحقق من اللون والزوايا');
  const out={theme:{name:text(t.name,60),tagline:text(t.tagline,100),announcement:text(t.announcement,140),color:t.color,round:Number(t.round),logo:media(t.logo)},sections:[],banners:[],pages:[],links:[],collections:[]};
  out.sections=list(input.sections,30).map(s=>{assert(['hero','categories','products','text','banners'].includes(s.type)&&['both','web','app'].includes(s.channel),400);return {id:id(s.id),type:s.type,channel:s.channel,visible:!!s.visible,title:text(s.title||'',200),subtitle:text(s.subtitle||'',5000),button:text(s.button||'',80),image:media(s.image),collectionId:s.collectionId?id(s.collectionId):'',limit:Math.min(24,Math.max(1,Number(s.limit)||6))};});
  out.banners=list(input.banners,30).map(b=>{assert(['both','web','app'].includes(b.channel),400);for(const k of ['start','end'])assert(!b[k]||/^\d{4}-\d{2}-\d{2}$/.test(b[k]),400);return {id:id(b.id),title:text(b.title,200),subtitle:text(b.subtitle||'',2000),image:media(b.image),active:!!b.active,channel:b.channel,start:b.start||'',end:b.end||''};});
  out.pages=list(input.pages,30).map(p=>({id:id(p.id),title:text(p.title,120),content:text(p.content,10000),active:!!p.active}));
  out.links=list(input.links,30).map(l=>({id:id(l.id),title:text(l.title,100),target:id(l.target)}));
  out.collections=list(input.collections,100).map(c=>({id:id(c.id),name:text(c.name,100),description:text(c.description||'',1000),active:!!c.active,productIds:list(c.productIds,500).map(id)}));
  return out;
}
export const storeImages=s=>[s?.theme?.logo,...(s?.sections||[]).map(x=>x.image),...(s?.banners||[]).map(x=>x.image)].filter(Boolean);
export function normalizeTiers(tiers,moq,price){
  let last=Number(moq),previous=Number(price);
  return list(tiers||[],20).map(t=>{const min=Number(t.min),p=Number(t.price);assert(Number.isInteger(min)&&min>last&&Number.isFinite(p)&&p>0&&p<=previous,400,'شرائح الكمية تصاعدية والأسعار تنازلية');last=min;previous=p;return {min,price:p};});
}
export function priceForQuantity(data,quantity){let price=Number(data.unitPrice);for(const t of data.tiers||[])if(quantity>=t.min)price=Number(t.price);return price;}
export async function saveStudio(user,body){
  assert(can(user,'settings'));assert(['draft','publish'].includes(body.action),400);
  const row=await one('settings','site');assert(row.version===body.version,409,'تغيّرت إعدادات المتجر؛ حدّث الصفحة قبل الحفظ');
  const input=body.store,store=normalizeStore(input),oldImages=storeImages(row.data.storefront);
  for(const src of storeImages(store))await checkImages([src],user,oldImages.concat(storeImages(row.data.studioDraft)));
  const categories=normalizeCategories(list(input.categories,100).filter(c=>!c.parent).map((c,i)=>({id:c.id,nameAr:c.name,nameEn:c.nameEn||c.name,active:c.active,order:i})));
  const subcategories=normalizeSubcategories(input.categories.filter(c=>c.parent).map((c,i)=>({id:c.id,parentId:c.parent,nameAr:c.name,nameEn:c.nameEn||c.name,active:c.active,order:i})),categories);
  const changes=[];
  // Each publish is one database transaction. The existing RPC accepts at most 20 changes.
  const edits=list(body.products||[],19);
  const seen=new Set();
  for(const p of edits){
    assert(can(user,'offers.edit'));id(p.id);assert(!seen.has(p.id),400);seen.add(p.id);
    const old=await one('public_offers',p.id);assert((old?.version||0)===p.version,409,'تغيّر أحد المنتجات؛ حدّث الصفحة');
    if(p.deleted){assert(can(user,'trash')&&old,403);changes.push({table:'public_offers',id:p.id,version:old.version,ownerId:old.owner_id,data:{...old.data,deletedAt:new Date().toISOString()},action:'studio_product_delete'});continue;}
    const supplier=await one('profiles',old?.owner_id||p.supplierId);assert(active(supplier)&&supplier.role==='supplier',400,'اختر موردًا فعالًا');
    const d={...old?.data,sku:text(p.sku,80),product:text(p.name,100),specs:text(p.description),country:text(p.country,80),unitPrice:Number(p.price),currency:p.currency,moq:Number(p.moq),stock:p.stock==null?'':String(p.stock),leadTime:String(p.leadDays),categoryId:p.categoryId,subcategoryId:p.subcategoryId||'',images:list(p.images,5),translation:{titleAr:text(p.name,100),titleEn:text(p.nameEn,100),descriptionAr:text(p.description),descriptionEn:text(p.descriptionEn)},status:p.status==='active'?'published':'review',studioArchived:p.status==='archived',shortDescription:text(p.shortDescription||'',500),productNotes:text(p.notes||'',2000),options:text(p.options||'',1000),technicalSpecs:text(p.technicalSpecs||'',5000),tiers:normalizeTiers(p.tiers,p.moq,p.price),updatedAt:new Date().toISOString()};
    for(const value of [...Object.values(d.translation),d.shortDescription,d.productNotes,d.options,d.technicalSpecs])assert(!/(?:https?:\/\/|www\.|wa\.me|@[a-z0-9]|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+|00)\d[\d\s()-]{7,})/i.test(value),400,'احذف بيانات التواصل من المحتوى العام');
    const countries=row.data.supplyCountries?.length?row.data.supplyCountries:[{id:'China'},{id:'United Arab Emirates'}];assert(countries.some(c=>c.id===d.country&&c.active!==false),400,'اختر دولة توريد معتمدة');
    validateContent('publicOffers',d);assert(Number.isInteger(d.moq)&&d.moq>0,400);assert(d.stock===''||Number.isInteger(Number(d.stock))&&Number(d.stock)>=0,400,'المخزون غير صالح');
    assert(categories.some(c=>c.id===d.categoryId&&c.active!==false),400,'اختر تصنيفًا فعالًا');
    assert(!d.subcategoryId||subcategories.some(c=>c.id===d.subcategoryId&&c.parentId===d.categoryId),400);
    await checkImages(d.images,user,old?.data.images||[]);
    if(d.status==='published'||old?.data.status==='published'){assert(can(user,'publish')&&can(user,'translate'));assert(body.redactionConfirmed===true&&Object.values(d.translation).every(Boolean),400,'راجع النصين العربي والإنجليزي وأكّد إزالة بيانات المورد');}
    changes.push({table:'public_offers',id:p.id,version:p.version,ownerId:supplier.id,data:d,action:'studio_product_save'});
  }
  if(body.action==='publish'){
    const nextIds=new Set(categories.map(c=>c.id));
    for(const c of row.data.categories||[])if(!nextIds.has(c.id)){const used=await db('public_offers',`data->>categoryId=eq.${encodeURIComponent(c.id)}&data->>deletedAt=is.null`);assert(used.every(p=>changes.some(x=>x.id===p.id&&(x.data.deletedAt||nextIds.has(x.data.categoryId)))),409,'انقل منتجات التصنيف أو أخفِه قبل حذفه');}
  }
  const data=structuredClone(row.data);
  if(body.action==='draft'){
    // Keep draft product data private; validate it again when publishing.
    data.studioDraft={...store,categories:input.categories,products:edits};
  }else{
    data.storefront=store;data.categories=categories;data.subcategories=subcategories;delete data.studioDraft;
    data.storefrontPublishedAt=new Date().toISOString();
  }
  await rpc('commit_changes',{actor:user.id,changes:[...(body.action==='publish'?changes:[]),{table:'settings',id:'site',version:row.version,data,action:'studio_'+body.action}]});
  return {ok:true};
}
