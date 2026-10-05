// A partida: regras do tênis de mesa, rebatidas, efeitos, IA e sincronia online.
import * as THREE from 'three';
import {
  TABLE, HALF_L, HALF_W, BALL_R, DT, MAX_SPIN, BallState, stepBall,
  solveShot, solveServe, predictReceive, predictBounce,
} from './physics.js';
import { Mii } from './mii.js';
import { MouseInput, CpuInput, RemoteInput, RacketInput } from './input.js';
import { Trail, Sparks, Ripples, LandingMarker, Confetti, SPIN_COLORS } from './fx.js';

const HIT_Z = HALF_L + 0.18;
const BODY_Z = HALF_L + 0.62;
const SPIN_K = 0.55;

export const SPIN_LABEL = {
  top: 'Topspin', back: 'Backspin', left: 'Spin à esquerda', right: 'Spin à direita', flat: 'Direto',
};

const CPU = {
  easy:   { speed: [3.4, 5.2], spin: 35,  miss: 0.16, edge: 0.3, react: 0.07 },
  normal: { speed: [4.6, 7.6], spin: 80,  miss: 0.08, edge: 0.2, react: 0.04 },
  hard:   { speed: [6.4, 10.5], spin: 130, miss: 0.035, edge: 0.1, react: 0.02 },
};

const ASSIST = {
  low:    { early: 0.19, late: 0.15, thr: 1.8, clamp: 0.3 },
  medium: { early: 0.24, late: 0.19, thr: 1.5, clamp: 0.85 },
  high:   { early: 0.32, late: 0.26, thr: 1.1, clamp: 1 },
};

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;

export function classifySpin(spinL) {
  const top = -spinL.x, side = spinL.y;
  if (Math.max(Math.abs(top), Math.abs(side)) < 30) return 'flat';
  if (Math.abs(top) >= Math.abs(side)) return top > 0 ? 'top' : 'back';
  return side > 0 ? 'left' : 'right';
}

export class Match {
  /**
   * opts: { world, audio, settings, mode: 'cpu'|'local2'|'online-host'|'online-guest',
   *         players: [{ name, avatar, hand, kind: 'human'|'cpu'|'remote', phone: RacketInput|null, allowMouse }],
   *         send(msg), hooks }
   */
  constructor(opts) {
    Object.assign(this, opts);
    this.scene = this.world.scene;
    this.ball = new BallState();
    this.score = [0, 0];
    this.pointsToWin = this.settings.points || 7;
    this.firstServer = 0;
    this.simTime = 0;
    this.acc = 0;
    this.paused = false;
    this.over = false;
    this.timers = [];
    this.rtt = 60;
    this.localSides = this.players.map((p, i) => (p.kind !== 'remote' ? i : -1)).filter((i) => i >= 0);
    this.humanSides = this.players.map((p, i) => (p.kind === 'human' ? i : -1)).filter((i) => i >= 0);
    this.primary = this.mode === 'online-guest' ? 1 : 0;

    this.fx = {
      trail: new Trail(this.scene),
      sparks: new Sparks(this.scene),
      ripples: new Ripples(this.scene),
      marker: new LandingMarker(this.scene),
      confetti: new Confetti(this.scene),
    };
    this.applySettings(this.settings);

    this.P = this.players.map((cfg, side) => this._makePlayer(cfg, side));
    this.rally = { phase: 'wait', server: 0, lastHitter: -1, owner: 0, bounces: [], serveShot: false, receiverReady: false, netTouched: false, hitT: 0 };
    this.pred = null;
    this._poseTimer = 0;
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }

