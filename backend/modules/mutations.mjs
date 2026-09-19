import {one,db,rpc,assert} from '../lib/supabase.mjs';
import {can} from './auth.mjs';
import {tables,assertOpenRequest,active,open} from './records.mjs';
const contact=v=>/(?:https?:\/\/|www\.|wa\.me|@[a-z0-9]|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+|00)\d[\d\s()-]{7,})/i.test(String(v));
const contentFields={requests:['product','specs','quantity','country','neededDate','images'],quotes:['unitPrice','currency','moq','leadTime','sampleCost','notes','images'],publicOffers:['product','specs','country','unitPrice','currency','moq','stock','leadTime','validUntil','images','categoryId']};
export const TRACKING_FLOW=['received','reviewing','sourcing','quotes_available','quote_selected','payment_confirmation','production','quality_check','ready_to_ship','shipped','in_delivery','delivered','completed'];
export const READY_TRACKING_FLOW=['received','payment_confirmation','production','quality_check','ready_to_ship','shipped','in_delivery','delivered','completed'];
export const TRACKING_EXCEPTIONS=['customer_action','on_hold','cancelled'];
export const TRACKING_STATUSES=[...TRACKING_FLOW,...TRACKING_EXCEPTIONS];
export const READY_TRACKING_STATUSES=[...READY_TRACKING_FLOW,...TRACKING_EXCEPTIONS];
const trackingRank=s=>TRACKING_FLOW.indexOf(s);
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
async function assertCategory(categoryId,{required=false,activeOnly=false}={}){
  const settings=await one('settings','site'),categories=Array.isArray(settings?.data?.categories)?settings.data.categories:[];
  const active=categories.filter(c=>c?.active!==false);
  if(!categoryId){assert(!(required&&active.length),400,'اختر التصنيف / Choose a category');return;}
  const category=categories.find(c=>c?.id===categoryId);
  assert(category&&(!activeOnly||category.active!==false),400,'التصنيف غير متاح / Category unavailable');
}
export function validateContent(kind,d){
  for(const key of kind==='requests'?['quantity']:['unitPrice','moq','leadTime'])assert(Number.isFinite(Number(d[key]))&&Number(d[key])>0&&Number(d[key])<=1e9,400,'تحقق من الكمية والسعر ومدة الإنتاج / Invalid quantities or price');
  if(kind!=='requests')assert(['USD','SAR','AED','CNY','EUR'].includes(d.currency),400,'عملة غير مدعومة / Unsupported currency');
  for(const k of ['product','specs','notes','sampleCost'])if(d[k]!==undefined)assert(typeof d[k]==='string'&&d[k].length<=10000&&!contact(d[k]),400,'احذف بيانات التواصل وتحقق من طول النص / Check text and remove contact details');
  if(kind!=='quotes')assert(d.product?.trim()&&d.specs?.trim(),400,'أكمل اسم المنتج والوصف / Product and description required');
  for(const key of ['country','neededDate','validUntil','stock'])if(d[key]!==undefined)assert(typeof d[key]==='string'&&d[key].length<=100,400);
  if(d.categoryId!==undefined)assert(typeof d.categoryId==='string'&&d.categoryId.length<=80,400,'تصنيف غير صالح / Invalid category');
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
  const original=await one(table,id);
  assert(Number(version)===(original?.version||0),409,'تغيّرت البيانات؛ حدّث الصفحة / Refresh after conflict');
  const now=new Date().toISOString();
  let data=structuredClone(original?.data||{}),ownerId=original?.owner_id||user.id;
  const changes=Object.keys(patch),isAdmin=user.role==='admin';
  if(!original){
    assert(collection==='requests'?user.role==='client':collection==='interests'?user.role==='client':user.role==='supplier');
    const allowed=collection==='interests'?['offerId','status']: [...contentFields[collection],...(collection==='quotes'?['requestId']:[]),'status'];
    assert(changes.every(k=>allowed.includes(k)),400);
    data=Object.fromEntries(changes.filter(k=>!['status','requestId','offerId'].includes(k)).map(k=>[k,patch[k]]));
    data.status=collection==='requests'?'review':collection==='interests'?'active':'pending';data.createdAt=now;
    if(collection==='requests'||collection==='interests')setTracking(data,'received',now,'');
    if(collection==='quotes'){
      const r=await assertOpenRequest(patch.requestId);
      assert(r.data.status==='sent'&&!r.data.selectedQuoteId&&r.data.supplierIds?.includes(user.id));
      const existing=await db('quotes',`request_id=eq.${encodeURIComponent(patch.requestId)}&owner_id=eq.${encodeURIComponent(user.id)}&data->>deletedAt=is.null&limit=1`);
      assert(!existing.length,409,'سبق أن قدمت عرضًا على هذا الطلب / You already submitted an offer for this request');
    }else if(collection==='interests'){
      const offer=await one('public_offers',patch.offerId);
      assert(open(offer)&&offer.data.status==='published'&&active(await one('profiles',offer.owner_id))&&(!offer.data.validUntil||offer.data.validUntil>=now.slice(0,10)),409);
    }
    if(collection!=='interests'){
      validateContent(collection,data);await checkImages(data.images||[],user);
      if(collection==='publicOffers')await assertCategory(data.categoryId,{required:true,activeOnly:true});
      if(collection!=='quotes')assert(data.images?.length,400,'أضف صورة / Image required');
    }
  }else if(!isAdmin){
    if(collection==='requests'&&user.role==='client'&&original.owner_id===user.id){
      assert(changes.length===1&&['selectedQuoteId','lastSeenQuoteAt'].includes(changes[0]));
      if(changes[0]==='selectedQuoteId'){
        const r=await assertOpenRequest(id),q=await one('quotes',patch.selectedQuoteId);
        assert(!r.data.selectedQuoteId&&r.data.status==='sent'&&open(q)&&q.request_id===id&&q.data.status==='published'&&active(await one('profiles',q.owner_id)),409,'العرض غير متاح أو سبق اختيار عرض / Quote unavailable or already selected');
        data.selectedQuoteId=q.id;setTracking(data,'quote_selected',now,'');
      }else{
        const published=await db('quotes',`request_id=eq.${encodeURIComponent(id)}&data->>status=eq.published&data->>deletedAt=is.null`);
        const latest=published.map(q=>q.data.publishedAt||q.data.updatedAt||q.data.reviewedAt||q.created_at).filter(Boolean).sort().at(-1);
        assert(latest,409,'لا توجد عروض منشورة / No published quotes');
        data.lastSeenQuoteAt=latest;
      }
    }else if(collection==='quotes'&&user.role==='supplier'&&original.owner_id===user.id){
      assert(changes.length&&changes.every(k=>contentFields.quotes.includes(k)),400,'يمكن تعديل بيانات العرض فقط / Only offer fields can be edited');
      const r=await assertOpenRequest(original.request_id);
      assert(r.data.status==='sent'&&!r.data.selectedQuoteId&&r.data.supplierIds?.includes(user.id),409,'لا يمكن تعديل العرض بعد إغلاق الطلب أو اختيار عرض / Offer cannot be edited after request closure or selection');
      assert(['pending','published'].includes(data.status),409,'العرض غير قابل للتعديل / Offer is not editable');
      for(const key of changes)data[key]=patch[key];
      validateContent('quotes',data);
      await checkImages(data.images||[],user,original.data.images||[]);
      data.status='pending';
      data.translation={};
      data.reviewedAt=null;
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
      }else if(key==='reviewedAt'){
        assert(can(user,editPermission)||can(user,'translate')||can(user,'publish'));data.reviewedAt=now;
      }else if((collection==='requests'||collection==='interests')&&key==='trackingStatus'){
        const allowed=collection==='requests'?TRACKING_STATUSES:READY_TRACKING_STATUSES;
        assert(collection==='requests'?(can(user,'requests.edit')||can(user,'publish')):(can(user,'offers.edit')||can(user,'publish')));
        assert(allowed.includes(patch[key]),400,'حالة متابعة غير صالحة / Invalid tracking status');data.trackingStatus=patch[key];
      }else if((collection==='requests'||collection==='interests')&&key==='trackingNote'){
        assert(collection==='requests'?(can(user,'requests.edit')||can(user,'publish')):(can(user,'offers.edit')||can(user,'publish')));
        assert(typeof patch[key]==='string'&&patch[key].length<=1000,400,'ملاحظة المتابعة طويلة / Tracking note too long');data.trackingNote=patch[key];
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
    }
    if((collection==='requests'||collection==='interests')&&changes.includes('trackingStatus')&&patch.trackingStatus==='payment_confirmation'&&original.data.trackingStatus!=='payment_confirmation'){
      assert(data.paymentMessage?.trim(),400,'اكتب رسالة الدفع للعميل / Add a payment message');
      if(data.paymentStatus!=='confirmed'){
        data.paymentStatus='awaiting_receipt';
        data.paymentRequestedAt=now;
        data.paymentUpdatedAt=now;
        data.paymentReviewNote='';
        data.paymentHistory=[...(Array.isArray(data.paymentHistory)?data.paymentHistory:[]),{at:now,status:'awaiting_receipt'}].slice(-100);
      }
    }
    if(collection==='requests'&&data.status==='sent'&&original.data.status!=='sent')advanceTracking(data,'sourcing',now);
    if(collection==='requests'&&data.status==='completed'&&original.data.status!=='completed')setTracking(data,'completed',now,'');
    if(collection==='publicOffers'&&changes.includes('categoryId'))await assertCategory(data.categoryId,{required:data.status==='published'});
    if(collection!=='interests'){
      await checkImages(data.images||[],user,original.data.images||[]);
      assert(active(await one('profiles',ownerId)),409);
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
    assert(['logo','logoText',...prefixes.flatMap(k=>[k+'Ar',k+'En'])].includes(k)&&typeof v==='string'&&v.length<=10000,400);
    if(k==='logo'&&v)await checkImages([v],user,row.data.logo?[row.data.logo]:[]);
    data[k]=v;
  }
  await rpc('commit_changes',{actor:user.id,changes:[{table:'settings',id:'site',version:row.version,data,action:'settings'}]});return {ok:true};
}
export async function moderate(user,{kind,id,action,reason}){
  assert(typeof reason==='string'&&reason.trim()&&reason.length<=1000,400,'سبب الإجراء مطلوب / Reason required');
  assert(can(user,['delete','restore'].includes(action)?'trash':'moderate'));
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