---
description: Altera o jogo de outra pessoa e abre um pull request pro autor aprovar
argument-hint: <slug> <o que mudar>
---

Altere um jogo do Fliperama: $ARGUMENTS

O primeiro termo é o slug (pasta em `games/`) e o resto descreve a mudança. Se faltar alguma das duas coisas, pergunte.

1. `git checkout main && git pull --rebase`.
2. Leia `games/<slug>/game.json` pra saber quem é o autor, e leia o código do jogo antes de mexer. Respeite o estilo do autor.
3. Crie a branch `alterar/<slug>-<resumo-curto>`.
4. Faça a mudança pedida, mexendo só em `games/<slug>/`. Não mude `author` nem `created`.
5. Rode `node scripts/build.mjs --check` e teste o jogo (`node scripts/dev.mjs`, http://localhost:5173).
6. Faça commit com a mensagem `<slug>: <o que mudou>` e `git push -u origin <branch>`.
7. Abra o pull request com `gh pr create --base main --reviewer <autor>`: título igual ao commit e, na descrição, o que mudou, por quê e como testar.
8. Volte pra `main` (`git checkout main`) e passe o link do pull request.

Se o jogo for seu (seu login do `gh` igual ao `author`), avise que dá pra usar `/publicar` direto, sem pull request.
