// Efeitos: rastro da bola, faíscas, ondas de quique, marcador de pouso e confete.
import * as THREE from 'three';
import { TABLE } from './physics.js';

export const SPIN_COLORS = {
  top: new THREE.Color('#ff7a2e'),
  back: new THREE.Color('#3aa8ff'),
  left: new THREE.Color('#5ee06a'),
  right: new THREE.Color('#c86bff'),
  flat: new THREE.Color('#fff4c2'),
};

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Trail {
  constructor(scene, max = 64) {
    this.max = max;
    this.hist = [];
    const pos = new Float32Array(max * 2 * 3);
    const col = new Float32Array(max * 2 * 4);
    const idx = [];
    for (let i = 0; i < max - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.color = SPIN_COLORS.flat.clone();
    this.targetColor = SPIN_COLORS.flat.clone();
    this.enabled = true;
  }

  reset() { this.hist.length = 0; this.geo.setDrawRange(0, 0); }
  setSpinType(t) { this.targetColor.copy(SPIN_COLORS[t] || SPIN_COLORS.flat); }

  push(p, now) {
    this.hist.push({ p: p.clone(), t: now });
    if (this.hist.length > this.max) this.hist.shift();
  }

  update(camera, speed, now, dt) {
    this.color.lerp(this.targetColor, Math.min(1, dt * 6));
    const win = THREE.MathUtils.clamp((speed - 2.2) * 0.02, 0, 0.3);
    if (!this.enabled || win <= 0.005 || this.hist.length < 2) { this.geo.setDrawRange(0, 0); return; }
    const pts = [];
    for (let i = this.hist.length - 1; i >= 0; i--) {
      if (now - this.hist[i].t > win) break;
      pts.push(this.hist[i].p);
    }
    if (pts.length < 2) { this.geo.setDrawRange(0, 0); return; }
    const pos = this.geo.attributes.position.array, col = this.geo.attributes.color.array;
    const width = THREE.MathUtils.clamp(0.012 + speed * 0.0032, 0.015, 0.05);
    const intensity = THREE.MathUtils.clamp((speed - 2) / 8, 0.25, 1);
    const toCam = new THREE.Vector3(), dir = new THREE.Vector3(), side = new THREE.Vector3();
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q = pts[Math.min(i + 1, n - 1)], r = pts[Math.max(i - 1, 0)];
      dir.subVectors(r, q);
      if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
      toCam.subVectors(camera.position, p);
      side.crossVectors(dir, toCam).normalize();
      const f = 1 - i / (n - 1);
      const w = width * (0.15 + 0.85 * f);
      const a = Math.pow(f, 1.4) * intensity;
      const k = i * 2;
      pos[k * 3] = p.x + side.x * w; pos[k * 3 + 1] = p.y + side.y * w; pos[k * 3 + 2] = p.z + side.z * w;
      pos[k * 3 + 3] = p.x - side.x * w; pos[k * 3 + 4] = p.y - side.y * w; pos[k * 3 + 5] = p.z - side.z * w;
      for (const j of [k, k + 1]) {
        col[j * 4] = this.color.r; col[j * 4 + 1] = this.color.g; col[j * 4 + 2] = this.color.b; col[j * 4 + 3] = a;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
  }
}

export class Sparks {
  constructor(scene, count = 240) {
    this.count = count;
    this.p = new Float32Array(count * 3);
    this.v = new Float32Array(count * 3);
    this.c = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.next = 0;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
      size: 0.05, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < count; i++) this.p[i * 3 + 1] = -10;
    this.enabled = true;
  }
  burst(pos, color, n = 20, speed = 2) {
    if (!this.enabled) return;
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.count;
      this.p[i * 3] = pos.x; this.p[i * 3 + 1] = pos.y; this.p[i * 3 + 2] = pos.z;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
      const s = speed * (0.4 + Math.random() * 0.8);
      this.v[i * 3] = Math.sin(ph) * Math.cos(th) * s;
      this.v[i * 3 + 1] = Math.abs(Math.cos(ph)) * s + 0.5;
      this.v[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * s;
      this.c[i * 3] = color.r; this.c[i * 3 + 1] = color.g; this.c[i * 3 + 2] = color.b;
      this.life[i] = 0.35 + Math.random() * 0.35;
    }
  }
  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.v[i * 3 + 1] -= 6 * dt;
      this.p[i * 3] += this.v[i * 3] * dt;
      this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      const f = Math.max(0, this.life[i] / 0.7);
      this.c[i * 3] *= 0.97 + 0.03 * f; this.c[i * 3 + 1] *= 0.96; this.c[i * 3 + 2] *= 0.96;
      if (this.life[i] <= 0) this.p[i * 3 + 1] = -10;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

export class Ripples {
  constructor(scene, n = 8) {
    this.pool = [];
    const geo = new THREE.RingGeometry(0.8, 1, 40);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.pool.push({ m, t: 1 });
    }
    this.i = 0;
  }
  spawn(x, y, z, color = '#ffffff', size = 0.12) {
    const r = this.pool[this.i]; this.i = (this.i + 1) % this.pool.length;
    r.m.position.set(x, y + 0.003, z);
    r.m.material.color.set(color);
    r.t = 0; r.size = size; r.m.visible = true;
  }
  update(dt) {
    for (const r of this.pool) {
      if (r.t >= 1) { r.m.visible = false; continue; }
      r.t += dt * 2.2;
      const s = r.size * (0.3 + r.t * 1.4);
      r.m.scale.set(s, s, s);
      r.m.material.opacity = (1 - r.t) * 0.85;
    }
  }
}

export class LandingMarker {
  constructor(scene) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.095, 32), new THREE.MeshBasicMaterial({ color: '#ffd65a', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), new THREE.MeshBasicMaterial({ color: '#ffd65a', transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }));
    ring.rotation.x = dot.rotation.x = -Math.PI / 2;
    g.add(ring, dot);
    g.visible = false;
    scene.add(g);
    this.g = g; this.t = 0;
  }
  show(x, z) { this.g.visible = true; this.g.position.set(x, TABLE.H + 0.004, z); }
  hide() { this.g.visible = false; }
  update(dt) {
    this.t += dt;
    const s = 1 + Math.sin(this.t * 10) * 0.12;
    this.g.scale.set(s, 1, s);
  }
}

