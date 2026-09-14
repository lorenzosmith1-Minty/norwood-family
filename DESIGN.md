# Design Brief

## Direction
Norwood — the warm sepia family archive on paper grain. This pass is a stabilization, not a redesign: the existing visual identity (Fraunces display, General Sans body, Geist Mono, warm paper-and-ink OKLCH palette) is preserved untouched. New tokens and utilities are added only to support three new state types: clear no-access states for gated family-graph pages, explicit Draft vs Saved labeling in profile editing, and server-enforced Archive privacy indicators.

## Tone
Refined, emotional, minimal — warm paper-and-ink contrast throughout. New states are quiet archival tools (a locked reading room, an ink draft note, a privacy label), never a new theme.

## Differentiation
The existing family-archive language extended to privacy: gated pages read as a locked warm plate with a muted lock crest, Draft vs Saved as a three-state ink note (saved green / unsaved bronze / stale ochre), and Archive privacy as a dot-pill (Public green / FamilyOnly bronze / Private terracotta) — all mirroring the archive's status-badge system so every new surface reads native to Norwood.

## Color Palette
| Token            | OKLCH (light) | OKLCH (dark) | Role                              |
| ---------------- | ------------- | ------------ | --------------------------------- |
| background       | 0.96 0.02 70  | 0.16 0.02 55 | warm cream paper                  |
| foreground       | 0.22 0.04 45  | 0.93 0.02 60 | deep ink-brown text               |
| card             | 0.985 0.015 70 | 0.2 0.02 55 | clean paper card                |
| primary          | 0.42 0.11 35  | 0.72 0.14 60 | sepia/terracotta accent           |
| accent           | 0.55 0.09 60  | 0.58 0.12 30 | dusty bronze highlight            |
| draft-saved      | 0.55 0.12 150 | 0.6 0.15 150 | Draft saved locally (warm green)  |
| draft-unsaved    | 0.55 0.09 60  | 0.72 0.14 60 | Draft has unsaved edits (bronze)  |
| draft-stale      | 0.7 0.13 80   | 0.72 0.13 80 | stale local Draft (ochre, clear)  |
| gated-surface    | 0.94 0.02 60  | 0.22 0.02 55 | no-access warm plate              |
| gated-accent     | 0.5 0.03 45   | 0.7 0.1 55  | muted lock crest                  |
| privacy-public   | 0.55 0.12 150 | 0.6 0.15 150 | Archive Public (open green)       |
| privacy-family   | 0.55 0.09 60  | 0.58 0.12 30 | Archive FamilyOnly (bronze)       |
| privacy-private  | 0.5 0.2 25    | 0.55 0.2 25 | Archive Private (terracotta lock) |
## Typography
- Display: Fraunces — page titles, gated-state titles (warm serif)
- Body: General Sans — labels, descriptions, hints (clean modern contrast)
- Mono: Geist Mono — timestamps, counts (tabular numerals)
- Scale: page title `font-display text-xl`, section label `text-xs uppercase tracking-[0.2em]`, badge `text-[11px]`, body `text-sm`, meta `text-[10px]`
## Elevation & Depth
Layered paper with a single sepia ink: cards lift on hover with `shadow-elevated`; the no-access panel is a quiet warm plate with a muted lock ring; Draft chips and privacy badges are flat dot-pills; nothing glows or pulses beyond the gentle draft-pulse on the saved/stale dots.
## Structural Zones
| Zone      | Background  | Border   | Notes                          |
| --------- | ----------- | -------- | ------------------------------ |
| Header    | bg-card     | border-b | consolidated navbar + title    |
| Gated page| gated-surface | border | no-access panel replaces graph |
| Profile   | bg-background | —      | edit form with draft status    |
| Archive   | bg-background | —      | detail with privacy badge      |
| Footer    | bg-muted/40 | border-t | closing line                   |
## Spacing & Rhythm
Mobile-first single column (`max-w-2xl` centered), `px-4` gutters; gated panel `py-14` centered with `gap-4`; draft chip `gap-1.5` dot-pill; privacy badge `gap-1.5` dot-pill; all interactive targets `min-h-[44px]`.
## Component Patterns
- No-access: `.gated-state` (quiet plate) + `.gated-lock` (muted crest) + `.gated-title`/`.gated-hint` + `.gated-rule` + `.gated-action` (request-access pill)
- Draft: `.draft-status` dot-pill with `.draft-saved` (green) / `.draft-unsaved` (bronze) / `.draft-stale` (ochre, pulse)
- Privacy: `.privacy-badge` dot-pill with `.privacy-public` / `.privacy-family` / `.privacy-private`
- Reuses existing `.form-input`/`.field-label`/`.status-pill`/`.claim-badge` language
## Motion
- Entrance: `fold-in` on the gated panel (0.3s rise + fade)
- Hover: card lift + shadow 0.3s; gated-action shadow warms
- Decorative: draft-pulse only on saved/stale dots; calm, collected elsewhere
## Constraints
- Token-only styling — no raw hex/rgb in components; mobile-first; min 44px tap targets with visible focus rings
- Preserve the existing Norwood identity — do NOT redesign Home, family tree, archive, or existing navigation; keep NAV_ACTIVE = 'border-accent bg-accent/15 text-foreground'
- No-access states are privacy gating, not error pages; never show the family graph to guests without approved access
- Draft vs Saved is explicit and local-first; a stale local Draft is cleared after a successful backend save
- Archive privacy (Public / FamilyOnly / Private) is enforced server-side; the badge is an indicator, not the enforcement
## Signature Detail
The family-archive language extended to privacy: a locked warm plate for gated family-graph pages, a three-state ink note for Draft vs Saved, and a dot-pill privacy label — tying access, editing, and archive privacy into the same warm Norwood identity without disturbing existing UI.
