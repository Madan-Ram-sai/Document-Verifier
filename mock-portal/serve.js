import http from 'http';
import { readFile } from 'fs/promises';
import { extname, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html', '.pdf': 'application/pdf' };

http.createServer(async (q, s) => {
  const p = q.url.split('?')[0]; 
  const f = resolve(dir, '.' + (p === '/' ? '/index.html' : p));
  
  if (!f.startsWith(dir)) { 
    if (!s.headersSent) s.writeHead(403);
    s.end('forbidden'); 
    return; 
  }
  
  try {
    const data = await readFile(f);
    if (!s.headersSent) {
      s.writeHead(200, { 'content-type': types[extname(f)] || 'text/plain' });
    }
    s.end(data);
  } catch (err) {
    if (!s.headersSent) {
      s.writeHead(404, { 'content-type': 'text/plain' });
    }
    s.end('not found');
  }
}).listen(5500, () => console.log('mock portal on http://localhost:5500'));