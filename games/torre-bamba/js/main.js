// Torre Bamba: regras, turnos, entrada, rede e interface.
// Quem está na vez simula a física e transmite as poses; os outros só desenham (interpolando).
import RAPIER from '@dimforge/rapier3d-compat';
import { Tower, N, PER, qyaw, qrot } from './physics.js';
import { View } from './render.js';
import { Sfx } from './audio.js';
import { Host, Guest, normalizeCode, friendlyNetError } from './net.js';

const $ = (s) => document.querySelector(s);
const KEY = 'torre-bamba:';
const store = {
  get(k, d) { try { const v = localStorage.getItem(KEY + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { /* sem storage */ } },
};
const COLORS = ['#ffb347', '#5ec8ff', '#ff6b8b', '#7ee081', '#c49bff', '#ffe066', '#ff9f6b', '#6be4d6'];
const SETTLE = 3;          // segundos que a torre precisa aguentar depois de colocar
const SNAP_HZ = 30;
const isTouch = matchMedia('(pointer: coarse)').matches;

// ---------------------------------------------------------------- estado
const S = {
  screen: 'title',
  mode: null,            // solo | local | online
  role: null,            // host | guest
  myId: 'me',
  players: [],           // {id, name, color, placed, gone}
  turn: 0,
  phase: 'title',        // title | play | carry | settle | wait | collapse | over
  seed: 1,
  settleT: 0, collapseT: 0, loser: null,
  snap: null,            // índice do lugar escolhido no topo
  slots: null,
  glint: null,
  moved: 0,
  name: store.get('nome', ''),
};
let tower = null, view = null;
const sfx = new Sfx();
sfx.on = store.get('som', true);
let host = null, guest = null;

const cur = () => S.players[S.turn];
const inGame = () => ['play', 'carry', 'settle', 'wait', 'collapse', 'over'].includes(S.phase);
const myTurn = () => S.mode !== 'online' || (cur() && cur().id === S.myId);
const isAuth = () => S.phase === 'title' || (inGame() && myTurn());

// ---------------------------------------------------------------- interface
function show(id) {
  S.screen = id;
  document.querySelectorAll('.screens > section').forEach((s) => { s.hidden = s.id !== 'scr-' + id; });
  const sec = $('#scr-' + id);
  if (sec) { const f = sec.querySelector('input, .btn.primary, .btn'); if (f && !isTouch) setTimeout(() => f.focus({ preventScroll: true }), 50); }
  if (id === 'title') renderRecord();
}
function hideScreens() { S.screen = null; document.querySelectorAll('.screens > section').forEach((s) => { s.hidden = true; }); $('#scene').focus({ preventScroll: true }); }

let toastT = 0;
function toast(msg, ms = 2400) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
}
function banner(big, small = '', color = '') {
  const b = $('#banner');
  b.innerHTML = ''; const s1 = document.createElement('span'); s1.textContent = big; b.append(s1);
  if (small) { const s2 = document.createElement('small'); s2.textContent = small; b.append(s2); }
  b.style.color = color || '';
  b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
}
let hintKey = '';
function hint(text, ring = null) {
  const key = text + (ring == null ? '' : Math.ceil(ring * 10));
  if (key === hintKey) return; hintKey = key;
  const h = $('#hintText');
  h.textContent = text;
  const old = $('#hint .ring'); if (old) old.remove();
  if (ring != null) {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.classList.add('ring');
    const c0 = document.createElementNS(ns, 'circle'), c1 = document.createElementNS(ns, 'circle');
    for (const c of [c0, c1]) { c.setAttribute('cx', 12); c.setAttribute('cy', 12); c.setAttribute('r', 9); c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', 3); }
    c0.setAttribute('stroke', 'rgba(255,255,255,.15)');
    c1.setAttribute('stroke', '#ffb45e'); c1.setAttribute('stroke-linecap', 'round');
    c1.setAttribute('stroke-dasharray', `${56.5 * ring} 56.5`); c1.setAttribute('transform', 'rotate(-90 12 12)');
    svg.append(c0, c1); $('#hint').prepend(svg);
  }
}
function renderPlayers() {
  const box = $('#players'); box.innerHTML = '';
  if (S.mode === 'solo') { box.hidden = true; return; }
  box.hidden = false;
  S.players.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'pchip' + (i === S.turn && inGame() ? ' on' : '') + (p.gone ? ' gone' : '');
    d.style.color = p.color;
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = p.color;
    const nm = document.createElement('span'); nm.className = 'nm'; nm.style.color = 'var(--ink)';
    nm.textContent = p.name + (S.mode === 'online' && p.id === S.myId ? ' (você)' : '');
    const ct = document.createElement('span'); ct.className = 'ct'; ct.textContent = p.placed;
    d.append(dot, nm, ct); box.append(d);
  });
}
function renderStats() {
  if (!tower) return;
  $('#stLayers').textContent = tower.topLayer() + 1;
  $('#stMoved').textContent = S.moved;
}
function renderRecord() {
  const r = store.get('recorde', 0);
  $('#record').innerHTML = r ? `Recorde sozinho: <b>${r}</b> ${r === 1 ? 'bloco' : 'blocos'}` : '';
}

// ---------------------------------------------------------------- torre
function newTower(seed, settle = true) {
  if (tower) tower.free();
  S.seed = seed;
  tower = new Tower(RAPIER, seed, { settle });
  view.buildBlocks(tower.dims, seed);
  view.setPoses(tower.writePoses(poseBuf));
  snaps.length = 0; resetFps();
  S.moved = 0; S.glint = null; S.snap = null; S.slots = null;
  renderStats();
}
const poseBuf = new Float32Array(N * 7);
const randSeed = () => (Math.random() * 2 ** 31) | 0;

// ---------------------------------------------------------------- partida
function startMatch(mode, players) {
  S.mode = mode;
  S.players = players.map((p, i) => ({ id: p.id, name: p.name, color: p.color || COLORS[i % COLORS.length], placed: 0, gone: false }));
  S.turn = 0;
  newTower(randSeed());
  beginGameUI();
  beginTurn();
}

function beginGameUI() {
  hideScreens();
  $('#hud').hidden = false;
  view.goal.dist = innerWidth / innerHeight < 0.8 ? 76 : 64; view.goal.ty = 12; view.goal.phi = 0.3;
  renderPlayers(); renderStats();
}

