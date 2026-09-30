---
description: Cria uma versão alternativa de um jogo ou guarda a atual como versão antiga
argument-hint: <slug> <ideia da versão | guardar>
---

Crie uma versão de um jogo do Fliperama: $ARGUMENTS

O primeiro termo é o slug (pasta em `games/`). O resto diz o que fazer:

- **"guardar"** (ou "guardar antes de ..."): congela a versão principal como está, pra continuar mexendo nela sem perder a antiga.
- **Uma ideia** (ex.: "vista de cima", "modo noturno"): cria uma versão alternativa a partir da principal e faz a mudança nela.

Se faltar o slug ou não der pra entender qual dos dois é, pergunte.

1. Leia o `CLAUDE.md` da raiz (seção **Versões**), o `games/<slug>/game.json` e o código do jogo.
2. Escolha um `id` curto, minúsculo e com hífens, que não exista na lista `versions`. Pra versão guardada, use algo como `v1`, `v2` ou `2026-09`. O `id` vira parte do link e não muda depois.
3. Rode `node scripts/new-version.mjs <slug> <id> "<Nome>" --antiga` (guardar) ou `--alternativa` (ideia). Use `--nota "..."` pra frase que aparece no seletor. Se o jogo ainda não tinha versões, a atual entra na lista como "original": renomeie o `name` dela pra algo que diferencie (ex.: "Clássico"), mas não mude o `id`.
4. Versão antiga: não mexa na cópia. Pronto.
5. Versão alternativa: faça a mudança na cópia (`games/<slug>/<id>/`), sem tocar na principal.
   - Apague da cópia os arquivos que ela não usa (por exemplo um `server.js` que só serve a principal).
   - Troque o prefixo das chaves de localStorage da cópia, pra ela ter recordes próprios, e o prefixo das salas online, se houver.
   - Crie uma capa própria `thumb.svg` (16:10) que mostre a diferença e aponte o `thumb` da versão pra ela.
6. Rode `node scripts/build.mjs --check` e teste as versões pelo catálogo e pelo player (`node scripts/dev.mjs`, http://localhost:5173): o seletor na capa troca a imagem e o link, e o seletor do player troca o jogo.
7. Se o jogo for de outra pessoa, siga o fluxo do `/alterar` (branch, pull request com o autor como revisor). Se for seu, é só `/publicar <slug>`.
