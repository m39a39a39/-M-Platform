// The only homepage model. An empty sections array means an intentionally empty page.
export const STORE_OPTIONS={showSearch:'البحث',showCategories:'فلاتر التصنيفات',showCountries:'فلاتر الدول',showCart:'السلة',showPrices:'الأسعار',showStock:'المخزون',showLogin:'تسجيل الدخول',showCustomerRegister:'تسجيل عميل',showSupplierRegister:'تسجيل مورد'};
export const defaultOptions=()=>Object.fromEntries(Object.keys(STORE_OPTIONS).map(k=>[k,true]));
export const homeConfig=settings=>({...defaultOptions(),...settings?.storefront?.options});
export const defaultSections=()=>[
 {id:'welcome',type:'hero',title:'منتجات مختارة. فرص أكبر لأعمالك.',titleEn:'Selected products. More possibilities.',subtitle:'اختر منتجاتك وتابع طلبك من التحقق من التوفر حتى التسليم.',subtitleEn:'Choose your products and follow your order from availability to delivery.',button:'استكشف المنتجات',buttonEn:'Explore products',buttonTarget:'products',visible:true,channel:'both',background:'#edf2e9'},
 {id:'catalog',type:'catalog',title:'اكتشف المنتجات',titleEn:'Discover products',subtitle:'نؤكد التوفر قبل طلب الدفع.',subtitleEn:'Availability is confirmed before payment.',visible:true,channel:'both'},
 {id:'request',type:'cta',title:'تبحث عن منتج محدد؟',titleEn:'Looking for something specific?',subtitle:'أرسل المواصفات والكميات المطلوبة.',subtitleEn:'Share your specifications and quantities.',button:'اطلب توريدًا خاصًا',buttonEn:'Request sourcing',buttonTarget:'request',visible:true,channel:'both'},
 {id:'footer',type:'footer',title:'MIG COMPANY',titleEn:'MIG COMPANY',subtitle:'طلب المنتجات ومتابعة التوريد في مكان واحد.',subtitleEn:'Products and sourcing in one place.',visible:true,channel:'both'}
];
export function defaultStore(){return {schemaVersion:2,theme:{name:'M Platform',tagline:'',taglineEn:'',announcement:'',announcementEn:'',color:'#193d43',round:16,logo:''},options:defaultOptions(),sections:defaultSections(),banners:[],pages:[],links:[],collections:[]};}
export function selectSectionProducts(offers,s,collections=[]){
 let rows=offers.filter(p=>p.status==='published'&&!p.deletedAt&&!p.studioArchived);
 const mode=s.productSource||'latest';
 if(mode==='manual')rows=(s.productIds||[]).map(id=>rows.find(p=>p.id===id)).filter(Boolean);
 else if(mode==='category')rows=rows.filter(p=>p.categoryId===s.categoryId);
 else if(mode==='featured')rows=(s.productIds||[]).map(id=>rows.find(p=>p.id===id)).filter(Boolean);
 else if(mode==='collection'){const c=collections.find(c=>c.id===s.collectionId&&c.active);rows=(c?.productIds||[]).map(id=>rows.find(p=>p.id===id)).filter(Boolean);}
 else rows=[...rows].sort((a,b)=>String(b.createdAt||b.updatedAt||'').localeCompare(String(a.createdAt||a.updatedAt||''))||a.id.localeCompare(b.id));
 return rows.slice(0,s.limit||6);
}
export function safeStoreLink(value){return typeof value==='string'&&(!value||/^https:\/\/[^\s<>"'\\]+$/i.test(value)||/^\/(?!\/)[^\s<>"'\\]*$/.test(value)||/^#[\w-]+$/.test(value));}
