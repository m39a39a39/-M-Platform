import {config,HttpError,assert,db} from './lib/supabase.mjs';
import {identify,authRoute,can} from './modules/auth.mjs';
import {snapshot} from './modules/records.mjs';
import {mutate,moderate,saveSettings} from './modules/mutations.mjs';
import {upload,media} from './modules/media.mjs';
import {team} from './modules/team.mjs';
export async function readBody(req){
  const size=Number(req.headers['content-length']||0);assert(size<=1800000,413);
  if(req.body!==undefined){const data=typeof req.body==='string'?JSON.parse(req.body):req.body;assert(Buffer.byteLength(JSON.stringify(data))<=1800000,413);return data;}
  let text='';for await(const chunk of req){text+=chunk;assert(Buffer.byteLength(text)<=1800000,413);}
  try{return text?JSON.parse(text):{};}catch{throw new HttpError(400,'Invalid JSON');}
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  try{
    const url=new URL(req.url,'http://localhost'),path=url.searchParams.has('route')?'/api/'+url.searchParams.get('route'):url.pathname;
    if(path==='/api/health'){
      assert(req.method==='GET',405);config();res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,configured:true}));return;
    }
    const c=config();
    assert(['GET','POST'].includes(req.method),405);
    if(req.method==='POST'){
      // Browser writes must originate from the configured site. Native clients
      // may use a verified Supabase Bearer token without a browser Origin.
      const bearer=/^Bearer /.test(req.headers.authorization||'');
      assert(req.headers.origin===c.origin||bearer&&!req.headers.origin,403,'مصدر الطلب غير مسموح / Invalid origin');
      assert((req.headers['content-type']||'').includes('application/json'),415);
    }
    const body=req.method==='POST'?await readBody(req):{};
    let result;
    if(path.startsWith('/api/auth/')){
      assert(req.method==='POST',405);result=await authRoute(path.split('/').at(-1),req,res,body);
    }else{
      const user=await identify(req,res,path==='/api/state'||path.startsWith('/api/media/')&&req.method==='GET');
      if(path==='/api/state'){assert(req.method==='GET',405);result=await snapshot(user);}
      else if(path.startsWith('/api/media/')){assert(req.method==='GET',405);await media(user,path.split('/').at(-1),res);return;}
      else if(path==='/api/notifications'){
        assert(user,401);assert(req.method==='GET',405);
        result=await db('notifications',`user_id=eq.${user.id}&order=created_at.desc&limit=50`);
      }else{
        assert(req.method==='POST',405);assert(user,401);
        if(path==='/api/mutations')result=await mutate(user,body);
        else if(path==='/api/moderation')result=await moderate(user,body);
        else if(path==='/api/settings')result=await saveSettings(user,body);
        else if(path==='/api/team')result=await team(user,body);
        else if(path==='/api/uploads')result=await upload(user,body);
        else throw new HttpError(404,'Not found');
      }
    }
    res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(result));
  }catch(error){
    res.statusCode=error.status||500;res.setHeader('Content-Type','application/json; charset=utf-8');
    res.end(JSON.stringify({error:error.status?error.message:'حدث خطأ في الخادم / Server error'}));
  }
}
