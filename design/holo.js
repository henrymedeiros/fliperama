// Fliperama · holo.js
// Transforma um nome numa carta única: nome → hash → gerador pseudoaleatório → cor, padrão e variante de holo.
// O mesmo nome sempre gera a mesma carta. Uso:
//   const s = Holo.style('Drink Heist');  // { h, h2, angle, family, variant, pattern }
//   el.style.cssText = Holo.vars(s);      // --h, --h2, --angle, --foil
//   el.dataset.holo = s.variant;          // variante de holo (receitas em design/carta.css)
//   const ctl = Holo.attach(el);          // inclinação e holo seguindo o ponteiro, com molas (como no pokemon-cards-css)
//   Holo.glyph('ação')                    // <svg> do símbolo de uma tag
(() => {
  // cyrb53: hash rápido e bem distribuído
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  // mulberry32: sequência pseudoaleatória a partir da semente
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const norm = s => String(s).trim().toLowerCase();
  const W = 630, H = 880; // proporção de carta (63 × 88 mm)
  const f = n => Math.round(n * 10) / 10;

  // estrela de quatro pontas centrada em (x, y)
  const sparkle = (x, y, r, k = .22) =>
    `M${f(x)} ${f(y - r)}Q${f(x + r * k)} ${f(y - r * k)} ${f(x + r)} ${f(y)}Q${f(x + r * k)} ${f(y + r * k)} ${f(x)} ${f(y + r)}Q${f(x - r * k)} ${f(y + r * k)} ${f(x - r)} ${f(y)}Q${f(x - r * k)} ${f(y - r * k)} ${f(x)} ${f(y - r)}Z`;

  // Famílias de padrão. Cada uma recebe o gerador e devolve o miolo de um SVG W×H (formas brancas = onde brilha).
  const FAMILIES = {
    estrelas(r) {
      let d = '';
      const n = 26 + Math.floor(r() * 30);
      for (let i = 0; i < n; i++) d += sparkle(r() * W, r() * H, 8 + r() ** 2.4 * 70);
      let dots = '';
      for (let i = 0; i < 90; i++) dots += `<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(1 + r() * 3)}" opacity="${f(.3 + r() * .7)}"/>`;
      return `<path d="${d}"/>${dots}`;
    },
    listras(r) {
      const ang = Math.floor(r() * 180), gap = 18 + Math.floor(r() * 34), w = 3 + r() * (gap * .45);
      const w2 = r() < .5 ? f(w * .35) : 0;
      return `<defs><pattern id="p" width="${gap}" height="${H}" patternUnits="userSpaceOnUse" patternTransform="rotate(${ang})">` +
        `<rect width="${f(w)}" height="${H}"/>${w2 ? `<rect x="${f(w + 4)}" width="${w2}" height="${H}" opacity=".6"/>` : ''}</pattern>` +
        `</defs><rect width="${W}" height="${H}" fill="url(#p)"/>`;
    },
    losangos(r) {
      const s = 34 + Math.floor(r() * 50), sw = f(1.5 + r() * 5), rot = Math.floor(r() * 4) * 15;
      const fill = r() < .4;
      return `<defs><pattern id="p" width="${s}" height="${s}" patternUnits="userSpaceOnUse" patternTransform="rotate(${45 + rot})">` +
        `<rect x="${f(s * .18)}" y="${f(s * .18)}" width="${f(s * .64)}" height="${f(s * .64)}" ${fill ? `opacity=".55"` : `fill="none" stroke="#fff" stroke-width="${sw}"`}/></pattern></defs>` +
        `<rect width="${W}" height="${H}" fill="url(#p)"/>`;
    },
    ondas(r) {
      const n = 10 + Math.floor(r() * 16), amp = 10 + r() * 40, per = 80 + r() * 220, sw = f(2 + r() * 7), ph = r() * 6.28;
      let out = '';
      for (let i = 0; i < n; i++) {
        const y0 = (i + .5) * H / n;
        let d = `M-20 ${f(y0)}`;
        for (let x = -20; x <= W + 20; x += 20) d += `L${x} ${f(y0 + Math.sin(x / per * 6.28 + ph + i * .5) * amp)}`;
        out += `<path d="${d}" opacity="${f(.45 + r() * .55)}"/>`;
      }
      return `<g fill="none" stroke="#fff" stroke-width="${sw}" stroke-linecap="round">${out}</g>`;
    },
    raios(r) {
      const cx = r() * W, cy = r() * H * .6, n = 14 + Math.floor(r() * 26), wid = .25 + r() * .5;
      let d = '';
      for (let i = 0; i < n; i++) {
        const a = i / n * 6.2832, b = a + 6.2832 / n * wid, R = 1400;
        d += `M${f(cx)} ${f(cy)}L${f(cx + Math.cos(a) * R)} ${f(cy + Math.sin(a) * R)}L${f(cx + Math.cos(b) * R)} ${f(cy + Math.sin(b) * R)}Z`;
      }
      return `<path d="${d}"/>`;
    },
    aneis(r) {
      const k = 1 + Math.floor(r() * 3), sw = f(2 + r() * 6);
      let out = '';
      for (let j = 0; j < k; j++) {
        const cx = r() * W, cy = r() * H, step = 18 + r() * 30, n = 8 + Math.floor(r() * 16);
        for (let i = 1; i <= n; i++) out += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(i * step)}" opacity="${f(1 - i / (n + 2))}"/>`;
      }
      return `<g fill="none" stroke="#fff" stroke-width="${sw}">${out}</g>`;
    },
    pixels(r) {
      const s = 22 + Math.floor(r() * 26), p = .18 + r() * .3, cols = Math.ceil(W / s), rows = Math.ceil(H / s);
      const fx = r() * cols, fy = r() * rows;
      let out = '';
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const near = 1 - Math.min(1, Math.hypot(x - fx, y - fy) / (cols * 1.1));
        if (r() < p + near * .35) out += `<rect x="${x * s + 2}" y="${y * s + 2}" width="${s - 4}" height="${s - 4}" opacity="${f(.35 + r() * .65)}"/>`;
      }
      return out;
    },
  };
  const FAMILY_NAMES = Object.keys(FAMILIES);
  // variantes de holo, como as raridades do pokemon-cards-css (receitas em design/carta.css)
  const VARIANTS = ['holo', 'reverso', 'cintilante', 'secreta'];
  // ordem original do sorteio: mantém a variante de cada nome quando uma sai de circulação.
  // 'linhas', 'cosmos' e 'radiante' foram retiradas; quem caía nelas sorteia de novo entre as que restam.
  const DRAW = ['holo', 'cosmos', 'reverso', 'cintilante', 'radiante', 'linhas', 'secreta'];

  function style(name) {
    const seed = hash(norm(name));
    const r = rng(seed);
    const h = Math.floor(r() * 360);
    const h2 = (h + 30 + Math.floor(r() * 120)) % 360;
    const angle = Math.floor(r() * 180);
    const family = FAMILY_NAMES[Math.floor(r() * FAMILY_NAMES.length)];
    let variant = DRAW[Math.floor(r() * DRAW.length)];
    // sorteio à parte, pra não mexer no padrão que vem depois
    if (!VARIANTS.includes(variant)) variant = VARIANTS[Math.floor(rng(seed ^ 0x9e3779b9)() * VARIANTS.length)];
    // estampa sólida: tira as transparências que as famílias usam pra variar as formas
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" fill="#fff">${FAMILIES[family](r).replace(/ opacity="[^"]*"/g, '')}</svg>`;
    const pattern = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    return { seed, h, h2, angle, family, variant, svg, pattern };
  }
  const vars = s => `--h:${s.h};--h2:${s.h2};--angle:${s.angle};--foil:${s.pattern}`;

  // símbolos de tag: forma e matiz vêm do hash da tag (o mesmo símbolo no filtro e na carta)
  const GLYPHS = [
    'M8 1.5 14.5 8 8 14.5 1.5 8Z',                                   // losango
    'M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8Z',              // círculo
    'M8 1.5 14.8 13.8H1.2Z',                                         // triângulo
    'M8 1 9.9 6.1 15 8 9.9 9.9 8 15 6.1 9.9 1 8 6.1 6.1Z',           // estrela
    'M2.5 2.5h11v11h-11Z',                                           // quadrado
    'M8 1.2 14 4.6v6.8L8 14.8 2 11.4V4.6Z',                          // hexágono
    'M8 14.5S1.5 10.4 1.5 5.8A3.4 3.4 0 0 1 8 4a3.4 3.4 0 0 1 6.5 1.8C14.5 10.4 8 14.5 8 14.5Z', // coração
    'M9.2 1 3 9h4.4L6.6 15 13 7H8.6Z',                               // raio
  ];
  const glyph = (t, cls = 'glyph') =>
    `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="${GLYPHS[hash('glyph:' + norm(t)) % GLYPHS.length]}"/></svg>`;

  // ---------- interação: molas, como no pokemon-cards-css ----------
  // Atualiza no elemento: --pointer-x/y, --pointer-from-center/top/left, --background-x/y, --rotate-x/y, --card-opacity.
  const SPRING_INTERACT = { k: .066, d: .25 };
  const SPRING_SNAP = { k: .01, d: .06 };    // volta devagar, balançando
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const KEYS = ['rx', 'ry', 'gx', 'gy', 'go', 'bx', 'by'];
  const REST = { rx: 0, ry: 0, gx: 50, gy: 50, go: 0, bx: 50, by: 50 };

  function attach(el) {
    const cur = { ...REST }, tgt = { ...REST }, vel = Object.fromEntries(KEYS.map(k => [k, 0]));
    let spring = SPRING_INTERACT, raf = 0, last = 0, auto = false, leaveTimer = 0;

    function aim(px, py, o = 1) {
      const still = reducedMotion.matches;
      tgt.gx = px; tgt.gy = py; tgt.go = o;
      tgt.bx = 37 + px * .26; tgt.by = 33 + py * .34;
      tgt.rx = still ? 0 : -(px - 50) / 3.5;
      tgt.ry = still ? 0 : (py - 50) / 3.5;
    }
    function write() {
      const st = el.style;
      st.setProperty('--pointer-x', cur.gx.toFixed(2) + '%');
      st.setProperty('--pointer-y', cur.gy.toFixed(2) + '%');
      st.setProperty('--pointer-from-center', Math.min(1, Math.hypot(cur.gx - 50, cur.gy - 50) / 50).toFixed(3));
      st.setProperty('--pointer-from-top', (cur.gy / 100).toFixed(3));
      st.setProperty('--pointer-from-left', (cur.gx / 100).toFixed(3));
      st.setProperty('--card-opacity', Math.max(0, Math.min(1, cur.go)).toFixed(3));
      st.setProperty('--rotate-x', cur.rx.toFixed(2) + 'deg');
      st.setProperty('--rotate-y', cur.ry.toFixed(2) + 'deg');
      st.setProperty('--background-x', cur.bx.toFixed(2) + '%');
      st.setProperty('--background-y', cur.by.toFixed(2) + '%');
    }
    function tick(t) {
      raf = 0;
      const dt = last ? Math.min(3, (t - last) / 16.67) : 1;
      last = t;
      if (auto) {
        const a = t / 1000;
        aim(50 + 36 * Math.sin(a * .9), 50 + 30 * Math.sin(a * 1.27 + 1));
      }
      let moving = false;
      for (const k of KEYS) {
        vel[k] = vel[k] * (1 - spring.d * dt) + spring.k * dt * (tgt[k] - cur[k]);
        cur[k] += vel[k] * dt;
        if (Math.abs(vel[k]) > .01 || Math.abs(tgt[k] - cur[k]) > .01) moving = true;
      }
      if (!moving) Object.assign(cur, tgt);
      write();
      if (moving || auto) raf = requestAnimationFrame(tick); else last = 0;
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    function rest() { spring = SPRING_SNAP; Object.assign(tgt, REST); kick(); }

    return {
      pointer(e) {
        clearTimeout(leaveTimer); auto = false;
        const r = el.getBoundingClientRect();
        const px = Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100));
        const py = Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100));
        spring = SPRING_INTERACT; aim(px, py); kick();
      },
      leave(delay = 120) { clearTimeout(leaveTimer); leaveTimer = setTimeout(() => { if (!auto) rest(); }, delay); },
      auto(on) { auto = on; if (on) { spring = SPRING_INTERACT; kick(); } else rest(); },
    };
  }

  window.Holo = { hash, rng, style, vars, attach, glyph, FAMILIES: FAMILY_NAMES, VARIANTS };
})();
