import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const hooks=registerHooks({load(url,context,next){return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:next(url,context);}});
const {mountAiChat,unmountAiChat}=await import('../src/ai-chat.js');
hooks.deregister();
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
// Small DOM double: exercise registered event handlers and rendered output,
// without timers, a real browser, or any external requests.
function harness(){
 const saved=new Map(),originals=new Map();let host=null;
 function element(){const children=new Map(),classes=new Set();return {value:'',innerHTML:'',textContent:'',disabled:false,events:{},dataset:{},
  classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}},
  querySelector(s){if(!children.has(s))children.set(s,element());return children.get(s);},
  addEventListener(k,f){this.events[k]=f;},setAttribute(){},insertAdjacentHTML(_,s){this.innerHTML+=s;},remove(){if(host===this)host=null;},focus(){}};}
 const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 const globals={document:{hidden:false,getElementById:()=>host,createElement:element,body:{append:e=>{host=e;}},querySelector:()=>null},localStorage:storage,sessionStorage:storage,requestAnimationFrame:f=>f(),setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{}};
 for(const [k,v] of Object.entries(globals)){originals.set(k,globalThis[k]);globalThis[k]=v;}
 return {host:()=>host,async submit(text){host.querySelector('textarea').value=text;return host.querySelector('.m-ai-form').events.submit({preventDefault(){}});},restore(){unmountAiChat();for(const [k,v] of originals){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}};
}
test('late successful and failed sends cannot populate a replacement session',async()=>{
 for(const fail of [false,true]){
  const h=harness(),pending=deferred();
  try{
   mountAiChat({mode:'guest',send:()=>pending.promise});
   const work=h.submit('old session question');
   unmountAiChat();mountAiChat({mode:'client',send:async()=>({reply:'new'})});
   if(fail)pending.reject(Error('old session failure'));else pending.resolve({reply:'old private response'});
   await work;
   const html=h.host().querySelector('.m-ai-messages').innerHTML;
   assert.doesNotMatch(html,/old private response|old session failure|old session question/);
   assert.equal(h.host().querySelector('textarea').disabled,false);
  }finally{h.restore();}
 }
});
test('same-mode remount preserves the pending send and prevents duplicates',async()=>{
 const h=harness(),pending=deferred();let sends=0;
 const send=()=>{sends++;return pending.promise;};
 try{
  mountAiChat({mode:'guest',send});const work=h.submit('question');
  mountAiChat({mode:'guest',send});
  assert.equal(h.host().querySelector('textarea').disabled,true);
  await h.submit('duplicate');assert.equal(sends,1);
  pending.resolve({reply:'answer'});await work;
  assert.match(h.host().querySelector('.m-ai-messages').innerHTML,/answer/);
  assert.equal(h.host().querySelector('textarea').disabled,false);
 }finally{h.restore();}
});
test('unmount during send does not throw or recreate the chat',async()=>{
 const h=harness(),pending=deferred();
 try{mountAiChat({send:()=>pending.promise});const work=h.submit('question');unmountAiChat();pending.resolve({reply:'late'});await work;assert.equal(h.host(),null);}finally{h.restore();}
});
