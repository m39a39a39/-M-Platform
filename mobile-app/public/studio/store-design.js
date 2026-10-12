'use strict';
(()=>{
 const isHome=s=>!['header','footer'].includes(s.type)&&(s.page||'home')==='home';
 const baseEditor=editorView;
 editorView=function(){return (themePage==='home'&&permitted('settings')?`<section class="ai-design-banner"><div><strong>✦ صمّم واجهة متجرك بالذكاء الاصطناعي</strong><p>صف فكرتك، عاين التصميم، ثم عدّل كل قسم من لوحة التحكم قبل النشر.</p></div><button type="button" class="primary" data-action="ai-store-design">تصميم المتجر بالذكاء الاصطناعي</button></section>`:'')+baseEditor();};
 const css=document.createElement('link');css.rel='stylesheet';css.href='/studio/store-design.css?v=20261012-1';document.head.append(css);
 let busy=false;
 function openDesigner(){
  if(!permitted('settings')||busy||publishing)return;
  const baseline=clone(state.draft),baselineVersion=settingsVersion;
  let proposal=null,active=true,previewDevice='desktop';
  modal('تصميم الصفحة الرئيسية بالذكاء الاصطناعي',`<div class="dialog-body ai-design-dialog"><p class="tip">سيتم إنشاء أقسام قابلة للتعديل باستخدام محتوى متجرك. لن يظهر التصميم للزوار حتى تنشره.</p><form id="ai-design-form"><label for="ai-design-prompt">كيف تريد أن تبدو الصفحة الرئيسية؟</label><textarea id="ai-design-prompt" name="prompt" required minlength="5" maxlength="2000" rows="4" placeholder="مثال: واجهة عصرية بألوان داكنة، بانر ترحيبي، التصنيفات ثم أحدث المنتجات. يمكنك أيضًا طلب تعديل التصميم الحالي."></textarea><div class="ai-design-presets"><button type="button" data-design-prompt="أعد تصميم الرئيسية بأسلوب بسيط وألوان فاتحة، ومساحات مريحة، مع التصنيفات وأحدث المنتجات.">بسيط وفاتح</button><button type="button" data-design-prompt="أعد تصميم الرئيسية بأسلوب فاخر وألوان داكنة ولمسات ذهبية، وعناوين واضحة ومنتجات مختارة.">فاخر وداكن</button><button type="button" data-design-prompt="حسّن التصميم الحالي مع الحفاظ على محتواه واجعله أوضح على الجوال ورتب أقسامه لتحسين اكتشاف المنتجات.">تحسين التصميم الحالي</button></div><button type="submit" class="primary" id="ai-design-generate">✦ توليد تصميم جديد</button></form><p id="ai-design-status" role="status" aria-live="polite"></p><div id="ai-design-result" hidden><p id="ai-design-summary"></p><div class="ai-design-actions"><button type="button" data-design-device="desktop">كمبيوتر</button><button type="button" data-design-device="mobile">جوال</button><button type="button" class="primary" id="ai-design-apply">استخدام التصميم وتعديله</button></div><div class="ai-design-preview" id="ai-design-preview"></div></div></div>`,'','review-dialog');
  const dialog=$('#dialog'),form=$('#ai-design-form'),status=$('#ai-design-status'),result=$('#ai-design-result'),generate=$('#ai-design-generate'),apply=$('#ai-design-apply');
  dialog.addEventListener('close',()=>{active=false;},{once:true});
  const alive=()=>active&&form.isConnected&&dialog.open;
  const merge=()=>{
   const draft=clone(baseline),first=draft.sections.findIndex(isHome),sections=draft.sections.filter(s=>!isHome(s));
   sections.splice(first<0?sections.length:first,0,...clone(proposal.sections));draft.sections=sections;return draft;
  };
  const draw=()=>{const host=$('#ai-design-preview');host.innerHTML=storeHtml(merge(),previewDevice,false,'home');host.classList.toggle('mobile-preview',previewDevice==='mobile');hydrateStudioImages();};
  form.querySelectorAll('[data-design-prompt]').forEach(b=>b.onclick=()=>{$('#ai-design-prompt').value=b.dataset.designPrompt;$('#ai-design-prompt').focus();});
  result.querySelectorAll('[data-design-device]').forEach(b=>b.onclick=()=>{previewDevice=b.dataset.designDevice;draw();});
  form.onsubmit=async e=>{
   e.preventDefault();if(busy||!form.reportValidity())return;
   busy=true;generate.disabled=true;apply.disabled=true;form.setAttribute('aria-busy','true');status.textContent='جاري إنشاء التصميم… قد يستغرق ذلك نصف دقيقة.';
   try{
    const response=await api('store-design',{prompt:String(new FormData(form).get('prompt')),version:baselineVersion,store:baseline});
    if(!alive())return;
    proposal=response;result.hidden=false;$('#ai-design-summary').textContent=response.summary;draw();apply.disabled=false;generate.textContent='إعادة توليد التصميم';status.textContent='التصميم جاهز للمعاينة. استخدمه لبدء تعديل النصوص والصور وترتيب الأقسام.';
   }catch(error){if(alive()){status.textContent=error.message;apply.disabled=!proposal;}}
   finally{busy=false;if(alive()){generate.disabled=false;form.removeAttribute('aria-busy');}}
  };
  apply.onclick=()=>{
   if(!proposal||busy)return;
   if(settingsVersion!==baselineVersion||JSON.stringify(state.draft)!==JSON.stringify(baseline)){status.textContent='تغيّرت المسودة أثناء التوليد. أغلق النافذة وأعد التوليد من أحدث نسخة.';return;}
   state.draft=merge();themePage='home';themeInspector='sections';selected=proposal.sections[0]?.id;editGroup=null;
   closeModal();changed('أُضيف التصميم إلى المسودة. عدّل الأقسام ثم احفظ المسودة أو راجع التغييرات وانشرها.');
  };
  $('#ai-design-prompt').focus();
 }
 document.addEventListener('click',e=>{if(e.target.closest('[data-action="ai-store-design"]'))openDesigner();});
 if(liveState)render();
})();
