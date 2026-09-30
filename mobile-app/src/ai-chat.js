import './ai-chat.css';

let controller=null;

const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const copy={
  ar:{
    title:'مساعد M الذكي',subtitle:'يساعدك في المنتجات والطلبات',placeholder:'اكتب سؤالك هنا...',send:'إرسال',close:'إغلاق',
    guestHello:'مرحبًا 👋 اسألني عن المنتجات المتاحة أو طريقة الطلب والتوريد.',
    clientHello:'مرحبًا 👋 أستطيع مساعدتك في المنتجات وحالة طلباتك والعروض المتاحة.',
    error:'تعذر الحصول على رد الآن. حاول مرة أخرى.',thinking:'جاري البحث...',
    chipsGuest:['ابحث لي عن شاحن 20W','كيف أرسل طلب خاص؟','ما المنتجات المتاحة؟'],
    chipsClient:['أين وصل طلبي؟','هل لدي عروض جديدة؟','اقترح لي منتجًا مناسبًا']
  },
  en:{
    title:'M AI Assistant',subtitle:'Products, sourcing, and order help',placeholder:'Ask a question...',send:'Send',close:'Close',
    guestHello:'Hi 👋 Ask me about available products or how ordering and sourcing works.',
    clientHello:'Hi 👋 I can help with products, your order status, and available quotes.',
    error:'I could not get a response right now. Please try again.',thinking:'Searching...',
    chipsGuest:['Find me a 20W charger','How do I send a custom request?','What products are available?'],
    chipsClient:['Where is my order?','Do I have new quotes?','Recommend a suitable product']
  }
};

function language(){return controller?.language?.()==='en'?'en':'ar';}
function t(key){return copy[language()][key];}
function ensureHost(){
  let host=document.getElementById('mAiChat');
  if(host)return host;
  host=document.createElement('section');
  host.id='mAiChat';
  host.className='m-ai-chat';
  host.innerHTML=`
    <button class="m-ai-launcher" type="button" aria-expanded="false"><span class="m-ai-launcher-mark">M</span><span class="m-ai-launcher-spark">✦</span></button>
    <section class="m-ai-panel hidden" role="dialog" aria-modal="false">
      <header class="m-ai-head"><div><strong></strong><small></small></div><button class="m-ai-close" type="button">×</button></header>
      <div class="m-ai-messages" aria-live="polite"></div>
      <div class="m-ai-chips"></div>
      <form class="m-ai-form"><textarea rows="1" maxlength="2000"></textarea><button type="submit"></button></form>
    </section>`;
  document.body.append(host);
  host.querySelector('.m-ai-launcher').addEventListener('click',()=>setOpen(host.querySelector('.m-ai-panel').classList.contains('hidden')));
  host.querySelector('.m-ai-close').addEventListener('click',()=>setOpen(false));
  host.querySelector('.m-ai-form').addEventListener('submit',submit);
  host.querySelector('textarea').addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();host.querySelector('.m-ai-form').requestSubmit();}
  });
  host.querySelector('.m-ai-chips').addEventListener('click',event=>{
    const button=event.target.closest('button[data-prompt]');if(!button)return;
    host.querySelector('textarea').value=button.dataset.prompt;host.querySelector('.m-ai-form').requestSubmit();
  });
  return host;
}
function setOpen(open){
  const host=ensureHost(),panel=host.querySelector('.m-ai-panel'),button=host.querySelector('.m-ai-launcher');
  panel.classList.toggle('hidden',!open);button.setAttribute('aria-expanded',String(open));
  if(open){render();setTimeout(()=>host.querySelector('textarea')?.focus(),30);}
}
function render(){
  if(!controller)return;
  const host=ensureHost(),lang=language(),rtl=lang==='ar';
  host.dir=rtl?'rtl':'ltr';
  host.querySelector('.m-ai-head strong').textContent=t('title');
  host.querySelector('.m-ai-head small').textContent=t('subtitle');
  host.querySelector('.m-ai-close').setAttribute('aria-label',t('close'));
  host.querySelector('textarea').placeholder=t('placeholder');
  host.querySelector('.m-ai-form button').textContent=t('send');
  const messages=host.querySelector('.m-ai-messages');
  const greeting=controller.mode==='client'?t('clientHello'):t('guestHello');
  const rows=[{role:'assistant',content:greeting},...controller.messages];
  messages.innerHTML=rows.map(row=>`<div class="m-ai-row ${row.role==='user'?'user':'assistant'}"><div>${esc(row.content)}</div></div>`).join('');
  if(controller.loading)messages.insertAdjacentHTML('beforeend',`<div class="m-ai-row assistant"><div class="m-ai-thinking"><span></span><span></span><span></span> ${esc(t('thinking'))}</div></div>`);
  const chips=controller.mode==='client'?t('chipsClient'):t('chipsGuest');
  host.querySelector('.m-ai-chips').innerHTML=controller.messages.length?'':chips.map(label=>`<button type="button" data-prompt="${esc(label)}">${esc(label)}</button>`).join('');
  const input=host.querySelector('textarea'),send=host.querySelector('.m-ai-form button');
  input.disabled=controller.loading;send.disabled=controller.loading;
  requestAnimationFrame(()=>{messages.scrollTop=messages.scrollHeight;});
}
async function submit(event){
  event.preventDefault();
  if(!controller||controller.loading)return;
  const host=ensureHost(),input=host.querySelector('textarea'),message=input.value.trim();
  if(!message)return;
  input.value='';
  controller.messages.push({role:'user',content:message});
  controller.messages=controller.messages.slice(-20);
  controller.loading=true;render();
  try{
    const history=controller.messages.slice(0,-1).slice(-10);
    const result=await controller.send({message,history,language:language()});
    controller.messages.push({role:'assistant',content:String(result?.reply||t('error'))});
  }catch(error){
    controller.messages.push({role:'assistant',content:String(error?.message||t('error'))});
  }finally{
    controller.loading=false;controller.messages=controller.messages.slice(-20);render();
  }
}
export function mountAiChat({mode='guest',language:languageGetter=()=> 'ar',send}={}){
  if(typeof send!=='function')return;
  const sameMode=controller?.mode===mode;
  controller={mode,language:languageGetter,send,messages:sameMode?controller.messages:[],loading:false};
  const host=ensureHost();host.classList.remove('hidden');render();
}
export function unmountAiChat(){
  controller=null;
  document.getElementById('mAiChat')?.remove();
}
