# Fliperama

Repositório compartilhado de jogos de navegador feitos com Claude Code. Cada jogo é uma pasta em `games/`. O site (catálogo + player) é publicado no GitHub Pages a cada push na `main`.

## Estrutura

```
index.html            catálogo (lê games.js)
play.html             player: abre games/<slug>/ num iframe com barra de voltar/tela cheia
games/<slug>/         um jogo por pasta
  index.html          entrada do jogo (ou o arquivo indicado em "entry")
  game.json           ficha do jogo (obrigatória)
  thumb.svg|png|jpg   capa 16:10, até 400 KB (opcional, mas recomendada)
scripts/build.mjs     valida as fichas e gera games.json + games.js (arquivos gerados, fora do git)
scripts/new-game.mjs  cria a pasta de um jogo novo
scripts/new-version.mjs  cria uma versão de um jogo (alternativa ou antiga) numa subpasta
scripts/dev.mjs       servidor local: http://localhost:5173
```

## game.json

```json
{
  "title": "Nome do Jogo",
  "author": "login-do-github",
  "description": "Uma ou duas frases dizendo o que é e como se joga.",
  "tags": ["ação", "puzzle"],
  "players": "1",
  "controls": "WASD anda · Espaço pula",
  "online": false,
  "thumb": "thumb.svg",
  "entry": "index.html",
  "created": "AAAA-MM-DD"
}
```

Obrigatórios: `title`, `author`, `description`. O `author` é o login do GitHub de quem criou (`gh api user --jq .login`). As datas de atualização vêm do git, não edite à mão.

## Versões

Um jogo pode ter várias versões jogáveis: a atual, versões antigas guardadas e versões alternativas (outra câmera, outras regras). No catálogo, a capa da ficha ganha um seletor que troca a capa e a versão que abre; no player, a barra de cima tem o mesmo seletor. O link de uma versão é `play.html?g=<slug>&v=<id>`.

```json
"versions": [
  { "id": "classico", "name": "Clássico", "entry": "index.html", "thumb": "thumb.svg", "note": "A pista isométrica original." },
  { "id": "vista-de-cima", "name": "Vista de cima", "kind": "alternativa", "entry": "vista-de-cima/index.html", "thumb": "vista-de-cima/thumb.svg", "note": "A mesma partida vista de cima.", "created": "2026-09-30" }
]
```

- A primeira da lista é a padrão: é a que abre sem `?v=` e a que vem marcada no catálogo.
- Cada versão tem `id` (minúsculo com hífen, vira parte do link), `name` e `entry`. Opcionais: `thumb` (sem ela, usa a capa do jogo), `note` (uma frase), `kind` (`"alternativa"` ou `"antiga"`) e `created` (AAAA-MM-DD; versão com menos de 7 dias ganha um ponto de "nova" no seletor).
- Cada versão fica na própria subpasta (`games/<slug>/<id>/`), autossuficiente como um jogo. A principal pode continuar na raiz da pasta.
- Crie com `node scripts/new-version.mjs <slug> <id> "<Nome>" [--antiga | --alternativa] [--de <id>]`: ele copia a versão base pra subpasta e registra no `game.json`.
- **Versão antiga é congelada.** Antes de uma mudança grande, guarde a atual com `--antiga` e continue mexendo na principal. Não edite a pasta de uma versão antiga.
- **Não mude o `id` nem a pasta de uma versão publicada**: o link dela quebra.
- Versão alternativa que joga diferente deve ter recorde próprio: troque o prefixo das chaves de localStorage na cópia (ex.: `meu-jogo-noturno:recorde`). Se tiver modo online, use também um prefixo de sala próprio, pra não cair na sala de outra versão.

## Regras para os jogos

- **Pasta autossuficiente.** Tudo que o jogo usa fica dentro de `games/<slug>/`, com caminhos relativos (`./sprite.png`, nunca `/sprite.png` nem `../outro-jogo/`). O site roda em `https://<usuario>.github.io/<repo>/`, então caminho absoluto quebra.
- **Sem etapa de build obrigatória.** O `index.html` tem que abrir direto no navegador. Se usar bundler, faça commit da saída pronta.
- **Bibliotecas externas** só por CDN com versão fixa (cdnjs, jsdelivr, unpkg).
- **localStorage com prefixo único do jogo** (ex.: `meu-jogo:recorde`). Todos os jogos dividem o mesmo domínio e sem prefixo um apaga os dados do outro.
- **Funciona dentro de iframe.** O player carrega o jogo num iframe: nada de `window.top`, e peça foco com um clique quando precisar de teclado.
- **Nada de servidor obrigatório.** O GitHub Pages só serve arquivos estáticos. Jogo online usa conexão direta entre navegadores (ex.: PeerJS). Um servidor próprio, como o `server.js` do Drink Heist, pode existir como extra, mas o jogo precisa funcionar sem ele.
- **Nomes de pasta:** minúsculos com hífen (`corrida-de-patos`). Não renomeie a pasta de um jogo publicado: o link dele muda.

## Jogos de outras pessoas

- Pode jogar, ler e copiar ideias à vontade.
- **Não faça commit direto na `main` alterando o jogo de outro autor.** Use o fluxo do `/alterar`: branch `alterar/<slug>-<resumo>`, commit, push e pull request marcando o autor como revisor. O autor aprova e faz o merge.
- No seu próprio jogo, commit direto na `main` é ok (é o que o `/publicar` faz).

## Antes de qualquer commit

1. `node scripts/build.mjs --check` tem que passar sem ERRO.
2. Abra o jogo no navegador (`node scripts/dev.mjs`) e confira que ele carrega pelo catálogo e pelo player.
3. Mensagem de commit em português, curta, no formato `<slug>: o que mudou` (ex.: `drink-heist: pulo mais responsivo`).

## Comandos

- `/novo-jogo <ideia>`: cria a pasta, a ficha e o jogo.
- `/publicar [slug]`: valida e publica o seu jogo.
- `/alterar <slug> <o que mudar>`: altera o jogo de outra pessoa e abre um pull request.
- `/versao <slug> <ideia ou "guardar">`: cria uma versão alternativa de um jogo, ou guarda a atual como versão antiga.
