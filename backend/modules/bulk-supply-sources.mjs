import {one,rpc,assert} from '../lib/supabase.mjs';
import {can} from './auth.mjs';
import {open} from './records.mjs';
import {supplyTerms} from './supply-sources.mjs';
import {validateContent,assertProductTaxonomy} from './mutations.mjs';

// One batch is atomic; the UI sends larger selections in acknowledged batches.
export async function bulkSupplySources(user,body={}){
  assert(user?.role==='admin'&&can(user,'offers.edit'),403);
  const items=body.items;
  assert(Array.isArray(items)&&items.length>0&&items.length<=20,400,'اختر من 1 إلى 20 عرضًا في الدفعة');
  const seen=new Set(),changes=[],now=new Date().toISOString();
  for(const item of items){
    assert(item&&typeof item.id==='string'&&/^[A-Za-z0-9-]{1,80}$/.test(item.id)&&!seen.has(item.id),400,'عرض مكرر أو غير صالح');seen.add(item.id);
    const row=await one('supply_sources',item.id);
    assert(open(row),404,'عرض التوريد غير متاح');
    assert(Number.isInteger(item.version)&&row.version===item.version,409,'تغيّر أحد عروض التوريد؛ حدّث القائمة قبل إعادة المحاولة');
    const data=structuredClone(row.data);
    if(item.delete===true){
      assert(can(user,'trash'),403);
      // Keep existing order snapshots and product records intact.
      data.deletedAt=now;data.status='rejected';
    }else{
      const patch=item.patch;
      assert(patch&&typeof patch==='object'&&!Array.isArray(patch)&&Object.keys(patch).length,400,'لا توجد تغييرات');
      assert(Object.keys(patch).every(k=>['terms','proposal'].includes(k)),400,'حقل غير قابل للتعديل');
      if(patch.terms){
        assert(typeof patch.terms==='object'&&!Array.isArray(patch.terms)&&Object.keys(patch.terms).every(k=>['unitPrice','currency','moq','stock','leadTime','country'].includes(k)),400);
        data.terms=supplyTerms({...data.terms,...patch.terms});
      }
      if(patch.proposal){
        assert(!data.productId&&data.proposal,400,'يُعدّل اسم المنتج المنشور من الكتالوج');
        assert(typeof patch.proposal==='object'&&!Array.isArray(patch.proposal)&&Object.keys(patch.proposal).every(k=>['product','specs','sku','categoryId','subcategoryId'].includes(k)),400);
        data.proposal={...data.proposal,...patch.proposal};
      }
      if(data.proposal&&!data.productId){
        validateContent('publicOffers',{...data.proposal,...data.terms,stock:String(data.terms.stock),leadTime:String(data.terms.leadTime)});
        await assertProductTaxonomy({...data.proposal,country:data.terms.country},{required:true,activeOnly:true});
      }
      // Changed commercial terms require a new review, like supplier resubmission.
      data.status='pending';data.reviewNote='';
    }
    data.updatedAt=now;
    changes.push({table:'supply_sources',id:row.id,version:row.version,ownerId:row.owner_id,data,action:item.delete===true?'supply_bulk_delete':'supply_bulk_edit'});
  }
  await rpc('commit_changes',{actor:user.id,changes});
  return {ok:true,count:changes.length};
}