export class Confetti {
  constructor(scene, n = 220) {
    this.n = n;
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.06, 0.1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), n);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.parts = [];
    const cols = ['#ff8c42', '#ffd65a', '#4fb36b', '#43bff5', '#e8566c', '#7a5cff', '#ffffff'];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.mesh.setColorAt(i, c.set(cols[i % cols.length]));
      this.parts.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() });
    }
    scene.add(this.mesh);
    this.time = 0;
  }
  fire(center) {
    this.mesh.visible = true;
    this.time = 5;
    for (const q of this.parts) {
      q.p.set(center.x + (Math.random() - 0.5) * 3, 4 + Math.random() * 3, center.z + (Math.random() - 0.5) * 3);
      q.v.set((Math.random() - 0.5) * 2, -0.5 - Math.random(), (Math.random() - 0.5) * 2);
      q.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      q.w.set(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4);
    }
  }
  update(dt) {
    if (!this.mesh.visible) return;
    this.time -= dt;
    if (this.time <= 0) { this.mesh.visible = false; return; }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    this.parts.forEach((p, i) => {
      p.v.y = Math.max(p.v.y - dt * 0.6, -1.2);
      p.p.addScaledVector(p.v, dt);
      p.p.x += Math.sin(this.time * 3 + i) * dt * 0.3;
      p.r.x += p.w.x * dt; p.r.y += p.w.y * dt; p.r.z += p.w.z * dt;
      if (p.p.y < 0.02) p.p.y = 0.02;
      q.setFromEuler(p.r);
      m.compose(p.p, q, s);
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
