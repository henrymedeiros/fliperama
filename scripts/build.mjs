// Monta o catálogo: lê games/*/game.json, valida e gera games.json + games.js.
// Uso: node scripts/build.mjs          (gera os arquivos)
//      node scripts/build.mjs --check  (só valida, não escreve nada)
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAMES = join(ROOT, 'games');
const CHECK = process.argv.includes('--check');
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const REQUIRED = ['title', 'author', 'description'];
const MAX_THUMB = 400 * 1024;
const KINDS = ['alternativa', 'antiga'];

function git(args) {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}

function repoUrl() {
  const url = git(['remote', 'get-url', 'origin']);
  const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
  return m ? `https://github.com/${m[1]}/${m[2]}` : null;
}

const errors = [];
const warnings = [];
const games = [];

for (const slug of existsSync(GAMES) ? readdirSync(GAMES).sort() : []) {
  const dir = join(GAMES, slug);
  if (!statSync(dir).isDirectory()) continue;
  const where = `games/${slug}`;
  if (!SLUG_RE.test(slug)) { errors.push(`${where}: nome da pasta deve ser minúsculo com hífens (ex.: meu-jogo)`); continue; }
  const metaPath = join(dir, 'game.json');
  if (!existsSync(metaPath)) { errors.push(`${where}: falta o game.json`); continue; }
  let meta;
  try { meta = JSON.parse(readFileSync(metaPath, 'utf8')); }
  catch (e) { errors.push(`${where}/game.json: JSON inválido (${e.message})`); continue; }

  for (const k of REQUIRED) {
    if (typeof meta[k] !== 'string' || !meta[k].trim()) errors.push(`${where}/game.json: campo "${k}" é obrigatório`);
  }
  const entry = meta.entry || 'index.html';
  if (!existsSync(join(dir, entry))) errors.push(`${where}: arquivo de entrada "${entry}" não existe`);
  if (meta.thumb) {
    const t = join(dir, meta.thumb);
    if (!existsSync(t)) errors.push(`${where}: capa "${meta.thumb}" não existe`);
    else if (statSync(t).size > MAX_THUMB) warnings.push(`${where}: capa tem ${(statSync(t).size / 1024).toFixed(0)} KB (ideal até 400 KB)`);
  } else {
    warnings.push(`${where}: sem capa (campo "thumb"); o catálogo usa uma capa gerada`);
  }
  if (meta.tags && !Array.isArray(meta.tags)) errors.push(`${where}/game.json: "tags" deve ser uma lista`);
  const versions = readVersions(meta, dir, where);

  const updated = git(['log', '-1', '--format=%cI', '--', `games/${slug}`]) || statSync(metaPath).mtime.toISOString();
  const created = meta.created || git(['log', '--diff-filter=A', '--format=%cI', '--', `games/${slug}/game.json`]).split('\n').pop() || updated;

  games.push({
    slug,
    title: String(meta.title || slug).trim(),
    author: String(meta.author || '').trim(),
    description: String(meta.description || '').trim(),
    tags: Array.isArray(meta.tags) ? meta.tags.map(String).slice(0, 8) : [],
    players: meta.players ? String(meta.players) : '1',
    controls: meta.controls ? String(meta.controls) : '',
    online: !!meta.online,
    // com versões, a ficha abre a primeira da lista
    entry: versions ? versions[0].entry : entry,
    thumb: versions ? versions[0].thumb : meta.thumb || null,
    created,
    updated,
    ...(versions ? { versions } : {}),
  });
}

// "versions" no game.json: lista de versões jogáveis do mesmo jogo (atual, antigas, alternativas).
// A primeira é a padrão. Cada uma: { id, name, entry, thumb?, note?, kind?, created? }.
function readVersions(meta, dir, where) {
  if (meta.versions === undefined) return null;
  const at = `${where}/game.json`;
  if (!Array.isArray(meta.versions) || !meta.versions.length) { errors.push(`${at}: "versions" deve ser uma lista com pelo menos uma versão`); return null; }
  const seen = new Set();
  const safe = p => typeof p === 'string' && p.trim() && !p.startsWith('/') && !p.split(/[\\/]/).includes('..');
  const out = [];
  meta.versions.forEach((v, i) => {
    const vw = `${at}: versão ${i + 1}`;
    if (!v || typeof v !== 'object') { errors.push(`${vw} deve ser um objeto`); return; }
    if (typeof v.id !== 'string' || !SLUG_RE.test(v.id)) errors.push(`${vw}: "id" deve ser minúsculo com hífens (ex.: vista-de-cima)`);
    else if (seen.has(v.id)) errors.push(`${vw}: id "${v.id}" repetido`);
    else seen.add(v.id);
    if (typeof v.name !== 'string' || !v.name.trim()) errors.push(`${vw}: "name" é obrigatório`);
    if (!safe(v.entry)) errors.push(`${vw}: "entry" deve ser um caminho relativo dentro da pasta do jogo`);
    else if (!existsSync(join(dir, v.entry))) errors.push(`${vw}: arquivo de entrada "${v.entry}" não existe`);
    if (v.thumb !== undefined) {
      if (!safe(v.thumb)) errors.push(`${vw}: "thumb" deve ser um caminho relativo dentro da pasta do jogo`);
      else if (!existsSync(join(dir, v.thumb))) errors.push(`${vw}: capa "${v.thumb}" não existe`);
      else if (statSync(join(dir, v.thumb)).size > MAX_THUMB) warnings.push(`${vw}: capa tem ${(statSync(join(dir, v.thumb)).size / 1024).toFixed(0)} KB (ideal até 400 KB)`);
    }
    if (v.kind !== undefined && !KINDS.includes(v.kind)) errors.push(`${vw}: "kind" deve ser ${KINDS.map(k => `"${k}"`).join(' ou ')}`);
    if (v.created !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(v.created))) errors.push(`${vw}: "created" deve ser AAAA-MM-DD`);
    out.push({
      id: String(v.id),
      name: String(v.name || v.id).trim(),
      note: v.note ? String(v.note).trim() : '',
      kind: v.kind || null,
      entry: String(v.entry),
      thumb: v.thumb || meta.thumb || null,
      created: v.created ? String(v.created) : null,
    });
  });
  return out.length === meta.versions.length ? out : null;
}

for (const w of warnings) console.log('  aviso: ' + w);
if (errors.length) {
  for (const e of errors) console.error('  ERRO: ' + e);
  console.error(`\n${errors.length} problema(s). Corrija antes de publicar.`);
  process.exit(1);
}

games.sort((a, b) => b.updated.localeCompare(a.updated));
const out = { repo: repoUrl(), built: new Date().toISOString(), games };
if (!CHECK) {
  writeFileSync(join(ROOT, 'games.json'), JSON.stringify(out, null, 2) + '\n');
  writeFileSync(join(ROOT, 'games.js'), 'window.FLIPERAMA=' + JSON.stringify(out) + ';\n');
}
console.log(`${CHECK ? 'Tudo certo' : 'Catálogo gerado'}: ${games.length} jogo(s).`);
