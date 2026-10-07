import {createHash,randomUUID} from 'node:crypto';
import {db,one,config,assert} from '../lib/supabase.mjs';

const AMAYA_IMAGE=/^https:\/\/(?:www\.)?amaya\.com\.cn\/static\/upload\//i;
const LOCAL_IMAGE=/^\/api\/media\/([a-f0-9-]{36})$/i;

const migrationSignature=()=>createHash('sha256').update(String(process.env.MIGRATION_TOKEN||'')+'|amaya-images-v1').digest('hex');

async function fetchImage(url){
  const response=await fetch(url,{
    headers:{
      'user-agent':'Mozilla/5.0 IMSGImporter/1.0',
      'accept':'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'referer':'https://www.amaya.com.cn/'
    },
    signal:AbortSignal.timeout(20000)
  });
  assert(response.ok,502,'تعذر تحميل صورة AMAYA / Could not download AMAYA image');
  const bytes=Buffer.from(await response.arrayBuffer());
  assert(bytes.length>12&&bytes.length<=10*1024*1024,413,'صورة AMAYA كبيرة جدًا / AMAYA image is too large');
  let mime=response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if(!['image/jpeg','image/png','image/webp'].includes(mime)){
    mime=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':
      bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':
      bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
  }
  assert(mime,400,'صيغة صورة AMAYA غير مدعومة / Unsupported AMAYA image');
  return {bytes,mime};
}

async function store(ownerId,{bytes,mime}){
  const c=config(),id=randomUUID(),path=`${ownerId}/${id}`;
  const response=await fetch(`${c.url}/storage/v1/object/m-private/${path}`,{
    method:'POST',
    headers:{apikey:c.service,Authorization:`Bearer ${c.service}`,'Content-Type':mime},
    body:bytes,
    signal:AbortSignal.timeout(20000)
  });
  assert(response.ok,502,'تعذر حفظ صورة AMAYA داخل IMSG / Could not store AMAYA image in IMSG');
  await db('media','',{method:'POST',body:{id,owner_id:ownerId,path,mime},headers:{Prefer:'return=minimal'}});
  return `/api/media/${id}`;
}

export async function migrateAmayaImages(signature){
  const expected=migrationSignature();
  assert(process.env.MIGRATION_TOKEN&&signature===expected,403,'Not allowed');

  const offers=await db('public_offers','select=id,version,data&limit=1000');
  const amaya=(offers||[]).filter(r=>String(r.data?.brand||'').toUpperCase()==='AMAYA'||String(r.data?.importBatch||'').startsWith('amaya-'));
  const localRef=amaya.flatMap(r=>Array.isArray(r.data?.images)?r.data.images:[])
    .map(src=>String(src||'').match(LOCAL_IMAGE)?.[1]).find(Boolean);
  assert(localRef,409,'لا توجد صورة داخلية مرجعية / No internal media reference');
  const media=await one('media',localRef);
  assert(media?.owner_id,409,'تعذر تحديد مالك وسائط IMSG / Could not resolve IMSG media owner');

  let products=0,images=0,failures=[];
  for(const row of amaya){
    const current=Array.isArray(row.data?.images)?row.data.images:[];
    if(!current.some(src=>AMAYA_IMAGE.test(String(src||''))))continue;
    const next=[];
    let changed=false;
    for(const src of current){
      if(!AMAYA_IMAGE.test(String(src||''))){next.push(src);continue;}
      try{
        const stored=await store(media.owner_id,await fetchImage(src));
        next.push(stored);images++;changed=true;
      }catch(error){
        next.push(src);
        failures.push({sku:row.data?.sku||row.id,url:src,error:error?.message||'failed'});
      }
    }
    if(changed){
      const now=new Date().toISOString();
      const data={...row.data,images:next,imageStorage:'internal',imagesMigratedAt:now,updatedAt:now};
      await db('public_offers',`id=eq.${encodeURIComponent(row.id)}&version=eq.${row.version}`,{
        method:'PATCH',
        body:{data,version:Number(row.version)+1,updated_at:now},
        headers:{Prefer:'return=minimal'}
      });
      products++;
    }
  }
  return {ok:true,products,images,failures:failures.slice(0,20),remainingExternal:failures.length};
}
