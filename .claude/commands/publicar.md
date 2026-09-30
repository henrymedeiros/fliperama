---
description: Valida e publica um jogo seu no Fliperama (commit + push na main)
argument-hint: [slug]
---

Publique no Fliperama o jogo: $ARGUMENTS

1. Descubra o slug. Se não veio no argumento, veja no `git status` qual pasta de `games/` tem mudanças. Se houver mais de uma, pergunte qual publicar.
2. Descubra seu login com `gh api user --jq .login` e compare com o `author` de `games/<slug>/game.json`. Se o jogo for de outra pessoa, pare e explique que o certo é usar `/alterar <slug> ...`, que abre um pull request pro autor aprovar.
3. `git pull --rebase` pra pegar o que o resto do pessoal publicou.
4. `node scripts/build.mjs --check`. Se der ERRO, corrija e rode de novo.
5. Confira que o jogo não usa caminho absoluto (`src="/`, `href="/`, `fetch('/`) e que as chaves de localStorage têm prefixo próprio. Corrija se precisar.
6. Faça commit só dos arquivos de `games/<slug>/`, com a mensagem `<slug>: <resumo do que mudou>`.
7. `git push` na `main`.
8. Diga que o jogo aparece em cerca de um minuto no site. O endereço é `https://<dono>.github.io/<repo>/play.html?g=<slug>`, e dá pra descobrir com `gh repo view --json owner,name`. Se quiser acompanhar, `gh run watch`.
