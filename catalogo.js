// Fliperama · catálogo
// Monta as cartas a partir de games.js, com busca em tempo real, filtros, ordem,
// abertura animada e navegação por controle. Visual e movimento seguem o DESIGN.md.
(() => {
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const data = window.FLIPERAMA;
  const games = data ? data.games : [];

  // ---------- texto ----------
  const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // versão "dobrada" (sem acento, minúscula) com o índice de cada letra no texto original
  function foldMap(s) {
    let out = ''; const map = [];
    for (let i = 0; i < s.length; i++) for (const ch of fold(s[i])) { out += ch; map.push(i); }
    return { out, map };
  }
  // escreve o texto em el marcando os termos buscados com <mark>
  function paint(el, text, terms) {
    el.textContent = '';
    if (!terms.length) { el.textContent = text; return; }
    const { out, map } = foldMap(text);
    const hits = [];
    for (const t of terms) for (let i = out.indexOf(t); i !== -1; i = out.indexOf(t, i + t.length)) hits.push([map[i], map[i + t.length - 1] + 1]);
    if (!hits.length) { el.textContent = text; return; }
    hits.sort((a, b) => a[0] - b[0]);
    const merged = [hits[0]];
    for (const h of hits.slice(1)) { const last = merged[merged.length - 1]; if (h[0] <= last[1]) last[1] = Math.max(last[1], h[1]); else merged.push(h); }
    let pos = 0;
    for (const [a, b] of merged) {
      if (a > pos) el.append(text.slice(pos, a));
      const m = document.createElement('mark'); m.textContent = text.slice(a, b); el.append(m);
      pos = b;
    }
    if (pos < text.length) el.append(text.slice(pos));
  }
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  function ago(iso) {
    const s = (new Date(iso) - Date.now()) / 1000;
    for (const [u, v] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]])
      if (Math.abs(s) >= v) return rtf.format(Math.round(s / v), u);
    return 'agora';
  }
  const range = p => { const m = String(p || '1').match(/(\d+)(?:\s*[-–]\s*(\d+))?/); return m ? [+m[1], +(m[2] || m[1])] : [1, 1]; };
  const playersText = p => { const [a, b] = range(p); return a === b ? `${a} ${a === 1 ? 'jogador' : 'jogadores'}` : `${a}–${b} jogadores`; };
  const isNew = iso => !!iso && Date.now() - new Date(iso) < 7 * 864e5;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const playUrl = (g, v) => 'play.html?g=' + encodeURIComponent(g.slug) + (v ? '&v=' + encodeURIComponent(v.id) : '');

  // modos de filtro (a carta precisa ter todos os marcados)
  const MODES = [
    { id: 'sozinho', label: 'Dá pra jogar sozinho', test: g => range(g.players)[0] === 1 },
    { id: 'multi', label: 'Multijogador', test: g => range(g.players)[1] > 1 },
    { id: 'online', label: 'Online', test: g => !!g.online },
  ];
  const SORTS = {
    updated: (a, b) => b.updated.localeCompare(a.updated),
    created: (a, b) => b.created.localeCompare(a.created),
    title: (a, b) => a.title.localeCompare(b.title, 'pt-BR'),
    players: (a, b) => range(b.players)[1] - range(a.players)[1] || a.title.localeCompare(b.title, 'pt-BR'),
  };

  // ---------- estado ----------
  const state = { q: '', sort: 'updated', modes: new Set(), tags: new Set(), author: null };
  try { const s = localStorage.getItem('fliperama:ordem'); if (SORTS[s]) state.sort = s; } catch (e) {}
  const VKEY = 'fliperama:versoes';
  let chosen = {};
  try { chosen = JSON.parse(localStorage.getItem(VKEY) || '{}') || {}; } catch (e) {}

  // ---------- ícones ----------
  const ICON = {
    online: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z"/></svg>',
    players: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2"/></svg>',
    solo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c.7-4 3.6-6 7.5-6s6.8 2 7.5 6"/></svg>',
    local: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  };

  // ---------- cartas ----------
  const cards = new Map(); // slug → carta
  // número de coleção: ordem de criação (a mais antiga é a 01)
  const collection = new Map([...games].sort((a, b) => a.created.localeCompare(b.created)).map((g, i) => [g.slug, i + 1]));
  const pad2 = n => String(n).padStart(2, '0');
  const fmtDate = iso => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  function buildCard(g) {
    const s = Holo.style(g.title);
    const vs = g.versions && g.versions.length > 1 ? g.versions : null;
    const c = { g, vs, cur: vs ? (vs.find(v => v.id === chosen[g.slug]) || vs[0]) : null };
    const el = c.el = document.createElement('article');
    el.className = 'card' + (vs ? ' has-versions' : '');
    el.style.cssText = Holo.vars(s);
    el.dataset.slug = g.slug;
    el.dataset.holo = s.variant;
    el.dataset.pattern = s.family;

    const [, maxP] = range(g.players);
    const mode = g.online ? 'online' : maxP > 1 ? 'local' : 'solo';
    const stats = mode === 'solo'
      ? `<div class="stat"><small>modo</small>${ICON.solo}Um jogador</div>`
      : `<div class="stat"><small>modo</small>${ICON[mode]}${mode === 'online' ? 'Online' : 'Local'}</div>` +
        `<div class="stat"><small>jogadores</small>${ICON.players}${esc(playersText(g.players).replace(/ jogador(es)?$/, ''))}</div>`;
    const stamp = isNew(g.created) ? 'Nova' : vs && vs.some(v => isNew(v.created)) ? 'Versão nova' : '';
    const thumb = (c.cur && c.cur.thumb) || g.thumb;
    const initials = g.title.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const tags = g.tags.slice(0, 3);
    const element = tags[0];

    el.innerHTML =
      `<div class="card__rotator">` +
        `<div class="card__face">` +
          `<div class="face__shine"></div>` +
          `<ul class="card__tags" aria-label="Tags">${tags.map(t => `<li class="card__stage">${Holo.glyph(t)}<span>${esc(t)}</span></li>`).join('')}</ul>` +
          `<div class="card__title"><h2 class="card__name"></h2>` +
            `${element ? `<span class="card__element" title="${esc(element)}">${Holo.glyph(element, '')}</span>` : ''}</div>` +
          `<div class="card__evolve"><span class="card__avatar"><img src="https://github.com/${encodeURIComponent(g.author)}.png?size=96" alt="" loading="lazy" decoding="async"></span>` +
            `<span class="card__by">por <b></b></span></div>` +
          `<div class="card__art"><div class="card__window">` +
            `${thumb ? `<img src="games/${esc(g.slug)}/${esc(thumb)}" alt="" loading="lazy" decoding="async">` : `<div class="card__gen" aria-hidden="true">${esc(initials)}</div>`}` +
            `<div class="art__shine"></div>${stamp ? `<span class="card__stamp">${stamp}</span>` : ''}</div></div>` +
          `<div class="card__strip"><span>Criada em ${esc(fmtDate(g.created))}</span><span title="Última mudança: ${esc(new Date(g.updated).toLocaleString('pt-BR'))}">Atualizada ${esc(ago(g.updated))}</span></div>` +
          `<p class="card__text"></p>` +
          `${vs ? `<div class="card__ability"><span class="card__pill">Versão</span><div class="vers" role="group" aria-label="Versão de ${esc(g.title)}" data-nav="skip"></div></div>` : ''}` +
          `<div class="card__stats">${stats}</div>` +
          `<div class="card__foot"><span class="card__set">FLP ${pad2(collection.get(g.slug))}/${pad2(games.length)}</span>` +
            `${g.notes ? `<span class="card__flavor"><a class="card__notes" href="games/${esc(g.slug)}/${esc(g.notes)}" data-nav="skip">Notas de atualização</a></span>` : ''}</div>` +
        `</div>` +
        `<a class="card__hit" href="${esc(playUrl(g, c.cur))}"></a>` +
        `<div class="card__glare"></div>` +
      `</div>`;
    c.link = el.querySelector('.card__hit');
    c.name = el.querySelector('.card__name');
    c.author = el.querySelector('.card__by b');
    c.desc = el.querySelector('.card__text');
    c.img = el.querySelector('.card__window img');
    c.link.setAttribute('aria-label', g.title);

    // avatar do GitHub; sem ele, as iniciais do autor
    const av = el.querySelector('.card__avatar img');
    av.addEventListener('error', () => { const sp = document.createElement('span'); sp.textContent = g.author.slice(0, 2).toUpperCase(); av.replaceWith(sp); });

    if (vs) {
      const box = el.querySelector('.vers');
      c.vbtns = vs.map(v => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'vers__opt'; b.textContent = v.name;
        if (v.kind === 'antiga') { const k = document.createElement('small'); k.textContent = 'antiga'; b.append(k); }
        if (isNew(v.created)) { const i = document.createElement('i'); i.title = 'Versão nova'; b.append(i); }
        b.title = [v.name + (v.kind ? ` (${v.kind})` : ''), v.note].filter(Boolean).join(': ');
        b.addEventListener('click', () => setVersion(c, v, true));
        return b;
      });
      box.append(...c.vbtns);
      setVersion(c, c.cur, false);
    }

    // brilho e inclinação seguem o ponteiro (molas em holo.js)
    const ctl = c.ctl = Holo.attach(el);
    el.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch' || c.exiting) return;
      el.classList.add('is-active');
      ctl.pointer(e);
    });
    el.addEventListener('pointerleave', () => {
      if (el.contains(document.activeElement) && root.dataset.input !== 'mouse') { ctl.auto(true); return; }
      if (!el.contains(document.activeElement)) el.classList.remove('is-active');
      ctl.leave();
    });
    c.link.addEventListener('focus', () => { el.classList.add('is-active'); if (!el.matches(':hover')) ctl.auto(true); });
    c.link.addEventListener('blur', () => { ctl.auto(false); if (!el.matches(':hover')) el.classList.remove('is-active'); });
    c.link.addEventListener('keydown', e => {
      if (!c.vs || (e.key !== '[' && e.key !== ']')) return;
      e.preventDefault(); cycleVersion(c, e.key === ']' ? 1 : -1);
    });
    return c;
  }

  // nome comprido encolhe pra caber numa linha, como numa carta impressa
  function fitName(c) {
    const n = c.name;
    n.style.setProperty('--fit', 1);
    if (n.scrollWidth > n.clientWidth + 1) n.style.setProperty('--fit', Math.max(.6, n.clientWidth / n.scrollWidth * .98).toFixed(3));
  }
  const fitAll = () => cards.forEach(c => c.el.isConnected && fitName(c));

  function setVersion(c, v, save) {
    c.cur = v;
    c.link.href = playUrl(c.g, v);
    c.vbtns.forEach((b, i) => b.setAttribute('aria-pressed', String(c.vs[i] === v)));
    c.link.setAttribute('aria-label', c.g.title + (v === c.vs[0] ? '' : `, versão ${v.name}`));
    const src = (v.thumb || c.g.thumb) ? `games/${c.g.slug}/${v.thumb || c.g.thumb}` : null;
    if (c.img && src && c.img.getAttribute('src') !== src) {
      c.img.classList.add('is-swapping');
      const pre = new Image();
      pre.onload = pre.onerror = () => { c.img.src = src; c.img.classList.remove('is-swapping'); };
      pre.src = src;
    }
    if (save) { chosen[c.g.slug] = v.id; try { localStorage.setItem(VKEY, JSON.stringify(chosen)); } catch (e) {} }
  }
  function cycleVersion(c, dir) {
    const i = (c.vs.indexOf(c.cur) + dir + c.vs.length) % c.vs.length;
    setVersion(c, c.vs[i], true);
  }

  // ---------- filtros ----------
  const tagCount = new Map(), authorCount = new Map();
  for (const g of games) {
    for (const t of g.tags) tagCount.set(t, (tagCount.get(t) || 0) + 1);
    authorCount.set(g.author, (authorCount.get(g.author) || 0) + 1);
  }
  function chip(label, n, onClick, extra = '') {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip';
    b.innerHTML = `${extra}<span>${esc(label)}</span><span class="chip__n">${n}</span>`;
    b.addEventListener('click', onClick);
    return b;
  }
  const chips = [];
  function buildFilters() {
    for (const m of MODES) {
      const n = games.filter(m.test).length;
      if (!n) continue;
      const b = chip(m.label, n, () => { toggleSet(state.modes, m.id); render(); });
      chips.push([b, () => state.modes.has(m.id)]);
      $('fMode').append(b);
    }
    for (const [t, n] of [...tagCount].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))) {
      const b = chip(t, n, () => { toggleSet(state.tags, t); render(); }, Holo.glyph(t, 'chip__glyph'));
      chips.push([b, () => state.tags.has(t)]);
      $('fTags').append(b);
    }
    for (const [a, n] of [...authorCount].sort((x, y) => x[0].localeCompare(y[0]))) {
      const b = chip('@' + a, n, () => { state.author = state.author === a ? null : a; render(); });
      chips.push([b, () => state.author === a]);
      $('fAuth').append(b);
    }
  }
  const toggleSet = (set, v) => set.has(v) ? set.delete(v) : set.add(v);
  const activeFilters = () => state.modes.size + state.tags.size + (state.author ? 1 : 0);

  // ---------- render ----------
  const grid = $('grid');
  const shown = new Set();
  let lastCount = -1, booted = false;

  function visibleGames(terms) {
    return games.filter(g => {
      if (state.author && g.author !== state.author) return false;
      for (const m of MODES) if (state.modes.has(m.id) && !m.test(g)) return false;
      for (const t of state.tags) if (!g.tags.includes(t)) return false;
      if (!terms.length) return true;
      const hay = fold([g.title, g.description, g.author, ...g.tags, ...(g.versions || []).map(v => v.name)].join(' '));
      return terms.every(t => hay.includes(t));
    }).sort(SORTS[state.sort]);
  }

  function render(animate = true) {
    const terms = fold(state.q).split(/\s+/).filter(Boolean);
    const list = visibleGames(terms).map(g => cards.get(g.slug));
    // uma letra sozinha filtra, mas não pinta: marcaria metade do texto
    const marks = terms.filter(t => t.length > 1);
    for (const c of list) {
      paint(c.name, c.g.title, marks);
      paint(c.author, c.g.author, marks);
      paint(c.desc, c.g.description, marks);
    }
    layout(list, animate && booted && !reduced.matches);
    list.forEach(fitName);

    // contador
    const n = list.length;
    const count = $('count');
    count.innerHTML = n === games.length ? `<b>${n}</b> ${n === 1 ? 'carta' : 'cartas'}` : `<b>${n}</b> de ${games.length}`;
    if (lastCount !== -1 && n !== lastCount) { const b = count.querySelector('b'); b.classList.add('is-bump'); }
    lastCount = n;

    // filtros
    for (const [b, on] of chips) b.setAttribute('aria-pressed', String(on()));
    const f = activeFilters();
    $('fcount').textContent = f ? f : '';
    $('filtersBtn').setAttribute('aria-label', f ? `Filtros, ${f} marcado${f > 1 ? 's' : ''}` : 'Filtros');
    $('search').classList.toggle('has-text', !!state.q);

    // vazio
    const empty = $('empty');
    empty.hidden = n > 0;
    if (!n) {
      const msg = $('emptyMsg');
      if (!data) { msg.innerHTML = 'O catálogo ainda não foi gerado. Rode <b>node scripts/build.mjs</b> na pasta do repositório.'; $('emptyReset').hidden = true; }
      else if (!games.length) { msg.innerHTML = 'Nenhum jogo ainda. No Claude Code, rode <b>/novo-jogo</b> pra criar a primeira carta.'; $('emptyReset').hidden = true; }
      else {
        msg.textContent = '';
        msg.append(state.q ? 'Nenhuma carta com ' : 'Nenhuma carta com esses filtros. ');
        if (state.q) { const b = document.createElement('b'); b.textContent = `“${state.q.trim()}”`; msg.append(b, f ? ' com esses filtros.' : '.'); }
        $('emptyReset').hidden = false;
      }
    }
  }

  // reordena a grade animando quem sai, quem entra e quem muda de lugar (FLIP)
  function layout(next, animate) {
    const first = new Map();
    if (animate) for (const c of shown) first.set(c, c.el.getBoundingClientRect());
    const gr = grid.getBoundingClientRect();
    const nextSet = new Set(next);
    for (const c of [...shown]) {
      if (nextSet.has(c)) continue;
      shown.delete(c);
      if (animate) exit(c, first.get(c), gr); else c.el.remove();
    }
    for (const c of next) { if (c.exiting) clearExit(c); grid.append(c.el); }
    next.forEach((c, i) => {
      if (animate) {
        const before = first.get(c);
        if (before) {
          const after = c.el.getBoundingClientRect();
          const dx = before.left - after.left, dy = before.top - after.top;
          if (Math.abs(dx) > .5 || Math.abs(dy) > .5)
            c.el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
        } else {
          c.el.animate([{ opacity: 0, transform: 'translateY(16px) scale(.9)' }, { opacity: 1, transform: 'none' }],
            { duration: 420, delay: Math.min(i, 8) * 30, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'backwards' });
        }
      }
      shown.add(c);
    });
  }
  function exit(c, r, gr) {
    c.exiting = true;
    Object.assign(c.el.style, { position: 'absolute', left: r.left - gr.left + 'px', top: r.top - gr.top + 'px', width: r.width + 'px', height: r.height + 'px', pointerEvents: 'none' });
    c.el.classList.remove('is-active');
    c.ctl.auto(false);
    c.exitAnim = c.el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.86) rotate(-3deg)' }], { duration: 220, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    c.exitAnim.onfinish = () => { if (c.exiting) { c.el.remove(); clearExit(c); } };
  }
  function clearExit(c) {
    c.exiting = false;
    if (c.exitAnim) { c.exitAnim.onfinish = null; c.exitAnim.cancel(); c.exitAnim = null; }
    for (const k of ['position', 'left', 'top', 'width', 'height', 'pointerEvents']) c.el.style[k] = '';
  }

  // ---------- abertura ----------
  // O logo nasce grande no meio da tela, com um clarão e anéis de luz, e voa até o canto; depois a página aparece.
  let introAnims = null;
  function runIntro() {
    if (!root.classList.contains('is-intro')) return;
    try { sessionStorage.setItem('fliperama:abertura', '1'); } catch (e) {}
    scrollTo(0, 0);
    const intro = $('intro'), logo = $('logo');
    const r = logo.getBoundingClientRect();
    const s = Math.min(2.6, innerWidth * .82 / r.width);
    const dx = innerWidth / 2 - (r.left + r.width / 2), dy = innerHeight / 2 - (r.top + r.height / 2);
    const center = `translate(${dx}px, ${dy}px) scale(${s})`;
    const T = 2600; // até o logo pousar no canto
    const anims = introAnims = [];
    const A = (el, kf, o) => { const a = el.animate(kf, o); anims.push(a); return a; };

    A(intro.querySelector('.intro__orb'), [
      { opacity: 0, transform: 'scale(.2)' },
      { opacity: 1, transform: 'scale(1.3)', offset: .4 },
      { opacity: 0, transform: 'scale(3.4)' }], { duration: 1500, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
    intro.querySelectorAll('.intro__ring').forEach((ring, i) => {
      const tilt = i * 60 - 30;
      A(ring, [
        { opacity: 0, transform: `rotate(${tilt}deg) rotateX(70deg) rotate(0deg) scale(.25)` },
        { opacity: 1, offset: .35 },
        { opacity: 0, transform: `rotate(${tilt}deg) rotateX(70deg) rotate(${i % 2 ? -320 : 320}deg) scale(1.7)` }],
        { duration: 1700, delay: 80 + i * 110, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' });
    });
    A(logo, [
      { transform: `${center} scale(.55)`, opacity: 0, filter: 'blur(14px)', offset: 0 },
      { transform: `${center} scale(.55)`, opacity: 0, filter: 'blur(14px)', offset: .14, easing: 'cubic-bezier(.2,.8,.2,1)' },
      { transform: center, opacity: 1, filter: 'blur(0px)', offset: .42 },
      { transform: center, opacity: 1, filter: 'blur(0px)', offset: .68, easing: 'cubic-bezier(.65,0,.35,1)' },
      { transform: 'none', opacity: 1, filter: 'blur(0px)', offset: 1 }], { duration: T, fill: 'both' });
    A(intro.querySelector('.intro__skip'), [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 700, fill: 'both' });
    const fade = A(intro, [{ opacity: 1 }, { opacity: 0 }], { duration: 650, delay: T * .72, easing: 'ease-out', fill: 'both' });
    document.querySelectorAll('.reveal').forEach((el, i) =>
      A(el, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: T * .8 + i * 70, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
    fade.finished.then(() => endIntro(false), () => {});
  }
  // fim natural: tira o véu e deixa a página terminar de aparecer; pular: tudo vai pro fim na hora
  function endIntro(skip) {
    if (!introAnims) return;
    const anims = introAnims; introAnims = null;
    if (skip) anims.forEach(a => { try { a.finish(); } catch (e) {} });
    root.classList.remove('is-intro');
    for (const a of anims) {
      if (a.playState === 'finished') a.cancel();
      else a.finished.then(() => a.cancel(), () => {});
    }
  }
  const skipIntro = () => { if (introAnims) endIntro(true); };
  addEventListener('pointerdown', skipIntro, true);
  addEventListener('keydown', e => { if (introAnims) { e.preventDefault(); skipIntro(); } }, true);
  addEventListener('wheel', skipIntro, { passive: true });

  // ---------- busca ----------
  const q = $('q'), search = $('search');
  q.addEventListener('input', () => {
    state.q = q.value;
    search.classList.remove('is-typing'); void search.offsetWidth; search.classList.add('is-typing');
    render();
  });
  q.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (q.value) { setQuery(''); } else q.blur(); }
    if (e.key === 'Enter') { const first = [...shown][0]; if (first) { e.preventDefault(); Controle.focus(first.link); } }
  });
  function setQuery(v) { q.value = v; state.q = v; render(); }
  $('clear').addEventListener('click', () => { setQuery(''); q.focus(); });
  addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
    e.preventDefault(); q.focus(); q.select();
  });

  // teclado na tela, pra buscar com o controle
  const osk = $('osk');
  const OSK_ROWS = ['1234567890', 'qwertyuiop', 'asdfghjklç', 'zxcvbnm'];
  function buildOsk() {
    const key = (label, act, span, cls = '') => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label; if (cls) b.className = cls;
      if (span) b.style.gridColumn = `span ${span}`;
      b.addEventListener('click', act);
      osk.append(b);
    };
    for (const row of OSK_ROWS) for (const ch of row) key(ch, () => setQuery(q.value + ch));
    key('espaço', () => setQuery(q.value + ' '), 3);
    key('apagar', () => setQuery(q.value.slice(0, -1)), 4);
    key('limpar', () => setQuery(''), 3);
    key('Pronto', closeOsk, 3, 'osk__ok');
  }
  function openOsk() {
    osk.hidden = false; Controle.trap(osk);
    Controle.focus(osk.querySelectorAll('button')[10]);
  }
  function closeOsk() {
    if (osk.hidden) return;
    osk.hidden = true; Controle.trap(null);
    const first = [...shown][0];
    Controle.focus(state.q && first ? first.link : q);
  }

  // ---------- ordem ----------
  const sortBox = $('sort'), thumb = sortBox.querySelector('.seg__thumb');
  const sortBtns = [...sortBox.querySelectorAll('button')];
  function placeThumb() {
    const b = sortBtns.find(x => x.dataset.sort === state.sort);
    thumb.style.setProperty('--x', b.offsetLeft + 'px');
    thumb.style.setProperty('--w', b.offsetWidth + 'px');
  }
  function setSort(s) {
    state.sort = s;
    try { localStorage.setItem('fliperama:ordem', s); } catch (e) {}
    sortBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sort === s)));
    placeThumb();
    render();
  }
  sortBtns.forEach(b => b.addEventListener('click', () => setSort(b.dataset.sort)));
  sortBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sort === state.sort)));
  addEventListener('resize', placeThumb);
  if (document.fonts) document.fonts.ready.then(placeThumb);

  // ---------- painel de filtros ----------
  const panel = $('filters'), fBtn = $('filtersBtn');
  function setFilters(open, focusInside) {
    panel.classList.toggle('is-open', open);
    fBtn.setAttribute('aria-expanded', String(open));
    if (open && focusInside) setTimeout(() => Controle.focus(panel.querySelector('.chip')), 60);
  }
  fBtn.addEventListener('click', () => setFilters(!panel.classList.contains('is-open'), root.dataset.input === 'pad'));
  function resetAll() {
    state.modes.clear(); state.tags.clear(); state.author = null;
    q.value = ''; state.q = '';
    render();
  }
  $('reset').addEventListener('click', resetAll);
  $('emptyReset').addEventListener('click', () => { resetAll(); q.focus(); });

  // ---------- barra grudada no topo ----------
  const bar = $('bar');
  const sentinel = document.createElement('div');
  bar.before(sentinel);
  new IntersectionObserver(([e]) => bar.classList.toggle('is-stuck', !e.isIntersecting)).observe(sentinel);

  // ---------- controle ----------
  const cardOf = el => el && el.closest && el.closest('.card') && cards.get(el.closest('.card').dataset.slug);
  const firstCard = () => { const c = [...shown][0]; return c && c.link; };
  Controle.init({
    hints: $('hints'),
    first: firstCard,
    onButton(n) {
      if (introAnims) { skipIntro(); return true; }
      const ae = document.activeElement;
      if (!osk.hidden) {
        if (n === 'b' || n === 'y' || n === 'start') { closeOsk(); return true; }
        if (n === 'x') { setQuery(q.value.slice(0, -1)); return true; }
        return false;
      }
      switch (n) {
        case 'a': if (ae === q) { openOsk(); return true; } return false;
        case 'y': Controle.focus(q); openOsk(); return true;
        case 'x': { const open = !panel.classList.contains('is-open'); setFilters(open, open); if (!open) Controle.focus(fBtn); return true; }
        case 'b':
          if (panel.classList.contains('is-open') && panel.contains(ae)) { setFilters(false); Controle.focus(fBtn); }
          else if (state.q) { setQuery(''); }
          else if (cardOf(ae)) { scrollTo({ top: 0, behavior: reduced.matches ? 'auto' : 'smooth' }); Controle.focus(q); }
          return true;
        case 'lb': case 'rb': { const c = cardOf(ae); if (c && c.vs) cycleVersion(c, n === 'rb' ? 1 : -1); return true; }
        case 'lt': case 'rt': {
          const keys = Object.keys(SORTS), i = keys.indexOf(state.sort);
          setSort(keys[(i + (n === 'rt' ? 1 : -1) + keys.length) % keys.length]); return true;
        }
        case 'select': window.Tema && Tema.toggle(document.querySelector('[data-theme-toggle]')); return true;
        case 'start': { const c = cardOf(ae); if (c) c.link.click(); else Controle.focus(firstCard()); return true; }
      }
      return false;
    },
  });

  // ---------- início ----------
  const authors = [...authorCount.keys()].sort();
  if (authors.length) {
    const lede = $('lede');
    lede.textContent = 'Os jogos que ';
    authors.forEach((a, i) => {
      if (i) lede.append(i === authors.length - 1 ? ' e ' : ', ');
      const b = document.createElement('b'); b.textContent = '@' + a; lede.append(b);
    });
    lede.append(`${authors.length > 1 ? ' fazem' : ' faz'} com Claude Code. Escolha uma carta pra jogar.`);
  }
  for (const g of games) cards.set(g.slug, buildCard(g));
  buildFilters();
  if (!games.length) { $('fMode').closest('.filters').hidden = true; }
  buildOsk();
  render(false);
  placeThumb();
  booted = true;
  runIntro();
  addEventListener('pageshow', e => { if (e.persisted) cards.forEach(c => { c.el.classList.remove('is-active'); c.ctl.auto(false); }); });
  if (document.fonts) document.fonts.ready.then(fitAll);
  new ResizeObserver(fitAll).observe(grid);
})();
