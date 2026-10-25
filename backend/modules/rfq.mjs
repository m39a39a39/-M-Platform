import {createHash,randomUUID} from 'node:crypto';
import {assert,config,db,rpc} from '../lib/supabase.mjs';
import {can} from './auth.mjs';

const ADMIN_READ=user=>can(user,'requests.read')||can(user,'requests.edit');
const ADMIN_EDIT=user=>can(user,'requests.edit');
const MAX_ITEMS=100;
function str(value,max=200){return String(value??'').trim().slice(0,max+1);}
function normalizePhone(value){
  const raw=str(value,32).replace(/[\s()\-.]/g,'');
  assert(/^\+[1-9]\d{7,14}$/.test(raw),400,'أدخل رقم واتساب دوليًا صحيحًا يبدأ بمفتاح الدولة (+966...)');
  return raw;
}
function parsePayload(body,admin=false){
  assert(body&&typeof body==='object'&&!Array.isArray(body),400,'Invalid RFQ');
  const customer=body.customer||{};
  const name=str(customer.name,140),country=str(customer.country,120),company=str(customer.company,200);
  const whatsapp=normalizePhone(customer.whatsapp);
  assert(name.length>=2&&name.length<=140&&country.length>=2&&country.length<=120&&company.length<=200,400,'أكمل بيانات العميل المطلوبة');
  const requestType=body.requestType||'catalog';
  assert(['catalog','custom'].includes(requestType),400,'نوع الطلب غير صحيح');
  const items=body.items;
  assert(Array.isArray(items)&&items.length<=MAX_ITEMS&&(requestType==='catalog'?items.length>=1:items.length===0),400,
    requestType==='custom'?'طلب التوريد الخاص لا يتطلب منتجات من الكتالوج':'اختر من 1 إلى 100 منتج');
  let customDetails={};
  if(requestType==='custom'){
    const details=body.customDetails||{},productName=str(details.productName,200),specifications=str(details.specifications,2000),
      quantity=Number(details.quantity),image=String(details.image||'');
    assert(productName.length>=2&&productName.length<=200&&specifications.length>=5&&specifications.length<=2000,400,'أكمل اسم المنتج ومواصفاته');
    assert(Number.isSafeInteger(quantity)&&quantity>0&&quantity<=1000000000,400,'الكمية غير صحيحة');
    assert(image.length<=480000&&(!image||/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)),400,'صيغة صورة المنتج غير مدعومة');
    customDetails={productName,specifications,quantity,image};
  }
  const seen=new Set();
  const checked=items.map(row=>{
    const offerId=str(row?.offerId,100),quantity=Number(row?.quantity);
    assert(/^[\w-]{1,100}$/.test(offerId)&&!seen.has(offerId),400,'تحقق من المنتجات وعدم تكرارها');
    assert(Number.isSafeInteger(quantity)&&quantity>0&&quantity<=1000000000,400,'الكمية غير صحيحة');
    seen.add(offerId);return {offerId,quantity};
  });
  const notes=str(body.notes,2000),internalNotes=admin?str(body.internalNotes,4000):'';
  assert(notes.length<=2000&&internalNotes.length<=4000,400,'الملاحظات طويلة جدًا');
  let status='new',source='website',requestId=null,expectedVersion=null,idempotencyKey=null;
  if(admin){
    source='admin';status=str(body.status||'new',30);
    assert(['new','contacted','agreed','closed'].includes(status),400,'حالة الطلب غير صحيحة');
    requestId=body.requestId||null;
    if(requestId){assert(/^[a-f\d-]{36}$/i.test(String(requestId)),400,'رقم الطلب غير صالح');expectedVersion=Number(body.expectedVersion);assert(Number.isSafeInteger(expectedVersion)&&expectedVersion>0,400,'حدّث الطلب قبل التعديل');}
  }else{
    assert(!body.requestId,403,'لا يمكنك تعديل الطلب دون صلاحية');
    idempotencyKey=str(body.idempotencyKey,40);
    assert(/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(idempotencyKey),400,'Invalid submission key');
  }
  return {customer:{name,country,company,whatsapp,notes:admin?str(customer.notes,2000):''},items:checked,
    requestType,customDetails,notes,internalNotes,source,status,requestId,expectedVersion,idempotencyKey};
}
function hashOrigin(req){
  // Never store raw IP addresses. The key rotates when the server secret changes.
  const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
  const ip=forwarded||req.socket?.remoteAddress||'unknown';
  return createHash('sha256').update(config().service.slice(-48)+'|'+ip).digest('hex');
}
async function list(){
  const [requests,customers,items,audit]=await Promise.all([
    db('imsg_rfq_requests','select=*&order=created_at.desc&limit=800'),
    db('imsg_rfq_customers','select=*&limit=1200'),
    db('imsg_rfq_items','select=*&limit=10000'),
    db('imsg_rfq_audit','select=*&order=created_at.desc&limit=10000')
  ]);
  const contacts=new Map(customers.map(x=>[x.id,x]));
  const byRequest=new Map(),events=new Map();
  for(const item of items){const rows=byRequest.get(item.request_id)||[];rows.push({id:item.id,offerId:item.offer_id,quantity:Number(item.quantity),snapshot:item.snapshot});byRequest.set(item.request_id,rows);}
  for(const e of audit){const rows=events.get(e.request_id)||[];rows.push({id:e.id,actorId:e.actor_id,action:e.action,before:e.before_data,after:e.after_data,at:e.created_at});events.set(e.request_id,rows);}
  return {requests:requests.map(r=>({
    id:r.id,number:'RFQ-'+r.number,customerId:r.customer_id,customer:contacts.get(r.customer_id)||null,
    source:r.source,status:r.status,requestType:r.request_type||'catalog',customDetails:r.custom_details||{},
    notes:r.notes,internalNotes:r.internal_notes,
    createdBy:r.created_by,updatedBy:r.updated_by,createdAt:r.created_at,updatedAt:r.updated_at,
    statusChangedAt:r.status_changed_at,version:r.version,items:byRequest.get(r.id)||[],
    audit:events.get(r.id)||[]
  })),customers:customers.map(c=>({...c,requestCount:requests.filter(r=>r.customer_id===c.id).length}))};
}
export async function rfqRoute(user,req,body,url){
  if(req.method==='GET'){assert(ADMIN_READ(user),403,'غير مصرح / Unauthorized');return list();}
  assert(req.method==='POST',405);
  if(body?.action==='customer-note'){
    assert(ADMIN_EDIT(user),403,'غير مصرح / Unauthorized');
    const id=str(body.customerId,40),notes=str(body.notes,2000);
    assert(/^[0-9a-f-]{36}$/i.test(id)&&notes.length<=2000,400,'بيانات ملاحظات العميل غير صحيحة');
    const result=await db('imsg_rfq_customers','id=eq.'+encodeURIComponent(id),{
      method:'PATCH',body:{notes,updated_at:new Date().toISOString()},headers:{Prefer:'return=representation'}
    });
    assert(Array.isArray(result)&&result.length===1,404,'العميل غير موجود');
    return {ok:true};
  }
  const admin=body?.source==='admin'||body?.requestId;
  if(admin)assert(ADMIN_EDIT(user),403,'غير مصرح / Unauthorized');
  const payload=parsePayload(body,admin);
  const result=await rpc('imsg_rfq_save',{
    p_payload:payload,p_actor:admin?user.id:null,p_remote_hash:admin?null:hashOrigin(req)
  });
  return result;
}
