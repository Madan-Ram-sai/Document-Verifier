const sleep = ms => new Promise(r => setTimeout(r, ms));
const txt = e => (e?.innerText ?? e?.textContent ?? '').replace(/\s+/g, ' ').trim();
const send = m => chrome.runtime.sendMessage(m).then(r => r || {}, e => ({ err: String(e) }));
const log = (s, doc, msg) => send({ t: 'log', s, doc, msg });
const frames = () => [...document.querySelectorAll('iframe,embed,object')].map(e => e.src || e.data).filter(u => u && u !== 'about:blank');
const enc = blob => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result.split(',')[1]); f.readAsDataURL(blob); });

// Child frames report document URLs to the controller frame.
if (window !== window.top) {
  const sent = new Set();
  const rel = () => (document.contentType === 'application/pdf' ? [location.href] : frames())
    .forEach(u => { if (!sent.has(u)) { sent.add(u); send({ t: 'pdf', url: u }); } });
  rel();
  new MutationObserver(rel).observe(document, { childList: true, subtree: true });
}

// ---------- page readers: tuned for portal HTML ----------
const kvs = () => {                       // "Label:" cell -> next cell
  const o = {};
  document.querySelectorAll('td,th').forEach(c => {
    const t = txt(c), n = c.nextElementSibling;
    if (t.endsWith(':') && n) o[t.slice(0, -1).replace(/[\u2018\u2019]/g, "'").trim().toLowerCase()] = txt(n);
  });
  return o;
};
const grid = re => {                      // table with header matching re -> [{col: val}]
  for (const tb of document.querySelectorAll('table')) {
    const rs = [...tb.rows].map(r => [...r.cells].map(txt));
    const h = rs.findIndex(r => r.some(c => re.test(c)));
    if (h < 0) continue;
    return rs.slice(h + 1).filter(r => r.length > 1)
      .map(r => Object.fromEntries(rs[h].map((k, i) => [k.toLowerCase(), r[i]])));
  }
  return [];
};
const rec = () => ({ kv: kvs(), acad: grid(/^qualification$/i), pageText: txt(document.body) });
const cbOf = r => r.querySelector('input[type=checkbox]');
const vb = r => {
  const e = [...r.querySelectorAll('a,button,[role=button],span,i')].find(x => /^\W*view( document)?\W*$/i.test(txt(x)));
  return e && (e.closest('a,button,[role=button]') || e);
};
const rows = () => [...document.querySelectorAll('tr,[role=row]')].filter(r => cbOf(r) && vb(r));
const key = r => txt(r.cells?.[0] ?? r.children[0]) + '|' + txt(r.cells?.[1] ?? r.children[1]);
// ----------------------------------------------------------------------

let relayed = [], base = new Set(), busy = false;
const fresh = () => ({ on: false, dry: true, stop: false, cand: null, docs: [], err: '' });
let S = fresh();
const emit = () => send({ t: 'state', S });
const step = (d, k) => { if (d.step !== k) { d.step = k; emit(); } };
const probe = () => {
  const kv = kvs();
  return { name: kv["candidate's name"], roll: kv['roll number'], docs: rows().map(r => ({ name: txt(r.cells?.[0] ?? r.children[0]), done: cbOf(r).checked })) };
};

async function getDocument(u) {
  try {
    const parsed = new URL(u, location.href);
    const wrapped = ['file', 'src', 'url'].map(k => parsed.searchParams.get(k)).find(Boolean);
    if (wrapped) u = new URL(wrapped, location.href).href;
  } catch {}
  try {
    const blob = await (await fetch(u, { credentials: 'include' })).blob();
    const b64 = await enc(blob);
    if (b64.startsWith('JVBER')) return { b64, mime: 'application/pdf' };
    if (b64.startsWith('/9j/')) return { b64, mime: 'image/jpeg' };
  } catch {}
  const result = await send({ t: 'fetch', url: u });
  return result.b64 ? { b64: result.b64, mime: result.mime } : null;
}
const direct = b => b.tagName === 'A' && /^(https?|blob):/.test(b.href) && !b.href.includes('#') ? getDocument(b.href) : null;