  // ---------- jogadores ----------
  _makePlayer(cfg, side) {
    const mii = new Mii({ ...cfg.avatar, hand: cfg.hand });
    mii.root.rotation.y = side === 1 ? Math.PI : 0;
    this.scene.add(mii.root);
    const pl = {
      side, sgn: side === 0 ? 1 : -1, cfg, mii,
      kind: cfg.kind, name: cfg.name, color: cfg.avatar.shirt,
      handSign: cfg.hand === 'left' ? -1 : 1,
      bodyX: 0, bodyZ: BODY_Z, racketXSlow: 0.25,
      racketPos: new THREE.Vector3(), racketQuat: new THREE.Quaternion(),
      shoulder: new THREE.Vector3((cfg.hand === 'left' ? -1 : 1) * 0.26, 1.0, -0.05),
      snap: 0, snapPos: new THREE.Vector3(),
      swinging: false, cpuPlan: null, serveTimer: 0,
      remoteBody: { x: 0, z: BODY_Z },
    };
    if (cfg.kind === 'cpu') pl.cpu = new CpuInput();
    if (cfg.kind === 'remote') pl.remote = new RemoteInput();
    if (cfg.kind === 'human') {
      pl.phone = cfg.phone || null;
      pl.mouse = cfg.allowMouse ? new MouseInput() : null;
      pl.idle = new RacketInput('idle');
      pl.idle.q.setFromEuler(new THREE.Euler(0.05, -0.5 * pl.handSign, 0, 'YXZ'));
      pl.idle.qSmooth.copy(pl.idle.q);
    }
    mii.root.position.set(0, 0, pl.sgn * BODY_Z);
    return pl;
  }

  inputOf(pl) {
    if (pl.kind === 'cpu') return pl.cpu;
    if (pl.kind === 'remote') return pl.remote;
    if (pl.phone && pl.phone.active) return pl.phone;
    return pl.mouse || pl.idle;
  }

  setPhone(side, input) { const pl = this.P[side]; if (pl && pl.kind === 'human') pl.phone = input; }
  isLocal(side) { return this.P[side].kind !== 'remote'; }
  isHuman(side) { return this.P[side].kind === 'human'; }

  applySettings(s) {
    this.settings = s;
    this.assist = ASSIST[s.assist] || ASSIST.medium;
    this.cpuDiff = CPU[s.difficulty] || CPU.normal;
    this.fx.trail.enabled = s.trail;
    this.fx.sparks.enabled = s.particles;
    if (this.P) for (const pl of this.P) if (pl.phone) pl.phone.sens = s.sensitivity;
  }

  // ---------- conversões local <-> mundo ----------
  toWorld(side, v, out = new THREE.Vector3()) { const s = side === 0 ? 1 : -1; return out.set(v.x * s, v.y, v.z * s); }
  toLocal(side, v, out = new THREE.Vector3()) { return this.toWorld(side, v, out); }

  // ---------- ciclo da partida ----------
  start() {
    this.score = [0, 0];
    this.over = false;
    this.rally.server = this.firstServer;
    this._emitScore();
    this.hooks.onMessage?.('Prontos?', 'info');
    this.audio.whistle();
    this._later(1.2, () => this._newServe());
  }

  serverFor(score) {
    const total = score[0] + score[1];
    const P = this.pointsToWin;
    if (score[0] >= P - 1 && score[1] >= P - 1) return (this.firstServer + total) % 2;
    return (this.firstServer + Math.floor(total / 2)) % 2;
  }

  _later(sec, fn) { this.timers.push({ t: sec, fn }); }

  _newServe() {
    if (this.over) return;
    const r = this.rally;
    r.server = this.serverFor(this.score);
    r.phase = 'serve';
    r.lastHitter = -1; r.owner = r.server; r.bounces = []; r.serveShot = false; r.receiverReady = false; r.netTouched = false;
    this.pred = null;
    this.fx.trail.reset();
    this.fx.marker.hide();
    const srv = this.P[r.server];
    srv.serveTimer = 0;
    for (const pl of this.P) pl.cpuPlan = null;
    this._emitScore();
    this.hooks.onServe?.(r.server);
    if (this.isHuman(r.server)) this.hooks.haptic?.(r.server, 'serve', 0.5);
  }

  _emitScore() { this.hooks.onScore?.(this.score.slice(), this.rally.server); }

  // ---------- saque ----------
  _handPos(pl, out) {
    const up = this.rally.phase === 'serve' ? 0 : 0.3;
    out.set(-pl.handSign * 0.24 + pl.bodyX, 0.98 + up + pl.mii.jump, pl.bodyZ - 0.36);
    return this.toWorld(pl.side, out, out);
  }

  toss(side, fromNet = false) {
    const r = this.rally;
    if (r.phase !== 'serve' || r.server !== side) return;
    const pl = this.P[side];
    this._handPos(pl, this.ball.p);
    this.ball.v.set(0, 3.1, 0);
    this.ball.w.set(0, 0, 0);
    r.phase = 'toss';
    r.tossT = this.simTime;
    this.audio.toss();
    this.fx.trail.reset();
    if (!fromNet && this.mode.startsWith('online')) this.send({ t: 'toss', side, b: this.ball.toArr() });
  }

