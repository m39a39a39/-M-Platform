import {db,assert} from '../lib/supabase.mjs';

const COPY={
  invited:{titleAr:'طلب جديد',titleEn:'New request',bodyAr:'تمت دعوتك لتقديم عرض سعر على طلب جديد.',bodyEn:'You were invited to submit a quote for a new request.'},
  quote_published:{titleAr:'عرض جديد',titleEn:'New offer',bodyAr:'وصل عرض جديد لطلبك.',bodyEn:'A new offer is available for your request.'},
  supplier_selected:{titleAr:'تم اختيار عرضك',titleEn:'Your quote was selected',bodyAr:'تم اختيار عرضك. يرجى تأكيد إمكانية تنفيذ الطلب.',bodyEn:'Your quote was selected. Please confirm that you can fulfill the order.'},
  supplier_assigned:{titleAr:'تم إسناد طلب جديد إليك',titleEn:'New order assigned',bodyAr:'تم إسناد طلب جديد إليك. يرجى تأكيد إمكانية التنفيذ.',bodyEn:'A new order was assigned to you. Please confirm that you can fulfill it.'},
  supplier_payment_confirmed_request:{titleAr:'تم تأكيد الدفع',titleEn:'Payment confirmed',bodyAr:'تم تأكيد دفع الطلب. يمكنك بدء الإنتاج.',bodyEn:'Payment has been confirmed. You can start production.'},
  supplier_payment_confirmed_interest:{titleAr:'تم تأكيد الدفع',titleEn:'Payment confirmed',bodyAr:'تم تأكيد دفع طلب المنتج. يمكنك بدء التنفيذ.',bodyEn:'Payment has been confirmed for the product order. You can start fulfillment.'}
};
const inIds=ids=>ids.map(id=>`"${String(id).replaceAll('"','')}"`).join(';').replaceAll(';',',');
const paymentKind=event=>event.endsWith('_interest')?'interest':event.endsWith('_request')?'request':null;
const paymentEvent=event=>event.replace(/_(?:request|interest)$/,'');

function paymentCopy(row,ctx){
  const kind=paymentKind(row.event),event=paymentEvent(row.event),data=ctx?.data||{},ref=ctx?.display_no?` #${ctx.display_no}`:'';
  if(event==='payment_required'){
    if(data.paymentStatus==='receipt_submitted')return {
      titleAr:'تم إرسال إيصال الدفع',titleEn:'Payment receipt submitted',
      bodyAr:'تم إرسال إيصال الدفع — بانتظار مراجعة الإدارة.',bodyEn:'Your payment receipt was submitted and is awaiting admin review.',
      target:{screen:'customerPayment',entityType:kind,entityId:row.entity_id}
    };
    if(data.paymentStatus==='confirmed')return {
      titleAr:'تم تأكيد الدفع',titleEn:'Payment confirmed',
      bodyAr:kind==='request'?`تم تأكيد الدفع لطلبك${ref}.`:'تم تأكيد الدفع لطلب المنتج الجاهز.',
      bodyEn:kind==='request'?`Payment was confirmed for your order${ref}.`:'Payment was confirmed for your ready-product order.',
      target:{screen:'customerPayment',entityType:kind,entityId:row.entity_id}
    };
    if(data.paymentStatus==='reupload_requested')return {
      titleAr:'يرجى إعادة رفع إيصال الدفع',titleEn:'Please upload the receipt again',
      bodyAr:`يرجى إعادة رفع إيصال الدفع.${data.paymentReviewNote?` ${data.paymentReviewNote}`:''}`,
      bodyEn:`Please upload the payment receipt again.${data.paymentReviewNote?` ${data.paymentReviewNote}`:''}`,
      action:'upload_receipt',target:{screen:'customerPayment',entityType:kind,entityId:row.entity_id}
    };
    return {
      titleAr:'بانتظار تأكيد الدفع',titleEn:'Awaiting payment confirmation',
      bodyAr:data.paymentMessage||`يرجى إرفاق إيصال الدفع لتأكيد طلبك${ref}.`,
      bodyEn:data.paymentMessage||`Please upload the payment receipt to confirm your order${ref}.`,
      action:'upload_receipt',target:{screen:'customerPayment',entityType:kind,entityId:row.entity_id}
    };
  }
  if(event==='payment_receipt_submitted')return {
    titleAr:'إيصال دفع جديد',titleEn:'New payment receipt',
    bodyAr:kind==='request'?`تم رفع إيصال دفع جديد للطلب${ref}.`:'تم رفع إيصال دفع جديد لطلب منتج جاهز.',
    bodyEn:kind==='request'?`A new payment receipt was uploaded for order${ref}.`:'A new payment receipt was uploaded for a ready-product order.',
    target:{screen:'adminPayment',entityType:kind,entityId:row.entity_id}
  };
  if(event==='payment_confirmed')return {
    titleAr:'تم تأكيد الدفع',titleEn:'Payment confirmed',
    bodyAr:kind==='request'?`تم تأكيد الدفع لطلبك${ref}.`:'تم تأكيد الدفع لطلب المنتج الجاهز.',
    bodyEn:kind==='request'?`Payment was confirmed for your order${ref}.`:'Payment was confirmed for your ready-product order.',
    target:{screen:'customerPayment',entityType:kind,entityId:row.entity_id}
  };
  if(event==='payment_reupload')return {
    titleAr:'يرجى إعادة رفع إيصال الدفع',titleEn:'Please upload the receipt again',
    bodyAr:`يرجى إعادة رفع إيصال الدفع.${data.paymentReviewNote?` ${data.paymentReviewNote}`:''}`,
    bodyEn:`Please upload the payment receipt again.${data.paymentReviewNote?` ${data.paymentReviewNote}`:''}`,
    action:'upload_receipt',target:{screen:'customerPayment',entityType:kind,entityId:row.entity_id}
  };
  return null;
}

