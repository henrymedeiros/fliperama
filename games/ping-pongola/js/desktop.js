// Tela do computador: menus, QR code, conexões P2P (celulares e amigo online) e a partida.
import * as THREE from 'three';
import { loadSettings, saveSettings } from './settings.js';
import { Sound } from './audio.js';
import { World } from './world.js';
import { Match, SPIN_LABEL } from './game.js';
import { RacketInput } from './input.js';
import { openPeer, keepAlive, PREFIX, normalizeCode, friendlyNetError } from './net.js';
import { SPIN_COLORS } from './fx.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const SWATCHES = {
  shirt: ['#ff8c42', '#43bff5', '#4fb36b', '#ffd65a', '#e8566c', '#7a5cff', '#ff6fa8', '#17384d', '#ffffff'],
  skin: ['#ffe0c4', '#f6cfa8', '#e8b48a', '#c98b5f', '#a86e47', '#7a4a2c'],
  hair: ['#1c1c22', '#2b1c12', '#5b3a24', '#a8682f', '#e8c46a', '#c44d2a', '#9aa9b3', '#7a5cff'],
};
const RIVALS = [
  { name: 'Bia', avatar: { shirt: '#43bff5', skin: '#e8b48a', hair: '#2b1c12', hairStyle: 'pony' } },
  { name: 'Theo', avatar: { shirt: '#4fb36b', skin: '#f6cfa8', hair: '#a8682f', hairStyle: 'short' } },
  { name: 'Lulu', avatar: { shirt: '#ff6fa8', skin: '#c98b5f', hair: '#1c1c22', hairStyle: 'bob' } },
  { name: 'Davi', avatar: { shirt: '#ffd65a', skin: '#7a4a2c', hair: '#1c1c22', hairStyle: 'short' } },
  { name: 'Nina', avatar: { shirt: '#7a5cff', skin: '#ffe0c4', hair: '#e8c46a', hairStyle: 'pony' } },
  { name: 'Caio', avatar: { shirt: '#e8566c', skin: '#a86e47', hair: '#2b1c12', hairStyle: 'short' } },
];
const SLOT_COLORS = ['#ff8c42', '#43bff5'];
const SPIN_CSS = { top: '#ff7a2e', back: '#3aa8ff', left: '#3fbf4c', right: '#a64bea', flat: '#8a9aa6' };
const MUTE = new Proxy({}, { get: () => () => {} });

export async function startDesktop(params) {
  try {
    await Promise.race([document.fonts.load('700 64px Fredoka'), new Promise((r) => setTimeout(r, 1500))]);
  } catch { /* segue sem a fonte */ }
  const app = new DesktopApp(params);
  app.init();
  window.pingPongola = app; // útil para depurar no console
}

class DesktopApp {
  constructor(params) {
    this.params = params;
    this.settings = loadSettings();
    this.audio = new Sound();
    this.phones = [null, null];
    this.remote = null;
    this.remoteInfo = null;
    this.hosting = false;
    this.match = null;
    this.demo = null;
    this.stack = ['menu'];
    this.createMode = 'cpu';
    this.orbit = 0;
    this.fps = { n: 0, t: 0 };
    this.remoteRtt = 60;
  }

  init() {
    document.title = 'Ping Pongola';
    $('#desk').hidden = false;
    this.world = new World($('#scene'), this.settings);
    this._bindUI();
    this._syncSettingsUI();
    this._applyAvatarCss();
    this.startDemo();
    this.go('menu', true);
    const unlock = () => {
      this.audio.unlock();
      this._applyAudio();
      if (!this.match) this.audio.startMusic();
    };
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
    this.last = performance.now();
    requestAnimationFrame((t) => this._frame(t));
    this._connectPeer();
    setInterval(() => this._pingAll(), 1000);
    setInterval(() => this._updateSensorPanel(), 100);
    const sala = normalizeCode(this.params.get('sala'));
    if (sala.length === 5) { this.go('join'); $('#joinCode').value = sala; }
  }

  // ================= navegação =================
  go(name, root = false) {
    if (root) this.stack = [name];
    else if (this.stack[this.stack.length - 1] !== name) this.stack.push(name);
    this._showScreen(name);
  }
  back() {
    this.audio.back();
    const leaving = this.stack.pop();
    if (leaving === 'host') this._cancelHost();
    if (!this.stack.length) {
      if (this.match) { this._showScreen(null); $('#pauseOverlay').hidden = false; return; }
      this.stack = ['menu'];
    }
    this._showScreen(this.stack[this.stack.length - 1]);
  }
  _showScreen(name) {
    for (const s of $$('.screen')) s.hidden = s.dataset.screen !== name;
    $('#screens').classList.toggle('closed', !name);
    if (name) {
      const first = $(`[data-screen="${name}"] .btn, [data-screen="${name}"] input`);
      const firstBtn = $(`[data-screen="${name}"] .btn, [data-screen="${name}"] .mode-card`);
      setTimeout(() => { first?.focus({ preventScroll: true }); this._moveCursorBall(firstBtn); }, 30);
    } else {
      $('#cursorBall').classList.remove('show');
    }
    if (name === 'player') this._renderPreview();
  }

