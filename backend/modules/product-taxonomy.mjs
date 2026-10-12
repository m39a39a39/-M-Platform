import {randomUUID} from 'node:crypto';
import {assert} from '../lib/supabase.mjs';
import {can} from './auth.mjs';

export const taxonomyKey=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[\u064B-\u065F\u0670ـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[^\p{L}\p{N}]/gu,'');
const safeName=value=>{assert(typeof value==='string'&&value.trim()&&value.length<=80&&!/[<>@]|https?:|www\./i.test(value),400,'اسم فئة غير صالح / Invalid category name');return value.trim();};
const names=value=>({nameAr:safeName(value?.nameAr),nameEn:safeName(value?.nameEn)});
const matching=(rows,n)=>rows.find(r=>taxonomyKey(r.nameAr)===taxonomyKey(n.nameAr)||taxonomyKey(r.nameEn)===taxonomyKey(n.nameEn));
export function taxonomyReference(data={}){
 const categories=(data.categories||[]).filter(c=>c.active!==false).map(({id,nameAr,nameEn})=>({id,nameAr,nameEn}));
 return {categories,subcategories:(data.subcategories||[]).filter(c=>c.active!==false&&categories.some(p=>p.id===c.parentId)).map(({id,parentId,nameAr,nameEn})=>({id,parentId,nameAr,nameEn}))};
}
// Resolves against fresh settings at save time. The caller commits settings and product atomically.
export function resolveProductTaxonomy(user,data,input){
 assert(input&&typeof input==='object'&&!Array.isArray(input),400,'تصنيف غير صالح / Invalid taxonomy');
 const categories=structuredClone(data.categories||[]),subcategories=structuredClone(data.subcategories||[]);
 let categoryId=String(input.categoryId||''),subcategoryId=String(input.subcategoryId||''),changed=false;
 if(input.newCategory){
  assert(!categoryId,400,'اختر فئة موجودة أو جديدة / Choose an existing or new category');
  const n=names(input.newCategory),existing=matching(categories,n);
  if(existing){assert(existing.active!==false,409,'الفئة موجودة لكنها غير فعالة؛ اختر فئة أخرى / Category exists but is inactive');categoryId=existing.id;}
  else{assert(can(user,'settings'),403,'إنشاء فئة يحتاج صلاحية الإعدادات / Creating categories requires settings permission');assert(categories.length<100,400,'تم الوصول إلى حد الفئات / Category limit reached');categoryId=randomUUID();categories.push({id:categoryId,...n,active:true,order:categories.length});changed=true;}
 }
 assert(categories.some(c=>c.id===categoryId&&c.active!==false),400,'اختر فئة فعالة / Choose an active category');
 if(input.newSubcategory){
  assert(!subcategoryId,400,'اختر فئة فرعية موجودة أو جديدة / Choose an existing or new subcategory');
  const n=names(input.newSubcategory),existing=matching(subcategories.filter(c=>c.parentId===categoryId),n);
  if(existing){assert(existing.active!==false,409,'الفئة الفرعية غير فعالة / Subcategory is inactive');subcategoryId=existing.id;}
  else{assert(can(user,'settings'),403,'إنشاء فئة يحتاج صلاحية الإعدادات / Creating categories requires settings permission');assert(subcategories.length<300,400,'تم الوصول إلى حد الفئات الفرعية / Subcategory limit reached');subcategoryId=randomUUID();subcategories.push({id:subcategoryId,parentId:categoryId,...n,active:true,order:subcategories.length});changed=true;}
 }
 assert(!subcategoryId||subcategories.some(c=>c.id===subcategoryId&&c.parentId===categoryId&&c.active!==false),400,'الفئة الفرعية غير متاحة / Subcategory unavailable');
 return {categoryId,subcategoryId,categories,subcategories,changed};
}
