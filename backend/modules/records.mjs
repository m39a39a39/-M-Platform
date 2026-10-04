import {upgradeSettings} from './storefront-upgrade.mjs';
import {selectSectionProducts} from '../../shared/storefront-model.mjs';
import {db,one,assert} from '../lib/supabase.mjs';
import {ownSource} from './supply-sources.mjs';
import {can,profile} from './auth.mjs';
export const tables={requests:'requests',quotes:'quotes',publicOffers:'public_offers',interests:'interests'};
export const active=p=>p&&!p.blocked_at&&!p.deleted_at;
export const open=r=>r&&!r.data.deletedAt&&!r.data.suspendedAt;
export function unpack(row,kind){return {...row.data,id:row.id,displayNo:row.display_no,version:row.version,createdAt:row.created_at,...(kind==='requests'||kind==='interests'?{customerId:row.owner_id}:{supplierId:row.owner_id}),...(row.request_id?{requestId:row.request_id}:{}),...(row.offer_id?{offerId:row.offer_id}:{})};}
export function ownRecord(row,kind){const item=unpack(row,kind);delete item.supplierIds;delete item.moderationHistory;delete item.reviewedAt;delete item.internalNotes;delete item.orderAudit;delete item.supplierAssignmentHistory;delete item.assignedSupplierId;delete item.createdByAdmin;delete item.supplyTerms;delete item.supplySourceId;return item;}
function publicSettings(data={}){const safe={...data};delete safe.bankAccounts;delete safe.studioDraft;return safe;}
function publicSectionForView(section={}){
  const next={...section},type=String(section.type||'');
  if(!['benefits','steps','faq'].includes(type)){delete next.items;delete next.itemsEn;}
  if(type!=='footer'){delete next.email;delete next.phone;delete next.footerGroups;delete next.footerTitles;}
  if(!['categories','categoryNav','productCategories'].includes(type)){delete next.categoryIds;delete next.categoryImages;}
  if(type!=='products'){delete next.productIds;delete next.productSource;delete next.productSort;delete next.categoryId;delete next.collectionId;}
  if(type!=='catalog')delete next.catalog;
  if(!['imageBanner','hero','image'].includes(type))delete next.image;
  if(!['imageBanner','hero','image','text','cta','products'].includes(type)){
    delete next.href;delete next.button;delete next.buttonEn;delete next.buttonTarget;delete next.showButton;delete next.clickable;
  }
  if(!['hero','image','products'].includes(type)){delete next.showAllProducts;delete next.showImage;}
  return next;
}
function publicSettingsForView(data={},route={}){
  const {pageId='',productId='',category='',q=''}=route,safe=publicSettings(upgradeSettings(data));
  if(safe.storefront){
    const routePage=productId?'product':category?'category':(q||['products','search'].includes(pageId))?'search':pageId?'':'home';
    const sections=(safe.storefront.sections||[]).filter(section=>{
      const page=section.page||(['header','footer'].includes(section.type)?'global':'home');
      return page==='global'||(routePage&&page===routePage);
    }).map(publicSectionForView);
    safe.storefront={...safe.storefront,
      pages:(safe.storefront.pages||[]).map(page=>{
        if(page.id===pageId)return page;
        const next={...page};delete next.content;delete next.contentEn;return next;
      }),
      sections
    };
  }
  return safe;
}
function publicProductSummary(row){
  const d=row.data||{},translation=d.translation||{};
  return {id:row.id,displayNo:row.display_no,createdAt:row.created_at,updatedAt:d.updatedAt||d.publishedAt||row.created_at,status:'published',
    sku:d.sku||'',translation:{titleAr:translation.titleAr||'',titleEn:translation.titleEn||''},images:Array.isArray(d.images)?d.images.filter(Boolean).slice(0,1):[],
    country:d.country||'',categoryId:d.categoryId||'',subcategoryId:d.subcategoryId||'',unitPrice:d.unitPrice??'',currency:d.currency||'',moq:d.moq??'',stock:d.stock??'',
    tiers:Array.isArray(d.tiers)?d.tiers:[]};
}
export function supplierInterest(row){
  const d=row.data||{},snapshot=d.offerSnapshot||{},terms=d.supplyTerms||{};
  const safeSnapshot={
    sku:String(snapshot.sku||''),product:String(snapshot.product||''),translation:snapshot.translation||{},
    images:Array.isArray(snapshot.images)?snapshot.images:[],country:String(snapshot.country||''),categoryId:String(snapshot.categoryId||'')
  };
  return {id:row.id,displayNo:row.display_no,offerId:row.offer_id,version:row.version,createdAt:row.created_at,status:d.status,trackingStatus:d.trackingStatus||'received',cartOrderId:d.cartOrderId||'',cartLine:d.cartLine||'',quantity:d.quantity||'',unitPrice:terms.unitPrice??'',currency:terms.currency||'',moq:terms.moq??'',total:terms.unitPrice!==undefined?Number(d.quantity)*terms.unitPrice:'',leadTime:terms.leadTime??'',offerSnapshot:safeSnapshot,paymentConfirmed:d.paymentStatus==='confirmed',supplierOrderStatus:d.supplierOrderStatus||'pending_confirmation',supplierOrderNote:d.supplierOrderNote||'',supplierOrderUpdatedAt:d.supplierOrderUpdatedAt||'',assignedSupplierId:d.assignedSupplierId||''};
}
// Pure projection: never serialize raw source text or counterpart identity.
export function anonymous(row,kind,user){
  const d=row.data;
  const result={id:row.id,displayNo:row.display_no,version:row.version,createdAt:row.created_at,status:d.status,translation:d.translation||{},images:d.images||[],country:d.country||''};
  const fields=kind==='requests'?['quantity','neededDate']:['sku','subcategoryId','unitPrice','currency','moq','leadTime','sampleCost','stock','validUntil','categoryId','shortDescription','productNotes','options','technicalSpecs','tiers'];
  for(const key of fields)if(d[key]!==undefined)result[key]=d[key];
  if(kind==='requests'){result.supplierIds=[user.id];result.quoteSelected=!!d.selectedQuoteId;result.paymentConfirmed=d.paymentStatus==='confirmed';}
  if(kind==='quotes')result.publishedAt=d.publishedAt||d.updatedAt||d.reviewedAt||row.created_at;
  if(row.request_id)result.requestId=row.request_id;
  return result;
}
function projectCartReplacementRequest(row,item,supplierId){
  if(row?.data?.orderType!=='cart')return item;
  const invites=Array.isArray(row.data.cartReplacementInvites)?row.data.cartReplacementInvites:[];
  const invite=[...invites].reverse().find(x=>x&&x.supplierId===supplierId&&!['selected','cancelled'].includes(x.status));
  if(!invite?.interestId)return item;
  const line=(Array.isArray(row.data.cartItems)?row.data.cartItems:[]).find(x=>x?.interestId===invite.interestId);
  if(!line)return item;
  item.orderType='cart_replacement';item.replacementInterestId=invite.interestId;
  item.translation=line.translation||{};item.images=Array.isArray(line.images)?line.images:[];
  item.country=String(line.country||'');item.quantity=line.quantity||'';
  item.replacementCurrency=String(line.currency||'').toUpperCase();
  item.replacementForCart=true;
  return item;
}
export async function rows(table,query=''){
  const result=[];
  for(let offset=0;offset<20000;offset+=500){
    const page=await db(table,`${query}${query?'&':''}order=id&limit=500&offset=${offset}`);result.push(...page);
    if(page.length<500)return result;
  }
  assert(false,413,'هذه القائمة كبيرة؛ يلزم تفعيل التقسيم إلى صفحات / Pagination required');
}
const inIds=ids=>ids.map(x=>`"${x}"`).join(',');
function homepageOfferPlan(settingsData={}){
  const storefront=upgradeSettings(settingsData).storefront||{},sections=(storefront.sections||[]).filter(section=>section?.visible!==false);
  const collections=storefront.collections||[],manualIds=new Set(),categoryNeeds=[];
  let latestLimit=20;
  for(const section of sections){
    if(section.type==='catalog'){latestLimit=Math.max(latestLimit,Number(section.catalog?.pageSize)||20);continue;}
    if(section.type!=='products')continue;
    const limit=Math.max(1,Number(section.limit)||6),mode=section.productSource||'latest';
    if(mode==='manual'||mode==='featured')for(const id of section.productIds||[])if(id)manualIds.add(id);
    else if(mode==='collection'){
      const collection=collections.find(item=>item.id===section.collectionId&&item.active!==false);
      for(const id of collection?.productIds||[])if(id)manualIds.add(id);
    }else if(mode==='category'&&section.categoryId)categoryNeeds.push({id:section.categoryId,limit});
    else latestLimit=Math.max(latestLimit,limit);
  }
  return {manualIds:[...manualIds],categoryNeeds,latestLimit};
}
async function homepageOfferRows(settingsData={}){
  const {manualIds,categoryNeeds,latestLimit}=homepageOfferPlan(settingsData),base='data->>status=eq.published&data->>deletedAt=is.null';
  const tasks=[db('public_offers',`${base}&order=created_at.desc&limit=${Math.min(120,latestLimit+24)}`)];
  if(manualIds.length)tasks.push(db('public_offers',`id=in.(${inIds(manualIds)})&${base}&limit=${manualIds.length}`));
  for(const need of categoryNeeds)tasks.push(db('public_offers',`${base}&data->>categoryId=eq.${encodeURIComponent(need.id)}&order=created_at.desc&limit=${Math.min(60,need.limit+12)}`));
  const rows=(await Promise.all(tasks)).flat();
  return [...new Map(rows.map(row=>[row.id,row])).values()];
}
async function productPageOfferRows(productId){
  const current=await one('public_offers',productId);
  if(!open(current)||current.data?.status!=='published')return [];
  const base='data->>status=eq.published&data->>deletedAt=is.null',categoryId=String(current.data?.categoryId||''),tasks=[];
  if(categoryId){
    tasks.push(db('public_offers',`${base}&data->>categoryId=eq.${encodeURIComponent(categoryId)}&order=created_at.desc&limit=16`));
    tasks.push(db('public_offers',`${base}&data->>categoryId=neq.${encodeURIComponent(categoryId)}&order=created_at.desc&limit=16`));
  }else tasks.push(db('public_offers',`${base}&order=created_at.desc&limit=24`));
  const extras=(await Promise.all(tasks)).flat();
  return [...new Map([current,...extras].map(row=>[row.id,row])).values()];
}
async function categoryPageOfferRows(settingsData,categoryId){
  const upgraded=upgradeSettings(settingsData),main=(upgraded.categories||[]).find(item=>item.id===categoryId&&item.active!==false);
  const sub=(upgraded.subcategories||[]).find(item=>item.id===categoryId&&item.active!==false);
  const resolvedMain=sub?.parentId||main?.id||'';
  if(!resolvedMain)return [];
  let query=`data->>status=eq.published&data->>deletedAt=is.null&data->>categoryId=eq.${encodeURIComponent(resolvedMain)}`;
  if(sub)query+=`&data->>subcategoryId=eq.${encodeURIComponent(sub.id)}`;
  return rows('public_offers',query);
}
export async function snapshot(user,{productId='',pageId='',category='',q='',cartIds=[]}={}){
  let requests=[],quotes=[],publicOffers=[],interests=[],accounts=[],settings,selectedSupplierQuotes=[],supplySources=[];
  if(user?.role==='supplier')supplySources=(await rows('supply_sources',`owner_id=eq.${user.id}`)).filter(open).map(ownSource);
  else if(user?.role==='admin'&&(can(user,'offers.read')||can(user,'offers.edit')||can(user,'publish')||can(user,'requests.edit')))supplySources=(await rows('supply_sources')).filter(open).map(r=>({...ownSource(r),supplierId:r.owner_id}));
  if(user?.role==='admin'){
    const readRequests=can(user,'requests.read')||can(user,'requests.edit')||can(user,'translate')||can(user,'publish')||can(user,'trash')||can(user,'moderate');
    const readOffers=can(user,'offers.read')||can(user,'offers.edit')||can(user,'translate')||can(user,'publish')||can(user,'trash')||can(user,'moderate');
    const readAccounts=readRequests||readOffers||can(user,'accounts.read')||can(user,'accounts.manage')||can(user,'team')||can(user,'moderate');
    [settings,requests,quotes,publicOffers,interests,accounts]=await Promise.all([
      one('settings','site'),
      readRequests?rows('requests'):[],
      readOffers?rows('quotes'):[],
      readOffers?rows('public_offers'):[],
      (readOffers||readRequests)?rows('interests'):[],
      readAccounts?rows('profiles'):[]
    ]);
    accounts=readAccounts?accounts.map(p=>can(user,'accounts.read')||can(user,'accounts.manage')&&p.role!=='admin'||p.id===user.id||p.role==='admin'&&can(user,'team')?profile(p):{id:p.id,role:p.role,version:p.version,name:`#${p.id.slice(0,8)}`,blockedAt:p.blocked_at,deletedAt:p.deleted_at}):[profile(user)];
    return {user:profile(user),supplySources,accounts,requests:requests.map(r=>unpack(r,'requests')),quotes:quotes.map(r=>{const parent=requests.find(p=>p.id===r.request_id);return {...unpack(r,'quotes'),...(parent?.data.deletedAt&&!r.data.deletedAt?{deletedAt:parent.data.deletedAt,deletedWithOrder:parent.id}:{})};}),publicOffers:publicOffers.map(r=>unpack(r,'publicOffers')),interests:interests.map(r=>unpack(r,'interests')),settings:{...(can(user,'settings')?upgradeSettings(settings.data):Object.fromEntries(Object.entries(upgradeSettings(settings.data)).filter(([k])=>k!=='studioDraft'))),_version:settings.version}};
  }

  if(user?.role==='client'){
    [settings,publicOffers,requests,interests]=await Promise.all([
      one('settings','site'),
      rows('public_offers','data->>status=eq.published&data->>deletedAt=is.null'),
      rows('requests',`owner_id=eq.${user.id}&data->>deletedAt=is.null`),
      rows('interests',`owner_id=eq.${user.id}`)
    ]);
    if(requests.length)quotes=await rows('quotes',`request_id=in.(${inIds(requests.map(r=>r.id))})&data->>status=eq.published&data->>deletedAt=is.null`);
  }else if(user?.role==='supplier'){
    [settings,requests,quotes,publicOffers]=await Promise.all([
      one('settings','site'),
      rows('requests',`data->supplierIds=cs.${encodeURIComponent(JSON.stringify([user.id]))}&data->>status=eq.sent&data->>deletedAt=is.null&data->>suspendedAt=is.null`),
      rows('quotes',`owner_id=eq.${user.id}&data->>deletedAt=is.null`),
      rows('public_offers',`owner_id=eq.${user.id}&data->>deletedAt=is.null`)
    ]);
    const assignedQuotes=await rows('quotes',`data->>assignedSupplierId=eq.${user.id}&data->>deletedAt=is.null`);
    quotes=[...new Map([...quotes,...assignedQuotes].filter(q=>!q.data.assignedSupplierId||q.data.assignedSupplierId===user.id).map(q=>[q.id,q])).values()];
    const selectedIds=[...new Set(requests.map(r=>r.data?.selectedQuoteId).filter(Boolean))];
    selectedSupplierQuotes=selectedIds.length?await rows('quotes',`id=in.(${inIds(selectedIds)})`):[];
    const ids=publicOffers.filter(o=>o.owner_id===user.id&&!o.data.storeOwned).map(o=>o.id);
    const ownedInterests=ids.length?await rows('interests',`offer_id=in.(${inIds(ids)})`):[];
    const assignedInterests=await rows('interests',`data->>assignedSupplierId=eq.${user.id}`);
    interests=[...new Map([...ownedInterests,...assignedInterests].filter(i=>i.data?.assignedSupplierId===user.id||!i.data?.requiresAssignment&&!i.data?.assignedSupplierId).map(i=>[i.id,i])).values()];
    interests=interests.filter(i=>{
      const tracking=i.data?.trackingStatus||'received';
      return !['completed','cancelled'].includes(tracking)&&(i.data.assignedSupplierId===user.id||tracking!=='received'||['coordinating','accepted'].includes(i.data?.status));
    });
  }else{
    settings=await one('settings','site');
    const homepageOnly=!productId&&!pageId&&!category&&!q;
    const policyOnly=!!pageId&&!['products','search'].includes(pageId)&&!productId&&!category&&!q;
    if(homepageOnly)publicOffers=await homepageOfferRows(settings.data);
    else if(productId)publicOffers=await productPageOfferRows(productId);
    else if(category)publicOffers=await categoryPageOfferRows(settings.data,category);
    else if(policyOnly)publicOffers=[];
    else publicOffers=await rows('public_offers','data->>status=eq.published&data->>deletedAt=is.null');
    if(cartIds.length){
      const cartRows=await db('public_offers',`id=in.(${inIds(cartIds)})&data->>status=eq.published&data->>deletedAt=is.null&limit=${cartIds.length}`);
      publicOffers=[...new Map([...publicOffers,...cartRows].map(row=>[row.id,row])).values()];
    }
  }

  interests=interests.filter(open);
  if(user?.role==='supplier'&&quotes.length){const parentIds=[...new Set(quotes.map(q=>q.request_id).filter(Boolean))],parents=parentIds.length?await rows('requests',`id=in.(${inIds(parentIds)})`):[];quotes=quotes.filter(q=>parents.some(p=>p.id===q.request_id&&open(p)));}
  const ownerIds=[...new Set([...requests,...quotes,...publicOffers].map(r=>r.owner_id).filter(Boolean))];
  const owners=ownerIds.length?await rows('profiles',`id=in.(${inIds(ownerIds)})`):[];
  const ownerActive=id=>active(owners.find(p=>p.id===id));
  if(user?.role==='supplier')requests=requests.filter(r=>{
    if(!ownerActive(r.owner_id)||['completed','cancelled'].includes(r.data?.trackingStatus))return false;
    const selected=r.data?.selectedQuoteId,selectedRow=selectedSupplierQuotes.find(q=>q.id===selected);
    const replacementOpen=selectedRow?.data?.supplierOrderStatus==='cannot_fulfill';
    return !selected||replacementOpen||quotes.some(q=>q.id===selected&&(q.data.assignedSupplierId||q.owner_id)===user.id);
  });
  quotes=quotes.filter(q=>q.owner_id===user?.id||user?.role==='supplier'&&q.data.assignedSupplierId===user.id||ownerActive(q.owner_id)&&open(requests.find(r=>r.id===q.request_id)));
  publicOffers=publicOffers.filter(o=>open(o)&&(o.data.storeOwned||o.owner_id===user?.id||ownerActive(o.owner_id)));
  const projectedRequests=requests.map(r=>{
    if(r.owner_id===user?.id)return ownRecord(r,'requests');
    let item=anonymous(r,'requests',user);
    if(user?.role==='supplier'){
      item=projectCartReplacementRequest(r,item,user.id);
      const ownSelected=quotes.find(q=>q.id===r.data?.selectedQuoteId&&(q.data.assignedSupplierId||q.owner_id)===user.id);
      item.selectedForSupplier=!!(ownSelected&&ownSelected.data?.supplierOrderStatus!=='cannot_fulfill');
      item.replacementQuoteOpen=!!(r.data?.selectedQuoteId&&selectedSupplierQuotes.find(q=>q.id===r.data.selectedQuoteId)?.data?.supplierOrderStatus==='cannot_fulfill');
    }
    return item;
  });
  const responseSettings=user?publicSettings(upgradeSettings(settings.data)):publicSettingsForView(settings.data,{pageId,productId,category,q});
  let responseOffers=publicOffers.map(r=>!user&&r.id!==productId?publicProductSummary(r):anonymous(r,'publicOffers',user));
  const cartResponseOffers=!user&&cartIds.length?responseOffers.filter(item=>cartIds.includes(item.id)):[];
  if(!user&&!productId&&!pageId&&!category&&!q){
    const storefront=responseSettings.storefront||{},sections=(storefront.sections||[]).filter(section=>section?.visible!==false);
    const collections=storefront.collections||[],selected=new Map();
    const add=product=>{if(product?.id)selected.set(product.id,product);};
    const latest=[...responseOffers].sort((a,b)=>String(b.createdAt||b.updatedAt||'').localeCompare(String(a.createdAt||a.updatedAt||''))||String(a.id).localeCompare(String(b.id)));
    const {latestLimit}=homepageOfferPlan(responseSettings);
    latest.slice(0,latestLimit).forEach(add);
    for(const section of sections){
      if(section.type!=='products'&&section.type!=='catalog')continue;
      const limit=section.type==='catalog'?Math.max(20,Number(section.catalog?.pageSize)||20):Math.max(1,Number(section.limit)||6);
      selectSectionProducts(responseOffers,{...section,limit},collections).forEach(add);
    }
    responseOffers=[...selected.values()];
  }
  if(cartResponseOffers.length)responseOffers=[...new Map([...responseOffers,...cartResponseOffers].map(item=>[item.id,item])).values()];
  return {user:profile(user),supplySources,accounts:user?[profile(user)]:[],settings:{...responseSettings,_version:settings.version},
    requests:projectedRequests,
    quotes:quotes.map(r=>{if(r.owner_id===user?.id)return ownRecord(r,'quotes');const item=anonymous(r,'quotes',user);if(user?.role==='supplier'){for(const key of ['unitPrice','currency','moq','leadTime','sampleCost'])delete item[key];if(r.data.assignedSupplierId===user.id)Object.assign(item,{supplierOrderStatus:r.data.supplierOrderStatus,supplierOrderNote:r.data.supplierOrderNote,supplierOrderUpdatedAt:r.data.supplierOrderUpdatedAt});}return item;}),
    publicOffers:responseOffers,
    interests:user?.role==='supplier'?interests.map(supplierInterest):interests.map(r=>r.owner_id===user?.id?ownRecord(r,'interests'):{id:r.id,offerId:r.offer_id,status:r.data.status,createdAt:r.created_at})};
}

export async function assertOpenRequest(id){const r=await one('requests',id);assert(open(r)&&active(await one('profiles',r?.owner_id)),409,'الطلب غير متاح / Request unavailable');return r;}