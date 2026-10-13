import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../public/studio/product-images.js',import.meta.url),'utf8');
function setup(sources=[]){
 const element=()=>({textContent:'',listeners:{},classList:{add(){},remove(){}},addEventListener(k,fn){this.listeners[k]=fn;},querySelector(){return null;},contains(){return false;},click(){}});
 const nodes=Object.fromEntries(['grid','input','status','count'].map(k=>[k,element()])),root=element(),dialog=element();
 root.querySelector=s=>nodes[{'[data-images-grid]':'grid','[data-image-input]':'input','[data-images-status]':'status','[data-image-count]':'count'}[s]];
 const form={querySelector:()=>root,closest:()=>dialog};let id=0;
 const context={window:{},crypto:{randomUUID:()=>String(++id)},URL:{createObjectURL:f=>'blob:'+f.name,revokeObjectURL(){}},Set,Array,Error};
 vm.runInNewContext(script,context);context.window.MProductImages.mount(form,sources);
 const add=files=>{nodes.input.files=files;nodes.input.listeners.change();};
 const action=(index,name)=>{const card={dataset:{imageId:form.productImages.entries()[index].id}};const button={dataset:{imageAction:name},closest:()=>card};root.listeners.click({target:{closest:s=>s==='[data-image-action]'?button:null}});};
 return {gallery:form.productImages,add,action,nodes};
}
const file=name=>({name,type:'image/png',size:100});
test('mixed retained and new images save in the selected primary order and uploads are reused',async()=>{
 const x=setup(['/api/media/old']);x.add([file('a'),file('b')]);x.action(2,'primary');const uploads=[];
 const upload=async f=>{uploads.push(f.name);return '/uploaded/'+f.name;};
 assert.equal((await x.gallery.save(upload)).join(','),'/uploaded/b,/api/media/old,/uploaded/a');
 await x.gallery.save(upload);assert.equal(uploads.join(','),'b,a');
});
test('limit and invalid batches preserve existing images; removal frees a slot',()=>{
 const x=setup(['a','b','c','d']);x.add([file('e'),file('f')]);assert.equal(x.gallery.entries().length,4);
 x.add([{...file('large'),size:11*1024*1024}]);assert.equal(x.gallery.entries().length,4);
 x.add([file('e')]);assert.equal(x.gallery.entries().length,5);x.action(0,'remove');assert.equal(x.gallery.entries().length,4);
});
test('replacement preserves position and a cancelled picker preserves the image',()=>{
 const x=setup(['a','b']);x.action(1,'replace');x.add([]);assert.equal(x.gallery.entries()[1].src,'b');x.add([file('replacement')]);assert.equal(x.gallery.entries()[0].src,'a');assert.equal(x.gallery.entries()[1].file.name,'replacement');
});
test('changing gallery during an upload rejects a stale save',async()=>{
 const x=setup(['a']);x.add([file('new')]);await assert.rejects(x.gallery.save(async()=>{x.action(0,'remove');return '/uploaded/new';}),/تغيرت الصور/);
});
