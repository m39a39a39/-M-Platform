import {catalogDefaults,CATALOG_CONTROLS} from '../../shared/catalog-controls.mjs';
import {SECTION_TYPES,normalizeSectionLayout} from '../../shared/section-layout.mjs';
import {defaultOptions,safeStoreLink} from '../../shared/storefront-model.mjs';
import {upgradeStore} from './storefront-upgrade.mjs';
import {one,db,rpc,assert} from '../lib/supabase.mjs';
import {can} from './auth.mjs';
import {checkImages,validateContent,normalizeCategories,normalizeSubcategories} from './mutations.mjs';

const text=(v,max=10000)=>{assert(typeof v==='string'&&v.length<=max,400,'نص غير صالح أو طويل جدًا');return v.trim();};
const list=(v,max)=>{assert(Array.isArray(v)&&v.length<=max,400,'عدد العناصر يتجاوز الحد المسموح');return v;};
const id=v=>{assert(typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v),400,'معرف غير صالح');return v;};
const link=v=>{assert(safeStoreLink(v||''),400,'رابط غير آمن');return v||'';};
const source=v=>{assert(!v||['manual','category','latest','featured','collection'].includes(v),400,'مصدر منتجات غير صالح');return v||'latest';};
const media=v=>{assert(!v||/^\/api\/media\/[a-f0-9-]{36}$/.test(v),400,'ارفع الصورة إلى المنصة');return v||'';};
export function normalizeStore(input){
  assert(input&&typeof input==='object',400);input=upgradeStore(input);const t=input.theme||{};
  assert(/^#[0-9a-f]{6}$/i.test(t.color)&&[0,8,16,24].includes(Number(t.round)),400,'تحقق من اللون والزوايا');
  const out={schemaVersion:2,policiesInitialized:true,themePagesInitialized:true,options:defaultOptions(),theme:{name:text(t.name,60),tagline:text(t.tagline,100),announcement:text(t.announcement,140),color:t.color,round:Number(t.round),logo:media(t.logo),taglineEn:text(t.taglineEn||'',100),announcementEn:text(t.announcementEn||'',140)},sections:[],banners:[],pages:[],links:[],collections:[]};
  out.sections=list(input.sections,80).map(s=>{assert(SECTION_TYPES.includes(s.type)&&['both','web','app'].includes(s.channel),400);let layout;try{layout=normalizeSectionLayout(s);}catch(error){assert(false,400,error.message);}return {...layout,id:id(s.id),page:['global','home','category','product','search'].includes(s.page)?s.page:'home',type:s.type,footerTitles:Object.fromEntries(['shop','policies','contact'].flatMap(k=>[k,k+'En']).map(k=>[k,text(s.footerTitles?.[k]||'',120)])),footerGroups:list(s.footerGroups||['company','shop','policies','contact'],4).map(v=>{assert(['company','shop','policies','contact'].includes(v),400);return v;}),channel:s.channel,visible:!!s.visible,title:text(s.title||'',200),titleEn:text(s.titleEn||'',200),subtitleEn:text(s.subtitleEn||'',5000),buttonEn:text(s.buttonEn||'',80),itemsEn:text(s.itemsEn||'',12000),href:link(s.href),email:text(s.email||'',200),phone:text(s.phone||'',80),productSource:source(s.productSource),productSort:['source','name','price'].includes(s.productSort)?s.productSort:'source',categoryId:s.categoryId?id(s.categoryId):'',productIds:list(s.productIds||[],500).map(id),categoryIds:list(s.categoryIds||[],100).map(id),catalog:normalizeCatalog(s.catalog,input.options),categoryImages:Object.fromEntries(Object.entries(s.categoryImages||{}).slice(0,100).map(([k,v])=>[id(k),media(v)])),subtitle:text(s.subtitle||'',5000),button:text(s.button||'',80),image:media(s.image),collectionId:s.collectionId?id(s.collectionId):'',limit:Math.min(24,Math.max(1,Number(s.limit)||6))};});
  for(const page of ['global','home','category','product','search'])for(const type of ['header','footer','catalog','gallery','productInfo','productDetails','breadcrumb','categoryNav','productCategories'])assert(out.sections.filter(s=>s.type===type&&s.page===page).length<=1,400,'القسم موجود في هذه الصفحة');
  for(const s of out.sections)assert(['header','footer'].includes(s.type)?s.page==='global':s.page!=='global',400,'صفحة القسم غير صالحة');
  assert(new Set(out.sections.map(s=>s.id)).size===out.sections.length,400,'معرفات الأقسام مكررة');
  out.banners=list(input.banners,30).map(b=>{assert(['both','web','app'].includes(b.channel),400);for(const k of ['start','end'])assert(!b[k]||/^\d{4}-\d{2}-\d{2}$/.test(b[k]),400);return {id:id(b.id),title:text(b.title,200),titleEn:text(b.titleEn||'',200),subtitleEn:text(b.subtitleEn||'',2000),button:text(b.button||'',80),buttonEn:text(b.buttonEn||'',80),showButton:b.showButton!==false,targetType:['link','product','category','page'].includes(b.targetType)?b.targetType:'link',targetId:b.targetId?id(b.targetId):'',href:link(b.href),subtitle:text(b.subtitle||'',2000),image:media(b.image),active:!!b.active,channel:b.channel,start:b.start||'',end:b.end||''};});
  out.pages=list(input.pages,100).map(p=>({id:id(p.id),title:text(p.title,120),titleEn:text(p.titleEn||'',120),content:text(p.content,30000),contentEn:text(p.contentEn||'',30000),active:!!p.active,footer:!!p.footer,policy:!!p.policy}));
  assert(new Set(out.pages.map(p=>p.id)).size===out.pages.length,400,'معرفات الصفحات مكررة');
  for(const p of out.pages)if(p.active&&p.policy)assert(p.title&&p.titleEn&&p.content&&p.contentEn,400,'أكمل السياسة بالعربية والإنجليزية');
  out.links=list(input.links,30).map(l=>({id:id(l.id),title:text(l.title,100),titleEn:text(l.titleEn||'',100),target:id(l.target),active:l.active!==false}));
  out.collections=list(input.collections,100).map(c=>({id:id(c.id),name:text(c.name,100),description:text(c.description||'',1000),active:!!c.active,productIds:list(c.productIds,500).map(id)}));
  for(const key of Object.keys(out.options)){assert(input.options?.[key]===undefined||typeof input.options[key]==='boolean',400);out.options[key]=input.options?.[key]??true;}
  return out;
}
export const storeImages=s=>[s?.theme?.logo,...(s?.sections||[]).flatMap(x=>[x.image,...Object.values(x.categoryImages||{})]),...(s?.banners||[]).map(x=>x.image)].filter(Boolean);
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
    // Product ownership belongs to the store; sourcing is managed separately.
    const d={...old?.data,storeOwned:true,sku:text(p.sku,80),product:text(p.name,100),specs:text(p.description),country:text(p.country,80),unitPrice:Number(p.price),currency:p.currency,moq:Number(p.moq),stock:p.stock==null?'':String(p.stock),stockUnlimited:p.stockUnlimited!==false,leadTime:String(p.leadDays),categoryId:p.categoryId,subcategoryId:p.subcategoryId||'',images:list(p.images,5),translation:{titleAr:text(p.name,100),titleEn:text(p.nameEn,100),descriptionAr:text(p.description),descriptionEn:text(p.descriptionEn)},status:p.status==='active'?'published':'review',studioArchived:p.status==='archived',shortDescription:text(p.shortDescription||'',500),productNotes:text(p.notes||'',2000),options:text(p.options||'',1000),technicalSpecs:text(p.technicalSpecs||'',5000),tiers:normalizeTiers(p.tiers,p.moq,p.price),updatedAt:new Date().toISOString()};
    for(const value of [...Object.values(d.translation),d.shortDescription,d.productNotes,d.options,d.technicalSpecs])assert(!/(?:https?:\/\/|www\.|wa\.me|@[a-z0-9]|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+|00)\d[\d\s()-]{7,})/i.test(value),400,'احذف بيانات التواصل من المحتوى العام');
    const countries=row.data.supplyCountries?.length?row.data.supplyCountries:[{id:'China'},{id:'United Arab Emirates'}];assert(countries.some(c=>c.id===d.country&&c.active!==false),400,'اختر دولة توريد معتمدة');
    validateContent('publicOffers',d);assert(Number.isInteger(d.moq)&&d.moq>0,400);assert(d.stock===''||Number.isInteger(Number(d.stock))&&Number(d.stock)>=0,400,'المخزون غير صالح');
    assert(categories.some(c=>c.id===d.categoryId&&c.active!==false),400,'اختر تصنيفًا فعالًا');
    assert(!d.subcategoryId||subcategories.some(c=>c.id===d.subcategoryId&&c.parentId===d.categoryId),400);
    await checkImages(d.images,user,old?.data.images||[]);
    if(d.status==='published'||old?.data.status==='published'){assert(can(user,'publish')&&can(user,'translate'));assert(body.redactionConfirmed===true&&Object.values(d.translation).every(Boolean),400,'راجع النصين العربي والإنجليزي وأكّد إزالة بيانات المورد');}
    changes.push({table:'public_offers',id:p.id,version:p.version,ownerId:old?.owner_id||null,data:d,action:'studio_product_save'});
  }
  if(body.action==='publish'){
    const nextIds=new Set(categories.map(c=>c.id));
    for(const c of row.data.categories||[])if(!nextIds.has(c.id)){const used=await db('public_offers',`data->>categoryId=eq.${encodeURIComponent(c.id)}&data->>deletedAt=is.null`);assert(used.every(p=>changes.some(x=>x.id===p.id&&(x.data.deletedAt||nextIds.has(x.data.categoryId)))),409,'انقل منتجات التصنيف أو أخفِه قبل حذفه');}
  }
  const data=structuredClone(row.data);
  if(body.action==='publish')for(const key of ['homeTitleAr','homeTitleEn','homeSubtitleAr','homeSubtitleEn'])delete data[key];
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


