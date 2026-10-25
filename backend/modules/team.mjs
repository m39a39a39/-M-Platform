import {db,one,rpc,sb,config,assert,HttpError} from '../lib/supabase.mjs';
import {can,permissions} from './auth.mjs';

const validEmail=email=>email.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
const profileChanges=(actor,p,action,newPermissions,data=p.data)=>({
 table:'profiles',id:p.id,version:p.version,data,role:'admin',
 permissions:newPermissions,
 blockedAt:action==='block'?new Date().toISOString():action==='unblock'?null:p.blocked_at,
 deletedAt:p.deleted_at,action:'team_'+action,reason:action==='invite'?'Admin email invitation':String('Team permissions updated')
});

export async function team(user,body={}){
 assert(can(user,'team'),403,'إدارة الفريق تتطلب صلاحية خاصة / Admin team permission required');
 const action=String(body.action||'');
 assert(['invite','save','block','unblock'].includes(action),400,'إجراء غير صالح / Invalid team action');
 const requested=body.permissions;
 assert(Array.isArray(requested)&&requested.every(p=>permissions.includes(p))&&new Set(requested).size===requested.length,400,'اختر صلاحيات صحيحة / Select valid permissions');
 assert(user.is_owner||requested.every(p=>user.permissions?.includes(p)),403);
 assert(user.is_owner||!requested.includes('team'),403,'إدارة الفريق بتفويض المدير الرئيسي فقط / Owner delegation required');
 const email=String(body.email||'').trim().toLowerCase();

 if(action==='invite'){
  assert(!body.id,400,'لا يمكن دعوة حساب موجود عبر هذه العملية / Invitation is for new users only');
  const name=String(body.name||'').trim();
  assert(name.length>=2&&name.length<=120,400,'أدخل اسم المدير (2-120 حرفًا) / Enter an admin name');
  assert(validEmail(email),400,'أدخل بريدًا إلكترونيًا صالحًا / Enter a valid email address');
  assert(requested.length>0,400,'اختر صلاحية واحدة على الأقل / Choose at least one permission');
  const matches=await db('profiles',`data->>email=eq.${encodeURIComponent(email)}&limit=1`);
  assert(!matches.length,409,'هذا البريد مسجل بالفعل. لا ترسل دعوة جديدة؛ استخدم تعديل الحساب الموجود. / Account already exists.');
  const redirectTo=config().origin.replace(/\/$/,'')+'/reset-password.html';
  let invited;
  try{
   // Service-role-only GoTrue admin endpoint sends the invitation; never expose the key or token.
   invited=await sb('/auth/v1/invite?redirect_to='+encodeURIComponent(redirectTo),{
    method:'POST',body:{email,data:{name}}
   });
  }catch(error){
   if(error instanceof HttpError&&error.status===400)throw new HttpError(502,'تعذر إرسال دعوة البريد. تحقق من إعدادات إرسال البريد والدعوات في Supabase. / Could not send invitation email.');
   throw error;
  }
  const id=invited?.id||invited?.user?.id;
  assert(typeof id==='string'&&id.length>=20,502,'تعذر تأكيد إنشاء المستخدم / Invitation identity could not be verified');
  const row=await one('profiles',id);
  assert(row&&!row.is_owner&&String(row.data?.email||'').toLowerCase()===email,502,'أُرسلت الدعوة لكن تعذر تهيئة الصلاحيات. راجع حساب المستخدم قبل إعادة المحاولة. / Invitation sent but role setup failed.');
  await rpc('commit_changes',{actor:user.id,changes:[profileChanges(user,row,'invite',requested,{
   ...row.data,name,email,invitedAt:new Date().toISOString(),invitedBy:user.id
  })]});
  return {ok:true,invited:true,email};
 }

 const p=body.id?await one('profiles',body.id):(await db('profiles',`data->>email=eq.${encodeURIComponent(email)}&limit=1`))[0];
 assert(p,404,'الحساب غير موجود / Account not found');
 assert(!p.is_owner&&p.id!==user.id,403,'لا يمكن تعديل المدير الرئيسي أو صلاحياتك بنفسك / Protected account');
 assert(user.is_owner||!(p.permissions||[]).some(permission=>!user.permissions?.includes(permission)),403);
 await rpc('commit_changes',{actor:user.id,changes:[profileChanges(user,p,action,action==='save'?requested:p.permissions)]});
 return {ok:true};
}
