// Sons sintetizados com WebAudio: nenhum arquivo externo.
export class Sound {
  constructor() {
    this.ctx = null;
    this.vol = { sfx: 0.8, music: 0.35, crowd: 0.6 };
    this.musicOn = false;
    this._musicTimer = null;
    this._crowdNode = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfxBus = this._bus(this.vol.sfx);
      this.musicBus = this._bus(this.vol.music);
      this.crowdBus = this._bus(this.vol.crowd);
      this.noiseBuf = this._makeNoise(4);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _bus(v) { const g = this.ctx.createGain(); g.gain.value = v; g.connect(this.master); return g; }

  _makeNoise(sec) {
    const len = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setVolumes({ sfx, music, crowd }) {
    this.vol = { sfx, music, crowd };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(music, t, 0.05);
    this.crowdBus.gain.setTargetAtTime(crowd, t, 0.05);
  }

  get ok() { return !!this.ctx && this.ctx.state === 'running'; }

  _tone({ type = 'sine', f0, f1 = f0, dur = 0.1, gain = 0.3, attack = 0.002, bus = this.sfxBus, when = 0, pan = 0 }) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o.connect(g);
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
    node.connect(bus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  _noise({ dur = 0.1, gain = 0.3, type = 'bandpass', f = 2000, q = 1, f1, bus = this.sfxBus, when = 0, attack = 0.002, pan = 0 }) {
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = s.connect(fl).connect(g);
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
    node.connect(bus);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }

  // ---- efeitos do jogo ----
  paddle(power = 0.5, pan = 0) {
    if (!this.ok) return;
    const p = Math.min(1.2, power);
    this._tone({ type: 'triangle', f0: 1050 + p * 500, f1: 620, dur: 0.07, gain: 0.35 + p * 0.3, pan });
    this._noise({ f: 2600 + p * 1800, q: 1.4, dur: 0.05, gain: 0.25 + p * 0.35, pan });
    if (p > 0.75) this._noise({ type: 'lowpass', f: 900, dur: 0.12, gain: 0.25 * p, pan });
  }
  table(speed = 3, pan = 0) {
    if (!this.ok) return;
    const k = Math.min(1, speed / 6);
    this._tone({ type: 'sine', f0: 1500, f1: 950, dur: 0.05, gain: 0.18 + k * 0.3, pan });
    this._noise({ f: 3800, q: 2, dur: 0.025, gain: 0.08 + k * 0.15, pan });
  }
  net() {
    if (!this.ok) return;
    this._noise({ type: 'lowpass', f: 600, dur: 0.15, gain: 0.4 });
    this._tone({ type: 'sine', f0: 220, f1: 120, dur: 0.12, gain: 0.2 });
  }
  floor(speed = 2, pan = 0) {
    if (!this.ok) return;
    const k = Math.min(1, speed / 5);
    this._tone({ type: 'sine', f0: 900, f1: 600, dur: 0.06, gain: 0.08 + k * 0.15, pan });
  }
  whoosh(power = 0.5, pan = 0) {
    if (!this.ok) return;
    this._noise({ f: 500, f1: 2200, q: 0.8, dur: 0.22, gain: 0.05 + power * 0.12, attack: 0.08, pan });
  }
  toss() {
    if (!this.ok) return;
    this._noise({ f: 900, f1: 1800, q: 1, dur: 0.15, gain: 0.06, attack: 0.04 });
  }
  blip(hi = false) {
    if (!this.ok) return;
    this._tone({ type: 'sine', f0: hi ? 880 : 660, f1: hi ? 1320 : 990, dur: 0.09, gain: 0.18 });
  }
  select() {
    if (!this.ok) return;
    this._tone({ type: 'triangle', f0: 784, dur: 0.08, gain: 0.2 });
    this._tone({ type: 'triangle', f0: 1175, dur: 0.12, gain: 0.2, when: 0.07 });
  }
  back() {
    if (!this.ok) return;
    this._tone({ type: 'triangle', f0: 700, f1: 440, dur: 0.12, gain: 0.18 });
  }
  pointWin() {
    if (!this.ok) return;
    [523, 659, 784, 1047].forEach((f, i) => this._tone({ type: 'triangle', f0: f, dur: 0.18, gain: 0.2, when: i * 0.08 }));
  }
  pointLose() {
    if (!this.ok) return;
    [392, 330, 262].forEach((f, i) => this._tone({ type: 'triangle', f0: f, dur: 0.2, gain: 0.16, when: i * 0.11 }));
  }
  fanfare() {
    if (!this.ok) return;
    const seq = [523, 659, 784, 1047, 784, 1047, 1319];
    seq.forEach((f, i) => {
      this._tone({ type: 'square', f0: f, dur: 0.22, gain: 0.07, when: i * 0.13 });
      this._tone({ type: 'triangle', f0: f / 2, dur: 0.25, gain: 0.12, when: i * 0.13 });
    });
  }
  whistle() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    o.frequency.value = 2400; lfo.frequency.value = 28; lg.gain.value = 120;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.setValueAtTime(0.12, t + 0.32); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g).connect(this.sfxBus);
    o.start(t); lfo.start(t); o.stop(t + 0.45); lfo.stop(t + 0.45);
  }

  // ---- torcida ----
  cheer(amount = 1) {
    if (!this.ok) return;
    for (let i = 0; i < 5; i++) {
      this._noise({ type: 'bandpass', f: 700 + Math.random() * 1400, q: 0.7, dur: 1.4 + Math.random() * 0.6, gain: 0.12 * amount, attack: 0.15, bus: this.crowdBus, when: i * 0.05 });
    }
    // palminhas
    for (let i = 0; i < 26 * amount; i++) {
      this._noise({ type: 'highpass', f: 1800, dur: 0.03, gain: 0.05 + Math.random() * 0.05, bus: this.crowdBus, when: 0.1 + Math.random() * 1.4, pan: Math.random() * 1.6 - 0.8 });
    }
  }
  ooh() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    for (let i = 0; i < 4; i++) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      const f = 180 + i * 37 + Math.random() * 20;
      o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 0.8, t + 0.9);
      const fl = c.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 500; fl.Q.value = 3;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
      o.connect(fl).connect(g).connect(this.crowdBus);
      o.start(t); o.stop(t + 1.05);
    }
  }
  startAmbience() {
    if (!this.ok || this._crowdNode) return;
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const fl = c.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 450; fl.Q.value = 0.5;
    const g = c.createGain(); g.gain.value = 0.035;
    s.connect(fl).connect(g).connect(this.crowdBus);
    s.start();
    this._crowdNode = { s, g };
  }
  stopAmbience() {
    if (!this._crowdNode) return;
    try { this._crowdNode.s.stop(); } catch { /* já parou */ }
    this._crowdNode = null;
  }

  // ---- música do menu: marimba em loop ----
  startMusic() {
    if (!this.ok || this.musicOn) return;
    this.musicOn = true;
    const bpm = 108, beat = 60 / bpm / 2;
    const chords = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]];
    const bass = [36, 33, 29, 31];
    const melody = [76, 74, 72, 74, 76, 79, 76, 74, 72, 69, 72, 74, 72, 71, 67, 71];
    let step = 0;
    let next = this.ctx.currentTime + 0.1;
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const tick = () => {
      if (!this.musicOn) return;
      while (next < this.ctx.currentTime + 0.25) {
        const bar = Math.floor(step / 8) % 4;
        const when = next - this.ctx.currentTime;
        const ch = chords[bar];
        if (step % 8 === 0) this._marimba(mtof(bass[bar]), when, 0.22, 0.5);
        if (step % 2 === 0) this._marimba(mtof(ch[(step / 2) % 4] + 12), when, 0.06, 0.25);
        const m = melody[step % 16];
        if (step % 2 === 1 || step % 16 === 0) this._marimba(mtof(m), when, 0.09, 0.3);
        step++; next += beat;
      }
      this._musicTimer = setTimeout(tick, 60);
    };
    tick();
  }
  _marimba(f, when, gain, dur) {
    this._tone({ type: 'sine', f0: f, dur, gain, bus: this.musicBus, when });
    this._tone({ type: 'sine', f0: f * 4, dur: dur * 0.25, gain: gain * 0.25, bus: this.musicBus, when });
  }
  stopMusic() {
    this.musicOn = false;
    clearTimeout(this._musicTimer);
  }
}