function beginTurn() {
  S.phase = 'play'; S.snap = null; S.slots = null;
  if (tower) tower.touched.clear();
  renderPlayers();
  const p = cur();
  if (S.mode === 'solo') {
    if (S.moved === 0) banner('Boa sorte!', 'Puxe um bloco solto');
  } else if (myTurn()) {
    banner(S.mode === 'local' ? p.name : 'Sua vez!', S.mode === 'local' ? 'É a sua vez' : 'Puxe um bloco solto', p.color);
    sfx.myTurn();
    if (navigator.vibrate) try { navigator.vibrate(30); } catch (e) { /* sem vibração */ }
  } else {
    banner('Vez de ' + p.name, '', p.color); sfx.turn();
  }
}

function beginCarry(i, fromTable = false) {
  tower.startCarry(i);
  S.phase = 'carry'; S.snap = null;
  sfx.pick();
  if (fromTable) toast('O bloco caiu na mesa, mas tudo bem: leve ao topo.');
  view.goal.ty = Math.max(view.goal.ty, tower.placementSlots().top - 2);
  drag.carryFromPull = drag.kind === 'block';
  if (drag.kind === 'block') drag.kind = 'carry';
}

function placeCarried() {
  if (S.phase !== 'carry' || S.snap == null || !S.slots) { if (S.phase === 'carry') toast('Leve o bloco até um lugar marcado no topo.'); return; }
  const sl = S.slots, s = sl.slots[S.snap], i = tower.held, d = tower.dims[i];
  const off = S.placeOff || { a: 0, p: 0 };
  const ax = { x: Math.cos(s.yaw), z: -Math.sin(s.yaw) }, px = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) };
  const pos = { x: s.x + ax.x * off.a + px.x * off.p, y: s.y + d.h / 2 + 0.05, z: s.z + ax.z * off.a + px.z * off.p };
  tower.place(pos, qyaw(s.yaw + (Math.random() - 0.5) * 0.01), sl.layer);
  S.phase = 'settle'; S.settleT = SETTLE; S.snap = null; S.slots = null;
  S.glint = { i, t: 1.4 };
  S.moved++;
  view.setGhosts(null);
  sfx.placed();
  renderStats();
}

function endTurn() {
  if (S.mode === 'online') {
    const st = tower.exportState();
    S.phase = 'wait';
    if (S.role === 'host') hostAdvance(st);
    else guest.send({ t: 'done', state: st });
    return;
  }
  cur().placed++;
  if (S.mode === 'solo') {
    const best = store.get('recorde', 0);
    if (S.moved > best) store.set('recorde', S.moved);
    sfx.ok();
  } else {
    S.turn = (S.turn + 1) % S.players.length;
  }
  beginTurn();
}

function collapse() {
  if (S.phase === 'collapse' || S.phase === 'over') return;
  if (tower.mode === 'grab') tower.release();
  if (tower.mode === 'carry') {
    const t = tower.bodies[tower.held].translation(), q = tower.bodies[tower.held].rotation();
    tower.place({ x: t.x, y: t.y, z: t.z }, { x: q.x, y: q.y, z: q.z, w: q.w }, -1);
  }
  drag.kind = null;
  S.phase = 'collapse'; S.collapseT = 0; S.loser = cur() ? cur().id : null;
  view.setGhosts(null);
  onCollapseFx();
  if (S.mode === 'online') {
    sendNet({ t: 'collapse', by: S.loser });
    if (S.role === 'host') scheduleOver();
  }
}

function onCollapseFx() {
  sfx.collapse();
  view.shake = 0.8;
  view.goal.dist = Math.min(150, view.goal.dist + 22); view.goal.ty = 9;
  if (navigator.vibrate) try { navigator.vibrate([60, 40, 120]); } catch (e) { /* sem vibração */ }
  const p = S.players.find((x) => x.id === S.loser);
  if (S.mode === 'solo') banner('Desabou!', '', '#ff8a6b');
  else if (p) banner(p.id === S.myId && S.mode === 'online' ? 'Você derrubou!' : p.name + ' derrubou!', '', p.color);
  hint('A torre caiu!');
  $('#tension').classList.remove('show');
}

function finishGame(loserId) {
  S.phase = 'over';
  const list = $('#overList'); list.innerHTML = '';
  const big = $('#overBig'); big.innerHTML = '';
  const loser = S.players.find((p) => p.id === loserId);
  $('#overNote').textContent = '';
  if (S.mode === 'solo') {
    const best = Math.max(store.get('recorde', 0), S.moved);
    store.set('recorde', best);
    $('#overTitle').textContent = 'A torre caiu!';
    $('#overSub').textContent = S.moved >= best && S.moved > 0 ? 'Novo recorde!' : `Seu recorde é ${best}.`;
    big.innerHTML = `<div class="big-num">${S.moved}</div><div class="big-cap">${S.moved === 1 ? 'bloco colocado' : 'blocos colocados'}</div>`;
  } else {
    $('#overTitle').textContent = loser ? `${loser.name} derrubou a torre` : 'A torre caiu!';
    $('#overSub').textContent = `A torre chegou a ${tower.topLayer() + 1} andares com ${S.moved} ${S.moved === 1 ? 'bloco movido' : 'blocos movidos'}.`;
    const sorted = S.players.slice().sort((a, b) => (a.id === loserId) - (b.id === loserId) || b.placed - a.placed);
    for (const p of sorted) {
      const li = document.createElement('li'); if (p.id === loserId) li.className = 'lose';
      const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = p.color;
      const nm = document.createElement('span'); nm.textContent = p.name + (p.id === loserId ? ' · derrubou' : '');
      const v = document.createElement('span'); v.className = 'v'; v.textContent = p.placed;
      li.append(dot, nm, v); list.append(li);
    }
  }
  const canAgain = S.mode !== 'online' || S.role === 'host';
  $('#again').hidden = !canAgain;
  if (!canAgain) $('#overNote').textContent = 'Esperando quem criou a sala começar outra…';
  setTimeout(() => { if (S.phase === 'over') show('over'); }, 300);
  $('#hud').hidden = true;
}

function toTitle() {
  closeNet();
  S.mode = null; S.phase = 'title'; S.players = []; drag.kind = null;
  $('#hud').hidden = true; view.setGhosts(null); view.setHand(null);
  newTower(randSeed());
  view.goal.dist = 70; view.goal.ty = 13; view.goal.phi = 0.28;
  show('title');
}

