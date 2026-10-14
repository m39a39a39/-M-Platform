import test from 'node:test';
import assert from 'node:assert/strict';
import {extractWhatsappLinks} from '../src/ai-chat-whatsapp.js';

test('WhatsApp links are removed from visible assistant text and returned for buttons', () => {
  const result = extractWhatsappLinks('تواصل معنا: https://wa.me/message/HTAVEFYXDBIJH1');
  assert.deepEqual(result.links, ['https://wa.me/message/HTAVEFYXDBIJH1']);
  assert.equal(result.text, 'تواصل معنا:');
});

test('multiple WhatsApp destinations work, without duplicate buttons', () => {
  const result = extractWhatsappLinks('https://wa.me/12345\nhttps://api.whatsapp.com/send?phone=12345\nhttps://wa.me/12345');
  assert.deepEqual(result.links, ['https://wa.me/12345', 'https://api.whatsapp.com/send?phone=12345']);
  assert.equal(result.text, '');
});

test('Markdown WhatsApp links become buttons, not empty Markdown', () => {
  const result = extractWhatsappLinks('اضغط [هنا](https://wa.me/message/HTAVEFYXDBIJH1) للتواصل.');
  assert.equal(result.text, 'اضغط  للتواصل.');
  assert.deepEqual(result.links, ['https://wa.me/message/HTAVEFYXDBIJH1']);
});

test('trailing punctuation is not part of the WhatsApp destination', () => {
  const result = extractWhatsappLinks('افتح (https://wa.me/12345).');
  assert.equal(result.text, 'افتح ().');
  assert.deepEqual(result.links, ['https://wa.me/12345']);
});

test('other links and messages remain unchanged', () => {
  const source = 'Visit https://example.com and say hello';
  assert.deepEqual(extractWhatsappLinks(source), {text:source,links:[]});
  assert.deepEqual(extractWhatsappLinks('https://wa.me.evil.example/link'), {text:'https://wa.me.evil.example/link',links:[]});
});
