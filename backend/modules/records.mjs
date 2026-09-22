import {db,one,assert} from '../lib/supabase.mjs';
import {can,profile} from './auth.mjs';
export const tables={requests:'requests',quotes:'quotes',publicOffers:'public_offers',interests:'interests'};
export const active=p=>p&&!p.blocked_at&&!p.deleted_at;
export const open=r=>r&&!r.data.deletedAt&&!r.data.suspendedAt;
export function unpack(row,kind){return {...row.data,id:row.id,displayNo:row.display_no,version:row.version,createdAt:row.created_at,...(kind==='requests'||kind==='interests'?{customerId:row.owner_id}:{supplierId:row.owner_id}),...(row.request_id?{requestId:row.request_id}:{}),...(row.offer_id?{offerId:row.offer_id}:{})};}
export function ownRecord(row,kind){const item=unpack(row,kind);delete item.supplierIds;delete item.moderationHistory;delete item.reviewedAt;delete item.internalNotes;delete item.orderAudit;return item;}
function publicSettings(data={}){const safe={...data};delete safe.bankAccounts;delete safe.studioDraft;return safe;}
export function supplierInterest(row){
  const d=row.data||{},snapshot=d.offerSnapshot||{};
  const safeSnapshot={
    sku:String(snapshot.sku||''),product:String(snapshot.product||''),translation:snapshot.translation||{},
    images:Array.isArray(snapshot.images)?snapshot.images:[],country:String(snapshot.country||''),categoryId:String(snapshot.categoryId||'')
  };
  return {id:row.id,displayNo:row.display_no,offerId:row.offer_id,version:row.version,createdAt:row.created_at,status:d.status,trackingStatus:d.trackingStatus||'received',cartOrderId:d.cartOrderId||'',cartLine:d.cartLine||'',quantity:d.quantity||'',unitPrice:d.unitPrice||'',currency:d.currency||'',moq:d.moq||'',total:d.total||'',leadTime:d.replacementLeadTime||'',offerSnapshot:safeSnapshot,paymentConfirmed:d.paymentStatus==='confirmed',supplierOrderStatus:d.supplierOrderStatus||'pending_confirmation',supplierOrderNote:d.supplierOrderNote||'',supplierOrderUpdatedAt:d.supplierOrderUpdatedAt||'',assignedSupplierId:d.assignedSupplierId||'',supplierAssignmentHistory:Array.isArray(d.supplierAssignmentHistory)?d.supplierAssignmentHistory:[]};
}
// Pure projection: never serialize raw source text or counterpart identity.
export function anonymous(row,kind,user){
  const d=row.data;
  const result={id:row.id,displayNo:row.display_no,version:row.version,createdAt:row.created_at,status:d.status,translation:d.translation||{},images:d.images||[],country:d.country||''};
  const fields=kind==='requests'?['quantity','neededDate']:['unitPrice','currency','moq','leadTime','sampleCost','stock','validUntil','categoryId','shortDescription','productNotes','options','technicalSpecs','tiers'];
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
export async function snapshot(user){
  let requests=[],quotes=[],publicOffers=[],interests=[],accounts=[],settings,selectedSupplierQuotes=[];
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
    return {user:profile(user),accounts,requests:requests.map(r=>unpack(r,'requests')),quotes:quotes.map(r=>unpack(r,'quotes')),publicOffers:publicOffers.map(r=>unpack(r,'publicOffers')),interests:interests.map(r=>unpack(r,'interests')),settings:{...(can(user,'settings')?settings.data:Object.fromEntries(Object.entries(settings.data).filter(([k])=>k!=='studioDraft'))),_version:settings.version}};
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
    const selectedIds=[...new Set(requests.map(r=>r.data?.selectedQuoteId).filter(Boolean))];
    selectedSupplierQuotes=selectedIds.length?await rows('quotes',`id=in.(${inIds(selectedIds)})`):[];
    const ids=publicOffers.map(o=>o.id);
    const ownedInterests=ids.length?await rows('interests',`offer_id=in.(${inIds(ids)})`):[];
    const assignedInterests=await rows('interests',`data->>assignedSupplierId=eq.${user.id}`);
    interests=[...new Map([...ownedInterests,...assignedInterests].filter(i=>!i.data?.assignedSupplierId||i.data.assignedSupplierId===user.id).map(i=>[i.id,i])).values()];
    interests=interests.filter(i=>{
      const tracking=i.data?.trackingStatus||'received';
      return !['completed','cancelled'].includes(tracking)&&(tracking!=='received'||['coordinating','accepted'].includes(i.data?.status));
    });
  }else{
    [settings,publicOffers]=await Promise.all([
      one('settings','site'),
      rows('public_offers','data->>status=eq.published&data->>deletedAt=is.null')
    ]);
  }

  const ownerIds=[...new Set([...requests,...quotes,...publicOffers].map(r=>r.owner_id))];
  const owners=ownerIds.length?await rows('profiles',`id=in.(${inIds(ownerIds)})`):[];
  const ownerActive=id=>active(owners.find(p=>p.id===id));
  if(user?.role==='supplier')requests=requests.filter(r=>{
    if(!ownerActive(r.owner_id)||['completed','cancelled'].includes(r.data?.trackingStatus))return false;
    const selected=r.data?.selectedQuoteId,selectedRow=selectedSupplierQuotes.find(q=>q.id===selected);
    const replacementOpen=selectedRow?.data?.supplierOrderStatus==='cannot_fulfill';
    return !selected||replacementOpen||quotes.some(q=>q.id===selected&&q.owner_id===user.id);
  });
  quotes=quotes.filter(q=>q.owner_id===user?.id||ownerActive(q.owner_id)&&open(requests.find(r=>r.id===q.request_id)));
  publicOffers=publicOffers.filter(o=>o.owner_id===user?.id||ownerActive(o.owner_id)&&open(o));
  const projectedRequests=requests.map(r=>{
    if(r.owner_id===user?.id)return ownRecord(r,'requests');
    let item=anonymous(r,'requests',user);
    if(user?.role==='supplier'){
      item=projectCartReplacementRequest(r,item,user.id);
      const ownSelected=quotes.find(q=>q.id===r.data?.selectedQuoteId&&q.owner_id===user.id);
      item.selectedForSupplier=!!(ownSelected&&ownSelected.data?.supplierOrderStatus!=='cannot_fulfill');
      item.replacementQuoteOpen=!!(r.data?.selectedQuoteId&&selectedSupplierQuotes.find(q=>q.id===r.data.selectedQuoteId)?.data?.supplierOrderStatus==='cannot_fulfill');
    }
    return item;
  });
  return {user:profile(user),accounts:user?[profile(user)]:[],settings:{...publicSettings(settings.data),_version:settings.version},
    requests:projectedRequests,
    quotes:quotes.map(r=>r.owner_id===user?.id?ownRecord(r,'quotes'):anonymous(r,'quotes',user)),
    publicOffers:publicOffers.map(r=>r.owner_id===user?.id?ownRecord(r,'publicOffers'):anonymous(r,'publicOffers',user)),
    interests:user?.role==='supplier'?interests.map(supplierInterest):interests.map(r=>r.owner_id===user?.id?ownRecord(r,'interests'):{id:r.id,offerId:r.offer_id,status:r.data.status,createdAt:r.created_at})};
}
export async function assertOpenRequest(id){const r=await one('requests',id);assert(open(r)&&active(await one('profiles',r?.owner_id)),409,'الطلب غير متاح / Request unavailable');return r;}