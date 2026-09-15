# AI Commerce Manager — Design System

## What this is

A single-product design system for **AI Commerce Manager**, a private
WooCommerce operations panel: AI-assisted product management, quotations,
bundles, competitor research, inventory intelligence, and an editorial
content studio that publishes to WordPress. It is a self-hosted PHP app
(no SaaS backend) that installs per-store and reads its own branding
(name/logo) from the connected WordPress site at runtime — it is
**white-labelled by design**, so there is one visual system serving every
install, not a marketing site plus an app.

### Source material

- Attached local codebase: `AI-Commerce-Manager-v4.10.1/danfos-ai-product-manager/`
  (PHP 8.1, no build step, no framework — plain PHP templates + vanilla JS +
  one hand-written `assets/styles.css`). No Figma or slide deck was provided.
- Internal/dev codename in the source tree: **"Danfos AI Product Manager"**
  (`danfos-ai-product-manager/`, class names, session keys). **Do not use
  "Danfos" as the product name in new design work.** `docs/TRADEMARK-NOTE.md`
  in the source flags an open, unresolved trademark-proximity risk with
  Danfoss A/S and recommends the software carry a distinct commercial name
  before any public use — this design system uses the app's own public name,
  **AI Commerce Manager**, throughout.
- Primary style source: `assets/styles.css` (2,000+ lines, single file,
  the "v4.2 Aurora workspace redesign" at the bottom is the current visual
  language — everything above it is superseded).
- Markup/structure source: `index.php` (the full app shell, all workspace
  views) and `assets/ui.js` / `assets/suite.js` / `assets/content.js`.

## Index

- `styles.css` — root stylesheet, imports everything under `tokens/`.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `effects.css`.
- `guidelines/` — 14 foundation specimen cards (colors, type, spacing,
  radii, elevation, iconography, brand mark).
- `assets/icons/` — the app's PWA icon set (only real visual asset in the
  source; see Iconography below).
- `components/` — reusable primitives, grouped by concern:
  - `core/`: **Button**, **Badge**, **Card**, **KpiCard**
  - `forms/`: **Field**, **TextInput**, **TextArea**, **Select**
  - `navigation/`: **NavTab**
  - `feedback/`: **Message**, **ConfirmDialog**
  - `commerce/`: **ProductCard**
- `ui_kits/commerce-os/` — one interactive recreation of the app shell
  (sidebar nav, topbar, Assistant/Recommendations/Inventory/Dashboard views).
- `SKILL.md` — Claude-Code-compatible skill wrapper for this folder.

### Intentional additions

Everything except one component maps directly to a real class in the
source `assets/styles.css` (`.primary-button`/`.secondary-button`/etc.,
`.panel`, `.workspace-tab`, `.kpi-card`, `.message`, `.confirm-dialog`,
`.product-card`, form controls). **`EmptyState`** (`core/EmptyState.jsx`)
is new, added during the bold redesign at the user's request for a
friendlier first-run/no-results state; it has no source counterpart.

## Content fundamentals

- **Language**: all in-product copy is Albanian (`<html lang="sq">`). Do
  not translate UI strings to English in mockups unless the user asks —
  write new copy in the same register as the source.
