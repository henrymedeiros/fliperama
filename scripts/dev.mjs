// Servidor local pra testar o catálogo: node scripts/dev.mjs  → http://localhost:5173
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5173;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

execFileSync(process.execPath, [join(ROOT, 'scripts', 'build.mjs')], { stdio: 'inherit' });

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT + sep) && file !== ROOT) { res.writeHead(403); res.end(); return; }
    let target = file;
    const st = await stat(target).catch(() => null);
    if (st && st.isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' }); res.end(); return; }
      target = join(target, 'index.html');
    }
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': TYPES[extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Não encontrado');
  }
}).listen(PORT, () => console.log(`\n  Fliperama local: http://localhost:${PORT}\n`));
