// Celular = raquete. Lê orientação, giroscópio e acelerômetro e manda tudo direto (P2P)
// para o computador. Recebe de volta vibração, placar e mensagens.
import { openAnonPeer, PREFIX, friendlyNetError, normalizeCode } from './net.js';

const $ = (s) => document.querySelector(s);
const D2R = Math.PI / 180;

// ---------- quaternions mínimos (sem carregar o Three.js no celular) ----------
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qaxis = (x, y, z, ang) => { const s = Math.sin(ang / 2); return [x * s, y * s, z * s, Math.cos(ang / 2)]; };
function qrot(q, v) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
// Euler da W3C (alpha, beta, gamma) -> quaternion do aparelho num mundo com Y para cima
// (mesma convenção do antigo DeviceOrientationControls do Three.js).
function eulerToQuat(alpha, beta, gamma) {
  const x = beta * D2R, y = alpha * D2R, z = -gamma * D2R;
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  const q = [ // ordem 'YXZ'
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 - s1 * s2 * c3,
    c1 * c2 * c3 + s1 * s2 * s3,
  ];
  return qmul(q, [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
}
// Referencial ENU (Z para cima) -> Y para cima
const ENU_TO_YUP = qaxis(1, 0, 0, -Math.PI / 2);

export async function startController(rawCode) {
  document.title = 'Raquete · Ping Pongola';
  $('#pad').hidden = false;
  const pad = new Pad(normalizeCode(rawCode));
  pad.init();
  window.pingPongolaPad = pad;
}

class Pad {
  constructor(code) {
    this.code = code;
    this.q = [0, 0, 0, 1];
    this.cal = [0, 0, 0, 1];
    this.rot = [0, 0, 0];
    this.acc = [0, 0, 0];
    this.haveOrient = false;
    this.needCal = true;
    this.src = { orient: '—', motion: '—' };
    this.cfg = { vibration: true, sound: true };
    this.lastSend = 0;
    this.sent = 0;
    try {
      this.id = localStorage.getItem('pingpongola.device');
      if (!this.id) { this.id = Math.random().toString(36).slice(2, 10); localStorage.setItem('pingpongola.device', this.id); }
    } catch { this.id = Math.random().toString(36).slice(2, 10); }
  }

  init() {
    this._status('wait', 'Pronto para ligar');
    $('#padSlot').textContent = 'Sala ' + this.code;
    this._listSensors();
    $('#padGo').addEventListener('click', () => this.go());
    $('#padServe').addEventListener('click', () => { this._btn('serve'); this._tap(); });
    $('#padCalib').addEventListener('click', () => { this.calibrate(); this._btn('calib'); this._tap(); this._msg('Calibrado! Esta direção agora é “para a tela”.'); });
    $('#padPause').addEventListener('click', () => { this._btn('pause'); this._tap(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this._wake(); });
  }

  _listSensors() {
    const items = [
      ['Orientação', 'DeviceOrientationEvent' in window || 'RelativeOrientationSensor' in window],
      ['Giroscópio', 'DeviceMotionEvent' in window || 'Gyroscope' in window],
      ['Acelerômetro', 'DeviceMotionEvent' in window || 'LinearAccelerationSensor' in window],
      ['Vibração', 'vibrate' in navigator],
      ['Tela sempre ligada', 'wakeLock' in navigator],
      ['Conexão P2P', 'RTCPeerConnection' in window],
    ];
    $('#sensorList').innerHTML = items.map(([n, ok]) => `<li class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✕'} ${n}</li>`).join('');
    if (!window.isSecureContext) $('#padNote').textContent = 'Atenção: os sensores só funcionam em página HTTPS (como o GitHub Pages).';
  }

  async go() {
    this._audio();
    const note = $('#padNote');
    note.textContent = '';
    // iOS pede permissão explícita, e só dentro de um toque
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const r = await DeviceMotionEvent.requestPermission();
        if (r !== 'granted') throw new Error('motion');
      }
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') throw new Error('orient');
      }
    } catch {
      note.textContent = 'Sem permissão para os sensores. Toque de novo e escolha “Permitir”.';
      return;
    }
    try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch { /* opcional */ }
    try { await screen.orientation?.lock?.('portrait'); } catch { /* opcional */ }
    this._wake();
    this._startSensors();
    $('#padStart').hidden = true;
    $('#padMain').hidden = false;
    this._connect();
    requestAnimationFrame(() => this._uiLoop());
  }

  async _wake() {
    try { if ('wakeLock' in navigator && !this.lock) { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => { this.lock = null; }); } } catch { /* ok */ }
  }

  // ---------- sensores ----------
  _startSensors() {
    let genericOk = false;
    // API de sensores genéricos (Android/Chrome): maior frequência e quaternion pronto
    try {
      if ('RelativeOrientationSensor' in window) {
        const s = new window.RelativeOrientationSensor({ frequency: 60, referenceFrame: 'device' });
        s.addEventListener('reading', () => {
          this.q = qmul(ENU_TO_YUP, s.quaternion);
          this._gotOrient('Sensor de orientação');
        });
        s.addEventListener('error', () => { this.src.orient = 'eventos'; });
        s.start();
        genericOk = true;
      }
    } catch { genericOk = false; }
    try {
      if ('Gyroscope' in window) {
        const g = new window.Gyroscope({ frequency: 60 });
        g.addEventListener('reading', () => { this.rot = [g.x, g.y, g.z]; this.gyroApi = true; this.src.motion = 'Giroscópio API'; });
        g.start();
      }
    } catch { /* usa devicemotion */ }

    window.addEventListener('deviceorientation', (e) => {
      if (e.alpha === null && e.beta === null) return;
      if (genericOk && this.src.orient === 'Sensor de orientação') return;
      this.q = eulerToQuat(e.alpha || 0, e.beta || 0, e.gamma || 0);
      this._gotOrient('deviceorientation');
    });
    window.addEventListener('devicemotion', (e) => {
      const r = e.rotationRate;
      if (r && !this.gyroApi && r.alpha !== null) {
        // rotationRate: alpha em Z, beta em X, gamma em Y (graus/s)
        this.rot = [(r.beta || 0) * D2R, (r.gamma || 0) * D2R, (r.alpha || 0) * D2R];
        this.src.motion = 'devicemotion';
      }
      const a = e.acceleration;
      if (a && a.x !== null) this.acc = [a.x || 0, a.y || 0, a.z || 0];
      else if (e.accelerationIncludingGravity) {
        // sem aceleração linear: tira a gravidade estimada pela orientação
        const g = e.accelerationIncludingGravity;
        const up = qrot(this._conj(this.q), [0, 9.81, 0]);
        this.acc = [(g.x || 0) - up[0], (g.y || 0) - up[1], (g.z || 0) - up[2]];
      }
      this._send();
    });
    // garante envio regular mesmo se devicemotion não disparar
    this._timer = setInterval(() => { if (performance.now() - this.lastSend > 30) this._send(); }, 16);
  }

  _conj(q) { return [-q[0], -q[1], -q[2], q[3]]; }

  _gotOrient(src) {
    this.src.orient = src;
    if (!this.haveOrient) { this.haveOrient = true; }
    if (this.needCal) { this.needCal = false; this.calibrate(); }
  }

  /** Define a direção atual como "apontando para a tela" (só o giro horizontal). */
  calibrate() {
    let f = qrot(this.q, [0, 0, -1]);
    if (Math.abs(f[1]) > 0.75) f = qrot(this.q, [0, 1, 0]); // celular deitado: usa o topo
    const heading = Math.atan2(-f[0], -f[2]);
    this.cal = qaxis(0, 1, 0, -heading);
  }

  _send() {
    const now = performance.now();
    if (now - this.lastSend < 8) return;
    if (!this.conn || !this.conn.open || !this.haveOrient) return;
    this.lastSend = now;
    const q = qmul(this.cal, this.q);
    const r3 = (n) => Math.round(n * 1000) / 1000;
    this.conn.send({ t: 's', ts: Math.round(now * 10) / 10, q: q.map(r3), r: this.rot.map(r3), a: this.acc.map((n) => Math.round(n * 100) / 100) });
    this.sent++;
  }

  // ---------- conexão ----------
  async _connect() {
    this._status('wait', 'Conectando…');
    try {
      if (!this.peer || this.peer.destroyed) {
        this.peer = await openAnonPeer();
        this.peer.on('disconnected', () => { if (!this.peer.destroyed) this.peer.reconnect(); });
        this.peer.on('error', (err) => {
          if (err.type === 'peer-unavailable') {
            this._status('bad', 'Jogo não encontrado');
            this._msg('Não achei a tela do jogo. Escaneie o QR code de novo.');
            this._retry(4000);
          }
        });
      }
      const conn = this.peer.connect(PREFIX + this.code, { reliable: false, serialization: 'json', metadata: { role: 'phone' } });
      this.conn = conn;
      conn.on('open', () => {
        this._status('ok', 'Conectado');
        conn.send({ t: 'hello', id: this.id, ua: navigator.userAgent.slice(0, 80) });
        setTimeout(() => conn.open && conn.send({ t: 'info', src: this.src }), 1500);
      });
      conn.on('data', (m) => this._onData(m));
      conn.on('close', () => { this._status('bad', 'Desconectado'); this._retry(1500); });
      conn.on('error', () => this._retry(2000));
    } catch (err) {
      this._status('bad', 'Sem internet?');
      this._msg(friendlyNetError(err));
      this._retry(3000);
    }
  }

  _retry(ms) {
    clearTimeout(this._retryT);
    this._retryT = setTimeout(() => { if (!this.conn || !this.conn.open) this._connect(); }, ms);
  }

  _onData(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'welcome':
        $('#padSlot').textContent = 'J' + (m.slot + 1);
        $('#padSlot').style.setProperty('--slot', m.color);
        this.cfg = { vibration: m.vibration, sound: m.sound };
        this._buzz([30, 60, 30]);
        this._msg('Conectado! Aponte para a tela e toque em Calibrar.');
        break;
      case 'cfg': this.cfg = { vibration: m.vibration, sound: m.sound }; break;
      case 'full': this._msg('Já tem dois celulares nesta tela.'); this._status('bad', 'Sala cheia'); break;
      case 'ping': this.conn.send({ t: 'pong', c: m.c }); break;
      case 'calib': this.calibrate(); this._msg('Calibrado pela tela!'); this._buzz(20); break;
      case 'hap': this._haptic(m.k, m.p); break;
      case 'state': this._state(m); break;
    }
  }

  _state(m) {
    if (m.score) {
      const s = $('#padScore').children;
      s[0].textContent = m.score[0]; s[2].textContent = m.score[1];
    }
    $('#padServe').classList.toggle('ready', !!m.yourServe);
    if (m.msg) this._msg(m.msg);
  }

  // ---------- retorno tátil ----------
  _haptic(kind, p = 0.5) {
    const pat = {
      hit: [Math.round(18 + p * 45)],
      bounce: [8],
      serve: [15, 50, 15],
      point: [40, 60, 40],
      lose: [160],
      win: [60, 40, 60, 40, 220],
    }[kind] || [20];
    this._buzz(pat);
    if (kind === 'hit') {
      const el = $('#paddleLive');
      el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
      setTimeout(() => el.classList.remove('hit'), 120);
      const f = $('#padFlash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
      if (this.cfg.sound) this._tok(p);
    }
  }

  _buzz(pattern) {
    if (!this.cfg.vibration) return;
    if (navigator.vibrate) { navigator.vibrate(pattern); return; }
    // iPhone (Safari 18+): um "switch" nativo dá um toque háptico curto
    const el = $('#iosHaptic');
    if (el) { try { el.parentElement.click(); } catch { /* ok */ } }
  }

  _audio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC && !this.ac) this.ac = new AC();
      this.ac?.resume();
    } catch { /* sem áudio */ }
  }
  _tok(p) {
    const c = this.ac; if (!c) return;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(900 + p * 600, t); o.frequency.exponentialRampToValueAtTime(500, t + 0.06);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.1);
  }
  _tap() { if (navigator.vibrate && this.cfg.vibration) navigator.vibrate(10); }

  _btn(b) { if (this.conn && this.conn.open) this.conn.send({ t: 'btn', b }); }
  _msg(t) { $('#padMsg').textContent = t; }
  _status(state, text) {
    const el = $('#padStatus');
    el.classList.toggle('ok', state === 'ok');
    el.classList.toggle('wait', state === 'wait');
    el.querySelector('span').textContent = text;
  }

  // ---------- desenho da raquete na tela do celular ----------
  _uiLoop() {
    const q = qmul(this.cal, this.q);
    const up = qrot(q, [0, 1, 0]);
    const roll = Math.atan2(-up[0], up[1]);
    const pitch = Math.asin(Math.max(-1, Math.min(1, -qrot(q, [0, 0, -1])[1])));
    $('#paddleLive').style.transform = `rotate(${roll}rad) scale(${1 - pitch * 0.15})`;
    const w = Math.hypot(...this.rot);
    const a = Math.hypot(...this.acc);
    $('#mGyro').style.width = Math.min(100, w / 20 * 100) + '%';
    $('#mPower').style.width = Math.min(100, (w * 0.5 + a * 0.15) / 10 * 100) + '%';
    if (!this._infoT || performance.now() - this._infoT > 1000) {
      this._infoT = performance.now();
      $('#padInfo').textContent = `${this.sent} amostras/s · ${this.src.orient} · ${this.src.motion}`;
      this.sent = 0;
    }
    requestAnimationFrame(() => this._uiLoop());
  }
}
