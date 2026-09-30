// Drink Heist: servidor da sala online.
// Entrega o jogo (index.html) e repassa as mensagens entre os jogadores por WebSocket.
// Sem dependências: node server.js  (porta: PORT=9000 node server.js)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 8080;
const GAME = path.join(__dirname, 'index.html');
const MAX_CLIENTS = 60;       // conexões simultâneas
const MAX_MSG = 256 * 1024;   // tamanho máximo de uma mensagem
const ID_RE = /^[a-z0-9-]{1,40}$/;
const CID_RE = /^[a-z0-9]{6,40}$/;

let publicUrl = null;
const clients = new Set();
const peers = new Map(); // id -> Client
const links = new Map(); // cid -> { a, b }

function gamePage() {
  const html = fs.readFileSync(GAME, 'utf8');
  return html.replace('<head>', '<head>\n<meta name="dh-relay" content="1">');
}

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
    let body;
    try { body = gamePage(); } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('index.html não encontrado ao lado do server.js');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(body);
    return;
  }
  if (req.method === 'GET' && url === '/info') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ publicUrl }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Não encontrado');
});

server.on('upgrade', (req, socket) => {
  const url = (req.url || '').split('?')[0];
  const key = req.headers['sec-websocket-key'];
  if (url !== '/ws' || String(req.headers.upgrade || '').toLowerCase() !== 'websocket' || !key) {
    socket.destroy();
    return;
  }
  if (clients.size >= MAX_CLIENTS) {
    socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    return;
  }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  new Client(socket);
});

class Client {
  constructor(sock) {
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    this.frag = [];
    this.id = null;
    this.alive = true;
    clients.add(this);
    sock.on('data', (d) => this.onData(d));
    sock.on('close', () => this.gone());
    sock.on('error', () => this.gone());
  }

  onData(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    if (this.buf.length > MAX_MSG + 16) return this.kill();
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; if (b.readUInt32BE(2)) return this.kill(); len = b.readUInt32BE(6); off = 10; }
      if (!masked || len > MAX_MSG) return this.kill(); // navegador sempre manda quadro mascarado
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      const payload = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      if (op === 0x8) { this.frame(0x8, Buffer.alloc(0)); return this.kill(); }
      if (op === 0x9) { this.frame(0xA, payload); continue; }
      if (op === 0xA) { this.alive = true; continue; }
      if (op === 0x0 || op === 0x1 || op === 0x2) {
        this.frag.push(payload);
        if (fin) {
          const msg = Buffer.concat(this.frag).toString('utf8');
          this.frag = [];
          if (msg.length > MAX_MSG) return this.kill();
          this.onMsg(msg);
        }
        continue;
      }
      return this.kill();
    }
  }

  frame(op, payload) {
    if (this.sock.destroyed) return;
    const len = payload.length;
    let h;
    if (len < 126) h = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(len, 2); }
    else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(len, 6); }
    this.sock.write(Buffer.concat([h, payload]));
  }

  send(obj) { this.frame(0x1, Buffer.from(JSON.stringify(obj))); }

  kill() { try { this.sock.destroy(); } catch (e) { /* já fechado */ } this.gone(); }

  gone() {
    if (!clients.has(this)) return;
    clients.delete(this);
    if (this.id && peers.get(this.id) === this) peers.delete(this.id);
    for (const [cid, l] of links) {
      if (l.a === this || l.b === this) {
        links.delete(cid);
        (l.a === this ? l.b : l.a).send({ op: 'close', cid });
      }
    }
  }

  other(cid) {
    const l = links.get(cid);
    if (!l || (l.a !== this && l.b !== this)) return null;
    return l.a === this ? l.b : l.a;
  }

  onMsg(txt) {
    let m;
    try { m = JSON.parse(txt); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    switch (m.op) {
      case 'register': {
        if (this.id) return;
        const id = m.id == null ? 'p-' + crypto.randomBytes(6).toString('hex') : m.id;
        if (typeof id !== 'string' || !ID_RE.test(id)) return this.send({ op: 'error', type: 'invalid-id' });
        if (peers.has(id)) return this.send({ op: 'error', type: 'unavailable-id' });
        this.id = id;
        peers.set(id, this);
        this.send({ op: 'open', id });
        return;
      }
      case 'connect': {
        if (!this.id || typeof m.cid !== 'string' || !CID_RE.test(m.cid) || links.has(m.cid)) return;
        const target = peers.get(m.to);
        if (!target || target === this) return this.send({ op: 'error', type: 'peer-unavailable' });
        let mine = 0;
        for (const l of links.values()) if (l.a === this || l.b === this) mine++;
        if (mine >= 8) return;
        links.set(m.cid, { a: this, b: target });
        target.send({ op: 'connection', cid: m.cid, from: this.id });
        target.send({ op: 'conn-open', cid: m.cid });
        this.send({ op: 'conn-open', cid: m.cid });
        return;
      }
      case 'data': {
        const o = this.other(m.cid);
        if (o) o.send({ op: 'data', cid: m.cid, d: m.d });
        return;
      }
      case 'close': {
        const o = this.other(m.cid);
        if (!o) return;
        links.delete(m.cid);
        o.send({ op: 'close', cid: m.cid });
        return;
      }
    }
  }
}