async function waitDocument(ms = 15000) {
  const tried = {}; let lastError = ''; const end = Date.now() + ms;
  while (Date.now() < end) {
    const m = relayed.splice(0), hit = m.find(x => x.b64);
    if (hit) return { b64: hit.b64, mime: hit.mime };
    lastError = m.find(x => x.error)?.error || lastError;
    for (const u of [...m.map(x => x.url), ...frames().filter(u => !base.has(u))]) {
      if ((tried[u] = (tried[u] || 0) + 1) > 5) continue;
      const x = await getDocument(u); if (x) return x;
    }
    await sleep(400);
  }
  throw new Error(lastError || 'Document capture timed out; the opened tab did not provide readable PDF or JPG bytes');
}

async function closeView() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.querySelector('[aria-label*=close i],[data-dismiss=modal],[data-bs-dismiss=modal],.modal .close,.btn-close')?.click();
  await sleep(400);
}

async function verify(file, meta, d) {
  step(d, 'upload');
  let r = await send({ t: 'upload', ...file, meta });
  const end = Date.now() + 240000;
  while (!r.err && r.job_id && !r.status && Date.now() < end) {
    if (S.stop) throw new Error('Stopped by user');
    step(d, r.stage === 'agent' ? 'check' : 'read');
    await sleep(1200); r = await send({ t: 'poll', id: r.job_id });
  }
  if (r.err) throw new Error(r.err);
  if (!r.status) throw new Error('Server took too long to respond');
  return r;
}

async function check(r, d, rd, id) {
  const b = vb(r);
  base = new Set(frames());
  step(d, 'capture');
  let file = await direct(b);
  if (!file) {
    const watched = await send({ t: 'watch' });
    if (watched.err) throw new Error(`Could not start PDF tab capture: ${watched.err}`);
    document.documentElement.dataset.jvCap = '1';
    b.click();
    try { file = await waitDocument(); } finally { delete document.documentElement.dataset.jvCap; await closeView(); }
  }
  return verify(file, { doc: { name: d.name, details: d.details }, record: rd, run: id }, d);
}

const COL = { ok: ['#137333', '#e6f4ea', '✔'], bad: ['#c5221f', '#fdecea', '✖'], rev: ['#b06000', '#fff4e0', '⚠'] };
function badge(cb, k, msg, all = []) {
  cb.parentElement.querySelectorAll('[data-jv]').forEach(e => e.remove());
  const s = document.createElement('span'), [c, bg, ic] = COL[k];
  s.dataset.jv = 1; s.textContent = `${ic} ${msg}`; s.title = all.join('\n');
  s.style.cssText = `display:block;font:600 12px/1.35 system-ui,sans-serif;margin-top:4px;padding:3px 8px;border-radius:6px;max-width:300px;color:${c};background:${bg}`;
  cb.after(s); cb.style.outline = `2px solid ${c}`;
}
function tick(cb) {
  if (!cb.checked) cb.click();
  if (!cb.checked) { cb.checked = true; ['input', 'change'].forEach(e => cb.dispatchEvent(new Event(e, { bubbles: true }))); }
  return cb.checked;
}

