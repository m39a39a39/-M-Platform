import {randomUUID} from 'node:crypto';
import {rpc,assert} from '../lib/supabase.mjs';
import {supplyTerms} from './supply-sources.mjs';
import {validateContent,assertProductTaxonomy} from './mutations.mjs';
import {uploadProductImages} from './media.mjs';

const active=p=>p&&!p.blocked_at&&!p.deleted_at;
const rowNumber=value=>{
  const n=Number(value);assert(Number.isInteger(n)&&n>0&&n<=1000000,400,'رقم الصف غير صالح / Invalid row number');return n;
};

export async function bulkSubmitSupplySources(user,body={}){
  assert(user?.role==='supplier'&&active(user),403);
  const items=body.items;
  assert(Array.isArray(items)&&items.length>0&&items.length<=20,400,'دفعة الاستيراد غير صالحة / Invalid import batch');

  const seen=new Set(),normalized=items.map(raw=>{
    assert(raw&&typeof raw==='object'&&!Array.isArray(raw),400);
    const number=rowNumber(raw.rowNumber);assert(!seen.has(number),400,'صف مكرر في الدفعة / Duplicate row in batch');seen.add(number);
    const images=Array.isArray(raw.images)?raw.images:[];
    assert(images.length>0&&images.length<=5,400,'أضف صورة واحدة على الأقل / Add at least one image');
    return {...raw,rowNumber:number,images};
  });

  const uploadedByIndex=new Array(normalized.length),imageErrors=new Array(normalized.length);let nextImage=0;
  const imageWorker=async()=>{
    while(nextImage<normalized.length){
      const index=nextImage++;
      try{uploadedByIndex[index]=await uploadProductImages(user,normalized[index].images);}
      catch(error){imageErrors[index]=error;}
    }
  };
  await Promise.all(Array.from({length:Math.min(4,normalized.length)},imageWorker));
  const now=new Date().toISOString();

  const prepared=await Promise.all(normalized.map(async(item,index)=>{
    try{
      if(imageErrors[index])throw imageErrors[index];
      const terms=supplyTerms({...item,stock:item.stock===''||item.stock===undefined||item.stock===null?'0':item.stock});
      const proposal={
        sku:String(item.sku||'').trim(),
        product:String(item.product||'').trim(),
        specs:String(item.specs||'').trim(),
        images:uploadedByIndex[index]||[],
        categoryId:String(item.categoryId||'').trim(),
        subcategoryId:String(item.subcategoryId||'').trim()
      };
      validateContent('publicOffers',{...proposal,...terms,leadTime:String(terms.leadTime),stock:String(terms.stock)});
      await assertProductTaxonomy({...proposal,country:terms.country},{required:true,activeOnly:true});
      const sourceId=randomUUID();
      return {ok:true,rowNumber:item.rowNumber,sourceId,change:{table:'supply_sources',id:sourceId,version:0,ownerId:user.id,data:{productId:null,proposal,terms,status:'pending',createdAt:now},action:'supply_submit'}};
    }catch(error){
      return {ok:false,rowNumber:item.rowNumber,error:error?.message||'تعذر استيراد المنتج / Could not import product'};
    }
  }));

  const changes=prepared.filter(x=>x.ok).map(x=>x.change);
  if(changes.length)await rpc('commit_changes',{actor:user.id,changes});
  return {results:prepared.map(({change,...result})=>result)};
}
