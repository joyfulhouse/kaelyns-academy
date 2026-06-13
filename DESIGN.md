# DESIGN.md — Wonder Studio design system

> The normative token + component contract. `src/app/globals.css` implements this via Tailwind v4 `@theme`. Every surface and every subagent uses these tokens and primitives; do not invent ad-hoc values for a role a token already covers. Read with `PRODUCT.md` (the *why*).

Aesthetic in one line: **a premium picture book that happens to be software** — warm paper, ink, soft thick storybook outlines, a small cast of hand-made SVG characters, generous whitespace. Light, warm, daylight. Never primary-circus, never pastel-rainbow, never SaaS-dark.

---

## 1. Color — OKLCH, warm-tinted, committed strategy

All color is OKLCH. Never `#000`/`#fff`; every neutral is tinted toward the warm brand hue (~70–85°). Chroma drops as L approaches 0/100.

### Neutrals (the paper & ink)
| Token | OKLCH | Role |
|---|---|---|
| `--paper` | `oklch(0.987 0.008 85)` | page background (warm cream) |
| `--paper-raised` | `oklch(0.965 0.011 82)` | raised surface / the rare card |
| `--paper-sunk` | `oklch(0.935 0.013 80)` | wells, insets, track backgrounds |
| `--ink` | `oklch(0.26 0.020 60)` | primary text, storybook outlines |
| `--ink-soft` | `oklch(0.44 0.020 62)` | secondary text |
| `--ink-faint` | `oklch(0.60 0.016 65)` | tertiary / muted / placeholder |
| `--line` | `oklch(0.90 0.012 78)` | hairline borders (1px) |
| `--line-strong` | `oklch(0.83 0.015 74)` | stronger dividers |

### Brand (shell signature)
| Token | OKLCH | Role |
|---|---|---|
| `--honey` | `oklch(0.80 0.135 80)` | wonder, stars, progress, honey buttons (use **ink** text) |
| `--honey-deep` | `oklch(0.70 0.150 76)` | honey hover/active, warnings |
| `--coral` | `oklch(0.66 0.170 34)` | play, decoration |
| `--coral-deep` | `oklch(0.56 0.175 32)` | **primary action** fill (use **on-accent** text) |

### Program accents (themeable — set on a program/world wrapper)
A program root sets `--accent` and `--accent-deep`; components reference those. Shell default `--accent` = honey.
| World | `--accent` | `--accent-deep` |
|---|---|---|
| Sunshine (default/shell) | `oklch(0.80 0.135 80)` | `oklch(0.70 0.150 76)` |
| Under the Sea (ocean) | `oklch(0.70 0.110 222)` | `oklch(0.58 0.125 226)` |
| Blast Off (space) | `oklch(0.58 0.150 300)` | `oklch(0.49 0.160 300)` |
| In the Garden | `oklch(0.72 0.130 150)` | `oklch(0.61 0.140 150)` |
| Big Top (circus/measurement) | `oklch(0.64 0.165 18)` | `oklch(0.55 0.170 20)` |

### Semantic
| Token | OKLCH | Role |
|---|---|---|
| `--success` | `oklch(0.72 0.130 150)` | correct/solid (always paired with a check icon, never color-only) |
| `--warn` | `oklch(0.70 0.150 76)` | parent-surface caution |
| `--danger` | `oklch(0.57 0.170 25)` | parent-surface destructive only; **never** shown to a child as failure |
| `--on-accent` | `oklch(0.99 0.010 85)` | warm-white text on coral-deep/accent-deep fills |

### Contrast pairings (AA+ required; verify in audit)
Approved text/fill combos — use these, don't improvise:
- `--ink` on `--paper` / `--paper-raised` / `--honey` → high contrast ✓ (body, honey buttons/badges)
- `--ink-soft` on `--paper` → secondary text ✓
- `--on-accent` on `--coral-deep` / `--accent-deep` → buttons only, label **≥18px bold** (large-text 3:1) ✓
- `--paper` on `--ink` → inverted bands/footer ✓
- Never put `--on-accent` on `--honey` or light `--accent` (fails). Honey/light accents carry **ink** text.
- Color is never the only signal: pair with icon, shape, position, or text (color-blind + child legibility).

---

