# Design System — "Concrete & Signal"

How the agtls UI is themed, the decisions behind it, and the rules to follow when
adding or changing UI. Read this before touching `globals.css`, fonts, colors, or
any page chrome.

> Status: this documents the in-progress redesign on the working branch (the
> "Agent Datasheet" identity). It supersedes the earlier dark + Newsreader +
> signal-green system. If you find code still on the old system, it's being
> migrated, not intentionally different.

---

## 1. The identity

**Concrete & Signal** — a light, brutalist/editorial "datasheet" look. Heavy ink
rules on a concrete/bone ground, machine vernacular (uppercase mono labels, API
paths as decoration), confrontational display type, and a single electric accent.
The aesthetic is deliberately developer-facing and engineered, not soft/SaaS.

Three visual pillars:

| Pillar | Value |
|---|---|
| **Ground** | Concrete/bone light surfaces — `--bg-app: #d6d4c8`, cards `#e7e5db` |
| **Ink** | Near-black `#15140f` for rules, text, and inverted bands |
| **Signal** | Electric ultramarine `#2018ff` — the one accent, used sparingly |

Square corners (`--radius: 0px`), 2px ink rules for structure, 1px hairlines
(`rgba(21,20,15,…)`) for internal divisions.

---

## 2. Typography

Three families, each with one job. Set via `next/font/google` in
`src/app/layout.tsx`, exposed as CSS variables.

| Family | Variable | Role |
|---|---|---|
| **Archivo** (variable, `wdth` axis) | `--font-archivo` | Display headings, wordmark. Set wide + heavy (`wdth` 102–118, weight 800–840, uppercase) for confrontational scale. |
| **Hanken Grotesk** | `--font-hanken` | Body / prose. Mapped to `--font-sans`. |
| **Spline Sans Mono** | `--font-spline-mono` | All UI labels, nav, code, API paths, data. Uppercase + letter-spaced for the "datasheet" voice. |

`@theme inline` in `globals.css` maps the Tailwind/ShadCN font slots:
`--font-sans → Hanken`, `--font-serif`/`--font-heading → Archivo`,
`--font-mono → Spline Sans Mono`.

> Newsreader is still loaded in `layout.tsx` but is no longer wired into the
> heading/body slots. Don't reach for it in new code; treat it as legacy until
> it's removed.

**Why three families with fixed roles:** the look depends on the *contrast*
between a heavy compressed display face and a neutral mono for machine text. One
family can't carry both registers. Keep each family in its lane — don't set body
copy in mono or headings in Hanken.

---

## 3. Color & the token-override strategy (the most important decision)

The whole app re-skins from **one appended block** at the bottom of
`@theme inline` in `globals.css` (the `CONCRETE & SIGNAL — light re-theme`
section), rather than by editing component code.

**How it works:** every ShadCN semantic var (`--background`, `--primary`, …) and
every app token (`--surface-card`, `--text-strong`, `--line-1`, …) is defined as
`var(--something)`. The re-theme block redefines the *raw* tokens those point at:

- The accent pivot from green → ultramarine is done by overriding the existing
  `--green-300..700` / `--green-soft` / `--green-glow` token values **in place**
  (and `--ds-accent`, `--accent-*`). Nothing was renamed. Components that
  referenced "green" now render blue without edits.
- Surfaces, text ramp, hairlines, radius, shadows, and Shiki syntax colors are
  overridden the same way.
- The block is appended **last** so it wins the cascade over the earlier dark
  values.

**Why:** single-point re-skin. A whole identity/palette change is one contiguous
diff in one file, fully reversible, with zero risk of missing a call site. It
also means the old dark theme is still physically present above — you could gate
it back behind a variant if needed.

**Rules:**
- Never hardcode a hex in a component when a token exists. Reference
  `var(--text-muted)`, `var(--ds-accent)`, `var(--line-1)`, etc.
- To change the palette, edit the override block — don't touch components.
- If you must add a new raw token, add it in `:root`/`@theme` and point semantic
  vars at it; keep the indirection intact.
- The accent token family is still **named** `--green-*` for historical reasons
  but **holds blue values**. Don't "fix" the names in a drive-by — that's a
  rename touching every reference and defeats the single-point strategy. If it's
  ever renamed, do it as a dedicated change.

---

## 4. The landing page is scoped CSS Modules

`src/app/page.tsx` (the marketing landing) uses `src/app/page.module.css`, all
selectors scoped under `.page` with **its own local CSS variables**
(`--ink`, `--paper`, `--signal`, `--rule`, …) declared on `.page`.