  // ---------- rebatida (humano) ----------
  _humanSwing(pl, now) {
    const input = this.inputOf(pl);
    if (!input || input === pl.idle) return;
    const r = this.rally;
    const thr = this.assist.thr;
    const pk = input.peak(now, 110);
    const swingingNow = input.speed > thr * 1.6;
    if (swingingNow && !pl.swinging) this.audio.whoosh(Math.min(1, input.speed / 9), pl.sgn * 0.0);
    pl.swinging = swingingNow;

    if (r.phase === 'serve' && r.server === pl.side && input.consumeToss()) { this.toss(pl.side); return; }
    if (r.phase === 'toss' && r.server === pl.side && this.ball.v.y < 1.2 && this.ball.p.y > TABLE.H + 0.06) {
      if (pk && pk.speed > thr) this._serveHit(pl, pk);
      return;
    }
    if (r.phase === 'flight' && r.owner === pl.side && r.receiverReady && this.pred && this.pred.side === pl.side) {
      const d = this.simTime - this.pred.tAbs;
      if (d > -this.assist.early && d < this.assist.late && pk && pk.speed > thr) {
        // espera o pico do golpe (velocidade começando a cair) para usar a força máxima
        const falling = input.speed < pk.speed * 0.92;
        if (falling || d > this.assist.late - 0.03 || input === pl.mouse) this._humanHit(pl, pk, d);
      }
    }
  }

  _shotFromSwing(pl, pk, timing) {
    const vel = pk.vel, n = pk.n;
    const power = clamp((pk.speed - this.assist.thr * 0.8) / (8.5 - this.assist.thr), 0.06, 1.3);
    const fwd = Math.max(0.6, -vel.z);
    const velAngle = clamp(Math.atan2(vel.x, fwd), -0.9, 0.9);
    const faceAngle = clamp(Math.atan2(n.x, Math.max(0.3, -n.z)), -0.9, 0.9);
    let dir = 0.3 * velAngle + 0.3 * faceAngle + clamp(timing, -1.6, 1.6) * 0.28 * pl.handSign;
    // efeito: componente tangencial do golpe "escova" a bola
    const vn = vel.dot(n);
    const vt = this._v.copy(vel).addScaledVector(n, -vn);
    const spin = new THREE.Vector3().crossVectors(vt, n).multiplyScalar(SPIN_K / BALL_R);
    spin.y *= 0.55;
    if (spin.length() > MAX_SPIN) spin.setLength(MAX_SPIN);
    return { power, dir, spin, open: n.y };
  }

  _humanHit(pl, pk, d) {
    const timing = d / 0.18;
    const shot = this._shotFromSwing(pl, pk, timing);
    const p0 = this.toLocal(pl.side, this.ball.p);
    let { power, dir } = shot;
    const a = this.assist;
    let depth = 0.32 + 0.88 * Math.min(power, 1);
    let speedH = THREE.MathUtils.lerp(3.6, 11.5, Math.min(power, 1)) * (1 + Math.max(0, power - 1) * 0.4);
    if (shot.open > 0.4 && power < 0.5) speedH *= 0.72;
    if (Math.abs(timing) > 1.3) { speedH *= 0.7; dir += Math.sign(timing) * 0.35 * pl.handSign; }
    if (power > 1.05) depth += (power - 1.05) * 2.6 * (1 - a.clamp);
    let zt = -depth;
    let xt = p0.x + Math.tan(dir) * Math.abs(p0.z - zt);
    // ajuda de mira: puxa alvos para dentro da mesa
    const lim = HALF_W - 0.14;
    if (Math.abs(xt) > lim) xt = THREE.MathUtils.lerp(xt, Math.sign(xt) * lim, a.clamp);
    if (-zt > HALF_L - 0.08) zt = THREE.MathUtils.lerp(zt, -(HALF_L - 0.1), a.clamp);
    this._applyShot(pl, { x: xt, z: zt }, speedH, shot.spin, power);
  }

  _serveHit(pl, pk) {
    const shot = this._shotFromSwing(pl, pk, 0);
    const power = Math.min(1, shot.power);
    const zt = -(0.45 + 0.65 * power);
    const xt = clamp(Math.tan(shot.dir) * 2.6 + pl.bodyX * 0.2, -(HALF_W - 0.15), HALF_W - 0.15);
    shot.spin.multiplyScalar(0.7);
    this._applyServe(pl, { x: xt, z: zt }, shot.spin, power);
  }

