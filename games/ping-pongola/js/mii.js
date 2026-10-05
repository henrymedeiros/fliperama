// Bonequinhos estilo "avatar de sala de estar": cabeção, mãos flutuantes, rosto em textura.
import * as THREE from 'three';
import { miiFace } from './textures.js';

const geoCache = {};
function geo(key, make) { return geoCache[key] || (geoCache[key] = make()); }

export function makeRacket() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#e8333c', roughness: 0.55 });
  const black = new THREE.MeshStandardMaterial({ color: '#22252b', roughness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: '#e6c08a', roughness: 0.5 });
  const rim = new THREE.MeshStandardMaterial({ color: '#c99a5c', roughness: 0.45 });
  const disc = geo('rk-disc', () => new THREE.CylinderGeometry(0.083, 0.083, 0.004, 40));
  const front = new THREE.Mesh(disc, red); front.rotation.x = Math.PI / 2; front.position.z = -0.0045;
  const back = new THREE.Mesh(disc, black); back.rotation.x = Math.PI / 2; back.position.z = 0.0045;
  const core = new THREE.Mesh(geo('rk-core', () => new THREE.CylinderGeometry(0.081, 0.081, 0.006, 40)), rim);
  core.rotation.x = Math.PI / 2;
  const handle = new THREE.Mesh(geo('rk-handle', () => new THREE.CapsuleGeometry(0.016, 0.075, 4, 10)), wood);
  handle.position.y = -0.12; handle.scale.z = 0.75;
  const neck = new THREE.Mesh(geo('rk-neck', () => new THREE.BoxGeometry(0.03, 0.03, 0.014)), wood);
  neck.position.y = -0.082;
  for (const m of [front, back, core, handle, neck]) { m.castShadow = true; g.add(m); }
  return g;
}

export class Mii {
  constructor(opts = {}) {
    this.opts = { shirt: '#ff8c42', skin: '#f6cfa8', hair: '#5b3a24', hairStyle: 'short', pants: '#34507a', hand: 'right', ...opts };
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.mood = 'normal';
    this.t = Math.random() * 10;
    this.jump = 0; this.jumpV = 0;
    this.walk = 0;
    this.prevX = 0;
    this.celebrate = 0;
    this.sad = 0;
    this._build();
  }

  get handSign() { return this.opts.hand === 'left' ? -1 : 1; }

  _build() {
    const o = this.opts;
    const skinMat = new THREE.MeshStandardMaterial({ color: o.skin, roughness: 0.6 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: o.shirt, roughness: 0.65 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: o.pants, roughness: 0.7 });
    const hairMat = new THREE.MeshStandardMaterial({ color: o.hair, roughness: 0.55 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: o.shirt, roughness: 0.5 });
    this.mats = { skinMat, shirtMat, pantsMat, hairMat };

    // pernas e tênis
    this.legs = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      const thigh = new THREE.Mesh(geo('leg', () => new THREE.CapsuleGeometry(0.062, 0.32, 4, 10)), pantsMat);
      thigh.position.y = 0.28;
      const shoe = new THREE.Mesh(geo('shoe', () => new THREE.CapsuleGeometry(0.06, 0.08, 4, 10)), shoeMat);
      shoe.rotation.x = Math.PI / 2; shoe.position.set(0, 0.055, -0.035); shoe.scale.set(1.05, 1, 0.8);
      const stripe = new THREE.Mesh(geo('stripe', () => new THREE.TorusGeometry(0.058, 0.012, 6, 16)), stripeMat);
      stripe.position.set(0, 0.075, -0.03); stripe.rotation.y = Math.PI / 2;
      leg.add(thigh, shoe, stripe);
      leg.position.x = s * 0.085;
      for (const m of leg.children) m.castShadow = true;
      this.body.add(leg);
      this.legs.push(leg);
    }

