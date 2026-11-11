// O apartamento em volta da mesa: janela de esquadria preta com a cidade à noite, cortinas,
// varal de luzinhas, sofá, estante, plantas, luminárias, aparador com toca-discos, quadros e tapete.
// Medidas em centímetros; o tampo da mesa fica em y = 0 e o piso em y = -76.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { NOISE, BUMP } from './glsl.js';
import { rng } from './physics.js';

export const FLOOR = -76, CEIL = 200;
const X0 = -300, X1 = 320, Z0 = -250, Z1 = 290;
const WIN = { x0: -160, x1: 160, y0: -36, y1: 170 };

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------- materiais ----------
function woodMat({ a = [0.26, 0.13, 0.06], b = [0.11, 0.05, 0.02], ringF = 0.55, axis = 0, rough = 0.5, seed = 1, scale = 1, coat = 0 } = {}) {
  const m = coat ? new THREE.MeshPhysicalMaterial({ roughness: rough, clearcoat: coat, clearcoatRoughness: 0.3 }) : new THREE.MeshStandardMaterial({ roughness: rough });
  const u = {
    uA: { value: new THREE.Vector3(...a) }, uB: { value: new THREE.Vector3(...b) }, uRingF: { value: ringF },
    uAxis: { value: axis }, uSeed: { value: new THREE.Vector3(seed * 13.1, seed * 7.7, seed * 3.3) }, uScale: { value: scale }, uBump: { value: 0.012 },
  };
  m.customProgramCacheKey = () => 'tb-wood-obj-' + (coat ? 'c' : 's');
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vObjPos; uniform vec3 uA; uniform vec3 uB; uniform float uRingF; uniform float uAxis; uniform vec3 uSeed; uniform float uScale; uniform float uBump;
${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec3 op = vObjPos * uScale;
op = uAxis < 0.5 ? op : (uAxis < 1.5 ? op.yxz : op.zyx);
float wH, wR;
vec3 wc = tbWood(op * vec3(0.35, 1.0, 1.0), uSeed, vec2(9.0, -6.0), uRingF, uA, uB, wH, wR);
diffuseColor.rgb *= wc;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (wR - 0.6) * 0.5, 0.2, 1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + BUMP);
  };
  return m;
}

function floorMat() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.36, envMapIntensity: 0.9 });
  m.customProgramCacheKey = () => 'tb-floor';
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
float rowW = 19.0, bl = 150.0;
float row = floor((vWPos.z + 1000.0) / rowW), fz = fract((vWPos.z + 1000.0) / rowW);
float off = tbHash(vec3(row, 3.1, 1.7)) * bl;
float bx = (vWPos.x + 1000.0 + off) / bl, board = floor(bx), fx = fract(bx);
vec3 bs = vec3(row * 3.7, board * 5.3, row + board);
vec3 lp = vec3(fx * bl, (fz - 0.5) * rowW, 0.0);
float warp = tbFbm(vec3(lp.x * 0.012, lp.y * 0.09, bs.x + bs.y)) * 6.0;
float ring = fract((lp.y + warp + tbHash(bs) * 40.0) * 0.38);
float late = smoothstep(0.5, 0.9, ring) * (1.0 - smoothstep(0.9, 1.0, ring));
float fib = tbNoise(vec3(lp.x * 0.07, lp.y * 2.6, bs.y));
float fine = tbNoise(vec3(lp.x * 0.35, lp.y * 11.0, bs.x));
float tint = 0.8 + 0.4 * tbHash(bs + 1.0);
vec3 wc = mix(vec3(0.30, 0.165, 0.075), vec3(0.14, 0.066, 0.028), clamp(late * 0.6 + fib * 0.3 + fine * 0.15, 0.0, 1.0)) * tint;
float seamZ = smoothstep(0.0, 0.012, fz) * smoothstep(1.0, 0.988, fz);
float seamX = smoothstep(0.0, 0.0015, fx) * smoothstep(1.0, 0.9985, fx);
float seam = seamZ * seamX;
wc *= mix(0.25, 1.0, seam);
float wH = late * 0.4 + fib * 0.3 + (1.0 - seam) * 1.5;
diffuseColor.rgb *= wc;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(0.28 + fine * 0.2 + (1.0 - seam) * 0.4 + (1.0 - tint) * 0.2, 0.2, 0.9);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + BUMP);
  };
  return m;
}