  // ---------- rebatida (IA) ----------
  _cpuThink(pl) {
    const r = this.rally, d = this.cpuDiff;
    if (r.phase === 'serve' && r.server === pl.side) {
      pl.serveTimer += DT;
      if (pl.serveTimer > 1.1) this.toss(pl.side);
      return;
    }
    if (r.phase === 'toss' && r.server === pl.side) {
      if (this.ball.v.y < 0 && this.ball.p.y < TABLE.H + 0.42 && !pl.cpuServed) {
        pl.cpuServed = true;
        pl.cpu.startSwing(true, 0.5);
        const power = rand(0.3, 0.9);
        const spinL = new THREE.Vector3(rand(-1, 0.4) * d.spin * 0.6, rand(-1, 1) * d.spin * 0.4, 0);
        this._applyServe(pl, { x: rand(-0.55, 0.55), z: -(0.5 + 0.6 * power) }, spinL, power);
      }
      return;
    }
    pl.cpuServed = false;
    if (r.phase === 'flight' && r.owner === pl.side && r.receiverReady && this.pred && this.pred.side === pl.side) {
      if (!pl.cpuPlan) {
        const incoming = this.ball.v.length() + this.ball.w.length() / 40;
        const miss = d.miss + Math.max(0, incoming - 8) * 0.025;
        pl.cpuPlan = { t: this.pred.tAbs + rand(-d.react, d.react), miss: Math.random() < miss, swung: false };
      }
      const plan = pl.cpuPlan;
      if (!plan.swung && this.simTime >= plan.t - 0.16) {
        plan.swung = true;
        const pLoc = this.toLocal(pl.side, this.pred.p);
        pl.cpu.startSwing(pLoc.x - pl.bodyX >= 0 === (pl.handSign > 0), 0.5);
      }
      if (!plan.done && this.simTime >= plan.t) {
        plan.done = true;
        if (plan.miss && Math.random() < 0.5) return; // passou direto
        this._cpuHit(pl, plan.miss);
      }
    }
  }

  _cpuHit(pl, bad) {
    const d = this.cpuDiff;
    const edge = d.edge;
    let x = rand(-HALF_W + 0.1 + edge * 0.5, HALF_W - 0.1 - edge * 0.5);
    let z = -rand(0.45, HALF_L - 0.12 - edge * 0.3);
    let speedH = rand(d.speed[0], d.speed[1]);
    const kind = Math.random();
    const spinL = new THREE.Vector3();
    const s = rand(0.4, 1) * d.spin;
    if (kind < 0.55) spinL.set(-s, 0, 0);
    else if (kind < 0.75) { spinL.set(s * 0.8, 0, 0); speedH *= 0.8; }
    else spinL.set(-s * 0.3, (Math.random() < 0.5 ? 1 : -1) * s * 0.7, 0);
    if (bad) {
      if (Math.random() < 0.5) x = Math.sign(x || 1) * (HALF_W + rand(0.1, 0.4));
      else z = -(HALF_L + rand(0.15, 0.5));
    }
    const power = clamp((speedH - 3.6) / 7.9, 0.1, 1.1);
    this._applyShot(pl, { x, z }, speedH, spinL, power);
  }

  // ---------- aplicar golpe ----------
  _applyShot(pl, targetL, speedH, spinL, power) {
    const side = pl.side;
    const tW = this.toWorld(side, new THREE.Vector3(targetL.x, 0, targetL.z));
    const wW = this.toWorld(side, spinL, new THREE.Vector3());
    const v = solveShot(this.ball.p, { x: tW.x, z: tW.z }, speedH, wW);
    this.ball.v.copy(v);
    this.ball.w.copy(wW);
    this._afterHit(pl, power, spinL, false);
  }

  _applyServe(pl, targetL, spinL, power) {
    const side = pl.side;
    const tW = this.toWorld(side, new THREE.Vector3(targetL.x, 0, targetL.z));
    const wW = this.toWorld(side, spinL, new THREE.Vector3());
    const v = solveServe(this.ball.p, side, { x: tW.x, z: tW.z }, wW);
    this.ball.v.copy(v);
    this.ball.w.copy(wW);
    this._afterHit(pl, power * 0.7, spinL, true);
  }

