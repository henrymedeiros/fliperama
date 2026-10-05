# Fliperama design system

This document is mandatory for every interface of the site: the catalog (`index.html`), the player (`play.html`) and any new page outside `games/`. If something new does not fit what is described here, first extend the design system (token, component and this document), and only then use it.

Games inside `games/` have their own visual identity and do not need to follow this document. The only rule that applies to them is the cover (`thumb`, 16:10), which is shown inside the card.

The exception is **update notes pages** (the `notes` field in `game.json`). They open from the catalog and are part of the site, so they follow this document and import the files with `../../design/`. The reference page is `games/ultra-mini-fighter-4/notas.html`.

The interface copy is in Brazilian Portuguese. Code identifiers that come from the UI (variant names, storage keys, file names such as `carta.css`) stay in Portuguese too.

## Files

| File | Contents |
| --- | --- |
| `design/tokens.css` | All colors, fonts, sizes, spacing, radii, shadows and durations, for both themes. |
| `design/components.css` | Page base and components: logo, buttons, theme toggle, search, segmented control, chips, collapsible panel, gamepad hint bar and on-screen keyboard. |
| `design/carta.css` | The holographic card: structure and the seven shine variants. |
| `design/tema.js` | Light and dark theme, saved in `localStorage` (`fliperama:tema`). |
| `design/holo.js` | Builds each card's shine from its name (hash, colors, pattern and variant), drives shine and tilt with springs, and draws the tag symbols. |
| `design/controle.js` | Gamepad and arrow-key navigation. |
| `design/marca.svg` | The logo symbol, used as the favicon. |

Every page starts like this, in this order:

```html
<script src="design/tema.js"></script>          <!-- in <head>, before the CSS: avoids a flash of the wrong theme -->
<link rel="stylesheet" href="design/tokens.css">
<link rel="stylesheet" href="design/components.css">
<link rel="stylesheet" href="design/carta.css">  <!-- only on pages that show cards -->
```

A page's own CSS handles layout only (grid, position, spacing between blocks). Color, font, radius, shadow and duration always come from a token.

## Principles

1. **The card is the center.** Each game is a shiny collectible card. The rest of the interface stays quiet so the card stands out: flat background, discreet controls, a single action color.
2. **Every name has its own shine.** A card's shine, frame and symbol come from the game's name. Nobody picks card colors by hand; the same name always produces the same card.
3. **Playable without a mouse.** Everything that works with a click works with the keyboard and with a gamepad. No action may depend on hover alone.
4. **Motion answers someone.** Animations happen when the person does something (hovers, filters, switches theme). The only automatic sequence is the logo opening. Cards have no entrance animation. With `prefers-reduced-motion`, everything stays still.
5. **Light first.** The light theme is the default. Dark is the person's choice, never the operating system's.

## Color

Token names are the same in both themes; only the value changes. Never write a hex value directly in a page's CSS.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#e9ebf5` | `#0f1030` | Page background (the "album"). |
| `--bg-deep` | `#dcdfee` | `#0a0b24` | Segmented control track, recessed areas. |
| `--surface` | `#ffffff` | `#1a1c45` | Panels, search field, buttons. |
| `--surface-2` | `#f4f5fb` | `#23265a` | Control hover, secondary panel. |
| `--ink` | `#17183b` | `#eef0ff` | Primary text. |
| `--ink-2` | `#4a4d72` | `#a9add8` | Secondary text. |
| `--ink-3` | `#75789c` | `#7c80b0` | Placeholder, muted icon. Do not use for text that must be read. |
| `--line` / `--line-strong` | ink at 12% / 22% | ink at 12% / 24% | Borders and dividers. |
| `--accent` | `#4b2bff` | `#8f7dff` | The only action color: primary button, focus, selection. |
| `--accent-ink` | `#ffffff` | `#0f1030` | Text on `--accent`. |
| `--accent-soft` | accent at 12% | accent at 18% | Selection background, focus halo. |
| `--hot` | `#e8176f` | `#ff5ca8` | Only for "new": the "Nova" stamp, the new-version dot. |
| `--scrim` | background at 82% | background at 80% | Sticky top bar (always with blur). |
| `--change-novo`, `--change-buff`, `--change-nerf`, `--change-rework`, `--change-ajuste` | `#9a6700`, `#1a8547`, `#c93030`, `#6a3df0`, `#0b7a96` | `#ffc94d`, `#4fe08f`, `#ff7070`, `#b49bff`, `#5fd8f2` | Change types in update notes (new, buff, nerf, rework, tweak). Text on them: `--change-ink` (white in light, dark ink in dark); contrast of at least 4.5:1 in both themes. |
| `--holo-1` to `--holo-5` | violet, magenta, orange, cyan, indigo | lighter pastel versions | Holographic spectrum of the logo, the search ring and the opening. |