    // quadril + tronco (formato de pera)
    const hips = new THREE.Mesh(geo('hips', () => new THREE.CapsuleGeometry(0.15, 0.06, 6, 16)), pantsMat);
    hips.position.y = 0.53; hips.scale.set(1, 0.8, 0.85);
    const torsoGeo = geo('torso', () => {
      const pts = [[0, 0], [0.17, 0.0], [0.205, 0.1], [0.2, 0.24], [0.165, 0.36], [0.1, 0.43], [0.05, 0.45], [0, 0.45]]
        .map(([x, y]) => new THREE.Vector2(x, y));
      return new THREE.LatheGeometry(pts, 28);
    });
    const torso = new THREE.Mesh(torsoGeo, shirtMat);
    torso.position.y = 0.55; torso.scale.z = 0.85;
    // detalhe da gola
    const collar = new THREE.Mesh(geo('collar', () => new THREE.TorusGeometry(0.06, 0.018, 8, 20)), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }));
    collar.rotation.x = Math.PI / 2; collar.position.y = 0.995;
    this.torso = new THREE.Group();
    this.torso.add(hips, torso, collar);
    for (const m of this.torso.children) m.castShadow = true;
    this.body.add(this.torso);

    // cabeça
    this.head = new THREE.Group();
    this.head.position.y = 1.18;
    this.faces = {
      normal: miiFace(o.skin, 'normal'),
      happy: miiFace(o.skin, 'happy'),
      sad: miiFace(o.skin, 'sad'),
      focus: miiFace(o.skin, 'focus'),
    };
    this.faceMat = new THREE.MeshStandardMaterial({ map: this.faces.normal, roughness: 0.55 });
    const skull = new THREE.Mesh(geo('skull', () => new THREE.SphereGeometry(0.19, 40, 28)), this.faceMat);
    skull.scale.set(1, 1.04, 0.97);
    skull.rotation.y = Math.PI; // rosto da textura em +Z; o boneco olha para -Z
    skull.castShadow = true;
    this.head.add(skull);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(geo('ear', () => new THREE.SphereGeometry(0.04, 12, 10)), skinMat);
      ear.position.set(s * 0.185, -0.01, 0.01); ear.scale.set(0.6, 1, 0.9);
      this.head.add(ear);
    }
    this._buildHair(hairMat);
    this.body.add(this.head);

    // mãos flutuantes
    const handGeo = geo('hand', () => new THREE.SphereGeometry(0.052, 16, 12));
    this.racketHand = new THREE.Mesh(handGeo, skinMat);
    this.freeHand = new THREE.Mesh(handGeo, skinMat);
    this.racketHand.castShadow = this.freeHand.castShadow = true;
    this.root.add(this.racketHand, this.freeHand);

    this.racket = makeRacket();
    this.root.add(this.racket);

    // sombra de contato macia
    const shadowTex = geo('blobTex', () => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(0,0,0,0.45)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    });
    const blob = new THREE.Mesh(geo('blob', () => new THREE.PlaneGeometry(0.7, 0.55)), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.012;
    this.root.add(blob);
  }

  _buildHair(mat) {
    const style = this.opts.hairStyle;
    const cap = new THREE.Mesh(geo('hairCap', () => new THREE.SphereGeometry(0.205, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.5)), mat);
    cap.rotation.x = 0.38; cap.position.set(0, 0.025, -0.01); cap.scale.set(1.02, 1.05, 1.02);
    cap.castShadow = true;
    this.head.add(cap);
    // franja
    const fringe = new THREE.Mesh(geo('fringe', () => new THREE.SphereGeometry(0.2, 24, 10, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.18, Math.PI * 0.2)), mat);
    fringe.rotation.y = Math.PI; fringe.position.set(0, 0.03, 0);
    this.head.add(fringe);
    if (style === 'bob') {
      const back = new THREE.Mesh(geo('bob', () => new THREE.SphereGeometry(0.215, 30, 18, Math.PI * 0.75, Math.PI * 1.5, Math.PI * 0.3, Math.PI * 0.42)), mat);
      back.position.y = -0.005; back.rotation.y = Math.PI;
      back.castShadow = true;
      this.head.add(back);
    } else if (style === 'pony') {
      const tie = new THREE.Mesh(geo('ponyTie', () => new THREE.SphereGeometry(0.045, 12, 10)), mat);
      tie.position.set(0, 0.1, 0.19);
      const tail = new THREE.Mesh(geo('ponyTail', () => new THREE.CapsuleGeometry(0.06, 0.16, 6, 12)), mat);
      tail.position.set(0, -0.02, 0.24); tail.rotation.x = -0.35;
      tail.castShadow = true;
      this.head.add(tie, tail);
      this.ponytail = tail;
    } else {
      const tuft = new THREE.Mesh(geo('tuft', () => new THREE.ConeGeometry(0.05, 0.1, 10)), mat);
      tuft.position.set(0.02, 0.215, -0.02); tuft.rotation.z = -0.4;
      this.head.add(tuft);
    }
  }

  setMood(m) {
    if (this.mood === m) return;
    this.mood = m;
    this.faceMat.map = this.faces[m] || this.faces.normal;
    this.faceMat.needsUpdate = true;
  }

  doCelebrate() { this.celebrate = 1.6; this.sad = 0; this.setMood('happy'); this.jumpV = 2.6; }
  doSad() { this.sad = 1.6; this.celebrate = 0; this.setMood('sad'); }

  /**
   * dt; racketLocal: {pos, quat} no espaço do root; freeHandLocal: Vector3 opcional.
   */
  update(dt, { racketPos, racketQuat, freeHandPos, lookAt } = {}) {
    this.t += dt;
    const x = this.root.position.x;
    const speed = Math.abs(x - this.prevX) / Math.max(dt, 1e-3);
    this.prevX = x;
    this.walk += dt * Math.min(speed, 4) * 7;
    const stepAmt = Math.min(1, speed * 0.8);

    // pulo
    if (this.jumpV !== 0 || this.jump > 0) {
      this.jumpV -= 9.8 * dt;
      this.jump += this.jumpV * dt;
      if (this.jump <= 0) {
        this.jump = 0;
        this.jumpV = this.celebrate > 0.4 ? 2.4 : 0;
      }
    }
    this.celebrate = Math.max(0, this.celebrate - dt);
    this.sad = Math.max(0, this.sad - dt);
    if (this.celebrate === 0 && this.sad === 0 && (this.mood === 'happy' || this.mood === 'sad')) this.setMood('normal');

    const bob = Math.sin(this.t * 3.2) * 0.008;
    this.body.position.y = this.jump + bob + Math.abs(Math.sin(this.walk)) * 0.025 * stepAmt;
    this.legs[0].position.z = Math.sin(this.walk) * 0.06 * stepAmt;
    this.legs[1].position.z = -Math.sin(this.walk) * 0.06 * stepAmt;
    this.legs[0].position.y = Math.max(0, Math.sin(this.walk)) * 0.04 * stepAmt;
    this.legs[1].position.y = Math.max(0, -Math.sin(this.walk)) * 0.04 * stepAmt;

    const slump = this.sad > 0 ? 0.25 : 0;
    this.torso.rotation.x = -0.08 - slump * 0.5;
    this.head.rotation.x = -slump;
    this.head.position.y = 1.18 - slump * 0.06;

    if (racketPos) {
      this.racket.position.copy(racketPos);
      this.racket.position.y += this.jump;
      this.racket.quaternion.copy(racketQuat);
      // mão no cabo
      _v.set(0, -0.125, 0).applyQuaternion(racketQuat).add(this.racket.position);
      this.racketHand.position.copy(_v);
      // tronco gira levemente acompanhando a raquete
      const twist = THREE.MathUtils.clamp(-racketPos.x * 0.6, -0.45, 0.45);
      this.torso.rotation.y += (twist - this.torso.rotation.y) * Math.min(1, dt * 10);
      this.head.rotation.y = this.torso.rotation.y * 0.4;
    }
    if (freeHandPos) {
      this.freeHand.position.copy(freeHandPos);
    } else if (this.celebrate > 0) {
      this.freeHand.position.set(-this.handSign * 0.3, 1.45 + this.jump + Math.sin(this.t * 14) * 0.05, -0.05);
    } else {
      this.freeHand.position.set(-this.handSign * 0.29, 0.78 + this.jump + bob * 2, -0.12);
    }
    if (lookAt) {
      // lookAt no espaço local do boneco
      const yaw = Math.atan2(lookAt.x, -lookAt.z);
      this.head.rotation.y = -THREE.MathUtils.clamp(yaw, -0.7, 0.7) * 0.6 + this.torso.rotation.y * 0.3;
    }
    if (this.ponytail) this.ponytail.rotation.x = -0.35 + Math.sin(this.t * 6) * 0.08 * (stepAmt + 0.3);
  }

  dispose() {
    this.root.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.dispose?.(); });
    Object.values(this.faces).forEach((t) => t.dispose());
  }
}

const _v = new THREE.Vector3();
