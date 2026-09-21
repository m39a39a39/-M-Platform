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
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function sb(path,{method='GET',body,token,publicKey=false,headers={}}={}) {
  const c=config(),key=publicKey?c.anon:c.service;
  const request=()=>fetch(c.url+path,{method,headers:{apikey:key,Authorization:`Bearer ${token||key}`,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  let response,lastError;
  // Retry only safe reads. Never repeat writes automatically.
  for(let attempt=0;attempt<(method==='GET'?2:1);attempt++){
    try{
      response=await request();
      if(response.status<500||attempt===1)break;
    }catch(error){lastError=error;if(attempt===1)throw new HttpError(502,'تعذر تنفيذ العملية / Service unavailable');}
    await sleep(180);
  }
  if(!response){console.error('Supabase request failed',JSON.stringify({path:path.split('?')[0],error:lastError?.name||'network'}));throw new HttpError(502,'تعذر تنفيذ العملية / Service unavailable');}
  const text=await response.text();let result;try{result=text?JSON.parse(text):null;}catch{result=null;}
  if(!response.ok){
    const cleanPath=path.split('?')[0],expectedAuthFailure=cleanPath.startsWith('/auth/')&&response.status<500;
    (expectedAuthFailure?console.warn:console.error)('Supabase request failed',JSON.stringify({path:cleanPath,status:response.status,code:result?.code||null}));
    const conflict=result?.code==='23505'||result?.message?.includes('Conflict');
    const recovery=cleanPath==='/auth/v1/recover';
    const authMessage=recovery?'تعذر إرسال رابط الاستعادة الآن؛ تحقق من البريد وحاول لاحقًا / Could not send the recovery link; check the email and try again later':'تعذر تسجيل الدخول أو التسجيل؛ تحقق من البريد وكلمة المرور وتأكيد البريد / Authentication failed';
    throw new HttpError(conflict?409:response.status===429?429:cleanPath.startsWith('/auth/')?400:502,conflict?'تغيّرت البيانات أو العنصر موجود؛ حدّث الصفحة / Conflict':cleanPath.startsWith('/auth/')?authMessage:'تعذر تنفيذ العملية / Service unavailable');
  }
  return result;
}
export const db=(table,query='',options={})=>sb(`/rest/v1/${table}${query?'?'+query:''}`,options);
export const one=async(table,id)=> (await db(table,`id=eq.${encodeURIComponent(id)}&limit=1`))[0];
export const rpc=(name,body)=>sb(`/rest/v1/rpc/${name}`,{method:'POST',body});
export const assert=(condition,status=403,message='غير مسموح / Not allowed')=>{if(!condition)throw new HttpError(status,message);};