Rules:

- One action color only (`--accent`). Buttons, links and focus never get other colors.
- `--hot` is not an action color; it only signals something new.
- Shadows are tinted with the page ink (`--shadow-1`, `--shadow-2`, `--shadow-3`), never pure black.
- Tag and card colors come from `holo.js`, not from tokens.
- The card is a physical object and has the same colors in both themes. Its tokens are `--card-ink`, `--card-ink-2` (printed text), `--card-silver` and `--card-silver-edge` (metallic strips) and `--card-dim` (the dark theme lowers the overall brightness slightly).

## Typography

| Token | Font | Use |
| --- | --- | --- |
| `--font-display` | Unbounded (500–800) | Logo, card name, section titles, "Nova" stamp. |
| `--font-body` | Instrument Sans (400–700) | Everything else. |

Scale of 1.25 from 16px: `--fs-1` 12, `--fs-2` 14, `--fs-3` 16, `--fs-4` 20, `--fs-5` 25, `--fs-6` 31, `--fs-7` 39, `--fs-8` 49. Line heights: `--lh-tight` 1.1 (display), `--lh-snug` 1.3, `--lh-body` 1.5.

Rules:

- Unbounded always uses negative `letter-spacing` (from `-.01em` to `-.035em`) and weight 700 or 800. Never for running text.
- No all-caps labels. Sentence case ("Mais jogadores", not "MAIS JOGADORES").
- No monospace font for small data. The only exception is `<code>` with a command name.
- Running text lines of 60 characters at most (`max-width: 56ch` to `60ch`).

## Spacing, radius and layers

- Spacing on a base of 4: `--sp-1` 4, `--sp-2` 8, `--sp-3` 12, `--sp-4` 16, `--sp-5` 24, `--sp-6` 32, `--sp-7` 48, `--sp-8` 64.
- Side margin (`--gutter`): 16px on phones, 32px from 720px up. Maximum page width: `--page-max` (1240px). Use `.wrap` for both.
- Radius by hierarchy, not one value for everything: `--r-xs` 6 (stamps), `--r-sm` 10 (inner boxes), `--r-md` 14 (panels), `--r-card` (the card: `4.55% / 3.5%`, the curve of a collectible card), `--r-pill` (chips, buttons, search).
- Layers: `--z-card-ui`, `--z-bar` (sticky bar), `--z-pop`, `--z-hint` (gamepad bar), `--z-intro` (opening).

## Motion

| Token | Value | Use |
| --- | --- | --- |
| `--dur-1` | 120ms | Hover and click. |
| `--dur-2` | 220ms | State change: selection, theme, color. |
| `--dur-3` | 420ms | Layout: cards moving, panel opening. |
| `--dur-4` | 700ms | Long movements: opening, theme switch, card settling back. |
| `--ease-out` | `cubic-bezier(.2,.8,.2,1)` | Default for almost everything. |
| `--ease-in-out` | `cubic-bezier(.65,0,.35,1)` | Movement from one point to another (logo flying, theme switch). |
| `--ease-spring` | `cubic-bezier(.34,1.56,.64,1)` | Things that "settle": sliding selector, counter, card entering. |

In JavaScript (Web Animations), use the same values. Every new animation needs a still version when `prefers-reduced-motion: reduce` is on; `components.css` already cuts CSS animations, and JS must check `matchMedia('(prefers-reduced-motion: reduce)')`.

## The holographic card

Each game is a card with the structure of a collectible card game (modeled on the Pokémon card), with its own design. Everything inside the card is sized in `cqw` (a percentage of the card width), so it scales as a whole, like a printed card. The aspect ratio is 63 × 88.

