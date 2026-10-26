import test from 'node:test';
import assert from 'node:assert/strict';
import {bulkProductAi} from '../backend/modules/bulk-product-ai.mjs';

const admin={id:'00000000-0000-4000-8000-000000000001',role:'admin',is_owner:true,permissions:[]};
test('bulk product creation requires an admin with product permission',async()=>{
 await assert.rejects(bulkProductAi(null,{action:'analyze',image:'anything'}),e=>e.status===403);
 await assert.rejects(bulkProductAi({id:'x',role:'admin',is_owner:false,permissions:[]},{action:'save',id:'bulkai-00000000-0000-4000-8000-000000000002'}),e=>e.status===403);
});
test('bulk AI refuses unsupported image payloads without making paid AI calls',async()=>{
 await assert.rejects(bulkProductAi(admin,{action:'analyze',image:'data:text/plain;base64,YQ=='}),e=>e.status===400);
 await assert.rejects(bulkProductAi(admin,{action:'analyze',image:'data:image/jpeg;base64,'+'A'.repeat(480001)}),e=>e.status===400);
});
test('bulk AI rejects malformed product identifiers before any database operation',async()=>{
 await assert.rejects(bulkProductAi(admin,{action:'status',id:'another-product-id'}),e=>e.status===400);
 await assert.rejects(bulkProductAi(admin,{action:'save',id:'bulkai-abc'}),e=>e.status===400);
});