  _afterHit(pl, power, spinL, serve, fromNet = false) {
    const r = this.rally;
    r.phase = 'flight';
    r.lastHitter = pl.side;
    r.owner = 1 - pl.side;
    r.bounces = [];
    r.serveShot = serve;
    r.receiverReady = false;
    r.netTouched = false;
    r.hitT = this.simTime;
    pl.snap = 1;
    pl.snapPos.copy(this.toLocal(pl.side, this.ball.p));
    pl.cpuPlan = null;
    this.predTried = false;
    const spinType = classifySpin(spinL);
    this.fx.trail.setSpinType(spinType);
    const col = SPIN_COLORS[spinType];
    this.fx.sparks.burst(this.ball.p, col, 10 + Math.round(power * 22), 1.2 + power * 2.5);
    this.audio.paddle(power, clamp(this.ball.p.x / 2, -0.8, 0.8));
    if (power > 0.95) { this.world.addShake(0.025); this.world.cheer(0.4); }
    if (this.isHuman(pl.side)) this.hooks.haptic?.(pl.side, 'hit', Math.min(1, power));
    const kmh = Math.round(this.ball.v.length() * 3.6);
    this.hooks.onShot?.({ side: pl.side, kmh, spin: spinType, power, serve });
    this.pred = null;
    // marcador de onde a bola vai quicar (modo de ajuda alta)
    this.fx.marker.hide();
    if (this.settings.assist === 'high' && this.isHuman(r.owner)) {
      const b = predictBounce(this.ball);
      if (b && b.side === r.owner) this.fx.marker.show(b.x, b.z);
    }
    if (!fromNet && this.mode.startsWith('online') && this.isLocal(pl.side)) {
      this.send({ t: 'hit', side: pl.side, b: this.ball.toArr(), serve, power, sl: [spinL.x, spinL.y, spinL.z] });
    }
  }

  // ---------- eventos de física ----------
  _onEvent(e) {
    const r = this.rally;
    const pan = clamp(e.x / 2, -0.8, 0.8);
    if (e.type === 'table') {
      this.audio.table(e.speed, pan);
      this.fx.ripples.spawn(e.x, TABLE.H, e.z, '#ffffff', 0.1 + Math.min(0.15, e.speed * 0.02));
      if (this.isHuman(e.side) && r.lastHitter !== e.side) this.hooks.haptic?.(e.side, 'bounce', 0.3);
    } else if (e.type === 'net') {
      this.audio.net();
      r.netTouched = true;
    } else if (e.type === 'floor') {
      this.audio.floor(e.speed, pan);
    }
    if (r.phase !== 'flight') return;
    if (e.type === 'table') {
      r.bounces.push(e.side);
      this.fx.marker.hide();
      const hitter = r.lastHitter, recv = 1 - hitter;
      if (r.serveShot) {
        if (r.bounces.length === 1 && e.side !== hitter) return this._fault(hitter, 'Saque errado!', 'O saque precisa quicar no seu lado primeiro');
        if (r.bounces.length === 2) {
          if (e.side === hitter) return this._fault(hitter, r.netTouched ? 'Na rede!' : 'Saque errado!', '');
          r.receiverReady = true;
          this._predict();
        }
        if (r.bounces.length >= 3) return this._point(hitter, 'Ponto!', 'Quicou duas vezes');
      } else {
        if (r.bounces.length === 1) {
          if (e.side === hitter) return this._fault(hitter, r.netTouched ? 'Na rede!' : 'Ops!', 'Quicou do próprio lado');
          r.receiverReady = true;
          this._predict();
        } else {
          return this._point(hitter, 'Ponto!', 'Quicou duas vezes');
        }
      }
      if (e.side === recv) this.pred && (this.pred.landing = { x: e.x, z: e.z });
    }
  }

  _predict() {
    const side = this.rally.owner;
    this.predTried = true;
    const p = predictReceive(this.ball, side, this.rally.receiverReady);
    this.pred = p ? { side, tAbs: this.simTime + p.t, p: p.p, landing: p.landing } : null;
  }

