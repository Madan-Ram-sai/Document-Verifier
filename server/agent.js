// The decision step receives the full portal record and OCR result for one document.
// Without AGENT_URL, the temporary local agent accepts every document.
//
// POST AGENT_URL   body: { doc: {name, details}, record: {kv, acad, pageText}, extracted: <OCR json> }
// reply            : { status, checks: [{ field, expected, found, status, reason? }] }

const VALID = new Set(['pass', 'fail', 'review']);

export async function decide(doc, record, extracted) {
  const url = process.env.AGENT_URL;
  if (!url) return { status: 'pass', checks: [{ field: 'agent', status: 'pass' }] };
  const r = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ doc, record, extracted }),
  });
  if (!r.ok) throw new Error('agent ' + r.status);
  const d = await r.json();
  if (!VALID.has(d.status) || !Array.isArray(d.checks)) throw new Error('agent returned an invalid shape');
  return d;
}
