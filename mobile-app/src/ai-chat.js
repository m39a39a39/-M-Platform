import './ai-chat.css';

let controller=null;
const signalTimers=new Map();
const MARKETING_KEY='m-platform.ai-marketing.v2';
const MAX_PROACTIVE_MESSAGES=3;
const PROACTIVE_COOLDOWN=90000;

const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const copy={
  ar:{
    title:'مساعد M الذكي',subtitle:'مستشار مشتريات وتوريد',placeholder:'اكتب ماذا تبحث عنه...',send:'إرسال',close:'إغلاق',
    guestHello:'مرحبًا 👋 أخبرني ماذا تريد شراءه، وسأساعدك في اختيار الأنسب من المنتجات المتاحة.',
    clientHello:'مرحبًا 👋 أخبرني ماذا تحتاج، وسأساعدك في المنتجات والعروض وحالة طلباتك.',
    error:'تعذر الحصول على رد الآن. حاول مرة أخرى.',thinking:'جاري البحث...',
    chipsGuest:['أبحث عن أفضل منتج لسوقي','قارن لي بين المنتجات المناسبة','لم أجد المنتج الذي أريده'],
    chipsClient:['اقترح لي منتجًا مناسبًا','هل لدي عروض جديدة؟','أين وصل طلبي؟']
  },
  en:{
    title:'M AI Assistant',subtitle:'Smart buying & sourcing advisor',placeholder:'Tell me what you are looking for...',send:'Send',close:'Close',
    guestHello:'Hi 👋 Tell me what you want to buy and I will help you choose the best fit from available products.',
    clientHello:'Hi 👋 Tell me what you need and I can help with products, quotes, and your order status.',
    error:'I could not get a response right now. Please try again.',thinking:'Searching...',
    chipsGuest:['Find the best product for my market','Compare suitable products','I cannot find the product I need'],
    chipsClient:['Recommend a suitable product','Do I have new quotes?','Where is my order?']
  }
};

