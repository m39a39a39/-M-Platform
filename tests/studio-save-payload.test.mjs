import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../mobile-app/public/studio/domain.js',import.meta.url),'utf8');
const context={module:{exports:{}}};
vm.runInNewContext(source,context);
const {storeDocument}=context.module.exports;

test('Studio save sends only store settings and omits the full product/media catalogs',()=>{
 const largeProducts=Array.from({length:1050},(_,i)=>({id:'item-'+i,description:'x'.repeat(2000),images:['/api/media/example']}));
 const draft={theme:{name:'IMSG'},sections:[{id:'cta',type:'cta',title:'طلب توريد خاص',titleSize:22}],categories:[{id:'audio'}],
   products:largeProducts,media:Array.from({length:1050},(_,i)=>({id:'image-'+i,image:'/api/media/'+i}))};
 const compact=storeDocument(draft);
 assert.deepEqual(Object.keys(compact).sort(),['categories','sections','theme'].sort());
 assert.equal(compact.sections[0].title,'طلب توريد خاص');
 assert.equal(compact.sections[0].titleSize,22);
 assert.equal(compact.products,undefined);
 assert.equal(compact.media,undefined);
 assert.ok(JSON.stringify(draft).length>1800000);
 assert.ok(JSON.stringify(compact).length<10000);
 // Front-end draft must not be mutated by payload preparation.
 assert.equal(draft.products.length,1050);
 assert.equal(draft.media.length,1050);
});

test('Studio save uses the compact document, not the full draft',()=>{
 const live=readFileSync(new URL('../mobile-app/public/studio/live.js',import.meta.url),'utf8');
 assert.match(live,/store:StoreRules\.storeDocument\(state\.draft\),products:edits\(\)/);
 assert.doesNotMatch(live,/store:state\.draft,products:edits\(\)/);
});
