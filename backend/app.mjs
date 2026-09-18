import {config,HttpError,assert} from './lib/supabase.mjs';
import {identify,authRoute,isNativeClient} from './modules/auth.mjs';
import {snapshot} from './modules/records.mjs';
import {mutate,moderate,saveSettings} from './modules/mutations.mjs';
import {upload,media} from './modules/media.mjs';
import {team} from './modules/team.mjs';
import {listNotifications,markNotificationsRead} from './modules/notifications.mjs';
import {registerPushDevice,unregisterPushDevice} from './modules/push.mjs';
import {publicAppConfig} from './modules/app-config.mjs';

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
    const body=req.method==='POST'?await readBody(req,path==='/api/uploads'?7500000:1800000):{};
    let result;
    if(path.startsWith('/api/auth/')){
      assert(req.method==='POST',405);result=await authRoute(path.split('/').at(-1),req,res,body);
    }else{
      const user=await identify(req,res,path==='/api/state'||path.startsWith('/api/media/')&&req.method==='GET');
      if(path==='/api/state'){assert(req.method==='GET',405);result=await snapshot(user);}
      else if(path.startsWith('/api/media/')){assert(req.method==='GET',405);await media(user,path.split('/').at(-1),res);return;}
      else if(path==='/api/notifications'){
        assert(user,401);assert(req.method==='GET',405);result=await listNotifications(user);
      }else{
        assert(req.method==='POST',405);assert(user,401);
        if(path==='/api/mutations')result=await mutate(user,body);
        else if(path==='/api/moderation')result=await moderate(user,body);
        else if(path==='/api/settings')result=await saveSettings(user,body);
        else if(path==='/api/team')result=await team(user,body);
        else if(path==='/api/uploads')result=await upload(user,body);
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
