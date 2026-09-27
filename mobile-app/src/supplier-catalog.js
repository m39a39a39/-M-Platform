const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let filters={q:'',category:'',subcategory:'',country:'',page:1},generation=0,lastUser='',cache=new Map(),timer;
export function resetSupplierCatalog(){generation++;clearTimeout(timer);filters={q:'',category:'',subcategory:'',country:'',page:1};cache.clear();lastUser='';}
export async function supplierProduct(id,request){if(cache.has(id))return cache.get(id);const r=await request('/api/v1/supplier-catalog?id='+encodeURIComponent(id),{auth:true});return r.items[0];}
export function mountSupplierCatalog(host,{state,request,language='ar',card,hydrate,sourceButton,fixedCategory=''}){
 const en=language==='en',user=state.user?.id;if(lastUser!==user){resetSupplierCatalog();lastUser=user;}
 if(!host)return;if(fixedCategory&&filters.category!==fixedCategory){filters={q:'',category:fixedCategory,subcategory:'',country:'',page:1};}
 const t=(ar,enText)=>en?enText:ar,settings=state.settings;
 const select=(key,title,rows)=>`<label>${title}<select data-supplier-filter="${key}" aria-label="${title}"><option value="">${t('الكل','All')}</option>${rows.filter(r=>r.active!==false).map(r=>`<option value="${esc(r.id)}" ${filters[key]===r.id?'selected':''}>${esc(r[en?'nameEn':'nameAr']||r.nameAr)}</option>`).join('')}</select></label>`;
 host.innerHTML=`<form class="supplier-catalog-controls"><label>${t('البحث','Search')}<input type="search" data-supplier-filter="q" aria-label="${t('بحث منتجات المتجر','Search store products')}" placeholder="${t('اسم المنتج أو SKU أو رقم المنتج','Product name, SKU or number')}" value="${esc(filters.q)}"></label>${select('category',t('التصنيف الرئيسي','Main category'),settings.categories||[])}${select('subcategory',t('التصنيف الفرعي','Subcategory'),(settings.subcategories||[]).filter(r=>!filters.category||r.parentId===filters.category))}${select('country',t('بلد التوريد','Supply country'),settings.supplyCountries||[])}<button type="button" data-supplier-reset>${t('مسح الفلاتر','Clear filters')}</button></form><div data-supplier-results aria-live="polite"></div>`;
 if(fixedCategory)host.querySelector('[data-supplier-filter=category]').disabled=true;
 const results=host.querySelector('[data-supplier-results]');
 const load=async()=>{
  const token=++generation;results.innerHTML=`<p role="status">${t('جارٍ تحميل المنتجات…','Loading products…')}</p>`;
  try{const data=await request('/api/v1/supplier-catalog?'+new URLSearchParams({...filters,pageSize:20}),{auth:true});if(token!==generation||!host.isConnected)return;cache=new Map(data.items.map(p=>[p.id,p]));results.innerHTML=`<div class="list-stack">${data.items.map(p=>card(p)+sourceButton(p)).join('')||`<p>${t('لا توجد منتجات مطابقة.','No matching products.')}</p>`}</div><nav class="product-pagination"><button type="button" data-supplier-page="${filters.page-1}" ${filters.page===1?'disabled':''}>${t('السابق','Previous')}</button><span>${t('صفحة','Page')} ${filters.page}</span><button type="button" data-supplier-page="${filters.page+1}" ${data.hasMore?'':'disabled'}>${t('التالي','Next')}</button></nav>`;hydrate(host);}catch(error){if(token!==generation||!host.isConnected)return;results.innerHTML=`<p role="alert">${esc(error.message)}</p><button type="button" data-supplier-retry>${t('إعادة المحاولة','Retry')}</button>`;}
 };
 host.querySelector('form').onsubmit=e=>{e.preventDefault();clearTimeout(timer);void load();};
 host.oninput=e=>{if(e.target.dataset.supplierFilter!=='q')return;filters.q=e.target.value;filters.page=1;generation++;clearTimeout(timer);timer=setTimeout(load,250);};
 host.onchange=e=>{const key=e.target.dataset.supplierFilter;if(!key||key==='q')return;clearTimeout(timer);filters[key]=e.target.value;filters.page=1;if(key==='category'){filters.subcategory='';mountSupplierCatalog(host,{state,request,language,card,hydrate,sourceButton,fixedCategory});}else void load();};
 host.onclick=e=>{const b=e.target.closest('[data-supplier-page],[data-supplier-reset],[data-supplier-retry]');if(!b||b.disabled)return;if(b.hasAttribute('data-supplier-reset')){resetSupplierCatalog();lastUser=user;mountSupplierCatalog(host,{state,request,language,card,hydrate,sourceButton,fixedCategory});return;}if(b.dataset.supplierPage)filters.page=Number(b.dataset.supplierPage);clearTimeout(timer);void load();};
 void load();
}
