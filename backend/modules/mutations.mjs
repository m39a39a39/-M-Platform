import {one,db,rpc,assert,sb} from '../lib/supabase.mjs';
import {can} from './auth.mjs';
import {tables,assertOpenRequest,active,open} from './records.mjs';
import {issueQuoteProforma,issueInterestProforma,issueCartProforma} from './invoices.mjs';
const contact=v=>/(?:https?:\/\/|www\.|wa\.me|@[a-z0-9]|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+|00)\d[\d\s()-]{7,})/i.test(String(v));
const contentFields={requests:['product','specs','quantity','country','neededDate','images'],quotes:['unitPrice','currency','moq','leadTime','sampleCost','notes','images'],publicOffers:['sku','product','specs','country','unitPrice','currency','moq','stock','leadTime','validUntil','images','categoryId','subcategoryId']};
const DEFAULT_SUPPLY_COUNTRIES=[{id:'China',nameAr:'الصين',nameEn:'China',active:true,order:0},{id:'United Arab Emirates',nameAr:'الإمارات',nameEn:'UAE',active:true,order:1}];
const PAYMENT_CURRENCIES=['USD','SAR','AED','CNY','EUR'];
const SUPPLIER_ORDER_STATUSES=['confirmed','production','ready_for_inspection','cannot_fulfill'];
function updateSupplierOrder(data,patch,now){
  const next=String(patch.supplierOrderStatus||''),current=data.supplierOrderStatus||'pending_confirmation';
  const transitions={pending_confirmation:['confirmed','cannot_fulfill'],confirmed:['production'],production:['ready_for_inspection'],ready_for_inspection:[],cannot_fulfill:[]};
  assert(SUPPLIER_ORDER_STATUSES.includes(next)&&transitions[current]?.includes(next),409,'تحديث حالة الطلب غير متاح / Order status transition unavailable');
  const note=String(patch.supplierOrderNote||'').trim();
  assert(note.length<=1000,400,'ملاحظة المورد طويلة / Supplier note too long');
  if(next==='cannot_fulfill')assert(note,400,'اكتب سبب تعذر التنفيذ / Add a reason why the order cannot be fulfilled');
  data.supplierOrderStatus=next;data.supplierOrderNote=note;data.supplierOrderUpdatedAt=now;
  data.supplierOrderHistory=[...(Array.isArray(data.supplierOrderHistory)?data.supplierOrderHistory:[]),{at:now,status:next,note}].slice(-100);
}
export const TRACKING_FLOW=['received','reviewing','sourcing','quotes_available','quote_selected','supplier_confirmation','payment_confirmation','production','quality_check','ready_to_ship','shipped','in_delivery','delivered','completed'];
export const READY_TRACKING_FLOW=['received','supplier_confirmation','payment_confirmation','production','quality_check','ready_to_ship','shipped','in_delivery','delivered','completed'];
export const TRACKING_EXCEPTIONS=['customer_action','on_hold','cancelled'];
export const TRACKING_STATUSES=[...TRACKING_FLOW,...TRACKING_EXCEPTIONS];
export const READY_TRACKING_STATUSES=[...READY_TRACKING_FLOW,...TRACKING_EXCEPTIONS];
const trackingRank=s=>TRACKING_FLOW.indexOf(s);
export function allowedAdminTrackingTransition(data,next,flow=TRACKING_FLOW){
  const current=data?.trackingStatus||flow[0],linear=flow.filter(s=>!TRACKING_EXCEPTIONS.includes(s));
  if(next===current)return true;
  if(['completed','cancelled'].includes(current))return false;
  if(TRACKING_EXCEPTIONS.includes(next))return true;
  if(TRACKING_EXCEPTIONS.includes(current)){
    const history=Array.isArray(data?.trackingHistory)?data.trackingHistory:[];
    const last=[...history].reverse().find(h=>linear.includes(h?.status))?.status||linear[0],index=linear.indexOf(last);
    return next===last||next===linear[index+1];
  }
  const index=linear.indexOf(current);
  return index>=0&&next===linear[index+1];
}
function setTracking(data,status,now,note=''){
  data.trackingStatus=status;data.trackingNote=String(note||'').slice(0,1000);data.trackingUpdatedAt=now;
  data.trackingHistory=[...(Array.isArray(data.trackingHistory)?data.trackingHistory:[]),{at:now,status,note:data.trackingNote}].slice(-200);
}
function advanceTracking(data,status,now){
  if(TRACKING_EXCEPTIONS.includes(data.trackingStatus))return false;
  const current=trackingRank(data.trackingStatus||'received'),next=trackingRank(status);
  if(next<0||next<=current)return false;
  setTracking(data,status,now,'');return true;
}
export function requiresRedaction(collection,status,changes){
  if(!['sent','published'].includes(status))return false;
  const relevant=new Set(['translation','status','supplierIds',...(contentFields[collection]||[])]);
  return changes.some(key=>relevant.has(key));
}
export function normalizeCategories(input){
  assert(Array.isArray(input)&&input.length<=100,400,'تصنيفات غير صالحة / Invalid categories');
  const ids=new Set(),namesAr=new Set(),namesEn=new Set();
  return input.map((raw,index)=>{
    assert(raw&&typeof raw==='object'&&!Array.isArray(raw),400);
    const id=String(raw.id||'').trim(),nameAr=String(raw.nameAr||'').trim(),nameEn=String(raw.nameEn||'').trim();
    assert(/^[A-Za-z0-9-]{1,80}$/.test(id)&&nameAr&&nameAr.length<=80&&nameEn&&nameEn.length<=80,400,'بيانات التصنيف غير صالحة / Invalid category');
    const ar=nameAr.toLowerCase(),en=nameEn.toLowerCase();
    assert(!ids.has(id)&&!namesAr.has(ar)&&!namesEn.has(en),400,'التصنيف مكرر / Duplicate category');
    ids.add(id);namesAr.add(ar);namesEn.add(en);
    return {id,nameAr,nameEn,active:raw.active!==false,order:index};
  });
}
export function normalizeSubcategories(input,categories=[]){
  assert(Array.isArray(input)&&input.length<=300,400,'تصنيفات فرعية غير صالحة / Invalid subcategories');
  const parentIds=new Set((categories||[]).map(x=>x.id)),ids=new Set();
  return input.map((raw,index)=>{
    assert(raw&&typeof raw==='object'&&!Array.isArray(raw),400);
    const id=String(raw.id||'').trim(),parentId=String(raw.parentId||'').trim(),nameAr=String(raw.nameAr||'').trim(),nameEn=String(raw.nameEn||'').trim();
    assert(/^[A-Za-z0-9-]{1,80}$/.test(id)&&!ids.has(id)&&parentIds.has(parentId)&&nameAr&&nameEn&&nameAr.length<=80&&nameEn.length<=80,400,'بيانات التصنيف الفرعي غير صالحة / Invalid subcategory');
    ids.add(id);return {id,parentId,nameAr,nameEn,active:raw.active!==false,order:index};
  });
}
export function normalizeSupplyCountries(input){
  assert(Array.isArray(input)&&input.length>0&&input.length<=100,400,'دول التوريد غير صالحة / Invalid supply countries');
  const ids=new Set();
  return input.map((raw,index)=>{
    assert(raw&&typeof raw==='object'&&!Array.isArray(raw),400);
    const id=String(raw.id||'').trim(),nameAr=String(raw.nameAr||'').trim(),nameEn=String(raw.nameEn||'').trim();
    assert(/^[A-Za-z0-9 _-]{1,80}$/.test(id)&&!ids.has(id)&&nameAr&&nameEn&&nameAr.length<=80&&nameEn.length<=80,400,'بيانات دولة التوريد غير صالحة / Invalid supply country');
    ids.add(id);return {id,nameAr,nameEn,active:raw.active!==false,order:index};
  });
}
export function normalizeCurrencies(input){
  assert(Array.isArray(input)&&input.length>0&&input.length<=50,400,'عملات غير صالحة / Invalid currencies');
  const seen=new Set(),rows=input.map((raw,index)=>{
    assert(raw&&typeof raw==='object'&&!Array.isArray(raw),400);
    const code=String(raw.code||'').trim().toUpperCase(),nameAr=String(raw.nameAr||'').trim(),nameEn=String(raw.nameEn||'').trim(),rate=Number(raw.rate);
    assert(/^[A-Z]{3}$/.test(code)&&!seen.has(code)&&nameAr&&nameEn&&nameAr.length<=80&&nameEn.length<=80,400,'بيانات العملة غير صالحة / Invalid currency data');
    assert(Number.isFinite(rate)&&rate>0&&rate<=1e9,400,'سعر الصرف غير صالح / Invalid exchange rate');
    seen.add(code);return {code,nameAr,nameEn,rate:code==='SAR'?1:rate,active:code==='SAR'?true:raw.active!==false,order:index};
  });
  assert(seen.has('SAR'),400,'يجب أن تبقى SAR العملة الأساسية / SAR must remain the base currency');
  return rows;
}
export function normalizeBankAccounts(input){
  assert(Array.isArray(input)&&input.length<=30,400,'حسابات بنكية غير صالحة / Invalid bank accounts');
  const ids=new Set();
  return input.map((raw,index)=>{
    assert(raw&&typeof raw==='object'&&!Array.isArray(raw),400);
    const id=String(raw.id||'').trim(),label=String(raw.label||'').trim(),beneficiary=String(raw.beneficiary||'').trim(),bankName=String(raw.bankName||'').trim();
    const iban=String(raw.iban||'').trim().replace(/\s+/g,' '),swift=String(raw.swift||'').trim(),accountNumber=String(raw.accountNumber||'').trim(),country=String(raw.country||'').trim(),currency=String(raw.currency||'').trim().toUpperCase();
    assert(/^[A-Za-z0-9-]{1,80}$/.test(id)&&!ids.has(id),400,'معرّف الحساب البنكي غير صالح / Invalid bank account id');
    assert(label&&label.length<=100&&beneficiary&&beneficiary.length<=160&&bankName&&bankName.length<=160,400,'أكمل بيانات الحساب البنكي / Complete bank account details');
    assert((iban||accountNumber)&&iban.length<=120&&swift.length<=40&&accountNumber.length<=120&&country.length<=100,400,'تحقق من بيانات الحساب البنكي / Check bank account details');
    assert(PAYMENT_CURRENCIES.includes(currency),400,'عملة الحساب البنكي غير مدعومة / Unsupported bank currency');
    ids.add(id);
    return {id,label,beneficiary,bankName,iban,swift,accountNumber,country,currency,active:raw.active!==false,order:index};
  });
}
async function paymentAccountSnapshot(accountId){
  const settings=await one('settings','site'),rows=Array.isArray(settings?.data?.bankAccounts)?settings.data.bankAccounts:[];
  const account=rows.find(x=>x?.id===accountId&&x.active!==false);
  assert(account,400,'اختر حسابًا بنكيًا نشطًا / Choose an active bank account');
  return Object.fromEntries(['id','label','beneficiary','bankName','iban','swift','accountNumber','country','currency'].map(k=>[k,String(account[k]||'')]));
}
export async function assertProductTaxonomy(data,{required=false,activeOnly=false}={}){
  const settings=await one('settings','site'),s=settings?.data||{};
  const categories=Array.isArray(s.categories)?s.categories:[],subcategories=Array.isArray(s.subcategories)?s.subcategories:[];
  const countries=Array.isArray(s.supplyCountries)&&s.supplyCountries.length?s.supplyCountries:DEFAULT_SUPPLY_COUNTRIES;
  const category=categories.find(x=>x.id===data.categoryId),country=countries.find(x=>x.id===data.country);
  if(required&&categories.length)assert(category,400,'اختر التصنيف الرئيسي / Choose a main category');
  if(category)assert(!activeOnly||category.active!==false,400,'التصنيف غير متاح / Category unavailable');
  if(data.subcategoryId){
    const sub=subcategories.find(x=>x.id===data.subcategoryId);
    assert(sub&&sub.parentId===data.categoryId&&(!activeOnly||sub.active!==false),400,'التصنيف الفرعي غير متاح / Subcategory unavailable');
  }
  assert(country&&(!activeOnly||country.active!==false),400,'دولة التوريد غير متاحة / Supply country unavailable');
}
export function validateContent(kind,d){
  for(const key of kind==='requests'?['quantity']:['unitPrice','moq','leadTime'])assert(Number.isFinite(Number(d[key]))&&Number(d[key])>0&&Number(d[key])<=1e9,400,'تحقق من الكمية والسعر ومدة الإنتاج / Invalid quantities or price');
  if(kind!=='requests')assert(['USD','SAR','AED','CNY','EUR'].includes(d.currency),400,'عملة غير مدعومة / Unsupported currency');
  for(const k of ['product','specs','notes','sampleCost'])if(d[k]!==undefined)assert(typeof d[k]==='string'&&d[k].length<=10000&&!contact(d[k]),400,'احذف بيانات التواصل وتحقق من طول النص / Check text and remove contact details');
  if(kind!=='quotes')assert(d.product?.trim()&&d.specs?.trim(),400,'أكمل اسم المنتج والوصف / Product and description required');
  if(kind==='publicOffers'){
    if(d.sku!==undefined)assert(/^[A-Za-z0-9._-]{1,80}$/.test(String(d.sku||'').trim()),400,'تحقق من SKU / Check SKU');
    assert(typeof d.country==='string'&&d.country.trim()&&d.country.length<=80,400,'اختر دولة التوريد / Choose a supply country');
  }
  for(const key of ['country','neededDate','validUntil','stock'])if(d[key]!==undefined)assert(typeof d[key]==='string'&&d[key].length<=100,400);
  if(d.categoryId!==undefined)assert(typeof d.categoryId==='string'&&d.categoryId.length<=80,400,'تصنيف غير صالح / Invalid category');
  if(d.subcategoryId!==undefined)assert(typeof d.subcategoryId==='string'&&d.subcategoryId.length<=80,400,'تصنيف فرعي غير صالح / Invalid subcategory');
}
function cartInviteFor(data,supplierId){
  const rows=Array.isArray(data?.cartReplacementInvites)?data.cartReplacementInvites:[];
  return [...rows].reverse().find(x=>x&&x.supplierId===supplierId&&!['selected','cancelled'].includes(x.status));
}
export function cartTermsMatch(childData,quoteData){
  if(String(quoteData?.currency||'').toUpperCase()!==String(childData?.currency||'').toUpperCase())return false;
  if(Number(quoteData?.unitPrice)!==Number(childData?.unitPrice))return false;
  if(Number(quoteData?.moq)!==Number(childData?.moq))return false;
  const oldLead=String(childData?.offerSnapshot?.leadTime??'').trim();
  return !oldLead||String(quoteData?.leadTime??'').trim()===oldLead;
}
function applyCartQuoteToParent(data,interestId,quoteData){
  const items=Array.isArray(data.cartItems)?structuredClone(data.cartItems):[],index=items.findIndex(x=>x?.interestId===interestId);
  assert(index>=0,409,'تعذر العثور على المنتج داخل الطلب / Cart item not found');
  const quantity=Number(items[index].quantity),unitPrice=Number(quoteData.unitPrice);
  assert(Number.isFinite(quantity)&&quantity>0&&Number.isFinite(unitPrice)&&unitPrice>0,409,'بيانات العرض البديل غير صالحة / Invalid replacement quote');
  items[index]={...items[index],unitPrice,currency:String(quoteData.currency||'').toUpperCase(),moq:Number(quoteData.moq),leadTime:quoteData.leadTime,total:quantity*unitPrice};
  data.cartItems=items;data.cartTotal=items.reduce((sum,x)=>sum+Number(x.total||0),0);
}
function settleCartInvites(data,interestId,selectedSupplierId,now){
  const rows=Array.isArray(data.cartReplacementInvites)?data.cartReplacementInvites:[];
  const affected=new Set();
  data.cartReplacementInvites=rows.map(x=>{
    if(!x||x.interestId!==interestId)return x;
    affected.add(x.supplierId);
    return {...x,status:x.supplierId===selectedSupplierId?'selected':'cancelled',resolvedAt:now};
  });
  if(Array.isArray(data.supplierIds)){
    affected.add(selectedSupplierId);
    data.supplierIds=data.supplierIds.filter(id=>!affected.has(id));
  }
}
function cartReplacementChildData(child,quote,previousSupplierId,now,termsChanged=true){
  const next=structuredClone(child.data||{}),quantity=Number(next.quantity),unitPrice=Number(quote.data.unitPrice);
  next.supplierAssignmentHistory=[...(Array.isArray(next.supplierAssignmentHistory)?next.supplierAssignmentHistory:[]),{
    rejectedSupplierId:previousSupplierId,rejectionReason:next.supplierOrderNote||'',rejectedAt:next.supplierOrderUpdatedAt||now,
    newSupplierId:quote.owner_id,newQuoteId:quote.id,reassignedAt:now,termsChanged:!!termsChanged
  }].slice(-100);
  next.assignedSupplierId=quote.owner_id;next.replacementQuoteId=quote.id;next.supplierOrderStatus='pending_confirmation';
  next.replacementQuoteSnapshot={unitPrice, currency:String(quote.data.currency||'').toUpperCase(), moq:Number(quote.data.moq), leadTime:String(quote.data.leadTime||''), sampleCost:String(quote.data.sampleCost||''), selectedAt:now};
  next.supplierOrderNote='';next.supplierOrderUpdatedAt=now;next.unitPrice=unitPrice;next.currency=String(quote.data.currency||'').toUpperCase();
  next.moq=Number(quote.data.moq);next.total=quantity*unitPrice;next.replacementLeadTime=quote.data.leadTime||'';
  setTracking(next,'supplier_confirmation',now,'');next.updatedAt=now;
  return next;
}
export async function checkImages(images,user,old=[]){
  assert(Array.isArray(images)&&images.length<=5,400,'الحد الأقصى خمس صور / Maximum five images');
  for(const src of images){
    assert(typeof src==='string'&&/^\/api\/media\/[a-f0-9-]{36}$/.test(src),400,'صورة غير صالحة / Invalid image');
    const m=await one('media',src.split('/').at(-1));
    assert(m&&(m.owner_id===user.id||old.includes(src)),403);
  }
}
export async function mutate(user,body){
  const {collection,id,version,patch}=body,table=tables[collection];
  assert(table&&typeof id==='string'&&/^[A-Za-z0-9-]{1,80}$/.test(id)&&patch&&typeof patch==='object'&&!Array.isArray(patch),400);
  assert(!(user.role==='supplier'&&collection==='publicOffers'),403,'قدّم عرض توريد؛ تعديل منتج المتجر متاح للإدارة فقط');
  const original=await one(table,id);
  assert(Number(version)===(original?.version||0),409,'تغيّرت البيانات؛ حدّث الصفحة / Refresh after conflict');
  const now=new Date().toISOString();
  let data=structuredClone(original?.data||{}),ownerId=original?.owner_id||user.id;
  let linkedSupplierRequest=null,linkedCartRequest=null,cartReplacementCommit=null;
  const changes=Object.keys(patch),isAdmin=user.role==='admin';
  if(original?.data?.orderFlowVersion===2&&isAdmin&&['requests','interests'].includes(collection))assert(false,409,'استخدم إدارة الطلبات الجديدة لهذا الطلب');
  if(!original){
    assert(collection==='requests'?(user.role==='client'||isAdmin&&can(user,'requests.edit')&&can(user,'accounts.read')):collection==='interests'?user.role==='client':user.role==='supplier');
    const allowed=collection==='interests'?['offerId','quantity','status','repeatedFromInterestId']: [...contentFields[collection],...(collection==='quotes'?['requestId']:[]),...(collection==='requests'?['repeatedFromRequestId']:[]),'status'];
    assert(changes.every(k=>allowed.includes(k)),400);
    data=Object.fromEntries(changes.filter(k=>!['status','requestId','offerId'].includes(k)).map(k=>[k,patch[k]]));
    if(isAdmin&&collection==='requests'){const customer=await one('profiles',String(body.customerId||''));assert(active(customer)&&customer.role==='client',400,'اختر عميلًا فعالًا');ownerId=customer.id;data.createdByAdmin=user.id;}
    data.status=collection==='requests'?'review':collection==='interests'?'active':'pending';data.createdAt=now;
    if(collection==='requests'||collection==='interests')setTracking(data,'received',now,'');
    if(collection==='requests'&&data.repeatedFromRequestId){
      assert(/^[A-Za-z0-9-]{1,80}$/.test(data.repeatedFromRequestId),400,'مرجع الطلب المكرر غير صالح / Invalid repeat reference');
      const source=await one('requests',data.repeatedFromRequestId);
      assert(source&&source.owner_id===user.id&&open(source),404,'الطلب الأصلي غير متاح / Original request unavailable');
    }
    if(collection==='quotes'){
      const r=await assertOpenRequest(patch.requestId),selected=r.data.selectedQuoteId?await one('quotes',r.data.selectedQuoteId):null;
      const replacementOpen=!r.data.selectedQuoteId||selected?.data?.supplierOrderStatus==='cannot_fulfill';
      assert(r.data.status==='sent'&&replacementOpen&&r.data.supplierIds?.includes(user.id),409,'طلب العرض غير متاح / RFQ unavailable');
      if(r.data.orderType==='cart'){
        const invite=cartInviteFor(r.data,user.id);
        assert(invite?.interestId,409,'دعوة التسعير البديل غير متاحة / Replacement pricing invitation unavailable');
        const child=await one('interests',invite.interestId);
        assert(child&&child.data?.cartOrderId===r.id&&child.data?.supplierOrderStatus==='cannot_fulfill',409,'المنتج لم يعد يحتاج موردًا بديلًا / Item no longer needs a replacement supplier');
        const requiredCurrency=String(child.data?.currency||'').toUpperCase();
        assert(String(data.currency||'').toUpperCase()===requiredCurrency,409,'عملة العرض البديل يجب أن تطابق عملة المنتج / Replacement quote currency must match the item currency');
        assert(Number(data.moq)<=Number(child.data?.quantity),409,'الحد الأدنى للمورد أعلى من كمية الطلب / Supplier MOQ exceeds the requested quantity');
        data.replacementInterestId=invite.interestId;
      }
      const existingQuery=r.data.orderType==='cart'&&data.replacementInterestId
        ?`request_id=eq.${encodeURIComponent(patch.requestId)}&owner_id=eq.${encodeURIComponent(user.id)}&data->>replacementInterestId=eq.${encodeURIComponent(data.replacementInterestId)}&data->>deletedAt=is.null&limit=1`
        :`request_id=eq.${encodeURIComponent(patch.requestId)}&owner_id=eq.${encodeURIComponent(user.id)}&data->>deletedAt=is.null&limit=1`;
      const existing=await db('quotes',existingQuery);
      assert(!existing.length,409,'سبق أن قدمت عرضًا على هذا الطلب / You already submitted an offer for this request');
    }else if(collection==='interests'){
      const offer=await one('public_offers',patch.offerId);
      assert(open(offer)&&offer.data.status==='published'&&(offer.data.storeOwned||active(await one('profiles',offer.owner_id)))&&(!offer.data.validUntil||offer.data.validUntil>=now.slice(0,10)),409);
      const quantity=Number(patch.quantity),moq=Number(offer.data.moq),unitPrice=Number(offer.data.unitPrice),stock=Number(offer.data.stock);
      assert(Number.isFinite(quantity)&&Number.isInteger(quantity)&&quantity>0&&quantity<=1e9,400,'أدخل كمية صحيحة / Enter a valid quantity');
      assert(Number.isFinite(moq)&&quantity>=moq,400,'الكمية أقل من الحد الأدنى للطلب / Quantity is below the minimum order');
      if(Number.isFinite(stock)&&stock>0)assert(quantity<=stock,400,'الكمية المطلوبة أكبر من المخزون المتاح / Requested quantity exceeds available stock');
      const repeatedFromInterestId=String(patch.repeatedFromInterestId||'').trim();
      if(repeatedFromInterestId){
        assert(/^[A-Za-z0-9-]{1,80}$/.test(repeatedFromInterestId),400,'مرجع الطلب السابق غير صالح / Invalid previous order reference');
        const source=await one('interests',repeatedFromInterestId);
        assert(source&&source.owner_id===user.id&&source.offer_id===patch.offerId&&open(source),409,'الطلب السابق غير متاح للتكرار / Previous order is unavailable to repeat');
        data.repeatedFromInterestId=repeatedFromInterestId;
      }else{
        const existing=await db('interests',`owner_id=eq.${encodeURIComponent(user.id)}&offer_id=eq.${encodeURIComponent(patch.offerId)}&limit=1`);
        assert(!existing.length,409,'سبق أن طلبت هذا العرض؛ استخدم تكرار الطلب / You already requested this offer; use Repeat order');
      }
      data.requiresAssignment=true;data.quantity=quantity;
      data.unitPrice=unitPrice;
      data.currency=String(offer.data.currency||'').toUpperCase();
      data.moq=moq;
      data.total=quantity*unitPrice;
      data.offerSnapshot={unitPrice, currency:data.currency, moq, stock:offer.data.stock||'', sku:offer.data.sku||'', product:offer.data.product||'', translation:offer.data.translation||{}};
      data.proformaInvoice=await issueInterestProforma(user,data,id,now);
    }
    if(collection!=='interests'){
      validateContent(collection,data);await checkImages(data.images||[],user);
      if(collection==='publicOffers')await assertProductTaxonomy(data,{required:true,activeOnly:true});
      if(collection!=='quotes')assert(data.images?.length,400,'أضف صورة / Image required');
    }
  }else if(!isAdmin){
    if(collection==='requests'&&user.role==='client'&&original.owner_id===user.id){
      assert(changes.length===1&&['selectedQuoteId','lastSeenQuoteAt','approveReplacementQuoteId','rejectReplacementQuoteId','approveCartReplacementQuoteId','rejectCartReplacementQuoteId'].includes(changes[0]));
      if(changes[0]==='approveCartReplacementQuoteId'){
        const pending=data.pendingCartReplacement,quoteId=String(patch.approveCartReplacementQuoteId||'');
        assert(data.orderType==='cart'&&pending?.quoteId===quoteId&&pending?.interestId,409,'العرض البديل غير متاح / Replacement quote unavailable');
        const q=await one('quotes',quoteId),child=await one('interests',pending.interestId);
        assert(q&&q.request_id===id&&q.data.status==='published'&&open(q)&&active(await one('profiles',q.owner_id)),409,'العرض البديل غير متاح / Replacement quote unavailable');
        assert(child&&child.owner_id===user.id&&child.data?.cartOrderId===id&&child.data?.supplierOrderStatus==='cannot_fulfill',409,'المنتج لم يعد يحتاج موردًا بديلًا / Item no longer needs a replacement supplier');
        assert(String(q.data.currency||'').toUpperCase()===String(child.data.currency||'').toUpperCase(),409,'عملة العرض البديل يجب أن تطابق عملة المنتج / Replacement quote currency must match the item currency');
        assert(Number(q.data.moq)<=Number(child.data.quantity),409,'الحد الأدنى للمورد أعلى من كمية الطلب / Supplier MOQ exceeds the requested quantity');
        const offer=await one('public_offers',child.offer_id),previousSupplierId=child.data.assignedSupplierId||offer?.owner_id||'';
        applyCartQuoteToParent(data,child.id,q.data);
        const previousProforma=data.proformaInvoice?structuredClone(data.proformaInvoice):null;
        if(previousProforma)data.invoiceHistory=[...(Array.isArray(data.invoiceHistory)?data.invoiceHistory:[]),{type:'proforma_replaced',at:now,invoice:previousProforma}].slice(-50);
        delete data.proformaInvoice;delete data.finalInvoice;data.paymentStatus=null;delete data.paymentReceipt;delete data.paymentReceiptSubmittedAt;delete data.paymentConfirmedAt;
        data.proformaInvoice=await issueCartProforma(user,{...data,proformaInvoice:null},id,now,{fxSnapshot:previousProforma?.fxSnapshot,currencyLabel:previousProforma?.currencyLabel});
        settleCartInvites(data,child.id,q.owner_id,now);delete data.pendingCartReplacement;
        setTracking(data,'supplier_confirmation',now,'');
        data.supplierAssignmentHistory=[...(Array.isArray(data.supplierAssignmentHistory)?data.supplierAssignmentHistory:[]),{approvedCartReplacementQuoteId:q.id,interestId:child.id,approvedAt:now,approvedBy:'customer'}].slice(-100);
        cartReplacementCommit={child,quote:q,previousSupplierId,termsChanged:true};
      }else if(changes[0]==='rejectCartReplacementQuoteId'){
        const pending=data.pendingCartReplacement,quoteId=String(patch.rejectCartReplacementQuoteId||'');
        assert(data.orderType==='cart'&&pending?.quoteId===quoteId&&pending?.interestId,409,'العرض البديل غير متاح / Replacement quote unavailable');
        const q=await one('quotes',quoteId);
        assert(q&&q.request_id===id&&q.data.status==='published',409,'العرض البديل غير متاح / Replacement quote unavailable');
        data.cartReplacementRejectedQuoteIds=[...new Set([...(Array.isArray(data.cartReplacementRejectedQuoteIds)?data.cartReplacementRejectedQuoteIds:[]),q.id])].slice(-100);
        data.cartReplacementInvites=(Array.isArray(data.cartReplacementInvites)?data.cartReplacementInvites:[]).map(x=>x?.interestId===pending.interestId&&x?.supplierId===q.owner_id?{...x,status:'cancelled',cancelReason:'customer_rejected',resolvedAt:now}:x);
        if(Array.isArray(data.supplierIds))data.supplierIds=data.supplierIds.filter(supplierId=>supplierId!==q.owner_id);
        data.supplierAssignmentHistory=[...(Array.isArray(data.supplierAssignmentHistory)?data.supplierAssignmentHistory:[]),{rejectedCartReplacementQuoteId:q.id,interestId:pending.interestId,rejectedAt:now,rejectedBy:'customer'}].slice(-100);
        delete data.pendingCartReplacement;
        setTracking(data,'supplier_confirmation',now,'رفض العميل العرض البديل؛ يلزم اختيار مورد آخر / Customer rejected the replacement quote; choose another supplier');
      }else if(changes[0]==='approveReplacementQuoteId'){
        const q=await one('quotes',String(patch.approveReplacementQuoteId||''));
        assert(data.pendingReplacementQuoteId&&q?.id===data.pendingReplacementQuoteId&&q.request_id===id&&q.data.status==='published'&&open(q)&&active(await one('profiles',q.owner_id)),409,'العرض البديل غير متاح / Replacement quote unavailable');
        const previousProforma=data.proformaInvoice?structuredClone(data.proformaInvoice):null;
        data.selectedQuoteId=q.id;delete data.pendingReplacementQuoteId;
        if(previousProforma)data.invoiceHistory=[...(Array.isArray(data.invoiceHistory)?data.invoiceHistory:[]),{type:'proforma_replaced',at:now,invoice:previousProforma}].slice(-50);
        delete data.proformaInvoice;delete data.finalInvoice;data.paymentStatus=null;delete data.paymentReceipt;delete data.paymentReceiptSubmittedAt;delete data.paymentConfirmedAt;
        data.proformaInvoice=await issueQuoteProforma(user,{...original,data:{...data,proformaInvoice:null}},q,now,{fxSnapshot:previousProforma?.fxSnapshot,currencyLabel:previousProforma?.currencyLabel});
        setTracking(data,'supplier_confirmation',now,'');
        data.supplierAssignmentHistory=[...(Array.isArray(data.supplierAssignmentHistory)?data.supplierAssignmentHistory:[]),{approvedReplacementQuoteId:q.id,approvedAt:now,approvedBy:'customer'}].slice(-100);
      }else if(changes[0]==='rejectReplacementQuoteId'){
        const quoteId=String(patch.rejectReplacementQuoteId||''),q=await one('quotes',quoteId);
        assert(data.pendingReplacementQuoteId===quoteId&&q?.request_id===id&&q.data.status==='published',409,'العرض البديل غير متاح / Replacement quote unavailable');
        data.replacementRejectedQuoteIds=[...new Set([...(Array.isArray(data.replacementRejectedQuoteIds)?data.replacementRejectedQuoteIds:[]),q.id])].slice(-100);
        if(Array.isArray(data.supplierIds))data.supplierIds=data.supplierIds.filter(supplierId=>supplierId!==q.owner_id);
        data.supplierAssignmentHistory=[...(Array.isArray(data.supplierAssignmentHistory)?data.supplierAssignmentHistory:[]),{rejectedReplacementQuoteId:q.id,rejectedAt:now,rejectedBy:'customer'}].slice(-100);
        delete data.pendingReplacementQuoteId;
        setTracking(data,'supplier_confirmation',now,'رفض العميل العرض البديل؛ يلزم اختيار مورد آخر / Customer rejected the replacement quote; choose another supplier');
      }else if(changes[0]==='selectedQuoteId'){
        const r=await assertOpenRequest(id),q=await one('quotes',patch.selectedQuoteId);
        assert(!r.data.selectedQuoteId&&r.data.status==='sent'&&open(q)&&q.request_id===id&&q.data.status==='published'&&active(await one('profiles',q.owner_id)),409,'العرض غير متاح أو سبق اختيار عرض / Quote unavailable or already selected');
        data.selectedQuoteId=q.id;setTracking(data,'supplier_confirmation',now,'');
        if(!data.proformaInvoice)data.proformaInvoice=await issueQuoteProforma(user,r,q,now);
      }else{
        const published=await db('quotes',`request_id=eq.${encodeURIComponent(id)}&data->>status=eq.published&data->>deletedAt=is.null`);
        const latest=published.map(q=>q.data.publishedAt||q.data.updatedAt||q.data.reviewedAt||q.created_at).filter(Boolean).sort().at(-1);
        assert(latest,409,'لا توجد عروض منشورة / No published quotes');
        data.lastSeenQuoteAt=latest;
      }
    }else if(collection==='quotes'&&user.role==='supplier'&&(original.data.assignedSupplierId||original.owner_id)===user.id){
      const orderFields=['supplierOrderStatus','supplierOrderNote'],isOrderUpdate=changes.length&&changes.every(k=>orderFields.includes(k));
      const r=await assertOpenRequest(original.request_id);
      if(isOrderUpdate){
        assert(r.data.selectedQuoteId===original.id,409,'هذا العرض ليس الطلب المختار / This quote is not the selected order');
        if(patch.supplierOrderStatus==='production')assert(r.data.paymentStatus==='confirmed',409,'لا يمكن بدء الإنتاج قبل تأكيد الدفع / Production cannot start before payment is confirmed');
        updateSupplierOrder(data,patch,now);
        linkedSupplierRequest=r;
      }else{
        assert(original.owner_id===user.id,403,'يمكن للمورد المسند إليه تحديث التنفيذ فقط');
        assert(changes.length&&changes.every(k=>contentFields.quotes.includes(k)),400,'يمكن تعديل بيانات العرض فقط / Only offer fields can be edited');
        const selected=r.data.selectedQuoteId?await one('quotes',r.data.selectedQuoteId):null;
        const replacementOpen=!r.data.selectedQuoteId||(selected?.data?.supplierOrderStatus==='cannot_fulfill'&&r.data.selectedQuoteId!==original.id);
        assert(r.data.status==='sent'&&replacementOpen&&r.data.supplierIds?.includes(user.id),409,'لا يمكن تعديل العرض بعد إغلاق الطلب أو اختيار عرض / Offer cannot be edited after request closure or selection');
        if(r.data.orderType==='cart'){
          const invite=cartInviteFor(r.data,user.id);
          assert(invite?.interestId&&original.data?.replacementInterestId===invite.interestId,409,'هذا العرض يخص دعوة تسعير سابقة / This quote belongs to an earlier pricing invitation');
        }
        assert(['pending','published'].includes(data.status),409,'العرض غير قابل للتعديل / Offer is not editable');
        for(const key of changes)data[key]=patch[key];
        validateContent('quotes',data);
        await checkImages(data.images||[],user,original.data.images||[]);
        data.status='pending';
        data.translation={};
        data.reviewedAt=null;
      }
    }else if(collection==='publicOffers'&&user.role==='supplier'&&original.owner_id===user.id){
      assert(changes.length&&changes.every(k=>contentFields.publicOffers.includes(k)),400,'يمكن تعديل بيانات العرض فقط / Only offer fields can be edited');
      assert(['pending','published'].includes(data.status),409,'العرض غير قابل للتعديل / Offer is not editable');
      for(const key of changes)data[key]=patch[key];
      validateContent('publicOffers',data);
      await checkImages(data.images||[],user,original.data.images||[]);
      await assertProductTaxonomy(data,{required:true,activeOnly:true});
      data.status='pending';
      data.translation={};
      data.reviewedAt=null;
    }else if(collection==='interests'&&user.role==='supplier'){
      const offer=await one('public_offers',original.offer_id);
      assert(offer&&open(offer)&&(original.data.assignedSupplierId?original.data.assignedSupplierId===user.id:!original.data.requiresAssignment&&!offer.data.storeOwned&&offer.owner_id===user.id),403,'غير مصرح بهذا الطلب / Unauthorized order');
      if(original.data.cartOrderId)linkedCartRequest=await one('requests',original.data.cartOrderId);
      assert((original.data.assignedSupplierId===user.id||(original.data.trackingStatus||'received')!=='received')&&!['completed','cancelled'].includes(original.data.trackingStatus),409,'الطلب غير جاهز للتنفيذ / Order is not ready for supplier action');
      assert(changes.length&&changes.every(k=>['supplierOrderStatus','supplierOrderNote'].includes(k)),400,'يمكن تحديث حالة التنفيذ فقط / Only fulfillment status can be updated');
      if(patch.supplierOrderStatus==='production')assert(original.data.paymentStatus==='confirmed',409,'لا يمكن بدء الإنتاج قبل تأكيد الدفع / Production cannot start before payment is confirmed');
      updateSupplierOrder(data,patch,now);
      if(patch.supplierOrderStatus==='cannot_fulfill')setTracking(data,'supplier_confirmation',now,data.supplierOrderNote||'');
      else if(patch.supplierOrderStatus==='production')advanceTracking(data,'production',now);
      else if(patch.supplierOrderStatus==='ready_for_inspection')advanceTracking(data,'quality_check',now);
    }else assert(false,403,'غير مصرح بهذا التعديل / Unauthorized change');
  }else{
    assert(open(original),409);
    const editPermission=collection==='requests'?'requests.edit':'offers.edit';
    for(const key of changes){
      if(key==='translation'){
        assert(can(user,'translate'));
        assert(patch.translation&&['titleAr','titleEn','descriptionAr','descriptionEn'].every(k=>typeof patch.translation[k]==='string'&&patch.translation[k].trim()&&patch.translation[k].length<=10000&&!contact(patch.translation[k])),400,'أكمل الترجمة اليدوية دون بيانات تواصل / Complete manual translations');
        data.translation=Object.fromEntries(['titleAr','titleEn','descriptionAr','descriptionEn'].map(k=>[k,patch.translation[k].trim()]));
      }else if(key==='status'||key==='supplierIds'){
        assert(can(user,'publish'));
        if(key==='status'){
          if(collection==='interests'){
            assert(['pending','coordinating','accepted','completed','cancelled','active'].includes(patch[key]),400);
            const mapped=patch[key]==='completed'?'completed':patch[key]==='cancelled'?'cancelled':['coordinating','accepted'].includes(patch[key])?'payment_confirmation':'received';
            setTracking(data,mapped,now,data.trackingNote||'');
            data.status=mapped==='completed'?'completed':mapped==='cancelled'?'cancelled':'active';
          }else{
            assert((collection==='requests'?['review','sent','completed']:['pending','published']).includes(patch[key]),400);
            data[key]=patch[key];
            if(collection==='quotes'&&patch[key]==='published')data.publishedAt=now;
          }
        }else {assert(collection==='requests'&&Array.isArray(patch[key])&&patch[key].length>0&&patch[key].length<=100,400);for(const supplierId of patch[key]){assert(/^[a-f0-9-]{36}$/.test(supplierId),400);const p=await one('profiles',supplierId);assert(active(p)&&p.role==='supplier',400);}data[key]=patch[key];}
      }else if(collection==='interests'&&key==='assignedSupplierId'){
        assert(can(user,'publish')||can(user,'offers.edit'),403,'غير مصرح / Unauthorized');
        assert(data.supplierOrderStatus==='cannot_fulfill',409,'يمكن تغيير المورد فقط بعد تعذر التنفيذ / Supplier can only be changed after unable to fulfill');
        const supplierId=String(patch[key]||'');assert(/^[a-f0-9-]{36}$/.test(supplierId),400,'مورد غير صالح / Invalid supplier');
        const supplier=await one('profiles',supplierId);assert(active(supplier)&&supplier.role==='supplier',400,'المورد غير متاح / Supplier unavailable');
        const offer=await one('public_offers',original.offer_id),previousSupplierId=data.assignedSupplierId||offer?.owner_id||'';
        assert(supplierId!==previousSupplierId,400,'اختر موردًا آخر / Choose another supplier');
        data.supplierAssignmentHistory=[...(Array.isArray(data.supplierAssignmentHistory)?data.supplierAssignmentHistory:[]),{rejectedSupplierId:previousSupplierId,rejectionReason:data.supplierOrderNote||'',rejectedAt:data.supplierOrderUpdatedAt||now,newSupplierId:supplierId,reassignedAt:now}].slice(-100);
        data.assignedSupplierId=supplierId;data.supplierOrderStatus='pending_confirmation';data.supplierOrderNote='';data.supplierOrderUpdatedAt=now;
        setTracking(data,'supplier_confirmation',now,'');
        if(data.cartOrderId)linkedCartRequest=await one('requests',data.cartOrderId);
      }else if(collection==='requests'&&key==='cartReplacementInvite'){
        assert(can(user,'publish')||can(user,'requests.edit'),403,'غير مصرح / Unauthorized');
        assert(data.orderType==='cart'&&patch[key]&&typeof patch[key]==='object',400,'بيانات الدعوة غير صالحة / Invalid invitation');
        const interestId=String(patch[key].interestId||''),supplierId=String(patch[key].supplierId||'');
        const child=await one('interests',interestId),supplier=await one('profiles',supplierId);
        assert(child&&child.data?.cartOrderId===id&&child.data?.supplierOrderStatus==='cannot_fulfill',409,'المنتج لم يعد يحتاج موردًا بديلًا / Item no longer needs a replacement supplier');
        assert(active(supplier)&&supplier.role==='supplier',400,'المورد غير متاح / Supplier unavailable');
        const offer=await one('public_offers',child.offer_id),previousSupplierId=child.data.assignedSupplierId||offer?.owner_id||'';
        assert(supplierId!==previousSupplierId,400,'اختر موردًا آخر / Choose another supplier');
        const invites=Array.isArray(data.cartReplacementInvites)?data.cartReplacementInvites:[];
        assert(!invites.some(x=>x?.interestId===interestId&&x?.supplierId===supplierId&&!['cancelled','selected'].includes(x.status)),409,'تمت دعوة هذا المورد بالفعل / Supplier already invited');
        assert(!invites.some(x=>x?.interestId!==interestId&&x?.supplierId===supplierId&&!['cancelled','selected'].includes(x.status)),409,'لدى هذا المورد طلب تسعير بديل آخر في نفس الطلب؛ أكمل الأول ثم أعد الدعوة / This supplier already has another replacement pricing invitation in this order');
        data.cartReplacementInvites=[...invites,{interestId,supplierId,status:'invited',invitedAt:now}].slice(-100);
        data.supplierIds=[...new Set([...(Array.isArray(data.supplierIds)?data.supplierIds:[]),supplierId])];
        data.status='sent';setTracking(data,'supplier_confirmation',now,'');
      }else if(collection==='requests'&&key==='cartReplacementQuoteId'){
        assert(can(user,'publish')||can(user,'requests.edit'),403,'غير مصرح / Unauthorized');
        assert(data.orderType==='cart'&&patch[key]&&typeof patch[key]==='object',400,'بيانات العرض البديل غير صالحة / Invalid replacement quote');
        const quoteId=String(patch[key].quoteId||''),interestId=String(patch[key].interestId||'');
        const q=await one('quotes',quoteId),child=await one('interests',interestId);
        assert(child&&child.data?.cartOrderId===id&&child.data?.supplierOrderStatus==='cannot_fulfill',409,'المنتج لم يعد يحتاج موردًا بديلًا / Item no longer needs a replacement supplier');
        assert(q&&q.request_id===id&&q.data.status==='published'&&open(q)&&active(await one('profiles',q.owner_id))&&!(Array.isArray(data.cartReplacementRejectedQuoteIds)&&data.cartReplacementRejectedQuoteIds.includes(q.id)),400,'العرض البديل غير متاح / Replacement quote unavailable');
        if(q.data.replacementInterestId)assert(q.data.replacementInterestId===interestId,409,'هذا العرض يخص منتجًا آخر / Quote belongs to another item');
        else{
          const declined=await db('interests',`data->>cartOrderId=eq.${encodeURIComponent(id)}&data->>supplierOrderStatus=eq.cannot_fulfill&data->>deletedAt=is.null`);
          assert(declined.length===1&&declined[0].id===interestId,409,'تعذر تحديد المنتج الخاص بالعرض القديم / Could not match legacy quote to item');
        }
        assert(String(q.data.currency||'').toUpperCase()===String(child.data.currency||'').toUpperCase(),409,'عملة العرض البديل يجب أن تطابق عملة المنتج / Replacement quote currency must match the item currency');
        assert(Number(q.data.moq)<=Number(child.data.quantity),409,'الحد الأدنى للمورد أعلى من كمية الطلب / Supplier MOQ exceeds the requested quantity');
        const offer=await one('public_offers',child.offer_id),previousSupplierId=child.data.assignedSupplierId||offer?.owner_id||'';
        assert(q.owner_id!==previousSupplierId,400,'اختر عرض مورد آخر / Choose a different supplier quote');
        const same=cartTermsMatch(child.data,q.data);
        data.supplierAssignmentHistory=[...(Array.isArray(data.supplierAssignmentHistory)?data.supplierAssignmentHistory:[]),{
          rejectedSupplierId:previousSupplierId,rejectionReason:child.data.supplierOrderNote||'',rejectedAt:child.data.supplierOrderUpdatedAt||now,
          newSupplierId:q.owner_id,newQuoteId:q.id,interestId,reassignedAt:now,termsChanged:!same
        }].slice(-100);
        if(same){
          applyCartQuoteToParent(data,interestId,q.data);settleCartInvites(data,interestId,q.owner_id,now);delete data.pendingCartReplacement;
          setTracking(data,'supplier_confirmation',now,'');cartReplacementCommit={child,quote:q,previousSupplierId,termsChanged:false};
        }else{
          const quantity=Number(child.data.quantity),oldUnitPrice=Number(child.data.unitPrice),newUnitPrice=Number(q.data.unitPrice);
          data.pendingCartReplacement={interestId,quoteId:q.id,supplierId:q.owner_id,oldUnitPrice,newUnitPrice,currency:String(q.data.currency||'').toUpperCase(),quantity,oldTotal:quantity*oldUnitPrice,newTotal:quantity*newUnitPrice,difference:quantity*(newUnitPrice-oldUnitPrice),moq:q.data.moq,leadTime:q.data.leadTime,createdAt:now};
          data.cartReplacementInvites=(Array.isArray(data.cartReplacementInvites)?data.cartReplacementInvites:[]).map(x=>x?.interestId===interestId&&x?.supplierId===q.owner_id?{...x,status:'customer_approval',quoteId:q.id,updatedAt:now}:x);
          setTracking(data,'customer_action',now,'تغير سعر أو شروط المورد البديل وتحتاج موافقة العميل / Replacement supplier price or terms changed and require customer approval');
        }
      }else if(collection==='requests'&&key==='replacementQuoteId'){
        assert(can(user,'publish')||can(user,'requests.edit'),403,'غير مصرح / Unauthorized');
        const oldQuote=data.selectedQuoteId?await one('quotes',data.selectedQuoteId):null;
        assert(oldQuote?.data?.supplierOrderStatus==='cannot_fulfill',409,'المورد المختار لم يرفض التنفيذ / Selected supplier has not declined');
        const q=await one('quotes',String(patch[key]||''));assert(q&&q.request_id===id&&q.id!==data.selectedQuoteId&&q.data.status==='published'&&open(q)&&active(await one('profiles',q.owner_id))&&!(Array.isArray(data.replacementRejectedQuoteIds)&&data.replacementRejectedQuoteIds.includes(q.id)),400,'العرض البديل غير متاح / Replacement quote unavailable');
        const fields=['unitPrice','currency','moq','leadTime','sampleCost'],same=fields.every(f=>String(q.data?.[f]??'')===String(oldQuote.data?.[f]??''));
        data.supplierAssignmentHistory=[...(Array.isArray(data.supplierAssignmentHistory)?data.supplierAssignmentHistory:[]),{rejectedSupplierId:oldQuote.owner_id,rejectedQuoteId:oldQuote.id,rejectionReason:oldQuote.data.supplierOrderNote||'',rejectedAt:oldQuote.data.supplierOrderUpdatedAt||now,newSupplierId:q.owner_id,newQuoteId:q.id,reassignedAt:now,termsChanged:!same}].slice(-100);
        if(same){data.selectedQuoteId=q.id;setTracking(data,'supplier_confirmation',now,'');}
        else{data.pendingReplacementQuoteId=q.id;setTracking(data,'customer_action',now,'تغيرت شروط العرض البديل وتحتاج موافقة العميل / Replacement quote terms changed and require customer approval');}
      }else if(key==='reviewedAt'){
        assert(can(user,editPermission)||can(user,'translate')||can(user,'publish'));data.reviewedAt=now;
      }else if((collection==='requests'||collection==='interests')&&key==='trackingStatus'){
        const allowed=collection==='requests'?TRACKING_STATUSES:READY_TRACKING_STATUSES;
        assert(collection==='requests'?(can(user,'requests.edit')||can(user,'publish')):(can(user,'offers.edit')||can(user,'publish')));
        assert(allowed.includes(patch[key]),400,'حالة متابعة غير صالحة / Invalid tracking status');
        const flow=collection==='interests'||data.orderType==='cart'?READY_TRACKING_FLOW:TRACKING_FLOW;
        assert(allowedAdminTrackingTransition(original.data,patch[key],flow),409,'انتقال حالة الطلب غير متاح / Order status transition unavailable');
        if(collection==='requests'&&data.orderType!=='cart'&&['quote_selected','supplier_confirmation'].includes(patch[key]))assert(data.selectedQuoteId,409,'يجب أن يختار العميل عرضًا أولًا / Customer must select a quote first');
        if(collection==='requests'&&data.orderType!=='cart'&&patch[key]==='sourcing')assert(data.status==='sent',409,'اعتمد الطلب وأرسله للموردين أولًا / Approve and send the request to suppliers first');
        if(patch[key]==='production')assert(data.paymentStatus==='confirmed',409,'لا يمكن بدء الإنتاج قبل تأكيد الدفع / Production cannot start before payment is confirmed');
        data.trackingStatus=patch[key];
      }else if((collection==='requests'||collection==='interests')&&key==='trackingNote'){
        assert(collection==='requests'?(can(user,'requests.edit')||can(user,'publish')):(can(user,'offers.edit')||can(user,'publish')));
        assert(typeof patch[key]==='string'&&patch[key].length<=1000,400,'ملاحظة المتابعة طويلة / Tracking note too long');data.trackingNote=patch[key];
      }else if((collection==='requests'||collection==='interests')&&key==='paymentBankAccountId'){
        assert(collection==='requests'?(can(user,'requests.edit')||can(user,'publish')):(can(user,'offers.edit')||can(user,'publish')));
        assert(typeof patch[key]==='string'&&patch[key].length<=80,400,'اختر الحساب البنكي / Choose a bank account');
        data.paymentBankAccountId=patch[key];data.paymentBankAccount=await paymentAccountSnapshot(patch[key]);
      }else if((collection==='requests'||collection==='interests')&&key==='paymentAmount'){
        assert(collection==='requests'?(can(user,'requests.edit')||can(user,'publish')):(can(user,'offers.edit')||can(user,'publish')));
        const amount=Number(patch[key]);assert(Number.isFinite(amount)&&amount>0&&amount<=1e12,400,'أدخل مبلغ الدفع / Enter payment amount');data.paymentAmount=amount;
      }else if((collection==='requests'||collection==='interests')&&key==='paymentCurrency'){
        assert(collection==='requests'?(can(user,'requests.edit')||can(user,'publish')):(can(user,'offers.edit')||can(user,'publish')));
        const currency=String(patch[key]||'').toUpperCase();assert(PAYMENT_CURRENCIES.includes(currency),400,'عملة الدفع غير مدعومة / Unsupported payment currency');data.paymentCurrency=currency;
      }else if((collection==='requests'||collection==='interests')&&key==='paymentMessage'){
        assert(collection==='requests'?(can(user,'requests.edit')||can(user,'publish')):(can(user,'offers.edit')||can(user,'publish')));
        assert(typeof patch[key]==='string'&&patch[key].trim()&&patch[key].trim().length<=2000,400,'اكتب رسالة الدفع للعميل / Add a payment message');
        data.paymentMessage=patch[key].trim();
      }else if((contentFields[collection]||[]).includes(key)){
        assert(can(user,editPermission));data[key]=patch[key];
      }else assert(false,400,'حقل غير قابل للتعديل / Field not editable');
    }
    if((collection==='requests'||collection==='interests')&&(changes.includes('trackingStatus')||changes.includes('trackingNote'))){
      setTracking(data,data.trackingStatus||'received',now,changes.includes('trackingNote')?patch.trackingNote:(data.trackingNote||''));
      if(collection==='interests')data.status=data.trackingStatus==='completed'?'completed':data.trackingStatus==='cancelled'?'cancelled':'active';
      if(collection==='requests'&&changes.includes('trackingStatus')&&patch.trackingStatus==='completed')data.status='completed';
    }
    if((collection==='requests'||collection==='interests')&&changes.includes('trackingStatus')&&patch.trackingStatus==='payment_confirmation'){
      const enteringPayment=original.data.trackingStatus!=='payment_confirmation';
      assert(data.paymentMessage?.trim(),400,'اكتب رسالة الدفع للعميل / Add a payment message');
      assert(data.paymentBankAccount?.id&&data.paymentAmount&&data.paymentCurrency,400,'أكمل الحساب البنكي والمبلغ والعملة / Complete bank account, amount, and currency');
      assert(String(data.paymentBankAccount.currency||'').toUpperCase()===String(data.paymentCurrency||'').toUpperCase(),400,'عملة الحساب البنكي يجب أن تطابق عملة الدفع / Bank account currency must match payment currency');
      if(collection==='requests'){
        if(data.orderType==='cart'){
          const children=await db('interests',`data->>cartOrderId=eq.${encodeURIComponent(id)}&data->>deletedAt=is.null`);
          assert(children.length===Number(data.cartItemCount||0)&&children.length>0,409,'تعذر التحقق من منتجات الطلب / Could not verify cart items');
          if(enteringPayment)assert(children.every(child=>['confirmed','production','ready_for_inspection'].includes(child.data?.supplierOrderStatus)),409,'يجب أن يؤكد جميع الموردين التنفيذ قبل الانتقال للدفع / All suppliers must confirm fulfillment before payment');
          assert(String(data.currency||'').toUpperCase()===String(data.paymentCurrency||'').toUpperCase(),400,'عملة الدفع يجب أن تطابق عملة الطلب / Payment currency must match order currency');
        }else{
          assert(data.selectedQuoteId,409,'يجب أن يختار العميل عرضًا قبل الدفع / Customer must select a quote before payment');
          const selectedQuote=await one('quotes',data.selectedQuoteId);
          assert(selectedQuote&&selectedQuote.request_id===id&&open(selectedQuote)&&selectedQuote.data.status==='published',409,'العرض المختار غير متاح / Selected quote unavailable');
          if(enteringPayment)assert(['confirmed','production','ready_for_inspection'].includes(selectedQuote.data.supplierOrderStatus),409,'يجب أن يؤكد المورد تنفيذ الطلب قبل الانتقال للدفع / Supplier must confirm fulfillment before payment');
          const quoteCurrency=String(selectedQuote.data.currency||'').toUpperCase();
          assert(quoteCurrency&&data.paymentCurrency===quoteCurrency,400,'عملة الدفع يجب أن تطابق عملة العرض المختار / Payment currency must match selected quote currency');
        }
      }else if(collection==='interests'){
        if(enteringPayment)assert(['confirmed','production','ready_for_inspection'].includes(data.supplierOrderStatus),409,'يجب أن يؤكد المورد تنفيذ الطلب قبل الانتقال للدفع / Supplier must confirm fulfillment before payment');
        if(data.currency)assert(data.paymentCurrency===String(data.currency).toUpperCase(),400,'عملة الدفع يجب أن تطابق عملة العرض العام / Payment currency must match public-offer currency');
      }
      if(enteringPayment&&data.paymentStatus!=='confirmed'){
        data.paymentStatus='awaiting_receipt';
        data.paymentRequestedAt=now;
        data.paymentUpdatedAt=now;
        data.paymentReviewNote='';
        data.paymentHistory=[...(Array.isArray(data.paymentHistory)?data.paymentHistory:[]),{at:now,status:'awaiting_receipt'}].slice(-100);
      }
    }
    if(collection==='requests'&&data.orderType==='cart'&&changes.includes('trackingStatus')&&patch.trackingStatus==='supplier_confirmation')data.status='sent';
    if(collection==='requests'&&data.status==='sent'&&original.data.status!=='sent'&&data.orderType!=='cart')advanceTracking(data,'sourcing',now);
    if(collection==='requests'&&data.status==='completed'&&original.data.status!=='completed')setTracking(data,'completed',now,'');
    if(collection==='publicOffers'&&changes.some(k=>['categoryId','subcategoryId','country','status'].includes(k)))await assertProductTaxonomy(data,{required:data.status==='published',activeOnly:data.status==='published'});
    if(collection!=='interests'){
      await checkImages(data.images||[],user,original.data.images||[]);
      assert(collection==='publicOffers'&&data.storeOwned||active(await one('profiles',ownerId)),409);
      if(collection==='quotes')await assertOpenRequest(original.request_id);
      if(requiresRedaction(collection,data.status,changes)){
        assert(body.redactionConfirmed===true,400,'أكد مراجعة النصوص والصور وإزالة الهوية / Confirm redaction');
        assert(data.translation&&['titleAr','titleEn','descriptionAr','descriptionEn'].every(k=>data.translation[k]?.trim()),400);
        if(collection==='requests')assert(data.supplierIds?.length,400);
      }
    }
  }
  data.updatedAt=now;
  data.history=[...(original?.data.history||[]),{at:now,status:data.selectedQuoteId&&!original?.data.selectedQuoteId?'selected':data.status}].slice(-200);
  const commitBatch=[{table,id,version:Number(version),ownerId,requestId:original?.request_id||patch.requestId,offerId:original?.offer_id||patch.offerId,data,action:original?'update':'create'}];
  if(cartReplacementCommit){
    const {child,quote,previousSupplierId,termsChanged}=cartReplacementCommit;
    const childData=cartReplacementChildData(child,quote,previousSupplierId,now,termsChanged);
    commitBatch.push({table:'interests',id:child.id,version:child.version,ownerId:child.owner_id,offerId:child.offer_id,data:childData,action:'cart_supplier_reassigned'});
  }
  if(collection==='requests'&&isAdmin&&data.orderType==='cart'&&changes.includes('trackingStatus')&&patch.trackingStatus==='supplier_confirmation'){
    const children=await db('interests',`data->>cartOrderId=eq.${encodeURIComponent(id)}&data->>deletedAt=is.null`);
    assert(children.length===Number(data.cartItemCount||0)&&children.length>0,409,'تعذر العثور على جميع منتجات الطلب / Could not find all cart items');
    for(const child of children){
      const childData=structuredClone(child.data||{});
      if((childData.trackingStatus||'received')==='received'){
        setTracking(childData,'supplier_confirmation',now,'');
        childData.status='active';childData.updatedAt=now;
        commitBatch.push({table:'interests',id:child.id,version:child.version,ownerId:child.owner_id,offerId:child.offer_id,data:childData,action:'cart_send_supplier'});
      }
    }
  }
  if(collection==='quotes'&&!isAdmin&&linkedSupplierRequest){
    const requestData=structuredClone(linkedSupplierRequest.data);
    let changed=false;
    if(data.supplierOrderStatus==='cannot_fulfill'){setTracking(requestData,'supplier_confirmation',now,data.supplierOrderNote||'');changed=true;}
    else if(data.supplierOrderStatus==='production')changed=advanceTracking(requestData,'production',now);
    else if(data.supplierOrderStatus==='ready_for_inspection')changed=advanceTracking(requestData,'quality_check',now);
    if(changed){
      requestData.updatedAt=now;
      commitBatch.push({table:'requests',id:linkedSupplierRequest.id,version:linkedSupplierRequest.version,ownerId:linkedSupplierRequest.owner_id,data:requestData,action:'tracking'});
    }
  }
  if(collection==='interests'&&isAdmin&&changes.includes('assignedSupplierId')&&linkedCartRequest&&open(linkedCartRequest)){
    const requestData=structuredClone(linkedCartRequest.data||{});
    setTracking(requestData,'supplier_confirmation',now,'');
    requestData.updatedAt=now;
    commitBatch.push({table:'requests',id:linkedCartRequest.id,version:linkedCartRequest.version,ownerId:linkedCartRequest.owner_id,data:requestData,action:'cart_supplier_reassigned'});
  }
  if(collection==='interests'&&!isAdmin&&linkedCartRequest&&linkedCartRequest.data.orderFlowVersion!==2&&open(linkedCartRequest)){
    const requestData=structuredClone(linkedCartRequest.data||{}),siblings=await db('interests',`data->>cartOrderId=eq.${encodeURIComponent(linkedCartRequest.id)}&data->>deletedAt=is.null`);
    const statuses=siblings.map(row=>row.id===id?(data.supplierOrderStatus||'pending_confirmation'):(row.data?.supplierOrderStatus||'pending_confirmation'));
    let changed=false;
    if(data.supplierOrderStatus==='cannot_fulfill'){
      setTracking(requestData,'supplier_confirmation',now,'Supplier unable to fulfill one cart item; replacement required');changed=true;
    }else if(statuses.length&&statuses.every(s=>s==='ready_for_inspection')){
      changed=advanceTracking(requestData,'quality_check',now);
    }else if(statuses.some(s=>s==='production'||s==='ready_for_inspection')){
      changed=advanceTracking(requestData,'production',now);
    }
    if(changed){
      requestData.updatedAt=now;
      commitBatch.push({table:'requests',id:linkedCartRequest.id,version:linkedCartRequest.version,ownerId:linkedCartRequest.owner_id,data:requestData,action:'cart_tracking'});
    }
  }
  if(collection==='quotes'&&isAdmin&&data.status==='published'&&original?.data.status!=='published'&&original?.request_id){
    const requestRow=await one('requests',original.request_id);
    if(requestRow&&open(requestRow)){
      const requestData=structuredClone(requestRow.data);
      if(advanceTracking(requestData,'quotes_available',now)){
        requestData.updatedAt=now;
        commitBatch.push({table:'requests',id:requestRow.id,version:requestRow.version,ownerId:requestRow.owner_id,data:requestData,action:'tracking'});
      }
    }
  }
  await rpc('commit_changes',{actor:user.id,changes:commitBatch});
  return {ok:true};
}
export async function saveSettings(user,body){
  assert(can(user,'settings'));const row=await one('settings','site');assert(row.version===body.version,409);
  const data=structuredClone(row.data||{}),prefixes=['homeTitle','homeSubtitle','customerTitle','customerSubtitle','supplierTitle','supplierSubtitle','adminTitle','adminSubtitle'];
  for(const [k,v] of Object.entries(body.data||{})){
    if(k==='categories'){data.categories=normalizeCategories(v);continue;}
    if(k==='subcategories'){data.subcategories=normalizeSubcategories(v,data.categories||[]);continue;}
    if(k==='supplyCountries'){
      const next=normalizeSupplyCountries(v),nextIds=new Set(next.map(x=>x.id)),current=Array.isArray(data.supplyCountries)&&data.supplyCountries.length?data.supplyCountries:DEFAULT_SUPPLY_COUNTRIES;
      for(const removed of current.filter(x=>!nextIds.has(x.id))){
        const used=await db('public_offers',`data->>country=eq.${encodeURIComponent(removed.id)}&data->>deletedAt=is.null&limit=1`);
        assert(!used.length,409,'لا يمكن حذف دولة توريد مرتبطة بمنتجات. غيّر المنتجات أولًا / Cannot delete a supply country used by products. Reassign products first');
      }
      data.supplyCountries=next;continue;
    }
    if(k==='bankAccounts'){data.bankAccounts=normalizeBankAccounts(v);continue;}
    if(k==='currencies'){data.currencies=normalizeCurrencies(v);continue;}
    assert(['logo','logoText',...prefixes.flatMap(k=>[k+'Ar',k+'En'])].includes(k)&&typeof v==='string'&&v.length<=10000,400);
    if(k==='logo'&&v)await checkImages([v],user,row.data.logo?[row.data.logo]:[]);
    data[k]=v;
  }
  await rpc('commit_changes',{actor:user.id,changes:[{table:'settings',id:'site',version:row.version,data,action:'settings'}]});return {ok:true};
}
export async function bulkUpdatePublicOffers(user,body={}){
  assert(user?.role==='admin',403,'غير مسموح / Not allowed');
  const items=Array.isArray(body.items)?body.items:[];
  assert(items.length>0&&items.length<=200,400,'اختر من 1 إلى 200 منتج / Select 1 to 200 products');
  const now=new Date().toISOString(),commit=[];
  for(const item of items){
    const id=String(item?.id||''),patch=item?.patch||{},row=await one('public_offers',id);
    assert(row&&open(row),404,'منتج غير متاح / Product unavailable');
    assert(Number(item.version)===row.version,409,'تغيّرت بيانات أحد المنتجات؛ حدّث الصفحة / A product changed; refresh and try again');
    const data=structuredClone(row.data||{}),keys=Object.keys(patch);
    const editable=new Set(['product','specs','unitPrice','moq','stock','categoryId','subcategoryId','country']);
    assert(item.delete||keys.length,400,'لا توجد تغييرات / No changes');
    if(item.delete){
      assert(can(user,'trash'),403);
      data.deletedAt=now;
      data.moderationHistory=[...(data.moderationHistory||[]),{action:'delete',reason:'Bulk product delete',at:now,actorId:user.id}].slice(-200);
    }else{
      for(const key of keys){
        if(editable.has(key)){assert(can(user,'offers.edit'),403);data[key]=patch[key];}
        else if(key==='translation'){
          assert(can(user,'translate'),403);
          assert(patch.translation&&typeof patch.translation==='object'&&!Array.isArray(patch.translation),400,'ترجمة غير صالحة / Invalid translation');
          const allowedTranslation=['titleAr','titleEn','descriptionAr','descriptionEn'],nextTranslation={...(data.translation||{})};
          for(const field of Object.keys(patch.translation)){
            assert(allowedTranslation.includes(field)&&typeof patch.translation[field]==='string'&&patch.translation[field].length<=10000&&!contact(patch.translation[field]),400,'تحقق من النصوص المترجمة / Check translated text');
            nextTranslation[field]=patch.translation[field].trim();
          }
          data.translation=nextTranslation;data.reviewedAt=now;
        }else if(key==='status'){
          assert(can(user,'publish'),403);assert(['pending','published'].includes(patch.status),400,'حالة غير صالحة / Invalid status');
          if(patch.status==='published'&&data.status!=='published')data.publishedAt=now;
          data.status=patch.status;
        }else assert(false,400,'حقل غير قابل للتعديل الجماعي / Field cannot be bulk edited');
      }
      validateContent('publicOffers',data);
      await assertProductTaxonomy(data,{required:data.status==='published',activeOnly:data.status==='published'});
      if(data.status==='published'){
        assert(['titleAr','titleEn','descriptionAr','descriptionEn'].every(k=>data.translation?.[k]?.trim()),400,'أكمل الاسم والوصف بالعربية والإنجليزية قبل النشر / Complete Arabic and English name and description before publishing');
        if(keys.some(k=>k==='translation'||k==='status'||editable.has(k)))assert(body.redactionConfirmed===true,400,'أكد مراجعة النصوص والصور قبل الحفظ / Confirm content review before saving');
      }
    }
    data.updatedAt=now;
    data.history=[...(data.history||[]),{at:now,status:data.status,action:item.delete?'bulk_delete':'bulk_update'}].slice(-200);
    commit.push({table:'public_offers',id:row.id,version:row.version,ownerId:row.owner_id,data,action:item.delete?'delete':'bulk_update'});
  }
  await rpc('commit_changes',{actor:user.id,changes:commit});
  return {ok:true,count:commit.length};
}
export async function updateAccount(user,body){
  assert(can(user,'accounts.manage'),403,'غير مسموح / Not allowed');
  const id=String(body.id||'');
  assert(/^[a-f0-9-]{36}$/.test(id),400,'حساب غير صالح / Invalid account');
  const row=await one('profiles',id);
  assert(row&&['client','supplier'].includes(row.role)&&!row.deleted_at,404,'الحساب غير متاح / Account unavailable');
  const current=structuredClone(row.data||{}),next={...current};
  const fields=['name','company','phone','country','category'];
  for(const key of fields)next[key]=String(body[key]??current[key]??'').trim().slice(0,200);
  const email=String(body.email??current.email??'').trim().toLowerCase();
  assert(email.length<255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),400,'تحقق من البريد الإلكتروني / Check email address');
  assert(next.name&&next.phone&&next.country,400,'الاسم ورقم التواصل والدولة مطلوبة / Name, phone and country are required');
  const changed=[...fields,'email'].filter(key=>String(key==='email'?email:next[key]??'')!==String(current[key]??''));
  assert(changed.length,409,'لا توجد تغييرات / No changes');
  const now=new Date().toISOString(),oldEmail=String(current.email||'').trim().toLowerCase(),emailChanged=email!==oldEmail;
  next.email=email;
  next.accountHistory=[...(Array.isArray(current.accountHistory)?current.accountHistory:[]),{action:'edit',fields:changed,at:now,actorId:user.id}].slice(-200);
  if(emailChanged)await sb('/auth/v1/admin/users/'+encodeURIComponent(id),{method:'PUT',body:{email}});
  try{
    await rpc('commit_changes',{actor:user.id,changes:[{table:'profiles',id,version:row.version,data:next,role:row.role,permissions:row.permissions,blockedAt:row.blocked_at,deletedAt:row.deleted_at,action:'account_update',reason:'Admin account details update'}]});
  }catch(error){
    if(emailChanged&&oldEmail)try{await sb('/auth/v1/admin/users/'+encodeURIComponent(id),{method:'PUT',body:{email:oldEmail}});}catch{}
    throw error;
  }
  return {ok:true};
}
export async function moderate(user,{kind,id,action,reason}){
  assert(typeof reason==='string'&&reason.trim()&&reason.length<=1000,400,'سبب الإجراء مطلوب / Reason required');
  const permission=['delete','restore'].includes(action)?'trash':kind==='account'?'accounts.manage':'moderate';
  assert(can(user,permission));
  const table=kind==='account'?'profiles':{request:'requests',quote:'quotes',public:'public_offers'}[kind];assert(table,400);
  const r=await one(table,id);assert(r,404);assert(table!=='profiles'||r.role!=='admin',403);
  const data=structuredClone(r.data),isDeleted=table==='profiles'?r.deleted_at:data.deletedAt;
  const allowed=isDeleted?['restore']:table==='profiles'?[r.blocked_at?'unblock':'block','delete']:table==='requests'?[data.suspendedAt?'resume':'suspend','delete']:['delete'];assert(allowed.includes(action),409);
  const now=new Date().toISOString(),field={delete:'deletedAt',restore:'deletedAt',block:'blockedAt',unblock:'blockedAt',suspend:'suspendedAt',resume:'suspendedAt'}[action];
  data[field]=['restore','unblock','resume'].includes(action)?null:now;
  data.moderationHistory=[...(data.moderationHistory||[]),{action,reason:reason.trim(),at:now,actorId:user.id}].slice(-200);
  const change={table,id,version:r.version,data,action,reason:reason.trim()};
  if(table==='profiles')Object.assign(change,{role:r.role,permissions:r.permissions,blockedAt:field==='blockedAt'?data[field]:r.blocked_at,deletedAt:field==='deletedAt'?data[field]:r.deleted_at});
  await rpc('commit_changes',{actor:user.id,changes:[change]});return {ok:true};
}