// ---------------------------------------------------------------- rede
function closeNet() {
  if (host) { host.close(); host = null; }
  if (guest) { guest.close(); guest = null; }
  S.role = null;
}
function sendNet(m) {
  if (S.role === 'host' && host) host.broadcast(m);
  else if (S.role === 'guest' && guest) guest.send(m);
}

function inviteLink(code) {
  const u = new URL(location.href);
  const i = u.pathname.indexOf('/games/torre-bamba/');
  if (i >= 0) return u.origin + u.pathname.slice(0, i) + '/play.html?g=torre-bamba#sala=' + code;
  return u.origin + u.pathname + '#sala=' + code;
}

async function createRoom() {
  show('lobby');
  $('#roomCode').textContent = '·····';
  $('#lobbyTitle').textContent = 'Abrindo a sala…';
  $('#lobbySub').textContent = 'Conectando ao servidor de pareamento.';
  $('#shareRow').hidden = true; $('#startOnline').hidden = true; $('#lobbyNote').textContent = '';
  closeNet();
  host = new Host();
  try { await host.open(); } catch (e) { $('#lobbyNote').textContent = friendlyNetError(e); $('#lobbyNote').classList.add('err'); $('#lobbyTitle').textContent = 'Não deu'; return; }
  S.mode = 'online'; S.role = 'host'; S.myId = 'host'; S.phase = 'lobby';
  S.players = [{ id: 'host', name: S.name || 'Anfitrião', color: COLORS[0], placed: 0 }];
  $('#roomCode').textContent = host.code;
  $('#lobbyTitle').textContent = 'Sala aberta';
  $('#lobbySub').textContent = 'Passe o código ou o link pros amigos entrarem. Dá pra jogar com até 8.';
  $('#shareRow').hidden = false; $('#startOnline').hidden = false;
  $('#shareLink').hidden = !navigator.share;
  $('#lobbyNote').classList.remove('err');
  renderLobby();
  host.on('msg', onHostMsg).on('leave', onHostLeave);
}

function renderLobby() {
  const ul = $('#lobbyList'); ul.innerHTML = '';
  for (const p of S.players) {
    const li = document.createElement('li');
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = p.color; dot.style.color = p.color;
    const nm = document.createElement('span'); nm.textContent = p.name;
    const tag = document.createElement('span'); tag.className = 'tag';
    tag.textContent = (p.id === 'host' ? 'criou a sala' : '') + (p.id === S.myId ? (p.id === 'host' ? ' · você' : 'você') : '');
    li.append(dot, nm, tag); ul.append(li);
  }
  if (S.role === 'host') {
    $('#lobbyNote').textContent = S.players.length < 2 ? 'Esperando os amigos… (dá pra começar sozinho também)' : `${S.players.length} na sala. Bora!`;
  }
}

function lobbyPayload() { return S.players.map((p) => ({ id: p.id, name: p.name, color: p.color, placed: p.placed, gone: !!p.gone })); }

function onHostMsg(id, m) {
  if (!m || typeof m !== 'object') return;
  const pl = S.players.find((p) => p.id === id);
  switch (m.t) {
    case 'hello': {
      if (S.phase !== 'lobby' && S.phase !== 'over') { host.send(id, { t: 'busy' }); setTimeout(() => host.kick(id), 300); return; }
      if (S.players.length >= 8) { host.send(id, { t: 'full' }); setTimeout(() => host.kick(id), 300); return; }
      if (pl) return;
      const used = new Set(S.players.map((p) => p.color));
      const color = COLORS.find((c) => !used.has(c)) || COLORS[S.players.length % COLORS.length];
      S.players.push({ id, name: String(m.name || 'Amigo').slice(0, 16), color, placed: 0 });
      host.broadcast({ t: 'lobby', players: lobbyPayload() });
      if (S.phase === 'lobby') renderLobby();
      toast(`${S.players[S.players.length - 1].name} entrou!`);
      sfx.click();
      break;
    }
    case 's': case 'collapse':
      if (!pl || cur() !== pl) return;
      host.broadcast(m, id);
      if (m.t === 's') onSnap(m); else onRemoteCollapse(m);
      break;
    case 'done':
      if (!pl || cur() !== pl || S.phase === 'collapse' || S.phase === 'over') return;
      hostAdvance(m.state);
      break;
  }
}

function onHostLeave(id) {
  const i = S.players.findIndex((p) => p.id === id);
  if (i < 0) return;
  const p = S.players[i];
  if (S.phase === 'lobby' || S.phase === 'over') {
    S.players.splice(i, 1);
    host.broadcast({ t: 'lobby', players: lobbyPayload() });
    if (S.phase === 'lobby') renderLobby();
    toast(`${p.name} saiu.`);
    return;
  }
  p.gone = true;
  toast(`${p.name} saiu da partida.`);
  if (i === S.turn && (S.phase === 'play' || S.phase === 'carry' || S.phase === 'settle' || S.phase === 'wait')) {
    // assume a vez com o último estado recebido e passa adiante
    const st = stateFromLastSnap();
    hostAdvance(st, true);
  } else {
    host.broadcast({ t: 'lobby', players: lobbyPayload() });
    renderPlayers();
  }
  if (S.players.every((x) => x.gone || x.id === 'host') && S.players.length > 1) toast('Só sobrou você na sala. Dá pra continuar treinando.');
}

function stateFromLastSnap() {
  const last = snaps[snaps.length - 1];
  const st = tower.exportState();
  if (last) {
    st.poses = Array.from(last.p);
    st.vels = null;
    // bloco que estava na mão volta pro topo, no primeiro lugar livre
    if (last.h >= 0 && last.m === 'carry') {
      tower.importState(st);
      tower.startCarry(last.h);
      const sl = tower.placementSlots(), s = sl.slots[0];
      if (s) tower.place({ x: s.x, y: s.y + tower.dims[last.h].h / 2 + 0.02, z: s.z }, qyaw(s.yaw), sl.layer);
      for (let k = 0; k < 120; k++) tower.step(1 / 60);
      return tower.exportState();
    }
  }
  return st;
}

