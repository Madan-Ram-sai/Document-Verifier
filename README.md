# Doc Verifier

Chrome/Edge extension (Manifest V3) + Node.js backend. The extension reads the open, logged-in
verification page, grabs each document's PDF or JPG, sends it to the backend, and ticks the
"Verification Status" checkbox only if every check passes. Otherwise it shows the reason under the checkbox.

```
 Portal tab (already logged in)
   content.js ── reads page record (name, DOB, 10th/12th marks…), clicks "View", captures the PDF
        │  chrome.runtime messages
   background.js ── uploads PDF/JPG + record ─────────►  server/index.js   POST /verify-doc  → { job_id }
        ▲                                                   │  ocr.js    → OCR service
        │  polls GET /jobs/:id                              │  agent.js  → Agent service or temporary accept-all mock
   content.js ◄── { status, checks[] } ◄────────────────────┘  audit.jsonl (every decision + evidence)
        │
   pass   → ticks checkbox        fail/review → red/amber badge: `name: PDF "ABC" ≠ UI "XYZ"`
   panel.html/js (side panel) ── Verify button, dry-run toggle, live log
```

## Setup (about 5 minutes)
Needs Node 18+ and Chrome/Edge 114+.

```bash
cp .env.example .env            # set API_URL, API_KEY, PORTAL_MATCHES
cd server && npm install && cd ..
npm run server                  # backend on :8000  (MOCK mode until OCR_URL is set)
npm run portal                  # optional: mock portal on http://localhost:5500
npm run build:dev               # builds dist/extension (dev = also allows localhost pages)
```
Then `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/extension`.
Open the portal (or http://localhost:5500), click the extension icon, keep **dry run** ticked, press **Verify this page**.
`npm test` runs the server and document-format tests.

## Plugging in the other parts
Set `OCR_URL` and `AGENT_URL` in the server environment. Until `AGENT_URL` is configured,
the temporary local agent returns `pass` for every document. This is for capture/OCR testing,
not real verification. When `OCR_URL` is unset, representative mock OCR data is used.

OCR: `POST OCR_URL` (multipart: `file`, `doc`) must return JSON  
- marksheet: `{ name, dob, board, year, obt, max, subjects:[{name,obt,max}], conf }`  
- Aadhaar: `{ name, dob, doc_number, conf }`  category cert: `{ name, father_name, cert_type, conf }`

Agent: `POST AGENT_URL` with `{ doc:{name,details}, record:{kv,acad,pageText}, extracted }` must return  
`{ status:'pass'|'fail'|'review', checks:[{ field, expected, found, status, reason? }] }`.  
Anything malformed or any error becomes `review`; nothing is ever ticked on an error.

Each captured PDF is saved under `test/` using a random filename. A captured JPG is saved
there too, along with a converted `*-ocr.pdf` sent to the OCR service. These files may contain
sensitive personal data; captured files are git-ignored and should be deleted when no longer needed.

## Safety behaviour (don't remove)
- The checkbox is ticked only when `status === 'pass'` and no check carries a reason; `fail` and `review` never tick.
- Before ticking, the page is re-read: same roll number, same row, checkbox still enabled.
- Already-ticked rows are skipped. Dry run is on by default.
- Every document row with a View link and an unchecked verification box is submitted separately.

## Deploying to many laptops
- Host the backend once, behind HTTPS (`server/Dockerfile`). Set `API_URL` to it and run `npm run build` (no `--dev`).
- Publish `dist/extension` zipped to the Chrome Web Store as **unlisted**, or force-install through
  enterprise policy (`ExtensionInstallForcelist`). Users install in one click, no ports or flags.
- `API_KEY` is embedded in the extension, so it only keeps out casual traffic. For real auth, put the
  backend behind your org's SSO/IP allow-list.

## Tuning to the real portal
Everything page-specific is in the marked block at the top of `content.js` (`kvs`, `grid`, `rows`, `vb`, `key`).
