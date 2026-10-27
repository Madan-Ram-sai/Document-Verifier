const $ = i => document.getElementById(i);
const h = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const STEPS = [['capture', 'Capturing document'], ['upload', 'Uploading to server'], ['read', 'Reading document (OCR)'], ['check', 'Checking rules']];
const TAG = { wait: 'Waiting', run: 'In progress', pass: 'Passed', fail: 'Failed', review: 'Needs review', skip: 'Already verified' };
const GL = { pass: '✓', skip: '✓', fail: '✕', review: '!' };
const SG = { pass: '✓', fail: '✕', review: '!' };
let S = null, pg = null, tab = null, hl = null;
const open = new Set();

function card(d, live) {
  const li = h('li', 'doc ' + d.status), top = h('div', 'top'), tt = h('div', 'tt');
  top.append(d.status === 'run' ? h('div', 'sp') : h('div', 'ic', GL[d.status] || ''));
  tt.append(h('b', '', d.name)); if (d.details) tt.append(h('small', '', d.details));
  top.append(tt, h('span', 'tag', d.status === 'pass' && live?.dry ? 'Passed (dry run)' : TAG[d.status]));
  li.append(top);
  const body = h('div', 'body');
  if (d.status === 'run') {
    const ci = Math.max(0, STEPS.findIndex(s => s[0] === d.step));
    body.append(h('div', 'step', STEPS[ci][1] + '…'));
    const sg = h('div', 'segs');
    STEPS.forEach((s, i) => sg.append(h('i', i < ci ? 'on' : i === ci ? 'cur' : '')));
    body.append(sg);
  } else if (d.msg) body.append(h('div', '', d.msg));
  if (d.issues?.length) { const u = h('ul', 'iss'); d.issues.forEach(x => u.append(h('li', '', x))); body.append(u); }
  if (d.checks?.length && d.status !== 'run') {
    const b = h('button', 'lnk', open.has(d.id) ? 'Hide checks' : 'Show all checks');
    b.onclick = () => { open.has(d.id) ? open.delete(d.id) : open.add(d.id); render(); };
    body.append(b);
    if (open.has(d.id)) {
      const t = h('table'), hr = h('tr');
      ['', 'Check', 'Portal', 'Document'].forEach(x => hr.append(h('th', '', x)));
      t.append(hr);
      d.checks.forEach(c => {
        const r = h('tr'), f = h('td'); f.append(h('div', '', c.field));
        if (c.reason) f.append(h('div', '', c.reason)); f.firstChild.style.fontWeight = 600;
        r.append(h('td', 's ' + c.status, SG[c.status] || ''), f, h('td', '', c.expected ?? '—'), h('td', '', c.found ?? '—'));
        t.append(r);
      });
      body.append(t);
    }
  }
  if (body.childNodes.length) li.append(body);
  return li;
}

function render() {
  const live = S?.docs?.length ? S : null, on = !!live?.on;
  const cand = live?.cand || (pg && { name: pg.name, roll: pg.roll });
  const docs = live ? live.docs : (pg?.docs || []).map((d, i) => ({ id: i, name: d.name, status: d.done ? 'skip' : 'wait', msg: d.done ? 'Already verified on the portal' : '' }));

  const c = $('conn');
  c.className = 'pill ' + (hl ? (hl.ok ? 'ok' : 'bad') : ''); c.textContent = hl ? (hl.ok ? 'Server online' : 'Server offline') : 'Checking…';

  const n = [];
  if (!pg && !live) n.push(['info', 'Open a candidate verification page that lists documents. If you just installed the extension, reload that page once.']);
  if (hl && !hl.ok) n.push(['bad', 'Cannot reach the backend. Check that the server is running and API_URL is correct.']);
  if (hl?.ok && hl.mockAgent) n.push(['warn', 'Test mode: no agent is connected, so the server approves every document. Keep Dry run on.']);
  if (hl?.ok && !hl.ocr) n.push(['warn', 'OCR is not connected: the server is using sample data, not the real document.']);
  if (live?.err) n.push(['bad', live.err]);
  $('notes').replaceChildren(...n.map(([k, x]) => h('div', 'notice ' + k, x)));

  $('cand').hidden = !cand;
  if (cand) { $('cn').textContent = cand.name || 'Candidate'; $('cr').textContent = `Roll ${cand.roll || '—'} · ${docs.length} document${docs.length === 1 ? '' : 's'}`; }

  const done = docs.filter(d => !['wait', 'run'].includes(d.status)).length;
  const ran = live && docs.some(d => !['wait', 'skip'].includes(d.status));
  $('go').disabled = on || !(pg || live) || (hl && !hl.ok);
  $('go').textContent = on ? 'Verifying…' : ran ? 'Verify again' : 'Verify documents';
  $('stop').hidden = !on; $('dry').disabled = on;
  if (live && !on) $('dry').checked = live.dry;
  $('bar').hidden = !live;
  $('fill').style.width = docs.length ? (done / docs.length * 100) + '%' : '0';
  $('cnt').textContent = `${done} of ${docs.length}`;
  $('sub').textContent = on ? 'Working on the open page…' : ran ? 'Finished' : 'Document verification assistant';

  $('docs').replaceChildren(...docs.map(d => card(d, live)));

  const cnt = k => docs.filter(d => d.status === k).length;
  $('sum').hidden = !(live && !on && ran);
  if (!$('sum').hidden) {
    $('cnts').replaceChildren(...[['pass', 'passed'], ['fail', 'failed'], ['review', 'need review']].filter(([k]) => cnt(k)).map(([k, l]) => h('span', 'c ' + k, `${cnt(k)} ${l}`)));
    const pend = docs.filter(d => d.status === 'pass' && !d.ticked).length;
    $('apply').hidden = !(live.dry && pend);
    $('apply').textContent = `Tick ${pend} passed document${pend === 1 ? '' : 's'} on the portal`;
  }
}

$('go').onclick = () => {
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { t: 'run', dry: $('dry').checked }).catch(() => {
    S = { docs: [], err: 'Could not reach the page. Reload the portal tab and try again.' }; render();
  });
};
$('stop').onclick = () => chrome.tabs.sendMessage(tab.id, { t: 'stop' }).catch(() => {});
$('apply').onclick = () => chrome.tabs.sendMessage(tab.id, { t: 'apply' }).catch(() => {});
$('dl').onclick = () => {
  const rep = { at: new Date().toISOString(), dry: S.dry, candidate: S.cand, documents: S.docs.map(({ k, ...d }) => d) };
  const a = h('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(rep, null, 2)], { type: 'application/json' }));
  a.download = `verification-${S.cand?.roll || 'report'}.json`; a.click(); URL.revokeObjectURL(a.href);
};

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  pg = null;
  try {
    const r = tab && await chrome.tabs.sendMessage(tab.id, { t: 'probe' });
    if (r) { S = r.S?.docs?.length ? r.S : null; pg = r.page; } else S = null;
  } catch { S = null; }
  render();
}
const health = async () => { hl = await chrome.runtime.sendMessage({ t: 'health' }).catch(() => ({ ok: false })); render(); };

chrome.runtime.onMessage.addListener(m => { if (m.t === 'state') { S = m.S; render(); } });
chrome.tabs.onActivated.addListener(() => { if (!S?.on) init(); });
chrome.tabs.onUpdated.addListener((id, c) => { if (tab && id === tab.id && c.status === 'complete' && !S?.on) init(); });
init(); health(); setInterval(health, 15000);