function hostAdvance(state, skipPlaced = false) {
  const p = cur();
  if (p && !skipPlaced) p.placed++;
  let n = S.turn;
  for (let k = 0; k < S.players.length; k++) { n = (n + 1) % S.players.length; if (!S.players[n].gone) break; }
  S.turn = n;
  host.broadcast({ t: 'turn', turn: n, players: lobbyPayload(), state });
  applyTurn(state);
}

function applyTurn(state) {
  tower.importState(state);
  view.setPoses(tower.writePoses(poseBuf));
  snaps.length = 0;
  S.moved = S.players.reduce((a, p) => a + (p.placed || 0), 0);
  renderStats();
  beginTurn();
}

let overTimer = 0;
function scheduleOver() {
  clearTimeout(overTimer);
  overTimer = setTimeout(() => {
    host.broadcast({ t: 'over', loser: S.loser, players: lobbyPayload() });
    finishGame(S.loser);
  }, 4300);
}

function onRemoteCollapse(m) {
  if (S.phase === 'collapse' || S.phase === 'over') return;
  S.phase = 'collapse'; S.loser = m.by; S.collapseT = 0;
  onCollapseFx();
  if (S.role === 'host') scheduleOver();
}

function startOnline() {
  if (S.role !== 'host') return;
  S.players = S.players.filter((p) => !p.gone);
  S.players.forEach((p) => { p.placed = 0; });
  S.turn = 0;
  newTower(randSeed());
  host.broadcast({ t: 'start', seed: S.seed, players: lobbyPayload(), turn: 0, state: tower.exportState() });
  beginGameUI();
  beginTurn();
}

async function joinRoom(code) {
  const note = $('#joinNote');
  note.classList.remove('err');
  if (code.length !== 5) { note.textContent = 'O código tem 5 letras.'; note.classList.add('err'); return; }
  note.textContent = 'Conectando…';
  $('#joinBtn').disabled = true;
  closeNet();
  guest = new Guest();
  try { await guest.join(code); } catch (e) {
    note.textContent = friendlyNetError(e); note.classList.add('err'); $('#joinBtn').disabled = false; closeNet(); return;
  }
  $('#joinBtn').disabled = false;
  S.mode = 'online'; S.role = 'guest'; S.myId = guest.peer.id; S.phase = 'lobby';
  guest.on('msg', onGuestMsg);
  guest.on('lost', () => { if (S.mode === 'online') { toTitle(); toast('A conexão com a sala caiu.', 3500); } });
  guest.send({ t: 'hello', name: S.name || 'Amigo' });
  show('lobby');
  $('#roomCode').textContent = code;
  $('#lobbyTitle').textContent = 'Na sala';
  $('#lobbySub').textContent = 'Esperando quem criou a sala começar a partida.';
  $('#shareRow').hidden = true; $('#startOnline').hidden = true;
  $('#lobbyNote').textContent = '';
  S.players = [];
  renderLobby();
}

function onGuestMsg(m) {
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'lobby':
      S.players = m.players;
      if (S.phase === 'lobby') renderLobby(); else renderPlayers();
      break;
    case 'busy': toTitle(); toast('Essa sala já está no meio de uma partida.', 3500); break;
    case 'full': toTitle(); toast('A sala está cheia.', 3500); break;
    case 'start':
      S.players = m.players; S.turn = m.turn;
      newTower(m.seed, false);
      tower.importState(m.state);
      view.setPoses(tower.writePoses(poseBuf));
      beginGameUI();
      beginTurn();
      break;
    case 'turn':
      S.players = m.players; S.turn = m.turn;
      applyTurn(m.state);
      break;
    case 's': onSnap(m); break;
    case 'collapse': onRemoteCollapse(m); break;
    case 'over':
      S.players = m.players;
      finishGame(m.loser);
      break;
  }
}

// ---------- transmissão e interpolação das poses
const snaps = [];
let sendAcc = 0, pendingHits = [];
function sendSnap(dt) {
  sendAcc += dt;
  if (sendAcc < 1 / SNAP_HZ) return;
  sendAcc = 0;
  const p = tower.writePoses(new Float32Array(N * 7));
  const gp = tower.grabPointWorld();
  const m = {
    t: 's', p: p.buffer, h: tower.held, m: tower.mode, ph: S.phase, st: S.settleT,
    ten: +tower.tension.toFixed(3), sl: +tower.slide.toFixed(3),
    gp: gp && tower.mode === 'grab' ? [gp.x, gp.y, gp.z] : null,
    tg: tower.target && tower.mode === 'grab' ? [tower.target.x, tower.target.y, tower.target.z] : null,
    hits: pendingHits, ly: tower.layer,
  };
  if (S.phase === 'carry' && S.slots) m.gh = { slots: S.slots.slots.map((s) => [s.x, s.y, s.z, s.yaw]), a: S.snap };
  pendingHits = [];
  sendNet(m);
}

function onSnap(m) {
  if (isAuth()) return;
  const p = new Float32Array(m.p instanceof ArrayBuffer ? m.p : (m.p.buffer || m.p));
  snaps.push({ time: performance.now(), p, h: m.h, m: m.m, ph: m.ph, st: m.st, ten: m.ten, sl: m.sl, gp: m.gp, tg: m.tg, gh: m.gh });
  while (snaps.length > 12) snaps.shift();
  if (m.hits) for (const [i, k] of m.hits) playHit(i, k, p);
  if (m.ly && m.ly.length === N) for (let i = 0; i < N; i++) tower.layer[i] = m.ly[i];
  if (m.ph === 'settle' && S.phase !== 'settle' && S.phase !== 'collapse') { sfx.placed(); S.glint = { i: lastHeld, t: 1.4 }; }
  if (m.m === 'carry' && lastMode !== 'carry') sfx.pick();
  lastMode = m.m; if (m.h >= 0) lastHeld = m.h;
  if (S.phase !== 'collapse' && S.phase !== 'over' && ['play', 'carry', 'settle'].includes(m.ph)) S.phase = m.ph;
}
let lastMode = 'idle', lastHeld = -1;

