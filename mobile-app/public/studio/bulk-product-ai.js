'use strict';
(()=>{
const MAX_ITEMS=400,MAX_FILE=10*1024*1024,MAX_ZIP=250*1024*1024,PER_PAGE=25;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&#39;'}[c]));
const tr=(ar,en)=>document.documentElement.lang==='en'?en:ar;
const api=body=>window.MStudioSession.request('/api/v1/bulk-product-ai',{auth:true,method:'POST',body});
const token=()=>String(typeof liveState!=='undefined'?liveState?.user?.id||'':'');
const state={owner:'',rows:[],busy:false,stop:false,page:0,filter:'all',query:'',notice:'',error:'',selectedCategory:'',loading:false,open:false};
let root=null,database=null,urls=[],redrawTimer=null;
const key=id=>'imsg-bulk-ai-'+id;
const statusName={pending:['بانتظار التحليل','Pending'],analyzing:['قيد التحليل','Analyzing'],ready:['جاهز','Ready'],review:['يحتاج مراجعة','Needs review'],failed:['فشل التحليل','Analysis failed'],saving:['جاري الحفظ','Saving'],save_failed:['فشل الحفظ','Save failed'],saved:['محفوظ كمسودة','Saved draft'],publishing:['جارٍ النشر','Publishing'],publish_failed:['فشل النشر','Publish failed'],published:['منشور في المتجر','Published in store']};
const label=s=>tr(...(statusName[s]||[s,s]));
const fileType=name=>/\.jpe?g$/i.test(name)?'image/jpeg':/\.png$/i.test(name)?'image/png':/\.webp$/i.test(name)?'image/webp':'';
const cleanName=s=>String(s||'').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,' ').trim();
const inStore=()=>typeof liveState!=='undefined'&&Array.isArray(liveState?.publicOffers)?liveState.publicOffers:[];
const categories=()=>typeof liveState!=='undefined'&&Array.isArray(liveState?.settings?.categories)?liveState.settings.categories.filter(x=>x.active!==false):[];
const subcategories=id=>(typeof liveState!=='undefined'?liveState?.settings?.subcategories||[]:[]).filter(x=>x.parentId===id&&x.active!==false);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function dbOpen(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open('imsg-bulk-ai-drafts-v1',1);
  req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('rows'))db.createObjectStore('rows',{keyPath:'id'});};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