function plaster(color) {
  const tex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) { const v = 118 + Math.random() * 20; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; }
    g.putImageData(img, 0, 0);
  }, false);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(6, 3);
  return new THREE.MeshStandardMaterial({ color, roughness: 0.93, bumpMap: tex, bumpScale: 0.6 });
}

function fabric(color, sheen = 0x8ab8b8) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.88, sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(sheen) });
}

const BLACK_METAL = () => new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.45, metalness: 0.7 });
const BRASS = () => new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.3, metalness: 1 });

// ---------- texturas ----------
function cityTexture(r) {
  return canvasTex(2048, 1024, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#03050c'); sky.addColorStop(0.45, '#0a1024'); sky.addColorStop(0.7, '#1c1830'); sky.addColorStop(0.82, '#3a2630'); sky.addColorStop(1, '#4a2c22');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    // lua
    const mg = g.createRadialGradient(330, 170, 0, 330, 170, 120);
    mg.addColorStop(0, 'rgba(255,244,220,.95)'); mg.addColorStop(0.12, 'rgba(255,240,215,.85)'); mg.addColorStop(0.16, 'rgba(200,210,255,.18)'); mg.addColorStop(1, 'rgba(120,140,220,0)');
    g.fillStyle = mg; g.fillRect(150, 0, 360, 360);
    // estrelas
    for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.5})`; g.fillRect(r() * w, r() * h * 0.5, 1.5, 1.5); }
    // três camadas de prédios
    const layers = [
      { base: 0.62, hmin: 60, hmax: 220, col: '#0b0f1c', lit: 0.05, win: 5, gap: 4 },
      { base: 0.7, hmin: 110, hmax: 420, col: '#080b14', lit: 0.08, win: 7, gap: 5 },
      { base: 0.82, hmin: 180, hmax: 600, col: '#05070c', lit: 0.12, win: 10, gap: 7 },
    ];
    for (const L of layers) {
      let x = -20;
      while (x < w) {
        const bw = 50 + r() * (L.win * 18), bh = L.hmin + r() * (L.hmax - L.hmin);
        const top = h * L.base - bh * (0.5 + r() * 0.5);
        g.fillStyle = L.col; g.fillRect(x, top, bw, h - top);
        if (r() < 0.3) { g.fillRect(x + bw * 0.45, top - 30 - r() * 40, 3, 70); g.fillStyle = '#ff3a2a'; g.fillRect(x + bw * 0.45 - 2, top - 34 - r() * 30, 7, 7); }
        const ww = L.win, gp = L.gap;
        for (let yy = top + 8; yy < h - 4; yy += ww + gp) {
          for (let xx = x + 5; xx < x + bw - ww; xx += ww + gp) {
            if (r() < L.lit) {
              const warm = r() < 0.85;
              const a = 0.45 + r() * 0.55;
              g.fillStyle = warm ? `rgba(255,${190 + (r() * 50) | 0},${110 + (r() * 60) | 0},${a})` : `rgba(170,200,255,${a})`;
              g.fillRect(xx, yy, ww, ww * 1.3);
            }
          }
        }
        x += bw + 2 + r() * 12;
      }
    }
    // névoa de luz da cidade perto do horizonte
    const haze = g.createLinearGradient(0, h * 0.55, 0, h);
    haze.addColorStop(0, 'rgba(255,140,80,0)'); haze.addColorStop(1, 'rgba(255,140,80,.18)');
    g.fillStyle = haze; g.fillRect(0, h * 0.55, w, h * 0.45);
  });
}

function rugTexture(r) {
  return canvasTex(1024, 1024, (g, w, h) => {
    const c = w / 2;
    g.fillStyle = '#d8c8ad'; g.fillRect(0, 0, w, h);
    const ring = (rad, wid, col) => { g.beginPath(); g.arc(c, c, rad, 0, Math.PI * 2); g.lineWidth = wid; g.strokeStyle = col; g.stroke(); };
    ring(500, 24, '#3b2a22'); ring(470, 10, '#a8553a'); ring(380, 6, '#3b2a22'); ring(250, 40, '#a8553a'); ring(120, 8, '#3b2a22');
    // losangos em volta
    for (let k = 0; k < 36; k++) {
      const a = k / 36 * Math.PI * 2, rr = 425;
      g.save(); g.translate(c + Math.cos(a) * rr, c + Math.sin(a) * rr); g.rotate(a);
      g.beginPath(); g.moveTo(0, -22); g.lineTo(14, 0); g.lineTo(0, 22); g.lineTo(-14, 0); g.closePath();
      g.fillStyle = k % 2 ? '#a8553a' : '#3b2a22'; g.fill(); g.restore();
    }
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2;
      g.save(); g.translate(c + Math.cos(a) * 315, c + Math.sin(a) * 315); g.rotate(a);
      g.fillStyle = '#6d7a62'; g.fillRect(-8, -30, 16, 60); g.restore();
    }
    // fibras
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 34; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 9000; i++) {
      const x = r() * w, y = r() * h, a = r() * Math.PI;
      g.strokeStyle = r() < 0.5 ? 'rgba(255,245,225,.10)' : 'rgba(40,25,15,.10)';
      g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); g.stroke();
    }
  });
}

function artTexture(r, palette, kind) {
  return canvasTex(512, 640, (g, w, h) => {
    g.fillStyle = palette[0]; g.fillRect(0, 0, w, h);
    if (kind === 0) {
      g.fillStyle = palette[1]; g.beginPath(); g.arc(w * 0.38, h * 0.42, w * 0.3, 0, Math.PI * 2); g.fill();
      g.fillStyle = palette[2]; g.fillRect(w * 0.5, h * 0.48, w * 0.42, h * 0.4);
      g.strokeStyle = palette[3]; g.lineWidth = 14; g.beginPath(); g.arc(w * 0.62, h * 0.5, w * 0.24, Math.PI, Math.PI * 1.9); g.stroke();
    } else if (kind === 1) {
      for (let i = 0; i < 6; i++) { g.fillStyle = palette[1 + (i % 3)]; g.beginPath(); g.ellipse(w * (0.2 + r() * 0.6), h * (0.2 + r() * 0.6), 30 + r() * 120, 20 + r() * 80, r() * 3, 0, Math.PI * 2); g.fill(); }
    } else {
      g.fillStyle = palette[1]; g.fillRect(0, h * 0.62, w, h * 0.38);
      g.fillStyle = palette[2]; g.beginPath(); g.moveTo(0, h * 0.62); g.lineTo(w * 0.35, h * 0.3); g.lineTo(w * 0.7, h * 0.62); g.fill();
      g.fillStyle = palette[3]; g.beginPath(); g.arc(w * 0.72, h * 0.25, 46, 0, Math.PI * 2); g.fill();
    }
    // textura de tela/pincel
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const x = (i / 4) % w, y = (i / 4 / w) | 0; const n = ((x % 3 === 0) || (y % 3 === 0) ? -6 : 0) + (r() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
  });
}

function blobTexture() {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.5, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }, false);
}

// ---------- montagem ----------
export function buildApartment(scene, opts = {}) {
  const r = rng(4242);
  const root = new THREE.Group(); root.name = 'apartamento';
  scene.add(root);
  const add = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); root.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, rad = 0) => add(new THREE.Mesh(rad ? new RoundedBoxGeometry(w, h, d, 3, rad) : new THREE.BoxGeometry(w, h, d), mat), x, y, z);
  const blobTex = blobTexture();
  const blob = (x, z, sx, sz, op = 0.6) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, color: 0x000000, transparent: true, opacity: op, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.scale.set(sx, sz, 1); m.renderOrder = 1;
    return add(m, x, FLOOR + 0.6, z);
  };

  // piso, teto e paredes
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), floorMat());
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  add(floor, (X0 + X1) / 2, FLOOR, (Z0 + Z1) / 2);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2;
  add(ceil, (X0 + X1) / 2, CEIL, (Z0 + Z1) / 2);

  const warmWall = plaster(0x6a5c50), greenWall = plaster(0x2d3a31);
  const H = CEIL - FLOOR;
  // parede da janela (com o vão)
  const shape = new THREE.Shape();
  shape.moveTo(X0, FLOOR); shape.lineTo(X1, FLOOR); shape.lineTo(X1, CEIL); shape.lineTo(X0, CEIL); shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(WIN.x0, WIN.y0); hole.lineTo(WIN.x0, WIN.y1); hole.lineTo(WIN.x1, WIN.y1); hole.lineTo(WIN.x1, WIN.y0); hole.closePath();
  shape.holes.push(hole);
  add(new THREE.Mesh(new THREE.ShapeGeometry(shape), warmWall), 0, 0, Z0);
  const wallR = add(new THREE.Mesh(new THREE.PlaneGeometry(Z1 - Z0, H), warmWall), X1, (FLOOR + CEIL) / 2, (Z0 + Z1) / 2); wallR.rotation.y = -Math.PI / 2;
  const wallL = add(new THREE.Mesh(new THREE.PlaneGeometry(Z1 - Z0, H), greenWall), X0, (FLOOR + CEIL) / 2, (Z0 + Z1) / 2); wallL.rotation.y = Math.PI / 2;
  const wallB = add(new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, H), warmWall), (X0 + X1) / 2, (FLOOR + CEIL) / 2, Z1); wallB.rotation.y = Math.PI;
  // rodapé
  const skirt = new THREE.MeshStandardMaterial({ color: 0x1d1813, roughness: 0.6 });
  box(X1 - X0, 9, 1.5, skirt, (X0 + X1) / 2, FLOOR + 4.5, Z0 + 0.8);
  box(X1 - X0, 9, 1.5, skirt, (X0 + X1) / 2, FLOOR + 4.5, Z1 - 0.8);
  box(1.5, 9, Z1 - Z0, skirt, X0 + 0.8, FLOOR + 4.5, (Z0 + Z1) / 2);
  box(1.5, 9, Z1 - Z0, skirt, X1 - 0.8, FLOOR + 4.5, (Z0 + Z1) / 2);

  // ---- janela: vão, esquadria preta, vidro e a cidade lá fora
  const reveal = new THREE.MeshStandardMaterial({ color: 0x5c4f44, roughness: 0.95 });
  const D = 24, wcx = (WIN.x0 + WIN.x1) / 2, ww = WIN.x1 - WIN.x0, wh = WIN.y1 - WIN.y0, wcy = (WIN.y0 + WIN.y1) / 2;
  box(ww, 2, D, reveal, wcx, WIN.y1 + 1, Z0 - D / 2);
  box(2, wh, D, reveal, WIN.x0 - 1, wcy, Z0 - D / 2);
  box(2, wh, D, reveal, WIN.x1 + 1, wcy, Z0 - D / 2);
  box(ww + 16, 4, D + 8, woodMat({ axis: 0, a: [0.24, 0.12, 0.05], b: [0.1, 0.045, 0.02], seed: 3 }), wcx, WIN.y0 - 2, Z0 - D / 2 + 4);
  const metal = BLACK_METAL(), fz = Z0 - D + 4;
  box(ww, 4, 5, metal, wcx, WIN.y1 - 2, fz); box(ww, 4, 5, metal, wcx, WIN.y0 + 2, fz); box(ww, 3, 4, metal, wcx, WIN.y0 + wh * 0.68, fz);
  for (let k = 0; k <= 5; k++) box(k === 0 || k === 5 ? 4 : 2.6, wh, 4, metal, WIN.x0 + (ww * k) / 5 + (k === 0 ? 2 : k === 5 ? -2 : 0), wcy, fz);
  for (let k = 0; k < 5; k++) box(ww / 5, 2, 3, metal, WIN.x0 + ww * (k + 0.5) / 5, WIN.y0 + wh * 0.34, fz);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshPhysicalMaterial({ color: 0x0b1018, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0, envMapIntensity: 1.4, depthWrite: false }));
  glass.layers.set(3);   // fora do mapa de profundidade (a cidade atrás decide o desfoque)
  add(glass, wcx, wcy, fz - 1);
  const city = new THREE.Mesh(new THREE.PlaneGeometry(2600, 1300), new THREE.MeshBasicMaterial({ map: cityTexture(r), fog: false }));
  city.material.color.setScalar(1.25);
  add(city, 0, 140, Z0 - 760);

  // cortinas de linho e o trilho
  const linen = new THREE.MeshPhysicalMaterial({ color: 0xa8957c, roughness: 0.92, sheen: 0.8, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xfff0dc), side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(78, H - 6, 72, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 0.72) * 3.6 + Math.sin(x * 0.21 + side) * 2.2); }
    geo.computeVertexNormals();
    add(new THREE.Mesh(geo, linen), side * (WIN.x1 + 48), FLOOR + (H - 6) / 2 + 1, Z0 + 10);
  }
  const rod = add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, ww + 220, 12), metal), wcx, CEIL - 6, Z0 + 10); rod.rotation.z = Math.PI / 2;

  // varal de luzinhas atravessando a janela
  const pts = [];
  for (let k = 0; k <= 60; k++) { const t = k / 60, x = -190 + t * 380; pts.push(new THREE.Vector3(x, CEIL - 14 - Math.sin(t * Math.PI) * 24, Z0 + 16 + Math.sin(t * 9) * 1.5)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  add(new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.18, 5), new THREE.MeshBasicMaterial({ color: 0x15110c })));
  const nb = 34, bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(1.1, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.72, 0.38).multiplyScalar(7) }), nb);
  const mtx = new THREE.Matrix4();
  for (let k = 0; k < nb; k++) { const p = curve.getPoint((k + 0.5) / nb); mtx.makeTranslation(p.x, p.y - 2.2, p.z); bulbs.setMatrixAt(k, mtx); }
  root.add(bulbs);

  // ---- tapete redondo e o pé da mesa
  const rug = new THREE.Mesh(new THREE.CircleGeometry(150, 96), new THREE.MeshStandardMaterial({ map: rugTexture(r), roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.receiveShadow = true;
  add(rug, 0, FLOOR + 0.4, 0);
  const darkWal = woodMat({ axis: 1, a: [0.12, 0.055, 0.025], b: [0.05, 0.02, 0.01], seed: 5, rough: 0.4, coat: 0.5 });
  add(new THREE.Mesh(new THREE.CylinderGeometry(6.5, 8, 66, 32), darkWal), 0, -38, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(26, 30, 5, 48), darkWal), 0, FLOOR + 2.5, 0);
  blob(0, 0, 230, 230, 0.75);

  // cadeiras em volta
  const chairWood = woodMat({ axis: 1, a: [0.2, 0.1, 0.045], b: [0.08, 0.035, 0.015], seed: 9, rough: 0.45 });
  const seatFab = fabric(0x3b2a20, 0x8a6a50);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2 + 0.12, R = 98;
    const ch = new THREE.Group();
    const leg = new THREE.CylinderGeometry(1.4, 1.1, 46, 10);
    for (const [lx, lz] of [[-18, -18], [18, -18], [-18, 18], [18, 18]]) { const l = new THREE.Mesh(leg, chairWood); l.position.set(lx, FLOOR + 23, lz); ch.add(l); }
    const seat = new THREE.Mesh(new RoundedBoxGeometry(44, 4, 44, 3, 1.5), chairWood); seat.position.set(0, FLOOR + 47, 0); ch.add(seat);
    const pad = new THREE.Mesh(new RoundedBoxGeometry(40, 3, 40, 3, 1.4), seatFab); pad.position.set(0, FLOOR + 50, 1); ch.add(pad);
    for (const px of [-19, 19]) { const p = new THREE.Mesh(new THREE.BoxGeometry(3, 46, 3), chairWood); p.position.set(px, FLOOR + 72, -20); ch.add(p); }
    const back = new THREE.Mesh(new RoundedBoxGeometry(42, 12, 3, 3, 1), chairWood); back.position.set(0, FLOOR + 88, -21); ch.add(back);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(38, 3, 2), chairWood); rail.position.set(0, FLOOR + 72, -20.5); ch.add(rail);
    ch.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
    ch.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
    root.add(ch);
    blob(ch.position.x, ch.position.z, 70, 70, 0.45);
  }

  // ---- sofá encostado na parede do fundo
  const velvet = fabric(0x1c4343, 0x6fb0aa);
  const sx = 40, sz = Z1 - 50;
  box(224, 24, 88, velvet, sx, FLOOR + 9 + 12, sz, 4);
  for (let k = -1; k <= 1; k++) box(70, 14, 64, velvet, sx + k * 72, FLOOR + 9 + 24 + 6, sz - 10, 5);
  box(224, 44, 22, velvet, sx, FLOOR + 9 + 24 + 22, sz + 34, 6);
  for (let k = -1; k <= 1; k++) { const c = box(70, 36, 16, velvet, sx + k * 72, FLOOR + 9 + 24 + 30, sz + 18, 6); c.rotation.x = -0.14; }
  for (const s of [-1, 1]) box(20, 40, 88, velvet, sx + s * 112, FLOOR + 9 + 20, sz, 6);
  const brass = BRASS();
  for (const [lx, lz] of [[-105, -38], [105, -38], [-105, 38], [105, 38]]) add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.1, 9, 10), brass), sx + lx, FLOOR + 4.5, sz + lz);
  const p1 = box(42, 40, 12, fabric(0xb88a35, 0xffe0a0), sx - 70, FLOOR + 62, sz + 4, 5); p1.rotation.set(-0.25, 0.25, 0.12);
  const p2 = box(40, 38, 12, fabric(0x8f3f25, 0xffb090), sx + 72, FLOOR + 61, sz + 4, 5); p2.rotation.set(-0.25, -0.3, -0.1);
  blob(sx, sz, 290, 140, 0.6);
  // quadro grande acima do sofá
  const frame = (w, h, tex, x, y, z, ry) => {
    const g = new THREE.Group();
    const f = new THREE.Mesh(new THREE.BoxGeometry(w + 6, h + 6, 3), new THREE.MeshStandardMaterial({ color: 0x0f0d0b, roughness: 0.5 }));
    const c = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    c.position.z = 1.6; g.add(f, c); g.position.set(x, y, z); g.rotation.y = ry; root.add(g); return g;
  };
  frame(130, 88, artTexture(r, ['#e9dfcc', '#c2643c', '#24413a', '#d9a441'], 0), sx, 74, Z1 - 2, Math.PI);

  // ---- luminária de piso (tripé) no canto do sofá
  const lx = 215, lz = Z1 - 60;
  const legW = woodMat({ axis: 1, a: [0.3, 0.17, 0.08], b: [0.14, 0.07, 0.03], seed: 11 });
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2, bx = lx + Math.cos(a) * 26, bz = lz + Math.sin(a) * 26;
    const top = new THREE.Vector3(lx, FLOOR + 132, lz), bot = new THREE.Vector3(bx, FLOOR, bz);
    const len = top.distanceTo(bot);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, len, 10), legW);
    l.position.copy(top).add(bot).multiplyScalar(0.5); l.lookAt(top); l.rotateX(Math.PI / 2); root.add(l);
  }
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0xe8d8bc, roughness: 0.9, emissive: new THREE.Color(0xffb46a), emissiveIntensity: 1.1, side: THREE.DoubleSide });
  add(new THREE.Mesh(new THREE.CylinderGeometry(19, 24, 32, 48, 1, true), shadeMat), lx, FLOOR + 150, lz);
  add(new THREE.Mesh(new THREE.SphereGeometry(4, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.55).multiplyScalar(5) })), lx, FLOOR + 146, lz);
  const floorLamp = new THREE.PointLight(0xffa760, 26000, 0, 2);
  add(floorLamp, lx, FLOOR + 146, lz);
  blob(lx, lz, 80, 80, 0.4);

  // ---- estante de livros na parede da direita
  const shelfW = woodMat({ axis: 2, a: [0.16, 0.075, 0.035], b: [0.07, 0.03, 0.012], seed: 13, rough: 0.5 });
  const bx0 = X1 - 34, bz0 = -160, bz1 = 40, bh = 214, bxc = X1 - 17;
  box(34, bh, 3, shelfW, bxc, FLOOR + bh / 2, bz0); box(34, bh, 3, shelfW, bxc, FLOOR + bh / 2, bz1);
  box(2, bh, bz1 - bz0, new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.8 }), X1 - 1.5, FLOOR + bh / 2, (bz0 + bz1) / 2);
  const levels = [];
  for (let k = 0; k < 6; k++) { const y = FLOOR + 6 + k * 41.5; box(34, 3, bz1 - bz0, shelfW, bxc, y, (bz0 + bz1) / 2); levels.push(y + 1.5); }
  const palette = [0x7a2e22, 0x2b4a5e, 0xc9a35a, 0x1f3b2f, 0xd8cdb8, 0x5a2a3e, 0x8a5a2b, 0x2a2a2e, 0xa84a2a, 0x4d6b5a, 0xe2d6c0, 0x3c5a7a];
  const books = [];
  for (let k = 0; k < 5; k++) {
    let z = bz0 + 3;
    while (z < bz1 - 8) {
      if (r() < 0.08) { z += 8 + r() * 14; continue; }
      if (r() < 0.06) { // pilha deitada
        const n = 3 + ((r() * 3) | 0);
        for (let j = 0; j < n; j++) books.push({ w: 22 + r() * 6, h: 2.5 + r() * 2, d: 15 + r() * 4, x: bx0 + 17, y: levels[k] + j * 3.6 + 1.6, z: z + 12, rz: 0, ry: (r() - 0.5) * 0.2, c: palette[(r() * palette.length) | 0] });
        z += 28; continue;
      }
      const t = 2 + r() * 3.5, hh = 20 + r() * 12, dd = 14 + r() * 8;
      const lean = r() < 0.05 ? 0.25 : 0;
      books.push({ w: dd, h: hh, d: t, x: X1 - 2 - dd / 2 - 1, y: levels[k] + hh / 2, z: z + t / 2, rz: 0, rx: lean, c: palette[(r() * palette.length) | 0] });
      z += t + 0.3 + (lean ? 4 : 0);
    }
  }
  const bookMesh = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 1, 0.08), new THREE.MeshStandardMaterial({ roughness: 0.75 }), books.length);
  const q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), col = new THREE.Color();
  books.forEach((b, i) => {
    e.set(b.rx || 0, b.ry || 0, b.rz || 0); q.setFromEuler(e); sc.set(b.w, b.h, b.d); ps.set(b.x, b.y, b.z);
    mtx.compose(ps, q, sc); bookMesh.setMatrixAt(i, mtx);
    col.setHex(b.c).multiplyScalar(0.75 + r() * 0.4); bookMesh.setColorAt(i, col);
  });
  root.add(bookMesh);
  // objetos na estante
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xd9d2c4, roughness: 0.35 });
  add(new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), ceramic), bxc, levels[1] + 7, bz1 - 16);
  add(new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 18, 20), new THREE.MeshStandardMaterial({ color: 0x2f4a45, roughness: 0.25 })), bxc, levels[3] + 9, bz0 + 14);
  blob(bxc - 4, (bz0 + bz1) / 2, 60, 220, 0.5);

  // ---- aparador com toca-discos e abajur na parede verde
  const sbW = woodMat({ axis: 2, a: [0.2, 0.095, 0.04], b: [0.08, 0.035, 0.015], seed: 17, rough: 0.42, coat: 0.3 });
  const sbx = X0 + 24, sbz0 = -110, sbz1 = 110;
  box(46, 56, sbz1 - sbz0, sbW, sbx, FLOOR + 14 + 28, 0, 0.8);
  const slat = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 50, 2.2), sbW, 70);
  for (let k = 0; k < 70; k++) { mtx.makeTranslation(sbx + 23.6, FLOOR + 14 + 28, sbz0 + 4 + k * ((sbz1 - sbz0 - 8) / 69)); slat.setMatrixAt(k, mtx); }
  root.add(slat);
  for (const [dx, dz] of [[-18, -100], [18, -100], [-18, 100], [18, 100]]) add(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1, 14, 10), brass), sbx + dx, FLOOR + 7, dz);
  const sbTop = FLOOR + 70;
  // abajur
  add(new THREE.Mesh(new THREE.SphereGeometry(11, 32, 20), new THREE.MeshStandardMaterial({ color: 0x8c4a2c, roughness: 0.3 })), sbx, sbTop + 11, -72);
  const tShade = new THREE.MeshStandardMaterial({ color: 0xeadcc4, roughness: 0.9, emissive: new THREE.Color(0xffb062), emissiveIntensity: 1.0, side: THREE.DoubleSide });
  add(new THREE.Mesh(new THREE.CylinderGeometry(10, 17, 20, 40, 1, true), tShade), sbx, sbTop + 34, -72);
  const tableLamp = new THREE.PointLight(0xffa155, 9000, 0, 2);
  add(tableLamp, sbx, sbTop + 30, -72);
  // toca-discos
  box(36, 9, 32, woodMat({ axis: 0, a: [0.32, 0.18, 0.08], b: [0.16, 0.08, 0.03], seed: 19 }), sbx, sbTop + 4.5, 30, 1);
  add(new THREE.Mesh(new THREE.CylinderGeometry(14.5, 14.5, 0.8, 48), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.25, metalness: 0.2 })), sbx - 1, sbTop + 9.6, 28);
  add(new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.9, 32), new THREE.MeshStandardMaterial({ color: 0xc23b2a, roughness: 0.6 })), sbx - 1, sbTop + 9.8, 28);
  const arm = box(1, 1, 18, brass, sbx + 12, sbTop + 11, 34); arm.rotation.y = 0.5;
  // pilha de discos e livros
  for (let j = 0; j < 4; j++) box(32, 1.2, 32, new THREE.MeshStandardMaterial({ color: [0x1c1c1c, 0xb33a2a, 0x2a4a6a, 0xd9c08a][j], roughness: 0.7 }), sbx - 2, sbTop + 0.6 + j * 1.3, 82 + (r() - 0.5) * 3);
  blob(sbx, 0, 70, 260, 0.55);
  frame(58, 78, artTexture(r, ['#20262a', '#c98a4a', '#e6d8bd', '#7a3a2a'], 2), X0 + 2, 70, -40, Math.PI / 2);
  frame(58, 78, artTexture(r, ['#efe6d4', '#3b5a4a', '#c46a3a', '#1f2a3a'], 1), X0 + 2, 70, 40, Math.PI / 2);

  // ---- plantas
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0); leafShape.bezierCurveTo(6, 4, 7, 14, 0, 22); leafShape.bezierCurveTo(-7, 14, -6, 4, 0, 0);
  const leafGeo = new THREE.ShapeGeometry(leafShape, 8);
  { const p = leafGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, -0.02 * x * x - 0.006 * (y - 11) * (y - 11)); } leafGeo.computeVertexNormals(); }
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide });
  const plant = (px, pz, potCol, trunkH, nLeaves, spread, leafScale) => {
    add(new THREE.Mesh(new THREE.CylinderGeometry(20, 15, 38, 32), new THREE.MeshStandardMaterial({ color: potCol, roughness: 0.8 })), px, FLOOR + 19, pz);
    add(new THREE.Mesh(new THREE.CylinderGeometry(18.5, 18.5, 1, 24), new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 1 })), px, FLOOR + 36, pz);
    const trunk = add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2, trunkH, 8), new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 })), px, FLOOR + 36 + trunkH / 2, pz);
    trunk.rotation.z = 0.05;
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, nLeaves);
    for (let i = 0; i < nLeaves; i++) {
      const t = i / nLeaves, h = FLOOR + 36 + trunkH * (0.25 + 0.75 * Math.sqrt(t)) + (r() - 0.5) * 8;
      const a = i * 2.4 + r() * 0.5, rr = spread * (0.3 + r() * 0.7) * (1 - t * 0.4);
      ps.set(px + Math.cos(a) * rr, h, pz + Math.sin(a) * rr);
      e.set(-0.6 - r() * 0.8, -a + Math.PI / 2, (r() - 0.5) * 0.6, 'YXZ'); q.setFromEuler(e);
      const s = leafScale * (0.7 + r() * 0.5); sc.set(s, s, s);
      mtx.compose(ps, q, sc); leaves.setMatrixAt(i, mtx);
      col.setRGB(0.06 + r() * 0.05, 0.16 + r() * 0.1, 0.06 + r() * 0.04); leaves.setColorAt(i, col);
    }
    root.add(leaves);
    blob(px, pz, 70, 70, 0.55);
  };
  plant(245, -200, 0xb86a45, 150, 70, 26, 1.2);
  plant(-240, -195, 0xd9d3c7, 70, 46, 34, 1.5);
  plant(-250, 230, 0x3a3f3a, 110, 55, 28, 1.25);

  // luz fria da janela e as lâmpadas do apartamento
  const moon = new THREE.DirectionalLight(0x8aa2d6, 0.32);
  moon.position.set(-60, 120, Z0 - 300);
  root.add(moon);

  return { root, lights: { floorLamp, tableLamp, moon } };
}
