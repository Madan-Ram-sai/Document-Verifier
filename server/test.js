import assert from 'node:assert/strict';
import { decide } from './agent.js';
import { extract } from './ocr.js';
import { toPdf } from './documents.js';

// Exactly what content.js scrapes from the portal page
const record = {
  kv: { 'roll number': 'GJ01002896', "candidate's name": 'XYZ', "father's name": 'ABC', 'date of birth': '03-10-2006' },
  acad: [
    { qualification: '10th / Matriculation', 'board / university': 'GSEB', 'passing year': '2022', 'marks obtained': '474', 'maximum marks': '600', percentage: '79.00%' },
    { qualification: '12th / Intermediate', 'board / university': 'GSEB', 'passing year': '2024', 'marks obtained': '482', 'maximum marks': '650', percentage: '74.15%' },
  ],
};
delete process.env.AGENT_URL;
const extracted = await extract(null, '10th Marksheet', record);
assert.equal(extracted.name, 'XYZ');
assert.equal(extracted.board, 'GSEB');
for (const name of ['10th Marksheet', '12th Marksheet', 'Photo ID Proof', 'Category Certificate', 'Other document']) {
  const result = await decide({ name, details: '' }, record, extracted);
  assert.equal(result.status, 'pass', `${name} should pass in mock-agent mode`);
  assert.ok(result.checks.every(check => check.status === 'pass'));
}

const pdf = Buffer.from('%PDF-1.4\nmock PDF');
assert.equal(await toPdf(pdf), pdf);
await assert.rejects(toPdf(Buffer.from('not an image')), /not a PDF or JPEG/);
const jpg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAAAQAAAAAAAAD/2Q==', 'base64');
assert.equal((await toPdf(jpg)).subarray(0, 5).toString(), '%PDF-');

console.log('mock OCR, accept-all agent, and PDF/JPG conversion tests passed');
