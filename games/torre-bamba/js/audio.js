// Sons sintetizados: madeira batendo (síntese modal), atrito de bloco deslizando,
// ambiente da sala e os avisos de vez/fim. Nada de arquivo de áudio.
export class Sfx {
  constructor() {
    this.ctx = null; this.on = true; this.recent = 0; this.recentT = 0;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.on ? 0.9 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.15;
    this.master.connect(comp).connect(ctx.destination);

    // reverb curto de sala (resposta ao impulso gerada)
    this.verb = ctx.createConvolver();
    const len = ctx.sampleRate * 1.1, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 200 ? i / 200 : 1);
    }
    this.verb.buffer = ir;
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = 0.16;
    this.verbIn.connect(this.verb).connect(this.master);

    // ruído branco compartilhado
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;

    // atrito (contínuo, volume pelo deslizamento)
    const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.7;
    const bp2 = ctx.createBiquadFilter(); bp2.type = 'peaking'; bp2.frequency.value = 3200; bp2.gain.value = 6;
    this.slideGain = ctx.createGain(); this.slideGain.gain.value = 0;
    this.slideBp = bp;
    src.connect(bp).connect(bp2).connect(this.slideGain).connect(this.master);
    src.start();

    // rangido quando o bloco está preso
    const src2 = ctx.createBufferSource(); src2.buffer = nb; src2.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 380; lp.Q.value = 6;
    this.creakGain = ctx.createGain(); this.creakGain.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 23; const lfoG = ctx.createGain(); lfoG.gain.value = 140;
    lfo.connect(lfoG).connect(lp.frequency); lfo.start();
    src2.connect(lp).connect(this.creakGain).connect(this.master);
    src2.start();

    // ambiente: um sussurro grave de sala
    const src3 = ctx.createBufferSource(); src3.buffer = nb; src3.loop = true;
    const lp3 = ctx.createBiquadFilter(); lp3.type = 'lowpass'; lp3.frequency.value = 260;
    const g3 = ctx.createGain(); g3.gain.value = 0.018;
    src3.connect(lp3).connect(g3).connect(this.master); src3.start();
  }

  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  /** Batida de madeira. k = força 0..1, pan -1..1, low = bateu na mesa. */
  knock(k, pan = 0, low = false, seed = Math.random()) {
    const ctx = this.ctx;
    if (!ctx || !this.on || k < 0.02) return;
    const now = ctx.currentTime;
    if (now - this.recentT > 0.06) { this.recentT = now; this.recent = 0; }
    if (++this.recent > 7) return;
    const vol = Math.min(1, Math.pow(k, 0.8)) * 0.55;
    const out = ctx.createGain(); out.gain.value = vol;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); out.connect(p).connect(this.master); p.connect(this.verbIn); }
    else { out.connect(this.master); out.connect(this.verbIn); }
    const base = (low ? 520 : 820) * (0.86 + seed * 0.3);
    // modos de uma barra de madeira (razões aproximadas de viga livre)
    const modes = low ? [[1, 0.09, 1], [2.3, 0.035, 0.5], [0.42, 0.12, 0.7]] : [[1, 0.055, 1], [2.76, 0.028, 0.55], [5.4, 0.014, 0.3]];
    for (const [r, d, a] of modes) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * r * (1 + (Math.random() - 0.5) * 0.02);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(a, now + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d * (0.6 + k * 0.8));
      o.connect(g).connect(out); o.start(now); o.stop(now + d * 1.6 + 0.02);
    }
    // estalo do contato
    const n = ctx.createBufferSource(); n.buffer = this.noise; n.playbackRate.value = 1.3;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = low ? 1400 : 2600; f.Q.value = 1.2;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.7, now); ng.gain.exponentialRampToValueAtTime(0.001, now + 0.012);
    n.connect(f).connect(ng).connect(out); n.start(now, Math.random()); n.stop(now + 0.03);
    if (low && k > 0.25) {
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(150, now); o.frequency.exponentialRampToValueAtTime(70, now + 0.12);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.5 * k, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      o.connect(g).connect(out); o.start(now); o.stop(now + 0.2);
    }
  }

  /** Atrito contínuo: slide 0..1 (velocidade), tension 0..1 (quanto está preso). */
  friction(slide, tension) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.slideGain.gain.setTargetAtTime(this.on ? Math.min(0.32, slide * 0.32) : 0, t, 0.04);
    this.slideBp.frequency.setTargetAtTime(900 + slide * 1600, t, 0.05);
    this.creakGain.gain.setTargetAtTime(this.on ? Math.max(0, tension - 0.55) * 0.5 : 0, t, 0.08);
  }

  tone(freqs, dur = 0.5, type = 'sine', vol = 0.12, gap = 0.09) {
    const ctx = this.ctx;
    if (!ctx || !this.on) return;
    const now = ctx.currentTime;
    freqs.forEach((fq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = fq;
      const t0 = now + i * gap;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.master); g.connect(this.verbIn);
      o.start(t0); o.stop(t0 + dur + 0.05);
    });
  }

  click() { this.tone([1250], 0.06, 'triangle', 0.05); }
  turn() { this.tone([659.3, 987.8], 0.7, 'sine', 0.09, 0.12); }
  myTurn() { this.tone([523.3, 659.3, 784], 0.8, 'sine', 0.1, 0.1); }
  pick() { this.tone([880, 1318], 0.18, 'triangle', 0.05, 0.05); }
  placed() { this.tone([784, 1046.5], 0.5, 'sine', 0.07, 0.08); }
  ok() { this.tone([523.3, 784, 1046.5], 0.9, 'sine', 0.08, 0.09); }

  collapse() {
    const ctx = this.ctx;
    if (!ctx || !this.on) return;
    const now = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, now); f.frequency.exponentialRampToValueAtTime(120, now + 1.6);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.35, now + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
    n.connect(f).connect(g).connect(this.master); g.connect(this.verbIn);
    n.start(now); n.stop(now + 2);
    this.tone([392, 311.1, 246.9], 0.9, 'triangle', 0.06, 0.22);
  }
}
