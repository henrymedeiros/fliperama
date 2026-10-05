// Conexões P2P via WebRTC (PeerJS). O servidor público do PeerJS só faz a apresentação
// (sinalização); depois disso os dados vão direto entre os aparelhos.
export const PREFIX = 'pingpongola-v1-';
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

export function normalizeCode(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

/** Abre um Peer com o código pedido (ou um novo se estiver ocupado). */
export function openPeer(preferredCode) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = (code) => {
      tries++;
      const peer = new window.Peer(PREFIX + code, PEER_CONFIG);
      let opened = false;
      peer.on('open', () => { opened = true; resolve({ peer, code }); });
      peer.on('error', (err) => {
        if (opened) return;
        peer.destroy();
        // ao recarregar a página o servidor pode segurar o código antigo por alguns segundos
        if (err.type === 'unavailable-id' && preferredCode && code === preferredCode && tries < 4) setTimeout(() => attempt(code), 1500);
        else if (err.type === 'unavailable-id' && tries < 8) attempt(makeCode());
        else if (tries < 3 && (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error')) setTimeout(() => attempt(code), 1200);
        else reject(err);
      });
    };
    attempt(preferredCode || makeCode());
  });
}

/** Peer anônimo (celular ou computador visitante). */
export function openAnonPeer() {
  return new Promise((resolve, reject) => {
    const peer = new window.Peer(PEER_CONFIG);
    let opened = false;
    peer.on('open', () => { opened = true; resolve(peer); });
    peer.on('error', (err) => { if (!opened) reject(err); });
  });
}

/** Mantém o Peer ligado ao servidor de sinalização (para novos pareamentos). */
export function keepAlive(peer) {
  peer.on('disconnected', () => {
    setTimeout(() => { if (!peer.destroyed && peer.disconnected) peer.reconnect(); }, 1000);
  });
}

export function friendlyNetError(err) {
  const t = err && err.type;
  if (t === 'peer-unavailable') return 'Sala não encontrada. Confira o código e tente de novo.';
  if (t === 'network' || t === 'socket-error' || t === 'server-error') return 'Sem conexão com o servidor de pareamento. Verifique a internet.';
  if (t === 'browser-incompatible') return 'Este navegador não suporta conexão P2P (WebRTC).';
  return 'Não foi possível conectar (' + (t || 'erro') + ').';
}
