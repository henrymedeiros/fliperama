// Fliperama · tema.js — carregue no <head>, antes do CSS pintar, pra não piscar.
// O tema escuro é o padrão. A escolha fica salva em localStorage ('fliperama:tema') e vale pra todas as páginas do site.
(() => {
  const KEY = 'fliperama:tema';
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  root.dataset.theme = saved === 'light' ? 'light' : 'dark';

  function set(theme, origin) {
    const apply = () => {
      root.dataset.theme = theme;
      try { localStorage.setItem(KEY, theme); } catch (e) {}
      document.querySelectorAll('[data-theme-toggle]').forEach(b => {
        b.setAttribute('aria-pressed', String(theme === 'dark'));
        b.setAttribute('aria-label', theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro');
      });
    };
    // círculo que se abre a partir do botão (View Transitions, quando o navegador tem)
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply();
    const r = origin ? origin.getBoundingClientRect() : { left: innerWidth / 2, top: 0, width: 0, height: 0 };
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(apply).ready.then(() => {
      root.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration: 520, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' });
    }).catch(() => {});
  }
  const toggle = origin => set(root.dataset.theme === 'dark' ? 'light' : 'dark', origin);

  addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-theme-toggle]').forEach(b => {
      b.setAttribute('aria-pressed', String(root.dataset.theme === 'dark'));
      b.setAttribute('aria-label', root.dataset.theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro');
      b.addEventListener('click', () => toggle(b));
    });
  });
  window.Tema = { set, toggle, get: () => root.dataset.theme };
})();
