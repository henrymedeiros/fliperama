// Cena 3D: blocos de madeira com veios procedurais (únicos por bloco), mesa de nogueira
// envernizada, luminária pendente, poeira na luz e pós-processamento por qualidade.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { DofPass, LAYER_FX, LAYER_GAME, LAYER_NODEPTH } from './dof.js';
import { buildApartment } from './room.js';
import { rng } from './physics.js';
import { NOISE, BUMP } from './glsl.js';

function blockMaterial(r) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0 });
  const tint = 0.9 + r() * 0.16, warm = (r() - 0.5) * 0.06;
  const u = {
    uSeed: { value: new THREE.Vector3(r() * 100, r() * 100, r() * 100) },
    uRing: { value: new THREE.Vector2(Math.cos(r() * 6.3), Math.sin(r() * 6.3)).multiplyScalar(4 + r() * 14) },
    uRingF: { value: 1.3 + r() * 1.1 },
    uColA: { value: new THREE.Color(0.80 * tint, (0.585 + warm) * tint, (0.33 + warm) * tint) },
    uColB: { value: new THREE.Color(0.56 * tint, (0.34 + warm) * tint, (0.15 + warm * 0.5) * tint) },
    uBump: { value: 0.018 },
    uHL: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  m.userData.u = u;
  m.customProgramCacheKey = () => 'tb-wood-block';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos; varying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position; vObjN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vObjPos; varying vec3 vObjN;
uniform vec3 uSeed; uniform vec2 uRing; uniform float uRingF; uniform vec3 uColA; uniform vec3 uColB; uniform float uBump; uniform vec4 uHL;
${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float wH, wR;
vec3 wc = tbWood(vObjPos, uSeed, uRing, uRingF, uColA, uColB, wH, wR);
float endg = smoothstep(0.55, 0.85, abs(vObjN.x));
wc *= mix(1.0, 0.7, endg);
diffuseColor.rgb *= wc;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(wR + endg * 0.14, 0.3, 1.0);`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + BUMP)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float fr = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.2);
  totalEmissiveRadiance += uHL.rgb * uHL.a * (0.18 + fr * 1.4);
}`);
  };
  return m;
}

function tableMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.18 });
  m.customProgramCacheKey = () => 'tb-wood-table';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBump = { value: 0.02 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; uniform float uBump;
${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float board = floor((vWPos.z + 500.0) / 14.0);
float bf = fract((vWPos.z + 500.0) / 14.0);
vec3 tp = vec3(vWPos.x + tbHash(vec3(board, 1.3, 7.1)) * 300.0, (bf - 0.5) * 14.0, board * 7.31);
float warp = tbFbm(vec3(tp.x * 0.014, tp.y * 0.07, tp.z)) * 7.0;
float rr = tp.y + warp + 0.6 * sin(tp.x * 0.03 + tp.z);
float ring = fract(rr * 0.55);
float late = smoothstep(0.5, 0.9, ring) * (1.0 - smoothstep(0.9, 1.0, ring));
float fiber = tbNoise(vec3(tp.x * 0.09, tp.y * 3.2, tp.z));
float fine = tbNoise(vec3(tp.x * 0.4, tp.y * 14.0, tp.z + 3.0));
vec3 wc = mix(vec3(0.115, 0.052, 0.024), vec3(0.042, 0.017, 0.008), clamp(late * 0.65 + fiber * 0.25 + fine * 0.15, 0.0, 1.0));
wc *= 0.82 + 0.36 * tbFbm(vec3(tp.x * 0.008, tp.y * 0.05, tp.z + 9.0));
wc *= 0.9 + 0.2 * tbHash(vec3(board, 9.0, 1.0));
float wH = late * 0.5 + fiber * 0.4 + fine * 0.3, wR = 0.5 + fine * 0.15;
float seam = smoothstep(0.0, 0.012, bf) * smoothstep(1.0, 0.988, bf);
wc *= mix(0.35, 1.0, seam);
wH += (1.0 - seam) * 2.0;
diffuseColor.rgb *= wc;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(0.3 + wR * 0.35, 0.3, 0.8);`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + BUMP);
  };
  return m;
}

function radialTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const PRESETS = {
  alta: { pr: 2, shadow: 4096, spotShadow: true, ao: true, bloom: true, dof: true },
  media: { pr: 1.5, shadow: 2048, spotShadow: false, ao: false, bloom: true, dof: true },
  baixa: { pr: 1, shadow: 1024, spotShadow: false, ao: false, bloom: false, dof: false },
};

export class View {
  constructor(canvas, quality = 'alta') {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.08;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(0x07060a);
    s.fog = new THREE.FogExp2(0x0d0a08, 0.0008);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 2500);
    this.camera.layers.enable(LAYER_FX); this.camera.layers.enable(LAYER_GAME); this.camera.layers.enable(LAYER_NODEPTH);
    this.focusPoint = null; this.focus = 64;
    this.orbit = { theta: 0.75, phi: 0.32, dist: 66, ty: 12 };
    this.goal = { ...this.orbit };
    this.shake = 0;
    this.time = 0;

    this._lights();
    this._room();
    this.apt = buildApartment(s);
    this._fx();
    // reflexos: o ambiente é a própria sala, capturada um pouco acima da mesa
    const pm = new THREE.PMREMGenerator(r);
    s.position.set(0, -35, 0); s.updateMatrixWorld(true);
    s.environment = pm.fromScene(s, 0.02, 1, 2000).texture;
    s.position.set(0, 0, 0); s.updateMatrixWorld(true);
    s.environmentIntensity = 0.8;
    pm.dispose();
    this.blocks = [];
    this.ray = new THREE.Raycaster();
    this.setQuality(quality);
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  _lights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xffd9b0, 0x1a0f08, 0.2));
    // preenchimento suave que acompanha a câmera: a torre fica legível até contra a luz
    const fill = this.fill = new THREE.DirectionalLight(0xffe8d0, 0.55);
    fill.target.position.set(0, 12, 0);
    s.add(fill, fill.target);

    const key = this.key = new THREE.DirectionalLight(0xffe2c0, 1.1);
    key.position.set(38, 58, 30);
    key.target.position.set(0, 10, 0);
    key.castShadow = true;
    const sc = key.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 34; sc.bottom = -22; sc.near = 10; sc.far = 170;
    key.shadow.bias = -0.0003; key.shadow.normalBias = 0.025; key.shadow.radius = 4; key.shadow.intensity = 0.85;
    s.add(key, key.target);

    const spot = this.spot = new THREE.SpotLight(0xffc98a, 6.2, 175, 0.34, 0.85, 0);
    spot.position.set(0, 92, 0);
    spot.target.position.set(0, 0, 0);
    spot.shadow.camera.near = 40; spot.shadow.camera.far = 140;
    spot.shadow.bias = -0.0002; spot.shadow.normalBias = 0.03; spot.shadow.mapSize.set(2048, 2048); spot.shadow.intensity = 0.62;
    s.add(spot, spot.target);
  }

  _room() {
    const s = this.scene;
    const table = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 4, 128, 1), tableMaterial());
    table.position.y = -2; table.receiveShadow = true; table.layers.enable(LAYER_GAME);
    s.add(table);
    const cg = document.createElement('canvas'); cg.width = cg.height = 128;
    const cx = cg.getContext('2d'), gr = cx.createRadialGradient(64, 64, 10, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cg), transparent: true, depthWrite: false }));
    contact.rotation.x = -Math.PI / 2; contact.position.y = 0.03; contact.renderOrder = 1; contact.layers.enable(LAYER_GAME);
    s.add(contact);
    // borda arredondada da mesa
    const rimGeo = new THREE.TorusGeometry(70, 2, 16, 160);
    const rimM = new THREE.Mesh(rimGeo, new THREE.MeshPhysicalMaterial({ color: 0x1d0d06, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 }));
    rimM.rotation.x = Math.PI / 2; rimM.position.y = -2; rimM.layers.enable(LAYER_GAME);
    s.add(rimM);

    // luminária pendente
    const lamp = new THREE.Group();
    const shadeGeo = new THREE.LatheGeometry([
      new THREE.Vector2(1.2, 9), new THREE.Vector2(2.2, 8.4), new THREE.Vector2(5, 5), new THREE.Vector2(9.5, 0.8), new THREE.Vector2(10.4, 0),
    ], 64);
    const shade = new THREE.Mesh(shadeGeo, new THREE.MeshStandardMaterial({ color: 0x1b1712, roughness: 0.38, metalness: 0.85, side: THREE.DoubleSide }));
    const inner = new THREE.Mesh(shadeGeo.clone().scale(0.97, 0.97, 0.97), new THREE.MeshBasicMaterial({ color: 0xffb468, side: THREE.BackSide }));
    inner.material.color.multiplyScalar(1.6);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(2.1, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.86, 0.62).multiplyScalar(6) }));
    bulb.position.y = 1.8;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 120, 6), new THREE.MeshBasicMaterial({ color: 0x050403 }));
    cord.position.y = 69;
    lamp.add(shade, inner, bulb, cord);
    lamp.position.set(0, 95, 0);
    s.add(lamp);

    const r = rng(77);

    // poeira flutuando no cone de luz
    const n = 520, pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 30;
      pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = r() * 85; pos[i * 3 + 2] = Math.sin(a) * rr; seed[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.dustU = { uTime: { value: 0 }, uPR: { value: 1 } };
    const dm = new THREE.ShaderMaterial({
      uniforms: this.dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float seed; uniform float uTime; uniform float uPR; varying float vA;
        void main(){
          vec3 p = position;
          float t = uTime * (0.05 + seed * 0.08);
          p.x += sin(t * 2.1 + seed * 40.0) * 3.0; p.z += cos(t * 1.7 + seed * 23.0) * 3.0;
          p.y = mod(p.y + uTime * (0.3 + seed * 0.6) * (seed > 0.5 ? 1.0 : -1.0), 85.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float cone = 1.0 - smoothstep(0.0, 1.0, length(p.xz) / (4.0 + (95.0 - p.y) * 0.42));
          vA = cone * (0.35 + 0.65 * fract(seed * 7.3)) * (0.6 + 0.4 * sin(uTime * 2.0 + seed * 50.0));
          gl_PointSize = (0.9 + seed * 1.6) * uPR * (260.0 / -mv.z);
        }`,
      fragmentShader: /* glsl */`
        varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vec3(1.0, 0.82, 0.58) * a * vA * 0.28, 1.0); }`,
    });
    this.dust = new THREE.Points(g, dm);
    this.dust.frustumCulled = false;
    this.dust.layers.set(LAYER_NODEPTH);
    s.add(this.dust);
  }

  _fx() {
    const s = this.scene;
    // marcador da mão: ponto pego + "fio" de tensão até o alvo
    this.hand = new THREE.Group();
    const glow = radialTexture([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,.6)'], [1, 'rgba(255,255,255,0)']]);
    this.handDot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.handDot.scale.set(1.3, 1.3, 1);
    this.handTip = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffffff, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.handTip.scale.set(0.8, 0.8, 1);
    this.cord = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthTest: false, depthWrite: false }));
    this.hand.add(this.handDot, this.handTip, this.cord);
    this.hand.renderOrder = 10; this.handDot.renderOrder = 10; this.handTip.renderOrder = 10; this.cord.renderOrder = 10;
    this.hand.visible = false;
    this.hand.traverse((o) => o.layers.set(LAYER_FX));
    s.add(this.hand);

    // lugares livres no topo
    this.ghosts = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffd69a, transparent: true, opacity: 0.1, depthWrite: false }));
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffd69a, transparent: true, opacity: 0.55 }));
      g.add(box, edge); g.visible = false; g.userData = { box, edge };
      g.traverse((o) => o.layers.set(LAYER_FX));
      s.add(g); this.ghosts.push(g);
    }
  }

  setQuality(q) {
    this.quality = PRESETS[q] ? q : 'alta';
    const p = PRESETS[this.quality];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, p.pr));
    this.key.shadow.mapSize.set(p.shadow, p.shadow);
    if (this.key.shadow.map) { this.key.shadow.map.dispose(); this.key.shadow.map = null; }
    this.spot.castShadow = p.spotShadow;
    if (this.spot.shadow.map) { this.spot.shadow.map.dispose(); this.spot.shadow.map = null; }
    if (this.composer) { this.composer.dispose(); this.composer = null; }
    this.dof = null;
    if (p.ao || p.bloom || p.dof) {
      const w = innerWidth, h = innerHeight;
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
      const c = this.composer = new EffectComposer(this.renderer, rt);
      c.addPass(new RenderPass(this.scene, this.camera));
      if (p.ao) {
        const ao = this.ao = new GTAOPass(this.scene, this.camera, w, h);
        ao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16 });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
        ao.blendIntensity = 0.9;
        c.addPass(ao);
      }
      if (p.dof) c.addPass(this.dof = new DofPass(this.scene, this.camera));
      if (p.bloom) c.addPass(this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.3, 0.6, 0.95));
      c.addPass(new OutputPass());
    }
    this.dustU.uPR.value = this.renderer.getPixelRatio();
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // tela em pé: abre o campo pra torre caber
    this.camera.fov = w / h < 0.8 ? 52 : 38;
    this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
  }

  // ---------- blocos ----------
  buildBlocks(dims, seed) {
    for (const b of this.blocks) { this.scene.remove(b); b.geometry.dispose(); b.material.dispose(); }
    this.blocks = [];
    const r = rng(seed * 31 + 5);
    dims.forEach((d, i) => {
      const geo = new RoundedBoxGeometry(d.l, d.h, d.w, 3, 0.11);
      const m = new THREE.Mesh(geo, blockMaterial(r));
      m.castShadow = true; m.receiveShadow = true;
      m.userData.i = i;
      m.layers.enable(LAYER_GAME);
      m.matrixAutoUpdate = true;
      this.scene.add(m); this.blocks.push(m);
    });
  }

  setPoses(arr) {
    for (let i = 0; i < this.blocks.length; i++) {
      const j = i * 7, m = this.blocks[i];
      m.position.set(arr[j], arr[j + 1], arr[j + 2]);
      m.quaternion.set(arr[j + 3], arr[j + 4], arr[j + 5], arr[j + 6]);
    }
  }

  /** Brilho de borda: cor + intensidade. */
  glow(i, color, a) {
    const m = this.blocks[i]; if (!m) return;
    const u = m.material.userData.u.uHL.value;
    if (color != null) { const c = new THREE.Color(color); u.x = c.r; u.y = c.g; u.z = c.b; }
    u.w = a;
  }

  pick(nx, ny) {
    this.ray.setFromCamera({ x: nx, y: ny }, this.camera);
    const hit = this.ray.intersectObjects(this.blocks, false)[0];
    return hit ? { i: hit.object.userData.i, point: hit.point.clone() } : null;
  }

  rayPlaneY(nx, ny, y) {
    this.ray.setFromCamera({ x: nx, y: ny }, this.camera);
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    if (Math.abs(d.y) < 1e-4) return null;
    const t = (y - o.y) / d.y;
    if (t < 0) return null;
    return new THREE.Vector3(o.x + d.x * t, y, o.z + d.z * t);
  }

  /** Projeta na tela (pixels CSS). */
  toScreen(p) {
    const v = new THREE.Vector3(p.x, p.y, p.z).project(this.camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, front: v.z < 1 };
  }

  // ---------- mão e topo ----------
  setHand(gp, tgt, tension, color = 0xffffff) {
    if (!gp) { this.hand.visible = false; return; }
    this.hand.visible = true;
    this.handDot.position.set(gp.x, gp.y, gp.z);
    const c = new THREE.Color(color);
    const hot = new THREE.Color().setHSL(0.13 - Math.min(1, tension) * 0.13, 1, 0.6);
    this.handDot.material.color.copy(c).lerp(hot, Math.min(1, tension));
    if (tgt) {
      this.handTip.visible = true; this.cord.visible = true;
      this.handTip.position.set(tgt.x, tgt.y, tgt.z);
      const a = new THREE.Vector3(gp.x, gp.y, gp.z), b = new THREE.Vector3(tgt.x, tgt.y, tgt.z);
      const len = a.distanceTo(b);
      this.cord.position.copy(a); this.cord.lookAt(b); this.cord.scale.set(1 + tension * 1.5, 1 + tension * 1.5, Math.max(0.001, len));
      this.cord.material.color.copy(hot);
      this.handTip.material.color.copy(hot);
    } else { this.handTip.visible = false; this.cord.visible = false; }
  }

  setGhosts(slots, dims, active) {
    this.ghosts.forEach((g, k) => {
      const s = slots && slots[k];
      if (!s) { g.visible = false; return; }
      g.visible = true;
      g.position.set(s.x, s.y + dims.h / 2 + 0.02, s.z);
      g.rotation.set(0, s.yaw, 0);
      g.scale.set(dims.l, dims.h, dims.w);
      const on = active === k;
      g.userData.box.material.opacity = on ? 0.26 : 0.08 + 0.04 * Math.sin(this.time * 4 + k);
      g.userData.edge.material.opacity = on ? 0.95 : 0.4;
      g.userData.box.material.color.set(on ? 0xfff0c8 : 0xffc983);
      g.userData.edge.material.color.set(on ? 0xffffff : 0xffc983);
    });
  }

  // ---------- câmera e quadro ----------
  update(dt) {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 7), o = this.orbit, g = this.goal;
    g.phi = Math.max(0.05, Math.min(1.38, g.phi));
    g.dist = Math.max(16, Math.min(150, g.dist));
    o.theta += (g.theta - o.theta) * k; o.phi += (g.phi - o.phi) * k;
    o.dist += (g.dist - o.dist) * k; o.ty += (g.ty - o.ty) * (1 - Math.exp(-dt * 4));
    const cp = Math.cos(o.phi);
    const tx = 0, tz = 0;
    this.camera.position.set(tx + Math.sin(o.theta) * cp * o.dist, o.ty + Math.sin(o.phi) * o.dist, tz + Math.cos(o.theta) * cp * o.dist);
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-dt * 5);
    }
    this.camera.lookAt(tx, o.ty, tz);
    this.fill.position.copy(this.camera.position).add(new THREE.Vector3(0, 40, 0));
    this.fill.target.position.set(tx, o.ty, tz);
    // foco: o bloco na mão ou o centro da torre na altura que a câmera olha
    const fp = this.focusPoint || { x: tx, y: o.ty, z: tz };
    const fd = this.camera.position.distanceTo(new THREE.Vector3(fp.x, fp.y, fp.z));
    this.focus += (fd - this.focus) * (1 - Math.exp(-dt * 6));
    if (this.dof) this.dof.focus = this.focus;
    this.dustU.uTime.value = this.time;
  }

  render() {
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }
}
