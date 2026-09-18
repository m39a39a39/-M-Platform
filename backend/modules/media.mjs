import {randomUUID} from 'node:crypto';
import {db,one,config,assert} from '../lib/supabase.mjs';
import {snapshot} from './records.mjs';
import {can} from './auth.mjs';

const inIds=ids=>ids.map(x=>`"${String(x).replaceAll('"','')}"`).join(',');
async function publishedPublicImage(src){
  const offers=await db('public_offers',`data->images=cs.${encodeURIComponent(JSON.stringify([src]))}&data->>status=eq.published&data->>deletedAt=is.null&select=owner_id&limit=10`);
  const ownerIds=[...new Set(offers.map(o=>o.owner_id).filter(Boolean))];
  if(!ownerIds.length)return false;
  const owners=await db('profiles',`id=in.(${inIds(ownerIds)})&blocked_at=is.null&deleted_at=is.null&select=id&limit=10`);
  return owners.length>0;
}
export function decodeImage(source){
  const m=typeof source==='string'&&source.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  assert(m,400,'صيغة الصورة غير مدعومة / Unsupported image');
  const bytes=Buffer.from(m[2],'base64');assert(bytes.length>12&&bytes.length<=1048576,413,'الحد الأقصى للصورة 1 MB / Image exceeds 1 MB');
  const mime=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
  assert(mime===m[1],400,'محتوى الصورة غير صالح / Invalid image content');return {bytes,mime};
}
export async function upload(user,{source}){
  const {bytes,mime}=decodeImage(source),c=config(),id=randomUUID(),path=`${user.id}/${id}`;
  const response=await fetch(`${c.url}/storage/v1/object/m-private/${path}`,{method:'POST',headers:{apikey:c.service,Authorization:`Bearer ${c.service}`,'Content-Type':mime},body:bytes,signal:AbortSignal.timeout(15000)});
  assert(response.ok,502,'تعذر رفع الصورة / Upload failed');
  await db('media','',{method:'POST',body:{id,owner_id:user.id,path,mime}});
  return {src:`/api/media/${id}`};
}
export async function media(user,id,res){
  assert(/^[a-f0-9-]{36}$/.test(id),404);const m=await one('media',id);assert(m,404);
  const src=`/api/media/${id}`;
  let publicImage=false,permitted=user?.id===m.owner_id;
  if(!permitted){
    publicImage=await publishedPublicImage(src);
    permitted=publicImage;
  }
  if(!permitted){
    const s=await snapshot(user);
    permitted=s.settings.logo===src||['requests','quotes','publicOffers'].some(k=>s[k].some(r=>r.images?.includes(src)));
  }
  assert(permitted,404);
  const c=config(),r=await fetch(`${c.url}/storage/v1/object/authenticated/m-private/${m.path}`,{headers:{apikey:c.service,Authorization:`Bearer ${c.service}`},signal:AbortSignal.timeout(15000)});
  assert(r.ok,502);res.setHeader('Content-Type',m.mime);
  if(publicImage){
    res.setHeader('Cache-Control','public, max-age=86400');
    res.setHeader('CDN-Cache-Control','public, max-age=86400, stale-while-revalidate=604800');
  }else res.setHeader('Cache-Control','private, no-store');
  res.end(Buffer.from(await r.arrayBuffer()));
}