**Why:** the landing page is a bespoke, heavily art-directed layout (ruled frame,
hero word-rise, datasheet meta strip, tool grid). It deserves self-contained,
co-located styles rather than polluting the global token set or fighting Tailwind
utility soup. Local vars keep its palette legible and adjustable in isolation.

> Note: the header comment in `page.module.css` says it's scoped "so it never
> touches the dark app pages." That comment predates the global light re-theme —
> the app pages are now light concrete too. The *scoping* is still correct and
> intentional; the *justification in the comment* is stale. Verify before relying
> on it; consider updating the comment when you next touch the file.

**Rule:** new bespoke marketing/landing surfaces → CSS Module scoped to a root
class with local vars. Shared app chrome (headers, resource shells, dashboards) →
global tokens.

---

## 5. Shared app chrome mirrors the landing identity

`src/components/app-header.tsx` was reworked to match the landing page: concrete
ground with `color-mix` translucency + blur, 2px ink bottom rule, Archivo
wordmark, uppercase mono nav links separated by hairline left-borders, electric
accent on the primary action. The resource pages (`auth-shell`, `resource-shell`,
dashboard, keys, account) were migrated to the same token set.

The "Tools" grouping is its own component: `src/components/tools-nav.tsx`
(`ToolsMenu`), built on the Base UI navigation menu
(`src/components/ui/navigation-menu.tsx`).

**Why a dedicated nav component on Base UI:** the dropdown needs real keyboard +
screen-reader behavior; Base UI provides it for free. Keeping it self-contained
means it drops into any header without re-wiring.

**Rule:** when app chrome and the landing page diverge visually, the landing page
is the source of truth — bring chrome to it, using tokens (not the landing's
local vars).

---

## 6. Accessibility & motion (non-negotiable)

These patterns are already in `page.module.css`; match them in new work.

- **Content visible by default; animation is the enhancement.** The hero
  word-rise and pulse animations live inside
  `@media (prefers-reduced-motion: no-preference)`. Text is rendered and readable
  even if animation never runs. Never hide content in an initial animation state
  that a reduced-motion user would be stuck in.
- A global `@media (prefers-reduced-motion: reduce)` kills all animation and
  transition under `.page`.
- Focus is explicit: `:focus-visible` → `3px solid var(--signal)` outline with
  offset. Don't remove focus rings.
- The Base UI nav menu carries its own keyboard/ARIA semantics — don't replace it
  with a hand-rolled dropdown.

---

## 7. Layout grammar

- **2px ink rules** = primary structure (frame rails, header/section borders,
  band separators).
- **1px hairlines** = internal subdivisions (between tool cells, nav links,
  footer columns).
- **Ruled grids over cards.** Sections are full-bleed bands separated by rules; a
  central `.frame` (max-width 1360px) carries left/right ink rails. Inverted
  (ink-ground) bands punctuate — e.g. the CTA.
- **Responsive collapses the grid, keeps the rules:** multi-column grids fold to
  fewer columns / single column at 1024 / 860 / 600px; rails drop on the smallest
  breakpoint.

---

## 8. Files that own the system

| File | Owns |
|---|---|
| `src/app/globals.css` | Token definitions, ShadCN mapping, the light re-theme override block, base element styles |
| `src/app/layout.tsx` | Font loading (`Archivo`, `Hanken_Grotesk`, `Spline_Sans_Mono`, legacy `Newsreader`) |
| `src/app/page.module.css` | Bespoke landing-page styles, scoped to `.page` with local vars |
| `src/app/page.tsx` | Landing page markup (`TOOLS`, `PRINCIPLES` data + datasheet sections) |
| `src/components/app-header.tsx` | Shared sticky datasheet header for app pages |
| `src/components/tools-nav.tsx` | `ToolsMenu` dropdown (Base UI) |
| `src/components/ui/navigation-menu.tsx` | Base UI navigation-menu primitives |

---

## TL;DR for the next agent

1. **Theme via tokens, not hexes.** Palette changes go in the override block in
   `globals.css`. Components reference `var(--…)`.
2. **The accent tokens are named `--green-*` but are blue.** Leave the names alone.
3. **Three fonts, fixed roles:** Archivo (display), Hanken (body), Spline Sans
   Mono (labels/data). Newsreader is legacy.
4. **Landing page = scoped CSS Module** with local vars. Shared chrome = global
   tokens, matched to the landing identity.
5. **2px rules for structure, 1px hairlines for subdivision, square corners,
   one electric accent.**
6. **Content readable without animation; reduced-motion + focus-visible respected.**
