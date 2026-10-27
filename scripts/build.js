// Builds dist/extension from extension/ using values in .env (or process env).
//   node scripts/build.js            -> production build
//   node scripts/build.js --dev      -> also allows http://localhost:* pages (for the mock portal)
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...Object.fromEntries(
  (existsSync(resolve(root, '.env')) ? readFileSync(resolve(root, '.env'), 'utf8') : '')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })), ...process.env };

const dev = process.argv.includes('--dev');
const API_URL = (env.API_URL || 'http://localhost:8000').replace(/\/$/, '');
const portal = (env.PORTAL_MATCHES || 'https://*.josaa.nic.in/*').split(',').map(s => s.trim());
const matches = dev ? [...portal, 'http://localhost/*', 'http://127.0.0.1/*'] : portal;
const hosts = [...matches, API_URL + '/*'];

const out = resolve(root, 'dist/extension');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ['background.js', 'content.js', 'main-hook.js', 'panel.html', 'panel.js'])
  cpSync(resolve(root, 'extension', f), resolve(out, f));

const mf = readFileSync(resolve(root, 'extension/manifest.template.json'), 'utf8')
  .replace('"__HOSTS__"', JSON.stringify(hosts))
  .replaceAll('"__MATCHES__"', JSON.stringify(matches));
writeFileSync(resolve(out, 'manifest.json'), JSON.stringify(JSON.parse(mf), null, 2));
writeFileSync(resolve(out, 'config.js'), `const CONFIG = ${JSON.stringify({ API_URL, API_KEY: env.API_KEY || '' })};\n`);
console.log(`Built ${out}\n  backend : ${API_URL}\n  portal  : ${matches.join(', ')}${dev ? '  (dev)' : ''}`);