function store(mode,work){
 return new Promise((resolve,reject)=>{
  const tx=database.transaction('rows',mode),object=tx.objectStore('rows');
  let result;try{result=work(object);}catch(e){reject(e);return;}
  tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
const put=row=>store('readwrite',object=>object.put({...row,owner:state.owner,updatedAt:Date.now()}));
const remove=id=>store('readwrite',object=>object.delete(id));
async function load(){
 const all=await new Promise((resolve,reject)=>{
  const tx=database.transaction('rows','readonly'),req=tx.objectStore('rows').getAll();
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 state.rows=all.filter(x=>x.owner===state.owner).sort((a,b)=>a.createdAt-b.createdAt);
 let dirty=false;
 for(const row of state.rows)if(['analyzing','saving','publishing'].includes(row.status)){
  row.status=row.status==='analyzing'?'pending':row.status==='publishing'?'publish_failed':'save_failed';
  row.error=tr('توقفت العملية؛ يمكنك إعادة المحاولة دون تكرار المنتج','Interrupted; safely retry without duplicate products');await put(row);dirty=true;
 }
 return dirty;
}
async function update(row,changes){
 Object.assign(row,changes);await put(row);queueDraw();
}
function queueDraw(){
 clearTimeout(redrawTimer);redrawTimer=setTimeout(()=>{
  if(!root?.isConnected)return;
  if(root.contains(document.activeElement)&&/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)){stats();return;}
  draw();
 },300);
}
const count=status=>state.rows.filter(x=>x.status===status).length;
function stats(){
 if(!root?.isConnected)return;
 const el=root.querySelector('[data-bulk-counts]');
 if(el)el.textContent=tr('الإجمالي: ','Total: ')+state.rows.length+' | '+Object.keys(statusName).map(s=>label(s)+': '+count(s)).join(' | ');
 const notice=root.querySelector('[data-bulk-notice]');if(notice)notice.textContent=state.error||state.notice||'';
}
function selectOptions(list,value,empty){
 return '<option value="">'+esc(empty)+'</option>'+list.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===value?'selected':'')+'>'+esc(tr(x.nameAr||x.name||x.id,x.nameEn||x.nameAr||x.name||x.id))+'</option>').join('');
}
function imageTag(row){
 const url=URL.createObjectURL(row.file);urls.push(url);
 return '<button type="button" class="bulk-ai-thumb" data-bulk-preview="'+esc(row.id)+'" title="'+esc(row.fileName)+'"><img src="'+esc(url)+'" alt="'+esc(row.fileName)+'" loading="lazy"></button>';
}
function dupMatch(row){
 if(!row.draft)return '';
 const own=state.rows.find(x=>x.id!==row.id&&x.hash&&x.hash===row.hash);
 const title=cleanName(row.draft.name),sku=cleanName(row.draft.sku);
 const match=inStore().find(p=>p.id!==row.id&&!p.deletedAt&&(sku&&cleanName(p.sku)===sku||title&&title.length>5&&[p.product,p.translation?.titleAr,p.translation?.titleEn].some(n=>cleanName(n)===title)));
 if(own)return tr('⚠ صورة مكررة في الدفعة؛ سيبقى منتجًا مستقلًا','⚠ Same image in batch; remains independent');
 if(match)return tr('⚠ قد يكون موجودًا بالمتجر: ','⚠ Possible existing product: ')+esc(match.translation?.titleAr||match.product||'')+' ('+esc(match.id)+')';
 return '';
}
function existingDuplicate(row){
 const d=row.draft||{},name=cleanName(d.name),en=cleanName(d.nameEn),sku=cleanName(d.sku);
 return inStore().find(p=>p.id!==row.id&&!p.deletedAt&&(sku&&sku===cleanName(p.sku)||
   name&&name.length>5&&[p.product,p.translation?.titleAr,p.translation?.titleEn].some(v=>cleanName(v)===name)||
   en&&en.length>5&&[p.product,p.translation?.titleAr,p.translation?.titleEn].some(v=>cleanName(v)===en)));
}
function duplicateComparison(row){
 const match=existingDuplicate(row);if(!match)return '';
 const image=(match.images||[]).find(src=>/^\/api\/media\/[a-f0-9-]{36}$/.test(src));
 return '<div class="bulk-ai-duplicate-compare"><strong>'+esc(tr('قد يكون هذا المنتج موجودًا بالفعل في المتجر','This product may already exist in the store'))+'</strong>'+
 (image?'<img src="'+esc(image)+'" alt="'+esc(match.product||'existing product')+'" loading="lazy">':'')+
 '<span>'+esc(match.translation?.titleAr||match.product||match.sku||'')+'</span>'+
 '<small>SKU: '+esc(match.sku||'—')+' · ID: '+esc(match.id)+'</small></div>';
}
function rowHtml(row){
 const d=row.draft||{},editable=!['saved','published'].includes(row.status),selected=row.selected!==false;
 return '<tr data-bulk-row="'+esc(row.id)+'"><td><input type="checkbox" data-bulk-select="'+esc(row.id)+'" '+(selected?'checked':'')+' '+(row.status==='published'?'disabled':'')+'></td><td>'+imageTag(row)+'</td>'+
 '<td><input data-bulk-field="name" data-bulk-id="'+esc(row.id)+'" aria-label="الاسم العربي" maxlength="100" value="'+esc(d.name||'')+'" '+(editable?'':'disabled')+'></td>'+
 '<td><input data-bulk-field="nameEn" data-bulk-id="'+esc(row.id)+'" aria-label="الاسم الإنجليزي" maxlength="100" value="'+esc(d.nameEn||'')+'" '+(editable?'':'disabled')+'></td>'+
 '<td><select data-bulk-field="categoryId" data-bulk-id="'+esc(row.id)+'" aria-label="التصنيف الرئيسي" '+(editable?'':'disabled')+'>'+selectOptions(categories(),d.categoryId||'',tr('اختر تصنيفًا','Select category'))+'</select></td>'+
 '<td><select data-bulk-field="subcategoryId" data-bulk-id="'+esc(row.id)+'" aria-label="التصنيف الفرعي" '+(editable?'':'disabled')+'>'+selectOptions(subcategories(d.categoryId),d.subcategoryId||'',tr('بدون','None'))+'</select></td>'+
 '<td><input data-bulk-field="sku" data-bulk-id="'+esc(row.id)+'" maxlength="80" aria-label="الموديل" value="'+esc(d.sku||'')+'" '+(editable?'':'disabled')+'></td>'+
 '<td><span class="bulk-ai-status">'+esc(label(row.status))+'</span>'+(row.error?'<small class="bulk-ai-error">'+esc(row.error)+'</small>':'')+'</td>'+
 '<td><button type="button" data-bulk-action="retry-one" data-bulk-id="'+esc(row.id)+'" '+(state.busy||['saved','published'].includes(row.status)?'disabled':'')+'>'+esc(tr('تحليل','Analyze'))+'</button><button type="button" data-bulk-action="delete-one" data-bulk-id="'+esc(row.id)+'" '+(state.busy?'disabled':'')+'>'+esc(tr('حذف','Remove'))+'</button></td></tr>'+
 '<tr><td colspan="9" class="bulk-ai-expanded"><details><summary>'+esc(tr('تفاصيل المنتج','Product details'))+' · '+esc(row.fileName)+(row.duplicate?'<small> · '+dupMatch(row)+'</small>':'')+'</summary><div class="bulk-ai-details">'+
 [['shortDescription',tr('الوصف المختصر','Short description')],['description',tr('الوصف العربي','Arabic description')],['descriptionEn',tr('English description','English description')],['technicalSpecs',tr('المميزات الواضحة','Visible features')],['options',tr('الخيارات','Options')]].map(([field,title])=>'<label>'+esc(title)+'<textarea data-bulk-field="'+field+'" data-bulk-id="'+esc(row.id)+'" rows="3" '+(editable?'':'disabled')+'>'+esc(d[field]||'')+'</textarea></label>').join('')+
 (dupMatch(row)?'<p class="bulk-ai-warning">'+dupMatch(row)+'</p>':'')+duplicateComparison(row)+'</div></details></td></tr>';
}
function draw(){
 if(!root?.isConnected)return;
 for(const url of urls)URL.revokeObjectURL(url);urls=[];
 const filtered=state.rows.filter(r=>(state.filter==='all'||r.status===state.filter)&&[r.fileName,r.draft?.name,r.draft?.nameEn,r.draft?.sku].join(' ').toLowerCase().includes(state.query.toLowerCase()));
 state.page=Math.max(0,Math.min(state.page,Math.max(0,Math.ceil(filtered.length/PER_PAGE)-1)));
 const rows=filtered.slice(state.page*PER_PAGE,(state.page+1)*PER_PAGE);
 root.innerHTML='<section class="bulk-ai-shell">'+
 '<div class="bulk-ai-intro"><h2>'+esc(tr('إضافة المنتجات الجماعية بالذكاء الاصطناعي','AI bulk product creation'))+'</h2><p>'+esc(tr('كل صورة = منتج مستقل. بعد المراجعة اختر حفظ مسودات أو نشر المنتجات المحددة مباشرة في المتجر. الذكاء الاصطناعي لا ينشر تلقائيًا.','Each image represents one product. After reviewing, either save drafts or explicitly publish selected products to the store. AI never auto-publishes products.'))+'</p></div>'+
 '<div class="bulk-ai-upload" data-bulk-drop><input type="file" id="bulk-ai-files" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple hidden><input type="file" id="bulk-ai-zip" accept=".zip,application/zip" hidden>'+
 '<button type="button" data-bulk-action="choose">'+esc(tr('اختيار الصور','Choose images'))+'</button> <button type="button" data-bulk-action="zip">'+esc(tr('رفع ZIP','Upload ZIP'))+'</button><p>'+esc(tr('اسحب الصور هنا · JPG / PNG / WEBP · بحد 10MB لكل صورة · حتى 400 صورة لكل جهاز','Drag images here · JPG / PNG / WEBP · 10MB each · up to 400 images per device'))+'</p></div>'+
 '<div class="bulk-ai-controls"><button class="primary" type="button" data-bulk-action="analyze" '+(state.busy?'disabled':'')+'>'+esc(tr('بدء التحليل الذكي','Start AI analysis'))+'</button>'+
 '<button type="button" data-bulk-action="retry" '+(state.busy?'disabled':'')+'>'+esc(tr('إعادة تحليل الفاشلة','Retry failed analyses'))+'</button>'+
 '<button type="button" data-bulk-action="save" '+(state.busy?'disabled':'')+'>'+esc(tr('إضافة المنتجات المحددة كمسودات','Save selected as drafts'))+'</button>'+
 (permitted('offers.create')?'<button class="primary" type="button" data-bulk-action="publish" '+(state.busy?'disabled':'')+'>'+esc(tr('نشر المنتجات المحددة مباشرة في المتجر','Publish selected products to store'))+'</button>':'')+
 (state.busy?'<button type="button" data-bulk-action="stop">'+esc(tr('إيقاف بعد المهمة الحالية','Stop after current tasks'))+'</button>':'')+'</div>'+
 '<p data-bulk-counts class="bulk-ai-counts" role="status"></p><p data-bulk-notice role="status" class="bulk-ai-notice"></p>'+
 '<div class="bulk-ai-toolbar"><label>'+esc(tr('بحث','Search'))+' <input type="search" data-bulk-query value="'+esc(state.query)+'"></label><label>'+esc(tr('الحالة','Status'))+' <select data-bulk-filter><option value="all">'+esc(tr('كل الحالات','All statuses'))+'</option>'+Object.keys(statusName).map(s=>'<option value="'+s+'" '+(s===state.filter?'selected':'')+'>'+esc(label(s))+'</option>').join('')+'</select></label>'+
 '<button type="button" data-bulk-action="select-all">'+esc(tr('تحديد الكل','Select all'))+'</button><button type="button" data-bulk-action="select-none">'+esc(tr('إلغاء التحديد','Clear selection'))+'</button>'+
 '<label>'+esc(tr('تغيير تصنيف المحدد','Set selected category'))+' <select data-bulk-category>'+selectOptions(categories(),state.selectedCategory,tr('اختر','Choose'))+'</select></label><button type="button" data-bulk-action="apply-category">'+esc(tr('تطبيق','Apply'))+'</button></div>'+
 '<div class="table-wrap bulk-ai-table"><table><thead><tr>'+[tr('تحديد','Select'),tr('الصورة','Image'),tr('الاسم العربي','Arabic name'),tr('الاسم الإنجليزي','English name'),tr('التصنيف','Category'),tr('الفرعي','Subcategory'),tr('الموديل','Model / SKU'),tr('الحالة','Status'),tr('الإجراء','Action')].map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(rowHtml).join('')+'</tbody></table></div>'+
 '<div class="bulk-ai-pagination"><button type="button" data-bulk-action="prev" '+(state.page?'':'disabled')+'>'+esc(tr('السابق','Previous'))+'</button> '+(state.page+1)+' / '+Math.max(1,Math.ceil(filtered.length/PER_PAGE))+' <button type="button" data-bulk-action="next" '+((state.page+1)*PER_PAGE<filtered.length?'':'disabled')+'>'+esc(tr('التالي','Next'))+'</button></div>'+
 '<p class="bulk-ai-foot">'+esc(tr('البيانات محفوظة محليًا في IndexedDB؛ لن تظهر تلقائيًا على جهاز آخر. عند حذف بيانات المتصفح تُفقد المسودات المحلية. الصور الأصلية لا تُرسل إلى الذكاء الاصطناعي؛ تُرسل نسخة مضغوطة للتحليل، وتُرفع الصورة الأصلية حتى 5MB، أما الأكبر فتُضغط وفق حدود رفع المتجر الحالية.','Drafts are stored locally in IndexedDB and do not sync across devices. Clearing browser data removes them. AI receives a compressed preview. Images up to 5MB are uploaded in their original supported format; larger files are compressed to the store’s 5MB limit.'))+'</p></section>';
 stats();
 if(typeof hydrateStudioImages==='function')void hydrateStudioImages();
}
function style(){
 if(document.getElementById('bulk-ai-styles'))return;
 const el=document.createElement('style');el.id='bulk-ai-styles';el.textContent=[
 '.bulk-ai-shell{display:grid;gap:15px}.bulk-ai-shell button{cursor:pointer}.bulk-ai-intro,.bulk-ai-upload,.bulk-ai-controls,.bulk-ai-toolbar,.bulk-ai-counts,.bulk-ai-table,.bulk-ai-foot{background:var(--surface,#fff);border:1px solid #dfe4ed;border-radius:12px;padding:14px}',
 '.bulk-ai-intro p,.bulk-ai-foot{color:#596678}.bulk-ai-upload{text-align:center;border-style:dashed;padding:28px}.bulk-ai-controls,.bulk-ai-toolbar{display:flex;gap:9px;flex-wrap:wrap;align-items:center}.bulk-ai-toolbar label{display:flex;gap:6px;align-items:center;flex-wrap:wrap}',
 '.bulk-ai-table{overflow:auto}.bulk-ai-table table{width:100%;min-width:1030px;border-collapse:collapse}.bulk-ai-table th,.bulk-ai-table td{padding:8px;border-bottom:1px solid #e3e8f1;vertical-align:top;white-space:normal}',
 '.bulk-ai-table input:not([type=checkbox]),.bulk-ai-table select{min-width:120px;width:100%;max-width:230px;box-sizing:border-box}.bulk-ai-thumb{border:0;padding:0;background:transparent}.bulk-ai-thumb img{width:64px;height:64px;object-fit:contain;border-radius:8px}',
 '.bulk-ai-error{display:block;color:#b42318;max-width:180px}.bulk-ai-warning{color:#a05c05}.bulk-ai-expanded{background:#fafbfd}.bulk-ai-details{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;padding:12px}.bulk-ai-details label{display:grid;gap:6px}.bulk-ai-details textarea{width:100%;box-sizing:border-box}',
 '.bulk-ai-duplicate-compare{display:flex;gap:6px;flex-direction:column;align-items:flex-start;border:1px solid #f3d6a3;padding:12px;border-radius:9px;background:#fff9e9}.bulk-ai-duplicate-compare img{width:130px;height:100px;object-fit:contain}.bulk-ai-pagination{text-align:center}.bulk-ai-notice{color:#145c42}.bulk-ai-status{font-weight:600}.bulk-ai-shell [disabled]{opacity:.5;cursor:not-allowed}.bulk-ai-upload.is-over{background:#eff6ff}'
 ].join('');document.head.append(el);
}
async function fileHash(file){
 const bytes=await file.arrayBuffer();
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
async function addFiles(files){
 if(state.busy)throw Error(tr('أكمل العملية الحالية قبل الإضافة','Finish the current process first'));
 const allowed=Array.from(files).filter(f=>f&&fileType(f.name));
 if(allowed.length+state.rows.length>MAX_ITEMS)throw Error(tr('الحد الأقصى 400 صورة محفوظة على هذا الجهاز','Maximum 400 saved images per device'));
 let added=0;
 for(const f of allowed){
  const type=fileType(f.name);if(!f.size||f.size>MAX_FILE)throw Error(tr('صورة تتجاوز 10MB: ','Image exceeds 10MB: ')+f.name);
  const file=f.type===type?f:new File([f],f.name,{type});
  const row={id:'bulkai-'+crypto.randomUUID(),owner:state.owner,fileName:f.name,file,hash:await fileHash(file),status:'pending',selected:true,createdAt:Date.now()+added,draft:null,imageSrc:'',error:''};
  await put(row);state.rows.push(row);added++;
 }
 state.rows.sort((a,b)=>a.createdAt-b.createdAt);
 state.notice=tr('تم حفظ ','Saved ')+added+tr(' صورة على هذا الجهاز',' images on this device');
 draw();
}
async function unpackZip(file){
 if(file.size>MAX_ZIP)throw Error(tr('ملف ZIP يتجاوز 250MB','ZIP exceeds 250MB'));
 const bytes=await file.arrayBuffer(),data=new DataView(bytes),length=data.byteLength;
 let eocd=-1;for(let i=length-22;i>=Math.max(0,length-65557);i--)if(data.getUint32(i,true)===0x06054b50){eocd=i;break;}
 if(eocd<0)throw Error(tr('ملف ZIP غير صالح','Invalid ZIP archive'));
 const entries=data.getUint16(eocd+10,true),off=data.getUint32(eocd+16,true);
 if(entries>MAX_ITEMS)throw Error(tr('عدد صور ZIP يتجاوز الحد','ZIP contains too many files'));
 if(off>=length)throw Error('Invalid ZIP directory');
 let pos=off,total=0;const result=[];
 for(let i=0;i<entries;i++){
  if(pos+46>length||data.getUint32(pos,true)!==0x02014b50)throw Error('Invalid ZIP directory entry');
  const method=data.getUint16(pos+10,true),compressed=data.getUint32(pos+20,true),raw=data.getUint32(pos+24,true),nameLen=data.getUint16(pos+28,true),extraLen=data.getUint16(pos+30,true),commentLen=data.getUint16(pos+32,true),local=data.getUint32(pos+42,true);
  const name=new TextDecoder('utf-8').decode(new Uint8Array(bytes,pos+46,nameLen));
  pos+=46+nameLen+extraLen+commentLen;
  if(!fileType(name)||name.includes('__MACOSX/')||name.split('/').at(-1).startsWith('.'))continue;
  total+=raw;if(raw>MAX_FILE||total>200*1024*1024)throw Error(tr('ZIP يحتوي صورًا كبيرة جدًا','ZIP contains oversized images'));
  if(local+30>length||data.getUint32(local,true)!==0x04034b50||!([0,8].includes(method)))throw Error(tr('طريقة ضغط ZIP غير مدعومة','Unsupported ZIP compression'));
  const start=local+30+data.getUint16(local+26,true)+data.getUint16(local+28,true);
  if(start+compressed>length)throw Error('Corrupt ZIP image');
  const section=new Blob([new Uint8Array(bytes,start,compressed)]);
  let blob=section;
  if(method===8){
   if(typeof DecompressionStream!=='function')throw Error(tr('هذا المتصفح لا يدعم فك ضغط ZIP','ZIP decompression is unavailable in this browser'));
   blob=await new Response(section.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
  }
  if(blob.size!==raw||blob.size>MAX_FILE)throw Error('Invalid decompressed ZIP image');
  result.push(new File([blob],name.split('/').at(-1),{type:fileType(name)}));
 }
 return result;
}
async function sendImage(row){
 const current=await api({action:'status',id:row.id});
 if(current.saved){await update(row,{status:current.published?'published':'saved',error:'',selected:false});return;}
 const sources=await window.MStudioImages.filesToCompressedSources({files:[row.file]},{targetBytes:260*1024,maxDimension:1400});
 if(!sources?.[0]||sources[0].length>480000)throw Error(tr('تعذر ضغط الصورة للتحليل','Image compression failed'));
 const result=await api({action:'analyze',image:sources[0]});
 const draft=result.draft||{};
 if(!draft.name)throw Error(tr('لم يتم التعرف على المنتج، راجع الصورة','Product could not be identified'));
 const duplicate=!!state.rows.find(r=>r.id!==row.id&&r.hash===row.hash)||!!inStore().find(p=>cleanName(p.product)===cleanName(draft.name)&&!p.deletedAt);
 await update(row,{draft:{...draft,sku: /^MG-AI-/.test(draft.sku||'')?'':draft.sku},duplicate,error:'',status:result.needsReview?'review':'ready'});
}
async function queue(mode,oneId){
 if(state.busy)return;state.busy=true;state.stop=false;state.error='';state.notice='';draw();
 try{
  const targets=state.rows.filter(r=>
   mode==='analyze'?r.status==='pending':
   mode==='retry'?r.status==='failed':
   mode==='single'?r.id===oneId&&!['saved','published'].includes(r.status):
   mode==='publish'?r.selected!==false&&['ready','review','save_failed','publish_failed','saved'].includes(r.status):
   r.selected!==false&&['ready','review','save_failed'].includes(r.status));
  if(!targets.length){state.notice=tr('لا توجد عناصر لهذه العملية','No eligible items');return;}
  let cursor=0;
  const worker=async()=>{
   while(!state.stop&&cursor<targets.length){
    const row=targets[cursor++];
    try{
     await update(row,{status:mode==='publish'?'publishing':mode==='save'?'saving':'analyzing',error:''});
     if(mode==='publish')await saveOne(row,{publish:true});
     else if(mode==='save')await saveOne(row);
     else await sendImage(row);
    }catch(e){
     await update(row,{status:mode==='publish'?'publish_failed':mode==='save'?'save_failed':'failed',error:String(e.message||e).slice(0,250)});
     if(/429|hourly|limit reached|الحد/.test(String(e.message||''))){state.stop=true;state.error=String(e.message);}
    }
   }
  };
  await Promise.all(Array.from({length:Math.min(['save','publish'].includes(mode)?2:3,targets.length)},worker));
  state.notice=tr('انتهت العملية. تحقق من حالات المنتجات ونتائج النشر.','Finished. Review each product’s status and publication result.');
  if(['save','publish'].includes(mode)&&targets.some(r=>['saved','published'].includes(r.status))){try{await syncCatalog();}catch{}}
 }finally{state.busy=false;state.stop=false;draw();}
}
async function saveOne(row,{publish=false}={}){
 const d=row.draft||{};
 if(!d.name?.trim()||!d.nameEn?.trim()||!d.categoryId)throw Error(tr('أكمل الأسماء والتصنيف قبل الحفظ','Names and category are required'));
 if(publish&&(!d.description?.trim()||!d.descriptionEn?.trim()))
  throw Error(tr('النشر يتطلب وصفًا عربيًا وإنجليزيًا. راجع بيانات المنتج ثم أعد المحاولة.','Publishing requires Arabic and English descriptions. Review the product and retry.'));
 if(d.subcategoryId&&!subcategories(d.categoryId).some(x=>x.id===d.subcategoryId))throw Error(tr('التصنيف الفرعي لا يطابق الرئيسي','Subcategory does not match category'));
 const existing=await api({action:'status',id:row.id});
 if(existing.saved){
  if(publish&&!existing.published){
   const response=await api({action:'publish',id:row.id,redactionConfirmed:true});
   if(!response.published)throw Error(tr('لم يتم تأكيد النشر','Publication could not be confirmed'));
  }
  await update(row,{status:publish||existing.published?'published':'saved',error:'',selected:false});
  return;
 }
 let imageSrc=row.imageSrc||'';
 if(!imageSrc){
  let source='';
  if(row.file.size<=5*1024*1024){source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(row.file);});}
  else{const sources=await window.MStudioImages.filesToCompressedSources({files:[row.file]},{targetBytes:4*1024*1024,maxDimension:2400});source=sources?.[0]||'';}
  if(!source)throw Error(tr('تعذر تجهيز صورة المنتج','Image preparation failed'));
  const upload=await window.MStudioSession.request('/api/v1/uploads',{auth:true,method:'POST',body:{source}});
  if(!upload?.src)throw Error(tr('تعذر رفع صورة المنتج','Image upload failed'));
  imageSrc=upload.src;await update(row,{imageSrc});
 }
 const result=await api({action:'save',id:row.id,publish,redactionConfirmed:publish,product:{...d,id:row.id,images:[imageSrc]}});
 if(publish&&!result.published)throw Error(tr('لم يتم تأكيد نشر المنتج','Product publication not confirmed'));
 await update(row,{status:publish||result.published?'published':'saved',error:'',selected:false});
}
async function openPanel(host){
 root=host;style();
 if(!state.owner||state.owner!==token()){
  state.owner=token();if(!state.owner){root.textContent=tr('سجّل الدخول إلى الإدارة','Sign in as admin');return;}
  database=await dbOpen();await load();
 }
 draw();
}
document.addEventListener('click',async e=>{
 const open=e.target.closest('[data-bulk-ai-open]');
 if(open){e.preventDefault();if(!permitted('offers.create')&&!permitted('offers.edit'))return;view='bulk-ai';render();return;}
 if(!root?.isConnected)return;
 const btn=e.target.closest('[data-bulk-action]');if(!btn||!root.contains(btn))return;
 const action=btn.dataset.bulkAction,id=btn.dataset.bulkId;
 if(action==='choose')root.querySelector('#bulk-ai-files').click();
 if(action==='zip')root.querySelector('#bulk-ai-zip').click();
 if(action==='stop'){state.stop=true;state.notice=tr('سيتم إيقاف القائمة بعد انتهاء الطلبات الحالية','Stopping after current requests');stats();}
 if(action==='publish'){
  const eligible=state.rows.filter(r=>r.selected!==false&&['ready','review','save_failed','publish_failed','saved'].includes(r.status));
  if(!eligible.length){state.error=tr('حدد منتجات جاهزة أو مسودات محفوظة للنشر','Select reviewed products or saved drafts to publish');stats();return;}
  const message=tr('سيتم نشر ','You are about to publish ')+eligible.length+tr(' منتج مباشرة في المتجر ليظهر للعملاء دون أسعار. هل راجعت الأسماء والأوصاف والصور والتصنيفات وتؤكد النشر؟',' products directly to customers without prices. Have you reviewed names, descriptions, images and categories, and do you confirm publishing?');
  if(!window.confirm(message))return;
  void queue('publish');
 }
 if(action==='analyze'||action==='retry'||action==='save'||action==='retry-one')void queue(action==='retry-one'?'single':action,id);
 if(action==='delete-one'&&!state.busy){const row=state.rows.find(x=>x.id===id);if(['saved','published'].includes(row?.status))return;if(row){await remove(id);state.rows=state.rows.filter(x=>x.id!==id);draw();}}
 if(action==='select-all'||action==='select-none'){
  const selected=action==='select-all';for(const r of state.rows.filter(x=>x.status!=='published')){r.selected=selected;await put(r);}draw();
 }
 if(action==='apply-category'){
  if(!state.selectedCategory)return;
  for(const r of state.rows.filter(x=>x.selected!==false&&!['saved','published'].includes(x.status)&&x.draft)){r.draft.categoryId=state.selectedCategory;r.draft.subcategoryId='';if(r.status==='review'&&r.draft.name&&r.draft.nameEn)r.status='ready';await put(r);}draw();
 }
 if(action==='prev'||action==='next'){state.page+=action==='next'?1:-1;draw();}
 const preview=e.target.closest('[data-bulk-preview]');if(preview&&root.contains(preview)){const row=state.rows.find(x=>x.id===preview.dataset.bulkPreview);if(row){const src=URL.createObjectURL(row.file),dlg=document.createElement('dialog');dlg.className='bulk-ai-photo-dialog';dlg.innerHTML='<button type="button">'+esc(tr('إغلاق','Close'))+' ×</button><img alt="'+esc(row.fileName)+'" style="max-width:90vw;max-height:82vh;object-fit:contain" src="'+esc(src)+'">';document.body.append(dlg);dlg.querySelector('button').onclick=()=>dlg.close();dlg.onclose=()=>{URL.revokeObjectURL(src);dlg.remove();};dlg.showModal();}}
});
document.addEventListener('change',async e=>{
 if(!root?.isConnected||!root.contains(e.target))return;
 if(e.target.id==='bulk-ai-files'||e.target.id==='bulk-ai-zip'){
  try{state.error='';const files=e.target.id==='bulk-ai-zip'?await unpackZip(e.target.files[0]):e.target.files;await addFiles(files);}
  catch(err){state.error=String(err.message||err);stats();}
  e.target.value='';return;
 }
 if(e.target.matches('[data-bulk-filter]')){state.filter=e.target.value;state.page=0;draw();return;}
 if(e.target.matches('[data-bulk-category]')){state.selectedCategory=e.target.value;return;}
 if(e.target.matches('[data-bulk-select]')){const row=state.rows.find(r=>r.id===e.target.dataset.bulkSelect);if(row){row.selected=e.target.checked;await put(row);}return;}
 if(e.target.matches('[data-bulk-field]')){
  const row=state.rows.find(r=>r.id===e.target.dataset.bulkId);if(!row||['saved','published'].includes(row.status))return;
  row.draft||={};row.draft[e.target.dataset.bulkField]=String(e.target.value);
  if(e.target.dataset.bulkField==='categoryId'){row.draft.subcategoryId='';}
  if(row.draft.name&&row.draft.nameEn&&row.draft.categoryId&&row.status==='review')row.status='ready';
  await put(row);draw();
 }
});
document.addEventListener('input',e=>{if(root?.contains(e.target)&&e.target.matches('[data-bulk-query]')){state.query=e.target.value;state.page=0;const el=e.target,position=el.selectionStart;draw();const next=root.querySelector('[data-bulk-query]');next?.focus();next?.setSelectionRange(position,position);}});
document.addEventListener('dragover',e=>{if(root?.isConnected&&root.contains(e.target)){e.preventDefault();root.querySelector('[data-bulk-drop]')?.classList.add('is-over');}});
document.addEventListener('dragleave',e=>{if(root?.isConnected)root.querySelector('[data-bulk-drop]')?.classList.remove('is-over');});
document.addEventListener('drop',async e=>{if(!root?.isConnected||!root.contains(e.target))return;e.preventDefault();root.querySelector('[data-bulk-drop]')?.classList.remove('is-over');try{await addFiles(e.dataTransfer.files);}catch(err){state.error=String(err.message||err);stats();}});
window.MBulkProductAI={mount:openPanel};
})();