const interp = new Float32Array(N * 7);
function observerTick() {
  if (!snaps.length) return null;
  const rt = performance.now() - 90;
  let a = snaps[0], b = snaps[snaps.length - 1];
  for (let k = snaps.length - 1; k > 0; k--) if (snaps[k - 1].time <= rt) { a = snaps[k - 1]; b = snaps[k]; break; }
  const span = b.time - a.time;
  const t = span > 0 ? Math.max(0, Math.min(1, (rt - a.time) / span)) : 1;
  for (let i = 0; i < N; i++) {
    const j = i * 7;
    for (let c = 0; c < 3; c++) interp[j + c] = a.p[j + c] + (b.p[j + c] - a.p[j + c]) * t;
    let d = 0; for (let c = 3; c < 7; c++) d += a.p[j + c] * b.p[j + c];
    const s = d < 0 ? -1 : 1;
    let x = a.p[j + 3] + (s * b.p[j + 3] - a.p[j + 3]) * t, y = a.p[j + 4] + (s * b.p[j + 4] - a.p[j + 4]) * t;
    let z = a.p[j + 5] + (s * b.p[j + 5] - a.p[j + 5]) * t, w = a.p[j + 6] + (s * b.p[j + 6] - a.p[j + 6]) * t;
    const n = Math.hypot(x, y, z, w) || 1;
    interp[j + 3] = x / n; interp[j + 4] = y / n; interp[j + 5] = z / n; interp[j + 6] = w / n;
  }
  view.setPoses(interp);
  return b;
}

function playHit(i, k, poses) {
  const j = i * 7;
  const p = { x: poses[j], y: poses[j + 1], z: poses[j + 2] };
  const sp = view.toScreen(p);
  sfx.knock(k, (sp.x / innerWidth) * 2 - 1, p.y < 2.2, (i * 0.618) % 1);
}

// ---------------------------------------------------------------- entrada
const ptr = { nx: 0, ny: 0, x: 0, y: 0, has: false };
const drag = { kind: null, id: null, x: 0, y: 0, grab0: null, planeY: 0, carryFromPull: false, moved: 0, button: 0 };
const touches = new Map();
let pinch = null;
let hover = -1;

function setPtr(e) {
  ptr.x = e.clientX; ptr.y = e.clientY; ptr.has = true;
  ptr.nx = (e.clientX / innerWidth) * 2 - 1; ptr.ny = -(e.clientY / innerHeight) * 2 + 1;
}

const cv = $('#scene');
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  cv.focus({ preventScroll: true });
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      // dois dedos: zoom e altura (solta o que estiver puxando)
      if (drag.kind === 'block') tower.release();
      drag.kind = 'pinch'; drag.id = null;
      const [p1, p2] = [...touches.values()];
      pinch = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), y: (p1.y + p2.y) / 2, x: (p1.x + p2.x) / 2 };
      return;
    }
    if (touches.size > 2) return;
  }
  setPtr(e);
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* sem captura */ }
  drag.id = e.pointerId; drag.x = e.clientX; drag.y = e.clientY; drag.moved = 0; drag.button = e.button;
  drag.carryFromPull = false;
  if (e.button === 2 || e.button === 1) { drag.kind = 'pan'; return; }
  const mine = inGame() && myTurn() && isAuth();
  if (mine && S.phase === 'play') {
    const hit = view.pick(ptr.nx, ptr.ny);
    if (hit && tower.layer[hit.i] >= 0) {
      if (tower.isForbidden(hit.i)) {
        toast('Não vale mexer na última camada completa nem acima dela.');
        drag.kind = 'orbit'; return;
      }
      tower.grab(hit.i, hit.point);
      drag.kind = 'block'; drag.grab0 = hit.point.clone(); drag.planeY = hit.point.y;
      view.goal.ty = view.goal.ty + (hit.point.y - view.goal.ty) * 0.6;
      cv.classList.add('grabbing');
      return;
    }
  }
  if (mine && S.phase === 'carry') { drag.kind = 'carry'; return; }
  drag.kind = 'orbit';
  cv.classList.add('grabbing');
});

cv.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (drag.kind === 'pinch') {
    if (touches.size < 2) return;
    const [p1, p2] = [...touches.values()];
    const d = Math.hypot(p1.x - p2.x, p1.y - p2.y), y = (p1.y + p2.y) / 2, x = (p1.x + p2.x) / 2;
    view.goal.dist *= pinch.d / Math.max(10, d);
    view.goal.ty += (y - pinch.y) * 0.06;
    view.goal.theta -= (x - pinch.x) * 0.006;
    pinch = { d, y, x };
    return;
  }
  if (drag.id != null && e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  if (drag.kind) drag.moved += Math.abs(dx) + Math.abs(dy);
  // carregando com o mouse: arrastar gira a câmera (o bloco espera), clicar coloca
  const carryOrbit = drag.kind === 'carry' && e.pointerType === 'mouse' && !drag.carryFromPull && drag.moved > 6;
  if (!carryOrbit) setPtr(e);
  if (drag.kind === 'orbit' || carryOrbit) {
    view.goal.theta -= dx * 0.0065;
    view.goal.phi += dy * 0.0045;
  } else if (drag.kind === 'pan') {
    view.goal.ty += dy * 0.06;
  }
});

function endPointer(e) {
  if (e.pointerType === 'touch') {
    touches.delete(e.pointerId);
    if (drag.kind === 'pinch') { if (touches.size === 0) { drag.kind = null; drag.id = null; pinch = null; } return; }
  }
  if (drag.id != null && e.pointerId !== drag.id) return;
  const k = drag.kind;
  drag.kind = null; drag.id = null;
  cv.classList.remove('grabbing');
  if (k === 'block' && tower && tower.mode === 'grab') tower.release();
  if (k === 'carry' && !drag.carryFromPull && S.phase === 'carry' && (e.pointerType !== 'mouse' || drag.moved <= 6)) placeCarried();
  drag.carryFromPull = false;
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') ptr.has = drag.kind != null; });

cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.shiftKey) view.goal.ty -= e.deltaY * 0.02;
  else view.goal.dist *= Math.exp(e.deltaY * 0.0011);
}, { passive: false });

addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') { if (e.key === 'Enter') e.target.dispatchEvent(new Event('enter')); return; }
  sfx.unlock();
  const g = view.goal;
  switch (e.key) {
    case 'ArrowLeft': case 'a': case 'A': g.theta += 0.12; break;
    case 'ArrowRight': case 'd': case 'D': g.theta -= 0.12; break;
    case 'ArrowUp': g.phi += 0.08; break;
    case 'ArrowDown': g.phi -= 0.08; break;
    case 'w': case 'W': case 'PageUp': g.ty += 1.5; break;
    case 's': case 'S': case 'PageDown': g.ty -= 1.5; break;
    case '+': case '=': g.dist *= 0.9; break;
    case '-': case '_': g.dist *= 1.1; break;
    case 'c': case 'C': resetCam(); break;
    case 'm': case 'M': toggleSound(); break;
    case ' ': case 'Enter':
      if (S.phase === 'carry' && myTurn()) { e.preventDefault(); placeCarried(); }
      break;
    default: return;
  }
});

