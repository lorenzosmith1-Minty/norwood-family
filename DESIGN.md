# Design Brief

## Direction
Anchored Album — the warm sepia Norwood archive extended into two complementary family explorations: Explore Family (a focused relationship navigator with the selected person as the true center of a tight radial constellation) and Heritage Branch (a true 10,000-foot family map of major family units and branch anchors, not a full tree).

## Tone
Refined, emotional, minimal — warm paper-and-ink contrast of vintage imagery with crisp contemporary type; the family reads as a calm, tappable constellation rather than a dense ledger.

## Differentiation
A single person at the heart of a small bronze-haloed constellation — father upper-left, mother upper-right, spouse beside, siblings in a compact row, children below — with tap-to-recenter navigation and no long connector lines or infinite canvas, turns genealogy into an intimate, scannable portrait.

## Color Palette
| Token      | OKLCH        | Role                              |
| ---------- | ------------ | --------------------------------- |
| background | 0.96 0.02 70 | warm cream paper                  |
| foreground | 0.22 0.04 45 | deep ink-brown text               |
| card       | 0.985 0.015 70 | clean paper card               |
| primary    | 0.42 0.11 35 | sepia/terracotta accent           |
| accent     | 0.55 0.09 60 | dusty bronze highlight            |
| muted      | 0.92 0.02 70 | soft paper wash                   |
| border     | 0.86 0.03 70 | faint aged-paper edge             |
| photo-ring | 0.55 0.09 60 | warm bronze ring for profile photo |
| ex-ring    | 0.55 0.09 60 | bronze halo around the focus person |
| ex-parent  | 0.55 0.09 60 | father/mother accent (0.58 0.12 30 dark) |
| ex-spouse  | 0.48 0.1 45 | spouse accent (0.65 0.12 45 dark) |
| hb-unit    | 0.95 0.02 72 | family-unit plate (0.21 0.02 55 dark) |
| hb-branch  | 0.42 0.11 35 | branch anchor plate (0.72 0.14 60 dark) |
| hb-count   | 0.42 0.11 35 | descendant/branch count ink      |
| success    | 0.55 0.12 150 | warm green — this-is-me badge     |
## Typography
- Display: Fraunces — focus names, cluster/unit titles (warm serif)
- Body: General Sans — labels, buttons, relationship text (clean modern contrast)
- Scale: focus name `text-2xl font-semibold`, unit title `text-sm font-semibold`, zone/relation labels `text-[9px]`/`text-[10px] uppercase tracking-[0.2em]`, body `text-base`
## Elevation & Depth
Layered paper — cream background, lighter cards, warm brown subtle/elevated shadows; the focus card carries a bronze halo (3px `--ex-ring`), compact relative/unit cards lift on hover, clusters sit as flat framed plates.
## Structural Zones
| Zone    | Background  | Border   | Notes                          |
| ------- | ----------- | -------- | ------------------------------ |
| Header  | bg-card     | border-b | title + anchor chip over paper |
| Content | bg-background / bg-card/40 | — | Explore stage / HB map on paper wash |
| Footer  | bg-muted/40 | border-t | subtle closing line            |
## Spacing & Rhythm
Mobile-first centered single column (`max-w-md` stage, `max-w-2xl` map), `px-4` gutters, tight `gap-3` between constellation rows so relatives stay visually close; compact card micro-spacing (`gap-1`, `px-2.5 py-2`).
## Component Patterns
- Buttons: `.ex-focus-action` pill bg-ex-focus; `.branch-action` pills; rounded-full, hover shadow-elevated
- Cards: rounded-xl, bg-card, border-border/60, shadow-subtle; focus card rounded-2xl + bronze halo
- Explore layout: `.ex-center-band` (spouse-left + focus-center), `.ex-parent-row` (father/mother above), `.ex-siblings-scroll` (scrollable right row), `.ex-children-row` (below); compact `.ex-relative-card`/`.ex-parent-card`/`.ex-spouse-half`
- HB cards: `.hb-unit-card` (family unit), `.hb-branch-card` (branch anchor), `.hb-couple-anchor`, `.hb-node`; `.hb-count-chip`/`.hb-branch-count`
## Explore Family (Focused Relationship Navigator)
- The selected person is always the true center: a large `.ex-focus-card` (photo/initials, name, years, Relation to You, This is Me `.ex-me-badge`, View Profile `.ex-focus-action`)
- Spouse(s) sit immediately LEFT of the focus card at roughly half size (`.ex-center-band` + `.ex-spouse-stack` + `.ex-spouse-half`); multiple spouses stack vertically to the left
- Father and Mother sit ABOVE the focus card (`.ex-parent-row`, `.ex-parent-card`), shown only when known
- Siblings sit to the RIGHT in a horizontally scrollable snap row on mobile (`.ex-siblings-scroll`), never forcing all siblings onto the screen at once
- Children sit BELOW the focus card (`.ex-children-row`, compact `.ex-relative-card`)
- Tapping any parent, spouse, sibling, or child makes that person the new center and rebuilds the same layout around them (`recenter` animation); default focus is the person marked 'Me', else the default anchor
- No long vertical stacking — rows hug the focus card; short `.ex-connector` stubs only, no long lines or infinite canvas
## Heritage Branch (10,000-Foot Family Map)
- Bounded `.hb-map` overview of major family units and branch anchors as compact cards, not every individual
- Founding Couple (Julia + Isaiah, 8 children) via `.hb-couple-anchor`; family units (Lula Mae + Versie, 7 children) via `.hb-unit-card`; branches (Clayton, Smith) and lines (Versie's Maternal/Adams) via `.hb-branch-card` with descendant/branch counts
- Compact photo/initial cards; reduced connector lines and visual crowding; no full tree recreated
- Tapping a branch or person opens Explore Family focused on the relevant anchor person
## Motion
- Entrance: staggered `fade-up` (0.6s), `fold-in` (0.3s) on clusters; hover: card lift + shadow-elevated 0.3s
- Explore: `recenter` (0.4s scale+fade) on re-anchor, `halo-pulse` (3.5s) on the focus halo, `anchor-glow` (3s)
- HB map: `branch-in` (0.4s) on cluster reveal; detail reveal `detail-in` (0.25s)
## Constraints
- Token-only styling — no raw hex/rgb in components; mobile-first; large tappable targets (min 44px) with visible focus rings
- Do NOT build an infinite canvas (no pan/zoom); no full extended tree in Explore Family or Heritage Branch; no search-to-jump; no relationship path breadcrumb
- Keep existing warm archival Norwood style and branding; presentation/navigation redesign only — do not change family data, profiles, relationships, or the existing ft-*/fu-*/branch-* connector systems
- Only documented relationships render; decorative imagery must not reduce readability; no PII
## Signature Detail
The bronze-haloed focus card at the heart of a tight radial constellation — father and mother flanking above, spouse beside, siblings and children close below — makes the whole family feel one tap away, while the 10,000-foot map keeps every major unit and branch anchor scannable at a glance.
