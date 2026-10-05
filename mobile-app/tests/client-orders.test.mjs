import test from 'node:test';
import assert from 'node:assert/strict';
import {clientOrderCounts,filterClientOrders} from '../src/client-orders.js';
const orders=[
 {id:'rfq-1',title:'سَمّاعات لاسلكية',status:'sourcing',action:true,number:12001},
 {id:'cart-2',title:'Office bags',status:'completed',action:true,number:12002},
 {id:'ready-3',title:'USB cables',status:'cancelled',action:true,number:12003},
 {id:'cart-4',title:'Office notebooks',status:'received',action:false,number:12004},
];
const needsAction=order=>order.action;
const reference=order=>order.number;
test('cancelled orders are separate from completed and never need action',()=>{
 assert.deepEqual(clientOrderCounts(orders,needsAction),{all:4,active:2,action:1,completed:1,cancelled:1});
 for(const [filter,expected] of [['active',['rfq-1','cart-4']],['action',['rfq-1']],['completed',['cart-2']],['cancelled',['ready-3']]])
  assert.deepEqual(filterClientOrders(orders,{filter,needsAction}).map(o=>o.id),expected);
});
test('search combines status with Arabic digits, order reference and normalized product names',()=>{
 for(const query of ['#١٢٠٠١','۱۲۰۰۱','سماعات لاسلكية','rfq-1'])assert.equal(filterClientOrders(orders,{query,reference})[0]?.id,'rfq-1');
 assert.equal(filterClientOrders(orders,{query:' OFFICE ',filter:'active'})[0]?.id,'cart-4');
 assert.equal(filterClientOrders(orders,{query:'#12003',filter:'completed',reference}).length,0);
 assert.equal(filterClientOrders(orders,{query:'nothing'}).length,0);
 assert.equal(filterClientOrders([],{query:''}).length,0);
 assert.equal(filterClientOrders(orders,{query:'  '}).length,4);
});
