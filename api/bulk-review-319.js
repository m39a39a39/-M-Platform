import {db,one} from '../backend/lib/supabase.mjs';
import {reviewSupplySource} from '../backend/modules/supply-sources.mjs';

const ADMIN_ID='e729ac18-9ee3-4a8b-bcc0-fcb0e308f3e9';
const SUPPLIER_ID='9cbb161d-5203-4f2e-a15a-33df270884e7';

const clean=v=>String(v??'').trim();
async function translate(text){
  const value=clean(text); if(!value)return '';
  const u=new URL('https://translate.googleapis.com/translate_a/single');
  u.searchParams.set('client','gtx');u.searchParams.set('sl','en');u.searchParams.set('tl','ar');u.searchParams.set('dt','t');u.searchParams.set('q',value);
  const r=await fetch(u,{headers:{'user-agent':'Mozilla/5.0'},signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw new Error('translate_http_'+r.status);
  const data=await r.json();
  const out=Array.isArray(data?.[0])?data[0].map(x=>Array.isArray(x)?x[0]||'':'').join(''):'';
  if(!clean(out))throw new Error('translate_empty');
  return clean(out);
}
async function mapPool(items,limit,fn){
  const out=new Array(items.length);let next=0;
  async function worker(){while(next<items.length){const i=next++;out[i]=await fn(items[i],i);}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return out;
}
export default async function handler(req,res){
  try{
    const dry=String(req.query?.dry||'0')==='1';
    const limit=Math.max(1,Math.min(10,Number(req.query?.limit||5)||5));
    const rows=await db('supply_sources',
      `owner_id=eq.${SUPPLIER_ID}&data->>status=eq.pending&order=created_at.asc&limit=${limit}`);
    const admin=await one('profiles',ADMIN_ID);
    const translated=await mapPool(rows,4,async row=>{
      const p=row.data?.proposal||{},t=row.data?.terms||{};
      const [titleAr,descriptionAr]=await Promise.all([translate(p.product),translate(p.specs)]);
      const salePrice=Math.round((Number(t.unitPrice)/1.6)*100)/100;
      return {row,titleAr,descriptionAr,salePrice};
    });
    if(dry){
      res.status(200).json({ok:true,dry:true,items:translated.map(x=>({
        id:x.row.id,sku:x.row.data?.proposal?.sku,titleEn:x.row.data?.proposal?.product,titleAr:x.titleAr,
        descriptionAr:x.descriptionAr.slice(0,1200),sourcePrice:x.row.data?.terms?.unitPrice,salePrice:x.salePrice
      }))});return;
    }
    const results=[];
    for(const x of translated){
      const p=x.row.data?.proposal||{};
      try{
        const result=await reviewSupplySource(admin,{
          id:x.row.id,version:x.row.version,action:'approve',redactionConfirmed:true,
          translation:{titleAr:x.titleAr,titleEn:clean(p.product),descriptionAr:x.descriptionAr,descriptionEn:clean(p.specs)},
          salePrice:x.salePrice,currency:'SAR'
        });
        results.push({id:x.row.id,sku:p.sku,ok:true,productId:result.productId,salePrice:x.salePrice});
      }catch(error){
        results.push({id:x.row.id,sku:p.sku,ok:false,error:String(error?.message||error)});
      }
    }
    res.status(200).json({ok:true,dry:false,processed:results.length,success:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,results});
  }catch(error){
    res.status(500).json({ok:false,error:String(error?.message||error)});
  }
}