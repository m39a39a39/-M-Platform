import {one,rpc,assert} from '../lib/supabase.mjs';
import {can} from './auth.mjs';
import {uploadPaymentReceipt} from './media.mjs';

const TYPES={
  request:{table:'requests',permission:'requests.edit'},
  interest:{table:'interests',permission:'offers.edit'}
};
const statusAllowed=new Set(['awaiting_receipt','reupload_requested']);

function entity(type){const cfg=TYPES[type];assert(cfg,400,'نوع الطلب غير صالح / Invalid order type');return cfg;}
const paymentHistory=(data,entry)=>[...(Array.isArray(data.paymentHistory)?data.paymentHistory:[]),entry].slice(-100);

export async function submitPaymentReceipt(user,body={}){
  assert(user?.role==='client',403);
  const type=String(body.entityType||''),id=String(body.entityId||''),cfg=entity(type);
  assert(/^[A-Za-z0-9-]{1,80}$/.test(id),400);
  const row=await one(cfg.table,id);assert(row&&row.owner_id===user.id,404);
  assert(Number(body.version)===row.version,409,'تغيّرت البيانات؛ حدّث الصفحة / Refresh after conflict');
  const data=structuredClone(row.data||{});
  assert(data.trackingStatus==='payment_confirmation'&&(!data.paymentStatus||statusAllowed.has(data.paymentStatus)),409,'الطلب ليس بانتظار إيصال الدفع / Order is not awaiting a receipt');
  const receipt=await uploadPaymentReceipt(user,body.source);
  const now=new Date().toISOString();
  data.paymentStatus='receipt_submitted';
  data.paymentReceipt={src:receipt.src,mime:receipt.mime,submittedAt:now};
  data.paymentReceiptSubmittedAt=now;
  data.paymentReviewNote='';
  data.paymentUpdatedAt=now;
  data.updatedAt=now;
  data.paymentHistory=paymentHistory(data,{at:now,status:'receipt_submitted'});
  await rpc('commit_changes',{actor:user.id,changes:[{
    table:cfg.table,id:row.id,version:row.version,ownerId:row.owner_id,
    ...(type==='interest'?{offerId:row.offer_id}:{}),
    data,action:'payment_receipt'
  }]});
  return {ok:true,paymentStatus:data.paymentStatus};
}

export async function reviewPaymentReceipt(user,body={}){
  assert(user?.role==='admin',403);
  const type=String(body.entityType||''),id=String(body.entityId||''),cfg=entity(type);
  assert(can(user,cfg.permission)||can(user,'publish'),403);
  assert(/^[A-Za-z0-9-]{1,80}$/.test(id),400);
  const action=String(body.action||'');
  assert(['confirm','reupload'].includes(action),400);
  const row=await one(cfg.table,id);assert(row,404);
  assert(Number(body.version)===row.version,409,'تغيّرت البيانات؛ حدّث الصفحة / Refresh after conflict');
  const data=structuredClone(row.data||{});
  assert(data.paymentStatus==='receipt_submitted'&&data.paymentReceipt?.src,409,'لا يوجد إيصال بانتظار المراجعة / No receipt awaiting review');
  const now=new Date().toISOString(),note=String(body.note||'').trim();
  if(action==='reupload')assert(note&&note.length<=1000,400,'اكتب سبب طلب إعادة رفع الإيصال / Add a re-upload note');
  if(action==='confirm'){
    data.paymentStatus='confirmed';
    data.paymentConfirmedAt=now;
    data.paymentReviewNote='';
  }else{
    data.paymentStatus='reupload_requested';
    data.paymentReviewNote=note;
  }
  data.paymentUpdatedAt=now;
  data.updatedAt=now;
  data.paymentHistory=paymentHistory(data,{at:now,status:data.paymentStatus,note:action==='reupload'?note:''});
  await rpc('commit_changes',{actor:user.id,changes:[{
    table:cfg.table,id:row.id,version:row.version,ownerId:row.owner_id,
    ...(type==='interest'?{offerId:row.offer_id}:{}),
    data,action:action==='confirm'?'payment_confirmed':'payment_reupload'
  }]});
  return {ok:true,paymentStatus:data.paymentStatus};
}
