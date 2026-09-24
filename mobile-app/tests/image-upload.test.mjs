import test from 'node:test';
import assert from 'node:assert/strict';
import {filesToCompressedSources,imageUploadLimits} from '../src/image-upload.js';
test('10 MiB source limit rejects larger images before decoding',async()=>{
 assert.equal(imageUploadLimits.maxInputBytes,10*1024*1024);
 await assert.rejects(filesToCompressedSources({files:[new Blob([new Uint8Array(10*1024*1024+1)],{type:'image/png'})]}),/too_large/);
 assert.ok(imageUploadLimits.targetBytes*4/3<4500000);
});