  _checkOutcome() {
    const r = this.rally;
    if (r.phase !== 'flight') return;
    if (!this.isLocal(r.owner)) return; // o dono da jogada decide
    const b = this.ball.p;
    const hitter = r.lastHitter, recv = 1 - hitter;
    const zr = (recv === 0 ? 1 : -1) * b.z;
    if (r.receiverReady) {
      if (b.y < TABLE.H - 0.25 || zr > HALF_L + 1.9) {
        this._point(hitter, 'Ponto!', this.isHuman(recv) ? 'A bola passou' : 'Não alcançou');
      }
    } else {
      const overTable = Math.abs(b.x) <= HALF_W && Math.abs(b.z) <= HALF_L;
      if (b.y < TABLE.H - 0.04 && !overTable) {
        this._fault(hitter, r.netTouched ? 'Na rede!' : 'Fora!', '');
      } else if (this.simTime - r.hitT > 4) {
        this._fault(hitter, 'Fora!', '');
      }
    }
  }

  _fault(side, title, sub) { this._point(1 - side, title, sub); }

  _point(winner, title, sub, fromNet = false, netScore = null) {
    const r = this.rally;
    if (r.phase === 'dead' && !fromNet) return;
    r.phase = 'dead';
    this.pred = null;
    this.fx.marker.hide();
    if (netScore) this.score = netScore.slice();
    else this.score[winner]++;
    if (!fromNet && this.mode.startsWith('online')) this.send({ t: 'point', winner, title, sub, score: this.score });
    const loser = 1 - winner;
    this.P[winner].mii.doCelebrate();
    this.P[loser].mii.doSad();
    const localWin = this.isHuman(winner) && this.humanSides.length === 1;
    const localLose = this.isHuman(loser) && this.humanSides.length === 1;
    if (localWin || this.humanSides.length === 2) this.audio.pointWin();
    else if (localLose) this.audio.pointLose();
    else this.audio.pointWin();
    this.audio.cheer(title === 'Ponto!' ? 1 : 0.6);
    if (title !== 'Ponto!') this.audio.ooh();
    this.world.cheer(1);
    if (this.isHuman(winner)) this.hooks.haptic?.(winner, 'point', 1);
    if (this.isHuman(loser)) this.hooks.haptic?.(loser, 'lose', 1);
    this.hooks.onPoint?.({ winner, title, sub, name: this.P[winner].name });
    this._emitScore();
    const [a, b] = this.score;
    const P = this.pointsToWin;
    if ((a >= P || b >= P) && Math.abs(a - b) >= 2) {
      this.over = true;
      this._later(1.6, () => this._end(a > b ? 0 : 1));
    } else {
      this._later(2.0, () => this._newServe());
    }
  }

  _end(winner) {
    this.rally.phase = 'over';
    this.P[winner].mii.doCelebrate();
    this.P[winner].mii.celebrate = 6;
    this.P[1 - winner].mii.doSad();
    this.P[1 - winner].mii.sad = 6;
    this.fx.confetti.fire(this.toWorld(winner, new THREE.Vector3(0, 0, BODY_Z)));
    this.audio.fanfare();
    this.audio.cheer(1.4);
    this.world.cheer(1.5);
    if (this.isHuman(winner)) this.hooks.haptic?.(winner, 'win', 1);
    this.hooks.onEnd?.({ winner, score: this.score.slice(), names: this.P.map((p) => p.name) });
  }

  rematch() {
    this.timers = [];
    this.firstServer = 1 - this.firstServer;
    this.start();
  }

  // ---------- mensagens online ----------
  onNet(m) {
    if (m.t === 'pose') {
      const pl = this.P[m.side];
      if (pl && pl.kind === 'remote') { pl.remote.setPose(m.q); pl.remoteBody.x = m.x; pl.remoteBody.z = m.z; }
    } else if (m.t === 'toss') {
      if (this.rally.phase === 'serve' || this.rally.phase === 'toss') {
        this.rally.phase = 'serve'; this.rally.server = m.side;
        this.toss(m.side, true);
        this.ball.fromArr(m.b);
      }
    } else if (m.t === 'hit') {
      const pl = this.P[m.side];
      this.ball.fromArr(m.b);
      const sl = new THREE.Vector3(m.sl[0], m.sl[1], m.sl[2]);
      this._afterHit(pl, m.power, sl, m.serve, true);
      if (pl.kind === 'remote') pl.remote.lastHitAt = performance.now();
      // avança a simulação pelo tempo que a mensagem levou para chegar
      const steps = Math.min(48, Math.round((this.rtt / 2000) * this.settings.gameSpeed / DT));
      for (let i = 0; i < steps; i++) this._physStep();
    } else if (m.t === 'point') {
      this._point(m.winner, m.title, m.sub, true, m.score);
    }
  }

