import './ai-chat.css';
import {filesToCompressedSources} from './image-upload.js';

let controller=null;
let pollTimer=null;
let waitingTimer=null;
const signalTimers=new Map();
const MARKETING_KEY='m-platform.ai-marketing.v2';
const GUEST_KEY='m-platform.ai-guest-key.v1';
const CONVERSATION_KEY='m-platform.ai-conversation.v1';
const MAX_PROACTIVE_MESSAGES=3;
const PROACTIVE_COOLDOWN=90000;

const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const copy={
  ar:{
    title:'مساعد M الذكي',subtitle:'مستشار مشتريات وتوريد',waitingSubtitle:'بانتظار موظف · المساعد مستمر معك',humanSubtitle:'فريق M يتولى المحادثة الآن',team:'فريق M',
    placeholder:'اكتب ماذا تبحث عنه...',send:'إرسال',close:'إغلاق',photo:'إضافة صورة من الكاميرا أو الاستديو',imageReady:'الصورة جاهزة للبحث',imageError:'تعذر قراءة الصورة. اختر صورة أخرى.',imageSearch:'📷 بحث بصورة',
    guestHello:'مرحبًا 👋 أخبرني ماذا تريد شراءه، وسأساعدك في اختيار الأنسب من المنتجات المتاحة.',
    clientHello:'مرحبًا 👋 أخبرني ماذا تحتاج، وسأساعدك في مشترياتك وطلبات التوريد.',
    error:'تعذر الحصول على رد الآن. حاول مرة أخرى.',thinking:'جاري البحث...',leadTitle:'هل تريد أن نتواصل معك؟',leadText:'حتى لا نفقد التواصل إذا أغلقت الصفحة، اترك رقم واتساب أو وسيلة تواصل وسيتابع معك الموظف.',leadContact:'رقم واتساب أو وسيلة التواصل',leadName:'الاسم (اختياري)',leadSave:'حفظ وسيلة التواصل',leadSaved:'تم حفظ وسيلة التواصل',waitingLong:'فريق خدمة العملاء مشغول حاليًا، لكن طلبك محفوظ ويمكنني الاستمرار في مساعدتك حتى يستلم الموظف.',
    chipsGuest:['أبحث عن أفضل منتج لسوقي','قارن لي بين المنتجات المناسبة','لم أجد المنتج الذي أريده'],
    chipsClient:['اقترح لي منتجًا مناسبًا','ما حالة طلب التوريد؟','أين وصل طلبي؟']
  },
  en:{
    title:'M AI Assistant',subtitle:'Smart buying & sourcing advisor',waitingSubtitle:'Waiting for an agent · AI can still help',humanSubtitle:'M Team is handling this conversation',team:'M Team',
    placeholder:'Tell me what you are looking for...',send:'Send',close:'Close',photo:'Add image from camera or photo library',imageReady:'Image ready to search',imageError:'Could not read this image. Choose another image.',imageSearch:'📷 Image search',
    guestHello:'Hi 👋 Tell me what you want to buy and I will help you choose the best fit from available products.',
    clientHello:'Hi 👋 Tell me what you need and I can help with your purchases and sourcing requests.',
    error:'I could not get a response right now. Please try again.',thinking:'Searching...',leadTitle:'Want us to contact you?',leadText:'If you leave the page, add a WhatsApp number or contact method so our team can follow up.',leadContact:'WhatsApp or contact method',leadName:'Name (optional)',leadSave:'Save contact',leadSaved:'Contact saved',waitingLong:'Our customer service team is busy right now. Your request is saved and I can keep helping until an agent takes over.',
    chipsGuest:['Find the best product for my market','Compare suitable products','I cannot find the product I need'],
    chipsClient:['Recommend a suitable product','What is my sourcing request status?','Where is my order?']
  }
};

