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
| `design/carta.css` | The card: structure, solid colors and the four holo variants. |
| `design/tema.js` | Light and dark theme, saved in `localStorage` (`fliperama:tema`). |
| `design/holo.js` | Builds each card from its name (hash, color, pattern and holo variant), drives tilt and holo with springs, and draws the tag symbols. |
| `design/controle.js` | Gamepad and arrow-key navigation. |
| `design/marca.svg` | Favicon: a solid "F" monogram. |

Every page starts like this, in this order:

```html
<script src="design/tema.js"></script>          <!-- in <head>, before the CSS: avoids a flash of the wrong theme -->
<link rel="stylesheet" href="design/tokens.css">
<link rel="stylesheet" href="design/components.css">
<link rel="stylesheet" href="design/carta.css">  <!-- only on pages that show cards -->
```

A page's own CSS handles layout only (grid, position, spacing between blocks). Color, font, radius, shadow and duration always come from a token.

## Principles

1. **Solid colors, no rainbow.** Every surface is one flat color: background, text, logo, panels, card frame and face. The only gradients allowed are the card holo and shadows. The holo follows pokemon-cards-css, but in the card's own hue only (plus black and white): never a rainbow.
2. **The card is the center.** Each game is a collectible card. The rest of the interface stays quiet so the card stands out: flat background, discreet controls, a single action color.
3. **Every name has its own card.** A card's color and printed pattern come from the game's name. Nobody picks card colors by hand; the same name always produces the same card.
4. **Playable without a mouse.** Everything that works with a click works with the keyboard and with a gamepad. No action may depend on hover alone.
5. **Motion answers someone.** Animations happen when the person does something (hovers, filters, switches theme). The only automatic sequence is the logo opening. Cards have no entrance animation. With `prefers-reduced-motion`, everything stays still.
6. **Dark first; light in black and white.** The dark theme is the default. The light theme is the person's choice (never the operating system's), and its interface uses only two colors: pure black (`#000`) and pure white (`#fff`), so the cards are the only color on screen.
7. **Square corners.** `border-radius` is 0 everywhere, in both themes: buttons, fields, chips, panels, badges, dots and the card itself.

## Color

Token names are the same in both themes; only the value changes. Never write a hex value directly in a page's CSS.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#fff` | `#0f1030` | Page background. |
| `--bg-deep` | `#fff` | `#0a0b24` | Segmented control track, recessed areas. |
| `--surface` / `--surface-2` | `#fff` / `#fff` | `#1a1c45` / `#23265a` | Panels, fields, buttons, hover. |
| `--ink` / `--ink-2` / `--ink-3` | `#000` / `#000` / `#000` | `#eef0ff` / `#a9add8` / `#7c80b0` | Text. In light, tell levels apart by size and weight, never by grey. |
| `--line` / `--line-strong` | `#000` / `#000` | ink at 12% / 24% | Borders and dividers. In light, panels are separated by a 1px black outline. |
| `--accent` / `--accent-ink` | `#000` / `#fff` | `#8f7dff` / `#0f1030` | The only action color: primary button, focus, search highlight. |
| `--accent-soft` | `#fff` | accent at 18% | Soft background. In light it has no tint, so anything on it needs an outline. |
| `--pressed-bg` / `--pressed-ink` | `#000` / `#fff` | not set | Selected or hovered state in light: inverted. In dark it is not set and each component falls back to its own selection color (`var(--pressed-bg, …)`). |
| `--hot` / `--hot-ink` | `#000` / `#fff` | `#ff5ca8` / `#0f1030` | Only for "new": the "Nova" stamp, the new-version dot. |
| `--scrim` | `#fff` | background at 80% | Sticky top bar (always with blur). |
| `--change-*` / `--change-ink` | all `#000` / `#fff` | `#ffc94d`, `#4fe08f`, `#ff7070`, `#b49bff`, `#5fd8f2` / `#0f1030` | Change types in update notes. In light the type name tells them apart. |
| `--shadow-1` to `--shadow-3` | `0 0 0 0 transparent` | soft shadows | No shadows in light (they would be grey). The value stays valid inside `box-shadow` lists, so never set it to `none`. |
| `--shadow-lift` | `8px 8px 0 #000` | soft shadow | Something that lifts (the active card). In light, a solid black offset. |