function language(){return controller?.language?.()==='en'?'en':'ar';}
function t(key){return copy[language()][key];}
function marketingState(){
  try{
    const parsed=JSON.parse(sessionStorage.getItem(MARKETING_KEY)||'{}');
    return parsed&&typeof parsed==='object'?parsed:{};
  }catch{return{};}
}
function saveMarketingState(state){
  try{sessionStorage.setItem(MARKETING_KEY,JSON.stringify(state));}catch{}
}
function updateMarketingState(patch){
  const state={count:0,lastAt:0,views:{},distinct:[],chatEngaged:false,...marketingState(),...patch};
  saveMarketingState(state);return state;
}
function ensureHost(){
  let host=document.getElementById('mAiChat');
  if(host)return host;
  host=document.createElement('section');
  host.id='mAiChat';
  host.className='m-ai-chat';
  host.innerHTML=`
    <button class="m-ai-launcher" type="button" aria-expanded="false"><span class="m-ai-launcher-mark">M</span><span class="m-ai-launcher-spark">✦</span></button>
    <button class="m-ai-nudge hidden" type="button"><span class="m-ai-nudge-close" aria-label="Close">×</span><strong>M</strong><p></p></button>
    <section class="m-ai-panel hidden" role="dialog" aria-modal="false">
      <header class="m-ai-head"><div><strong></strong><small></small></div><button class="m-ai-close" type="button">×</button></header>
      <div class="m-ai-messages" aria-live="polite"></div>
      <div class="m-ai-chips"></div>
      <form class="m-ai-form"><textarea rows="1" maxlength="2000"></textarea><button type="submit"></button></form>
    </section>`;
  document.body.append(host);
  host.querySelector('.m-ai-launcher').addEventListener('click',()=>{markEngaged();setOpen(host.querySelector('.m-ai-panel').classList.contains('hidden'));});
  host.querySelector('.m-ai-close').addEventListener('click',()=>setOpen(false));
  host.querySelector('.m-ai-nudge').addEventListener('click',event=>{
    if(event.target.closest('.m-ai-nudge-close')){event.preventDefault();event.stopPropagation();hideNudge();return;}
    markEngaged();hideNudge();setOpen(true);
  });
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
function markEngaged(){
  const state=marketingState();state.chatEngaged=true;saveMarketingState(state);
}
function hideNudge(){
  const nudge=document.querySelector('#mAiChat .m-ai-nudge');if(nudge)nudge.classList.add('hidden');
}
function showNudge(text){
  const host=ensureHost(),nudge=host.querySelector('.m-ai-nudge');
  nudge.querySelector('p').textContent=String(text||'');
  nudge.classList.remove('hidden');
  clearTimeout(showNudge.timer);showNudge.timer=setTimeout(hideNudge,14000);
}
function setOpen(open){
  const host=ensureHost(),panel=host.querySelector('.m-ai-panel'),button=host.querySelector('.m-ai-launcher');
  panel.classList.toggle('hidden',!open);button.setAttribute('aria-expanded',String(open));
  if(open){hideNudge();render();setTimeout(()=>host.querySelector('textarea')?.focus(),30);}
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
  markEngaged();hideNudge();input.value='';
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
function scheduleSignal(key,delay,fn){
  clearTimeout(signalTimers.get(key));signalTimers.set(key,setTimeout(()=>{signalTimers.delete(key);fn();},delay));
}
function eligibleForProactive(){
  if(!controller||controller.loading||document.hidden)return false;
  const host=ensureHost(),state={count:0,lastAt:0,chatEngaged:false,...marketingState()};
  if(!host.querySelector('.m-ai-panel').classList.contains('hidden'))return false;
  if(state.chatEngaged)return false;
  if(Number(state.count||0)>=MAX_PROACTIVE_MESSAGES)return false;
  if(Date.now()-Number(state.lastAt||0)<PROACTIVE_COOLDOWN)return false;
  return true;
}
async function requestProactive(signal){
  if(!eligibleForProactive())return;
  const state=marketingState();
  state.count=Number(state.count||0)+1;state.lastAt=Date.now();saveMarketingState(state);
  try{
    const result=await controller.send({
      message:language()==='ar'?'أنشئ رسالة مساعدة استباقية مناسبة لهذا العميل.':'Create a suitable proactive sales-assistance message for this customer.',
      history:controller.messages.slice(-6),
      language:language(),
      marketingSignal:signal
    });
    const reply=String(result?.reply||'').trim();if(!reply)return;
    controller.messages.push({role:'assistant',content:reply});controller.messages=controller.messages.slice(-20);
    showNudge(reply);render();
  }catch{}
}
export function aiChatSignal(type,detail={}){
  if(!controller)return;
  const state={count:0,lastAt:0,views:{},distinct:[],chatEngaged:false,...marketingState()};
  if(type==='product_view'){
    const key=String(detail.sku||detail.title||'product').slice(0,120);
    state.views={...(state.views||{}),[key]:Number(state.views?.[key]||0)+1};
    state.distinct=[...new Set([...(Array.isArray(state.distinct)?state.distinct:[]),key])].slice(-8);
    saveMarketingState(state);
    const repeated=state.views[key]>=2,comparing=state.distinct.length>=3;
    scheduleSignal('product-interest',repeated?4500:comparing?6500:14000,()=>requestProactive({
      type:repeated?'repeated_product':comparing?'comparing_products':'product_interest',
      ...detail,
      viewedTimes:state.views[key],
      distinctProducts:state.distinct.length
    }));
    return;
  }
  if(type==='search'){
    const query=String(detail.query||'').trim();if(query.length<3)return;
    scheduleSignal('search',1100,()=>{
      if(Number(detail.results)===0)return requestProactive({type:'search_no_results',...detail});
      if(Number(detail.results)<=3)return requestProactive({type:'narrow_search',...detail});
    });
    return;
  }
  if(type==='cart_add'){
    scheduleSignal('cart-add',Number(detail.cartCount)>=2?5000:11000,()=>requestProactive({type:'cart_interest',...detail}));
    return;
  }
  if(type==='cart_open'){
    if(Number(detail.cartCount)>0)scheduleSignal('cart-open',15000,()=>requestProactive({type:'cart_hesitation',...detail}));
  }
}
export function mountAiChat({mode='guest',language:languageGetter=()=> 'ar',send}={}){
  if(typeof send!=='function')return;
  const sameMode=controller?.mode===mode;
  controller={mode,language:languageGetter,send,messages:sameMode?controller.messages:[],loading:false};
  const host=ensureHost();host.classList.remove('hidden');render();
}
export function unmountAiChat(){
  controller=null;for(const timer of signalTimers.values())clearTimeout(timer);signalTimers.clear();
  document.getElementById('mAiChat')?.remove();
}
