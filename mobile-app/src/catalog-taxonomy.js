export const DEFAULT_SUPPLY_COUNTRIES=[
  {id:'China',nameAr:'الصين',nameEn:'China',active:true,order:0},
  {id:'United Arab Emirates',nameAr:'الإمارات',nameEn:'UAE',active:true,order:1}
];
const ordered=rows=>[...rows].sort((a,b)=>(a.order||0)-(b.order||0));
export function categoryRows(settings,{activeOnly=true}={}){
  const rows=Array.isArray(settings?.categories)?settings.categories:[];
  return ordered(rows.filter(x=>!activeOnly||x.active!==false));
}
export function subcategoryRows(settings,{activeOnly=true,parentId=''}={}){
  const rows=Array.isArray(settings?.subcategories)?settings.subcategories:[];
  return ordered(rows.filter(x=>(!activeOnly||x.active!==false)&&(!parentId||x.parentId===parentId)));
}
export function supplyCountryRows(settings,{activeOnly=true}={}){
  const configured=Array.isArray(settings?.supplyCountries)&&settings.supplyCountries.length?settings.supplyCountries:DEFAULT_SUPPLY_COUNTRIES;
  return ordered(configured.filter(x=>!activeOnly||x.active!==false));
}
export function taxonomyLabel(row,lang='ar'){return row?(lang==='ar'?(row.nameAr||row.nameEn):(row.nameEn||row.nameAr))||row.id||'':'';}
export function resolveTaxonomyId(value,rows=[]){
  const n=String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
  if(!n)return '';
  const row=rows.find(x=>[x.id,x.nameAr,x.nameEn].some(v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ')===n));
  return row?.id||'';
}
