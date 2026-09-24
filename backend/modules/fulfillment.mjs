import {approvedSource} from './supply-sources.mjs';
import {one,db,rpc,assert} from '../lib/supabase.mjs';
import {can} from './auth.mjs';
import {active,open} from './records.mjs';

// Fulfillment assignment never changes the customer's agreed prices or record ownership.
export async function assignSupplier(user,body={}){
  const table=body.collection;
  assert(['requests','interests'].includes(table),400);
  assert(can(user,table==='requests'?'requests.edit':'offers.edit'),403);
  assert(typeof body.id==='string'&&/^[A-Za-z0-9-]{1,80}$/.test(body.id),400);
  assert(body.assignments||typeof body.supplierId==='string'&&/^[A-Za-z0-9-]{1,80}$/.test(body.supplierId),400);
  const row=await one(table,body.id),supplier=body.supplierId?await one('profiles',body.supplierId):null;
  assert(open(row),404);
  if(body.assignments)assert(table==='requests'&&row.data.orderType==='cart',400,'توزيع الموردين مخصص لمنتجات السلة');
  assert(row.version===body.version,409,'تغيّر الطلب؛ حدّث الصفحة');
  if(!body.assignments)assert(active(supplier)&&supplier.role==='supplier',400,'اختر موردًا فعالًا');
  assert(!row.data.cancelledAt&&!['completed','cancelled'].includes(row.data.status)&&!['completed','cancelled','delivered'].includes(row.data.trackingStatus)&&row.data.orderStage!==8,409,'الطلب مغلق');
  assert(!(table==='interests'&&row.data.cartOrderId),409,'أسند منتجات السلة من الطلب الرئيسي');
  const now=new Date().toISOString(),changes=[];
  const assigned=(record,previous,target=supplier.id)=>({...record.data,assignedSupplierId:target,supplierOrderStatus:'pending_confirmation',supplierOrderNote:'',supplierOrderUpdatedAt:now,updatedAt:now,supplierAssignmentHistory:[...(record.data.supplierAssignmentHistory||[]),{previousSupplierId:previous||null,newSupplierId:target,reassignedAt:now,actorId:user.id}].slice(-100)});
  const push=(t,r,data)=>changes.push({table:t,id:r.id,ownerId:r.owner_id,requestId:r.request_id,offerId:r.offer_id,version:r.version,data,action:'admin_assign_supplier'});
  const data=structuredClone(row.data);
  if(table==='requests'){
    if(data.orderType==='cart'){
      data.supplierIds=[];delete data.assignedSupplierId;
      if(data.orderStage===0)data.cartItems=data.cartItems.map(l=>({...l,availabilityConfirmed:false}));
      const children=await db('interests',`data->>cartOrderId=eq.${encodeURIComponent(row.id)}`);
      assert(children.length>0&&children.length===(data.cartItems?.length||data.cartItemCount),409,'منتجات الطلب غير متطابقة');
      if(body.assignments)assert(Array.isArray(body.assignments)&&body.assignments.length===children.length&&new Set(body.assignments.map(x=>x?.interestId)).size===children.length,400,'حدد موردًا لكل منتج');
      for(const child of children){
        assert(open(child)&&!['completed','cancelled'].includes(child.data.status),409,'يوجد منتج مغلق');
        const target=body.assignments?body.assignments.find(x=>x?.interestId===child.id)?.supplierId:body.supplierId;assert(typeof target==='string'&&/^[A-Za-z0-9-]{1,80}$/.test(target),400);
        const source=await approvedSource(child.offer_id,target),terms=source.data.terms;
        assert(Number(child.data.quantity)>=terms.moq&&Number(child.data.quantity)<=terms.stock,409,'كمية الطلب خارج حدود المورد المعتمد');
        const next=assigned(child,child.data.assignedSupplierId,target);next.supplyTerms=terms;next.supplySourceId=source.id;next.requiresAssignment=true;push('interests',child,next);
      }
    }else if(data.selectedQuoteId){
      const quote=await one('quotes',data.selectedQuoteId);assert(open(quote)&&quote.request_id===row.id,409,'العرض المختار غير متاح');
      const alternatives=await db('quotes',`request_id=eq.${encodeURIComponent(row.id)}&owner_id=eq.${supplier.id}&data->>status=eq.published&data->>deletedAt=is.null`);
      const replacement=alternatives.find(q=>['unitPrice','currency','moq','leadTime','sampleCost'].every(k=>String(q.data[k]??'')===String(quote.data[k]??'')));
      assert(replacement,409,'يلزم عرض معتمد من المورد المختار بنفس شروط العميل؛ استخدم مسار العرض البديل عند اختلاف الشروط');
      data.selectedQuoteId=replacement.id;push('quotes',replacement,assigned(replacement,replacement.owner_id));
    }
    if(data.orderType!=='cart')data.supplierIds=[supplier.id];
  }
  if(table==='interests'){const source=await approvedSource(row.offer_id,supplier.id);assert(Number(data.quantity)>=source.data.terms.moq&&Number(data.quantity)<=source.data.terms.stock,409,'تحقق من حدود كمية المورد');data.supplyTerms=source.data.terms;data.supplySourceId=source.id;data.requiresAssignment=true;}
  const prior=row.data.assignedSupplierId||row.data.supplierIds?.[0];
  const next={...(data.orderType==='cart'?{...data,updatedAt:now}:assigned({...row,data},prior)),orderAudit:[...(data.orderAudit||[]),{at:now,actorId:user.id,action:'assign_supplier',changes:[{key:'assignedSupplierId',before:row.data.assignedSupplierId||row.data.supplierIds||null,after:body.assignments||supplier.id}]}]};
  push(table,row,next);await rpc('commit_changes',{actor:user.id,changes});return {ok:true};
}