export async function saveStudioProduct(user,body={}){
  assert(user?.role==='admin'&&can(user,'offers.edit'),403,'غير مسموح / Not allowed');
  const p=body.product;assert(p&&typeof p==='object'&&!Array.isArray(p),400,'بيانات المنتج غير صالحة / Invalid product');
  id(p.id);assert(['draft','active','archived'].includes(p.status),400,'حالة المنتج غير صالحة / Invalid product status');
  const old=await one('public_offers',p.id);
  assert(!old?.data?.deletedAt,409,'المنتج محذوف / Product deleted');
  assert(Number(p.version||0)===(old?.version||0),409,'تغيّر المنتج؛ حدّث الصفحة / Product changed; refresh');
  const settings=await one('settings','site');assert(settings,409,'إعدادات المتجر غير متاحة / Store settings unavailable');
  const categories=Array.isArray(settings.data?.categories)?settings.data.categories:[];
  const subcategories=Array.isArray(settings.data?.subcategories)?settings.data.subcategories:[];
  const countries=Array.isArray(settings.data?.supplyCountries)&&settings.data.supplyCountries.length?settings.data.supplyCountries:[{id:'China',active:true},{id:'United Arab Emirates',active:true}];
  const now=new Date().toISOString(),published=p.status==='active';
  const d={...old?.data,storeOwned:true,sku:text(String(p.sku||''),80),product:text(String(p.name||''),100),specs:text(String(p.description||'')),country:text(String(p.country||''),80),unitPrice:Number(p.price),currency:String(p.currency||'').toUpperCase(),moq:Number(p.moq),stock:p.stock==null?'':String(p.stock),stockUnlimited:p.stockUnlimited!==false,leadTime:String(p.leadDays),categoryId:String(p.categoryId||''),subcategoryId:String(p.subcategoryId||''),images:list(p.images||[],5),translation:{titleAr:text(String(p.name||''),100),titleEn:text(String(p.nameEn||''),100),descriptionAr:text(String(p.description||'')),descriptionEn:text(String(p.descriptionEn||''))},status:published?'published':'review',studioArchived:p.status==='archived',shortDescription:text(String(p.shortDescription||''),500),productNotes:text(String(p.notes||''),2000),options:text(String(p.options||''),1000),technicalSpecs:text(String(p.technicalSpecs||''),5000),tiers:normalizeTiers(p.tiers||[],Number(p.moq),Number(p.price)),createdAt:old?.data?.createdAt||now,updatedAt:now};
  const publicText=[...Object.values(d.translation),d.shortDescription,d.productNotes,d.options,d.technicalSpecs];
  for(const value of publicText)assert(!/(?:https?:\/\/|www\.|wa\.me|@[a-z0-9]|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+|00)\d[\d\s()-]{7,})/i.test(value),400,'احذف بيانات التواصل من المحتوى العام');
  assert(d.product&&/^[A-Za-z0-9._-]{1,80}$/.test(d.sku),400,'أكمل اسم المنتج وتحقق من SKU / Complete product name and SKU');
  assert(Number.isFinite(d.unitPrice)&&d.unitPrice>0&&Number.isInteger(d.moq)&&d.moq>0&&Number.isInteger(Number(d.leadTime))&&Number(d.leadTime)>0,400,'تحقق من السعر والحد الأدنى ومدة التجهيز / Check price, MOQ and lead time');
  assert(['USD','SAR','AED','CNY','EUR'].includes(d.currency),400,'عملة غير مدعومة / Unsupported currency');
  assert(d.stock===''||Number.isInteger(Number(d.stock))&&Number(d.stock)>=0,400,'المخزون غير صالح / Invalid stock');
  assert(d.country.length<=80&&d.categoryId.length<=80&&d.subcategoryId.length<=80,400,'بيانات التصنيف أو دولة التوريد غير صالحة / Invalid taxonomy or supply country');
  await checkImages(d.images,user,old?.data?.images||[]);
  if(published){
    assert(can(user,'publish')&&can(user,'translate'),403,'لا تملك صلاحية النشر / Publishing not allowed');
    assert(body.redactionConfirmed===true,400,'أكد مراجعة النصوص والصور قبل النشر / Confirm content review before publishing');
    validateContent('publicOffers',d);
    assert(countries.some(c=>c.id===d.country&&c.active!==false),400,'اختر دولة توريد معتمدة / Choose an active supply country');
    assert(categories.some(c=>c.id===d.categoryId&&c.active!==false),400,'اختر تصنيفًا فعالًا / Choose an active category');
    assert(!d.subcategoryId||subcategories.some(s=>s.id===d.subcategoryId&&s.parentId===d.categoryId&&s.active!==false),400,'التصنيف الفرعي غير متاح / Subcategory unavailable');
    assert(Object.values(d.translation).every(Boolean),400,'أكمل الاسم والوصف بالعربية والإنجليزية قبل النشر / Complete Arabic and English name and description before publishing');
    d.publishedAt=old?.data?.publishedAt||now;
  }else{
    if(d.country)assert(countries.some(c=>c.id===d.country),400,'دولة التوريد غير متاحة / Supply country unavailable');
    if(d.categoryId)assert(categories.some(c=>c.id===d.categoryId),400,'التصنيف غير متاح / Category unavailable');
    if(d.subcategoryId)assert(subcategories.some(s=>s.id===d.subcategoryId&&s.parentId===d.categoryId),400,'التصنيف الفرعي غير متاح / Subcategory unavailable');
  }
  const changes=[{table:'public_offers',id:p.id,version:old?.version||0,ownerId:old?.owner_id||null,data:d,action:'studio_product_save'}];
  const settingsData=structuredClone(settings.data||{}),draftProducts=settingsData.studioDraft?.products;
  if(Array.isArray(draftProducts)&&draftProducts.some(item=>item?.id===p.id)){
    settingsData.studioDraft={...settingsData.studioDraft,products:draftProducts.filter(item=>item?.id!==p.id)};
    changes.push({table:'settings',id:'site',version:settings.version,data:settingsData,action:'studio_product_draft_clear'});
  }
  await rpc('commit_changes',{actor:user.id,changes});
  return {ok:true,status:d.status};
}

function normalizeCatalog(raw={},options={}){
 const result={...catalogDefaults(),...Object.fromEntries(Object.keys(CATALOG_CONTROLS).filter(k=>typeof options[k]==='boolean').map(k=>[k,options[k]]))};for(const k of Object.keys(CATALOG_CONTROLS)){assert(raw[k]===undefined||typeof raw[k]==='boolean',400);if(raw[k]!==undefined)result[k]=raw[k];}
 for(const k of ['categoryIds','subcategoryIds','countryIds'])result[k]=list(raw[k]||[],100).map(v=>text(v,80));
 assert(raw.pageSize===undefined||[12,20,40,60].includes(Number(raw.pageSize)),400);result.pageSize=Number(raw.pageSize)||20;
 assert(raw.sort===undefined||['newest','name','price-asc','price-desc'].includes(raw.sort),400);result.sort=raw.sort||'newest';for(const [key,values] of Object.entries({searchPosition:['before','after'],filterLayout:['top','sidebar']})){assert(raw[key]===undefined||values.includes(raw[key]),400,'موضع أدوات البحث غير صالح');result[key]=raw[key]||values[0];}return result;
}
