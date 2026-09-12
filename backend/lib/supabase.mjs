export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function config() {
  const {SUPABASE_URL:url,SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,APP_ORIGIN:explicitOrigin,VERCEL_ENV:environment,VERCEL_BRANCH_URL:branchHost,VERCEL_URL:deploymentHost}=process.env;
  // Use only Vercel-provided hostnames for preview fallback, never request headers.
  const previewHost=environment==='preview'?(branchHost||deploymentHost):undefined;
  const origin=explicitOrigin||(previewHost?`https://${previewHost}`:undefined);
  if(!url || !anon || !service || !origin || url.includes('YOUR_PROJECT')) throw new HttpError(503,'أكمل إعداد Supabase والخادم أولًا / Server configuration required');
  return {url:url.replace(/\/$/,''),anon,service,origin};
}
export async function sb(path,{method='GET',body,token,publicKey=false,headers={}}={}) {
  const c=config(),key=publicKey?c.anon:c.service;
  const response=await fetch(c.url+path,{method,headers:{apikey:key,Authorization:`Bearer ${token||key}`,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const text=await response.text();let result;try{result=text?JSON.parse(text):null;}catch{result=null;}
  if(!response.ok){
    console.error('Supabase request failed',JSON.stringify({path:path.split('?')[0],status:response.status,code:result?.code||null}));
    const conflict=result?.code==='23505'||result?.message?.includes('Conflict');
    throw new HttpError(conflict?409:response.status===429?429:path.startsWith('/auth/')?400:502,conflict?'تغيّرت البيانات أو العنصر موجود؛ حدّث الصفحة / Conflict':path.startsWith('/auth/')?'تعذر تسجيل الدخول أو التسجيل؛ تحقق من البريد وكلمة المرور وتأكيد البريد / Authentication failed':'تعذر تنفيذ العملية / Service unavailable');
  }
  return result;
}
export const db=(table,query='',options={})=>sb(`/rest/v1/${table}${query?'?'+query:''}`,options);
export const one=async(table,id)=> (await db(table,`id=eq.${encodeURIComponent(id)}&limit=1`))[0];
export const rpc=(name,body)=>sb(`/rest/v1/rpc/${name}`,{method:'POST',body});
export const assert=(condition,status=403,message='غير مسموح / Not allowed')=>{if(!condition)throw new HttpError(status,message);};
