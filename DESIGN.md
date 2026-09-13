# Design Brief

## Direction
Norwood — the warm sepia family archive on paper grain, extended with a family card-catalog tagging system and two new archival tools: a Steward-only Hidden/Moderated Posts review and an in-app document Preview. Tags are the connective tissue of the archive: every post and artifact carries bronze-ink tag labels, active tag filters turn sepia, search reads as leafing the catalog, hidden posts read as quiet spiced-rust plates, and a Preview opens a document like a lightboxed original.

## Tone
Refined, emotional, minimal — warm paper-and-ink contrast throughout. Tagging, moderation, and preview affordances are quiet archival tools (a card catalog, a review plate, a reading room), never a new theme.

## Differentiation
A coherent "family card catalog" language extended to the board: tag input with bronze-ink suggestion chips, a tag filter dropdown with free-text search, a spiced-rust Hidden/Moderated review plate, and a dark Preview stage — all mirroring the archive's existing type/status badge system so every new surface reads native to Norwood.

## Color Palette
| Token              | OKLCH (light) | OKLCH (dark) | Role                              |
| ------------------ | ------------- | ------------ | --------------------------------- |
| background         | 0.96 0.02 70  | 0.16 0.02 55 | warm cream paper                  |
| foreground         | 0.22 0.04 45  | 0.93 0.02 60 | deep ink-brown text               |
| card               | 0.985 0.015 70 | 0.2 0.02 55 | clean paper card                |
| primary            | 0.42 0.11 35  | 0.72 0.14 60 | sepia/terracotta accent           |
| accent             | 0.55 0.09 60  | 0.58 0.12 30 | dusty bronze highlight            |
| tag-default        | 0.55 0.09 60  | 0.58 0.12 30 | bronze tag label / dot            |
| tag-active         | 0.42 0.11 35  | 0.72 0.14 60 | active tag filter (sepia pill)    |
| tag-suggest-surface| 0.985 0.015 70 | 0.2 0.02 55 | tag suggestion dropdown          |
| tag-suggest-match  | 0.42 0.11 35  | 0.72 0.14 60 | highlighted matching substring    |
| tag-create         | 0.55 0.09 60  | 0.58 0.12 30 | 'create new tag' affordance       |
| tag-filter-menu    | 0.985 0.015 70 | 0.2 0.02 55 | tag filter dropdown menu         |
| hidden-post-accent | 0.5 0.14 30   | 0.72 0.13 30 | spiced-rust hidden/moderation     |
| hidden-post-surface| 0.94 0.025 65 | 0.22 0.025 55 | hidden post plate               |
| moderated-panel    | 0.95 0.02 72  | 0.21 0.02 55 | moderated review container        |
| preview-stage      | 0.24 0.03 40  | 0.12 0.02 50 | dark document Preview stage       |
| preview-accent     | 0.42 0.11 35  | 0.72 0.14 60 | Preview action (sepia pill)       |
| preview-download   | 0.5 0.03 45   | 0.7 0.1 55  | Download Original (outline)       |
## Typography
- Display: Fraunces — post titles, hidden-post titles, preview titles (warm serif)
- Body: General Sans — labels, descriptions, hints (clean modern contrast)
- Mono: Geist Mono — timestamps, tag counts (tabular numerals)
- Scale: page title `font-display text-xl`, section label `text-xs uppercase tracking-[0.2em]`, tag `text-[11px]`, body `text-sm`, meta `text-[10px]`
## Elevation & Depth
Layered paper with a single sepia ink: tag chips, suggestion rows, and filter menus lift on hover with `shadow-tag`/`shadow-elevated`; the active tag filter is a solid sepia pill with a warm ring; hidden posts sit as quiet plates with a spiced-rust edge; the Preview stage is a dark recessed reading surface.
## Structural Zones
| Zone       | Background  | Border   | Notes                          |
| ---------- | ----------- | -------- | ------------------------------ |
| Header     | bg-card     | border-b | consolidated navbar + title    |
| Board      | bg-background | —      | composer with tag input + filter bar |
| Moderated  | bg-muted/40 | border-t | Steward-only hidden posts review |
| Archive    | bg-background | —      | detail with Preview + Download |
| Preview    | preview-stage | border  | dark in-app document lightbox  |
| Footer     | bg-muted/40 | border-t | closing line                   |
## Spacing & Rhythm
Mobile-first single column (`max-w-2xl` centered), `px-4` gutters; tag composer `gap-1.5`; suggestion rows `min-h-[44px]`; filter menu list `max-h-64` scroll; hidden post `p-4 sm:p-5`; preview stage `max-h-[70vh]` scroll.
## Component Patterns
- Tag input: `.tag-composer` (paper field) + `.tag-suggest` (dropdown) with `.tag-suggest-row` (bronze dot + name, `.tag-suggest-match` sepia highlight) + `.tag-suggest-create` (dashed bronze create-new)
- Tag filter: `.tag-filter-menu` (paper dropdown with `.search-input` on top) listing `.tag-filter`/`.tag-filter-active` chips — reuses existing filter language
- Hidden post: `.hidden-post` (quiet plate) + `.hidden-badge` (spiced-rust dot-pill) + `.hidden-restore` (bronze restore) inside `.moderated-panel`
- Preview: `.preview-action` (sepia pill) + `.preview-download` (outline) opening `.preview-stage` (dark iframe/img lightbox)
- Display tag: `.tag-chip` (existing muted label) — unchanged; post cards reuse `.post-card`/`.post-type-badge`/`.reply-thread`
## Motion
- Entrance: `section-in` on sections (0.35s rise + fade); `fold-in` on suggestion/filter/preview menus (0.25s)
- Hover: chip/card lift + shadow 0.3s; border warms to bronze/sepia or spiced-rust accent
- Decorative: no pulsing on archival surfaces; calm, collected feel
## Constraints
- Token-only styling — no raw hex/rgb in components; mobile-first; min 44px tap targets with visible focus rings
- Preserve the existing Norwood identity — do NOT redesign Home or existing pages/navigation; keep NAV_ACTIVE = 'border-accent bg-accent/15 text-foreground'
- Reuse `.form-input`/`.field-label`/`.filter-bar`/`.search-input`/`.post-card`/`.reply-thread`; reuse `.tag-filter`/`.tag-entry`/`.tag-chip` language
- Tags persist on the canonical post across edits; no tag management page (rename/merge/delete) and no bulk hide/restore
- Preview/Download never alter the original uploaded file; Word and unsupported formats offer Download Original only
- Hidden posts are never deleted; Archive (item) and Hide (board post) remain separate concepts
## Signature Detail
The family card catalog extended across the board: one bronze-ink tag language (suggestion dropdown, filter menu, dashed create-new) plus a spiced-rust moderation plate and a dark Preview lightbox — tying board tagging, Steward review, and Archive document viewing into a single warm archive without disturbing the existing Norwood identity.
