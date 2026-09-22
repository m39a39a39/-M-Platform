/* Data rules shared by the editor, storefront preview and checks. No storage or UI effects. */
(function(root){
  const copy=x=>JSON.parse(JSON.stringify(x));
  function normalize(data){
    data.collections??=[];
    data.products.forEach(p=>{
      p.description??='';p.shortDescription??='';p.notes??='';p.models??=[];p.stock??=null;p.country??='';p.supplier??='';p.leadDays??=0;
      p.colors??=[];p.sizes??=[];p.specs??=[];p.video??='';p.pricingMode??='fixed';p.tiers??=[];
      p.images??=p.image?[p.image]:[];p.image=p.images[0]||'';
    });
    const ids=new Set(data.products.map(p=>p.id));
    data.collections.forEach(c=>{c.productIds=[...new Set(c.productIds||[])].filter(id=>ids.has(id));c.active??=true;c.description??=''});
    data.sections.forEach(s=>{if(s.type==='products'){s.collectionId??='';s.limit??=6}});
    return data;
  }
  function unitPrice(product,quantity){
    if(product.pricingMode==='rfq'||!Number.isInteger(quantity)||quantity<product.moq)return null;
    let price=Number(product.price);
    for(const tier of [...(product.tiers||[])].sort((a,b)=>a.min-b.min))if(quantity>=tier.min)price=tier.price;
    return price;
  }
  function validatePricing(p){
    if(!Number.isSafeInteger(p.moq)||p.moq<1)throw Error('الحد الأدنى للطلب يجب أن يكون عددًا صحيحًا أكبر من صفر.');
    if(p.pricingMode==='rfq')return;
    if(!Number.isFinite(p.price)||p.price<=0)throw Error('أدخل سعرًا أساسيًا أكبر من صفر.');
    let lastMin=p.moq,lastPrice=p.price;
    for(const tier of [...p.tiers].sort((a,b)=>a.min-b.min)){
      if(!Number.isSafeInteger(tier.min)||tier.min<=lastMin)throw Error('كميات الشرائح يجب أن تكون مختلفة وأكبر من الحد الأدنى للطلب.');
      if(!Number.isFinite(tier.price)||tier.price<=0||tier.price>lastPrice)throw Error('سعر كل شريحة يجب أن يكون موجبًا وألا يزيد عن الشريحة السابقة.');
      lastMin=tier.min;lastPrice=tier.price;
    }
  }
  function sectionProducts(data,s){
    const collection=s.collectionId?data.collections.find(c=>c.id===s.collectionId):null;
    if(s.collectionId&&(!collection||!collection.active))return [];
    const list=collection?collection.productIds.map(id=>data.products.find(p=>p.id===id)).filter(Boolean):data.products;
    return list.filter(p=>p.status==='active').slice(0,Number(s.limit)||6);
  }
  const groups={products:'المنتجات',collections:'مجموعات المنتجات',categories:'التصنيفات',sections:'أقسام الرئيسية',banners:'البنرات',pages:'الصفحات',links:'القوائم',media:'الوسائط'};
  const fields={shortDescription:'وصف مختصر',nameEn:'الاسم الإنجليزي',descriptionEn:'الوصف الإنجليزي',notes:'ملاحظات',technicalSpecs:'المواصفات الفنية',options:'الخيارات',currency:'العملة',supplierId:'المورد',stock:'المخزون',name:'الاسم',title:'العنوان',description:'الوصف',subtitle:'النص الوصفي',price:'السعر الأساسي',moq:'الحد الأدنى',status:'الحالة',category:'التصنيف',sku:'رمز المنتج',image:'الصورة الأساسية',images:'صور المنتج',video:'رابط الفيديو',specs:'المواصفات',colors:'الألوان',sizes:'المقاسات',country:'بلد التوريد',supplier:'المورد',leadDays:'مدة التجهيز',tiers:'شرائح الجملة',pricingMode:'طريقة التسعير',productIds:'المنتجات وترتيبها',collectionId:'مجموعة المنتجات',limit:'عدد المنتجات',visible:'الظهور',active:'التفعيل',channel:'قناة الظهور',button:'نص الزر',content:'المحتوى',target:'وجهة الرابط',parent:'التصنيف الأب',start:'بداية العرض',end:'نهاية العرض',logo:'الشعار',color:'اللون الأساسي',round:'استدارة الإطار',announcement:'الشريط العلوي',tagline:'الوصف المختصر'};
  function differences(before,after){
    const result=[];
    function changedFields(a,b){return [...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>k!=='id'&&JSON.stringify(a[k])!==JSON.stringify(b[k])).map(key=>({key,label:fields[key]||key,before:copy(a[key]??null),after:copy(b[key]??null)}))}
    const theme=changedFields(before.theme,after.theme);if(theme.length)result.push({group:'الهوية',title:'هوية المتجر',kind:'edit',fields:theme});
    for(const [key,label] of Object.entries(groups)){
      const a=before[key]||[],b=after[key]||[];
      for(const row of b){const old=a.find(x=>x.id===row.id);if(!old){result.push({group:label,title:row.name||row.title||'عنصر جديد',kind:'add',fields:[]});continue}const changes=changedFields(old,row);if(changes.length)result.push({group:label,title:row.name||row.title||old.name||old.title,kind:'edit',fields:changes})}
      for(const row of a)if(!b.some(x=>x.id===row.id))result.push({group:label,title:row.name||row.title||'عنصر',kind:'delete',fields:[]});
      const common=new Set(a.filter(x=>b.some(y=>y.id===x.id)).map(x=>x.id));
      if(JSON.stringify(a.filter(x=>common.has(x.id)).map(x=>x.id))!==JSON.stringify(b.filter(x=>common.has(x.id)).map(x=>x.id)))result.push({group:label,title:'ترتيب '+label,kind:'order',fields:[]});
    }
    return result;
  }
  const api={normalize,unitPrice,validatePricing,sectionProducts,differences};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StoreRules=api;
})(typeof window==='undefined'?globalThis:window);
