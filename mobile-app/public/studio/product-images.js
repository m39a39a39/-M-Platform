'use strict';
(()=>{
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function mount(form,sources=[],hydrate=()=>{}){
  const root=form.querySelector('[data-product-images]');if(!root)return;
  let items=sources.map(src=>({id:crypto.randomUUID(),src})),replacement=null,dragged=null;
  const urls=new Set();
  root.className='full product-images';
  root.innerHTML='<div class="product-images-heading"><strong>صور المنتج</strong><small data-image-count></small></div><div class="product-images-grid" data-images-grid></div><input type="file" data-image-input accept="image/png,image/jpeg,image/webp" multiple hidden><p class="help">اسحب الصور لإعادة ترتيبها، أو استخدم أزرار الترتيب. الصورة الأولى هي الرئيسية.</p><p role="status" aria-live="polite" data-images-status></p>';
  const grid=root.querySelector('[data-images-grid]'),input=root.querySelector('[data-image-input]'),status=root.querySelector('[data-images-status]');
  const release=item=>{if(item.file){URL.revokeObjectURL(item.src);urls.delete(item.src);}};
  function render(focus){
   root.querySelector('[data-image-count]').textContent=`${items.length} / 5 صور`;
   grid.innerHTML=items.map((item,i)=>`<article class="product-image-card" draggable="true" data-image-id="${item.id}"><button type="button" class="product-image-preview" data-image-action="preview" aria-label="تكبير الصورة ${i+1}"><img src="${esc(item.src)}" alt="صورة المنتج ${i+1}" draggable="false"></button>${i===0?'<span class="product-image-primary">رئيسية</span>':''}<div class="product-image-actions"><button type="button" data-image-action="primary" ${i===0?'disabled':''}>تعيين رئيسية</button><button type="button" data-image-action="replace">استبدال</button><button type="button" data-image-action="remove" aria-label="حذف الصورة ${i+1}">حذف</button><button type="button" data-image-action="previous" aria-label="تقديم الصورة ${i+1}" ${i===0?'disabled':''}>→</button><button type="button" data-image-action="next" aria-label="تأخير الصورة ${i+1}" ${i===items.length-1?'disabled':''}>←</button></div></article>`).join('')+(items.length<5?`<button type="button" class="product-image-add" data-image-add><span aria-hidden="true">＋</span><strong>${items.length?'إضافة صور':'اسحب الصور هنا'}</strong><small>${items.length?'من الجهاز':'أو اختر من جهازك'}</small><small>PNG، JPG، WEBP · حتى 10 MB للصورة</small></button>`:'');
   hydrate();
   if(focus)(grid.querySelector(`[data-image-id="${focus}"] button`)||grid.querySelector('button'))?.focus();
  }
  function add(files){
   const selected=Array.from(files);if(!selected.length)return;
   if(replacement&&selected.length!==1){status.textContent='اختر صورة واحدة للاستبدال.';return;}
   if(items.length+(replacement?0:selected.length)>5){status.textContent='يمكن إضافة خمس صور كحد أقصى.';return;}
   if(selected.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)||!f.size||f.size>10*1024*1024)){status.textContent='اختر صور PNG أو JPG أو WEBP، حتى 10 ميجابايت للصورة.';return;}
   const incoming=selected.map(file=>{const src=URL.createObjectURL(file);urls.add(src);return {id:crypto.randomUUID(),file,src};});
   if(replacement){const i=items.findIndex(x=>x.id===replacement);if(i>=0){release(items[i]);items.splice(i,1,incoming[0]);}else incoming.forEach(release);}else items.push(...incoming);
   replacement=null;status.textContent='تم تحديث الصور.';render();
  }
  input.addEventListener('change',()=>{add(input.files);input.value='';});
  root.addEventListener('click',e=>{
   if(e.target.closest('[data-image-add]')){replacement=null;input.multiple=true;input.click();return;}
   const button=e.target.closest('[data-image-action]'),card=button?.closest('[data-image-id]');if(!card)return;
   const i=items.findIndex(x=>x.id===card.dataset.imageId),action=button.dataset.imageAction;if(i<0)return;
   if(action==='replace'){replacement=items[i].id;input.multiple=false;input.click();return;}
   if(action==='preview'){
    const viewer=document.createElement('dialog');viewer.className='product-image-viewer';viewer.innerHTML=`<button type="button" autofocus aria-label="إغلاق الصورة">إغلاق ×</button><img src="${esc(card.querySelector('img').src)}" alt="معاينة صورة المنتج">`;
    (form.closest('dialog')||document.body).append(viewer);viewer.querySelector('button').onclick=()=>viewer.close();viewer.addEventListener('close',()=>{viewer.remove();button.focus();},{once:true});viewer.showModal();return;
   }
   if(action==='remove'){release(items[i]);items.splice(i,1);}else{const to=action==='primary'?0:action==='previous'?i-1:i+1;if(to<0||to>=items.length)return;items.splice(to,0,items.splice(i,1)[0]);}
   status.textContent=action==='remove'?'تم حذف الصورة من النموذج.':'تم تحديث ترتيب الصور.';render(items[Math.min(i,items.length-1)]?.id);
  });
  grid.addEventListener('dragstart',e=>{dragged=e.target.closest('[data-image-id]')?.dataset.imageId;if(dragged)e.dataTransfer.setData('text/plain',dragged);});
  grid.addEventListener('dragend',()=>{dragged=null;grid.classList.remove('is-dragging');});
  grid.addEventListener('dragover',e=>{e.preventDefault();grid.classList.add('is-dragging');});
  grid.addEventListener('dragleave',e=>{if(!grid.contains(e.relatedTarget))grid.classList.remove('is-dragging');});
  grid.addEventListener('drop',e=>{
   e.preventDefault();grid.classList.remove('is-dragging');
   if(e.dataTransfer.files.length){replacement=null;add(e.dataTransfer.files);return;}
   const target=e.target.closest('[data-image-id]')?.dataset.imageId,from=items.findIndex(x=>x.id===dragged),to=items.findIndex(x=>x.id===target);dragged=null;
   if(from>=0&&to>=0&&from!==to){items.splice(to,0,items.splice(from,1)[0]);render();status.textContent='تم تحديث ترتيب الصور.';}
  });
  form.productImages={entries:()=>items.map(x=>({...x})),signature:()=>items.map(x=>x.id).join(','),save:async upload=>{
   const snapshot=items.slice(),signature=items.map(x=>x.id).join(','),output=[];
   for(const item of snapshot){if(item.file&&!item.uploaded)item.uploaded=await upload(item.file);const src=item.file?item.uploaded:item.src;if(!src)throw Error('تعذر رفع الصورة. حاول مجددًا.');output.push(src);}
   if(signature!==items.map(x=>x.id).join(','))throw Error('تغيرت الصور أثناء الرفع؛ راجع ترتيبها ثم احفظ مجددًا.');return output;
  }};
  const cleanup=()=>{urls.forEach(url=>URL.revokeObjectURL(url));urls.clear();};
  const containerDialog=form.closest('dialog');
  containerDialog?.addEventListener('close',e=>{if(e.target===containerDialog)cleanup();});
  // Full-page navigation removes the form without a dialog close event.
  const disconnectObserver=new MutationObserver(()=>{if(!form.isConnected){cleanup();disconnectObserver.disconnect();}});
  disconnectObserver.observe(document.body,{subtree:true,childList:true});
  render();
 }
 window.MProductImages={mount};
})();