```
╔═════════════════════════════════╗  thick frame in the name's color (--h → --h2)
║ ┌─────────────────────────────┐ ║  silver face, tinted by the name
║ │ ◆luta  ⚡multiplayer  ■retrô │ ║  up to 3 tags, shaped like the stage badge
║ │ Game Name                (●) │ ║  name (shrinks to fit one line) + type symbol (1st tag)
║ │ [av] por @author             │ ║  author, like "evolves from", with the GitHub avatar
║ │ ┌─────────────────────────┐  │ ║
║ │ │  game cover       Nova  │  │ ║  art with a silver bevel
║ │ └─────────────────────────┘  │ ║
║ │  ╲ Criada em … · Atualizada ╱ │ ║  data strip (created / updated)
║ │ Game description, up to 5    │ ║  text (4 lines when there are versions)
║ │ lines…                       │ ║
║ │ [Versão] Clássico  Vista…    │ ║  versions, in place of an ability (if any)
║ │ ( modo ◎ Online │ jogadores 1–8 ) ║  attributes, like weakness/resistance/retreat
║ │ ▪ FLP 02/04   [Notas de atualização] ║  collection number (creation order) and notes
║ └─────────────────────────────┘ ║
╚═════════════════════════════════╝
```

Attributes:

- Online game: mode "Online" and the number of players.
- Game for more than one person, without online: mode "Local" and the number of players.
- Single-player game: only "Um jogador" (one player).

### From name to shine

`Holo.style(name)` always does the following, in this order:

1. **Hash** of the name (cyrb53, case-insensitive, outer spaces trimmed).
2. **Seed** for a pseudorandom generator (mulberry32). Everything below comes from it.
3. **Hue** `--h` (0–359): frame, shine color (`--card-glow`) and the color fan `--sp-1` to `--sp-6` (180° around `--h`).
4. **Second hue** `--h2`: `--h` + 30 to 150 degrees, for the frame gradient and highlights.
5. **Pattern**, one of seven families (`estrelas` stars, `listras` stripes, `losangos` diamonds, `ondas` waves, `raios` rays, `aneis` rings, `pixels`), with randomized count, angle, thickness and position. It becomes a white SVG the size of the card: `--foil`, the shine texture.
6. **Shine variant** (`data-holo`), one of seven, like the rarities of a card game.

| Variant | Where it shines | How |
| --- | --- | --- |
| `holo` | Art only | Rainbow bands at 110° over fine lines and vertical bars (the classic holo). |
| `cosmos` | Art only | The name's pattern becomes a sky of colored sparkles. |
| `reverso` | The whole card except the art | Crossed light and shade with the pattern sparkling (reverse holo). |
| `arco-iris` | Card and art | Broad rainbow with the pattern on top. |
| `radiante` | The whole card | Crossed 45° weaves that light up with the light (radiant). |
| `linhas` | Card and art | Metallic diagonal stripes over color bands. |
| `ouro` | Card and art | Golden shine with sparkles in the name's pattern. |

The layers follow the technique of [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css): `.face__shine` and `.art__shine` (with `::before` and `::after`) use `mix-blend-mode: color-dodge` and move with the interaction variables; `.card__glare` is the white light on top of everything. `color-dodge` only shows on mid tones, which is why the card face is silver and not white. Do not lighten the face.

### Interaction

`Holo.attach(card)` starts springs (the same constants as pokemon-cards-css) that update `--pointer-x/y`, `--pointer-from-center/top/left`, `--background-x/y`, `--rotate-x/y` and `--card-opacity`:

- **At rest:** the shine sits at 32% (`--shine`), so the card already looks shiny.
- **Mouse over** (`.is-active`): the card grows 4%, tilts up to 14° toward the pointer, shine and light follow, and the shadow grows. The shadow is always neutral, never in the name's color. On leave, it wobbles back.
- **Keyboard or gamepad focus:** the light moves around the card on its own (`ctl.auto(true)`).
- **Reduced motion:** no tilt; the shine stays.

Do not pick color, pattern or variant by hand. To preview a card, run `Holo.style('Name')` in the console.

Tag symbols (`Holo.glyph(tag)`) and their color (`Holo.tagHue(tag)`) also come from the tag's hash, and are the same in the filter, the stamps and the type symbol.

## Components

