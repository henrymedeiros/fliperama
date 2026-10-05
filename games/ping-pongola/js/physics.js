// Física da bola: gravidade, arrasto, efeito Magnus (spin), quique com atrito na mesa.
// Coordenadas: mesa centrada na origem, eixo longo em Z. Lado 0 fica em +Z, lado 1 em -Z.
import * as THREE from 'three';

export const TABLE = { L: 2.74, W: 1.525, H: 0.76, NET_H: 0.1525, NET_OVER: 0.1525 };
export const BALL_R = 0.022;
export const GRAV = 9.81;
export const DT = 1 / 240;

const DRAG = 0.1;
const MAGNUS = 0.0034;
const SPIN_DECAY = 0.3;
const E_TABLE = 0.88;
const FRIC = 0.3;
const E_FLOOR = 0.6;
export const HALF_L = TABLE.L / 2;
export const HALF_W = TABLE.W / 2;
export const TOP = TABLE.H + BALL_R;
export const MAX_SPIN = 170;

export class BallState {
  constructor() {
    this.p = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.w = new THREE.Vector3();
  }
  copy(o) { this.p.copy(o.p); this.v.copy(o.v); this.w.copy(o.w); return this; }
  clone() { return new BallState().copy(this); }
  toArr() {
    const r = (n) => Math.round(n * 1e5) / 1e5;
    return [this.p.x, this.p.y, this.p.z, this.v.x, this.v.y, this.v.z, this.w.x, this.w.y, this.w.z].map(r);
  }
  fromArr(a) {
    this.p.set(a[0], a[1], a[2]); this.v.set(a[3], a[4], a[5]); this.w.set(a[6], a[7], a[8]);
    return this;
  }
}

const _a = new THREE.Vector3();
const _m = new THREE.Vector3();

/** Avança a bola um passo. Empurra eventos ('table' | 'net' | 'floor') em `ev`. */
export function stepBall(b, dt, ev) {
  const p = b.p, v = b.v, w = b.w;
  const py = p.y, pz = p.z;
  const sp = v.length();

  _a.set(0, -GRAV, 0).addScaledVector(v, -DRAG * sp);
  _m.crossVectors(w, v).multiplyScalar(MAGNUS);
  _a.add(_m);
  v.addScaledVector(_a, dt);
  p.addScaledVector(v, dt);
  w.multiplyScalar(1 - SPIN_DECAY * dt);

  // Rede
  if ((pz >= 0) !== (p.z >= 0)) {
    if (Math.abs(p.x) < HALF_W + TABLE.NET_OVER && p.y < TABLE.H + TABLE.NET_H + BALL_R && p.y > TABLE.H - BALL_R) {
      const from = pz >= 0 ? 0 : 1;
      p.z = from === 0 ? BALL_R * 1.01 : -BALL_R * 1.01;
      v.z *= -0.15; v.x *= 0.5; v.y = Math.min(v.y * 0.3, 0.4);
      w.multiplyScalar(0.3);
      if (ev) ev.push({ type: 'net', side: from, x: p.x, y: p.y, z: p.z, speed: sp });
    }
  }

  // Tampo da mesa
  if (v.y < 0 && p.y < TOP && py >= TOP - 0.004 &&
      Math.abs(p.x) <= HALF_W + BALL_R * 0.5 && Math.abs(p.z) <= HALF_L + BALL_R * 0.5) {
    const vin = -v.y;
    p.y = TOP;
    // Velocidade do ponto de contato (v + w × c, c = (0,-R,0))
    const ux = v.x + w.z * BALL_R;
    const uz = v.z - w.x * BALL_R;
    const dvx = -FRIC * ux, dvz = -FRIC * uz;
    v.x += dvx; v.z += dvz;
    // Torque do atrito em esfera oca: Δw = 3/(2R²) · (c × Δv)
    w.x += -1.5 * dvz / BALL_R;
    w.z += 1.5 * dvx / BALL_R;
    v.y = vin * E_TABLE;
    if (ev) ev.push({ type: 'table', side: p.z >= 0 ? 0 : 1, x: p.x, y: p.y, z: p.z, speed: vin });
  }

  // Chão
  if (p.y < BALL_R && v.y < 0) {
    const vin = -v.y;
    p.y = BALL_R;
    v.y = vin * E_FLOOR; v.x *= 0.85; v.z *= 0.85;
    w.multiplyScalar(0.6);
    if (vin > 0.35 && ev) ev.push({ type: 'floor', side: p.z >= 0 ? 0 : 1, x: p.x, y: p.y, z: p.z, speed: vin });
  }

  // Grades da área de jogo
  if (Math.abs(p.x) > 4.6) { p.x = Math.sign(p.x) * 4.6; v.x *= -0.4; }
  if (Math.abs(p.z) > 6.2) { p.z = Math.sign(p.z) * 6.2; v.z *= -0.4; }
}

const _sim = new BallState();
const _ev = [];

