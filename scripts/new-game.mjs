// Cria a pasta de um jogo novo no padrão do Fliperama.
// Uso: node scripts/new-game.mjs meu-jogo "Meu Jogo" [autor]
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [slug, title, authorArg] = process.argv.slice(2);

if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.error('Uso: node scripts/new-game.mjs meu-jogo "Meu Jogo" [autor]\nO nome da pasta usa só letras minúsculas, números e hífens.');
  process.exit(1);
}
const dir = join(ROOT, 'games', slug);
if (existsSync(dir)) { console.error(`games/${slug} já existe.`); process.exit(1); }

let author = authorArg;
if (!author) {
  try { author = execFileSync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* sem gh */ }
}
if (!author) {
  try { author = execFileSync('git', ['config', 'user.name'], { encoding: 'utf8' }).trim(); } catch { /* sem git */ }
}
author = author || 'desconhecido';
const name = title || slug;
const today = new Date().toISOString().slice(0, 10);

mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'game.json'), JSON.stringify({
  title: name,
  author,
  description: 'Descreva o jogo em uma ou duas frases.',
  tags: [],
  players: '1',
  controls: '',
  online: false,
  thumb: null,
  created: today,
}, null, 2) + '\n');

writeFileSync(join(dir, 'index.html'), `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${name.replace(/</g, '&lt;')}</title>
<style>
  html,body{height:100%;margin:0;background:#0d0b14;color:#efeaf7;font-family:system-ui,sans-serif;overflow:hidden}
  canvas{display:block;width:100%;height:100%}
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
// ${name}: comece aqui. Chaves do localStorage sempre com o prefixo "${slug}:".
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
function resize(){ const d = Math.min(2, devicePixelRatio || 1); cv.width = innerWidth * d; cv.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
addEventListener('resize', resize); resize();
function frame(t){
  ctx.fillStyle = '#0d0b14'; ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.fillStyle = '#ffb000'; ctx.font = '700 32px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(${JSON.stringify(name)}, innerWidth / 2, innerHeight / 2 + Math.sin(t / 400) * 8);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
</script>
</body>
</html>
`);
console.log(`Criado games/${slug}/ (autor: ${author}). Edite o index.html e o game.json.`);