## 2. Typography

Two variable fonts, self-hosted via `next/font/google`:
- **`--font-display` = Fraunces** (opsz variable soft serif). Headings, hero, large kid prompts. Weights 400/500/600; soft optical settings. Characterful, warm, picture-book.
- **`--font-body` = Lexend** (variable sans). All body, UI, labels, and *especially* decodable-reader text. Evidence-based for early/striving readers + dyslexia-considerate. Weights 400/500/600/700.

Never ship a system-font-only screen. No third display face.

### Scale (1.25 ratio)
`--text-xs .75rem` · `--text-sm .875rem` · `--text-base 1.0625rem` (17px) · `--text-lg 1.25rem` · `--text-xl 1.5rem` · `--text-2xl 1.9375rem` · `--text-3xl 2.4375rem` · `--text-4xl 3.0625rem` · `--text-5xl 3.8125rem`

- Body line length **65–75ch** max (parent reading surfaces).
- Hierarchy via scale **and** weight contrast (≥1.25 step). No flat scales.
- **Two voices:** `.surface-kid` raises `--text-base` to `1.25rem` and leans `--text-2xl`+ for prompts; `.surface-parent` uses the base scale. Kid line-height looser (1.5–1.6); display tighter (1.05–1.15).

---

## 3. Space, radii, elevation, outline

**Spacing** (4px base): `--space-1 .25rem` … through `--space-2 .5`, `-3 .75`, `-4 1rem`, `-5 1.5`, `-6 2`, `-8 3`, `-10 4`, `-12 6`, `-16 8rem`. **Vary spacing for rhythm** — never uniform padding everywhere.

**Radii** (organic, generous): `--radius-sm .5rem` · `--radius-md .875rem` · `--radius-lg 1.25rem` · `--radius-xl 1.75rem` · `--radius-2xl 2.5rem` · `--radius-pill 999px`. Kid interactive elements lean `xl`/`2xl`/`pill`. Parent UI leans `md`/`lg`.

**Elevation** — soft, warm-tinted shadows (ink hue, low alpha; never gray, never harsh):
- `--shadow-sm`: `0 1px 2px oklch(0.26 0.02 60 / .06)`
- `--shadow-md`: `0 2px 4px oklch(0.26 0.02 60 / .05), 0 6px 16px oklch(0.26 0.02 60 / .08)`
- `--shadow-lg`: `0 4px 8px oklch(0.26 0.02 60 / .06), 0 16px 32px oklch(0.26 0.02 60 / .10)`
- `--shadow-pop` (kid tactile): `0 4px 0 oklch(0.26 0.02 60 / .12)` flat offset for a pressable "sticker" feel; pressed state removes it + translateY(2px).

**Storybook outline** (signature): kid interactive/illustrated elements get a **2px–3px `--ink` outline** (the coloring-book line) plus `--shadow-pop`. This warm thick line is the Wonder Studio fingerprint. Parent surfaces use hairline `--line` instead.

---

## 4. Motion

Library: **`motion`** (v12). Tokens:
- Easing: `--ease-out-expo cubic-bezier(.16,1,.3,1)`, `--ease-out-quart cubic-bezier(.25,1,.5,1)`. **No bounce, no elastic.**
- Duration: `--dur-fast 160ms` · `--dur 240ms` · `--dur-slow 420ms` · `--dur-celebrate 700ms`.

Signature interactions (transform/opacity only — never animate layout props):
- **star-pop**: star scales `.6→1` + fades in, ease-out-expo, with a one-shot sparkle (particles fade+scale out). Earned, not ambient.
- **sticker-place**: reward settles with a quick scale-down to rest (ease-out, no overshoot).
- **path-fill**: the program map path fills/advances as units complete.
- **mascot idle float**: ≤6px vertical drift, 4s, very subtle.
- **page/world transition**: soft cross-fade + 8px rise.

`prefers-reduced-motion: reduce` → drop all movement; keep instant opacity changes only. Honor globally.

---

## 5. Component vocabulary (closed shell — static class maps, JIT-safe)

Use these primitives for their roles. Variants are **static class maps** (no dynamic string interpolation of Tailwind classes). Live in `src/components/ui/`.