function resetCam() {
  const top = tower ? tower.placementSlots().top || 26 : 26;
  view.goal.ty = top * 0.45; view.goal.dist = innerWidth / innerHeight < 0.8 ? 76 : 64; view.goal.phi = 0.3;
}
function toggleSound() {
  sfx.setOn(!sfx.on); store.set('som', sfx.on);
  $('#icoSound').innerHTML = sfx.on ? '<path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>' : '<path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M17 9l5 5M22 9l-5 5"/>';
  toast(sfx.on ? 'Som ligado' : 'Som desligado', 1200);
  syncOpts();
}

// ---------------------------------------------------------------- jogo por quadro
function authorityTick(dt) {
  // alvo da mão: plano horizontal na altura onde o bloco foi pego
  if (tower.mode === 'grab' && drag.kind === 'block') {
    const p = view.rayPlaneY(ptr.nx, ptr.ny, drag.planeY);
    if (p) {
      const g0 = drag.grab0;
      let dx = p.x - g0.x, dz = p.z - g0.z;
      const i = tower.held, t = tower.bodies[i].translation();
      const c = tower.layerCenter(tower.layer[i], i);
      if (Math.hypot(t.x - c.x, t.z - c.z) < 4.4) {
        // dentro da torre o bloco corre no próprio trilho: o movimento de lado vale pouco
        const ax = qrot(tower.bodies[i].rotation(), { x: 1, y: 0, z: 0 });
        const al = Math.hypot(ax.x, ax.z) || 1, ux = ax.x / al, uz = ax.z / al;
        const along = dx * ux + dz * uz, px = dx - along * ux, pz = dz - along * uz;
        dx = along * ux + px * 0.3; dz = along * uz + pz * 0.3;
      }
      const dl = Math.hypot(dx, dz), mx = 15;
      if (dl > mx) { dx *= mx / dl; dz *= mx / dl; }
      tower.setTarget({ x: g0.x + dx, y: drag.planeY, z: g0.z + dz });
    }
  }
  if (tower.mode === 'carry') updateCarry();

  let ts = 1;
  if (S.phase === 'collapse') ts = S.collapseT < 1.4 ? 0.38 : Math.min(1, 0.38 + (S.collapseT - 1.4) * 0.6);
  tower.step(dt, ts);
  view.setPoses(tower.writePoses(poseBuf));
  for (const [i, k] of tower.hits) { playHit(i, k, poseBuf); if (S.mode === 'online') pendingHits.push([i, +k.toFixed(2)]); }
  tower.hits.length = 0;
  if (pendingHits.length > 40) pendingHits.splice(0, pendingHits.length - 40);

  if (S.phase === 'title') return;

  if (S.phase === 'play' && tower.mode === 'grab' && tower.outT > 0.12) beginCarry(tower.held);

  if (S.phase === 'play' || S.phase === 'carry' || S.phase === 'settle') {
    const f = tower.fallen();
    if (f.length) {
      if (S.phase === 'play' && f.length === 1 && tower.touched.has(f[0]) && tower.mode !== 'carry') {
        // o bloco que você mexeu escorregou pra mesa: ele é o bloco desta vez
        if (tower.mode === 'grab') tower.release();
        beginCarry(f[0], true);
      } else collapse();
    }
  }
  if (S.phase === 'settle') {
    S.settleT -= dt;
    if ((S.settleT <= 0 && tower.maxSpeed() < 1.5) || S.settleT < -4) endTurn();
  }
  if (S.phase === 'collapse') {
    S.collapseT += dt;
    if (S.collapseT > 4.2 && S.mode !== 'online') finishGame(S.loser);
  }
  if (S.mode === 'online' && S.phase !== 'wait') sendSnap(dt);
}

function updateCarry() {
  const i = tower.held, d = tower.dims[i];
  const sl = S.slots = tower.placementSlots();
  if (!sl.slots.length || !isFinite(sl.top)) return;
  const carryY = sl.top + 3.4;
  S.snap = null; S.placeOff = null;
  let goal = null;
  const p = ptr.has ? view.rayPlaneY(ptr.nx, ptr.ny, carryY) : null;
  if (p) {
    let best = 3.4;
    sl.slots.forEach((s, k) => { const dd = Math.hypot(p.x - s.x, p.z - s.z); if (dd < best) { best = dd; S.snap = k; } });
    if (S.snap != null) {
      const s = sl.slots[S.snap];
      const ax = { x: Math.cos(s.yaw), z: -Math.sin(s.yaw) }, px = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) };
      const dx = p.x - s.x, dz = p.z - s.z;
      const a = Math.max(-0.6, Math.min(0.6, (dx * ax.x + dz * ax.z) * 0.35));
      const pp = Math.max(-0.12, Math.min(0.12, (dx * px.x + dz * px.z) * 0.1));
      S.placeOff = { a, p: pp };
      goal = { x: s.x + ax.x * a + px.x * pp, y: s.y + d.h / 2 + 0.7, z: s.z + ax.z * a + px.z * pp };
    } else {
      const dl = Math.hypot(p.x, p.z), mx = 30;
      goal = dl > mx ? { x: p.x * mx / dl, y: carryY, z: p.z * mx / dl } : { x: p.x, y: carryY, z: p.z };
    }
  }
  if (!goal) { const t = tower.carryPos; goal = { x: t.x, y: carryY, z: t.z }; }
  tower.setCarryGoal(goal, qyaw(S.snap != null ? sl.slots[S.snap].yaw : sl.yaw));
  view.setGhosts(sl.slots, d, S.snap);
}

