import {sb,one,config,assert,HttpError} from '../lib/supabase.mjs';
export const permissions=['requests.read','requests.edit','offers.read','offers.edit','translate','publish','accounts.read','accounts.manage','moderate','trash','settings','team'];
export const can=(user,p)=>user?.role==='admin'&&(user.is_owner||user.permissions?.includes(p));
export const profile=p=>p?{...p.data,id:p.id,role:p.role,isOwner:p.is_owner,permissions:p.permissions,blockedAt:p.blocked_at,deletedAt:p.deleted_at,version:p.version}:null;
export async function updateOwnCurrency(user,body={}){
  assert(user?.role==='client',403,'غير مصرح / Unauthorized');
  const settings=await one('settings','site'),currencies=Array.isArray(settings?.data?.currencies)?settings.data.currencies:[{code:'SAR',nameAr:'الريال السعودي',nameEn:'Saudi Riyal',rate:1,active:true}];
  const code=String(body.currency||'SAR').trim().toUpperCase(),chosen=currencies.find(x=>x.code===code&&x.active!==false);
  assert(chosen,400,'العملة غير متاحة / Currency unavailable');
  const current=await one('profiles',user.id),data={...(current.data||{}),preferredCurrency:code};
  await sb(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`,{method:'PATCH',body:{data}});
  return {ok:true,currency:code};
}
const NATIVE_ORIGINS=new Set(['capacitor://localhost','http://localhost','https://localhost']);
export const isNativeClient=req=>{
  const marked=['native','ios','android'].includes(String(req.headers['x-m-client']||'').toLowerCase());
  const origin=String(req.headers.origin||'');
  return marked&&(!origin||NATIVE_ORIGINS.has(origin));
};
const nativeTokens=result=>result?.access_token?{accessToken:result.access_token,refreshToken:result.refresh_token,expiresIn:result.expires_in,expiresAt:result.expires_at,tokenType:result.token_type||'bearer'}:null;
export function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i).trim(),decodeURIComponent(x.slice(i+1))];}));}
export function setCookies(res,tokens){
  const secure=config().origin.startsWith('https:')?'; Secure':'';
  res.setHeader('Set-Cookie',[
    `m_access=${encodeURIComponent(tokens?.access_token||'')}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${tokens?3600:0}${secure}`,
    `m_refresh=${encodeURIComponent(tokens?.refresh_token||'')}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=${tokens?2592000:0}${secure}`
  ]);
}
export async function identify(req,res,optional=false){
  const c=cookies(req),bearer=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  let token=bearer||c.m_access,identity;
  if(!token&&!c.m_refresh){if(optional)return null;throw new HttpError(401,'سجّل الدخول / Sign in');}
  try { if(token)identity=await sb('/auth/v1/user',{token,publicKey:true}); } catch {}
  if(!identity&&!bearer&&c.m_refresh){
    try {const refreshed=await sb('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:c.m_refresh},publicKey:true});setCookies(res,refreshed);token=refreshed.access_token;identity=await sb('/auth/v1/user',{token,publicKey:true});}catch{}
  }
  if(!identity){if(optional)return null;throw new HttpError(401,'انتهت الجلسة / Session expired');}
  const p=await one('profiles',identity.id);
  assert(p&&!p.blocked_at&&!p.deleted_at,403,'الحساب غير متاح / Account unavailable');
  return {...p,token};
}
export async function authRoute(action,req,res,body){
  const native=isNativeClient(req),bearer=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if(action==='logout'){
    const token=bearer||cookies(req).m_access;
    if(token)try{await sb('/auth/v1/logout',{method:'POST',token,publicKey:true});}catch{}
    if(!native)setCookies(res,null);return {ok:true};
  }
  if(action==='refresh'){
    assert(native,403,'هذا المسار لتطبيق الجوال فقط / Native client only');
    const refreshToken=String(body.refreshToken||'');assert(refreshToken.length>=20&&refreshToken.length<=4096,400,'رمز التجديد غير صالح / Invalid refresh token');
    const result=await sb('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:refreshToken},publicKey:true});
    return {tokens:nativeTokens(result)};
  }
  if(action==='recover'){
    const email=String(body.email||'').trim().toLowerCase();
    assert(email.length<255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),400,'تحقق من البريد الإلكتروني / Check email address');
    const redirectTo=config().origin;
    await sb(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`,{method:'POST',publicKey:true,body:{email}});
    return {ok:true};
  }
  if(action==='reset'){
    const token=bearer||String(body.accessToken||''),password=String(body.password||'');
    assert(token.length>=20&&token.length<=8192,400,'رابط الاستعادة غير صالح أو منتهي / Recovery link is invalid or expired');
    assert(password.length>=8&&password.length<=128,400,'كلمة المرور يجب أن تكون 8 أحرف على الأقل / Password must be at least 8 characters');
    await sb('/auth/v1/user',{token,publicKey:true});
    await sb('/auth/v1/user',{method:'PUT',token,publicKey:true,body:{password}});
    try{await sb('/auth/v1/logout',{method:'POST',token,publicKey:true});}catch{}
    return {ok:true};
  }
  const email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
  assert(email.length<255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&password.length>=8&&password.length<=128,400,'تحقق من البريد وكلمة المرور (8 أحرف على الأقل) / Check email and password');
  if(action==='register'){
    assert(['client','supplier'].includes(body.role),400);
    const data={role:body.role};
    for(const k of ['name','company','phone','country','category'])data[k]=String(body[k]||'').trim().slice(0,200);
    assert(data.name&&data.phone&&data.country,400,'أكمل بيانات التسجيل / Complete registration');
    const result=await sb('/auth/v1/signup',{method:'POST',publicKey:true,body:{email,password,data}});
    if(result.access_token&&!native)setCookies(res,result);
    return {confirmationRequired:!result.access_token,...(native&&result.access_token?{tokens:nativeTokens(result)}:{})};
  }
  assert(action==='login',404);
  const result=await sb('/auth/v1/token?grant_type=password',{method:'POST',publicKey:true,body:{email,password}});
  const p=await one('profiles',result.user.id);assert(p&&!p.blocked_at&&!p.deleted_at,403);
  if(!native)setCookies(res,result);
  return {user:profile(p),...(native?{tokens:nativeTokens(result)}:{})};
}
