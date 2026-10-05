// Texturas desenhadas em canvas: nada de imagens externas, tudo carrega instantâneo.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

let seed = 7;
function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function woodFloor() {
  const [c, g] = canvas(1024, 1024);
  const rows = 16, rh = 1024 / rows;
  const tones = ['#e8b979', '#dfad6c', '#ecc28a', '#d9a462', '#e4b474'];
  for (let r = 0; r < rows; r++) {
    let x = -rand() * 300;
    while (x < 1024) {
      const len = 260 + rand() * 300;
      g.fillStyle = tones[Math.floor(rand() * tones.length)];
      g.fillRect(x, r * rh, len, rh);
      // veios
      g.globalAlpha = 0.12;
      for (let k = 0; k < 7; k++) {
        g.strokeStyle = rand() > 0.5 ? '#9a6431' : '#fff1d6';
        g.lineWidth = 1 + rand() * 1.5;
        g.beginPath();
        const yy = r * rh + 4 + rand() * (rh - 8);
        g.moveTo(x, yy);
        g.bezierCurveTo(x + len * 0.3, yy + rand() * 6 - 3, x + len * 0.6, yy + rand() * 6 - 3, x + len, yy + rand() * 4 - 2);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(110,70,30,0.35)';
      g.fillRect(x, r * rh, 2, rh);
      x += len;
    }
    g.fillStyle = 'rgba(110,70,30,0.3)';
    g.fillRect(0, r * rh, 1024, 2);
  }
  return tex(c, { repeat: [5, 5] });
}

export function tableTop() {
  const W = 762, H = 1370; // 2 px por cm; comprimento da mesa no eixo vertical do canvas (= eixo Z)
  const [c, g] = canvas(W, H);
  const grd = g.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, '#2a7ee8'); grd.addColorStop(1, '#1f6bd6');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.05;
  for (let i = 0; i < 5000; i++) { g.fillStyle = rand() > 0.5 ? '#fff' : '#002'; g.fillRect(rand() * W, rand() * H, 2, 2); }
  g.globalAlpha = 1;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 8; g.strokeRect(4, 4, W - 8, H - 8);
  g.lineWidth = 3; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
  g.globalAlpha = 0.16; g.fillStyle = '#fff';
  g.font = '700 64px Fredoka, Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(W * 0.5, H * 0.22); g.rotate(Math.PI); g.fillText('PONGOLA', 0, 0); g.restore();
  g.fillText('PONGOLA', W * 0.5, H * 0.78);
  g.globalAlpha = 1;
  return tex(c);
}

export function netMesh() {
  const [c, g] = canvas(256, 64);
  g.clearRect(0, 0, 256, 64);
  g.strokeStyle = 'rgba(20,30,60,0.9)'; g.lineWidth = 1.5;
  for (let x = 0; x <= 256; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 64); g.stroke(); }
  for (let y = 0; y <= 64; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  const t = tex(c, { repeat: [7, 1] });
  return t;
}

export function sky() {
  const [c, g] = canvas(512, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#3fb2f2'); grd.addColorStop(0.7, '#a9e4ff'); grd.addColorStop(1, '#e9f9ff');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  const cloud = (x, y, s) => {
    g.beginPath();
    g.arc(x, y, 18 * s, 0, Math.PI * 2); g.arc(x + 22 * s, y - 10 * s, 24 * s, 0, Math.PI * 2);
    g.arc(x + 48 * s, y, 18 * s, 0, Math.PI * 2); g.rect(x, y, 48 * s, 14 * s);
    g.fill();
  };
  cloud(40, 90, 1); cloud(220, 60, 0.8); cloud(360, 120, 1.2); cloud(460, 70, 0.6);
  g.fillStyle = '#8fd46b';
  g.beginPath(); g.moveTo(0, 256); g.quadraticCurveTo(140, 200, 300, 236); g.quadraticCurveTo(420, 205, 512, 230); g.lineTo(512, 256); g.fill();
  return tex(c);
}

