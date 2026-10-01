export const THEME_PAGES={home:'الصفحة الرئيسية',category:'صفحة التصنيف',product:'صفحة المنتج',search:'نتائج البحث'};
export const PRODUCT_BLOCKS={productCategories:'التصنيفات الفرعية',breadcrumb:'مسار التصفح',gallery:'صور المنتج',productInfo:'معلومات المنتج والشراء',productDetails:'التفاصيل والمواصفات',related:'منتجات مشابهة',recommended:'قد يعجبك أيضًا'};
export function ensureThemePages(input){
 const store=structuredClone(input);if(store.themePagesInitialized)return store;
 store.themePagesInitialized=true;store.sections??=[];
 if(!store.sections.some(s=>s.type==='header'))store.sections.push({id:'shared-header',type:'header',page:'global',title:'Header',visible:true,channel:'both'});
 for(const s of store.sections)s.page=['header','footer'].includes(s.type)?'global':s.page||'home';
 const add=(page,type,title,extra={})=>store.sections.push({id:`${page}-${type}`,page,type,title,visible:true,channel:'both',padding:0,gap:16,titleSize:24,...extra});
 add('category','categoryNav','التصنيفات الفرعية');add('category','catalog','المنتجات');
 for(const [type,title] of Object.entries(PRODUCT_BLOCKS))add('product',type,title,{titleEn:{related:'Similar products',recommended:'You may also like'}[type]||'',limit:6});
 add('search','catalog','نتائج البحث');return store;
}
export const sectionsForPage=(store,page='home')=>(store?.sections||[]).filter(s=>!['header','footer'].includes(s.type)&&(s.page||'home')===page);
export function bannerHref(b){const kind=b.targetType||'link',id=encodeURIComponent(b.targetId||'');return kind==='product'?`/?product=${id}`:kind==='category'?`/?category=${id}`:kind==='page'?`/?page=${id}`:b.href||'';}
