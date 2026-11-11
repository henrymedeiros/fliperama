// Conexão P2P (WebRTC via PeerJS). O servidor público do PeerJS só apresenta os aparelhos;
// depois disso os dados vão direto. Topologia em estrela: o anfitrião repassa as mensagens.
export const PREFIX = 'torrebamba-v1-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const PEER_CONFIG = {
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
  },
};

export function makeCode(n = 5) {
  let s = '';
  const rnd = new Uint32Array(n);
  crypto.getRandomValues(rnd);
  for (let i = 0; i < n; i++) s += ALPHABET[rnd[i] % ALPHABET.length];
  return s;
}

export const normalizeCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

function openPeer(id) {
  return new Promise((resolve, reject) => {
    const peer = id ? new window.Peer(id, PEER_CONFIG) : new window.Peer(PEER_CONFIG);
    let opened = false;
    peer.on('open', () => { opened = true; resolve(peer); });
    peer.on('error', (err) => { if (!opened) { peer.destroy(); reject(err); } });
  });
}

export function friendlyNetError(err) {
  const t = err && err.type;
  if (t === 'peer-unavailable') return 'Sala não encontrada. Confira o código e se a sala ainda está aberta.';
  if (t === 'network' || t === 'socket-error' || t === 'server-error') return 'Sem conexão com o servidor de pareamento. Verifique a internet.';
  if (t === 'browser-incompatible') return 'Este navegador não suporta conexão P2P (WebRTC).';
  if (t === 'timeout') return 'A sala não respondeu. Tente de novo.';
  return 'Não foi possível conectar (' + (t || 'erro') + ').';
}

/** Anfitrião: abre a sala e mantém as conexões dos convidados. */
export class Host {
  constructor() { this.conns = new Map(); this.handlers = {}; this.code = null; this.peer = null; }
  on(ev, fn) { this.handlers[ev] = fn; return this; }
  emit(ev, ...a) { const f = this.handlers[ev]; if (f) f(...a); }

  async open() {
    let lastErr;
    for (let i = 0; i < 6; i++) {
      const code = makeCode();
      try { this.peer = await openPeer(PREFIX + code); this.code = code; break; }
      catch (e) { lastErr = e; if (e.type !== 'unavailable-id') { if (i >= 2) throw e; await new Promise((r) => setTimeout(r, 1000)); } }
    }
    if (!this.peer) throw lastErr;
    this.peer.on('disconnected', () => setTimeout(() => { if (this.peer && !this.peer.destroyed && this.peer.disconnected) this.peer.reconnect(); }, 1000));
    this.peer.on('connection', (c) => {
      c.on('open', () => { this.conns.set(c.peer, c); this.emit('join', c.peer); });
      c.on('data', (m) => this.emit('msg', c.peer, m));
      const gone = () => { if (this.conns.delete(c.peer)) this.emit('leave', c.peer); };
      c.on('close', gone); c.on('error', gone);
    });
    return this.code;
  }

  send(id, m) { const c = this.conns.get(id); if (c && c.open) try { c.send(m); } catch (e) { /* conexão caindo */ } }
  broadcast(m, except) { for (const [id, c] of this.conns) if (id !== except && c.open) try { c.send(m); } catch (e) { /* idem */ } }
  kick(id) { const c = this.conns.get(id); if (c) c.close(); }
  close() { try { this.peer && this.peer.destroy(); } catch (e) { /* já fechado */ } this.conns.clear(); }
}

/** Convidado: conecta na sala de um código. */
export class Guest {
  constructor() { this.handlers = {}; this.peer = null; this.conn = null; }
  on(ev, fn) { this.handlers[ev] = fn; return this; }
  emit(ev, ...a) { const f = this.handlers[ev]; if (f) f(...a); }

  async join(code) {
    this.peer = await openPeer();
    return new Promise((resolve, reject) => {
      const c = this.peer.connect(PREFIX + code, { reliable: true });
      let ok = false;
      const to = setTimeout(() => { if (!ok) { reject({ type: 'timeout' }); this.close(); } }, 12000);
      this.peer.on('error', (e) => { if (!ok) { clearTimeout(to); reject(e); } else this.emit('error', e); });
      c.on('open', () => { ok = true; clearTimeout(to); this.conn = c; resolve(); });
      c.on('data', (m) => this.emit('msg', m));
      c.on('close', () => { if (ok) this.emit('lost'); });
      c.on('error', () => { if (ok) this.emit('lost'); });
    });
  }

  send(m) { if (this.conn && this.conn.open) try { this.conn.send(m); } catch (e) { /* conexão caindo */ } }
  close() { try { this.peer && this.peer.destroy(); } catch (e) { /* já fechado */ } }
}
