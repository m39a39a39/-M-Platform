export const THEME_PAGES={home:'الصفحة الرئيسية',category:'صفحة التصنيف',product:'صفحة المنتج',search:'نتائج البحث'};
export const PRODUCT_BLOCKS={productCategories:'التصنيفات الفرعية',breadcrumb:'مسار التصفح',gallery:'صور المنتج',productInfo:'معلومات المنتج والشراء',productDetails:'التفاصيل والمواصفات',related:'منتجات مشابهة',recommended:'قد يعجبك أيضًا'};
export function ensureThemePages(input){
 const store=structuredClone(input);store.sections??=[];
 const pageOf=s=>['header','footer'].includes(s.type)?'global':s.page||'home';
 for(const s of store.sections)s.page=pageOf(s);
 const has=(page,type)=>store.sections.some(s=>s.page===page&&s.type===type);
 const add=(page,type,title,extra={})=>{
  if(has(page,type))return;
  store.sections.push({id:`${page}-${type}`,page,type,title,visible:true,channel:'both',padding:0,gap:16,titleSize:24,...extra});
 };
 if(!has('global','header'))store.sections.push({id:'shared-header',type:'header',page:'global',title:'Header',visible:true,channel:'both'});
 add('category','categoryNav','التصنيفات الفرعية');add('category','catalog','المنتجات');
 const productPageExists=store.sections.some(s=>s.page==='product');
 const coreProductTypes=['productCategories','breadcrumb','gallery','productInfo','productDetails'];
 for(const type of coreProductTypes)add('product',type,PRODUCT_BLOCKS[type],{titleEn:'',limit:6});
 if(!productPageExists){
  for(const type of ['related','recommended'])add('product',type,PRODUCT_BLOCKS[type],{titleEn:{related:'Similar products',recommended:'You may also like'}[type],limit:6});
 }
 add('search','catalog','نتائج البحث');
 store.themePagesInitialized=true;
 return store;
}
export const sectionsForPage=(store,page='home')=>(store?.sections||[]).filter(s=>!['header','footer'].includes(s.type)&&(s.page||'home')===page);
export function bannerHref(b){const kind=b.targetType||'link',id=encodeURIComponent(b.targetId||'');return kind==='product'?`/?product=${id}`:kind==='category'?`/?category=${id}`:kind==='page'?`/?page=${id}`:b.href||'';}
