---
description: Cria um jogo novo no Fliperama a partir de uma ideia
argument-hint: <ideia do jogo>
---

Crie um jogo novo no Fliperama a partir desta ideia: $ARGUMENTS

Se a ideia vier vazia, pergunte em uma frase o que a pessoa quer fazer antes de começar.

1. Leia o `CLAUDE.md` da raiz e siga as regras dele.
2. Escolha um slug curto, minúsculo e com hífens, que ainda não exista em `games/`. Confira com `ls games`.
3. Rode `node scripts/new-game.mjs <slug> "<Título>"` pra criar a pasta. Ele já preenche o autor pelo `gh`.
4. Faça o jogo em `games/<slug>/index.html`, trocando o esqueleto gerado. O jogo precisa ser bom de jogar: controles responsivos, feedback visual e sonoro, tela inicial e de fim, e funcionar no celular quando fizer sentido.
5. Complete o `game.json`: descrição de verdade (uma ou duas frases), tags, número de jogadores e controles.
6. Crie uma capa `thumb.svg` (16:10, por exemplo 640x400) que mostre o jogo, e aponte `"thumb": "thumb.svg"` no `game.json`.
7. Rode `node scripts/build.mjs --check` e corrija qualquer ERRO.
8. Diga como testar (`node scripts/dev.mjs` e abrir http://localhost:5173) e que, quando estiver bom, é só rodar `/publicar <slug>`.

Não faça commit nem push neste comando.