  _moveCursorBall(el) {
    const ball = $('#cursorBall');
    if (!el || !el.classList || !(el.classList.contains('btn') || el.classList.contains('mode-card')) || el.closest('[hidden]')) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    ball.style.transform = `translate(${r.left - 36}px, ${r.top + r.height / 2 - 13}px)`;
    ball.classList.add('show');
    ball.classList.remove('boing'); void ball.offsetWidth; ball.classList.add('boing');
  }

  _bindUI() {
    document.addEventListener('click', (e) => {
      const go = e.target.closest('[data-go]');
      if (go) { this.audio.select(); this.go(go.dataset.go); return; }
      if (e.target.closest('[data-back]')) { this.back(); }
    });
    document.addEventListener('pointerover', (e) => {
      const t = e.target.closest('.btn, .mode-card');
      if (t && t.closest('.screen') && t !== this._hoverEl) { this._hoverEl = t; this._moveCursorBall(t); this.audio.blip(); }
    });
    document.addEventListener('focusin', (e) => { if (e.target.closest('.screen')) this._moveCursorBall(e.target); });
    window.addEventListener('resize', () => this._moveCursorBall(document.activeElement));

    $('#meChip').addEventListener('click', () => { this.audio.select(); this.go('player'); });

    // cards de modo
    for (const card of $$('.mode-card')) {
      card.addEventListener('click', () => {
        this.createMode = card.dataset.mode;
        this.audio.blip(true);
        this._syncCreate();
      });
    }
    this._syncCreate();
    $('#startBtn').addEventListener('click', () => this._startFromCreate());

    // configurações genéricas
    for (const group of $$('.chips[data-setting]')) {
      group.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        const key = group.dataset.setting;
        this.settings[key] = group.dataset.type === 'number' ? Number(b.dataset.v) : b.dataset.v;
        this.audio.blip(true);
        this._settingChanged(key);
      });
    }
    for (const input of $$('input[data-setting]')) {
      const key = input.dataset.setting;
      input.addEventListener('input', () => {
        if (input.type === 'checkbox') this.settings[key] = input.checked;
        else if (input.type === 'range') this.settings[key] = Number(input.value);
        else this.settings[key] = input.value.trim() || 'Você';
        this._settingChanged(key);
      });
    }
    for (const box of $$('.swatches[data-setting]')) {
      const key = box.dataset.setting;
      for (const c of SWATCHES[key]) {
        const b = document.createElement('button');
        b.style.background = c; b.dataset.v = c; b.setAttribute('aria-label', 'Cor ' + c);
        box.appendChild(b);
      }
      box.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        this.settings[key] = b.dataset.v;
        this.audio.blip(true);
        this._settingChanged(key);
      });
    }
    for (const tab of $$('.tabs [role=tab]')) {
      tab.addEventListener('click', () => {
        for (const t of $$('.tabs [role=tab]')) t.setAttribute('aria-selected', String(t === tab));
        for (const p of $$('.tab-panel')) p.hidden = p.dataset.panel !== tab.dataset.tab;
        this.audio.blip();
      });
    }

    // sala online
    $('#joinForm').addEventListener('submit', (e) => { e.preventDefault(); this._join($('#joinCode').value); });
    $('#joinCode').addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value); });
    $('#copyLink').addEventListener('click', async () => {
      const url = new URL(location.href); url.search = '?sala=' + this.code; url.hash = '';
      try { await navigator.clipboard.writeText(url.toString()); this.toast('Link copiado!'); }
      catch { this.toast(url.toString(), 4000); }
    });

    // partida
    $('#pauseBtn').addEventListener('click', () => this.setPaused(true));
    $('#resumeBtn').addEventListener('click', () => this.setPaused(false));
    $('#recalBtn').addEventListener('click', () => { this._toPhones({ t: 'calib' }); this.toast('Aponte o celular para a tela… calibrando!'); });
    $('#pauseOptions').addEventListener('click', () => { $('#pauseOverlay').hidden = true; this.stack = []; this.go('options'); });
    $('#quitBtn').addEventListener('click', () => this.quitMatch());
    $('#rematchBtn').addEventListener('click', () => this._rematch(true));
    $('#endMenuBtn').addEventListener('click', () => this.quitMatch());
    $('#qrToggle').addEventListener('click', () => $('#qrDock').classList.toggle('mini'));

    // mouse como raquete (sem celular)
    const canvas = $('#scene');
    canvas.addEventListener('pointermove', (e) => {
      const pl = this._myPlayer();
      if (pl?.mouse) pl.mouse.setPointer(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1);
    });
    canvas.addEventListener('pointerdown', () => this._mouseAction());
    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
    window.addEventListener('blur', () => { if (this.match && !this.match.over && this.match.mode !== 'demo') this.setPaused(true); });
  }

  _key(e, down) {
    const pl = this._myPlayer();
    const map = { KeyW: 'top', ArrowUp: 'top', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
    if (pl?.mouse && map[e.code] && !e.target.closest('input')) pl.mouse.keys[map[e.code]] = down;
    if (!down) return;
    if (e.code === 'Escape') {
      if (this.match && !$('#screens').classList.contains('closed')) { this.back(); return; }
      if (this.match) { this.setPaused(!this.match.paused); return; }
      if (this.stack.length > 1) this.back();
    }
    if (e.code === 'Space' && this.match && !e.target.closest('input, button')) { e.preventDefault(); this._mouseAction(); }
  }

  _myPlayer() {
    if (!this.match) return null;
    return this.match.P[this.match.primary];
  }

  _mouseAction() {
    const m = this.match;
    if (!m || m.paused || m.over) return;
    const side = m.primary;
    const pl = m.P[side];
    if (pl.kind !== 'human') return;
    if (m.rally.phase === 'serve' && m.rally.server === side) { m.toss(side); return; }
    pl.mouse?.swing(1);
  }

  // ================= configurações =================
  _settingChanged(key) {
    saveSettings(this.settings);
    this._syncSettingsUI();
    if (['quality', 'shadows'].includes(key)) this.world.applySettings(this.settings);
    if (['sfx', 'music', 'crowd'].includes(key)) this._applyAudio();
    if (['trail', 'particles', 'assist', 'difficulty', 'sensitivity', 'camera'].includes(key)) {
      this.match?.applySettings(this._matchSettings());
      this.demo?.applySettings({ ...this.settings, ...this.demo.settingsOverride });
    }
    if (['shirt', 'skin', 'hair', 'hairStyle', 'name'].includes(key)) { this._applyAvatarCss(); this._renderPreview(); }
    if (['vibration', 'phoneSound'].includes(key)) this._toPhones({ t: 'cfg', ...this._phoneCfg() });
    if (key === 'sensitivity') for (const p of this.phones) if (p) p.input.sens = this.settings.sensitivity;
  }

  _syncSettingsUI() {
    const s = this.settings;
    for (const group of $$('.chips[data-setting]')) {
      for (const b of $$('button', group)) b.setAttribute('aria-pressed', String(String(s[group.dataset.setting]) === b.dataset.v));
    }
    for (const input of $$('input[data-setting]')) {
      const v = s[input.dataset.setting];
      if (input.type === 'checkbox') input.checked = !!v;
      else if (document.activeElement !== input) input.value = v;
    }
    for (const box of $$('.swatches[data-setting]')) {
      for (const b of $$('button', box)) b.setAttribute('aria-pressed', String(s[box.dataset.setting] === b.dataset.v));
    }
    $('#fps').hidden = !s.showFps;
    $('#sensorPanel').hidden = !s.showSensors;
  }

  _applyAudio() { this.audio.setVolumes({ sfx: this.settings.sfx, music: this.settings.music, crowd: this.settings.crowd }); }

  _applyAvatarCss() {
    const s = this.settings, root = document.documentElement.style;
    root.setProperty('--shirt', s.shirt); root.setProperty('--skin', s.skin); root.setProperty('--hair', s.hair);
    $('#meName').textContent = s.name;
  }
  _renderPreview() { $('#miiPreview').dataset.style = this.settings.hairStyle; }

  _matchSettings() { return { ...this.settings, ...(this.matchOverrides || {}) }; }

  _syncCreate() {
    for (const c of $$('.mode-card')) c.setAttribute('aria-checked', String(c.dataset.mode === this.createMode));
    $('#fDifficulty').hidden = this.createMode !== 'cpu';
    const notes = {
      cpu: 'Sem celular? Dá para jogar com o mouse.',
      local2: 'Conecte dois celulares pelo QR code. O Jogador 1 também pode usar o mouse.',
      online: 'Você recebe um código para passar ao seu amigo. Os dois jogam em computadores diferentes, ligados direto (P2P).',
    };
    $('#createNote').textContent = notes[this.createMode];
    $('#startBtn').textContent = this.createMode === 'online' ? 'Criar sala' : 'Jogar!';
  }

  _startFromCreate() {
    this.audio.select();
    if (this.createMode === 'online') {
      if (!this.peer) { this.toast('Ainda conectando ao servidor de pareamento…'); return; }
      this.hosting = true;
      $('#roomCode').textContent = this.code;
      this.go('host');
      return;
    }
    if (this.createMode === 'local2' && !(this.phones[1] && this.phones[1].open)) {
      this.toast('Conecte o celular do Jogador 2 pelo QR code (o segundo celular vira J2).', 3500);
      $('#qrDock').classList.remove('mini');
      return;
    }
    this.startMatch(this.createMode);
  }

  _cancelHost() {
    this.hosting = false;
    if (this.remote && !this.match) { try { this.remote.close(); } catch { /* ok */ } this.remote = null; }
  }

  // ================= partida =================
  _me(phoneSlot = 0) {
    const s = this.settings;
    return {
      name: s.name, hand: s.hand, kind: 'human', allowMouse: true,
      avatar: { shirt: s.shirt, skin: s.skin, hair: s.hair, hairStyle: s.hairStyle },
      phone: this.phones[phoneSlot]?.input || null,
    };
  }

  startMatch(mode) {
    this.stopDemo();
    this.audio.stopMusic();
    this.audio.startAmbience();
    this.matchOverrides = mode.startsWith('online') ? this.matchOverrides : null;
    let players;
    if (mode === 'cpu') {
      const r = RIVALS[Math.floor(Math.random() * RIVALS.length)];
      players = [this._me(0), { name: r.name, avatar: r.avatar, hand: Math.random() < 0.2 ? 'left' : 'right', kind: 'cpu' }];
    } else if (mode === 'local2') {
      const r = RIVALS[1];
      players = [this._me(0), { name: 'Jogador 2', avatar: r.avatar, hand: 'right', kind: 'human', allowMouse: false, phone: this.phones[1]?.input || null }];
    } else {
      const ri = this.remoteInfo || {};
      const rival = { name: ri.name || 'Amigo', avatar: ri.avatar || RIVALS[0].avatar, hand: ri.hand || 'right', kind: 'remote' };
      players = mode === 'online-host' ? [this._me(0), rival] : [rival, this._me(0)];
    }
    this.match = new Match({
      world: this.world, audio: this.audio, settings: this._matchSettings(), mode, players,
      send: (m) => this._sendRemote(m),
      hooks: this._hooks(),
    });
    this.match.rtt = this.remoteRtt;
    this.names = players.map((p) => p.name);
    this.colors = players.map((p) => p.avatar.shirt);
    for (const side of [0, 1]) {
      const el = $(`.sb-side[data-side="${side}"]`);
      $('.sb-name', el).textContent = this.names[side];
      el.style.setProperty('--c', this.colors[side]);
      $('.sb-score', el).textContent = '0';
    }
    document.body.classList.add('in-game');
    $('#hud').hidden = false;
    $('#skyVeil').classList.add('off');
    $('#endOverlay').hidden = true;
    $('#pauseOverlay').hidden = true;
    $('#qrDock').classList.add('mini');
    this.stack = [];
    this._showScreen(null);
    this.match.start();
    this.world.snapCamera();
    this._phoneState();
  }

  _hooks() {
    return {
      onScore: (score, server) => {
        for (const side of [0, 1]) {
          const el = $(`.sb-side[data-side="${side}"]`);
          const sc = $('.sb-score', el);
          if (sc.textContent !== String(score[side])) { sc.textContent = score[side]; sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump'); }
          el.classList.toggle('serving', server === side);
        }
        this.world.scoreTex.draw({ names: this.names, colors: this.colors, score, server, title: 'PING PONGOLA' });
        this._phoneState();
      },
      onPoint: ({ winner, title, sub, name }) => {
        const mine = this.match && this.match.isHuman(winner) && this.match.humanSides.length === 1;
        const whose = mine ? 'Ponto seu!' : `Ponto de ${name}!`;
        this.callout(title === 'Ponto!' ? whose : title, title === 'Ponto!' ? sub : whose, mine);
        this.hint('');
        this._phoneState(title);
      },
      onShot: ({ side, kmh, spin, power, serve }) => {
        const info = $('#shotInfo');
        $('.kmh b', info).textContent = kmh;
        const chip = $('.spin-chip', info);
        chip.textContent = serve ? 'Saque · ' + SPIN_LABEL[spin] : SPIN_LABEL[spin];
        chip.style.setProperty('--chip', SPIN_CSS[spin]);
        info.classList.add('show');
        clearTimeout(this._shotT);
        this._shotT = setTimeout(() => info.classList.remove('show'), 2500);
        this.hint('');
        if (this.match.isHuman(side) && power > 1.02) this.callout('Que pancada!', `${kmh} km/h`, true);
        else if (this.match.isHuman(side) && spin !== 'flat' && power > 0.55 && Math.random() < 0.35) this.callout(SPIN_LABEL[spin] + '!', '', true);
        this._phoneState();
      },
      onServe: (server) => {
        const m = this.match;
        if (m.isHuman(server)) {
          const phoneOn = m.P[server].phone && m.P[server].phone.active;
          const who = m.humanSides.length === 2 ? `${this.names[server]}: ` : 'Seu saque! ';
          this.hint(who + (phoneOn ? 'dê um toquinho para cima com o celular (ou toque em Sacar)' : 'aperte Espaço para lançar a bola e clique para rebater'));
        } else {
          this.hint(`Saque de ${this.names[server]}`, 1500);
        }
        this._phoneState();
      },
      onMessage: (text) => { this.hint(text, 1600); },
      haptic: (side, kind, p) => this._haptic(side, kind, p),
      onEnd: ({ winner, score, names }) => {
        const m = this.match;
        const mine = m.isHuman(winner) && m.humanSides.length === 1;
        const lost = !m.isHuman(winner) && m.humanSides.length === 1;
        $('#endTitle').textContent = mine ? 'Você venceu!' : lost ? `${names[winner]} venceu!` : `${names[winner]} venceu!`;
        $('#endScore').textContent = `${score[0]} × ${score[1]}`;
        $('#rematchBtn').hidden = m.mode === 'online-guest';
        setTimeout(() => { if (this.match === m) $('#endOverlay').hidden = false; }, 1400);
        this._phoneState(mine ? 'Você venceu!' : 'Fim de jogo');
      },
    };
  }

  callout(title, sub = '', warm = false) {
    const el = $('#callout');
    $('b', el).textContent = title;
    $('small', el).textContent = sub || '';
    el.classList.toggle('warm', warm);
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  hint(text, ms = 0) {
    const el = $('#hint');
    clearTimeout(this._hintT);
    if (text) el.textContent = text;
    el.classList.toggle('show', !!text);
    if (text && ms) this._hintT = setTimeout(() => el.classList.remove('show'), ms);
  }

  toast(text, ms = 2200) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove('show'), ms);
  }

  setPaused(on, fromNet = false) {
    const m = this.match;
    if (!m || m.over) return;
    m.paused = on;
    $('#pauseOverlay').hidden = !on;
    if (!on) { this.stack = []; this._showScreen(null); }
    if (on) this.audio.back(); else this.audio.select();
    if (!fromNet && m.mode.startsWith('online')) this._sendRemote({ t: 'pause', on });
    if (fromNet && on) this.toast('Seu amigo pausou o jogo');
    this._phoneState(on ? 'Pausado' : '');
  }

  _rematch(local) {
    const m = this.match;
    if (!m) return;
    if (local && m.mode === 'online-host') this._sendRemote({ t: 'rematch' });
    $('#endOverlay').hidden = true;
    m.rematch();
  }

  quitMatch(silent = false) {
    if (!this.match) return;
    if (this.match.mode.startsWith('online') && !silent) this._sendRemote({ t: 'bye' });
    if (this.match.mode.startsWith('online')) {
      try { this.remote?.close(); } catch { /* ok */ }
      this.remote = null; this.remoteInfo = null; this.hosting = false;
    }
    this.match.dispose();
    this.match = null;
    this.audio.stopAmbience();
    this.audio.startMusic();
    document.body.classList.remove('in-game');
    $('#hud').hidden = true;
    $('#pauseOverlay').hidden = true;
    $('#endOverlay').hidden = true;
    $('#skyVeil').classList.remove('off');
    $('#qrDock').classList.remove('mini');
    this.hint('');
    this.startDemo();
    this.go('menu', true);
    this._phoneState();
  }

  // ================= modo vitrine (CPU x CPU no menu) =================
  startDemo() {
    if (this.demo) return;
    const a = RIVALS[0], b = RIVALS[1];
    const override = { difficulty: 'normal', points: 999, gameSpeed: 0.9, assist: 'medium' };
    this.demo = new Match({
      world: this.world, audio: MUTE, settings: { ...this.settings, ...override }, mode: 'demo',
      players: [{ ...a, hand: 'right', kind: 'cpu' }, { ...b, hand: 'left', kind: 'cpu' }],
      send() {}, hooks: {
        onScore: (score, server) => this.world.scoreTex.draw({ names: [a.name, b.name], colors: [a.avatar.shirt, b.avatar.shirt], score, server, title: 'AMISTOSO' }),
      },
    });
    this.demo.settingsOverride = override;
    this.demo.start();
  }
  stopDemo() { if (this.demo) { this.demo.dispose(); this.demo = null; } }

  // ================= laço principal =================
  _frame(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    if (this.match) this.match.update(dt);
    if (this.demo) {
      this.demo.update(dt);
      this.orbit += dt * 0.06;
      const r = 6.2;
      this.world.setCamera(
        new THREE.Vector3(Math.sin(this.orbit) * r, 2.5 + Math.sin(this.orbit * 0.7) * 0.4, Math.cos(this.orbit) * r),
        new THREE.Vector3(0, 0.8, 0), 2);
    }
    this.world.update(dt);
    this.world.render();
    this.fps.n++; this.fps.t += dt;
    if (this.fps.t >= 0.5) {
      if (this.settings.showFps) $('#fps').textContent = Math.round(this.fps.n / this.fps.t) + ' FPS';
      this.fps.n = 0; this.fps.t = 0;
    }
    requestAnimationFrame((tt) => this._frame(tt));
  }

  // ================= P2P =================
  async _connectPeer() {
    const pill = $('#netPill');
    if (!window.Peer) { this._net('bad', 'P2P indisponível (PeerJS não carregou)'); return; }
    let saved = null;
    try { saved = sessionStorage.getItem('pingpongola.code'); } catch { /* sem storage */ }
    try {
      const { peer, code } = await openPeer(saved);
      this.peer = peer; this.code = code;
      try { sessionStorage.setItem('pingpongola.code', code); } catch { /* ok */ }
      keepAlive(peer);
      window.addEventListener('pagehide', () => { try { peer.destroy(); } catch { /* ok */ } });
      peer.on('connection', (conn) => this._onConn(conn));
      peer.on('error', (err) => this._onPeerError(err));
      peer.on('disconnected', () => this._net('wait', 'Reconectando…'));
      peer.on('open', () => this._net('ok', 'Online · sala ' + this.code));
      this._net('ok', 'Online · sala ' + code);
      this._showQR(code);
    } catch (err) {
      console.warn(err);
      this._net('bad', friendlyNetError(err));
      setTimeout(() => this._connectPeer(), 5000);
    }
    void pill;
  }

  _net(state, text) {
    const pill = $('#netPill');
    pill.classList.toggle('ok', state === 'ok');
    pill.classList.toggle('bad', state === 'bad');
    $('span', pill).textContent = text;
  }

  _onPeerError(err) {
    console.warn('peer', err.type, err);
    if (err.type === 'peer-unavailable' && this.joining) {
      this.joining = false;
      $('#joinNote').textContent = friendlyNetError(err);
      this.remote = null;
    }
  }

  _showQR(code) {
    const url = new URL(location.href);
    url.search = '?c=' + code; url.hash = '';
    this.phoneUrl = url.toString();
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(this.phoneUrl);
      qr.make();
      $('#qrBox').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true, alt: 'QR code para abrir a raquete no celular' });
    } catch {
      $('#qrBox').textContent = 'QR indisponível';
    }
    $('#qrCode').textContent = code;
    const warn = $('#qrWarn');
    const h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '' || location.protocol === 'file:') {
      warn.hidden = false;
      warn.textContent = 'Este endereço só funciona neste computador. Publique no GitHub Pages para o celular abrir o link.';
    } else if (location.protocol !== 'https:') {
      warn.hidden = false;
      warn.textContent = 'O celular só libera os sensores em HTTPS. Use o endereço do GitHub Pages.';
    }
  }

  _onConn(conn) {
    const role = conn.metadata && conn.metadata.role;
    if (role === 'phone') this._onPhone(conn);
    else if (role === 'desk') this._onRemoteDesk(conn, true);
    else conn.close();
  }

  // ----- celulares -----
  _onPhone(conn) {
    conn.on('data', (m) => {
      if (!m || typeof m !== 'object') return;
      if (m.t === 's') {
        const ph = this.phones.find((p) => p && p.conn === conn);
        if (ph) { ph.input.feed(m, performance.now()); ph.count++; }
        return;
      }
      if (m.t === 'hello') return this._phoneHello(conn, m);
      const slot = this.phones.findIndex((p) => p && p.conn === conn);
      if (slot < 0) return;
      const ph = this.phones[slot];
      if (m.t === 'pong') ph.rtt = performance.now() - m.c;
      else if (m.t === 'btn') this._phoneButton(slot, m.b);
      else if (m.t === 'info') ph.info = m;
    });
    conn.on('close', () => {
      const slot = this.phones.findIndex((p) => p && p.conn === conn);
      if (slot < 0) return;
      this.phones[slot].open = false;
      this._renderSlots();
      this.toast(`Celular do J${slot + 1} desconectou`);
    });
    conn.on('error', (e) => console.warn('phone conn', e));
  }

  _phoneHello(conn, m) {
    let slot = this.phones.findIndex((p) => p && p.id === m.id);
    if (slot < 0) slot = this.phones.findIndex((p) => !p || !p.open);
    if (slot < 0) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 500); return; }
    const prev = this.phones[slot];
    if (prev && prev.conn !== conn) { try { prev.conn.close(); } catch { /* ok */ } }
    const input = prev?.input || new RacketInput('phone');
    input.sens = this.settings.sensitivity;
    this.phones[slot] = { conn, id: m.id, input, open: true, rtt: 0, count: 0, hz: 0, info: m };
    conn.send({ ...this._phoneCfg(), t: 'welcome', slot, color: SLOT_COLORS[slot] });
    this._renderSlots();
    this.audio.select();
    this.toast(`Celular conectado como Jogador ${slot + 1}!`);
    const side = this._sideForSlot(slot);
    if (this.match && side !== null) this.match.setPhone(side, input);
    this._phoneState();
  }

  _phoneCfg() { return { vibration: this.settings.vibration, sound: this.settings.phoneSound }; }

  _renderSlots() {
    for (const li of $$('#slots li')) {
      const p = this.phones[Number(li.dataset.slot)];
      const on = !!(p && p.open);
      li.classList.toggle('on', on);
      $('span', li).textContent = on ? (p.rtt ? `${Math.round(p.rtt)} ms` : 'conectado') : 'sem celular';
    }
  }

  _sideForSlot(slot) {
    const m = this.match;
    if (!m) return null;
    if (m.mode === 'local2') return slot;
    if (slot === 0) return m.primary;
    return null;
  }
  _slotForSide(side) {
    for (let s = 0; s < 2; s++) if (this._sideForSlot(s) === side) return s;
    return -1;
  }

  _phoneButton(slot, b) {
    const side = this._sideForSlot(slot);
    const m = this.match;
    if (b === 'serve') {
      if (m && side !== null && !m.paused && m.rally.phase === 'serve' && m.rally.server === side) m.toss(side);
      else if (!m) this.toast('Escolha “Criar partida” na tela para começar!');
    } else if (b === 'pause') {
      if (m) this.setPaused(!m.paused);
    } else if (b === 'calib') {
      this.toast(`Raquete do J${slot + 1} calibrada!`);
    }
  }

  _haptic(side, kind, p) {
    const slot = this._slotForSide(side);
    const ph = this.phones[slot];
    if (ph && ph.open) ph.conn.send({ t: 'hap', k: kind, p: Math.round(p * 100) / 100 });
  }

  _toPhones(msg) { for (const p of this.phones) if (p && p.open) p.conn.send(msg); }

  _phoneState(text = '') {
    const m = this.match;
    for (let slot = 0; slot < 2; slot++) {
      const ph = this.phones[slot];
      if (!ph || !ph.open) continue;
      const side = this._sideForSlot(slot);
      if (!m || side === null) {
        ph.conn.send({ t: 'state', phase: 'menu', msg: m ? 'Partida sem vaga para este celular' : 'Escolha “Criar partida” na tela do computador' });
        continue;
      }
      const r = m.rally;
      const yourServe = r.phase === 'serve' && r.server === side;
      ph.conn.send({
        t: 'state', phase: m.paused ? 'paused' : m.over ? 'over' : r.phase, yourServe,
        score: [m.score[side], m.score[1 - side]],
        msg: text || (yourServe ? 'Seu saque! Toquinho para cima ou botão Sacar' : r.phase === 'flight' ? 'Rebata!' : 'Prepare-se…'),
      });
    }
  }

  _pingAll() {
    const now = performance.now();
    for (const p of this.phones) {
      if (!p || !p.open) continue;
      p.conn.send({ t: 'ping', c: now });
      p.hz = p.count; p.count = 0;
    }
    if (this.remote && this.remote.open) this.remote.send({ t: 'ping', c: now });
    this._renderSlots();
  }

  // ----- computador do amigo -----
  _onRemoteDesk(conn, incoming) {
    if (incoming && (!this.hosting || (this.remote && this.remote !== conn))) {
      conn.on('open', () => { conn.send({ t: 'busy' }); setTimeout(() => conn.close(), 400); });
      return;
    }
    this.remote = conn;
    const hello = () => {
      const s = this.settings;
      conn.send({ t: 'hello', v: 1, name: s.name, hand: s.hand, avatar: { shirt: s.shirt, skin: s.skin, hair: s.hair, hairStyle: s.hairStyle } });
    };
    if (conn.open) hello(); else conn.on('open', hello);
    conn.on('data', (m) => this._onRemoteMsg(conn, m));
    conn.on('close', () => { if (this.remote === conn) this._remoteLost('A conexão com o amigo caiu.'); });
    conn.on('error', (e) => console.warn('desk conn', e));
  }

  _onRemoteMsg(conn, m) {
    if (!m || typeof m !== 'object' || conn !== this.remote) return;
    switch (m.t) {
      case 'hello':
        this.remoteInfo = m;
        if (this.hosting && !this.match) {
          const s = this.settings;
          this.matchOverrides = { points: s.points, gameSpeed: s.gameSpeed };
          conn.send({ t: 'start', points: s.points, gameSpeed: s.gameSpeed });
          this.toast(`${m.name || 'Amigo'} entrou na sala!`);
          this.startMatch('online-host');
        }
        break;
      case 'start':
        this.joining = false;
        clearTimeout(this._joinT);
        this.matchOverrides = { points: m.points, gameSpeed: m.gameSpeed };
        this.toast('Conectado! Boa partida!');
        this.startMatch('online-guest');
        break;
      case 'busy':
        $('#joinNote').textContent = 'Essa sala já está com uma partida em andamento.';
        this.joining = false; this.remote = null;
        break;
      case 'ping': conn.send({ t: 'pong', c: m.c }); break;
      case 'pong':
        this.remoteRtt = performance.now() - m.c;
        if (this.match) this.match.rtt = this.remoteRtt;
        if (this.match && this.match.mode.startsWith('online')) this._net('ok', `Online · ${Math.round(this.remoteRtt)} ms`);
        break;
      case 'pause': this.setPaused(m.on, true); break;
      case 'rematch': $('#endOverlay').hidden = true; this.match?.rematch(); break;
      case 'bye': this._remoteLost('Seu amigo saiu da partida.'); break;
      default: this.match?.onNet(m);
    }
  }

  _sendRemote(m) { if (this.remote && this.remote.open) this.remote.send(m); }

  _remoteLost(text) {
    const wasPlaying = this.match && this.match.mode.startsWith('online');
    this.remote = null;
    if (wasPlaying) { this.quitMatch(true); this.toast(text, 3500); }
    else if (this.stack.includes('join')) { $('#joinNote').textContent = text; }
    this._net('ok', 'Online · sala ' + this.code);
  }

  _join(raw) {
    const code = normalizeCode(raw);
    const note = $('#joinNote');
    if (code.length !== 5) { note.textContent = 'O código tem 5 letras/números.'; return; }
    if (code === this.code) { note.textContent = 'Esse é o código desta tela. Digite o código do computador do seu amigo.'; return; }
    if (!this.peer) { note.textContent = 'Ainda conectando ao servidor… tente em alguns segundos.'; return; }
    this.audio.select();
    note.textContent = 'Conectando…';
    this.joining = true;
    const conn = this.peer.connect(PREFIX + code, { reliable: true, serialization: 'json', metadata: { role: 'desk' } });
    this._onRemoteDesk(conn, false);
    clearTimeout(this._joinT);
    this._joinT = setTimeout(() => {
      if (this.joining && !this.match) {
        this.joining = false;
        note.textContent = 'Não deu para conectar. Confira o código e se o amigo está com a sala aberta.';
        try { conn.close(); } catch { /* ok */ }
        this.remote = null;
      }
    }, 12000);
  }

  // ================= painel de sensores =================
  _updateSensorPanel() {
    if (!this.settings.showSensors) return;
    const panel = $('#sensorPanel');
    const ph = this.phones[0];
    if (!ph || !ph.open) { panel.innerHTML = '<h4>Sensores do J1</h4>Nenhum celular conectado.'; return; }
    const inp = ph.input;
    const e = new THREE.Euler().setFromQuaternion(inp.q, 'YXZ');
    const deg = (r) => Math.round(THREE.MathUtils.radToDeg(r));
    const w = inp.omega.length();
    const a = inp.acc.length();
    const bar = (v, max) => `<div class="bar"><i style="width:${Math.min(100, v / max * 100)}%"></i></div>`;
    const src = ph.info?.src || {};
    panel.innerHTML = `<h4>Sensores do J1</h4>
      <div class="row"><span>Direção / Inclinação / Giro</span><span>${deg(e.y)}° ${deg(e.x)}° ${deg(e.z)}°</span></div>
      <div class="row"><span>Giroscópio</span><span>${w.toFixed(1)} rad/s</span></div>${bar(w, 25)}
      <div class="row"><span>Acelerômetro</span><span>${a.toFixed(1)} m/s²</span></div>${bar(a, 30)}
      <div class="row"><span>Velocidade da raquete</span><span>${inp.speed.toFixed(1)} m/s</span></div>${bar(inp.speed, 10)}
      <div class="row"><span>Amostras</span><span>${ph.hz} Hz</span></div>
      <div class="row"><span>Latência (ida e volta)</span><span>${Math.round(ph.rtt)} ms</span></div>
      <div class="row"><span>Fonte</span><span>${src.orient || '?'} · ${src.motion || '?'}</span></div>`;
  }
}
