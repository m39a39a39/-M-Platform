import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedWebOrigin} from '../backend/app.mjs';

test('custom production origins are allowlisted explicitly',()=>{
  const previous=process.env.APP_ORIGINS;
  process.env.APP_ORIGINS='https://imsgsource.com, https://www.imsgsource.com, https://m-platform-tan.vercel.app';
  try{
    assert.equal(allowedWebOrigin('https://www.imsgsource.com','https://www.imsgsource.com'),true);
    assert.equal(allowedWebOrigin('https://imsgsource.com','https://www.imsgsource.com'),true);
    assert.equal(allowedWebOrigin('https://m-platform-tan.vercel.app','https://www.imsgsource.com'),true);
    assert.equal(allowedWebOrigin('https://evil.example','https://www.imsgsource.com'),false);
    assert.equal(allowedWebOrigin('','https://www.imsgsource.com'),false);
  }finally{
    if(previous===undefined)delete process.env.APP_ORIGINS;
    else process.env.APP_ORIGINS=previous;
  }
});