  // ---------- simulação ----------
  _physStep() {
    const r = this.rally;
    this.simTime += DT;
    if (r.phase === 'serve') {
      this._handPos(this.P[r.server], this.ball.p);
      return;
    }
    if (r.phase === 'toss' || r.phase === 'flight' || r.phase === 'dead' || r.phase === 'over') {
      const ev = [];
      stepBall(this.ball, DT, ev);
      for (const e of ev) this._onEvent(e);
      if (r.phase === 'toss' && this.isLocal(r.server) && this.ball.p.y < TABLE.H + 0.02 && this.ball.v.y < 0) {
        // não rebateu o lançamento: lança de novo, sem falta
        r.phase = 'serve';
        this.P[r.server].serveTimer = 0.4;
        if (this.isHuman(r.server)) this.hooks.onMessage?.('Lance e rebata!', 'hint');
      }
      this._checkOutcome();
      if (r.phase === 'flight' && !this.pred && !this.predTried) this._predict();
    }
  }

  update(dt) {
    const now = performance.now();
    for (const pl of this.P) {
      const inp = this.inputOf(pl);
      inp.frame(dt, now);
      if (pl.phone && pl.phone !== inp) pl.phone.frame(dt, now);
    }
    if (!this.paused) {
      for (let i = this.timers.length - 1; i >= 0; i--) {
        const t = this.timers[i];
        t.t -= dt;
        if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
      }
      this.acc += Math.min(dt, 0.1) * (this.settings.gameSpeed || 1);
      while (this.acc >= DT) {
        this.acc -= DT;
        this._physStep();
        for (const pl of this.P) {
          if (pl.kind === 'human') this._humanSwing(pl, now);
          else if (pl.kind === 'cpu') this._cpuThink(pl);
        }
      }
    }
    for (const pl of this.P) this._updatePlayer(pl, dt);
    this._updateCamera();
    this._updateFx(dt, now);
    this._sendPose(dt);
  }

  _updatePlayer(pl, dt) {
    const r = this.rally;
    const inp = this.inputOf(pl);
    // pose da raquete pelo sensor
    inp.racketLocal(pl.shoulder, pl.racketPos, pl.racketQuat);
    pl.racketXSlow += (pl.racketPos.x - pl.racketXSlow) * Math.min(1, dt * 3);

    // deslocamento automático até a bola (como nos jogos de sala)
    let tx = 0, tz = BODY_Z;
    if (pl.kind === 'remote') {
      tx = pl.remoteBody.x; tz = pl.remoteBody.z;
    } else if ((r.phase === 'serve' || r.phase === 'toss') && r.server === pl.side) {
      tx = 0.25 * pl.handSign;
    } else if (this.pred && this.pred.side === pl.side && r.phase === 'flight') {
      const pL = this.toLocal(pl.side, this.pred.p);
      const left = this.pred.tAbs - this.simTime;
      if (left > 0.22 || pl.lockX === undefined) pl.lockX = pl.racketXSlow;
      tx = clamp(pL.x - pl.lockX, -2.3, 2.3);
      tz = clamp(pL.z + 0.42, HALF_L + 0.36, HALF_L + 1.6);
    } else if (r.phase === 'flight' && r.owner === pl.side) {
      tx = clamp(this.toLocal(pl.side, this.ball.p).x * 0.6 - pl.racketXSlow * 0.5, -1.5, 1.5);
      pl.lockX = undefined;
    } else {
      pl.lockX = undefined;
    }
    const maxV = pl.kind === 'remote' ? 8 : 4.8;
    const dx = clamp(tx - pl.bodyX, -maxV * dt, maxV * dt);
    pl.bodyX += dx * (pl.kind === 'remote' ? 1 : Math.min(1, 0.3 + Math.abs(tx - pl.bodyX) * 4));
    pl.bodyZ += clamp(tz - pl.bodyZ, -3 * dt, 3 * dt);
    pl.mii.root.position.set(pl.sgn * pl.bodyX, 0, pl.sgn * pl.bodyZ);

    // raquete encosta na bola perto do contato (ajuda visual)
    let w = 0;
    if (pl.snap > 0) {
      pl.snap = Math.max(0, pl.snap - dt * 5);
      w = pl.snap;
      this._v.copy(pl.snapPos);
      this._v.x -= pl.bodyX; this._v.z -= pl.bodyZ;
    } else if (this.pred && this.pred.side === pl.side && r.receiverReady) {
      const d = Math.abs(this.simTime - this.pred.tAbs);
      if (d < 0.25) {
        w = (1 - d / 0.25) * 0.55;
        this.toLocal(pl.side, this.ball.p, this._v);
        this._v.x -= pl.bodyX; this._v.z -= pl.bodyZ;
      }
    }
    if (w > 0) pl.racketPos.lerp(this._v.setY(Math.max(this._v.y, 0.85)), w);

    // mão livre segura a bola no saque
    let freeHand = null;
    if ((r.phase === 'serve' || r.phase === 'toss') && r.server === pl.side) {
      freeHand = new THREE.Vector3(-pl.handSign * 0.24, (r.phase === 'serve' ? 0.98 : 1.3) - 0.04, -0.36);
    }
    const look = this.toLocal(pl.side, this.ball.p);
    look.x -= pl.bodyX; look.z -= pl.bodyZ;
    pl.mii.update(dt, { racketPos: pl.racketPos, racketQuat: pl.racketQuat, freeHandPos: freeHand, lookAt: look });
    const focus = r.phase === 'flight' && r.owner === pl.side;
    if (pl.mii.mood === 'normal' || pl.mii.mood === 'focus') pl.mii.setMood(focus ? 'focus' : 'normal');
  }

