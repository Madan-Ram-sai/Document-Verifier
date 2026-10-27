import express from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { appendFile, mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { extract } from './ocr.js';
import { decide } from './agent.js';
import { toPdf } from './documents.js';

const app = express(), up = multer({ limits: { fileSize: 25e6 } }), jobs = new Map();
const KEY = process.env.API_KEY || '';
const TEST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test');

async function saveCapture(id, buffer) {
  const isPdf = buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (!isPdf && !isJpeg) throw new Error('Uploaded document is not a PDF or JPEG');
  await mkdir(TEST_DIR, { recursive: true });
  if (isPdf) {
    const path = resolve(TEST_DIR, `${id}.pdf`);
    await writeFile(path, buffer, { flag: 'wx' });
    return buffer;
  }
  const imagePath = resolve(TEST_DIR, `${id}.jpg`);
  await writeFile(imagePath, buffer, { flag: 'wx' });
  const pdf = await toPdf(buffer);
  await writeFile(resolve(TEST_DIR, `${id}-ocr.pdf`), pdf, { flag: 'wx' });
  return pdf;
}

app.get('/health', (q, s) => s.json({ ok: true, ocr: !!process.env.OCR_URL, agent: !!process.env.AGENT_URL, mockAgent: !process.env.AGENT_URL }));
app.use((q, s, n) => (KEY && q.get('x-api-key') !== KEY ? s.sendStatus(401) : n()));

app.post('/verify-doc', up.single('file'), (q, s) => {
  let m;
  try { m = JSON.parse(q.body.meta); } catch { return s.sendStatus(400); }
  if (!q.file || !m?.doc?.name || !m?.record) return s.sendStatus(400);
  const id = randomUUID();
  jobs.set(id, null);
  saveCapture(id, q.file.buffer)
    .then(pdf => extract(pdf, m.doc.name, m.record))
    .then(x => decide(m.doc, m.record, x))
    .catch(e => ({ status: 'review', checks: [{ field: 'system', status: 'review', reason: 'Processing error: ' + e.message }] }))
    .then(r => {
      jobs.set(id, r);
      setTimeout(() => jobs.delete(id), 36e5);
      appendFile('audit.jsonl', JSON.stringify({ ts: new Date().toISOString(), run: m.run, roll: m.record.kv['roll number'], doc: m.doc.name, ...r }) + '\n').catch(e => console.error('audit write failed', e.message));
    });
  s.json({ job_id: id });
});

app.get('/jobs/:id', (q, s) => {
  if (!jobs.has(q.params.id)) return s.sendStatus(404);
  const r = jobs.get(q.params.id);
  r ? s.json(r) : s.status(202).json({ job_id: q.params.id });
});

app.listen(process.env.PORT || 8000, () => console.log('up on', process.env.PORT || 8000));
