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
  // Updated regex to support emojis/icons like "👁 View"
  const e = [...r.querySelectorAll('a,button,[role=button],span,i')].find(x => /view/i.test(txt(x)));
  return e && (e.closest('a,button,[role=button]') || e);
};
const rows = () => [...document.querySelectorAll('tr,[role=row]')].filter(r => cbOf(r) && vb(r));
const key = r => txt(r.cells?.[0] ?? r.children[0]) + '|' + txt(r.cells?.[1] ?? r.children[1]);
// ----------------------------------------------------------------------

let relayed = [], base = new Set(), busy = false;

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

async function verify(file, meta) {
  let r = await send({ t: 'upload', ...file, meta });
  for (let i = 0; i < 60 && !r.err && r.job_id && !r.status; i++) { await sleep(2000); r = await send({ t: 'poll', id: r.job_id }); }
  if (r.err) throw new Error(r.err);
  if (!r.status) throw new Error('backend timeout');
  return r;
}

async function check(r, name, details, rd, run) {
  const b = vb(r);
  base = new Set(frames());
  let file = await direct(b);
  if (!file) {
    const watched = await send({ t: 'watch' });
    if (watched.err) throw new Error(`Could not start PDF tab capture: ${watched.err}`);
    b.click();
    try { file = await waitDocument(); } finally { await closeView(); }
  }
  return verify(file, { doc: { name, details }, record: rd, run });
}

const COL = { ok: ['#137333', '✔'], bad: ['#c5221f', '✖'], rev: ['#b06000', '⚠'] };
function badge(cb, k, msg, all = []) {
  cb.parentElement.querySelectorAll('[data-jv]').forEach(e => e.remove());
  const s = document.createElement('span');
  s.dataset.jv = 1; s.textContent = `${COL[k][1]} ${msg}`; s.title = all.join('\n');
  s.style.cssText = `display:block;font:12px sans-serif;margin-top:2px;max-width:280px;color:${COL[k][0]}`;
  cb.after(s); cb.style.outline = `2px solid ${COL[k][0]}`;
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
    if (!roll) return log('review', '-', 'Candidate details not found on page');
    for (const k of rows().map(key)) {
      let r = rows().find(x => key(x) === k); if (!r) continue;
      const [name, details] = k.split('|');
      if (cbOf(r).checked) { log('pass', name, 'already verified'); continue; }
      let res;
      try { res = await check(r, name, details, rd, id); }
      catch (e) { res = { status: 'review', checks: [{ reason: String(e.message || e) }] }; }

      r = rows().find(x => key(x) === k);
      const cb = r && cbOf(r);
      const why = (res.checks || []).filter(c => c.status && c.status !== 'pass')
        .map(c => c.reason || `${c.field}: PDF "${c.found}" ≠ UI "${c.expected}"`);
      const pass = res.status === 'pass' && !why.length && !(res.checks || []).some(c => c.reason);
      if (!cb || cb.disabled || kvs()['roll number'] !== roll) { log('review', name, 'page changed, not clicked'); continue; }

      if (pass) {
        if (dry) badge(cb, 'ok', 'All checks passed (dry run, not clicked)');
        else if (tick(cb)) badge(cb, 'ok', 'Verified by tool');
        else badge(cb, 'rev', 'Checkbox click did not register');
      } else {
        const m = (res.checks || []).filter(c => c.reason && !c.status).map(c => c.reason);
        const all = why.concat(m);
        badge(cb, res.status === 'fail' ? 'bad' : 'rev', all[0] || 'Needs human review', all);
      }
      log(pass ? 'pass' : res.status, name, pass ? (dry ? 'would verify' : 'verified') : (why.join('; ') || 'needs review'));
    }
    log('info', '-', 'done');
  } finally { busy = false; }
}

chrome.runtime.onMessage.addListener(m => {
  if (m.t === 'pdf' && busy) relayed.push(m);
  if (m.t === 'run' && rows().length) run(m.dry);
});