/** Voa até a bola cruzar a altura do tampo descendo. Retorna o ponto de pouso. */
export function flyToLanding(p0, v0, w0, maxT = 3) {
  const b = _sim;
  b.p.copy(p0); b.v.copy(v0); b.w.copy(w0);
  let net = false;
  for (let t = 0; t < maxT; t += DT) {
    const py = b.p.y;
    _ev.length = 0;
    stepBall(b, DT, _ev);
    for (const e of _ev) {
      if (e.type === 'net') net = true;
      if (e.type === 'table') return { x: e.x, z: e.z, t, net, onTable: true, side: e.side };
    }
    if (b.v.y < 0 && py >= TOP && b.p.y < TOP) return { x: b.p.x, z: b.p.z, t, net, onTable: false };
    if (net && b.p.y < TABLE.H - 0.1) return { x: b.p.x, z: b.p.z, t, net, onTable: false };
  }
  return null;
}

function ballistic(p0, tx, tz, speedH, out) {
  const dx = tx - p0.x, dz = tz - p0.z;
  const d = Math.max(0.2, Math.hypot(dx, dz));
  const t = d / speedH;
  const dy = TOP - p0.y;
  const vy = (dy + 0.5 * GRAV * t * t) / t;
  return out.set(dx / t, vy, dz / t);
}

/**
 * Encontra a velocidade inicial para a bola quicar em `target` (x,z) do outro lado,
 * com velocidade horizontal ~`speedH` e spin `w`. Método de tiro: simula e corrige a mira.
 */
export function solveShot(p0, target, speedH, w) {
  const aim = { x: target.x, z: target.z };
  let s = speedH;
  const v = new THREE.Vector3();
  let best = null, bestErr = Infinity;
  for (let it = 0; it < 12; it++) {
    ballistic(p0, aim.x, aim.z, s, v);
    const r = flyToLanding(p0, v, w);
    if (!r) { s *= 0.9; continue; }
    if (r.net) { s *= 0.88; continue; }
    const ex = target.x - r.x, ez = target.z - r.z;
    const err = Math.hypot(ex, ez);
    if (err < bestErr) { bestErr = err; best = v.clone(); }
    if (err < 0.015) break;
    aim.x += ex; aim.z += ez;
  }
  if (!best) { ballistic(p0, target.x, target.z, speedH * 0.6, v); v.y += 0.6; best = v.clone(); }
  return best;
}

/**
 * Saque: a bola tem que quicar primeiro do lado de quem saca e depois do outro lado.
 * Busca a velocidade horizontal que leva o segundo quique mais perto do alvo.
 */
export function solveServe(p0, side, target, w) {
  const sgn = side === 0 ? 1 : -1;
  const z1 = sgn * (HALF_L - 0.42);
  const k = Math.abs(z1 - p0.z) / Math.max(0.3, Math.abs(target.z - p0.z));
  const x1 = p0.x + (target.x - p0.x) * k;
  const v = new THREE.Vector3();
  let best = null, bestErr = Infinity;
  const b = _sim;
  for (let s = 2.2; s <= 9; s += 0.2) {
    ballistic(p0, x1, z1, s, v);
    b.p.copy(p0); b.v.copy(v); b.w.copy(w);
    const bounces = [];
    let fail = false;
    for (let t = 0; t < 2.5 && bounces.length < 2 && !fail; t += DT) {
      _ev.length = 0;
      stepBall(b, DT, _ev);
      for (const e of _ev) {
        if (e.type === 'table') bounces.push(e);
        else fail = true;
      }
    }
    if (fail || bounces.length < 2) continue;
    if (bounces[0].side !== side || bounces[1].side === side) continue;
    const err = Math.abs(bounces[1].z - target.z) + 0.5 * Math.abs(bounces[1].x - target.x);
    if (err < bestErr) { bestErr = err; best = v.clone(); }
  }
  if (!best) best = ballistic(p0, x1, z1, 4, v).clone();
  return best;
}

/**
 * Prevê quando e onde o lado `side` deve rebater: depois de a bola quicar do seu lado,
 * quando ela passa pela linha de fundo ou começa a cair perto da mesa.
 */
export function predictReceive(b0, side, alreadyBounced = false, maxT = 2.5) {
  const b = _sim.copy(b0);
  const sgn = side === 0 ? 1 : -1;
  let bounced = alreadyBounced;
  let landing = null;
  for (let t = 0; t < maxT; t += DT) {
    _ev.length = 0;
    stepBall(b, DT, _ev);
    for (const e of _ev) {
      if (e.type === 'table') {
        if (e.side === side && !bounced) { bounced = true; landing = { x: e.x, z: e.z, t }; }
        else if (bounced) return null; // quicou duas vezes
        // quique do outro lado antes (primeiro quique do saque): ignora
      } else if (e.type === 'floor') {
        return null;
      }
    }
    if (bounced) {
      const zl = sgn * b.p.z;
      if (zl >= HALF_L + 0.12) return { t, p: b.p.clone(), landing };
      if (b.v.y < 0 && b.p.y < TABLE.H + 0.16) return { t, p: b.p.clone(), landing };
    }
  }
  return null;
}

/** Onde a bola vai quicar (para o marcador de ajuda). */
export function predictBounce(b0, maxT = 2) {
  const b = _sim.copy(b0);
  for (let t = 0; t < maxT; t += DT) {
    _ev.length = 0;
    stepBall(b, DT, _ev);
    for (const e of _ev) {
      if (e.type === 'table') return { x: e.x, z: e.z, side: e.side, t };
      if (e.type === 'floor') return null;
    }
  }
  return null;
}