let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0, fpsBad = 0;
function resetFps() { fpsAcc = 0; fpsN = 0; fpsT = 0; }
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now;
  const dt = Math.min(0.05, raw);
  if (!tower) return;
  let obs = null;
  if (isAuth()) authorityTick(dt);
  else obs = observerTick();

  // mão, brilho, HUD
  for (let i = 0; i < N; i++) view.glow(i, null, 0);
  const color = cur() ? cur().color : '#ffffff';
  if (isAuth() && inGame()) {
    if (tower.mode === 'grab') {
      view.setHand(tower.grabPointWorld(), tower.target, tower.tension, color);
      view.glow(tower.held, color, 0.3 + tower.tension * 0.4);
    } else view.setHand(null);
    if (tower.mode === 'carry') view.glow(tower.held, color, 0.5 + 0.2 * Math.sin(now / 160));
    if (S.phase === 'play' && drag.kind == null && !isTouch && ptr.has) {
      const h = view.pick(ptr.nx, ptr.ny);
      hover = h && tower.layer[h.i] >= 0 ? h.i : -1;
      if (hover >= 0) view.glow(hover, tower.isForbidden(hover) ? '#ff3b30' : '#ffc870', tower.isForbidden(hover) ? 0.5 : 0.45);
      cv.classList.toggle('pointing', hover >= 0 && !tower.isForbidden(hover));
      cv.classList.toggle('nope', hover >= 0 && tower.isForbidden(hover));
    } else { cv.classList.remove('pointing', 'nope'); }
    tensionUI(tower.mode === 'grab', tower.tension);
    sfx.friction(tower.mode === 'grab' ? tower.slide * Math.min(1, 0.3 + tower.tension) : 0, tower.mode === 'grab' ? tower.tension : 0);
  } else if (obs) {
    if (obs.gp) view.setHand({ x: obs.gp[0], y: obs.gp[1], z: obs.gp[2] }, obs.tg && { x: obs.tg[0], y: obs.tg[1], z: obs.tg[2] }, obs.ten, color);
    else view.setHand(null);
    if (obs.h >= 0) view.glow(obs.h, color, obs.m === 'carry' ? 0.5 : 0.5 + obs.ten * 0.5);
    if (obs.gh && obs.h >= 0) view.setGhosts(obs.gh.slots.map((s) => ({ x: s[0], y: s[1], z: s[2], yaw: s[3] })), tower.dims[obs.h], obs.gh.a);
    else view.setGhosts(null);
    tensionUI(obs.m === 'grab', obs.ten);
    sfx.friction(obs.m === 'grab' ? obs.sl : 0, obs.m === 'grab' ? obs.ten : 0);
    // câmera de quem assiste acompanha a altura da mão
    if (obs.gp && drag.kind == null) view.goal.ty += (obs.gp[1] - view.goal.ty) * Math.min(1, dt * 1.5);
    if (S.phase === 'settle') S.settleT = obs.st;
  } else { view.setHand(null); tensionUI(false, 0); sfx.friction(0, 0); }

  // foco da profundidade de campo: o bloco na mão, senão o centro da torre
  let fp = null;
  if (isAuth() && inGame() && tower.held >= 0) fp = tower.mode === 'grab' ? tower.grabPointWorld() : tower.carryPos;
  else if (obs && obs.h >= 0) { const j = obs.h * 7; fp = { x: interp[j], y: interp[j + 1], z: interp[j + 2] }; }
  view.focusPoint = fp;

  if (S.glint) {
    S.glint.t -= dt;
    if (S.glint.t <= 0 || S.glint.i < 0) S.glint = null;
    else view.glow(S.glint.i, '#fff1c9', Math.min(1, S.glint.t) * 0.9);
  }
  if (S.phase === 'title') view.goal.theta += dt * 0.07;
  if (inGame()) hintFor();

  view.update(dt);
  view.render();

  // qualidade automática se o aparelho não aguentar
  // (pausas longas, como aba escondida, não contam; precisa de duas janelas ruins seguidas)
  if (inGame() && raw < 1 && !store.get('qualidade', null)) {
    fpsT += raw; fpsAcc += raw; fpsN++;
    if (fpsT > 3) {
      const avg = fpsAcc / fpsN;
      fpsBad = avg > 1 / 34 ? fpsBad + 1 : 0;
      if (fpsBad >= 2 && view.quality !== 'baixa') {
        const nq = view.quality === 'alta' ? 'media' : 'baixa';
        view.setQuality(nq); syncOpts(); fpsBad = 0;
        toast('Gráficos ajustados pra rodar liso.', 1800);
      }
      resetFps();
    }
  }
}

let tenShown = false;
function tensionUI(on, t) {
  if (on !== tenShown) { $('#tension').classList.toggle('show', on); tenShown = on; }
  if (!on) return;
  $('#tensionFill').style.width = Math.min(100, 6 + t * 94) + '%';
  $('#tensionLab').textContent = t < 0.3 ? 'solto' : t < 0.75 ? 'firme' : 'preso!';
  if (t > 0.85 && navigator.vibrate && Math.random() < 0.05) try { navigator.vibrate(8); } catch (e) { /* sem vibração */ }
}

function hintFor() {
  const p = cur();
  const name = p ? p.name : '';
  if (S.phase === 'collapse' || S.phase === 'over') return;
  if (S.phase === 'wait') return hint('Passando a vez…');
  if (!myTurn()) {
    if (S.phase === 'carry') return hint(`${name} está levando o bloco ao topo`);
    if (S.phase === 'settle') return hint(`Segurando… ${Math.max(0, Math.ceil(S.settleT))}`, Math.max(0, S.settleT / SETTLE));
    return hint(`${name} está escolhendo um bloco`);
  }
  if (S.phase === 'play') {
    if (tower.mode === 'grab') return hint(tower.tension > 0.75 ? 'Está preso! Tente outro bloco' : 'Puxe com calma…');
    return hint(isTouch ? 'Toque num bloco e arraste pra puxar' : 'Segure um bloco e arraste pra puxar ou empurrar');
  }
  if (S.phase === 'carry') return hint(S.snap != null ? (isTouch ? 'Solte pra colocar' : 'Clique pra colocar') : 'Leve o bloco até um lugar no topo');
  if (S.phase === 'settle') return hint(`Segurando… ${Math.max(0, Math.ceil(S.settleT))}`, Math.max(0, S.settleT / SETTLE));
}

