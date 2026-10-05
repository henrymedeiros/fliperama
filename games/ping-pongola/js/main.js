// Mesmo endereço para os dois aparelhos: com ?c=CODIGO vira raquete (celular),
// sem isso abre o jogo (computador). O celular não baixa o Three.js.
const params = new URLSearchParams(location.search);
const code = params.get('c');

function fail(err) {
  console.error(err);
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:auto 16px 16px 16px;padding:14px 18px;border-radius:16px;background:#17384d;color:#fff;font:700 15px Nunito,sans-serif;z-index:99';
  box.textContent = 'Não foi possível carregar o jogo. Verifique a internet e recarregue a página.';
  document.body.appendChild(box);
}

if (code) import('./controller.js').then((m) => m.startController(code)).catch(fail);
else import('./desktop.js').then((m) => m.startDesktop(params)).catch(fail);
