// Profundidade de campo com bokeh: espiral de ângulo áureo em meia resolução sobre a imagem HDR
// (luzes fortes viram discos), ponderada pela profundidade pra o primeiro plano não vazar no fundo.
// Uma zona morta em volta do foco deixa a torre inteira nítida.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Camadas: 0 = apartamento (desfoca), 1 = marcadores do jogo, 2 = torre e mesa (também na 0),
// 3 = fora do mapa de profundidade (vidro, poeira). As camadas 1 e 2 nunca desfocam.
export const LAYER_FX = 1, LAYER_GAME = 2, LAYER_NODEPTH = 3;

const COMMON = /* glsl */`
#include <packing>
uniform sampler2D tDepth;
uniform float uNear, uFar, uFocus, uAperture, uDead, uMaxPx;
float distAt(vec2 uv){
  float d = unpackRGBAToDepth(texture2D(tDepth, uv));
  return -perspectiveDepthToViewZ(d, uNear, uFar);
}
// raio do círculo de confusão em pixels da tela cheia (negativo = na frente do foco)
float cocAt(float dist){
  float x = 1.0 - uFocus / max(dist, 0.001);
  float s = sign(x), a = max(0.0, abs(x) - uDead) / (1.0 - uDead);
  return s * min(1.0, a * uAperture) * uMaxPx;
}
`;

export class DofPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene; this.camera = camera;
    this.focus = 64; this.aperture = 1.6; this.dead = 0.03; this.maxFrac = 0.022;
    this.depthRT = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.blurRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, blending: THREE.NoBlending });
    // nos pixels da torre, da mesa e dos marcadores grava a distância exata do foco: desfoque zero
    this.focusMat = new THREE.ShaderMaterial({
      uniforms: { uFocusDepth: { value: 0.5 } },
      vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: '#include <packing>\nuniform float uFocusDepth; void main(){ gl_FragColor = packDepthToRGBA(uFocusDepth); }',
      depthWrite: false, depthTest: true, blending: THREE.NoBlending,
    });

    const uniforms = () => ({
      tColor: { value: null }, tDepth: { value: this.depthRT.texture }, tBlur: { value: this.blurRT.texture },
      uNear: { value: 1 }, uFar: { value: 1000 }, uFocus: { value: 64 }, uAperture: { value: 1 }, uDead: { value: 0.1 },
      uMaxPx: { value: 20 }, uTexel: { value: new THREE.Vector2() }, uHalfTexel: { value: new THREE.Vector2() },
    });
    const vert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

    this.blurMat = new THREE.ShaderMaterial({
      uniforms: uniforms(), vertexShader: vert,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform sampler2D tColor; uniform vec2 uTexel;
        ${COMMON}
        void main(){
          float cd = distAt(vUv);
          float cs = abs(cocAt(cd));
          vec3 col = texture2D(tColor, vUv).rgb;
          float tot = 1.0;
          float r = 1.6;               // raio em px da tela cheia
          float ang = 0.0;
          for (int i = 0; i < 72; i++) {
            if (r >= uMaxPx) break;
            vec2 tc = vUv + vec2(cos(ang), sin(ang)) * uTexel * r;
            float sd = distAt(tc);
            float ss = abs(cocAt(sd));
            if (sd > cd) ss = min(ss, cs * 2.0);   // o fundo não invade o que está na frente
            float m = smoothstep(r - 1.5, r + 1.5, ss);
            vec3 sc = texture2D(tColor, tc).rgb;
            col += mix(col / tot, sc, m);
            tot += 1.0;
            ang += 2.39996323;
            r += 9.0 / r + 0.35;
          }
          gl_FragColor = vec4(col / tot, 1.0);
        }`,
    });

    this.compMat = new THREE.ShaderMaterial({
      uniforms: uniforms(), vertexShader: vert,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform sampler2D tColor; uniform sampler2D tBlur;
        ${COMMON}
        void main(){
          vec4 sharp = texture2D(tColor, vUv);
          float c = abs(cocAt(distAt(vUv)));
          vec3 b = texture2D(tBlur, vUv).rgb;
          gl_FragColor = vec4(mix(sharp.rgb, b, smoothstep(0.6, 2.2, c)), sharp.a);
        }`,
    });
    this.quad = new FullScreenQuad(null);
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    this.depthRT.setSize(w, h);
    this.blurRT.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
  }

  _sync(mat) {
    const u = mat.uniforms;
    u.uNear.value = this.camera.near; u.uFar.value = this.camera.far;
    u.uFocus.value = this.focus; u.uAperture.value = this.aperture; u.uDead.value = this.dead;
    u.uMaxPx.value = Math.max(4, this.maxFrac * this.h);
    u.uTexel.value.set(1 / this.w, 1 / this.h);
  }

  render(renderer, writeBuffer, readBuffer) {
    // profundidade real do apartamento e da torre (camada 0); vidro e poeira ficam de fora
    const cam = this.camera, scene = this.scene;
    // (a neblina fica como está: mexer nela troca a variante do shader de todos os materiais
    // e o three recompila tudo a cada quadro; o material de profundidade já a ignora)
    const bg = scene.background, mask = cam.layers.mask;
    const oldClear = renderer.getClearColor(new THREE.Color()), oldAlpha = renderer.getClearAlpha(), oldAuto = renderer.autoClear;
    scene.background = null; scene.overrideMaterial = this.depthMat; cam.layers.set(0);
    renderer.setClearColor(0xffffff, 1); renderer.autoClear = false;
    renderer.setRenderTarget(this.depthRT); renderer.clear(); renderer.render(scene, cam);
    // segunda passada: só o jogo (camadas 1 e 2), por cima, onde estiver visível
    const n = cam.near, f = cam.far, fo = Math.max(n * 2, this.focus);
    this.focusMat.uniforms.uFocusDepth.value = ((fo - n) * f) / ((f - n) * fo);
    scene.overrideMaterial = this.focusMat; cam.layers.set(LAYER_FX); cam.layers.enable(LAYER_GAME);
    renderer.render(scene, cam);
    scene.overrideMaterial = null; scene.background = bg; cam.layers.mask = mask;
    renderer.setClearColor(oldClear, oldAlpha);

    this._sync(this.blurMat);
    this.blurMat.uniforms.tColor.value = readBuffer.texture;
    this.quad.material = this.blurMat;
    renderer.setRenderTarget(this.blurRT); renderer.clear(); this.quad.render(renderer);

    this._sync(this.compMat);
    this.compMat.uniforms.tColor.value = readBuffer.texture;
    this.quad.material = this.compMat;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
    renderer.autoClear = oldAuto;
  }

  dispose() {
    this.depthRT.dispose(); this.blurRT.dispose(); this.depthMat.dispose(); this.focusMat.dispose();
    this.blurMat.dispose(); this.compMat.dispose(); this.quad.dispose();
  }
}
