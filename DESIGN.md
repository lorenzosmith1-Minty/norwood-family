# Design Brief

## Direction
Aged Album — warm sepia editorial aesthetic evoking an old family album; vintage photographs on textured cream paper beneath modern typography, extended so the classic Family Tree reads as a clean overview/reference index.

## Tone
Refined, emotional, minimal — warm paper-and-ink contrast of vintage imagery with crisp contemporary type; the tree itself is a tidy ledger of compact index cards and collapsible branch summaries.

## Differentiation
Weathered sepia photographs against crisp modern typography feel like a treasured heirloom; the Family Tree refinement turns dense genealogy into a calm, tappable reference index without touching any data, relationships, or the connector style.

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
| ft-fold    | 0.93 0.025 70 | collapsed branch surface (0.22 0.02 55 dark) |
## Typography
- Display: Fraunces — hero title, section headings (warm serif)
- Body: General Sans — labels, buttons, body (clean modern contrast)
- Scale: hero `text-5xl md:text-6xl font-bold tracking-tight`, h2 `text-2xl font-semibold`, label `text-xs font-semibold tracking-[0.2em] uppercase`, body `text-base`; tree micro-labels `text-[10px]`/`text-[9px]`
## Elevation & Depth
Layered paper — cream background, lighter cards, warm brown subtle/elevated shadows; compact tree cards lift on hover, selected cards get a warm ink ring, collapsed folds sit as flat dashed-paper ledger rows.
## Structural Zones
| Zone    | Background  | Border   | Notes                          |
| ------- | ----------- | -------- | ------------------------------ |
| Header  | transparent | —        | title + subtitle over hero photo |
| Content | bg-background | —      | hero photo, then card stack    |
| Tree    | bg-card/40  | —        | warm paper wash behind tree    |
| Footer  | bg-muted/40 | border-t | subtle closing line            |
## Spacing & Rhythm
Mobile-first generous vertical rhythm (`space-y-4`/`space-y-6`), centered single-column, `px-6` gutters; tight micro-spacing inside compact cards (`gap-1`, `px-1.5 py-1.5`).
## Component Patterns
- Buttons: full-width cards, icon left, label center, chevron right; rounded-xl, bg-card, shadow-subtle, hover shadow-elevated
- Cards: rounded-xl, bg-card, border-border/60, shadow-subtle; Badges: rounded-full, bg-primary/10, text-primary
- Tree person card: `.ft-card` — rounded-lg, min-width 3.5rem, photo/initials + name + years only
- Collapsed branch: `.ft-branch-fold` — dashed-paper summary row (name + count chip + toggle)
- Selected reveal: `.ft-card-detail` — role chip + relation + this-is-me badge
- Add Photo: `.add-photo-action` pill bg-primary; Set as Profile Photo: `.set-profile-photo` pill bg-card+border
- Gallery: `.gallery-thumb` rounded-lg hover lift; `.photo-hover-overlay` dark scrim fade-in; `.photo-ring` 3px bronze ring; `.photo-badge` chip
- Completeness: `.progress-track` + `.progress-fill` (warm green, width transition); `.completeness-pill` pill with % + label
## Family Archive
- Type badge: `.archive-type-badge` aged-paper pill with on-palette dot per type (`.badge-*`); status pill: `.status-pill` + `.status-pending`/`.status-approved`/`.status-rejected`
- Contribution form: `.field-label` + `.form-input`/`.form-textarea`/`.form-select` (sepia `--ring` focus); upload: `.dropzone` dashed edge + `.upload-progress` (bronze fill)
- Admin approval: `.approve-action`/`.reject-action` pills; flow: type chooser (8 types), title/description/date/tags/members/source/privacy, object-storage upload; approve→archive, reject→rejected
- Browsing: approved items only; `.filter-bar` tabs (`.filter-tab`/`.filter-tab-active`) + `.filter-select`, persisted in URL; `.archive-grid` 1/2/3 cols of `.archive-card`; `.archive-empty` reset
- Detail: `.archive-detail` — `.artifact-viewer` + `.archive-detail-section` panels (description, `.tag-chip`, `.source-status` + `.source-*`, contributor, date, `.member-chip`)
- No PII; originals preserved; one multi-page file = one item; one item links to many members without duplicating the file
## Family Tree Refinement (Compact Overview/Reference View)
- Compact cards: `.ft-card` — photo/initials, name, birth/death years only; 40px `.ft-card-portrait` (down from 48px), `.ft-card-name` (10px) + `.ft-card-years` (9px tabular-nums); labels hidden by default
- Selected reveal: `.ft-card-selected` warm ink ring + tint; `.ft-card-detail` shows `.ft-role-chip`, `.ft-relation-text`, `.ft-me-badge` only while selected
- Collapsible branches: `.ft-branch-fold` dashed-paper row — `.ft-branch-fold-name` + `.ft-branch-fold-count` chip + `.ft-branch-fold-toggle` chevron; whole row min-44px tap target
- Selected card's branch stays expanded; arriving from a profile keeps that branch expanded; expand/collapse preserves all relationships; connectors to collapsed branches stay visible
- No persistence of collapse state; no expand/collapse-all control (out of scope)
- Tokens: `--ft-fold`/`--ft-fold-foreground`; selection reuses `--branch-selected`; count chip `--accent`; this-is-me `--success`
## Family Tree Connector System (Refinement)
- `.ft-couple-line` 2px sepia bar joins spouses; `.ft-trunk` 2px vertical from couple center; `.ft-junction` rotated-square diamond at the split
- `.ft-child-stub` soft stub to each child + `.ft-connector`/`.ft-connector-soft` base lines; each marriage = own couple line + trunk + junction + branch
- `.ft-chevron` small downward chevron on parent-to-child connectors; `.ft-connector-selected` warms the run to `--branch-selected` without layout shift
- Mobile: lines thicken to 2.5px, junction grows at `max-width: 640px`
- Tokens: `--connector-line`/`--connector-line-soft`/`--connector-junction`/`--connector-arrow`; dark-mode variants tuned
- CSS-div connectors in FamilyTreePage.tsx; SVG equivalents in HeritageBranchPage.tsx share tokens/classes
- Unchanged by this refinement — no edits to the ft-* connector classes or the mobile media query
## Heritage Branch View
- Anchor-centered mobile-first tree beside the existing Family Tree; data/profiles/photos/relationships unchanged; only documented relationships render
- `.branch-canvas` paper wash; `.branch-card` compact portrait card + `.branch-portrait` circle, `.branch-card-name`/`.branch-card-relation`
- `.branch-card-selected` warm ink fill; `.branch-card-anchor` bronze halo; `.branch-connector` curved SVG paths (stroke 1.5, `--branch-line`), `.branch-collapsed` dashed hint + `.branch-collapsed-dot`
- Action rail: `.branch-actions` + `.branch-action` pills (Relation to You, Relationship Path, Open Profile, Anchor Tree Here, This is Me)
- Header: `.branch-anchor-chip` + bronze `.branch-anchor-dot`; tokens `--branch-line`/`--branch-selected`/`--branch-anchor`/`--branch-collapsed`
## Motion
- Entrance: staggered `fade-up` (0.6s), `fade-in`; hover: card lift + shadow-elevated 0.3s; decorative: soft-pulse; progress: `.progress-fill` 0.6s
- Branch: `branch-in` (0.4s) on re-anchor, `anchor-glow` (3s); connector selection recolors instantly (no layout shift)
- Tree detail reveal: `detail-in` (0.25s fade + 4px rise); branch expand: `fold-in` (0.3s scale + fade), `.ft-fold-chevron` rotates 0.3s
## Constraints
- Token-only styling — no raw hex/rgb in components
- Mobile-first; large tappable targets (min 44px on `.ft-branch-fold`) with visible focus rings
- Decorative imagery must not obscure text or reduce readability
- No PII (health, blood type, contact, addresses)
- Keep existing visual style — an extension, not a redesign; no new profile/tree/history content changes
- Do NOT change family data, profiles, relationships, or the Heritage Branch View; keep the existing ft-* connector system and its mobile heavier-line media query unchanged; no persistence of branch collapse state; no expand/collapse-all control
- Heritage Branch View is net-new; must not remove or alter the existing Family Tree view; no full infinite canvas; no search/jump-to-person anchor; only documented relationships render
## Signature Detail
The aged sepia family portrait with a distressed torn-paper edge remains the emotional centerpiece; the refined classic Family Tree becomes a calm reference index of compact index-entry cards and dashed-paper collapsible branch rows, where selecting a card pulls its relationship detail out of the drawer — with the unchanged couple-line/trunk/junction connector system making every union and child branch unmistakable.