export function notificationPayload(row,quoteRequestId,paymentContext){
  const custom=paymentCopy(row,paymentContext);
  const copy=custom||COPY[row.event]||{titleAr:'إشعار جديد',titleEn:'New notification',bodyAr:'لديك تحديث جديد في المنصة.',bodyEn:'You have a new update on the platform.'};
  let target=custom?.target||{screen:'notifications',entityId:row.entity_id},deepLink='mplatform://notifications';
  if(row.event==='invited'){
    target={screen:'supplierRequest',requestId:row.entity_id};
    deepLink=`mplatform://supplier/requests/${encodeURIComponent(row.entity_id)}`;
  }else if(row.event==='quote_published'&&quoteRequestId){
    target={screen:'customerRequest',requestId:quoteRequestId,quoteId:row.entity_id};
    deepLink=`mplatform://customer/requests/${encodeURIComponent(quoteRequestId)}?quote=${encodeURIComponent(row.entity_id)}`;
  }else if(row.event==='supplier_selected'||row.event==='supplier_payment_confirmed_request'){
    target={screen:'supplierRequest',requestId:row.entity_id};
    deepLink=`mplatform://supplier/requests/${encodeURIComponent(row.entity_id)}`;
  }else if(row.event==='supplier_assigned'||row.event==='supplier_payment_confirmed_interest'){
    target={screen:'supplierOrder',entityType:'interest',entityId:row.entity_id};
    deepLink=`mplatform://supplier/orders/interest/${encodeURIComponent(row.entity_id)}`;
  }else if(custom?.target){
    deepLink=`mplatform://payment/${custom.target.entityType}/${encodeURIComponent(row.entity_id)}`;
  }
  return {id:row.id,event:row.event,entityId:row.entity_id,readAt:row.read_at,createdAt:row.created_at,...copy,target,deepLink,...(custom?.action?{action:custom.action}:{})};
}

export async function listNotifications(user){
  const rows=await db('notifications',`user_id=eq.${user.id}&order=created_at.desc&limit=50`);
  const quoteIds=[...new Set(rows.filter(r=>r.event==='quote_published').map(r=>r.entity_id).filter(Boolean))];
  const quotes=quoteIds.length?await db('quotes',`id=in.(${inIds(quoteIds)})&select=id,request_id`):[];
  const requestByQuote=new Map(quotes.map(q=>[q.id,q.request_id]));

  const paymentRows=rows.filter(r=>paymentKind(r.event));
  const requestIds=[...new Set(paymentRows.filter(r=>paymentKind(r.event)==='request').map(r=>r.entity_id))];
  const interestIds=[...new Set(paymentRows.filter(r=>paymentKind(r.event)==='interest').map(r=>r.entity_id))];
  const [requests,interests]=await Promise.all([
    requestIds.length?db('requests',`id=in.(${inIds(requestIds)})&select=id,display_no,data`):[],
    interestIds.length?db('interests',`id=in.(${inIds(interestIds)})&select=id,data`):[]
  ]);
  const paymentContexts=new Map([
    ...requests.map(x=>[`request:${x.id}`,x]),
    ...interests.map(x=>[`interest:${x.id}`,x])
  ]);
  return rows.map(row=>{
    const kind=paymentKind(row.event),ctx=kind?paymentContexts.get(`${kind}:${row.entity_id}`):undefined;
    return notificationPayload(row,requestByQuote.get(row.entity_id),ctx);
  });
}

export async function markNotificationsRead(user,body={}){
  const all=body.all===true,id=body.id;
  assert(all||Number.isSafeInteger(Number(id))&&Number(id)>0,400,'إشعار غير صالح / Invalid notification');
  const now=new Date().toISOString();
  const query=all?`user_id=eq.${user.id}&read_at=is.null`:`user_id=eq.${user.id}&id=eq.${Number(id)}`;
  await db('notifications',query,{method:'PATCH',body:{read_at:now},headers:{Prefer:'return=minimal'}});
  return {ok:true,readAt:now};
}
