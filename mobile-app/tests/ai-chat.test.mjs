import test from 'node:test';
import assert from 'node:assert/strict';
import {latestAssistantQuickReplies} from '../src/ai-chat-state.js';

test('product quick replies come only from the latest assistant response',()=>{
  const messages=[
    {role:'assistant',content:'Products',metadata:{products:[{id:'p1'}],quickReplies:['أرخص خيار','قارن بينها','عرض المزيد']}},
    {role:'user',content:'اسم الشركة',metadata:{}},
    {role:'assistant',content:'GUANGZHOU MIG TRADING CO., LTD.',metadata:{products:[],quickReplies:[]}}
  ];
  assert.deepEqual(latestAssistantQuickReplies(messages,false),[]);
});

test('product quick replies stay visible when the latest assistant response has product cards',()=>{
  const messages=[
    {role:'assistant',content:'Earlier',metadata:{}},
    {role:'assistant',content:'Products',metadata:{products:[{id:'p1'}],quickReplies:['أرخص خيار','قارن بينها','عرض المزيد']}}
  ];
  assert.deepEqual(latestAssistantQuickReplies(messages,false),['أرخص خيار','قارن بينها','عرض المزيد']);
});

test('human mode suppresses quick replies',()=>{
  const messages=[{role:'assistant',content:'Products',metadata:{products:[{id:'p1'}],quickReplies:['أرخص خيار']}}];
  assert.deepEqual(latestAssistantQuickReplies(messages,true),[]);
});