export function banner(text, { bg = '#ff8c42', fg = '#fff', w = 1024, h = 256, stripe = '#ffd65a', font = 120 } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = stripe; g.fillRect(0, 0, w, h * 0.08); g.fillRect(0, h * 0.92, w, h * 0.08);
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, h * 0.08, w, h * 0.3);
  g.fillStyle = fg;
  g.font = `700 ${font}px Fredoka, Nunito, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.18)'; g.shadowOffsetY = 6; g.shadowBlur = 4;
  g.fillText(text, w / 2, h / 2 + 6);
  return tex(c);
}

export function barrier(i) {
  const [c, g] = canvas(512, 160);
  const blue = i % 2 === 0;
  g.fillStyle = blue ? '#168fd2' : '#f7fcff'; g.fillRect(0, 0, 512, 160);
  g.fillStyle = blue ? '#43bff5' : '#dceff6'; g.fillRect(0, 0, 512, 22);
  g.fillStyle = blue ? '#ffffff' : '#168fd2';
  g.font = '700 70px Fredoka, Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(blue ? 'PONGOLA' : 'PING!', 290, 92);
  g.fillStyle = '#ff8c42';
  g.beginPath(); g.arc(70, 92, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath(); g.arc(60, 80, 11, 0, Math.PI * 2); g.fill();
  return tex(c);
}

export function pennant() {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  return tex(c);
}

/** Rosto da plateia: fundo branco (a cor da pele vem da instância). Rosto em u=0.25 (+Z da esfera). */
export function crowdFace() {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 128);
  const cx = 64, cy = 70;
  g.fillStyle = '#2b2018';
  g.beginPath(); g.ellipse(cx - 11, cy - 6, 3.5, 6, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(cx + 11, cy - 6, 3.5, 6, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#a2453a'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.arc(cx, cy + 6, 9, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  g.fillStyle = 'rgba(255,120,120,0.35)';
  g.beginPath(); g.arc(cx - 20, cy + 5, 5, 0, Math.PI * 2); g.arc(cx + 20, cy + 5, 5, 0, Math.PI * 2); g.fill();
  return tex(c);
}

/** Rosto de Mii com expressão. Fundo na cor da pele. */
export function miiFace(skin, mood = 'normal', eyeColor = '#2b2018') {
  const [c, g] = canvas(512, 256);
  g.fillStyle = skin; g.fillRect(0, 0, 512, 256);
  const cx = 128, cy = 140;
  g.lineCap = 'round';
  // sobrancelhas
  g.strokeStyle = '#4a3020'; g.lineWidth = 5;
  const browY = mood === 'sad' ? cy - 34 : cy - 38;
  const tilt = mood === 'sad' ? -5 : mood === 'focus' ? 5 : 0;
  g.beginPath(); g.moveTo(cx - 34, browY + tilt); g.lineTo(cx - 14, browY - tilt); g.stroke();
  g.beginPath(); g.moveTo(cx + 14, browY - tilt); g.lineTo(cx + 34, browY + tilt); g.stroke();
  // olhos
  if (mood === 'happy') {
    g.strokeStyle = eyeColor; g.lineWidth = 6;
    g.beginPath(); g.arc(cx - 23, cy - 10, 9, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.beginPath(); g.arc(cx + 23, cy - 10, 9, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  } else {
    for (const s of [-1, 1]) {
      g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(cx + s * 23, cy - 12, 10, 13, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = eyeColor;
      g.beginPath(); g.ellipse(cx + s * 23 + s * 1.5, cy - 10, 6.5, 9, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(cx + s * 23 + s * 1.5 - 2, cy - 14, 2.6, 0, Math.PI * 2); g.fill();
    }
  }
  // nariz
  g.strokeStyle = 'rgba(120,60,40,0.45)'; g.lineWidth = 3;
  g.beginPath(); g.arc(cx, cy + 4, 4, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
  // bochechas
  g.fillStyle = 'rgba(255,110,110,0.28)';
  g.beginPath(); g.ellipse(cx - 40, cy + 12, 10, 6, 0, 0, Math.PI * 2); g.ellipse(cx + 40, cy + 12, 10, 6, 0, 0, Math.PI * 2); g.fill();
  // boca
  if (mood === 'happy') {
    g.fillStyle = '#8a2e2a';
    g.beginPath(); g.moveTo(cx - 16, cy + 18); g.quadraticCurveTo(cx, cy + 44, cx + 16, cy + 18); g.closePath(); g.fill();
    g.fillStyle = '#ff7f86';
    g.beginPath(); g.ellipse(cx, cy + 30, 7, 4, 0, 0, Math.PI * 2); g.fill();
  } else if (mood === 'sad') {
    g.strokeStyle = '#8a2e2a'; g.lineWidth = 4;
    g.beginPath(); g.arc(cx, cy + 34, 10, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke();
  } else if (mood === 'focus') {
    g.strokeStyle = '#8a2e2a'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(cx - 8, cy + 26); g.lineTo(cx + 8, cy + 25); g.stroke();
  } else {
    g.strokeStyle = '#8a2e2a'; g.lineWidth = 4;
    g.beginPath(); g.arc(cx, cy + 16, 11, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  }
  return tex(c);
}

/** Placar do ginásio (atualizado a cada ponto). */
export class ScoreboardTexture {
  constructor() {
    [this.c, this.g] = canvas(1024, 448);
    this.texture = tex(this.c);
    this.draw({ names: ['—', '—'], colors: ['#ff8c42', '#43bff5'], score: [0, 0], server: 0, title: 'PING PONGOLA' });
  }
  draw({ names, colors, score, server, title }) {
    const g = this.g, W = 1024, H = 448;
    g.fillStyle = '#17384d'; g.fillRect(0, 0, W, H);
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#24506b'); grd.addColorStop(1, '#122c3d');
    roundRect(g, 14, 14, W - 28, H - 28, 36); g.fillStyle = grd; g.fill();
    g.fillStyle = '#ffd65a'; g.font = '700 54px Fredoka, Nunito, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(title, W / 2, 70);
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? W * 0.26 : W * 0.74;
      roundRect(g, x - 190, 120, 380, 280, 30);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fill();
      g.fillStyle = colors[i];
      g.fillRect(x - 160, 136, 320, 12);
      g.fillStyle = '#fff'; g.font = '700 46px Fredoka, Nunito, sans-serif';
      g.fillText(String(names[i]).slice(0, 12), x, 190);
      g.fillStyle = '#ffffff'; g.font = '700 170px Fredoka, Nunito, sans-serif';
      g.fillText(String(score[i]), x, 310);
      if (server === i) {
        g.fillStyle = '#ff8c42';
        g.beginPath(); g.arc(x + 150, 190, 18, 0, Math.PI * 2); g.fill();
      }
    }
    g.fillStyle = '#ffd65a'; g.font = '700 90px Fredoka, Nunito, sans-serif';
    g.fillText(':', W / 2, 300);
    this.texture.needsUpdate = true;
  }
}
