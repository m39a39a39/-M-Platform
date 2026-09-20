import {rpc,assert} from '../lib/supabase.mjs';

export const INVOICE_COMPANY=Object.freeze({
  nameEn:'GUANGZHOU MIG TRADING CO., LTD.',
  nameZh:'广州米各贸易有限公司',
  address:'Baiyun Poly Jinsha Daduhui 2 Qi, Block 2, Guangzhou, Guangdong, China',
  phone:'+86 185 0177 0037',
  email:'Aljilany6@gmail.com'
});

const profileData=value=>value?.data&&typeof value.data==='object'?value.data:(value||{});
export function invoiceCustomer(value){
  const data=profileData(value);
  return {
    name:String(data.name||'').slice(0,200),
    company:String(data.company||'').slice(0,200),
    email:String(data.email||'').slice(0,254),
    phone:String(data.phone||'').slice(0,100),
    country:String(data.country||'').slice(0,120),
    address:String(data.address||'').slice(0,300)
  };
}
const titleOf=value=>{
  const t=value?.translation||{};
  return String(t.titleEn||t.titleAr||value?.product||value?.sku||'Product').slice(0,500);
};
const finite=value=>{const n=Number(value);return Number.isFinite(n)?n:0;};
const line=(value={})=>{
  const quantity=Math.max(0,finite(value.quantity));
  const unitPrice=Math.max(0,finite(value.unitPrice));
  return {
    sku:String(value.sku||'').slice(0,100),
    description:titleOf(value),
    quantity,
    unitPrice,
    total:Number.isFinite(Number(value.total))?Math.max(0,Number(value.total)):quantity*unitPrice
  };
};
async function allocate(kind){
  const number=await rpc('allocate_invoice_number',{invoice_kind:kind});
  const pattern=kind==='proforma'?/^PI-\d{4}-\d+$/:/^INV-\d{4}-\d+$/;
  assert(typeof number==='string'&&pattern.test(number),502,'تعذر إنشاء رقم الفاتورة / Could not allocate invoice number');
  return number;
}
export function buildInvoiceSnapshot({kind,number,issuedAt,customer,items,sourceCurrency='',orderId='',paidAt=''}) {
  assert(['proforma','final'].includes(kind),500);
  const rows=(Array.isArray(items)?items:[]).map(line).filter(x=>x.quantity>0);
  assert(rows.length>0,409,'لا توجد بنود للفاتورة / Invoice has no line items');
  const total=rows.reduce((sum,x)=>sum+x.total,0);
  return {
    kind,
    number,
    issuedAt,
    ...(kind==='final'?{status:'PAID',paidAt:paidAt||issuedAt}:{}),
    currency:'SAR',
    currencyLabel:'SAR – Saudi Riyal',
    sourceCurrency:String(sourceCurrency||'').toUpperCase().slice(0,8),
    orderId:String(orderId||'').slice(0,100),
    company:{...INVOICE_COMPANY},
    customer:invoiceCustomer(customer),
    items:rows,
    subtotal:total,
    total
  };
}
export async function issueQuoteProforma(customer,requestRow,quoteRow,now=new Date().toISOString()){
  if(requestRow?.data?.proformaInvoice)return requestRow.data.proformaInvoice;
  const request=requestRow?.data||{},quote=quoteRow?.data||{};
  return buildInvoiceSnapshot({
    kind:'proforma',number:await allocate('proforma'),issuedAt:now,customer,
    orderId:requestRow?.id||'',
    sourceCurrency:quote.currency,
    items:[{product:titleOf(request),translation:request.translation,quantity:request.quantity,unitPrice:quote.unitPrice,total:finite(request.quantity)*finite(quote.unitPrice)}]
  });
}
export async function issueInterestProforma(customer,data,orderId='',now=new Date().toISOString()){
  if(data?.proformaInvoice)return data.proformaInvoice;
  const product=data?.offerSnapshot||data||{};
  return buildInvoiceSnapshot({
    kind:'proforma',number:await allocate('proforma'),issuedAt:now,customer,orderId,
    sourceCurrency:data?.currency,
    items:[{...product,quantity:data?.quantity,unitPrice:data?.unitPrice,total:data?.total}]
  });
}
export async function issueCartProforma(customer,data,orderId='',now=new Date().toISOString()){
  if(data?.proformaInvoice)return data.proformaInvoice;
  return buildInvoiceSnapshot({
    kind:'proforma',number:await allocate('proforma'),issuedAt:now,customer,orderId,
    sourceCurrency:data?.currency,
    items:(data?.cartItems||[]).map(item=>({...item,product:titleOf(item)}))
  });
}
function fallbackItems(data={}){
  if(Array.isArray(data.cartItems)&&data.cartItems.length)return data.cartItems;
  const snapshot=data.offerSnapshot||{};
  const quantity=finite(data.quantity)||1;
  const total=finite(data.total)||finite(data.paymentAmount);
  const unitPrice=finite(data.unitPrice)||(quantity?total/quantity:total);
  return [{...snapshot,product:titleOf(data),translation:data.translation||snapshot.translation,quantity,unitPrice,total:total||quantity*unitPrice}];
}
export async function issueFinalInvoice(customer,data,orderId='',now=new Date().toISOString()){
  if(data?.finalInvoice)return data.finalInvoice;
  const number=await allocate('final'),base=data?.proformaInvoice;
  if(base?.items?.length){
    return {
      ...structuredClone(base),
      kind:'final',number,issuedAt:now,status:'PAID',paidAt:now,
      orderId:String(base.orderId||orderId||'').slice(0,100),
      company:{...INVOICE_COMPANY},
      customer:invoiceCustomer(base.customer?.name||base.customer?.company?base.customer:customer),
      currency:'SAR',currencyLabel:'SAR – Saudi Riyal'
    };
  }
  return buildInvoiceSnapshot({
    kind:'final',number,issuedAt:now,paidAt:now,customer,orderId,
    sourceCurrency:data?.paymentCurrency||data?.currency,
    items:fallbackItems(data)
  });
}
