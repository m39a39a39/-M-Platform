import {db,one,assert} from '../lib/supabase.mjs';
import {active,open,anonymous} from './records.mjs';
const safeText=value=>String(value||'').trim();
const literal=value=>'"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
export function supplierCatalogQuery(params){
 const page=Number(params.get('page')||1),pageSize=Number(params.get('pageSize')||20);
 assert(Number.isInteger(page)&&page>=1&&page<=10000&&Number.isInteger(pageSize)&&pageSize>=1&&pageSize<=60,400,'صفحة غير صالحة / Invalid page');
 const query=new URLSearchParams();query.set('data->>status','eq.published');query.set('data->>deletedAt','is.null');query.set('data->>suspendedAt','is.null');
 query.set('and','(or(data->>studioArchived.is.null,data->>studioArchived.eq.false))');
 for(const [key,column] of [['category','categoryId'],['subcategory','subcategoryId'],['country','country']]){const v=safeText(params.get(key));assert(v.length<=100,400);if(v)query.set('data->>'+column,'eq.'+v);}
 const q=safeText(params.get('q'));assert(q.length<=200,400);
 if(q){const pattern=literal('*'+q.replace(/[\\%_*]/g,'\\$&')+'*');const conditions=['data->>product','data->>sku','data->translation->>titleAr','data->translation->>titleEn'].map(k=>k+'.ilike.'+pattern);if(/^#?\d+$/.test(q))conditions.push('display_no.eq.'+q.replace('#',''));query.set('or','('+conditions.join(',')+')');}
 if(params.get('id')){const id=params.get('id');assert(/^[A-Za-z0-9-]{1,80}$/.test(id),400);query.set('id','eq.'+id);}
 query.set('order','created_at.desc,id.asc');query.set('limit',String(pageSize+1));query.set('offset',String((page-1)*pageSize));return {query:query.toString(),page,pageSize};
}
export async function supplierCatalog(user,params){
 assert(user?.role==='supplier'&&active(user),403);
 const {query,page,pageSize}=supplierCatalogQuery(params),rows=await db('public_offers',query);
 const ownerIds=[...new Set(rows.filter(r=>!r.data.storeOwned).map(r=>r.owner_id).filter(Boolean))];
 const owners=await Promise.all(ownerIds.map(id=>one('profiles',id)));
 const items=rows.slice(0,pageSize).filter(r=>open(r)&&(r.data.storeOwned||owners.some(p=>p?.id===r.owner_id&&active(p)))).map(r=>anonymous(r,'publicOffers',user));
 return {items,page,pageSize,hasMore:rows.length>pageSize};
}
