import {randomUUID} from 'node:crypto';
import {one,rpc,assert} from '../lib/supabase.mjs';
import {active,open} from './records.mjs';
import {issueCartProforma} from './invoices.mjs';

const MAX_CART_ITEMS=10;
const SUPPORTED_CURRENCIES=new Set(['USD','SAR','AED','CNY','EUR']);

const trackingStart=now=>({
  trackingStatus:'received',
  trackingNote:'',
  trackingUpdatedAt:now,
  trackingHistory:[{at:now,status:'received',note:''}]
});

export async function createCartOrder(user,body={}){
  assert(user?.role==='client',403,'غير مصرح / Unauthorized');
  const items=Array.isArray(body.items)?body.items:[];
  assert(items.length>0&&items.length<=MAX_CART_ITEMS,400,'يمكن إضافة من 1 إلى 10 منتجات في الطلب الواحد / A cart order can contain 1 to 10 products');

  const seen=new Set(),validated=[];
  for(const raw of items){
    const offerId=String(raw?.offerId||'').trim(),quantity=Number(raw?.quantity);
    assert(/^[A-Za-z0-9-]{1,80}$/.test(offerId)&&!seen.has(offerId),400,'تحقق من المنتجات في السلة / Check cart products');
    assert(Number.isInteger(quantity)&&quantity>0&&quantity<=1e9,400,'أدخل كمية صحيحة / Enter a valid quantity');
    seen.add(offerId);

    const offer=await one('public_offers',offerId);
    assert(offer&&open(offer)&&offer.data.status==='published',409,'أحد المنتجات لم يعد متاحًا / A product is no longer available');
    const supplier=await one('profiles',offer.owner_id);
    assert(active(supplier)&&supplier.role==='supplier',409,'أحد الموردين غير متاح حاليًا / A supplier is currently unavailable');
    const d=offer.data||{},moq=Number(d.moq),stock=Number(d.stock),unitPrice=Number(d.unitPrice),currency=String(d.currency||'').toUpperCase();
    assert(Number.isFinite(unitPrice)&&unitPrice>0&&Number.isFinite(moq)&&quantity>=moq,400,'تحقق من الكمية والحد الأدنى للطلب / Check quantity and MOQ');
    if(Number.isFinite(stock)&&stock>0)assert(quantity<=stock,400,'الكمية المطلوبة أكبر من المخزون المتاح / Requested quantity exceeds available stock');
    assert(SUPPORTED_CURRENCIES.has(currency),400,'عملة المنتج غير مدعومة / Unsupported product currency');
    assert(!d.validUntil||String(d.validUntil)>=new Date().toISOString().slice(0,10),409,'انتهت صلاحية أحد المنتجات / A product offer has expired');

    validated.push({offer,quantity,unitPrice,currency,moq,total:quantity*unitPrice});
  }

  const currencies=[...new Set(validated.map(x=>x.currency))];
  assert(currencies.length===1,400,'اجمع في الطلب الواحد منتجات بنفس العملة فقط / A single cart order must use one currency');
  const currency=currencies[0],cartTotal=validated.reduce((sum,x)=>sum+x.total,0);
  assert(Number.isFinite(cartTotal)&&cartTotal>0&&cartTotal<=1e12,400,'إجمالي الطلب غير صالح / Invalid order total');

  const now=new Date().toISOString(),orderId=randomUUID();
  const lines=validated.map((x,index)=>{
    const d=x.offer.data||{},interestId=randomUUID();
    const snapshot={
      sku:String(d.sku||''),
      product:String(d.product||''),
      translation:d.translation||{},
      images:Array.isArray(d.images)?d.images.slice(0,5):[],
      country:String(d.country||''),
      unitPrice:x.unitPrice,
      currency:x.currency,
      moq:x.moq,
      stock:String(d.stock||''),
      categoryId:String(d.categoryId||'')
    };
    return {interestId,offerId:x.offer.id,quantity:x.quantity,unitPrice:x.unitPrice,currency:x.currency,moq:x.moq,total:x.total,snapshot};
  });

  const firstImages=lines.flatMap(x=>x.snapshot.images||[]).slice(0,5);
  const orderData={
    orderType:'cart',
    product:'Product order',
    specs:'Multi-product ready-order cart',
    translation:{
      titleAr:'طلب منتجات',
      titleEn:'Product order',
      descriptionAr:'طلب واحد يحتوي على عدة منتجات جاهزة',
      descriptionEn:'One order containing multiple ready products'
    },
    images:firstImages,
    currency,
    cartTotal,
    cartItemCount:lines.length,
    cartItems:lines.map((line,index)=>({
      line:index+1,
      interestId:line.interestId,
      offerId:line.offerId,
      quantity:line.quantity,
      unitPrice:line.unitPrice,
      currency:line.currency,
      total:line.total,
      ...line.snapshot
    })),
    status:'review',
    createdAt:now,
    updatedAt:now,
    ...trackingStart(now)
  };

  orderData.proformaInvoice=await issueCartProforma(user,orderData,orderId,now);

  const changes=[{
    table:'requests',id:orderId,version:0,ownerId:user.id,data:orderData,action:'cart_order_create'
  },...lines.map((line,index)=>({
    table:'interests',
    id:line.interestId,
    version:0,
    ownerId:user.id,
    offerId:line.offerId,
    data:{
      status:'active',
      createdAt:now,
      updatedAt:now,
      cartOrderId:orderId,
      cartLine:index+1,
      quantity:line.quantity,
      unitPrice:line.unitPrice,
      currency:line.currency,
      moq:line.moq,
      total:line.total,
      offerSnapshot:line.snapshot,
      ...trackingStart(now)
    },
    action:'cart_order_item_create'
  }))];

  await rpc('commit_changes',{actor:user.id,changes});
  const created=await one('requests',orderId);
  return {ok:true,orderId,displayNo:created?.display_no||null,currency,cartTotal,itemCount:lines.length};
}
