import {deleteOrder} from './modules/delete-order.mjs';
import {supplierCatalog} from './modules/supplier-catalog.mjs';
import {bulkSupplySources} from './modules/bulk-supply-sources.mjs';
import {submitSupplySource,reviewSupplySource} from './modules/supply-sources.mjs';
import {bulkSubmitSupplySources} from './modules/bulk-import.mjs';
import {assignSupplier} from './modules/fulfillment.mjs';
import {createAccount} from './modules/admin-create.mjs';
import {config,HttpError,assert} from './lib/supabase.mjs';
import {identify,authRoute,isNativeClient,updateOwnCurrency} from './modules/auth.mjs';
import {snapshot} from './modules/records.mjs';
import {mutate,moderate,saveSettings,updateAccount,bulkUpdatePublicOffers} from './modules/mutations.mjs';
import {upload,media} from './modules/media.mjs';
import {team} from './modules/team.mjs';
import {listNotifications,markNotificationsRead} from './modules/notifications.mjs';
import {registerPushDevice,unregisterPushDevice} from './modules/push.mjs';
import {publicAppConfig} from './modules/app-config.mjs';
import {submitPaymentReceipt,reviewPaymentReceipt} from './modules/payments.mjs';
import {manageOrder} from './modules/order-management.mjs';
import {saveStudio} from './modules/studio.mjs';
import {createCartOrder} from './modules/cart-orders.mjs';
import {aiChat} from './modules/ai-chat.mjs';
import {customerConversation,adminConversationList,adminConversationRead,adminConversationAction} from './modules/ai-conversations.mjs';

