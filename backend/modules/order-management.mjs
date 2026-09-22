import {one,db,rpc,assert} from '../lib/supabase.mjs';
import {can} from './auth.mjs';
import {issueCartProforma,issueFinalInvoice} from './invoices.mjs';
export const ORDER_STAGES=['التحقق من توفر البضاعة','بانتظار الدفع','قيد التجهيز','جاهز للفحص والشحن','تم الشحن','في الطريق','التخليص الجمركي','قيد التوصيل','تم التسليم'];
export const ORDER_TRACKING=['supplier_confirmation','payment_confirmation','production','quality_check','shipped','shipped','shipped','in_delivery','completed'];
const clean=(value,max,required=false)=>{assert(typeof value==='string'&&value.length<=max&&(!required||value.trim()),400,'أكمل البيانات المطلوبة');return value.trim();};
export function checkoutDetails(raw){assert(raw&&typeof raw==='object',400,'أكمل بيانات مراجعة الطلب');return {name:clean(raw.name,120,true),phone:clean(raw.phone,80,true),country:clean(raw.country,100,true),address:clean(raw.address,1000,true),notes:clean(raw.notes||'',2000)};}
const cents=value=>Math.round(Number(value)*100);
export function changeOrder(current,body,now=new Date().toISOString()){
  const data=structuredClone(current),before=structuredClone(current);assert(data.orderFlowVersion===2,409,'هذا الطلب يستخدم المسار السابق');
  assert(!data.cancelledAt&&data.orderStage<8,409,'الطلب مغلق');
  const stage=data.orderStage,action=body.action;assert(Number.isInteger(stage)&&stage>=0&&stage<9,409);
  if(action==='edit'){
    if(body.delivery)data.delivery=checkoutDetails(body.delivery);
    if(body.lines){
      assert(stage===0,409,'تعديل الكميات والأسعار متاح أثناء التحقق فقط');
      assert(Array.isArray(body.lines)&&body.lines.length===data.cartItems.length,400);const seen=new Set();
      data.cartItems=data.cartItems.map(line=>{
        const edit=body.lines.find(x=>x.interestId===line.interestId);assert(edit&&!seen.has(edit.interestId),400);seen.add(edit.interestId);
        const quantity=Number(edit.quantity),unitPrice=Number(edit.unitPrice);
        assert(Number.isInteger(quantity)&&quantity>=Number(line.moq)&&quantity<=1e9&&Number.isFinite(unitPrice)&&unitPrice>0&&unitPrice<=1e9,400,'تحقق من الكميات والأسعار');
        return {...line,quantity,unitPrice,total:cents(quantity*unitPrice)/100,availabilityConfirmed:edit.availabilityConfirmed===true};
      });
      data.cartTotal=data.cartItems.reduce((n,l)=>n+cents(l.total),0)/100;assert(data.cartTotal<=1e12,400);
    }
    if(body.carrier!==undefined)data.carrier=clean(body.carrier,120);
    if(body.trackingNumber!==undefined)data.trackingNumber=clean(body.trackingNumber,120);
  }else if(action==='note'){
    data.internalNotes=[...(data.internalNotes||[]),{at:now,text:clean(body.note,2000,true)}];
  }else if(action==='cancel'){
    data.cancelledAt=now;data.cancellationReason=clean(body.reason,1000,true);data.status='cancelled';data.trackingStatus='cancelled';
  }else if(action==='confirm-payment'){
    assert(stage===1&&data.paymentStatus!=='confirmed',409,'الطلب ليس بانتظار الدفع');
    assert(cents(body.amount)===cents(data.paymentAmount)&&String(body.currency)===data.currency,400,'المبلغ والعملة يجب أن يطابقا الإجمالي المعتمد');
    data.paymentReference=clean(body.reference,200,true);data.paymentStatus='confirmed';data.paymentConfirmedAt=now;data.paymentUpdatedAt=now;
    data.orderStage=2;
  }else if(action==='next'){
    if(stage===0){assert(data.cartItems.every(l=>l.availabilityConfirmed),409,'أكد توفر جميع المنتجات أولًا');data.paymentAmount=data.cartTotal;data.paymentCurrency=data.currency;data.paymentStatus='awaiting_receipt';data.paymentMessage=clean(body.paymentMessage,1000,true);}
    if(stage===1)assert(data.paymentStatus==='confirmed',409,'يجب تأكيد الدفع قبل التجهيز');
    if(stage===3)assert(data.carrier&&data.trackingNumber,400,'أضف شركة الشحن ورقم التتبع أولًا');
    data.orderStage=stage+1;
  }else assert(false,400,'إجراء غير صالح');
  if(!data.cancelledAt){data.trackingStatus=ORDER_TRACKING[data.orderStage];data.status=data.orderStage===8?'completed':'sent';}
  data.updatedAt=now;data.trackingUpdatedAt=now;
  if(data.orderStage!==stage||data.cancelledAt)data.orderHistory=[...(data.orderHistory||[]),{at:now,stage:data.orderStage,cancelled:!!data.cancelledAt}];
  // Private audit retains changed fields without recursively copying the audit itself.
  const fields=Object.keys(data).filter(k=>!['orderAudit','updatedAt'].includes(k)&&JSON.stringify(data[k])!==JSON.stringify(before[k]));
  data.orderAudit=[...(data.orderAudit||[]),{at:now,action,changes:fields.map(key=>({key,before:before[key]??null,after:data[key]}))}];
  assert(data.orderAudit.length<=1000,409,'سجل هذا الطلب يحتاج إلى أرشفة');
  return data;
}
export async function manageOrder(user,body){
  assert(can(user,'requests.edit'));assert(typeof body.id==='string'&&/^[A-Za-z0-9-]{1,80}$/.test(body.id),400);
  const row=await one('requests',body.id);assert(row&&!row.data.deletedAt,404);assert(row.version===body.version,409,'تغيّر الطلب؛ حدّث الصفحة');
  const now=new Date().toISOString(),data=changeOrder(row.data,body,now),children=await db('interests',`data->>cartOrderId=eq.${encodeURIComponent(row.id)}`);
  assert(children.length===data.cartItems.length,409,'منتجات الطلب غير متطابقة');
  const customer=await one('profiles',row.owner_id);
  if(row.data.orderStage===0&&data.orderStage===1){
    const settings=await one('settings','site'),account=(settings.data.bankAccounts||[]).find(a=>a.id===body.bankAccountId&&a.active!==false);assert(account&&String(account.currency).toUpperCase()===data.currency,400,'اختر حسابًا بنفس عملة الطلب');
    data.paymentBankAccountId=account.id;data.paymentBankAccount=account;data.proformaInvoice=await issueCartProforma(customer,data,row.id,now);
  }
  if(body.action==='confirm-payment')data.finalInvoice=await issueFinalInvoice(customer,data,row.id,now);
  data.orderAudit.at(-1).actorId=user.id;
  const changes=[{table:'requests',id:row.id,ownerId:row.owner_id,version:row.version,data,action:'order_'+body.action}];
  // Parent and supplier lines move together, with optimistic locking on every row.
  for(const child of children){
    const line=data.cartItems.find(l=>l.interestId===child.id);assert(line,409);
    const next={...child.data,quantity:line.quantity,unitPrice:line.unitPrice,total:line.total,orderFlowVersion:2,orderStage:data.orderStage,trackingStatus:data.trackingStatus,status:data.cancelledAt?'cancelled':data.orderStage===8?'completed':'active',updatedAt:now};
    if(data.paymentStatus==='confirmed'){next.paymentStatus='confirmed';next.paymentConfirmedAt=data.paymentConfirmedAt;}
    changes.push({table:'interests',id:child.id,ownerId:child.owner_id,offerId:child.offer_id,version:child.version,data:next,action:'cart_order_sync'});
  }
  await rpc('commit_changes',{actor:user.id,changes});return {ok:true};
}