async function run(dry) {
  if (busy) return; busy = true;
  try {
    document.querySelectorAll('[data-jv]').forEach(e => e.remove());
    const rd = rec(), roll = rd.kv['roll number'], id = crypto.randomUUID();
    S = fresh(); S.dry = dry;
    if (!roll) { S.err = 'Candidate details not found on this page'; return emit(); }
    S.cand = { name: rd.kv["candidate's name"], roll };
    S.docs = rows().map((r, i) => {
      const k = key(r), [name, details] = k.split('|'), done = cbOf(r).checked;
      return { id: i, k, name, details, status: done ? 'skip' : 'wait', msg: done ? 'Already verified on the portal' : '', checks: [], issues: [] };
    });
    S.on = true; emit();
    for (const d of S.docs) {
      if (d.status === 'skip') continue;
      if (S.stop) break;
      let r = rows().find(x => key(x) === d.k); if (!r) { d.status = 'review'; d.msg = 'Row disappeared from the page'; emit(); continue; }
      d.status = 'run'; d.step = 'capture'; emit();
      let res;
      try { res = await check(r, d, rd, id); }
      catch (e) { res = { status: 'review', checks: [{ reason: String(e.message || e) }] }; }

      r = rows().find(x => key(x) === d.k);
      const cb = r && cbOf(r);
      const why = (res.checks || []).filter(c => c.status && c.status !== 'pass')
        .map(c => c.reason || `${c.field}: PDF "${c.found}" ≠ UI "${c.expected}"`);
      const pass = res.status === 'pass' && !why.length && !(res.checks || []).some(c => c.reason);
      d.checks = (res.checks || []).filter(c => c.field);
      d.issues = why.concat((res.checks || []).filter(c => c.reason && !c.status).map(c => c.reason));
      if (!cb || cb.disabled || kvs()['roll number'] !== roll) { d.status = 'review'; d.msg = 'Page changed while checking, nothing was ticked'; d.issues = []; emit(); continue; }

      if (pass) {
        d.status = 'pass';
        if (dry) { d.msg = 'All checks passed (dry run, box not ticked)'; badge(cb, 'ok', 'All checks passed (dry run, not clicked)'); }
        else if (tick(cb)) { d.ticked = true; d.msg = 'All checks passed, box ticked'; badge(cb, 'ok', 'Verified by tool'); }
        else { d.status = 'review'; d.msg = 'Checkbox click did not register'; badge(cb, 'rev', d.msg); }
      } else {
        d.status = res.status === 'fail' ? 'fail' : 'review';
        d.msg = d.status === 'fail' ? 'Not ticked: a check failed' : 'Not ticked: needs a human to look';
        badge(cb, d.status === 'fail' ? 'bad' : 'rev', d.issues[0] || 'Needs human review', d.issues);
      }
      emit();
      if (!S.stop) await sleep(500 + Math.random() * 700);
    }
  } finally { S.on = false; S.stop = false; busy = false; emit(); }
}

function applyPassed() {
  if (kvs()['roll number'] !== S.cand?.roll) { S.err = 'The page changed. Run the verification again.'; return emit(); }
  for (const d of S.docs) {
    if (d.status !== 'pass' || d.ticked) continue;
    const r = rows().find(x => key(x) === d.k), cb = r && cbOf(r);
    if (!cb || cb.disabled) { d.status = 'review'; d.msg = 'Checkbox not available'; continue; }
    if (tick(cb)) { d.ticked = true; d.msg = 'All checks passed, box ticked'; badge(cb, 'ok', 'Verified by tool'); }
    else { d.status = 'review'; d.msg = 'Checkbox click did not register'; badge(cb, 'rev', d.msg); }
  }
  S.dry = false; emit();
}

window.addEventListener('message', e => { if (e.source === window && e.data?.jv === 'open' && busy) relayed.push({ url: e.data.url }); });

chrome.runtime.onMessage.addListener((m, s, ok) => {
  if (m.t === 'pdf' && busy) relayed.push(m);
  else if (m.t === 'run' && rows().length) run(m.dry);
  else if (m.t === 'stop' && busy) S.stop = true;
  else if (m.t === 'apply' && !busy && S.docs.length) applyPassed();
  else if (m.t === 'probe' && rows().length) {
    const pg = probe();
    if (!busy && S.cand && S.cand.roll !== pg.roll) S = fresh();
    ok({ S, page: pg });
  }
});