Rules:

- Light theme: only `#000` and `#fff` outside the cards. No grey, and no opacity on interface text or icons (it turns them grey): show an empty or disabled state with a different treatment, such as a strikethrough or an outline.
- One action color only (`--accent`). Buttons, links and focus never get other colors.
- `--hot` is not an action color; it only signals something new.
- Shadows are tinted with the page ink (`--shadow-1`, `--shadow-2`, `--shadow-3`), never pure black.
- No `linear-gradient`, `radial-gradient` or `conic-gradient` in backgrounds, text or SVG fills. The single exception is the card holo (`carta.css`), which uses one hue plus black and white. Transparency is allowed to show a solid color lighter (for example `--accent-soft`).
- Tags have no color of their own: their symbols use the text color.
- The card hue comes from `holo.js`, not from tokens.
- The card has a light and a dark design (see "The card"). Its colors live in `carta.css` as `--card-*` variables built from the name hue, not in `tokens.css`.

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
- Control height (`--control-h`, 48px): search, segmented control and buttons share it, so controls placed side by side line up. Dense bars (like the player's) may go smaller, but all controls in the same row use the same height.
- Side margin (`--gutter`): 16px on phones, 32px from 720px up. Maximum page width: `--page-max` (1240px). Use `.wrap` for both.
- Radius: every `--r-*` token is 0 and no component may set its own `border-radius`. Corners are always square, in both themes.
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

## The card

Each game is a card with the structure of a collectible card game (modeled on the Pokémon card), with its own design. Everything inside the card is sized in `cqw` (a percentage of the card width), so it scales as a whole, like a printed card. The aspect ratio is 63 × 88. Every part is a solid color; the holo runs on top.

```
╔═════════════════════════════════╗  thick frame in the name's color (--card-frame)
║ ┌─────────────────────────────┐ ║  mid-tone silver face in the same hue
║ │ ◆luta  ⚡multiplayer  ■retrô │ ║  up to 3 tags, shaped like the stage badge
║ │ Game Name                (●) │ ║  name (shrinks to fit one line) + type symbol (1st tag)
║ │ [av] por @author             │ ║  author, like "evolves from", with the GitHub avatar
║ │ ┌─────────────────────────┐  │ ║
║ │ │  game cover       Nova  │  │ ║  art with a white frame
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

### From name to card

`Holo.style(name)` always does the following, in this order:

1. **Hash** of the name (cyrb53, case-insensitive, outer spaces trimmed).
2. **Seed** for a pseudorandom generator (mulberry32). Everything below comes from it.
3. **Hue** `--h` (0–359). All card colors are solid tones of this one hue, set in `carta.css`:

Dark card (default theme) and light card share the structure; only these variables change, set on `.card` and on `[data-theme="dark"] .card`:

| Variable | Light card | Dark card | Use |
| --- | --- | --- | --- |
| `--card-frame` | `hsl(h 55% 50%)` | `hsl(h 60% 46%)` | Frame. |
| `--card-face` | `hsl(h 18% 80%)` | `hsl(h 32% 15%)` | Face. The light one is a mid tone on purpose: `color-dodge` only shows on mid tones, so do not lighten it. |
| `--card-panel` | `#fff` | `hsl(h 30% 22%)` | Tags, author strip, art frame, data strip, attributes. |
| `--card-line` | `#000` | `hsl(h 35% 36%)` | Panel outlines and dividers (`--card-panel-edge`). |
| `--card-ink` / `--card-ink-2` | `#000` / `#000` | `#eef0ff` / `hsl(h 25% 80%)` | Printed text. |
| `--card-strong` / `--card-on-strong` | `hsl(h 55% 32%)` / `#fff` | `hsl(h 85% 72%)` / `hsl(h 45% 12%)` | Type symbol, "Versão" badge, icons, fallbacks, and the text on them. |
| `--card-edge` | `#000` | transparent | Outline of the whole card. |
| `--shine` | 32% at rest, 100% active | 20% at rest, 55% active | Holo strength. On the dark face `color-dodge` lights up much more, so it is capped to keep the text readable. |
| `--sp-1` to `--sp-6` | six tones of `h` | same | Monochrome "sunpillars": they replace the rainbow colors of pokemon-cards-css. |

The light card looks printed: black outlines on the card and every rectangular panel, black text, like the black and white interface. The dark card is a night version: dark face tinted by the name, panels one step lighter, light text and symbols in a light tone of the hue.

4. **Pattern**, one of seven families (`estrelas` stars, `listras` stripes, `losangos` diamonds, `ondas` waves, `raios` rays, `aneis` rings, `pixels`), with randomized count, angle, thickness and position. It becomes a white SVG the size of the card, with no transparency: `--foil`, the texture some variants use (like the glitter and foil images in the original repo).
5. **Holo variant** (`data-holo`), one of four, like the rarities of a card game.

### Holo

The holo follows [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css): the same layers (`shine` with `::before` and `::after`, and `glare`), blend modes, filters and background positions driven by the pointer. The one change: every rainbow ("sunpillar") color of the original is replaced by `--sp-1` to `--sp-6`, tones of the card hue. Never add a color from another hue.

| Variant | Original recipe | Where it shines |
| --- | --- | --- |
| `holo` | regular holo: bands at 110° over scanlines and vertical bars | Art only (`.art__shine`) |
| `reverso` | reverse holo: crossed light and shade, pattern sparkling | The whole face except the art (`.face__shine`) |
| `cintilante` | rainbow secret: wide bands at -30° with the pattern sparkling | Face and art |
| `secreta` | secret rare: conic tones and metal in the card hue, pattern glitter | Face and art |

`.card__glare` is the white light on top of everything (`overlay`), the same in every variant.

Retired variants: `linhas` (holo V), `cosmos` (cosmos holo) and `radiante` (radiant rare). To keep every other card unchanged, `holo.js` still draws from the original list of seven (`DRAW`); a name that lands on a retired variant draws again among the active ones (`VARIANTS`) with a separate generator, so its pattern does not change. To retire another variant, remove it from `VARIANTS` and from `carta.css`, and keep it in `DRAW`.

At rest the shine sits at 32% on the light card and 20% on the dark card (`--shine`), so the card already looks shiny; the original repo starts at 0%.

### Interaction

`Holo.attach(card)` starts springs with the same constants as pokemon-cards-css and updates `--pointer-x/y`, `--pointer-from-center/top/left`, `--background-x/y`, `--rotate-x/y` and `--card-opacity`:

- **At rest:** the shine sits at 32% on the light card and 20% on the dark card.
- **Mouse over** (`.is-active`): the card grows 4%, tilts up to 14° toward the pointer, the shine and the glare follow it, and the shadow grows. The shadow is always neutral, never in the name's color. On leave, it wobbles back.
- **Keyboard or gamepad focus:** the card tilts on its own, slowly (`ctl.auto(true)`).
- **Reduced motion:** no tilt; the shine still follows the pointer.

Do not pick color, pattern or variant by hand. To preview a card, run `Holo.style('Name')` in the console.

Tag symbols (`Holo.glyph(tag)`) also come from the tag's hash, and are the same in the filter, the stamps and the type symbol.

## Components

| Component | Class | Notes |
| --- | --- | --- |
| Logo | `.logo` > `.logo__word` | Text only: "Fliperama" in Unbounded 800, solid `--ink`, no symbol. On hover the word turns `--accent`. |
| Button | `.btn` + `.btn--primary` / `.btn--ghost` / `.btn--icon` | Minimum target of 44px (36px only in dense bars, such as the player's). Optional counter: `.btn__count`. |
| Theme toggle | `.theme-toggle[data-theme-toggle]` | `tema.js` wires the click. The switch opens a circle from the button. |
| Search | `.search` with `input`, `.search__count`, `.search__clear`, `.search__key` | Solid `--accent` ring on focus; the magnifier bobs on each key (`.is-typing`); `.has-text` shows the clear button. Shortcut `/`. |
| Segmented control | `.seg` > `.seg__thumb` + buttons with `aria-pressed` | JS positions the thumb with `--x` and `--w`. For a single choice among a few options (sort order). |
| Chip | `.chip[aria-pressed]` | On/off filter. `--c` changes the selection color (default `--accent`; the notes page uses `--change-*`). `.chip__n` shows the count. |
| Collapsible panel | `.collapse` > div, `.is-open` | Opens by animating its height. The controlling element needs `aria-expanded`. |
| Card | `.card[data-holo]` > `.card__rotator` > `.card__face` (with `.face__shine`) + `.card__hit` + `.card__glare` | See the section above. Built in `catalogo.js`; the `.card__hit` link covers the card and is what receives focus. |
| Hint bar | `.hintbar.is-on` with `.pad-btn--a/b/x/y` | Appears on its own when the person uses a gamepad. Face buttons are `--accent`, shoulder buttons `--ink`; no per-button colors. |
| On-screen keyboard | `.osk` | For typing with a gamepad. Trap navigation inside it with `Controle.trap`. |
| Key or command | `kbd.kbd` | A game command inside text (`↓↘→ + Soco`). Does not wrap. |
| Type badge | `.badge` with `--c: var(--change-*)` | Change type (Novo, Buff, Nerf, Rework, Ajuste). |
| Bar handle | `.bar-handle[aria-expanded]` (player) | While a game runs, the player bar is hidden and only this small arrow tab shows at the top, at 35% opacity (100% on hover or focus). A click slides the bar down over the game, without resizing it. Clicking the game, pressing Esc or the arrow again hides it; the hidden bar is `inert`. |
| Search highlight | `mark` | Solid `--accent-soft` background, no yellow. |

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
- The player (`play.html`) does not load `controle.js`: there, the gamepad belongs to the game. The game gets the whole screen; the bar stays behind the bar handle.

## Opening

On the first visit of each session, the logo appears large in the middle of the screen, with a solid `--accent` disc and spinning `--accent` rings (inspired by the Xbox 360 boot), and flies to the corner. Then the rest of the page appears. Cards appear together with the page, with no animation of their own.

- A click, tap, key or gamepad button skips the opening.
- It runs once per session (`sessionStorage`, key `fliperama:abertura`): a new tab or a private window shows it again; coming back from a game in the same tab does not.
- With reduced motion on in the system (`prefers-reduced-motion`), there is no opening.

## Copy

- Interface text in Brazilian Portuguese: short sentences, active voice, conversational tone.
- A button says what happens: "Limpar filtros" (clear filters), "Tela cheia" (full screen), "Pronto" (done).
- An empty state says what to do: "Nenhuma carta com “zelda”." (no card matches "zelda") and a "Limpar busca e filtros" button.
- Errors say what happened and how to fix it, without apologizing.

## Checklist before publishing an interface change

1. No loose hex, font, radius, shadow or duration: tokens only. No gradients.
2. Tested in both themes.
3. Tested with the keyboard (Tab and arrows) and, if possible, with a gamepad.
4. Tested at 375px wide with no horizontal scroll.
5. Tested with `prefers-reduced-motion: reduce`.
6. Light theme checked for color: outside the cards, only `#000` and `#fff`.
7. No `border-radius` other than 0.
8. Any new component or token lives in `design/` and in this document.
