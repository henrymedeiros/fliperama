// Transforma os sensores do celular (ou o mouse, ou a IA) no movimento da raquete.
// Referencial do jogador: -Z aponta para a mesa, +Y para cima, +X para a direita.
import * as THREE from 'three';

// Centro da raquete em relação ao ombro, no referencial do aparelho
// (celular em pé, traseira virada para a TV = raquete em posição neutra).
export const R_DEV = new THREE.Vector3(0, 0.1, -0.45);
const _r = new THREE.Vector3();
const _v = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, -1);

export class RacketInput {
  constructor(kind = 'phone') {
    this.kind = kind;
    this.q = new THREE.Quaternion();
    this.qSmooth = new THREE.Quaternion();
    this.omega = new THREE.Vector3();
    this.acc = new THREE.Vector3();
    this.vLin = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 0, -1);
    this.speed = 0;
    this.hist = [];
    this.sens = 1;
    this.lastSampleAt = 0;
    this.lastPhoneTs = 0;
    this.tossFlag = false;
    this._tossCooldown = 0;
    this.raw = null;
  }

  get active() { return performance.now() - this.lastSampleAt < 1500; }

  /** Amostra vinda do celular: q (orientação calibrada), r (giro rad/s no aparelho), a (aceleração linear m/s²). */
  feed(m, now) {
    if (m.ts && m.ts <= this.lastPhoneTs) return; // chegou fora de ordem
    const dt = this.lastPhoneTs ? THREE.MathUtils.clamp((m.ts - this.lastPhoneTs) / 1000, 0.001, 0.05) : 0.016;
    this.lastPhoneTs = m.ts || 0;
    this.q.set(m.q[0], m.q[1], m.q[2], m.q[3]).normalize();
    if (m.r) this.omega.set(m.r[0], m.r[1], m.r[2]).applyQuaternion(this.q);
    if (m.a) this.acc.set(m.a[0], m.a[1], m.a[2]).applyQuaternion(this.q);
    this.raw = m;
    this.lastSampleAt = now;
    this._sample(now, dt);
  }

  _sample(now, dt) {
    // velocidade linear "sentida" pelo acelerômetro, com vazamento para não acumular erro
    this.vLin.addScaledVector(this.acc, dt);
    this.vLin.multiplyScalar(Math.exp(-dt * 7));
    _r.copy(R_DEV).applyQuaternion(this.q);
    this.vel.crossVectors(this.omega, _r).addScaledVector(this.vLin, 0.6).multiplyScalar(this.sens);
    this.normal.copy(FWD).applyQuaternion(this.q);
    this.speed = this.vel.length();
    this.hist.push({ t: now, vel: this.vel.clone(), n: this.normal.clone(), speed: this.speed });
    while (this.hist.length && now - this.hist[0].t > 350) this.hist.shift();

    this._tossCooldown -= dt;
    if (this.acc.y > 6.5 && this._tossCooldown <= 0) { this.tossFlag = true; this._tossCooldown = 0.8; }
  }

  /** Maior golpe nos últimos `win` ms. */
  peak(now, win = 120) {
    let best = null;
    for (let i = this.hist.length - 1; i >= 0; i--) {
      const h = this.hist[i];
      if (now - h.t > win) break;
      if (!best || h.speed > best.speed) best = h;
    }
    return best;
  }

  consumeToss() { const t = this.tossFlag; this.tossFlag = false; return t; }

  frame(dt, now) {
    if (now - this.lastSampleAt > 250) {
      // sem dados recentes: não deixa a raquete "girando sozinha"
      this.omega.multiplyScalar(Math.exp(-dt * 10));
      this.vel.multiplyScalar(Math.exp(-dt * 10));
      this.speed = this.vel.length();
    }
    this.qSmooth.slerp(this.q, 1 - Math.exp(-dt * 30));
  }

  /** Posição/rotação da raquete no espaço do boneco. */
  racketLocal(shoulder, outPos, outQuat) {
    outQuat.copy(this.qSmooth);
    outPos.copy(R_DEV).applyQuaternion(this.qSmooth).add(shoulder);
  }
}