// ---------------------------------------------------------------- telas e botões
let afterName = null;
function needName(then) {
  if (S.name) return then();
  afterName = then; show('name');
  $('#nameInput').value = '';
}
$('#nameOk').addEventListener('click', () => {
  const v = $('#nameInput').value.trim().slice(0, 16);
  if (!v) { $('#nameInput').focus(); return; }
  S.name = v; store.set('nome', v); syncOpts();
  const f = afterName; afterName = null; if (f) f();
});
$('#nameInput').addEventListener('enter', () => $('#nameOk').click());

let localPlayers = store.get('locais', null) || [{ name: 'Jogador 1' }, { name: 'Jogador 2' }];
function renderLocal() {
  const ul = $('#localList'); ul.innerHTML = '';
  localPlayers.forEach((p, i) => {
    const li = document.createElement('li');
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = COLORS[i % COLORS.length]; dot.style.color = COLORS[i % COLORS.length];
    const inp = document.createElement('input'); inp.value = p.name; inp.maxLength = 16; inp.setAttribute('aria-label', 'Nome do jogador ' + (i + 1));
    inp.addEventListener('input', () => { p.name = inp.value; store.set('locais', localPlayers); });
    li.append(dot, inp);
    if (localPlayers.length > 2) {
      const x = document.createElement('button'); x.textContent = '×'; x.setAttribute('aria-label', 'Remover');
      x.addEventListener('click', () => { localPlayers.splice(i, 1); store.set('locais', localPlayers); renderLocal(); });
      li.append(x);
    }
    ul.append(li);
  });
  $('#addLocal').disabled = localPlayers.length >= 8;
}
$('#addLocal').addEventListener('click', () => { localPlayers.push({ name: 'Jogador ' + (localPlayers.length + 1) }); store.set('locais', localPlayers); renderLocal(); });
$('#startLocal').addEventListener('click', () => {
  sfx.unlock(); sfx.click();
  startMatch('local', localPlayers.map((p, i) => ({ id: 'L' + i, name: (p.name || '').trim() || 'Jogador ' + (i + 1) })));
});

document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
  sfx.unlock(); sfx.click();
  const g = b.dataset.go;
  if (g === 'solo') startMatch('solo', [{ id: 'me', name: S.name || 'Você' }]);
  else if (g === 'create') needName(createRoom);
  else if (g === 'join') needName(() => { show('join'); $('#joinNote').textContent = ''; });
  else if (g === 'local') { renderLocal(); show('local'); }
  else show(g);
}));
$('#joinBtn').addEventListener('click', () => joinRoom(normalizeCode($('#joinCode').value)));
$('#joinCode').addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value); });
$('#joinCode').addEventListener('enter', () => $('#joinBtn').click());
$('#startOnline').addEventListener('click', () => { sfx.click(); startOnline(); });
$('#leaveLobby').addEventListener('click', () => { sfx.click(); toTitle(); });
$('#copyLink').addEventListener('click', async () => {
  const link = inviteLink(host.code);
  try { await navigator.clipboard.writeText(link); toast('Link copiado!'); } catch (e) { toast(link, 5000); }
});
$('#shareLink').addEventListener('click', () => { navigator.share({ title: 'Torre Bamba', text: 'Bora jogar Torre Bamba? Sala ' + host.code, url: inviteLink(host.code) }).catch(() => {}); });

$('#again').addEventListener('click', () => {
  sfx.click();
  if (S.mode === 'online') { if (S.role === 'host') startOnline(); return; }
  startMatch(S.mode, S.players.map((p) => ({ id: p.id, name: p.name, color: p.color })));
});
$('#toMenu').addEventListener('click', () => { sfx.click(); toTitle(); });
$('#btnCam').addEventListener('click', () => { resetCam(); cv.focus(); });
$('#btnSound').addEventListener('click', () => { sfx.unlock(); toggleSound(); });
$('#btnQuit').addEventListener('click', () => {
  $('#quitSub').textContent = S.mode === 'online' ? (S.role === 'host' ? 'A sala fecha pra todo mundo.' : 'Você sai da sala.') : 'A partida atual termina aqui.';
  show('quit');
});
$('#quitNo').addEventListener('click', () => hideScreens());
$('#quitYes').addEventListener('click', () => toTitle());

function syncOpts() {
  document.querySelectorAll('#segQuality button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === view.quality)));
  document.querySelectorAll('#segSound button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.s === '1') === sfx.on)));
  $('#nameOpt').value = S.name;
}
document.querySelectorAll('#segQuality button').forEach((b) => b.addEventListener('click', () => {
  store.set('qualidade', b.dataset.q); view.setQuality(b.dataset.q); syncOpts(); sfx.click();
}));
document.querySelectorAll('#segSound button').forEach((b) => b.addEventListener('click', () => {
  sfx.unlock(); sfx.setOn(b.dataset.s === '1'); store.set('som', sfx.on); syncOpts(); sfx.click();
}));
$('#nameOpt').addEventListener('input', (e) => { S.name = e.target.value.trim().slice(0, 16); store.set('nome', S.name); });

// ---------------------------------------------------------------- início
async function boot() {
  try {
    await RAPIER.init();
  } catch (e) {
    $('#loadMsg').textContent = 'Não deu pra carregar a física. Confira a internet e recarregue.';
    return;
  }
  const q = store.get('qualidade', null) || (isTouch ? 'media' : 'alta');
  view = new View(cv, q);
  syncOpts();
  if (!sfx.on) $('#icoSound').innerHTML = '<path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M17 9l5 5M22 9l-5 5"/>';
  newTower(randSeed());
  view.goal.dist = 70; view.goal.ty = 13; view.goal.phi = 0.28;
  view.orbit = { theta: 0.2, phi: 0.5, dist: 110, ty: 20 };
  requestAnimationFrame(frame);
  setTimeout(() => $('#loading').classList.add('out'), 250);

  const hs = new URLSearchParams(location.hash.slice(1)), qs = new URLSearchParams(location.search);
  const sala = normalizeCode(hs.get('sala') || qs.get('sala'));
  if (sala.length === 5) {
    needName(() => { show('join'); $('#joinCode').value = sala; joinRoom(sala); });
  } else show('title');
}
boot();
// acesso pra depurar no console: __tb.tower, __tb.view, __tb.S
window.__tb = { get view() { return view; }, get tower() { return tower; }, S };

// aba escondida: quem está com a vez avisa que a simulação pausa
document.addEventListener('visibilitychange', () => { last = performance.now(); resetFps(); });