function language(){return controller?.language?.()==='en'?'en':'ar';}
function t(key){return copy[language()][key];}
function visitorKey(){
  try{
    let key=localStorage.getItem(GUEST_KEY)||'';
    if(!/^[A-Za-z0-9_-]{20,120}$/.test(key)){
      key=(globalThis.crypto?.randomUUID?.()||('g-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2))).replace(/[^A-Za-z0-9_-]/g,'');
      localStorage.setItem(GUEST_KEY,key);
    }
    return key;
  }catch{return 'g-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);}
}
function conversationStore(){
  try{const parsed=JSON.parse(localStorage.getItem(CONVERSATION_KEY)||'{}');return parsed&&typeof parsed==='object'?parsed:{};}catch{return{};}
}
function storedConversationId(mode){return String(conversationStore()[mode]||'');}
function storeConversationId(mode,id){
  try{const state=conversationStore();if(id)state[mode]=id;else delete state[mode];localStorage.setItem(CONVERSATION_KEY,JSON.stringify(state));}catch{}
}
function marketingState(){
  try{const parsed=JSON.parse(sessionStorage.getItem(MARKETING_KEY)||'{}');return parsed&&typeof parsed==='object'?parsed:{};}catch{return{};}
}
function saveMarketingState(state){try{sessionStorage.setItem(MARKETING_KEY,JSON.stringify(state));}catch{}}
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
      <form class="m-ai-lead hidden"><div><strong></strong><p></p></div><input name="contact" maxlength="160" required><input name="name" maxlength="120"><button type="submit"></button></form>
      <div class="m-ai-waiting-note hidden"></div>
      <div class="m-ai-image-preview hidden"><img alt=""><span></span><button type="button" aria-label="Remove image">×</button></div>
      <form class="m-ai-form"><label class="m-ai-photo" title=""><span>📷</span><input type="file" accept="image/*"></label><textarea rows="1" maxlength="2000"></textarea><button type="submit"></button></form>
    </section>`;
  document.body.append(host);
  host.querySelector('.m-ai-launcher').addEventListener('click',()=>{markEngaged();setOpen(host.querySelector('.m-ai-panel').classList.contains('hidden'));});
  host.querySelector('.m-ai-close').addEventListener('click',()=>setOpen(false));
  host.querySelector('.m-ai-nudge').addEventListener('click',event=>{
    if(event.target.closest('.m-ai-nudge-close')){event.preventDefault();event.stopPropagation();hideNudge();return;}
    markEngaged();hideNudge();setOpen(true);
  });
  host.querySelector('.m-ai-form').addEventListener('submit',submit);
  host.querySelector('.m-ai-lead').addEventListener('submit',submitLead);
  host.querySelector('.m-ai-photo input').addEventListener('change',selectImage);
  host.querySelector('.m-ai-image-preview button').addEventListener('click',clearPendingImage);
  host.querySelector('textarea').addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();host.querySelector('.m-ai-form').requestSubmit();}
  });
  host.querySelector('.m-ai-chips').addEventListener('click',event=>{
    const button=event.target.closest('button[data-prompt]');if(!button)return;
    host.querySelector('textarea').value=button.dataset.prompt;host.querySelector('.m-ai-form').requestSubmit();
  });
  return host;
}
function markEngaged(){const state=marketingState();state.chatEngaged=true;saveMarketingState(state);}
function hideNudge(){const nudge=document.querySelector('#mAiChat .m-ai-nudge');if(nudge)nudge.classList.add('hidden');}
function showNudge(text){
  const host=ensureHost(),nudge=host.querySelector('.m-ai-nudge');
  nudge.querySelector('p').textContent=String(text||'');nudge.classList.remove('hidden');
  clearTimeout(showNudge.timer);showNudge.timer=setTimeout(hideNudge,14000);
}
function setOpen(open){
  const host=ensureHost(),panel=host.querySelector('.m-ai-panel'),button=host.querySelector('.m-ai-launcher');
  panel.classList.toggle('hidden',!open);button.setAttribute('aria-expanded',String(open));
  if(open){hideNudge();render();void syncRemote(true);setTimeout(()=>host.querySelector('textarea')?.focus(),30);}
}
function safeProductImage(src){
  const value=String(src||'');
  return /^\/api\/media\/[a-f0-9-]{36}$/i.test(value)||/^https:\/\/ueeshop\.ly200-cdn\.com\//i.test(value)?value:'';
}
function productCardsHtml(products=[]){
  const rows=Array.isArray(products)?products.slice(0,6):[];
  if(!rows.length)return '';
  return `<div class="m-ai-products" aria-label="${esc(language()==='ar'?'منتجات مقترحة':'Suggested products')}">${rows.map(product=>{
    const image=safeProductImage(product.image),price=Number.isFinite(Number(product.price))?Number(product.price):null;
    return `<a class="m-ai-product-card" href="${esc(product.href||('/?product='+encodeURIComponent(product.id||'')))}">
      <span class="m-ai-product-image">${image?`<img src="${esc(image)}" alt="" loading="lazy" decoding="async">`:'<span class="m-ai-product-placeholder">M</span>'}</span>
      <strong>${esc(product.title||product.sku||'')}</strong>
      ${price!==null?`<span class="m-ai-product-price">${esc(new Intl.NumberFormat(language()==='ar'?'ar-SA':'en',{maximumFractionDigits:2}).format(price))} ${esc(product.currency||'SAR')}</span>`:''}
      ${product.moq!==null&&product.moq!==undefined&&product.moq!==''?`<small>MOQ ${esc(product.moq)}</small>`:''}
      <i aria-hidden="true">↗</i>
    </a>`;
  }).join('')}</div>`;
}
function messageHtml(row){
  const meta=row?.metadata||{},sender=row.role==='admin'?'<small class="m-ai-sender">'+esc(t('team'))+'</small>':'';
  return `<div class="m-ai-row ${row.role==='user'?'user':'assistant'}"><div>${sender}<span class="m-ai-message-text">${esc(row.content)}</span>${row.role!=='user'?productCardsHtml(meta.products):''}</div></div>`;
}
function latestQuickReplies(){
  if(controller?.humanMode)return [];
  for(let i=(controller?.messages?.length||0)-1;i>=0;i--){
    const rows=controller.messages[i]?.metadata?.quickReplies;
    if(Array.isArray(rows)&&rows.length)return rows.slice(0,4);
  }
  return [];
}
function latestProductSku(){
  for(let i=(controller?.messages?.length||0)-1;i>=0;i--){
    const sku=controller.messages[i]?.metadata?.products?.[0]?.sku;
    if(sku)return String(sku);
  }
  return '';
}
function waitingTooLong(){
  const at=Date.parse(controller?.waitingSince||'');
  return !!at&&Date.now()-at>=5*60*1000;
}
function render(){
  if(!controller)return;
  const host=ensureHost(),lang=language(),rtl=lang==='ar';
  host.dir=rtl?'rtl':'ltr';
  host.querySelector('.m-ai-head strong').textContent=t('title');
  host.querySelector('.m-ai-head small').textContent=controller.humanMode?t('humanSubtitle'):controller.waitingHuman?t('waitingSubtitle'):t('subtitle');
  host.querySelector('.m-ai-close').setAttribute('aria-label',t('close'));
  host.querySelector('textarea').placeholder=t('placeholder');
  host.querySelector('.m-ai-form button').textContent=t('send');
  const photo=host.querySelector('.m-ai-photo');photo.title=t('photo');photo.setAttribute('aria-label',t('photo'));
  const preview=host.querySelector('.m-ai-image-preview');
  preview.classList.toggle('hidden',!controller.pendingImage);
  if(controller.pendingImage){preview.querySelector('img').src=controller.pendingImage;preview.querySelector('span').textContent=t('imageReady');}

  const messages=host.querySelector('.m-ai-messages');
  const greeting=controller.mode==='client'?t('clientHello'):t('guestHello');
  const rows=[{role:'assistant',content:greeting,metadata:{}},...controller.messages];
  messages.innerHTML=rows.map(messageHtml).join('');
  if(controller.loading&&!controller.humanMode)messages.insertAdjacentHTML('beforeend',`<div class="m-ai-row assistant"><div class="m-ai-thinking"><span></span><span></span><span></span> ${esc(t('thinking'))}</div></div>`);

  const dynamic=latestQuickReplies(),initial=controller.mode==='client'?t('chipsClient'):t('chipsGuest'),chips=dynamic.length?dynamic:controller.messages.length?[]:initial;
  host.querySelector('.m-ai-chips').innerHTML=chips.map(label=>`<button type="button" data-prompt="${esc(label)}">${esc(label)}</button>`).join('');

  const lead=host.querySelector('.m-ai-lead'),showLead=controller.mode==='guest'&&controller.waitingHuman&&!controller.leadCaptured&&typeof controller.captureLead==='function';
  lead.classList.toggle('hidden',!showLead);
  if(showLead){
    lead.querySelector('strong').textContent=t('leadTitle');lead.querySelector('p').textContent=t('leadText');
    lead.elements.contact.placeholder=t('leadContact');lead.elements.name.placeholder=t('leadName');lead.querySelector('button').textContent=t('leadSave');
  }

  const waiting=host.querySelector('.m-ai-waiting-note'),showWaiting=controller.waitingHuman&&waitingTooLong()&&!controller.humanMode;
  waiting.classList.toggle('hidden',!showWaiting);waiting.textContent=showWaiting?t('waitingLong'):'';
  clearTimeout(waitingTimer);waitingTimer=null;
  if(controller.waitingHuman&&!controller.humanMode&&!showWaiting)waitingTimer=setTimeout(()=>render(),Math.max(1000,5*60*1000-(Date.now()-Date.parse(controller.waitingSince||Date.now()))));

  const input=host.querySelector('textarea'),send=host.querySelector('.m-ai-form button'),photoInput=host.querySelector('.m-ai-photo input');
  input.disabled=controller.loading;send.disabled=controller.loading;photoInput.disabled=controller.loading;
  requestAnimationFrame(()=>{messages.scrollTop=messages.scrollHeight;});
}
function setConversationId(id){
  if(!controller||!id)return;
  controller.conversationId=String(id);storeConversationId(controller.mode,controller.conversationId);startPolling();
}
function startPolling(){
  if(pollTimer||!controller?.conversationId||typeof controller.fetchConversation!=='function')return;
  pollTimer=setInterval(()=>void syncRemote(false),7000);
}
function stopPolling(){clearInterval(pollTimer);pollTimer=null;}
async function syncRemote(silent=false){
  if(!controller?.conversationId||typeof controller.fetchConversation!=='function')return;
  try{
    const result=await controller.fetchConversation({conversationId:controller.conversationId,guestKey:visitorKey(),language:language()});
    if(!result?.conversation)return;
    controller.humanMode=result.conversation.status==='human';
    controller.waitingHuman=!!result.conversation.waitingHuman;
    controller.waitingSince=String(result.conversation.waitingSince||'');
    controller.leadCaptured=!!result.conversation.leadCaptured;
    const incoming=(result.messages||[]).map(row=>({
      id:Number(row.id)||0,
      role:row.sender==='customer'?'user':row.sender==='admin'?'admin':'assistant',
      content:String(row.content||''),
      metadata:row.metadata&&typeof row.metadata==='object'?row.metadata:{}
    })).filter(x=>x.content);
    const latestId=incoming.reduce((m,x)=>Math.max(m,x.id||0),0);
    const lastAdmin=[...incoming].reverse().find(x=>x.role==='admin'&&(x.id||0)>Number(controller.lastRemoteId||0));
    if(lastAdmin&&!silent&&ensureHost().querySelector('.m-ai-panel').classList.contains('hidden'))showNudge(lastAdmin.content);
    if(incoming.length)controller.messages=incoming.slice(-40);
    controller.lastRemoteId=Math.max(Number(controller.lastRemoteId||0),latestId);
    render();
  }catch{}
}
async function selectImage(event){
  if(!controller||controller.loading)return;
  const input=event.currentTarget;if(!input.files?.length)return;
  try{
    const sources=await filesToCompressedSources(input,{maxFiles:1,targetBytes:420*1024,maxDimension:1024});
    controller.pendingImage=sources[0]||'';render();
  }catch{
    controller.pendingImage='';
    const host=ensureHost(),messages=host.querySelector('.m-ai-messages');
    messages.insertAdjacentHTML('beforeend',`<div class="m-ai-row assistant"><div>${esc(t('imageError'))}</div></div>`);
  }finally{input.value='';}
}
function clearPendingImage(){
  if(!controller)return;controller.pendingImage='';render();
}
async function submitLead(event){
  event.preventDefault();
  if(!controller||controller.loading||typeof controller.captureLead!=='function'||!controller.conversationId)return;
  const form=event.currentTarget,contact=form.elements.contact.value.trim(),name=form.elements.name.value.trim();
  if(!contact)return;
  const button=form.querySelector('button');button.disabled=true;
  try{
    const result=await controller.captureLead({
      conversationId:controller.conversationId,guestKey:visitorKey(),language:language(),
      contact,name,productSku:latestProductSku()
    });
    controller.leadCaptured=!!result?.leadCaptured;
    if(result?.reply)controller.messages.push({role:'assistant',content:String(result.reply),metadata:{}});
    await syncRemote(true);
  }catch(error){
    controller.messages.push({role:'assistant',content:String(error?.message||t('error')),metadata:{}});
  }finally{button.disabled=false;render();}
}
async function submit(event){
  event.preventDefault();
  if(!controller||controller.loading)return;
  const host=ensureHost(),input=host.querySelector('textarea'),message=input.value.trim(),image=controller.pendingImage||'';if(!message&&!image)return;
  markEngaged();hideNudge();input.value='';controller.pendingImage='';
  const visibleMessage=message||t('imageSearch');
  controller.messages.push({role:'user',content:visibleMessage,metadata:{}});controller.messages=controller.messages.slice(-40);
  controller.loading=true;render();
  try{
    const history=controller.messages.slice(0,-1).slice(-6).map(x=>({role:x.role==='user'?'user':'assistant',content:x.content}));
    const result=await controller.send({message:message||t('imageSearch'),history,language:language(),guestKey:visitorKey(),conversationId:controller.conversationId||'',...(image?{image}: {})});
    if(result?.conversationId)setConversationId(result.conversationId);
    controller.humanMode=!!result?.humanMode;
    controller.waitingHuman=!!result?.waitingHuman||controller.waitingHuman&&!controller.humanMode;
    if(result?.waitingHuman&&!controller.waitingSince)controller.waitingSince=new Date().toISOString();
    if(result?.leadPrompt===true)controller.leadCaptured=false;
    if(result?.reply)controller.messages.push({role:'assistant',content:String(result.reply),metadata:{products:result.recommendations||[],quickReplies:result.quickReplies||[],...(result.waitingHuman?{handoff:'waiting'}:{}),...(result.leadPrompt?{leadPrompt:true}:{})}});
    await syncRemote(true);
  }catch(error){
    controller.messages.push({role:'assistant',content:String(error?.message||t('error')),metadata:{}});
  }finally{
    controller.loading=false;controller.messages=controller.messages.slice(-40);render();
  }
}
function scheduleSignal(key,delay,fn){clearTimeout(signalTimers.get(key));signalTimers.set(key,setTimeout(()=>{signalTimers.delete(key);fn();},delay));}
function eligibleForProactive(){
  if(!controller||controller.loading||controller.humanMode||document.hidden)return false;
  const host=ensureHost(),state={count:0,lastAt:0,chatEngaged:false,...marketingState()};
  if(!host.querySelector('.m-ai-panel').classList.contains('hidden'))return false;
  if(state.chatEngaged||Number(state.count||0)>=MAX_PROACTIVE_MESSAGES||Date.now()-Number(state.lastAt||0)<PROACTIVE_COOLDOWN)return false;
  return true;
}
async function requestProactive(signal){
  if(!eligibleForProactive())return;
  const state=marketingState();state.count=Number(state.count||0)+1;state.lastAt=Date.now();saveMarketingState(state);
  try{
    const result=await controller.send({
      message:language()==='ar'?'أنشئ رسالة مساعدة استباقية مناسبة لهذا العميل.':'Create a suitable proactive sales-assistance message for this customer.',
      history:controller.messages.slice(-6).map(x=>({role:x.role==='user'?'user':'assistant',content:x.content})),
      language:language(),marketingSignal:signal
    });
    const reply=String(result?.reply||'').trim();if(!reply)return;
    controller.messages.push({role:'assistant',content:reply});controller.messages=controller.messages.slice(-40);
    showNudge(reply);render();
  }catch{}
}
export function aiChatSignal(type,detail={}){
  if(!controller)return;
  const state={count:0,lastAt:0,views:{},distinct:[],chatEngaged:false,...marketingState()};
  if(type==='product_view'){
    const key=String(detail.sku||detail.title||'product').slice(0,120);
    state.views={...(state.views||{}),[key]:Number(state.views?.[key]||0)+1};
    state.distinct=[...new Set([...(Array.isArray(state.distinct)?state.distinct:[]),key])].slice(-8);saveMarketingState(state);
    const repeated=state.views[key]>=2,comparing=state.distinct.length>=3;
    scheduleSignal('product-interest',repeated?4500:comparing?6500:14000,()=>requestProactive({type:repeated?'repeated_product':comparing?'comparing_products':'product_interest',...detail,viewedTimes:state.views[key],distinctProducts:state.distinct.length}));
    return;
  }
  if(type==='search'){
    const query=String(detail.query||'').trim();if(query.length<3)return;
    scheduleSignal('search',1100,()=>{if(Number(detail.results)===0)return requestProactive({type:'search_no_results',...detail});if(Number(detail.results)<=3)return requestProactive({type:'narrow_search',...detail});});
    return;
  }
  if(type==='cart_add'){scheduleSignal('cart-add',Number(detail.cartCount)>=2?5000:11000,()=>requestProactive({type:'cart_interest',...detail}));return;}
  if(type==='cart_open'&&Number(detail.cartCount)>0)scheduleSignal('cart-open',15000,()=>requestProactive({type:'cart_hesitation',...detail}));
}
export function mountAiChat({mode='guest',language:languageGetter=()=> 'ar',send,fetchConversation,captureLead}={}){
  if(typeof send!=='function')return;
  const sameMode=controller?.mode===mode,stored=storedConversationId(mode);
  stopPolling();clearTimeout(waitingTimer);waitingTimer=null;
  controller={
    mode,language:languageGetter,send,fetchConversation,captureLead,
    messages:sameMode?controller.messages:[],loading:false,
    humanMode:sameMode?controller.humanMode:false,waitingHuman:sameMode?controller.waitingHuman:false,
    waitingSince:sameMode?controller.waitingSince||'':'',leadCaptured:sameMode?controller.leadCaptured:false,
    conversationId:sameMode?controller.conversationId||stored:stored,lastRemoteId:sameMode?controller.lastRemoteId||0:0,
    pendingImage:sameMode?controller.pendingImage||'':''
  };
  const host=ensureHost();host.classList.remove('hidden');render();
  if(controller.conversationId){startPolling();setTimeout(()=>void syncRemote(true),120);}
}
export function unmountAiChat(){
  controller=null;stopPolling();clearTimeout(waitingTimer);waitingTimer=null;for(const timer of signalTimers.values())clearTimeout(timer);signalTimers.clear();document.getElementById('mAiChat')?.remove();
}