const NATIVE_ORIGINS=new Set(['capacitor://localhost','http://localhost','https://localhost']);
const nativeOrigin=req=>NATIVE_ORIGINS.has(String(req.headers.origin||''));
const setNativeCors=(req,res,isV1)=>{
  if(!isV1||!nativeOrigin(req))return;
  res.setHeader('Access-Control-Allow-Origin',req.headers.origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, X-M-Client');
  res.setHeader('Access-Control-Max-Age','86400');
};

export async function readBody(req,maxBytes=1800000){
  const size=Number(req.headers['content-length']||0);assert(size<=maxBytes,413);
  if(req.body!==undefined){const data=typeof req.body==='string'?JSON.parse(req.body):req.body;assert(Buffer.byteLength(JSON.stringify(data))<=maxBytes,413);return data;}
  let text='';for await(const chunk of req){text+=chunk;assert(Buffer.byteLength(text)<=maxBytes,413);}
  try{return text?JSON.parse(text):{};}catch{throw new HttpError(400,'Invalid JSON');}
}

async function temporaryMoxomDiscover(category,page=1){
  const safe=String(category||'').trim();
  assert(/^[a-z0-9-]{2,80}$/.test(safe),400,'Invalid MOXOM category');
  const p=Math.max(1,Math.min(20,Number(page)||1));
  const listUrl=`https://www.moxom.com.cn/collections/${safe}?page=${p}`;
  const response=await fetch(listUrl,{headers:{'user-agent':'Mozilla/5.0 MPlatformCatalog/1.0','accept-language':'en-US,en;q=0.9'},signal:AbortSignal.timeout(15000)});
  assert(response.ok,502,'Could not open MOXOM collection');
  const html=(await response.text()).replaceAll('\\/','/');
  const links=[];
  for(const m of html.matchAll(/href=["'](\/products\/[A-Za-z0-9_%.-]+)["']/gi)){
    const href=m[1],url='https://www.moxom.com.cn'+href;
    if(!links.includes(url))links.push(url);
    if(links.length>=20)break;
  }
  let next=0;const rows=new Array(links.length);
  const cleanText=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
  const worker=async()=>{
    while(next<links.length){
      const i=next++,url=links[i];
      try{
        const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 MPlatformCatalog/1.0','accept-language':'en-US,en;q=0.9'},signal:AbortSignal.timeout(15000)});
        if(!r.ok){rows[i]={url,error:'http_'+r.status};continue;}
        const ph=(await r.text()).replaceAll('\\/','/');
        const model=(ph.match(/Item\s*No\.?\s*:\s*([A-Za-z0-9._-]+)/i)||[])[1]||'';
        const title=cleanText((ph.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||'');
        const images=[];
        for(const im of ph.matchAll(/https?:\/\/ueeshop\.ly200-cdn\.com\/[^"'<>\s\\]+/gi)){
          let raw=im[0].replaceAll('&amp;','&');
          try{
            const u=new URL(raw);u.search='';
            let clean=u.href;
            clean=clean.replace(/\.\d+x\d+(?=\.(?:jpe?g|png|webp)$)/i,'');
            if(!/\.(?:jpe?g|png|webp)$/i.test(clean))continue;
            if(!images.includes(clean))images.push(clean);
          }catch{}
          if(images.length>=5)break;
        }
        rows[i]={model,title,url,images};
      }catch(error){rows[i]={url,error:String(error?.message||error)};}
    }
  };
  await Promise.all(Array.from({length:Math.min(8,links.length)},worker));
  return {category:safe,page:p,count:rows.length,items:rows};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-API-Version','1');
  try{
    const url=new URL(req.url,'http://localhost'),rawPath=url.searchParams.has('route')?'/api/'+url.searchParams.get('route'):url.pathname;
    const isV1=rawPath.startsWith('/api/v1/');
    setNativeCors(req,res,isV1);
    if(req.method==='OPTIONS'){
      assert(isV1&&nativeOrigin(req),403,'مصدر الطلب غير مسموح / Invalid origin');
      res.statusCode=204;res.end();return;
    }
    const path=isV1?'/api/'+rawPath.slice('/api/v1/'.length):rawPath;
    if(path==='/api/health'){
      assert(req.method==='GET',405);config();res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,configured:true,apiVersion:1,nativeAuth:true,pushApiPrepared:true,capacitorCors:true}));return;
    }
    if(path==='/api/moxom-discover'){
      assert(req.method==='GET',405);
      assert(url.searchParams.get('key')==='moxom-featured-20261005-7f31',403);
      const result=await temporaryMoxomDiscover(url.searchParams.get('category'),url.searchParams.get('page'));
      res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(result));return;
    }
    const c=config();
    if(path==='/api/app-config'){
      assert(req.method==='GET',405);res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(publicAppConfig(c.origin)));return;
    }
    assert(['GET','POST'].includes(req.method),405);
    if(req.method==='POST'){
      const bearer=/^Bearer /.test(req.headers.authorization||''),markedNative=isNativeClient(req),trustedNative=isV1&&nativeOrigin(req)&&markedNative;
      const nativeNoOrigin=markedNative&&!req.headers.origin;
      assert(req.headers.origin===c.origin||trustedNative||bearer&&nativeNoOrigin||path.startsWith('/api/auth/')&&nativeNoOrigin,403,'مصدر الطلب غير مسموح / Invalid origin');
      assert((req.headers['content-type']||'').includes('application/json'),415);
    }
    const body=req.method==='POST'?await readBody(req,path==='/api/supply-sources/bulk-submit'?3500000:['/api/uploads','/api/payment-receipts'].includes(path)?7500000:1800000):{};
    let result;
    if(path.startsWith('/api/auth/')){
      assert(req.method==='POST',405);result=await authRoute(path.split('/').at(-1),req,res,body);
    }else{
      const user=await identify(req,res,path==='/api/state'||path==='/api/ai-chat'||path==='/api/ai-conversation'&&req.method==='GET'||path.startsWith('/api/media/')&&req.method==='GET');
      if(path==='/api/state'){
        assert(req.method==='GET',405);
        if(!user){
          res.setHeader('Cache-Control','public, max-age=0, s-maxage=30, stale-while-revalidate=300');
          res.setHeader('CDN-Cache-Control','public, max-age=30, stale-while-revalidate=300');
        }
        result=await snapshot(user,{productId:url.searchParams.get('product')||'',pageId:url.searchParams.get('page')||'',category:url.searchParams.get('category')||'',q:url.searchParams.get('q')||''});
      }
      else if(path==='/api/ai-chat'){assert(req.method==='POST',405);result=await aiChat(user,body,req);}
      else if(path==='/api/ai-conversation'){
        assert(req.method==='GET',405);result=await customerConversation(user,{conversationId:url.searchParams.get('conversationId')||'',guestKey:url.searchParams.get('guestKey')||'',language:url.searchParams.get('language')||'ar'});
      }
      else if(path==='/api/ai-conversations'){
        assert(req.method==='GET',405);result=url.searchParams.get('conversationId')?await adminConversationRead(user,url.searchParams.get('conversationId')):await adminConversationList(user);
      }
      else if(path==='/api/supplier-catalog'){assert(req.method==='GET',405);result=await supplierCatalog(user,url.searchParams);}
      else if(path.startsWith('/api/media/')){assert(req.method==='GET',405);await media(user,path.split('/').at(-1),res,{width:url.searchParams.get('width'),quality:url.searchParams.get('quality')});return;}
      else if(path==='/api/notifications'){
        assert(user,401);assert(req.method==='GET',405);result=await listNotifications(user);
      }else{
        assert(req.method==='POST',405);assert(user,401);
        if(path==='/api/supply-sources/submit')result=await submitSupplySource(user,body);
        else if(path==='/api/supply-sources/bulk-submit')result=await bulkSubmitSupplySources(user,body);
        else if(path==='/api/supply-sources/bulk')result=await bulkSupplySources(user,body);
        else if(path==='/api/supply-sources/review')result=await reviewSupplySource(user,body);
        else if(path==='/api/mutations')result=await mutate(user,body);
        else if(path==='/api/orders/delete')result=await deleteOrder(user,body);
        else if(path==='/api/bulk-public-offers')result=await bulkUpdatePublicOffers(user,body);
        else if(path==='/api/moderation')result=await moderate(user,body);
        else if(path==='/api/accounts/create')result=await createAccount(user,body);
        else if(path==='/api/accounts/update')result=await updateAccount(user,body);
        else if(path==='/api/profile/currency')result=await updateOwnCurrency(user,body);
        else if(path==='/api/orders/assign')result=await assignSupplier(user,body);
        else if(path==='/api/order-management')result=await manageOrder(user,body);
        else if(path==='/api/studio')result=await saveStudio(user,body);
        else if(path==='/api/settings')result=await saveSettings(user,body);
        else if(path==='/api/team')result=await team(user,body);
        else if(path==='/api/uploads')result=await upload(user,body);
        else if(path==='/api/payment-receipts')result=await submitPaymentReceipt(user,body);
        else if(path==='/api/payment-review')result=await reviewPaymentReceipt(user,body);
        else if(path==='/api/cart-orders')result=await createCartOrder(user,body);
        else if(path==='/api/ai-conversations')result=await adminConversationAction(user,body);
        else if(path==='/api/notifications/read')result=await markNotificationsRead(user,body);
        else if(path==='/api/push/register')result=await registerPushDevice(user,body);
        else if(path==='/api/push/unregister')result=await unregisterPushDevice(user,body);
        else throw new HttpError(404,'Not found');
      }
    }
    res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(result));
  }catch(error){
    res.statusCode=error.status||500;res.setHeader('Content-Type','application/json; charset=utf-8');
    res.end(JSON.stringify({error:error.status?error.message:'حدث خطأ في الخادم / Server error'}));
  }
}