- **Button** — variants `primary` (coral-deep/on-accent), `honey` (honey/ink), `soft` (paper-raised + storybook outline + ink), `ghost`, `accent` (program `--accent-deep`/on-accent). Sizes `sm`/`md`/`lg`/`kid`. Kid = outlined + `--shadow-pop` + press state, min 64px. Always real `<button>`/`<a>`, visible focus ring.
- **Surface** — the *rare* card/panel. Tones `paper`/`raised`/`sunk`/`accent-tint`. **No nested Surfaces.** Don't wrap everything; most content needs no container.
- **Pill / Tag** — skill tags, band (`ready`/`stretch`), status. Small, calm; tint + ink text.
- **ProgressRing** & **ProgressPath** — progress viz (ring for a lesson, path for a program map).
- **Stars** — 0–3 earned stars (honey fill + ink outline), with star-pop on award.
- **Mascot** — the star-sprite SVG character (`src/components/art/Mascot.tsx`), moods `happy`/`think`/`cheer`/`wave`, sizes. The friendly face of the product.
- **Icon** — Phosphor wrapper (`@phosphor-icons/react`). Default weight `duotone` on kid, `regular` on parent (`bold` for emphasis). **Never Lucide.**
- **Decorations** — `Sun`, `Hills`, `Waves`, `Sparkles`, `Blob`: organic SVG motifs, accent-tinted, decorative (`aria-hidden`).
- **AppShellKid** vs **DashboardShellParent** — the two surface frames.
- **Field/TextInput/Select/Switch** — parent + auth forms (calm, `--line`, `md` radius, clear labels + error text).

---

## 6. The two surfaces

Set a surface class on the route-group root; it rescales tokens:
- **`.surface-kid`**: `--tap-min: 64px`, `--text-base: 1.25rem`, default radius `xl`+, storybook outlines, fill/duotone icons, accent-forward, audio (TTS) on prompts, almost no chrome text. Forgiving — no error states.
- **`.surface-parent`**: `--tap-min: 44px`, base scale, hairline borders, regular icons, paper+ink dominant + one accent, information-clear, real error/empty/loading states.

---

## 7. Accessibility (the floor)

- Contrast AA+ per §1 pairings; verify with the audit. Never color-only signaling.
- Tap target ≥ `--tap-min` (kid 64px / parent 44px).
- Visible focus: 3px `--accent` ring at 2px offset on every interactive element; never remove outline without replacement.
- Full keyboard path; semantic HTML; correct roles/labels; live regions for async + reward announcements ("You earned 3 stars").
- `prefers-reduced-motion` honored globally (§4).
- Dyslexia-considerate: Lexend, generous line-height/letter-spacing on reader text, left-aligned, short lines.

---

## 8. Anti-patterns (match-and-refuse)

Impeccable absolute bans **plus** ours. If about to write any, restructure:
1. Side-stripe borders (`border-left/right` >1px as accent). Use full borders / tints / leading icon.
2. Gradient text (`background-clip:text`). Solid color; emphasis via weight/size.
3. Glassmorphism as default. Rare + purposeful or never.
4. The hero-metric template (big number + gradient). 
5. Identical card grids (icon+heading+text ×N). Vary structure; prefer non-card layouts.
6. Modal as first thought. Exhaust inline/progressive first.
7. Em dashes in copy (and `--`). Use commas/colons/periods/parentheses.
8. **Ours:** primary-color circus; pastel-rainbow/Duolingo-clone; streak/loss-aversion or gem mechanics; stock photos of children; Comic Sans / system-font-only; any child↔LLM free-chat surface; punitive failure states on the kid surface.

---

## 9. Tailwind v4 `@theme` mapping (globals.css)

Expose tokens so utilities work (`bg-paper`, `text-ink`, `text-ink-soft`, `bg-coral-deep`, `text-on-accent`, `rounded-xl`, `font-display`, `shadow-pop`, `ease-out-expo`). Map: colors → `--color-*`; fonts → `--font-display`/`--font-body`; radii → `--radius-*`; shadows → `--shadow-*`; spacing extends default. Program theming via `--color-accent`/`--color-accent-deep` overridden on a `[data-world]` wrapper. Keep the closed-shell rule: component roles use the primitives above, not raw utilities scattered ad hoc.
