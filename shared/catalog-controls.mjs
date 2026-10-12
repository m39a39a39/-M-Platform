export const CATALOG_CONTROLS={showProductImage:'صورة المنتج',showOrigin:'بلد المنتج',showMoq:'الحد الأدنى للطلب',showSearch:'شريط البحث',showCategories:'التصنيفات الرئيسية',showSubcategories:'التصنيفات الفرعية',showCountries:'بلد التوريد',showAll:'خيار الكل',showSort:'ترتيب المنتجات',showCount:'عدد النتائج',showReset:'مسح الفلاتر',showPagination:'أزرار الصفحات',showPrices:'الأسعار',showStock:'المخزون',showCart:'إضافة للسلة'};
export const catalogDefaults=()=>({...Object.fromEntries(Object.keys(CATALOG_CONTROLS).map(k=>[k,true])),categoryIds:[],subcategoryIds:[],countryIds:[],pageSize:20,sort:'newest',searchPosition:'before',filterLayout:'top'});
export function catalogConfig(settings){const s=settings?.storefront?.sections?.find(s=>s.type==='catalog')||{};return {...catalogDefaults(),...settings?.storefront?.options,...s.catalog};}
export function selectedTaxonomy(rows,ids){return (ids||[]).map(id=>(rows||[]).find(c=>c.id===id&&c.active!==false)).filter(Boolean);}
export function catalogProducts(offers,filters={},settings={}){
 let rows=offers.filter(p=>p.status==='published'&&!p.deletedAt&&!p.studioArchived);
 if(filters.category)rows=rows.filter(p=>p.categoryId===filters.category);
 if(filters.subcategory)rows=rows.filter(p=>p.subcategoryId===filters.subcategory);
 if(filters.country)rows=rows.filter(p=>p.country===filters.country);
 const q=String(filters.q||'').trim().toLowerCase();if(q)rows=rows.filter(p=>[p.product,p.sku,p.displayNo,p.translation?.titleAr,p.translation?.titleEn,p.keywords,p.tags,p.shortDescription,...[...(settings.categories||[]),...(settings.subcategories||[])].filter(c=>[p.categoryId,p.subcategoryId].includes(c.id)).flatMap(c=>[c.nameAr,c.nameEn])].join(' ').toLowerCase().includes(q));
 const lang=filters.language||'ar',name=p=>p.translation?.[lang==='en'?'titleEn':'titleAr']||p.product||'';
 const rate=code=>{if(String(code||'SAR').toUpperCase()==='SAR')return 1;const r=(settings.currencies||[]).find(r=>r.active!==false&&r.code===String(code).toUpperCase());return Number(r?.rate)>0?Number(r.rate):null;};
 const price=p=>{const r=rate(p.currency),n=Number(p.unitPrice);return r&&Number.isFinite(n)?n/r:null;};
 const priceOrder=(a,b)=>{const x=price(a),y=price(b);if(x===null||y===null){if(x!==null)return -1;if(y!==null)return 1;return String(a.currency).localeCompare(String(b.currency))||(filters.sort==='price-desc'?-1:1)*(Number(a.unitPrice)-Number(b.unitPrice));}return (filters.sort==='price-desc'?-1:1)*(x-y);};
 return [...rows].sort((a,b)=>(filters.sort==='name'?name(a).localeCompare(name(b),lang):['price-asc','price-desc'].includes(filters.sort)?priceOrder(a,b):String(b.createdAt||'').localeCompare(String(a.createdAt||'')))||String(a.id).localeCompare(String(b.id)));

}
export const policyTemplates=()=>[
 ['privacy','سياسة الخصوصية','Privacy policy','البيانات التي نجمعها، أغراض استخدامها، مزودو الخدمة، مدة الاحتفاظ، ووسيلة طلب الوصول أو الحذف.','Data collected, purposes of use, service providers, retention, and how to request access or deletion.'],
 ['terms','الشروط والأحكام','Terms and conditions','هوية المنشأة ووسائل التواصل، أهلية الحساب، آلية تأكيد الطلب والأسعار، مسؤوليات الأطراف، والقانون المنطبق.','Business identity and contact, account eligibility, order and price confirmation, responsibilities, and applicable law.'],
 ['shipping','سياسة الشحن والتوصيل','Shipping and delivery','الدول المخدومة، احتساب الرسوم، مدة التجهيز والتوصيل، التتبع، الجمارك، والتعامل مع التأخير أو التلف.','Destinations, fee calculation, preparation and delivery times, tracking, customs, delays, and damage.'],
 ['returns','سياسة الاسترجاع والاسترداد','Returns and refunds','شروط ومدد الإرجاع، الاستثناءات، تكاليف الإرجاع، طريقة طلب الاسترداد، ومدة معالجة المبالغ.','Return conditions and deadlines, exceptions, return costs, refund requests, and processing times.'],
 ['cancellation','سياسة إلغاء الطلبات','Order cancellation','مراحل قبول الإلغاء، الطلبات المخصصة، الرسوم إن وجدت، وآلية استرداد المبلغ.','Eligible cancellation stages, customized orders, any fees, and refund procedure.'],
 ['payments','سياسة الدفع','Payment policy','طرق الدفع والعملات المقبولة، توقيت طلب الدفع، تأكيد الاستلام، والضرائب والرسوم.','Accepted payment methods and currencies, payment timing, receipt confirmation, taxes, and fees.'],
 ['cookies','سياسة ملفات الارتباط','Cookie policy','ملفات الارتباط والتخزين المحلي المستخدمة فعليًا، أغراضها، مدتها، وخيارات إدارتها.','Cookies and local storage actually used, their purposes and duration, and management options.']
].map(([id,title,titleEn,content,contentEn])=>({id:'policy-'+id,title,titleEn,content:'مسودة للمراجعة — أكمل سياسة المتجر المعتمدة قبل الإظهار.\n\n'+content,contentEn:'Draft for review — insert the approved store policy before showing this page.\n\n'+contentEn,active:false,footer:true,policy:true}));

