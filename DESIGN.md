# Design Brief

## Direction
Anchored Album — the warm sepia Norwood archive extended into two complementary family explorations: Explore Family (a focused relationship navigator centered on one person with only their closest relatives in a radial constellation) and Heritage Branch View (a simplified 10,000-foot atlas of major couples, branch clusters, and descendant counts).

## Tone
Refined, emotional, minimal — warm paper-and-ink contrast of vintage imagery with crisp contemporary type; the family reads as a calm, tappable constellation rather than a dense ledger.

## Differentiation
A single person at the center of a small bronze-haloed constellation, with only their closest relatives within arm's reach and tap-to-recenter navigation, turns genealogy into an intimate, scannable portrait — no long connector lines, no infinite canvas.

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
| branch-selected | 0.42 0.11 35 | warm ink — selected card/connector |
| success    | 0.55 0.12 150 | warm green — this-is-me badge     |
| ex-focus   | 0.42 0.11 35 | focus card action ink (0.72 0.14 60 dark) |
| ex-ring    | 0.55 0.09 60 | bronze halo around the focus person |
| hb-cluster | 0.93 0.025 70 | branch cluster plate (0.22 0.02 55 dark) |
| hb-couple  | 0.55 0.09 60 | major couple / branch anchor fill |
| hb-count   | 0.42 0.11 35 | descendant / branch count ink    |
## Typography
- Display: Fraunces — focus names, cluster titles, hero (warm serif)
- Body: General Sans — labels, buttons, relationship text (clean modern contrast)
- Scale: focus name `text-2xl font-semibold`, cluster title `text-sm font-semibold`, zone/relation labels `text-[10px]`/`text-[9px] uppercase tracking-[0.2em]`, body `text-base`
## Elevation & Depth
Layered paper — cream background, lighter cards, warm brown subtle/elevated shadows; the focus card carries a bronze halo (3px `--ex-ring`), compact relative/nodes lift on hover, clusters sit as flat framed plates.
## Structural Zones
| Zone    | Background  | Border   | Notes                          |
| ------- | ----------- | -------- | ------------------------------ |
| Header  | bg-card     | border-b | title + anchor chip over paper |
| Content | bg-background / bg-card/40 | — | Explore stage / HB map on paper wash |
| Footer  | bg-muted/40 | border-t | subtle closing line            |
## Spacing & Rhythm
Mobile-first centered single column (`max-w-md` stage, `max-w-2xl` map), `px-4` gutters, `gap-4` between zones; tight micro-spacing inside compact cards (`gap-1`, `px-2.5 py-2`).
## Component Patterns
- Buttons: `.ex-focus-action` pill bg-ex-focus; `.branch-action` pills; rounded-full, hover shadow-elevated
- Cards: rounded-xl, bg-card, border-border/60, shadow-subtle; focus card rounded-2xl + bronze halo; Badges: rounded-full, bg-primary/10, text-primary
- Focus card: `.ex-focus-card` — 72px `.ex-focus-portrait`, `.ex-focus-name` (Fraunces), `.ex-focus-years` (tabular), `.ex-focus-relation`, `.ex-focus-action`, `.ex-me-badge`
- Relative card: `.ex-relative-card` — 48px `.ex-relative-portrait`, `.ex-relative-name`, `.ex-relative-relation`; zones `.ex-zone` + `.ex-zone-label` + `.ex-zone-row`; short `.ex-connector` stub
- HB map: `.hb-map` + `.hb-cluster` (`.hb-cluster-head`/`.hb-cluster-title`/`.hb-cluster-grid`); `.hb-couple-anchor` major node + `.hb-couple-portrait`; `.hb-node` descendant; `.hb-count-chip`; `.hb-connector` short curves
## Explore Family (Focused Relationship Navigator)
- One focus person as a large `.ex-focus-card`; father above-left, mother above-right, spouse beside, siblings to the side, children below — each `.ex-zone` shown only when known
- Tapping any `.ex-relative-card` recenters the view on that person (new focus, `recenter` animation); default focus is the person marked 'Me', else the default anchor
- `.ex-relative-card` shows portrait/initials + name + simple relationship label; `.ex-me-badge` marks 'Me'
- No full extended tree; screen stays clean and scannable; View Profile opens the existing profile page
- Reduced connector lines: short `.ex-connector` stubs only, no long lines or infinite canvas
## Heritage Branch View (10,000-Foot Family Map)
- Bounded `.hb-map` overview; simplified family nodes, major couples/branch anchors, branch clusters, descendant/branch counts
- `.hb-cluster` plates group one major line; `.hb-couple-anchor` marks each major couple/branch head; `.hb-node` compact descendants; `.hb-count-chip` shows descendant/branch counts
- Clean directional relationships with fewer visible details per person; compact photo/initial cards; mobile readability; reduced long connectors and visual crowding
- No infinite canvas; tapping a person opens Explore Family with that person as the new focus
## Motion
- Entrance: staggered `fade-up` (0.6s), `fold-in` (0.3s) on clusters; hover: card lift + shadow-elevated 0.3s
- Explore: `recenter` (0.4s scale+fade) on re-anchor, `halo-pulse` (3.5s) on the focus halo, `anchor-glow` (3s)
- HB map: `branch-in` (0.4s) on cluster reveal; connector recolors instantly; detail reveal `detail-in` (0.25s)
## Constraints
- Token-only styling — no raw hex/rgb in components; mobile-first; large tappable targets (min 44px) with visible focus rings
- Do NOT build an infinite canvas (no pan/zoom); no full extended tree in Explore Family; no search-to-jump; no relationship path breadcrumb
- Keep existing warm archival Norwood style and branding; presentation/navigation redesign only — do not change family data, profiles, relationships, or the existing ft-*/fu-*/branch-* connector systems
- Only documented relationships render; decorative imagery must not reduce readability; no PII
## Signature Detail
The bronze-haloed focus card at the heart of a tight radial constellation — tap any relative to pull them into the halo and their own small circle of closest kin — makes the whole family feel one tap away, while the 10,000-foot map keeps every major line and branch cluster scannable at a glance.
