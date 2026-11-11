// Física da torre (Rapier). Unidades em centímetros e gramas: os blocos têm as medidas
// de um bloco de madeira de verdade (7,5 × 1,5 × 2,5 cm, ~17 g) e a gravidade é 981 cm/s².
// Este módulo não conhece three.js nem rede: o jogo e os testes do Node usam o mesmo código.

export const L = 7.5, H = 1.5, W = 2.5;
export const LAYERS = 18, PER = 3, N = LAYERS * PER;
export const G = 981;
export const DT = 1 / 240;
// parâmetros do solver (ajustados nos testes do Node; ver o comentário em Tower)
// Com a gravidade de verdade em peças de 1,5 cm, os contatos padrão do Rapier são macios demais:
// a torre afunda uns 3 cm e desaba sozinha. Contato rígido + erro permitido de 0,05 mm resolvem.
export const TUNE = { freq: 240, iters: 4, pgs: 4, friction: 4, err: 0.00005 };
export const PITCH = W + 0.02;          // distância entre os centros de blocos vizinhos na camada
const DENSITY = 0.6;                    // madeira clara, g/cm³
const MU_WOOD = 0.42, MU_TABLE = 0.6, BOUNCE = 0.06;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Medidas de cada bloco. Blocos de verdade variam alguns décimos de milímetro, e é isso
 * que deixa uns soltos e outros presos: o mais alto da camada carrega o peso de cima. */
export function makeDims(seed) {
  const r = rng(seed ^ 0x9e3779b9);
  const out = [];
  for (let i = 0; i < N; i++) {
    out.push({
      l: L * (1 + (r() - 0.5) * 0.004),
      h: H + (r() + r() - 1) * 0.028,   // ±0,28 mm, mais concentrado no meio
      w: W * (1 + (r() - 0.5) * 0.004),
    });
  }
  return out;
}

// ---------- quaternions sem dependência ----------
export const qmul = (a, b) => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});
export const qconj = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
export function qrot(q, v) {
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}
export const qyaw = (a) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const len = (v) => Math.hypot(v.x, v.y, v.z);

/** Eixo comprido do bloco no plano da mesa, como ângulo em [0, π). */
export function axisAngle(q) {
  const a = qrot(q, { x: 1, y: 0, z: 0 });
  let t = Math.atan2(-a.z, a.x);
  t = ((t % Math.PI) + Math.PI) % Math.PI;
  return t;
}

