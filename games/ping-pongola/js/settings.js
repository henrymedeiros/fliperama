// Preferências do jogador, salvas no navegador (com try/catch: pode não haver storage).
const KEY = 'pingpongola.settings.v1';

export const DEFAULTS = {
  quality: 'high',        // low | medium | high | ultra
  shadows: true,
  trail: true,
  particles: true,
  showFps: false,
  showSensors: false,
  camera: 'behind',       // behind | high | tv
  sfx: 0.8,
  music: 0.35,
  crowd: 0.6,
  hand: 'right',          // right | left
  sensitivity: 1,
  assist: 'medium',       // low | medium | high
  gameSpeed: 1,           // 0.75 | 1 | 1.15
  vibration: true,
  phoneSound: true,
  difficulty: 'normal',   // easy | normal | hard
  points: 7,
  name: 'Você',
  shirt: '#ff8c42',
  skin: '#f6cfa8',
  hair: '#5b3a24',
  hairStyle: 'short',     // short | bob | pony
};

export const QUALITY = {
  low:    { pixelRatio: 0.75, shadowSize: 0,    crowd: 60,  antialias: false, env: false, bloom: false },
  medium: { pixelRatio: 1,    shadowSize: 1024, crowd: 130,  antialias: true,  env: true,  bloom: false },
  high:   { pixelRatio: 1.5,  shadowSize: 2048, crowd: 200, antialias: true,  env: true,  bloom: false },
  ultra:  { pixelRatio: 2,    shadowSize: 4096, crowd: 300, antialias: true,  env: true,  bloom: true  },
};

export function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { /* sem storage */ }
  return { ...DEFAULTS, ...saved };
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem storage */ }
}
