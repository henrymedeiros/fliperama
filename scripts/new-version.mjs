// Cria uma versão de um jogo copiando uma versão existente pra uma subpasta e registrando no game.json.
// Uso: node scripts/new-version.mjs <slug> <id> "<Nome>" [--antiga | --alternativa] [--de <id>] [--nota "..."]
//   --antiga       guarda uma cópia congelada (ex.: antes de uma mudança grande na versão principal)
//   --alternativa  começa uma variação do jogo a partir da cópia (é o padrão)
//   --de <id>      versão usada como base (padrão: a primeira da lista, a principal)
// A versão nova vai pro fim da lista; a primeira continua sendo a que abre por padrão.
import { readFileSync, writeFileSync, existsSync, readdirSync, cpSync, statSync } from 'node:fs';
import { join, dirname, basename, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v ?? ''; };
const has = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const from = flag('--de'), note = flag('--nota');
const kind = has('--antiga') ? 'antiga' : (has('--alternativa'), 'alternativa');
const [slug, id, name] = args;

function fail(msg) { console.error(msg); process.exit(1); }
if (!slug || !id || !name) fail('Uso: node scripts/new-version.mjs <slug> <id> "<Nome>" [--antiga | --alternativa] [--de <id>] [--nota "..."]');
if (!SLUG_RE.test(id)) fail(`O id "${id}" vira nome de pasta: use só letras minúsculas, números e hífens.`);
const gameDir = join(ROOT, 'games', slug), metaPath = join(gameDir, 'game.json');
if (!existsSync(metaPath)) fail(`games/${slug}/game.json não existe.`);
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));

// jogo sem versões: a versão atual vira a primeira da lista
if (!Array.isArray(meta.versions) || !meta.versions.length) {
  meta.versions = [{ id: 'original', name: 'Original', entry: meta.entry || 'index.html', ...(meta.thumb ? { thumb: meta.thumb } : {}) }];
  console.log('O jogo ainda não tinha versões: a atual entrou na lista como "original".');
}
if (meta.versions.some(v => v.id === id)) fail(`Já existe uma versão "${id}".`);
const destDir = join(gameDir, id);
if (existsSync(destDir)) fail(`games/${slug}/${id}/ já existe.`);
const base = from ? meta.versions.find(v => v.id === from) : meta.versions[0];
if (!base) fail(`Versão base "${from}" não encontrada. Existentes: ${meta.versions.map(v => v.id).join(', ')}`);

// copia a pasta da versão base, sem o game.json e sem as pastas de outras versões
const baseDir = join(gameDir, dirname(base.entry));
const versionDirs = new Set(meta.versions.map(v => dirname(v.entry)).filter(d => d !== '.').map(d => join(gameDir, d.split('/')[0])));
const copied = [];
for (const item of readdirSync(baseDir)) {
  const src = join(baseDir, item);
  if (item === 'game.json' || versionDirs.has(src)) continue;
  cpSync(src, join(destDir, item), { recursive: true });
  copied.push(item + (statSync(src).isDirectory() ? '/' : ''));
}

const rel = p => relative(gameDir, p).split(sep).join('/');
const version = { id, name, kind, entry: rel(join(destDir, basename(base.entry))) };
if (base.thumb) {
  const t = join(gameDir, base.thumb);
  if (t.startsWith(baseDir + sep) && existsSync(join(destDir, relative(baseDir, t)))) version.thumb = rel(join(destDir, relative(baseDir, t)));
}
if (note) version.note = note;
version.created = new Date().toISOString().slice(0, 10);
meta.versions.push(version);
writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');

console.log(`Criada a versão "${name}" (${kind}) em games/${slug}/${id}/, copiada de "${base.name}".`);
console.log(`Arquivos copiados: ${copied.join(', ')}`);
console.log(kind === 'antiga'
  ? 'Versão antiga fica congelada: não edite essa pasta. Continue mexendo na versão principal.'
  : 'Agora edite a cópia. Se ela não deve dividir recordes com a original, troque o prefixo das chaves de localStorage.');
console.log('Apague da cópia o que ela não usar e crie uma capa própria (thumb) pra diferenciar no seletor.');