| Component | Class | Notes |
| --- | --- | --- |
| Logo | `.logo` > `.logo__mark` + `.logo__word[data-text]` | Word with a holographic gradient that drifts slowly and a glint from time to time. `data-text` must repeat the text. |
| Button | `.btn` + `.btn--primary` / `.btn--ghost` / `.btn--icon` | Minimum target of 44px (36px only in dense bars, such as the player's). Optional counter: `.btn__count`. |
| Theme toggle | `.theme-toggle[data-theme-toggle]` | `tema.js` wires the click. The switch opens a circle from the button. |
| Search | `.search` with `input`, `.search__count`, `.search__clear`, `.search__key` | Holographic ring spins on focus; the magnifier bobs on each key (`.is-typing`); `.has-text` shows the clear button. Shortcut `/`. |
| Segmented control | `.seg` > `.seg__thumb` + buttons with `aria-pressed` | JS positions the thumb with `--x` and `--w`. For a single choice among a few options (sort order). |
| Chip | `.chip[aria-pressed]` | On/off filter. `--c` changes the selection color (tags use their symbol color). `.chip__n` shows the count. |
| Collapsible panel | `.collapse` > div, `.is-open` | Opens by animating its height. The controlling element needs `aria-expanded`. |
| Card | `.card[data-holo]` > `.card__rotator` > `.card__face` + `.card__hit` + `.card__glare` | See the section above. Built in `catalogo.js`; the `.card__hit` link covers the card and is what receives focus. |
| Hint bar | `.hintbar.is-on` with `.pad-btn--a/b/x/y` | Appears on its own when the person uses a gamepad. |
| On-screen keyboard | `.osk` | For typing with a gamepad. Trap navigation inside it with `Controle.trap`. |
| Key or command | `kbd.kbd` | A game command inside text (`↓↘→ + Soco`). Does not wrap. |
| Type badge | `.badge` with `--c: var(--change-*)` | Change type (Novo, Buff, Nerf, Rework, Ajuste). |
| Search highlight | `mark` | Thick underline in the action color, no yellow background. |

## Gamepad and keyboard

`controle.js` moves focus to the nearest element in the pressed direction, with the d-pad, the analog stick and the keyboard arrows.

Default catalog mapping (follow the same on new pages):

| Button | Action |
| --- | --- |
| D-pad / stick / arrows | Move focus. |
| A | Activate what has focus (on the search field, opens the on-screen keyboard). |
| B | Back: closes the keyboard or the panel, clears the search, goes up to the search. |
| Y | Search. |
| X | Open and close the filters. |
| LB / RB | Switch the version of the focused card (keyboard: `[` and `]`). |
| LT / RT | Change the sort order. |
| Select / View | Switch the theme. |
| Start | Play the focused card. |

Rules:

- Everything clickable is an `<a href>` or a `<button>`. That way it joins navigation on its own.
- `data-nav="skip"` removes an element from directional navigation (it stays in the Tab order). Use it for secondary controls inside a card that have their own shortcut.
- Focus must be visible: `:focus-visible` and `[data-input="pad"] :focus` draw the ring in the action color.
- `<html>` gets `data-input="pad" | "key" | "mouse"` according to the last input used.
- The player (`play.html`) does not load `controle.js`: there, the gamepad belongs to the game.

## Opening

On the first visit of each session, the logo appears large in the middle of the screen, with a flash and spinning rings of light (inspired by the Xbox 360 boot), and flies to the corner. Then the rest of the page appears. Cards appear together with the page, with no animation of their own.

- A click, tap, key or gamepad button skips the opening.
- It runs once per session (`sessionStorage`, key `fliperama:abertura`): a new tab or a private window shows it again; coming back from a game in the same tab does not.
- With reduced motion on in the system (`prefers-reduced-motion`), there is no opening.

## Copy

- Interface text in Brazilian Portuguese: short sentences, active voice, conversational tone.
- A button says what happens: "Limpar filtros" (clear filters), "Tela cheia" (full screen), "Pronto" (done).
- An empty state says what to do: "Nenhuma carta com “zelda”." (no card matches "zelda") and a "Limpar busca e filtros" button.
- Errors say what happened and how to fix it, without apologizing.

## Checklist before publishing an interface change

1. No loose hex, font, radius, shadow or duration: tokens only.
2. Tested in both themes.
3. Tested with the keyboard (Tab and arrows) and, if possible, with a gamepad.
4. Tested at 375px wide with no horizontal scroll.
5. Tested with `prefers-reduced-motion: reduce`.
6. Any new component or token lives in `design/` and in this document.
