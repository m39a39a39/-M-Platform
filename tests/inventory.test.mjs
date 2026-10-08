import test from 'node:test';
import assert from 'node:assert/strict';
import {isUnlimitedStock,trackedStock,stockAllows} from '../shared/inventory.mjs';

test('store inventory defaults to unlimited and ignores numeric stock caps',()=>{
  const product={stock:'0'};
  assert.equal(isUnlimitedStock(product),true);
  assert.equal(stockAllows(product,1000000),true);
});

test('tracked inventory respects zero and positive stock',()=>{
  assert.equal(stockAllows({stockUnlimited:false,stock:'0'},1),false);
  assert.equal(stockAllows({stockUnlimited:false,stock:'25'},25),true);
  assert.equal(stockAllows({stockUnlimited:false,stock:'25'},26),false);
  assert.equal(trackedStock({stock:'25'}),25);
});