// derruba conexões mortas e mantém o túnel acordado
setInterval(() => {
  for (const c of clients) {
    if (!c.alive) { c.kill(); continue; }
    c.alive = false;
    c.frame(0x9, Buffer.alloc(0));
  }
}, 25000).unref();

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push('http://' + a.address + ':' + PORT);
  }
  return out;
}

// procura o executável do túnel: pasta do jogo, instalação do winget, PATH
function findBin(name) {
  const exe = process.platform === 'win32' ? name + '.exe' : name;
  const local = path.join(__dirname, exe);
  if (fs.existsSync(local)) return local;
  if (process.platform === 'win32') {
    const la = process.env.LOCALAPPDATA || '';
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const direct = [path.join(la, 'Microsoft', 'WinGet', 'Links', exe), path.join(pf, name, exe)];
    for (const c of direct) if (fs.existsSync(c)) return c;
    const pkgs = path.join(la, 'Microsoft', 'WinGet', 'Packages');
    try {
      for (const d of fs.readdirSync(pkgs)) {
        if (d.toLowerCase().includes(name)) { const c = path.join(pkgs, d, exe); if (fs.existsSync(c)) return c; }
      }
    } catch (e) { /* sem winget */ }
  }
  return exe; // tenta pelo PATH
}

// ngrok primeiro; se não tiver, cloudflared
const TUNNELS = [
  {
    name: 'ngrok',
    args: () => ['http', String(PORT), '--log=stdout', '--log-format=json'],
    url: /"url":"(https:\/\/[^"]+)"/,
    fail: /ERR_NGROK_(4018|105|107)|authtoken|authentication failed/i,
    failMsg: [
      '  O ngrok precisa do seu token (uma vez só):',
      '    1. Crie conta grátis em https://dashboard.ngrok.com/signup',
      '    2. Copie o token em https://dashboard.ngrok.com/get-started/your-authtoken',
      '    3. Rode: ngrok config add-authtoken SEU_TOKEN',
      '    4. Abra o servidor de novo.',
    ],
  },
  {
    name: 'cloudflared',
    args: () => ['tunnel', '--no-autoupdate', '--url', 'http://localhost:' + PORT],
    url: /(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/,
    fail: null,
    failMsg: [],
  },
];

function startTunnel(i = 0) {
  if (process.env.NO_TUNNEL) return;
  const t = TUNNELS[i];
  if (!t) { noTunnel(); return; }
  let proc, failed = false;
  try {
    proc = spawn(findBin(t.name), t.args(), { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  } catch (e) { startTunnel(i + 1); return; }
  proc.on('error', () => { if (!failed) { failed = true; startTunnel(i + 1); } });
  let told = false;
  const scan = (chunk) => {
    const txt = String(chunk);
    const m = txt.match(t.url);
    if (m && !publicUrl) {
      publicUrl = m[1];
      console.log('\n  >>> LINK PROS AMIGOS: ' + publicUrl + '\n');
      console.log('  (o link muda toda vez que você reinicia o servidor)');
      if (t.name === 'ngrok') console.log('  No primeiro acesso o ngrok mostra um aviso: é só clicar em "Visit Site".');
      console.log('');
    }
    if (t.fail && t.fail.test(txt) && !told) { told = true; console.log(''); t.failMsg.forEach((l) => console.log(l)); console.log(''); }
  };
  proc.stdout.on('data', scan);
  proc.stderr.on('data', scan);
  proc.on('exit', (code) => {
    if (failed) return;
    if (publicUrl) console.log('  Túnel público caiu (código ' + code + '). Reinicie o servidor.');
    publicUrl = null;
  });
  const stop = () => { try { proc.kill(); } catch (e) { /* já saiu */ } };
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(0); });
  if (i === 0) console.log('  Abrindo túnel público…');
}

function noTunnel() {
  console.log('  Sem túnel público: ngrok não encontrado.');
  console.log('  Só quem estiver na mesma rede Wi-Fi consegue entrar pelos endereços acima.');
  console.log('  Pra liberar pela internet: winget install ngrok.ngrok  (e depois configure o token)\n');
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error('A porta ' + PORT + ' já está em uso. Rode com outra: set PORT=9000 && node server.js');
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log('\n  Drink Heist rodando.');
  console.log('  Você:           http://localhost:' + PORT);
  for (const u of lanUrls()) console.log('  Mesma rede:     ' + u);
  startTunnel();
  if (process.env.OPEN_BROWSER && process.platform === 'win32') {
    require('child_process').exec('start "" "http://localhost:' + PORT + '"');
  }
});
