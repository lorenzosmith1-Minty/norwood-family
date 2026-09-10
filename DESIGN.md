# Design Brief

## Direction
Norwood — the warm sepia family archive extended into Family Recipes, where family dishes, handwritten notes, and kitchen stories are preserved as keepsakes on the same aged-paper identity, marked by a spiced-rust kitchen accent and a handwritten "source material" label for original recipe media.

## Tone
Refined, emotional, minimal — the same warm paper-and-ink contrast as the rest of the family app; recipes read like opening a family recipe box, with handwritten originals honored as source material rather than typed into a generic recipe app.

## Differentiation
A keepsake recipe layer: recipe cards and detail pages wear a spiced-rust kitchen accent (distinct from the sepia primary and bronze accent), and handwritten recipe media is clearly stamped as "source material" with a dashed ink label so an original family artifact is never mistaken for a modern typed note.

## Color Palette
| Token              | OKLCH (light) | OKLCH (dark) | Role                              |
| ------------------ | ------------- | ------------ | --------------------------------- |
| background         | 0.96 0.02 70  | 0.16 0.02 55 | warm cream paper                  |
| foreground         | 0.22 0.04 45  | 0.93 0.02 60 | deep ink-brown text               |
| card               | 0.985 0.015 70 | 0.2 0.02 55 | clean paper card                |
| primary            | 0.42 0.11 35  | 0.72 0.14 60 | sepia/terracotta accent           |
| accent             | 0.55 0.09 60  | 0.58 0.12 30 | dusty bronze highlight            |
| recipe-accent      | 0.5 0.14 30   | 0.72 0.13 30 | spiced-rust kitchen accent        |
| recipe-accent-foreground | 0.96 0.02 70 | 0.16 0.02 55 | text on recipe accent           |
| recipe-hand        | 0.32 0.06 40  | 0.82 0.05 55 | handwritten source-material ink   |
| recipe-surface     | 0.94 0.025 65 | 0.22 0.025 55 | warm plate for recipe cards/sections |
## Typography
- Display: Fraunces — recipe titles, dish names, section heads (warm serif)
- Body: General Sans — descriptions, ingredients, instructions, chips, hints (clean modern contrast)
- Mono: Geist Mono — eras, years, contributor metadata (tabular numerals)
- Scale: card title `font-display text-lg`, section title `text-xs uppercase tracking-[0.2em]`, badge `text-[11px] uppercase tracking-[0.12em]`, era `text-[11px] tabular-nums`
## Elevation & Depth
Layered paper with a single keepsake accent: recipe cards and gallery items lift gently on hover with `shadow-subtle`/`shadow-recipe`/`shadow-elevated`, while the spiced-rust accent marks active filters, section heads, and the empty-state crest.
## Structural Zones
| Zone    | Background  | Border   | Notes                          |
| ------- | ----------- | -------- | ------------------------------ |
| Header  | bg-card     | border-b | title + back over paper        |
| Filters | bg-background | —      | `.filter-bar` tabs (All Recipes/Member/Era/Branch/Tag) |
| Content | bg-background | —      | `.recipe-card` grid, `.recipe-detail` hero + info column |
| Footer  | bg-muted/40 | border-t | closing line                   |
## Spacing & Rhythm
Mobile-first single column (`max-w-2xl` centered), `px-4` gutters; recipe card grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`; detail `lg:grid-cols-[1.4fr_1fr]` hero + info; gallery `grid-cols-2 sm:grid-cols-3`; empty states `py-16`.
## Component Patterns
- Recipe card: `.recipe-card` (4:3 `.recipe-card-thumb` stage + `.recipe-card-body` with `.recipe-card-title`, `.recipe-card-origin`, `.recipe-card-desc`, `.recipe-card-era`) → `.recipe-detail`
- Detail: `.recipe-detail-hero` primary image stage + `.recipe-detail-section` info column; `.recipe-section` plates for Ingredients/Instructions/Family Story with a spiced-rust head
- Gallery: `.recipe-gallery` / `.recipe-gallery-item` grid of recipe media on warm plates
- Source material: `.source-material` dashed handwritten-ink label marking original recipe media
- Empty state: `.recipe-empty-state` dashed plate with `.recipe-empty-mark` crest + title + hint + `.recipe-empty-action`
- Filters: reuse `.filter-tab`/`.filter-select`; `.filter-tab-active-recipe` for the All Recipes tab; forms reuse `.form-input`/`.field-label`/`.dropzone`
## Motion
- Entrance: `recipe-in` on recipe cards; `fold-in` on detail sections
- Hover: card/gallery lift + shadow 0.3s; thumb border warms to the recipe accent
- Decorative: empty states stay calm; no pulsing on recipe surfaces
## Constraints
- Token-only styling — no raw hex/rgb in components; mobile-first; min 44px tap targets with visible focus rings
- Preserve the existing Norwood identity — do NOT redesign Home or existing pages/navigation; keep NAV_ACTIVE = 'border-accent bg-accent/15 text-foreground'
- Family Archive remains the primary navigation parent; do NOT add Family Recipes as a permanent top-level navbar pill
- Handwritten recipe media is always labeled `.source-material` as original family source material
- Preserve the Norwood multi-select UX rule (immediate checkmark, saved selections reopen selected)
- Do NOT build OCR, transcription, ingredient extraction, recipe search, printable cards, cookbook export, or AI cleanup (future-ready model only)
- Never surface internal identifiers (personIds/slugs) in user-facing name displays
## Signature Detail
The keepsake recipe layer: recipe cards and detail pages wear a spiced-rust kitchen accent, and every handwritten recipe is stamped with a dashed "source material" ink label — so a family recipe always reads as a preserved tradition, never a generic recipe app.
