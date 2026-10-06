// Fliperama · controle.js
// Navegação por controle (Gamepad API) e pelas setas do teclado, igual nos jogos.
// O foco anda pelo elemento mais próximo na direção apertada (navegação espacial).
//
//   Controle.init({ onButton(nome, info) { return true se tratou }, hints: elementoDaBarraDeDicas })
//   nomes: up down left right a b x y lb rb lt rt select start
//
// Regras para as páginas:
//  - tudo que é clicável precisa ser <a href> ou <button> (ou ter tabindex="0") pra entrar na navegação;
//  - data-nav="skip" tira um elemento (e o que estiver dentro) da navegação por direção;
//  - Controle.trap(el) prende a navegação dentro de el (teclado na tela, diálogos); Controle.trap(null) solta.
(() => {
  const root = document.documentElement;
  const SEL = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let trapEl = null, opts = {};

  function visible(el) {
    if (el.closest('[hidden], [inert], [data-nav="skip"]')) return false;
    const rs = el.getClientRects();
    if (!rs.length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.opacity !== '0';
  }
  function focusables() {
    const scope = trapEl || document;
    return [...scope.querySelectorAll(SEL)].filter(visible);
  }
  function focus(el) {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
  }

  // escolhe o candidato mais próximo na direção, preferindo quem está alinhado
  function move(dir) {
    const cur = document.activeElement;
    const list = focusables();
    if (!list.length) return;
    if (!cur || cur === document.body || !list.includes(cur)) {
      // começa pelo primeiro elemento visível na tela
      const onScreen = list.find(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
      focus(opts.first?.() || onScreen || list[0]);
      return;
    }
    const a = cur.getBoundingClientRect();
    const horiz = dir === 'left' || dir === 'right';
    const sign = dir === 'right' || dir === 'down' ? 1 : -1;
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      // distância entre as bordas no eixo da direção
      const gap = horiz
        ? (sign > 0 ? b.left - a.right : a.left - b.right)
        : (sign > 0 ? b.top - a.bottom : a.top - b.bottom);
      const centerAhead = horiz
        ? sign * ((b.left + b.right) / 2 - (a.left + a.right) / 2)
        : sign * ((b.top + b.bottom) / 2 - (a.top + a.bottom) / 2);
      if (gap < -8 || centerAhead <= 1) continue;
      // desalinhamento no outro eixo (zero se as faixas se sobrepõem)
      const off = horiz
        ? Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom))
        : Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
      const score = Math.max(0, gap) + off * 3 + (off > 0 ? 40 : 0);
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) focus(best);
    else if (!horiz && sign < 0) scrollTo({ top: 0, behavior: reduced.matches ? 'auto' : 'smooth' });
  }

  function setInput(mode) {
    if (root.dataset.input === mode) return;
    root.dataset.input = mode;
    if (opts.hints) opts.hints.classList.toggle('is-on', mode === 'pad');
  }

  function press(name, info = {}) {
    if (opts.onButton && opts.onButton(name, info)) return;
    if (name === 'up' || name === 'down' || name === 'left' || name === 'right') move(name);
    else if (name === 'a' || name === 'start') {
      const el = document.activeElement;
      if (el && el !== document.body) el.click();
      else move('down');
    }
  }

  // ---------- teclado: setas fazem a mesma navegação ----------
  addEventListener('keydown', e => {
    setInput('key');
    const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
    if (!dir || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = document.activeElement;
    const typing = el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['button', 'checkbox', 'radio'].includes(el.type)));
    if (typing && (dir === 'left' || dir === 'right')) return; // setas laterais movem o cursor no texto
    if (el && el.tagName === 'SELECT') return;
    e.preventDefault();
    press(dir, { source: 'key' });
  });
  addEventListener('pointermove', e => { if (e.movementX || e.movementY) setInput('mouse'); }, { passive: true });
  addEventListener('pointerdown', () => setInput('mouse'), { passive: true });

  // ---------- controle ----------
  const BTN = { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 6: 'lt', 7: 'rt', 8: 'select', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
  const REPEAT_DELAY = 380, REPEAT_RATE = 110;
  const held = {}; // nome → { since, last }
  let raf = 0, seeding = true;

  function poll(t) {
    raf = 0;
    let pads = [];
    try { pads = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter(Boolean); } catch (e) {}
    if (!pads.length) return;
    const now = {};
    for (const p of pads) {
      for (const [i, n] of Object.entries(BTN)) if (p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > .5)) now[n] = true;
      const [x = 0, y = 0] = p.axes;
      if (x < -.55) now.left = true; else if (x > .55) now.right = true;
      if (y < -.55) now.up = true; else if (y > .55) now.down = true;
    }
    // botões que já estavam apertados quando a página abriu não contam como toque
    if (seeding) { seeding = false; for (const n in now) held[n] = { since: t, last: t }; raf = requestAnimationFrame(poll); return; }
    for (const n of new Set([...Object.keys(now), ...Object.keys(held)])) {
      if (now[n] && !held[n]) {
        held[n] = { since: t, last: t };
        if (!document.hidden && document.hasFocus()) { setInput('pad'); press(n, { source: 'pad' }); }
      } else if (now[n]) {
        const h = held[n];
        const repeats = n === 'up' || n === 'down' || n === 'left' || n === 'right';
        if (repeats && t - h.since > REPEAT_DELAY && t - h.last > REPEAT_RATE) { h.last = t; if (document.hasFocus()) press(n, { source: 'pad', repeat: true }); }
      } else delete held[n];
    }
    raf = requestAnimationFrame(poll);
  }
  const start = () => { if (!raf) raf = requestAnimationFrame(poll); };
  addEventListener('gamepadconnected', start);
  // alguns navegadores só listam o controle depois do primeiro botão; tenta ao carregar
  start();

  window.Controle = {
    init(o = {}) { opts = o; if (o.hints && root.dataset.input === 'pad') o.hints.classList.add('is-on'); },
    move, focus, focusables, press,
    trap(el) { trapEl = el || null; },
  };
})();