  _updateCamera() {
    if (this.mode === 'demo') return;
    const mode = this.mode === 'local2' ? 'tv' : this.settings.camera;
    const pl = this.P[this.primary];
    if (mode === 'tv') {
      this.world.setCamera(new THREE.Vector3(5.2, 2.7, 0.2), new THREE.Vector3(0, 0.8, 0), 3);
      return;
    }
    const high = mode === 'high';
    // câmera um pouco para o lado da mão livre, para o boneco não tapar a mesa
    const off = -0.6 * pl.handSign;
    const pos = new THREE.Vector3(pl.bodyX * (high ? 0.3 : 0.55) + off, high ? 3.2 : 2.6, HALF_L + (high ? 3.4 : 3.1));
    const look = new THREE.Vector3(pl.bodyX * 0.3 + off * 0.15, high ? 0.55 : 0.62, high ? -0.4 : -0.9);
    this.world.setCamera(this.toWorld(pl.side, pos), this.toWorld(pl.side, look), 3.2);
  }

  _updateFx(dt, now) {
    const visible = this.rally.phase !== 'wait';
    this.world.setBall(this.ball.p, visible);
    const sp = this.ball.v.length();
    if (this.rally.phase === 'flight' || this.rally.phase === 'dead') this.fx.trail.push(this.ball.p, now / 1000);
    this.fx.trail.update(this.world.camera, this.rally.phase === 'flight' ? sp : sp * 0.5, now / 1000, dt);
    this.fx.sparks.update(dt);
    this.fx.ripples.update(dt);
    this.fx.marker.update(dt);
    this.fx.confetti.update(dt);
    // a bola gira visualmente com o spin
    this.world.ballMesh.rotation.x += this.ball.w.x * dt * 0.3;
    this.world.ballMesh.rotation.y += this.ball.w.y * dt * 0.3;
  }

  _sendPose(dt) {
    if (!this.mode.startsWith('online')) return;
    this._poseTimer -= dt;
    if (this._poseTimer > 0) return;
    this._poseTimer = 1 / 30;
    const pl = this.P[this.primary];
    const q = this.inputOf(pl).qSmooth;
    const r4 = (n) => Math.round(n * 1e4) / 1e4;
    this.send({ t: 'pose', side: pl.side, x: r4(pl.bodyX), z: r4(pl.bodyZ), q: [r4(q.x), r4(q.y), r4(q.z), r4(q.w)] });
  }

  dispose() {
    for (const pl of this.P) { this.scene.remove(pl.mii.root); pl.mii.dispose(); }
    const f = this.fx;
    for (const o of [f.trail.mesh, f.sparks.points, f.marker.g, f.confetti.mesh]) this.scene.remove(o);
    for (const r of f.ripples.pool) this.scene.remove(r.m);
    this.world.setBall(this.ball.p, false);
  }
}
