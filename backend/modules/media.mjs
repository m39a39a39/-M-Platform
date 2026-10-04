import {randomUUID} from 'node:crypto';
import {db,one,config,assert} from '../lib/supabase.mjs';
import {snapshot} from './records.mjs';
import {storeImages} from './studio.mjs';
import {can} from './auth.mjs';
import yesidoCatalog from '../data/yesido-catalog.mjs';

const inIds=ids=>ids.map(x=>`"${String(x).replaceAll('"','')}"`).join(',');
async function publishedPublicImage(src){
  const offers=await db('public_offers',`data->images=cs.${encodeURIComponent(JSON.stringify([src]))}&data->>status=eq.published&data->>deletedAt=is.null&select=owner_id&limit=10`);
  if(offers.some(o=>!o.owner_id))return true;
  const ownerIds=[...new Set(offers.map(o=>o.owner_id).filter(Boolean))];
  if(!ownerIds.length)return false;
  const owners=await db('profiles',`id=in.(${inIds(ownerIds)})&blocked_at=is.null&deleted_at=is.null&select=id&limit=10`);
  return owners.length>0;
}
export function decodeImage(source){
  const m=typeof source==='string'&&source.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  assert(m,400,'صيغة الصورة غير مدعومة / Unsupported image');
  const bytes=Buffer.from(m[2],'base64');assert(bytes.length>12&&bytes.length<=5242880,413,'الحد الأقصى للصورة بعد الضغط 5 MB / Image exceeds 5 MB after compression');
  const mime=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
  assert(mime===m[1],400,'محتوى الصورة غير صالح / Invalid image content');return {bytes,mime};
}
export function decodePaymentReceipt(source){
  const m=typeof source==='string'&&source.match(/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/);
  assert(m,400,'صيغة الإيصال غير مدعومة / Unsupported receipt format');
  const bytes=Buffer.from(m[2],'base64');assert(bytes.length>12&&bytes.length<=3145728,413,'الحد الأقصى للإيصال 3 MB / Receipt exceeds 3 MB');
  let mime=null;
  if(bytes.subarray(0,5).toString('ascii')==='%PDF-')mime='application/pdf';
  else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';
  else if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';
  else if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')mime='image/webp';
  assert(mime===m[1],400,'محتوى الإيصال غير صالح / Invalid receipt content');
  return {bytes,mime};
}
async function storeMedia(user,{bytes,mime},errorMessage){
  const c=config(),id=randomUUID(),path=`${user.id}/${id}`;
  const response=await fetch(`${c.url}/storage/v1/object/m-private/${path}`,{method:'POST',headers:{apikey:c.service,Authorization:`Bearer ${c.service}`,'Content-Type':mime},body:bytes,signal:AbortSignal.timeout(15000)});
  assert(response.ok,502,errorMessage);
  await db('media','',{method:'POST',body:{id,owner_id:user.id,path,mime}});
  return {src:`/api/media/${id}`,mime};
}
export async function upload(user,{source}){return storeMedia(user,decodeImage(source),'تعذر رفع الصورة / Upload failed');}
export async function uploadImageBatch(user,sources){
  assert(Array.isArray(sources)&&sources.length<=100,400,'دفعة الصور غير صالحة / Invalid image batch');
  if(!sources.length)return [];
  const c=config(),rows=sources.map(source=>{
    const {bytes,mime}=decodeImage(source),id=randomUUID(),path=`${user.id}/${id}`;
    return {id,path,mime,bytes};
  });
  let next=0;
  const worker=async()=>{
    while(next<rows.length){
      const index=next++,row=rows[index];
      const response=await fetch(`${c.url}/storage/v1/object/m-private/${row.path}`,{method:'POST',headers:{apikey:c.service,Authorization:`Bearer ${c.service}`,'Content-Type':row.mime},body:row.bytes,signal:AbortSignal.timeout(15000)});
      assert(response.ok,502,'تعذر رفع الصورة / Upload failed');
    }
  };
  await Promise.all(Array.from({length:Math.min(8,rows.length)},worker));
  await db('media','',{method:'POST',body:rows.map(({id,path,mime})=>({id,owner_id:user.id,path,mime})),headers:{Prefer:'return=minimal'}});
  return rows.map(row=>`/api/media/${row.id}`);
}
const yesidoBySku=new Map();
for(const row of yesidoCatalog){
  const key=String(row?.sku||'').trim().toUpperCase();
  if(!key)continue;
  if(!yesidoBySku.has(key))yesidoBySku.set(key,[]);
  yesidoBySku.get(key).push(row);
}
function detectedImage(bytes){
  const mime=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':
    bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':
    bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
  assert(mime,400,'محتوى الصورة غير صالح / Invalid image content');
  return {bytes,mime};
}
async function fetchImageBytes(url){
  const run=async target=>{
    const response=await fetch(target,{headers:{'user-agent':'Mozilla/5.0 MPlatformImporter/1.0','accept':'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'},signal:AbortSignal.timeout(20000)});
    assert(response.ok,502,'تعذر تحميل صورة المنتج / Could not download product image');
    const len=Number(response.headers.get('content-length')||0);
    assert(!len||len<=8*1024*1024,413,'صورة المنتج كبيرة جدًا / Product image is too large');
    return Buffer.from(await response.arrayBuffer());
  };
  let bytes=await run(url);
  if(bytes.length>5242880){
    const u=new URL(url);
    u.searchParams.set('x-oss-process','image/resize,m_lfit,w_1600/quality,Q_95');
    bytes=await run(u.href);
  }
  assert(bytes.length>12&&bytes.length<=5242880,413,'الحد الأقصى للصورة 5 MB / Image exceeds 5 MB');
  return detectedImage(bytes);
}
async function yesidoImages(marker){
  const m=String(marker||'').match(/^yesido:([A-Za-z0-9._-]{1,80})$/i);
  assert(m,400,'مرجع صورة Yesido غير صالح / Invalid Yesido image reference');
  const sku=m[1].toUpperCase(),matches=yesidoBySku.get(sku)||[];
  assert(matches.length===1,409,'تعذر مطابقة منتج Yesido بشكل فريد / Yesido product match is not unique');
  const pageUrl=matches[0].url;
  const response=await fetch(pageUrl,{headers:{'user-agent':'Mozilla/5.0 MPlatformImporter/1.0','accept-language':'en-US,en;q=0.9'},signal:AbortSignal.timeout(15000)});
  assert(response.ok,502,'تعذر فتح صفحة منتج Yesido / Could not open Yesido product page');
  const html=(await response.text()).replaceAll('\\/','/');
  const h1Index=Math.max(0,html.search(/<h1\b/i));
  const relatedOffset=html.slice(h1Index).search(/Related Products/i);
  const endIndex=relatedOffset>0?h1Index+relatedOffset:Math.min(html.length,h1Index+600000);
  const section=html.slice(h1Index,endIndex),urls=[];
  for(const match of section.matchAll(/(?:https?:)?\/\/icdn\.tradew\.com\/file\/[^"'<>\s\\]+/gi)){
    let raw=match[0];if(raw.startsWith('//'))raw='https:'+raw;
    try{
      const u=new URL(raw);u.search='';
      if(!/\.(?:jpe?g|png|webp)$/i.test(u.pathname))continue;
      const clean=u.href;
      if(!urls.includes(clean))urls.push(clean);
    }catch{}
    if(urls.length>=5)break;
  }
  assert(urls.length,502,'لم يتم العثور على صور المنتج في Yesido / No Yesido product images found');
  return Promise.all(urls.slice(0,5).map(fetchImageBytes));
}
async function storePreparedImageBatch(user,prepared){
  assert(Array.isArray(prepared)&&prepared.length>0&&prepared.length<=5,400,'صور المنتج غير صالحة / Invalid product images');
  const c=config(),rows=prepared.map(({bytes,mime})=>{const id=randomUUID(),path=`${user.id}/${id}`;return {id,path,mime,bytes};});
  await Promise.all(rows.map(async row=>{
    const response=await fetch(`${c.url}/storage/v1/object/m-private/${row.path}`,{method:'POST',headers:{apikey:c.service,Authorization:`Bearer ${c.service}`,'Content-Type':row.mime},body:row.bytes,signal:AbortSignal.timeout(20000)});
    assert(response.ok,502,'تعذر رفع الصورة / Upload failed');
  }));
  await db('media','',{method:'POST',body:rows.map(({id,path,mime})=>({id,owner_id:user.id,path,mime})),headers:{Prefer:'return=minimal'}});
  return rows.map(row=>`/api/media/${row.id}`);
}
export async function uploadProductImages(user,sources){
  assert(Array.isArray(sources)&&sources.length>0&&sources.length<=5,400,'صور المنتج غير صالحة / Invalid product images');
  const prepared=[];
  for(const source of sources){
    if(/^yesido:/i.test(String(source||''))){
      prepared.push(...await yesidoImages(source));
    }else prepared.push(decodeImage(source));
    if(prepared.length>=5)break;
  }
  return storePreparedImageBatch(user,prepared.slice(0,5));
}

export async function uploadPaymentReceipt(user,source){return storeMedia(user,decodePaymentReceipt(source),'تعذر رفع إيصال الدفع / Receipt upload failed');}
export async function media(user,id,res,{width=0,quality=78}={}){
  assert(/^[a-f0-9-]{36}$/.test(id),404);const m=await one('media',id);assert(m,404);
  const src=`/api/media/${id}`;
  let publicImage=false,permitted=user?.id===m.owner_id;
  if(!permitted){
    publicImage=await publishedPublicImage(src);
    permitted=publicImage;
  }
  if(!permitted){
    const s=await snapshot(user);
    permitted=s.settings.logo===src||storeImages(s.settings.storefront).includes(src)||(user?.role==='admin'&&storeImages(s.settings.studioDraft).includes(src))||['requests','quotes','publicOffers'].some(k=>s[k].some(r=>r.images?.includes(src)))||
      (user?.role==='admin'&&(s.supplySources||[]).some(r=>r.proposal?.images?.includes(src)))||
      (user?.role==='admin'&&[...(s.requests||[]),...(s.interests||[])].some(r=>r.paymentReceipt?.src===src));
  }
  assert(permitted,404);
  const c=config(),w=Math.max(0,Math.min(2500,Number(width)||0)),q=Math.max(20,Math.min(100,Number(quality)||78));
  const storagePath=w
    ? `${c.url}/storage/v1/render/image/authenticated/m-private/${m.path}?width=${Math.round(w)}&quality=${Math.round(q)}&resize=contain`
    : `${c.url}/storage/v1/object/authenticated/m-private/${m.path}`;
  let r=await fetch(storagePath,{headers:{apikey:c.service,Authorization:`Bearer ${c.service}`,Accept:'image/avif,image/webp,image/*,*/*;q=0.8'},signal:AbortSignal.timeout(15000)});
  if(w&&!r.ok)r=await fetch(`${c.url}/storage/v1/object/authenticated/m-private/${m.path}`,{headers:{apikey:c.service,Authorization:`Bearer ${c.service}`},signal:AbortSignal.timeout(15000)});
  assert(r.ok,502);res.setHeader('Content-Type',r.headers.get('content-type')||m.mime);
  if(m.mime==='application/pdf')res.setHeader('Content-Disposition','inline; filename="payment-receipt.pdf"');
  if(publicImage){
    res.setHeader('Cache-Control','public, max-age=31536000, immutable');
    res.setHeader('CDN-Cache-Control','public, max-age=31536000, stale-while-revalidate=31536000');
  }else res.setHeader('Cache-Control','private, no-store');
  res.end(Buffer.from(await r.arrayBuffer()));
}
