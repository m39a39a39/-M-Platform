import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeKnowledgeBase} from '../backend/modules/mutations.mjs';
import {searchKnowledgeBase,directKnowledgeAnswer} from '../backend/modules/ai-chat.mjs';

const knowledgeBase=normalizeKnowledgeBase([
  {
    id:'company-address',
    category:'company',
    questionAr:'أين موقع شركتكم؟',
    questionEn:'Where is your company located?',
    answerAr:'مقر الشركة في قوانزو، الصين.',
    answerEn:'The company is based in Guangzhou, China.',
    keywords:['وين مقركم','عنوان الشركة','موقعكم','company address'],
    active:true
  },
  {
    id:'inactive-entry',
    category:'general',
    questionAr:'هل لديكم فرع في جدة؟',
    answerAr:'إجابة غير مفعلة',
    keywords:['فرع جدة'],
    active:false
  }
]);

const state={settings:{knowledgeBase}};

test('knowledge base normalization keeps safe structured fields',()=>{
  assert.equal(knowledgeBase.length,2);
  assert.equal(knowledgeBase[0].id,'company-address');
  assert.equal(knowledgeBase[0].order,0);
  assert.deepEqual(knowledgeBase[0].keywords,['وين مقركم','عنوان الشركة','موقعكم','company address']);
});

test('customer knowledge search understands alternate Arabic phrasing',()=>{
  const result=searchKnowledgeBase(state,'وين مقركم؟','ar');
  assert.equal(result.matches[0]?.id,'company-address');
  assert.match(directKnowledgeAnswer(state,'وين مقركم؟','ar'),/قوانزو/);
});

test('customer knowledge search supports English phrasing',()=>{
  const result=searchKnowledgeBase(state,'What is your company address?','en');
  assert.equal(result.matches[0]?.id,'company-address');
  assert.match(directKnowledgeAnswer(state,'What is your company address?','en'),/Guangzhou/);
});

test('inactive knowledge entries are ignored',()=>{
  const result=searchKnowledgeBase(state,'فرع جدة','ar');
  assert.equal(result.matches.some(row=>row.id==='inactive-entry'),false);
});


test('exact knowledge aliases tolerate Arabic diacritics and punctuation',()=>{
  assert.match(directKnowledgeAnswer(state,'  وَيْن مَقَرّكم؟!  ','ar'),/قوانزو/);
});

test('exact English aliases can answer without overlapping the stored question',()=>{
  const aliases={settings:{knowledgeBase:[{
    id:'visit',questionEn:'Can we arrange a visit?',answerEn:'Please book an appointment.',
    keywords:['office appointment'],active:true
  }]}};
  assert.equal(directKnowledgeAnswer(aliases,'Office appointment?','en'),'Please book an appointment.');
});

test('partial and single-word keyword matches do not force a direct answer',()=>{
  assert.equal(directKnowledgeAnswer(state,'اريد عنوان الشركة على الفاتورة','ar'),null);
  assert.equal(directKnowledgeAnswer(state,'موقعكم','ar'),null);
  assert.equal(directKnowledgeAnswer(state,'كم سعر السماعات؟','ar'),null);
});

test('an exact alias cannot activate a disabled knowledge entry',()=>{
  assert.equal(directKnowledgeAnswer(state,'فرع جدة','ar'),null);
});