export class Tower {
  constructor(RAPIER, seed = 1, opts = {}) {
    this.R = RAPIER;
    this.seed = seed;
    this.dims = makeDims(seed);
    this.world = new RAPIER.World({ x: 0, y: -G, z: 0 });
    this.world.timestep = DT;
    this.world.lengthUnit = 100;                 // 100 unidades = 1 metro
    this.world.numSolverIterations = TUNE.iters;
    this.world.numAdditionalFrictionIterations = TUNE.friction;
    this.world.numInternalPgsIterations = TUNE.pgs;
    this.world.integrationParameters.contact_natural_frequency = TUNE.freq;
    this.world.integrationParameters.normalizedAllowedLinearError = TUNE.err;
    this.acc = 0;
    this.time = 0;

    const tb = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -2, 0));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(160, 2, 160).setFriction(MU_TABLE).setRestitution(BOUNCE), tb);

    this.bodies = []; this.cols = []; this.mass = [];
    this.layer = new Array(N).fill(0);          // camada lógica de cada bloco (-1 = na mão)
    this.prevV = new Float32Array(N * 3);
    this.lastHit = new Float32Array(N);
    this.hits = [];                              // [bloco, força 0..1] para o som
    this.colIndex = new Map();
    for (let i = 0; i < N; i++) {
      const d = this.dims[i];
      const b = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setLinearDamping(0.02).setAngularDamping(0.04).setCanSleep(true));
      const c = this.world.createCollider(RAPIER.ColliderDesc.cuboid(d.l / 2, d.h / 2, d.w / 2)
        .setDensity(DENSITY).setFriction(MU_WOOD).setRestitution(BOUNCE), b);
      this.bodies.push(b); this.cols.push(c); this.mass.push(b.mass());
      this.colIndex.set(c.handle, i);
    }
    this.held = -1; this.mode = 'idle';         // idle | grab | carry
    this.tension = 0; this.slide = 0;
    this.touched = new Set();
    this.build(opts.settle !== false);
  }

  /** Monta a torre camada por camada, com o leve desalinhamento de quem empilha à mão. */
  build(settle = true) {
    const r = rng(this.seed * 7 + 3);
    let floor = 0;
    for (let k = 0; k < LAYERS; k++) {
      const yaw = (k % 2 ? Math.PI / 2 : 0) + (r() - 0.5) * 0.012;
      let top = floor;
      for (let s = 0; s < PER; s++) {
        const i = k * PER + s, d = this.dims[i];
        const off = (s - 1) * PITCH + (r() - 0.5) * 0.04;
        const along = (r() - 0.5) * 0.12;
        // eixo comprido em yaw; vizinhos lado a lado no eixo perpendicular
        const ax = { x: Math.cos(yaw), z: -Math.sin(yaw) }, px = { x: Math.sin(yaw), z: Math.cos(yaw) };
        const y = floor + d.h / 2 + 0.0005;
        const b = this.bodies[i];
        b.setTranslation({ x: px.x * off + ax.x * along, y, z: px.z * off + ax.z * along }, true);
        b.setRotation(qyaw(yaw + (r() - 0.5) * 0.01), true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.layer[i] = k;
        top = Math.max(top, y + d.h / 2);
      }
      floor = top;
    }
    // assenta a torre antes de começar (as folgas de meio milímetro somem)
    if (settle) for (let t = 0; t < 1.5 / DT; t++) this.world.step();
    this.hits.length = 0;
    this._syncPrevV();
  }

  _syncPrevV() {
    for (let i = 0; i < N; i++) {
      const v = this.bodies[i].linvel();
      this.prevV[i * 3] = v.x; this.prevV[i * 3 + 1] = v.y; this.prevV[i * 3 + 2] = v.z;
    }
  }

  // ---------- mão ----------
  /** Pega o bloco i no ponto p (mundo). */
  grab(i, p) {
    if (this.held >= 0) this.release();
    const b = this.bodies[i], t = b.translation(), q = b.rotation();
    this.held = i; this.mode = 'grab';
    this.local = qrot(qconj(q), { x: p.x - t.x, y: p.y - t.y, z: p.z - t.z });
    this.target = { ...p };
    this.holdRot = { x: q.x, y: q.y, z: q.z, w: q.w };
    this.outT = 0;
    this.touched.add(i);
    b.setAngularDamping(3);
    b.wakeUp();
  }

  setTarget(p) { if (this.target) { this.target.x = p.x; this.target.y = p.y; this.target.z = p.z; } }

  /** Solta o bloco onde estiver (só no modo de puxar). */
  release() {
    const i = this.held;
    if (i < 0) return;
    if (this.mode === 'grab') this.bodies[i].setAngularDamping(0.04);
    if (this.mode === 'carry') return;  // na mão, só sai colocando
    this.held = -1; this.mode = 'idle'; this.tension = 0; this.slide = 0; this.target = null;
  }

  grabPointWorld() {
    if (this.held < 0) return null;
    const b = this.bodies[this.held], t = b.translation(), q = b.rotation();
    const r = qrot(q, this.local);
    return { x: t.x + r.x, y: t.y + r.y, z: t.z + r.z };
  }

  _applyGrab() {
    const i = this.held, b = this.bodies[i], m = this.mass[i];
    const t = b.translation(), q = b.rotation(), v = b.linvel(), w = b.angvel();
    const r = qrot(q, this.local);
    const gp = { x: t.x + r.x, y: t.y + r.y, z: t.z + r.z };
    const wr = cross(w, r);
    const pv = { x: v.x + wr.x, y: v.y + wr.y, z: v.z + wr.z };
    const om = 40, ze = 1.0;
    // a mão fica no máximo LEAD cm à frente do ponto pego: a força mede a resistência do bloco,
    // não a distância do cursor
    let ex = this.target.x - gp.x, ey = this.target.y - gp.y, ez = this.target.z - gp.z;
    const el = Math.hypot(ex, ey, ez), LEAD = 3;
    if (el > LEAD) { ex *= LEAD / el; ey *= LEAD / el; ez *= LEAD / el; }
    // força de mola amortecida no ponto pego + o peso do próprio bloco (os dedos o sustentam)
    const S = {
      x: m * (om * om * ex - 2 * ze * om * pv.x),
      y: m * (om * om * ey - 2 * ze * om * pv.y),
      z: m * (om * om * ez - 2 * ze * om * pv.z),
    };
    const fmax = m * G * 3.2;
    const ten = len(S) / fmax;
    let F = { x: S.x, y: S.y + m * G, z: S.z };
    const f = len(F);
    if (f > fmax) { const s = fmax / f; F.x *= s; F.y *= s; F.z *= s; }
    this.tension += (Math.min(1.2, Math.max(0, ten - 0.15) / 0.75) - this.tension) * 0.06;
    this.slide += (Math.min(1, Math.hypot(pv.x, pv.z) / 12) - this.slide) * 0.08;
    b.applyImpulseAtPoint({ x: F.x * DT, y: F.y * DT, z: F.z * DT }, gp, true);

    // os dedos seguram a orientação (torque limitado, dá pra torcer contra o peso da torre)
    const e = qmul(this.holdRot, qconj(q));
    const sgn = e.w < 0 ? -1 : 1;
    const I = m * (L * L) / 12;
    const kr = 140, cr = 2 * Math.sqrt(kr);
    let T = {
      x: I * (kr * 2 * e.x * sgn - cr * w.x),
      y: I * (kr * 2 * e.y * sgn - cr * w.y),
      z: I * (kr * 2 * e.z * sgn - cr * w.z),
    };
    const tmax = m * G * L * 0.6, tl = len(T);
    if (tl > tmax) { const s = tmax / tl; T.x *= s; T.y *= s; T.z *= s; }
    b.applyTorqueImpulse({ x: T.x * DT, y: T.y * DT, z: T.z * DT }, true);
  }

  /** O bloco pego está fora da torre (sem encostar em outro bloco e longe do eixo)? */
  heldIsOut() {
    const i = this.held;
    if (i < 0 || this.mode !== 'grab') return false;
    const t = this.bodies[i].translation();
    const c = this.layerCenter(this.layer[i], i);
    if (Math.hypot(t.x - c.x, t.z - c.z) < 4.6) return false;
    return !this.touchingBlock(i);
  }

  touchingBlock(i) {
    let touching = false;
    const col = this.cols[i];
    this.world.contactPairsWith(col, (c2) => {
      if (touching || !this.colIndex.has(c2.handle)) return;
      this.world.contactPair(col, c2, (man) => {
        for (let k = 0; k < man.numContacts(); k++) if (man.contactDist(k) < 0.03) { touching = true; break; }
      });
    });
    return touching;
  }

  // ---------- carregar e colocar ----------
  /** Tira o bloco da física da torre: ele vai na mão até o topo. */
  startCarry(i) {
    const R = this.R, b = this.bodies[i];
    if (this.held >= 0 && this.held !== i) this.release();
    this.held = i; this.mode = 'carry'; this.tension = 0; this.slide = 0;
    this.layer[i] = -1;
    b.setAngularDamping(0.04);
    b.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
    this.cols[i].setSensor(true);
    const t = b.translation(), q = b.rotation();
    this.carryPos = { x: t.x, y: t.y, z: t.z };
    this.carryRot = { x: q.x, y: q.y, z: q.z, w: q.w };
    this.carryGoal = { pos: { ...this.carryPos }, rot: { ...this.carryRot } };
  }

  setCarryGoal(pos, rot) { if (this.mode === 'carry') this.carryGoal = { pos, rot }; }

  _applyCarry(dt) {
    const b = this.bodies[this.held], g = this.carryGoal, p = this.carryPos;
    const k = 1 - Math.exp(-dt * 14);
    p.x += (g.pos.x - p.x) * k; p.y += (g.pos.y - p.y) * k; p.z += (g.pos.z - p.z) * k;
    this.carryRot = slerp(this.carryRot, g.rot, 1 - Math.exp(-dt * 10));
    b.setNextKinematicTranslation(p);
    b.setNextKinematicRotation(this.carryRot);
  }

  /** Larga o bloco carregado nesta pose (logo acima do lugar dele no topo). */
  place(pos, rot, layer) {
    const R = this.R, i = this.held;
    if (i < 0 || this.mode !== 'carry') return -1;
    const b = this.bodies[i];
    b.setBodyType(R.RigidBodyType.Dynamic, true);
    this.cols[i].setSensor(false);
    b.setTranslation(pos, true); b.setRotation(rot, true);
    b.setLinvel({ x: 0, y: -2, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.layer[i] = layer;
    this.held = -1; this.mode = 'idle'; this.target = null;
    return i;
  }

  // ---------- camadas e regras ----------
  topLayer() { let t = 0; for (let i = 0; i < N; i++) if (this.layer[i] > t) t = this.layer[i]; return t; }
  layerBlocks(k, except = -1) { const a = []; for (let i = 0; i < N; i++) if (this.layer[i] === k && i !== except) a.push(i); return a; }

  layerCenter(k, except = -1) {
    let bs = this.layerBlocks(k, except);
    if (!bs.length) bs = this.layerBlocks(k - 1).concat(this.layerBlocks(k + 1));
    if (!bs.length) return { x: 0, y: 0, z: 0 };
    let x = 0, y = 0, z = 0;
    for (const i of bs) { const t = this.bodies[i].translation(); x += t.x; y += t.y; z += t.z; }
    return { x: x / bs.length, y: y / bs.length, z: z / bs.length };
  }

  /** Pode puxar este bloco? Não vale mexer na última camada completa nem na incompleta acima dela. */
  isForbidden(i) {
    const top = this.topLayer(), n = this.layerBlocks(top).length;
    const k = this.layer[i];
    if (k < 0) return true;
    return n === PER ? k >= top : k >= top - 1;
  }

  /** Lugares livres no topo, já com a pose em que o bloco desce. */
  placementSlots() {
    const top = this.topLayer(), inTop = this.layerBlocks(top).filter((i) => i !== this.held);
    const full = inTop.length >= PER;
    const support = full ? top : top - 1, layer = full ? top + 1 : top;
    const sb = this.layerBlocks(support);
    if (!sb.length) return { layer, slots: [] };
    // eixo e centro da camada de apoio (média dos ângulos dobrados, pra ignorar o sentido)
    let cx = 0, cz = 0, sy = 0, sc = 0, tp = -1e9;
    for (const i of sb) {
      const b = this.bodies[i], t = b.translation(), a = axisAngle(b.rotation());
      cx += t.x; cz += t.z; sc += Math.cos(2 * a); sy += Math.sin(2 * a);
      tp = Math.max(tp, t.y + this.dims[i].h / 2);
    }
    cx /= sb.length; cz /= sb.length;
    const sa = Math.atan2(sy, sc) / 2;
    const ax = { x: Math.cos(sa), z: -Math.sin(sa) };
    // se a camada de apoio perdeu o bloco do meio, o centro vem da camada de baixo dela
    if (sb.length < PER) { const c = this.layerCenter(support - 1); cx = c.x; cz = c.z; }
    const yaw = sa + Math.PI / 2;
    const slots = [];
    for (let s = 0; s < PER; s++) {
      const off = (s - 1) * PITCH;
      const p = { x: cx + ax.x * off, z: cz + ax.z * off };
      const taken = inTop.length && !full && inTop.some((i) => {
        const t = this.bodies[i].translation();
        return Math.abs((t.x - p.x) * ax.x + (t.z - p.z) * ax.z) < PITCH * 0.55;
      });
      if (!taken) slots.push({ s, x: p.x, z: p.z, y: tp, yaw, ax });
    }
    return { layer, slots, top: tp, yaw, ax };
  }

  /** Blocos que caíram da torre (no chão ou longe dela). O bloco em mãos não conta. */
  fallen() {
    const out = [];
    for (let i = 0; i < N; i++) {
      if (i === this.held) continue;
      const t = this.bodies[i].translation();
      const k = this.layer[i];
      if (k < 0) continue;
      if ((k > 0 && t.y < H * 0.95) || Math.hypot(t.x, t.z) > 10.5 || t.y < -5) out.push(i);
    }
    return out;
  }

  maxSpeed(except = -1) {
    let m = 0;
    for (let i = 0; i < N; i++) {
      if (i === except || i === this.held) continue;
      const b = this.bodies[i];
      if (b.isSleeping()) continue;
      const v = b.linvel(); m = Math.max(m, Math.hypot(v.x, v.y, v.z));
    }
    return m;
  }

  // ---------- passo ----------
  step(dt, timeScale = 1) {
    this.acc += Math.min(dt, 0.05) * timeScale;
    let n = 0;
    while (this.acc >= DT && n < 12) {
      if (this.held >= 0) {
        if (this.mode === 'grab') this._applyGrab();
        else if (this.mode === 'carry') this._applyCarry(DT);
      }
      this.world.step();
      this._detectHits();
      this.acc -= DT; this.time += DT; n++;
    }
    if (n === 12) this.acc = 0;
    if (this.mode === 'grab') {
      this.outT = this.heldIsOut() ? this.outT + dt : 0;
    }
  }

  _detectHits() {
    const gdt = G * DT;
    for (let i = 0; i < N; i++) {
      const b = this.bodies[i];
      if (b.isSleeping()) continue;
      const v = b.linvel(), j = i * 3;
      const dx = v.x - this.prevV[j], dy = v.y - this.prevV[j + 1] + gdt, dz = v.z - this.prevV[j + 2];
      this.prevV[j] = v.x; this.prevV[j + 1] = v.y; this.prevV[j + 2] = v.z;
      const imp = Math.hypot(dx, dy, dz);
      if (imp > 14 && this.time - this.lastHit[i] > 0.05 && i !== this.held) {
        this.lastHit[i] = this.time;
        this.hits.push([i, Math.min(1, (imp - 14) / 160)]);
      }
    }
  }

  // ---------- estado (rede) ----------
  /** Poses de todos os blocos: x y z qx qy qz qw. */
  writePoses(out = new Float32Array(N * 7)) {
    for (let i = 0; i < N; i++) {
      const b = this.bodies[i], t = b.translation(), q = b.rotation(), j = i * 7;
      out[j] = t.x; out[j + 1] = t.y; out[j + 2] = t.z;
      out[j + 3] = q.x; out[j + 4] = q.y; out[j + 5] = q.z; out[j + 6] = q.w;
    }
    return out;
  }

  /** Estado completo para passar a vez: poses, velocidades, camadas. */
  exportState() {
    const p = this.writePoses();
    const v = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const b = this.bodies[i], a = b.linvel(), w = b.angvel(), j = i * 6;
      v[j] = a.x; v[j + 1] = a.y; v[j + 2] = a.z; v[j + 3] = w.x; v[j + 4] = w.y; v[j + 5] = w.z;
    }
    return { poses: Array.from(p), vels: Array.from(v), layer: this.layer.slice() };
  }

  importState(s) {
    const R = this.R;
    if (this.held >= 0) {
      const b = this.bodies[this.held];
      b.setBodyType(R.RigidBodyType.Dynamic, true); this.cols[this.held].setSensor(false);
      b.setAngularDamping(0.04);
    }
    this.held = -1; this.mode = 'idle'; this.target = null; this.tension = 0; this.slide = 0;
    for (let i = 0; i < N; i++) {
      const b = this.bodies[i], j = i * 7, k = i * 6;
      b.setTranslation({ x: s.poses[j], y: s.poses[j + 1], z: s.poses[j + 2] }, false);
      b.setRotation({ x: s.poses[j + 3], y: s.poses[j + 4], z: s.poses[j + 5], w: s.poses[j + 6] }, false);
      const vx = s.vels ? s.vels[k] : 0, vy = s.vels ? s.vels[k + 1] : 0, vz = s.vels ? s.vels[k + 2] : 0;
      b.setLinvel({ x: vx, y: vy, z: vz }, false);
      b.setAngvel({ x: s.vels ? s.vels[k + 3] : 0, y: s.vels ? s.vels[k + 4] : 0, z: s.vels ? s.vels[k + 5] : 0 }, false);
      if (Math.hypot(vx, vy, vz) > 0.5) b.wakeUp(); else b.sleep();
    }
    if (s.layer) for (let i = 0; i < N; i++) this.layer[i] = s.layer[i];
    this.acc = 0;
    this._syncPrevV();
  }
}

Tower.prototype.free = function () { try { this.world.free(); } catch (e) { /* já liberado */ } };

export function slerp(a, b, t) {
  let d = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  if (d < 0) { d = -d; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let s0, s1;
  if (d > 0.9995) { s0 = 1 - t; s1 = t; } else {
    const th = Math.acos(d), sn = Math.sin(th);
    s0 = Math.sin((1 - t) * th) / sn; s1 = Math.sin(t * th) / sn;
  }
  const x = a.x * s0 + bx * s1, y = a.y * s0 + by * s1, z = a.z * s0 + bz * s1, w = a.w * s0 + bw * s1;
  const n = Math.hypot(x, y, z, w);
  return { x: x / n, y: y / n, z: z / n, w: w / n };
}