- **Voice**: direct, procedural, second-person ("Hyni për të kërkuar dhe
  përditësuar produktet…", "Gjeni ose zgjidhni fillimisht një produkt").
  Buttons are verbs in the imperative ("Analizo & rekomando", "Ruaj
  bisedën", "Eksporto katalogun CSV") — never "Submit" or "OK".
  Headings ask a real question the user has ("Çfarë dëshironi të
  realizoni sot?", "Çfarë po shitet dhe sa po gjeneron?").
- **Safety-first framing**: copy constantly reassures that nothing writes
  to the store unseen — "Sistemi nuk publikon asgjë pa konfirmimin tuaj",
  "Parapamje dhe konfirmim aktiv". This is the single most repeated idea
  in the whole app and should show up in any new flow that changes data.
  The product-level phrase for it is *"resolve → plan → preview → confirm
  → execute → read back → audit."*
- **No emoji as UI chrome.** The only emoji in the source are two literal
  ones used as functional glyphs on specific buttons (🎙 voice command,
  ✓ safety confirmation) — never decorative. New copy should not add more.
  Section labels are eyebrow-style ALL CAPS English/mixed technical terms
  ("AI PRODUCT ADVISOR", "COMPETITOR-PRICE INTELLIGENCE") over an Albanian
  question headline — a consistent two-language pairing, not a mistake.
- **Numbers are shown, not narrated.** KPIs and counts render as bare
  stat tiles (`€12,480`, `86`), not sentences.

## Visual foundations — Bold redesign (current)

The system was deliberately redesigned from the extracted baseline above
into a bolder, more colorful, more playful direction, at the user's
request. What changed and why:

- **Palette**: same violet (`--violet-600 #5b21f5`) as the primary
  accent, but pushed more saturated and paired with a near-black ink
  (`#0e0b1f`) for real contrast instead of the old soft-lavender wash.
  Section accents (orange/sales, cyan/catalog, blue/insights, pink/
  marketing) are all brighter and more saturated for the same reason.
  Cards are now solid white (not translucent) so color blocks read crisp
  against them.
- **Type**: switched away from Inter to **Space Grotesk** (`--font-display`)
  for headings, stat numbers and the wordmark, paired with **Plus Jakarta
  Sans** (`--font-sans`) for body/UI text — a more distinctive, characterful
  pairing than the old Inter-everywhere system. Georgia stays for the
  long-form article reading view.
- **Micro-interactions**: buttons, nav tabs, KPI cards and product cards
  now lift/scale on hover and settle on press using a bouncy
  `--ease-spring` easing — a deliberate playful touch the original,
  purely-functional system didn't have.
- **Empty states**: a new `EmptyState` component shows a soft two-tone
  abstract blob (pure CSS gradient, not a drawn illustration) instead of
  a bare "no results" line — see Intentional additions below.
- **Borders & shadows**: borders are now a bolder 2px (was 1px hairline);
  shadows keep the soft, large-radius "floating" character but lean into
  a colored violet tint rather than neutral grey, for more energy.
- **Corner radii**: bumped rounder across the board (10–28px) to read
  friendlier alongside the new bold color blocks.
- **Backgrounds, layout, dark mode, animation timing rules, and
  breakpoints** are otherwise unchanged from the source system — see
  the extracted notes below for those specifics (sticky blur chrome,
  282px sidebar, `theme-night` scope, the 520/780/920/1150/1320 scale).

### Extracted baseline (for reference)

- Backgrounds were soft multi-stop radial gradients (violet + cyan
  tints) over a near-white page — no photography, no hand-drawn
  illustration; product photos are the only imagery, blended with
  `mix-blend-mode: multiply`.
- Animation was minimal and functional: slow (18–24s) decorative
  ring-spins behind the hero AI glyph, `.18–.24s ease` transitions,
  `prefers-reduced-motion` respected.
- Hover/press was a color/gradient swap plus a small `translateY` lift;
  disabled was `opacity:.55` — the bold redesign extends this into a
  full spring-eased lift+scale.
- Layout: fixed 282px sidebar + fluid main column above 1150px, an
  off-canvas drawer below that, and a 5-icon mobile dock under 780px.

## Iconography

- **No icon font and no SVG/PNG icon set for UI chrome.** Every nav item,
  button glyph and status marker in the product is a single **Unicode
  glyph character** (✦ ◎ ▤ ◫ ◇ ↗ ✎ ▦ € ⌁ ≋ ⇄ ⌗ ◒ ◷ ↶ ✧ ✺ ✓), sized with
  `font-size` and colored with `currentColor`/gradients like text. This
  is a deliberate, distinctive choice — new UI should extend this system
  (pick one clear, geometric Unicode symbol per concept) rather than
  introducing an icon library or hand-drawn SVGs.
- The **only real bitmap/vector assets** in the source are the PWA app
  icon set — `assets/icons/app-icon.svg` (dark rounded tile, yellow "P"
  glyph + underline, generic — not a wordmark) and its 192/512/maskable
  PNG exports — copied into this system's `assets/icons/`.
- Emoji appear exactly twice, both as functional button glyphs (🎙 for
  voice input, ✓ inside the safety-confirmation chip) — not decoration.

## Brand mark

**No company logo was supplied and none should be invented.** The
product is white-labelled: at runtime it renders whichever store
installed it — its own uploaded WordPress logo/icon, or, absent that, its
plain name next to a small yellow "AI" badge (`.brand b`). That
name-plus-badge lockup (see `guidelines/wordmark.html`) is the closest
thing this system has to a logo, and it is what should stand in for a
mark in any new design work. The PWA app icon
(`guidelines/brand-mark.html`) is the one fixed, drawable asset — treat
it as the product's icon, not a customer-facing logo.

## Caveats

- Inter is loaded from Google Fonts (`tokens/typography.css`) rather than
  a self-hosted file — the source app relies on `Inter` being present as
  a system/OS font and never actually links or ships it. This is not a
  substitution (Inter is exactly what the source specifies), just a
  hosting choice; swap in real font files if you'd prefer to self-host.
- The source is a single monolithic `styles.css` with no component
  boundaries — the component split here (Button/Badge/Card/etc.) is this
  design system's own reading of that CSS, not a 1:1 port of named source
  components.
- Only one product surface exists in the source (the panel itself, plus
  its login/setup screens) — there is no separate marketing site or
  native mobile app to build a second UI kit for.
