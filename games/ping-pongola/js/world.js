// O ginásio: renderizador, luz, mesa, plateia, placar e câmera.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TABLE, HALF_L, HALF_W, BALL_R } from './physics.js';
import { QUALITY } from './settings.js';
import * as TX from './textures.js';

const GYM = { X: 15, Z: 12.5, H: 9.5 };
const ARENA = { X: 4.7, Z: 6.4 };

export class World {
  constructor(canvas, settings) {
    this.settings = settings;
    this.q = QUALITY[settings.quality] || QUALITY.high;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.q.antialias, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e9f6fc');
    this.scene.fog = new THREE.Fog('#eaf5fa', 22, 48);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.05, 90);
    this.camera.position.set(0, 2, 5);
    this.camTarget = { pos: new THREE.Vector3(0, 2, 5), look: new THREE.Vector3(0, 0.9, 0), rate: 3 };
    this.camLook = new THREE.Vector3(0, 0.9, 0);
    this.shake = 0;
    this.time = 0;

    this._lights();
    this._gym();
    this._arena();
    this._table();
    this._ball();
    this._crowd();
    this.applySettings(settings, true);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ---------------- luz ----------------
  _lights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight('#e4f6ff', '#d9ab6e', 1.25);
    s.add(this.hemi);
    const sun = new THREE.DirectionalLight('#fff3dd', 2.3);
    sun.position.set(5, 11, 5);
    sun.target.position.set(0, 0, 0);
    sun.shadow.camera.left = -6; sun.shadow.camera.right = 6;
    sun.shadow.camera.top = 6; sun.shadow.camera.bottom = -6;
    sun.shadow.camera.near = 2; sun.shadow.camera.far = 30;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    s.add(sun, sun.target);
    this.sun = sun;
    const fill = new THREE.DirectionalLight('#cfe9ff', 0.6);
    fill.position.set(-6, 6, -4);
    s.add(fill);
  }

  // ---------------- ginásio ----------------
  _gym() {
    const s = this.scene;
    // Piso de madeira
    const floorTex = TX.woodFloor();
    floorTex.repeat.set(GYM.X * 2 / 4, GYM.Z * 2 / 4);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(GYM.X * 2, GYM.Z * 2),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.42, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);

    // Linhas pintadas da quadra
    const lineMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 });
    const addLine = (w, d, x, z, c) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat(c));
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.004, z); s.add(m);
    };
    const cw = 26, cd = 21;
    addLine(cw, 0.07, 0, -cd / 2, '#ffffff'); addLine(cw, 0.07, 0, cd / 2, '#ffffff');
    addLine(0.07, cd, -cw / 2, 0, '#ffffff'); addLine(0.07, cd, cw / 2, 0, '#ffffff');
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.75, 1.83, 64), lineMat('#ff8c42'));
    ring.rotation.x = -Math.PI / 2; ring.position.set(-10.5, 0.004, 0); s.add(ring);
    const ring2 = ring.clone(); ring2.position.x = 10.5; s.add(ring2);

    // Paredes: faixa acolchoada embaixo, parede clara em cima
    const wallMat = new THREE.MeshStandardMaterial({ color: '#f6f1e6', roughness: 0.9 });
    const padA = new THREE.MeshStandardMaterial({ color: '#168fd2', roughness: 0.7 });
    const padB = new THREE.MeshStandardMaterial({ color: '#43bff5', roughness: 0.7 });
    const walls = [
      { w: GYM.X * 2, pos: [0, GYM.H / 2, -GYM.Z], rot: 0 },
      { w: GYM.X * 2, pos: [0, GYM.H / 2, GYM.Z], rot: Math.PI },
      { w: GYM.Z * 2, pos: [-GYM.X, GYM.H / 2, 0], rot: Math.PI / 2 },
      { w: GYM.Z * 2, pos: [GYM.X, GYM.H / 2, 0], rot: -Math.PI / 2 },
    ];
    const padGeo = new THREE.BoxGeometry(1.96, 2.1, 0.22);
    for (const w of walls) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w.w, GYM.H), wallMat);
      m.position.set(...w.pos); m.rotation.y = w.rot;
      s.add(m);
      const n = Math.floor(w.w / 2);
      const dir = new THREE.Vector3(Math.sin(w.rot), 0, Math.cos(w.rot));
      const side = new THREE.Vector3(Math.cos(w.rot), 0, -Math.sin(w.rot));
      for (let i = 0; i < n; i++) {
        const p = new THREE.Mesh(padGeo, i % 2 ? padA : padB);
        const off = -w.w / 2 + 1 + i * 2;
        p.position.set(w.pos[0] + side.x * off + dir.x * 0.11, 1.05, w.pos[2] + side.z * off + dir.z * 0.11);
        p.rotation.y = w.rot;
        s.add(p);
      }
    }

    // Janelas com céu (motivo "céu azul" entrando no ginásio)
    const skyTex = TX.sky();
    const winMat = new THREE.MeshBasicMaterial({ map: skyTex, toneMapped: false });
    const frameMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
    const winGeo = new THREE.PlaneGeometry(3.2, 2.4);
    const frameGeo = new THREE.BoxGeometry(3.45, 2.65, 0.12);
    const barGeo = new THREE.BoxGeometry(0.08, 2.4, 0.14);
    const addWindow = (x, y, z, rot) => {
      const g = new THREE.Group();
      const f = new THREE.Mesh(frameGeo, frameMat); f.position.z = -0.04;
      const w = new THREE.Mesh(winGeo, winMat); w.position.z = 0.025;
      const b = new THREE.Mesh(barGeo, frameMat); b.position.z = 0.03;
      g.add(f, w, b);
      g.position.set(x, y, z); g.rotation.y = rot;
      s.add(g);
    };
    for (let i = -2; i <= 2; i++) {
      addWindow(-GYM.X + 0.06, 6.4, i * 4.6, Math.PI / 2);
      addWindow(GYM.X - 0.06, 6.4, i * 4.6, -Math.PI / 2);
    }
    for (let i = -3; i <= 3; i++) addWindow(i * 4.2, 6.6, GYM.Z - 0.06, Math.PI);
    for (const x of [-11.5, 11.5]) addWindow(x, 6.6, -GYM.Z + 0.06, 0);

    // Teto, treliças e luminárias
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(GYM.X * 2, GYM.Z * 2), new THREE.MeshStandardMaterial({ color: '#f3efe6', roughness: 1 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = GYM.H; s.add(ceil);
    const trussMat = new THREE.MeshStandardMaterial({ color: '#d6dde3', roughness: 0.5, metalness: 0.3 });
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fffbe8').multiplyScalar(5) });
    const lampShell = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 });
    for (let z = -10; z <= 10; z += 4) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(GYM.X * 2, 0.35, 0.18), trussMat);
      t.position.set(0, GYM.H - 0.6, z); s.add(t);
      for (let x = -10; x <= 10; x += 5) {
        const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.35, 24, 1, true), lampShell);
        shell.position.set(x, GYM.H - 1.0, z);
        const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), lampMat);
        bulb.rotation.x = Math.PI / 2; bulb.position.set(x, GYM.H - 1.16, z);
        s.add(shell, bulb);
      }
    }

    // Placar no fundo
    this.scoreTex = new TX.ScoreboardTexture();
    const board = new THREE.Group();
    const back = new THREE.Mesh(new THREE.BoxGeometry(6.9, 3.3, 0.3), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 }));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.8), new THREE.MeshBasicMaterial({ map: this.scoreTex.texture, toneMapped: false }));
    screen.position.z = 0.16;
    board.add(back, screen);
    board.position.set(0, 6.6, -GYM.Z + 0.25);
    s.add(board);

    // Faixas
    const banners = [
      { text: 'PING PONGOLA', bg: '#ff8c42', stripe: '#ffd65a', pos: [-6.6, 4.1, -GYM.Z + 0.05], rot: 0 },
      { text: 'VAMOS JOGAR!', bg: '#168fd2', stripe: '#43bff5', pos: [6.6, 4.1, -GYM.Z + 0.05], rot: 0 },
      { text: '★ TORNEIO KIDS ★', bg: '#4fb36b', stripe: '#ffd65a', pos: [-GYM.X + 0.05, 3.6, -4], rot: Math.PI / 2, font: 96 },
      { text: 'NÃO DESISTA!', bg: '#e8566c', stripe: '#ffd65a', pos: [GYM.X - 0.05, 3.6, -4], rot: -Math.PI / 2 },
      { text: 'SPIN! SPIN!', bg: '#7a5cff', stripe: '#43bff5', pos: [-GYM.X + 0.05, 3.6, 4], rot: Math.PI / 2 },
      { text: 'FAIR PLAY ♥', bg: '#ff8c42', stripe: '#ffffff', pos: [GYM.X - 0.05, 3.6, 4], rot: -Math.PI / 2 },
    ];
    for (const b of banners) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshStandardMaterial({ map: TX.banner(b.text, { bg: b.bg, stripe: b.stripe, font: b.font || 120 }), roughness: 0.8 }));
      m.position.set(...b.pos); m.rotation.y = b.rot; s.add(m);
    }

    // Bandeirinhas cruzando o teto
    const triGeo = new THREE.BufferGeometry();
    triGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.18, 0, 0, 0.18, 0, 0, 0, -0.42, 0], 3));
    triGeo.computeVertexNormals();
    const flagColors = ['#ff8c42', '#ffd65a', '#4fb36b', '#43bff5', '#e8566c', '#7a5cff'];
    const strings = [
      [new THREE.Vector3(-GYM.X, 7.4, -8), new THREE.Vector3(GYM.X, 7.4, -8)],
      [new THREE.Vector3(-GYM.X, 7.4, 8), new THREE.Vector3(GYM.X, 7.4, 8)],
      [new THREE.Vector3(-GYM.X, 7.8, 0), new THREE.Vector3(GYM.X, 7.8, 0)],
    ];
    const per = 40;
    const flags = new THREE.InstancedMesh(triGeo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), strings.length * per);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    let k = 0;
    for (const [a, b] of strings) {
      for (let i = 0; i < per; i++) {
        const t = (i + 0.5) / per;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * 1.4;
        m4.makeRotationY(Math.PI / 2 * (a.z === b.z ? 0 : 1)).setPosition(p);
        flags.setMatrixAt(k, m4);
        flags.setColorAt(k, col.set(flagColors[i % flagColors.length]));
        k++;
      }
    }
    s.add(flags);
  }

  // ---------------- área de jogo ----------------
  _arena() {
    const s = this.scene;
    // tapete verde arredondado
    const shape = new THREE.Shape();
    const w = ARENA.X - 0.3, d = ARENA.Z - 0.3, r = 0.9;
    shape.moveTo(-w + r, -d); shape.lineTo(w - r, -d); shape.quadraticCurveTo(w, -d, w, -d + r);
    shape.lineTo(w, d - r); shape.quadraticCurveTo(w, d, w - r, d); shape.lineTo(-w + r, d);
    shape.quadraticCurveTo(-w, d, -w, d - r); shape.lineTo(-w, -d + r); shape.quadraticCurveTo(-w, -d, -w + r, -d);
    const mat = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), new THREE.MeshStandardMaterial({ color: '#46b06a', roughness: 0.85 }));
    mat.rotation.x = -Math.PI / 2; mat.position.y = 0.006; mat.receiveShadow = true;
    s.add(mat);
    const edge = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    edge.rotation.x = -Math.PI / 2; edge.position.y = 0.005; edge.scale.set(1.012, 1.008, 1);
    s.add(edge);

    // grades baixas com propaganda fofa
    const texA = TX.barrier(0), texB = TX.barrier(1);
    const frontA = new THREE.MeshStandardMaterial({ map: texA, roughness: 0.5 });
    const frontB = new THREE.MeshStandardMaterial({ map: texB, roughness: 0.5 });
    const sideMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 });
    const geo = new THREE.BoxGeometry(1.9, 0.62, 0.08);
    const place = (x, z, rot, i) => {
      const front = i % 2 ? frontB : frontA;
      const m = new THREE.Mesh(geo, [sideMat, sideMat, sideMat, sideMat, front, front]);
      m.position.set(x, 0.33, z); m.rotation.y = rot; m.castShadow = true;
      s.add(m);
    };
    let i = 0;
    for (let x = -ARENA.X + 1; x < ARENA.X; x += 1.95) { place(x, -ARENA.Z, 0, i++); place(x, ARENA.Z, Math.PI, i++); }
    for (let z = -ARENA.Z + 1.2; z < ARENA.Z - 0.5; z += 1.95) { place(-ARENA.X, z, Math.PI / 2, i++); place(ARENA.X, z, -Math.PI / 2, i++); }

    // cesto de bolinhas e plantinhas (detalhes de cenário)
    const basket = new THREE.Group();
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.5, 20, 4, true), new THREE.MeshStandardMaterial({ color: '#ffffff', wireframe: true }));
    wire.position.y = 0.45;
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), new THREE.MeshStandardMaterial({ color: '#888' }));
    legs.position.y = 0.1;
    basket.add(wire, legs);
    const bGeo = new THREE.SphereGeometry(0.035, 10, 8), bMat = new THREE.MeshStandardMaterial({ color: '#ff9a3c', roughness: 0.4 });
    for (let j = 0; j < 60; j++) {
      const b = new THREE.Mesh(bGeo, bMat);
      const a = Math.random() * Math.PI * 2, rr = Math.random() * 0.2;
      b.position.set(Math.cos(a) * rr, 0.26 + Math.random() * 0.42, Math.sin(a) * rr);
      basket.add(b);
    }
    basket.position.set(-3.6, 0, -5.3);
    s.add(basket);

    const potMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#5cc24f', roughness: 0.7 });
    for (const [x, z] of [[-13.8, -11.3], [13.8, -11.3], [-13.8, 11.3], [13.8, 11.3]]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.7, 20), potMat);
      pot.position.set(x, 0.35, z);
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), leafMat);
      bush.position.set(x, 1.3, z); bush.scale.y = 1.2;
      s.add(pot, bush);
    }

    // banco com toalha
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.45), new THREE.MeshStandardMaterial({ color: '#e6c08a', roughness: 0.5 }));
    bench.position.set(4.0, 0.45, 2.4); bench.rotation.y = Math.PI / 2; bench.castShadow = true;
    const benchLegs = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.42, 0.06), new THREE.MeshStandardMaterial({ color: '#2b4a66' }));
    benchLegs.position.set(4.0, 0.21, 2.4); benchLegs.rotation.y = Math.PI / 2;
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.42), new THREE.MeshStandardMaterial({ color: '#ff8c42', roughness: 0.95 }));
    towel.position.set(4.0, 0.51, 2.0);
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 12), new THREE.MeshStandardMaterial({ color: '#43bff5', roughness: 0.15, transparent: true, opacity: 0.8 }));
    bottle.position.set(4.0, 0.61, 2.9);
    s.add(bench, benchLegs, towel, bottle);
    const bench2 = bench.clone(), legs2 = benchLegs.clone(), towel2 = towel.clone(); towel2.material = towel.material.clone(); towel2.material.color.set('#43bff5');
    for (const o of [bench2, legs2, towel2]) { o.position.x = -4.0; o.position.z *= -1; s.add(o); }
  }

  // ---------------- mesa ----------------
  _table() {
    const g = new THREE.Group();
    const topTex = TX.tableTop();
    const edgeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#1d5fbf', roughness: 0.45 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(TABLE.W, 0.03, TABLE.L), [edgeMat, edgeMat, bodyMat, bodyMat, edgeMat, edgeMat]);
    slab.position.y = TABLE.H - 0.015;
    slab.castShadow = true; slab.receiveShadow = true;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(TABLE.W, TABLE.L), new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.32, metalness: 0.0 }));
    top.rotation.x = -Math.PI / 2; top.position.y = TABLE.H + 0.0005; top.receiveShadow = true;
    g.add(slab, top);

    const frameMat = new THREE.MeshStandardMaterial({ color: '#253a52', roughness: 0.5, metalness: 0.2 });
    const apron = new THREE.Mesh(new THREE.BoxGeometry(TABLE.W - 0.2, 0.06, TABLE.L - 0.25), frameMat);
    apron.position.y = TABLE.H - 0.06; g.add(apron);
    const legGeo = new THREE.CylinderGeometry(0.035, 0.035, TABLE.H - 0.09, 14);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, frameMat);
      leg.position.set(sx * (HALF_W - 0.18), (TABLE.H - 0.09) / 2, sz * (HALF_L - 0.3));
      leg.castShadow = true; g.add(leg);
      const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshStandardMaterial({ color: '#ffd65a', roughness: 0.4 }));
      wheel.position.set(leg.position.x, 0.05, leg.position.z); g.add(wheel);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, TABLE.L - 0.6), frameMat);
    bar.position.set(0, 0.22, 0); g.add(bar);

    // rede
    const netW = TABLE.W + TABLE.NET_OVER * 2;
    const net = new THREE.Mesh(new THREE.PlaneGeometry(netW, TABLE.NET_H), new THREE.MeshStandardMaterial({ map: TX.netMesh(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9 }));
    net.position.set(0, TABLE.H + TABLE.NET_H / 2, 0);
    net.material.map.repeat.set(netW / 0.03, 1);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(netW, 0.022, 0.012), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }));
    tape.position.set(0, TABLE.H + TABLE.NET_H - 0.011, 0);
    tape.castShadow = true;
    g.add(net, tape);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, TABLE.NET_H + 0.02, 10), new THREE.MeshStandardMaterial({ color: '#d7dde3', metalness: 0.6, roughness: 0.3 }));
      post.position.set(sx * netW / 2, TABLE.H + TABLE.NET_H / 2, 0);
      const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.06), new THREE.MeshStandardMaterial({ color: '#ff8c42', roughness: 0.5 }));
      clamp.position.set(sx * (HALF_W + 0.02), TABLE.H - 0.01, 0);
      g.add(post, clamp);
    }
    this.scene.add(g);
    this.table = g;
  }

  // ---------------- bola ----------------
  _ball() {
    const r = BALL_R * 1.35;
    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(r, 24, 16),
      new THREE.MeshStandardMaterial({ color: '#ff7a14', roughness: 0.4, emissive: '#ff5a00', emissiveIntensity: 0.3 })
    );
    this.ballMesh.castShadow = true;
    this.scene.add(this.ballMesh);
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(10,30,60,0.55)'); grd.addColorStop(1, 'rgba(10,30,60,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    this.ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.ballShadow);
  }

  setBall(p, visible = true) {
    this.ballMesh.visible = visible;
    this.ballShadow.visible = visible;
    if (!visible) return;
    this.ballMesh.position.copy(p);
    const overTable = Math.abs(p.x) <= HALF_W && Math.abs(p.z) <= HALF_L && p.y >= TABLE.H;
    const ground = overTable ? TABLE.H + 0.002 : 0.008;
    const h = Math.max(0, p.y - ground);
    const sz = 0.07 + h * 0.06;
    this.ballShadow.position.set(p.x, ground, p.z);
    this.ballShadow.scale.set(sz, sz, 1);
    this.ballShadow.material.opacity = THREE.MathUtils.clamp(1 - h * 0.6, 0.15, 1);
  }

  // ---------------- plateia ----------------
  _crowd() {
    const s = this.scene;
    // arquibancadas
    const seatA = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
    const seatB = new THREE.MeshStandardMaterial({ color: '#43bff5', roughness: 0.6 });
    this.seats = [];
    const rows = 5, stepH = 0.42, stepD = 0.85;
    const addBleacher = (cx, cz, len, rot) => {
      const g = new THREE.Group();
      for (let r = 0; r < rows; r++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(len, stepH * (r + 1), stepD), r % 2 ? seatA : seatB);
        step.position.set(0, stepH * (r + 1) / 2, -r * stepD);
        step.receiveShadow = true;
        g.add(step);
        for (let x = -len / 2 + 0.4; x < len / 2 - 0.3; x += 0.62) {
          this.seats.push({ local: new THREE.Vector3(x, stepH * (r + 1), -r * stepD - 0.05), group: g });
        }
      }
      g.position.set(cx, 0, cz); g.rotation.y = rot;
      s.add(g);
      g.updateMatrixWorld(true);
    };
    addBleacher(0, -ARENA.Z - 1.4, 16, 0);
    addBleacher(0, ARENA.Z + 1.4, 16, Math.PI);
    addBleacher(-ARENA.X - 1.6, 0.6, 11, Math.PI / 2);
    addBleacher(ARENA.X + 1.6, 0.6, 11, -Math.PI / 2);
    for (const seat of this.seats) seat.world = seat.local.clone().applyMatrix4(seat.group.matrixWorld);
    this._buildCrowdMeshes();
  }

  _buildCrowdMeshes() {
    if (this.crowd) {
      for (const m of [this.crowd.bodies, this.crowd.heads, this.crowd.hair]) { this.scene.remove(m); m.dispose(); }
    }
    const n = Math.min(this.q.crowd, this.seats.length);
    // escolhe assentos espalhados
    const picks = [];
    const step = this.seats.length / n;
    for (let i = 0; i < n; i++) picks.push(this.seats[Math.floor(i * step + Math.random() * step * 0.6) % this.seats.length]);
    const bodyGeo = new THREE.CapsuleGeometry(0.17, 0.22, 4, 10);
    const headGeo = new THREE.SphereGeometry(0.16, 16, 12);
    headGeo.rotateY(Math.PI); // rosto para -Z local
    const hairGeo = new THREE.SphereGeometry(0.168, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42);
    hairGeo.rotateX(0.35);
    const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), n);
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ map: TX.crowdFace(), roughness: 0.6 }), n);
    const hair = new THREE.InstancedMesh(hairGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), n);
    const shirts = ['#ff8c42', '#43bff5', '#4fb36b', '#ffd65a', '#e8566c', '#7a5cff', '#ffffff', '#168fd2', '#ff6fa8'];
    const skins = ['#f6cfa8', '#e8b48a', '#c98b5f', '#8d5a3b', '#ffe0c4', '#b07850'];
    const hairs = ['#2b1c12', '#5b3a24', '#a8682f', '#e8c46a', '#1c1c22', '#7a3b1c', '#c44d2a'];
    const col = new THREE.Color();
    this.crowdData = picks.map((seat, i) => {
      bodies.setColorAt(i, col.set(shirts[i % shirts.length]));
      heads.setColorAt(i, col.set(skins[Math.floor(Math.random() * skins.length)]));
      hair.setColorAt(i, col.set(hairs[Math.floor(Math.random() * hairs.length)]));
      const yaw = Math.atan2(-seat.world.x, -seat.world.z); // virado para a mesa
      return { pos: seat.world, yaw: yaw + Math.PI, phase: Math.random() * 10, energy: 0, team: seat.world.z < 0 ? 1 : 0 };
    });
    for (const m of [bodies, heads, hair]) { m.castShadow = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(m); }
    this.crowd = { bodies, heads, hair, n };
    this._updateCrowd(0);
  }

  cheer(amount = 1) {
    if (!this.crowdData) return;
    for (const c of this.crowdData) c.energy = Math.max(c.energy, amount * (0.6 + Math.random() * 0.6));
  }

  _updateCrowd(dt) {
    const { bodies, heads, hair, n } = this.crowd;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const c = this.crowdData[i];
      c.phase += dt * (2 + c.energy * 10);
      c.energy = Math.max(0, c.energy - dt * 0.5);
      const hop = Math.max(0, Math.sin(c.phase)) * (0.02 + c.energy * 0.28);
      const sway = Math.sin(c.phase * 0.5) * 0.06;
      e.set(0, c.yaw, sway);
      q.setFromEuler(e);
      p.set(c.pos.x, c.pos.y + 0.32 + hop, c.pos.z);
      m.compose(p, q, sc); bodies.setMatrixAt(i, m);
      p.y += 0.42;
      m.compose(p, q, sc); heads.setMatrixAt(i, m);
      p.y += 0.01;
      m.compose(p, q, sc); hair.setMatrixAt(i, m);
    }
    bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = hair.instanceMatrix.needsUpdate = true;
  }

  // ---------------- configurações ----------------
  applySettings(settings, first = false) {
    this.settings = settings;
    const prevQ = this.q;
    this.q = QUALITY[settings.quality] || QUALITY.high;
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pixelRatio));
    const shadows = settings.shadows && this.q.shadowSize > 0;
    if (r.shadowMap.enabled !== shadows || first) {
      r.shadowMap.enabled = shadows;
      this.sun.castShadow = shadows;
      this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    }
    if (shadows && this.sun.shadow.mapSize.x !== this.q.shadowSize) {
      this.sun.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize);
      this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    }
    if (this.q.env && !this.envTex) {
      const pm = new THREE.PMREMGenerator(r);
      this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    this.scene.environment = this.q.env ? this.envTex : null;
    this.scene.environmentIntensity = 0.35;
    if (!first && prevQ.crowd !== this.q.crowd) this._buildCrowdMeshes();
    if (this.q.bloom && !this.composer) {
      this.composer = new EffectComposer(r);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.4, 2.6);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 62 : 48;
    this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
  }

  // ---------------- câmera ----------------
  setCamera(pos, look, rate = 4) {
    this.camTarget.pos.copy(pos);
    this.camTarget.look.copy(look);
    this.camTarget.rate = rate;
  }
  snapCamera() {
    this.camera.position.copy(this.camTarget.pos);
    this.camLook.copy(this.camTarget.look);
  }
  addShake(a) { this.shake = Math.min(0.06, this.shake + a); }

  update(dt) {
    this.time += dt;
    const k = 1 - Math.exp(-dt * this.camTarget.rate);
    this.camera.position.lerp(this.camTarget.pos, k);
    this.camLook.lerp(this.camTarget.look, k);
    this.camera.lookAt(this.camLook);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 0.25);
    }
    this._updateCrowd(dt);
  }

  render() {
    if (this.q.bloom && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}

export { ARENA, GYM };