/** Mouse como raquete: posição = ângulo; movimento rápido = golpe; clique = golpe reto. */
export class MouseInput extends RacketInput {
  constructor() {
    super('mouse');
    this.nx = 0.35; this.ny = 0.1;
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.yawRate = 0; this.pitchRate = 0;
    this.keys = { top: false, back: false, left: false, right: false };
    this.click = 0;
    this.clickPower = 1;
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
  }
  setPointer(nx, ny) { this.nx = THREE.MathUtils.clamp(nx, -1, 1); this.ny = THREE.MathUtils.clamp(ny, -1, 1); }
  swing(power = 1) { this.click = 0.11; this.clickPower = power; }

  frame(dt, now) {
    const yaw = -this.nx * 1.15;
    const pitch = -this.ny * 0.55;
    const yr = (yaw - this.yaw) / Math.max(dt, 1e-3);
    const pr = (pitch - this.pitch) / Math.max(dt, 1e-3);
    this.yawRate += (yr - this.yawRate) * Math.min(1, dt * 25);
    this.pitchRate += (pr - this.pitchRate) * Math.min(1, dt * 25);
    this.yaw = yaw; this.pitch = pitch;
    this.roll = yaw * 0.25;
    this._e.set(pitch, yaw, this.roll, 'YXZ');
    this.q.setFromEuler(this._e);
    this.omega.set(Math.cos(yaw) * this.pitchRate, this.yawRate, -Math.sin(yaw) * this.pitchRate);
    this.acc.set(0, 0, 0);
    this.lastSampleAt = now;
    this._sample(now, dt);
    if (this.click > 0) {
      this.click -= dt;
      // golpe sintético para frente, com efeito escolhido pelas teclas
      const h = this.hist[this.hist.length - 1];
      const p = 3.5 + 4.5 * this.clickPower;
      h.vel.set(0, 0, -p);
      if (this.keys.top) h.vel.y += 4.2;
      if (this.keys.back) h.vel.y -= 4.2;
      // escovar para a direita faz a bola curvar para a esquerda (efeito Magnus)
      if (this.keys.left) h.vel.x += 3.6;
      if (this.keys.right) h.vel.x -= 3.6;
      h.n.set(0, this.keys.top ? -0.35 : this.keys.back ? 0.45 : 0, -1).normalize();
      h.speed = h.vel.length();
      this.vel.copy(h.vel); this.speed = h.speed;
    }
    this.qSmooth.copy(this.q);
  }
}

/** Raquete animada da IA. */
export class CpuInput extends RacketInput {
  constructor() {
    super('cpu');
    this.yaw = -0.5; this.pitch = 0.05;
    this.swingT = -1; this.swingDir = 1;
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
  }
  startSwing(forehand = true, topspin = 0) {
    this.swingT = 0;
    this.swingDir = forehand ? 1 : -1;
    this.topspin = topspin;
  }
  frame(dt, now) {
    let yaw, pitch;
    if (this.swingT >= 0) {
      this.swingT += dt;
      const t = Math.min(1, this.swingT / 0.32);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      yaw = this.swingDir * (-1.0 + e * 1.6);
      pitch = 0.05 + (this.topspin || 0) * (e - 0.4) * 0.6;
      if (this.swingT > 0.55) this.swingT = -1;
    } else {
      yaw = this.swingDir * -0.55 + Math.sin(now * 0.002) * 0.05;
      pitch = 0.05;
    }
    this.yaw += (yaw - this.yaw) * Math.min(1, dt * (this.swingT >= 0 ? 40 : 8));
    this.pitch += (pitch - this.pitch) * Math.min(1, dt * 10);
    this._e.set(this.pitch, this.yaw, this.yaw * 0.25, 'YXZ');
    this.q.setFromEuler(this._e);
    this.qSmooth.copy(this.q);
  }
}

/** Raquete do adversário online (pose recebida pela rede). */
export class RemoteInput extends RacketInput {
  constructor() { super('remote'); }
  setPose(arr) { this.q.set(arr[0], arr[1], arr[2], arr[3]).normalize(); this.lastSampleAt = performance.now(); }
  frame(dt) { this.qSmooth.slerp(this.q, 1 - Math.exp(-dt * 18)); }
}
