# Design Brief

## Direction

Aged Album — a warm sepia editorial aesthetic evoking an old family album, where cinematic vintage photographs sit on textured cream paper beneath modern typography.

## Tone

Refined, emotional, minimal — a warm paper-and-ink feel that contrasts characterful vintage imagery with clean contemporary type.

## Differentiation

The tension between weathered sepia photographs and crisp modern typography makes the interface feel like a treasured heirloom, not a generic genealogy app.

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
| progress-fill | 0.55 0.12 150 | warm green completeness fill   |
| status-pending | 0.55 0.09 60 | dusty bronze — awaiting approval |
| status-approved | 0.55 0.12 150 | warm green — in archive       |
| status-rejected | 0.5 0.2 25 | terracotta — declined            |

## Typography

- Display: Fraunces — hero title, section headings (warm serif, old-style character)
- Body: General Sans — labels, buttons, body (clean modern contrast)
- Scale: hero `text-5xl md:text-6xl font-bold tracking-tight`, h2 `text-2xl font-semibold`, label `text-xs font-semibold tracking-[0.2em] uppercase`, body `text-base`

## Elevation & Depth

Layered surfaces: paper background, slightly lighter cards, and warm brown-tinted subtle/elevated shadows that give cards a gentle lift off the parchment.

## Structural Zones

| Zone    | Background   | Border   | Notes                          |
| ------- | ------------ | -------- | ------------------------------ |
| Header  | transparent  | —        | title + subtitle over hero photo |
| Content | bg-background | —       | hero photo, then card stack    |
| Footer  | bg-muted/40  | border-t | subtle closing line            |

## Spacing & Rhythm

Mobile-first generous vertical rhythm (`space-y-4`/`space-y-6`), centered single-column layout, `px-6` page gutters, tight micro-spacing inside cards.

## Component Patterns

- Buttons: full-width cards with icon left, label center, chevron right; rounded-xl, bg-card, shadow-subtle, hover shadow-elevated
- Cards: rounded-xl, bg-card, border-border/60, shadow-subtle
- Badges: rounded-full, bg-primary/10, text-primary
- Add Photo: `.add-photo-action` — rounded-full pill, bg-primary, shadow-subtle, hover shadow-elevated
- Set as Profile Photo: `.set-profile-photo` — rounded-full pill, bg-card + border, hover border-photo-ring
- Gallery thumbnails: `.gallery-thumb` — rounded-lg, border-border/60, hover lift + shadow
- Photo hover overlay: `.photo-hover-overlay` — dark scrim with action buttons, fade-in on group hover
- Selected/profile photo: `.photo-ring` — 3px warm bronze ring; `.photo-badge` — profile-photo chip
- Completeness: `.progress-track` (rounded track) + `.progress-fill` (warm green fill, width transition); `.completeness-pill` — rounded-full pill with % + label

## Family Archive Additions

- Archive type badge: `.archive-type-badge` — aged-paper pill with a small on-palette dot per type (photo/document/audio/video/story/research/work/other via `.badge-*` modifiers); dots reuse chart + accent tones, never rainbow
- Status pill: `.status-pill` + `.status-pending` (dusty bronze) / `.status-approved` (warm green) / `.status-rejected` (terracotta), each with a colored dot
- Contribution form: `.field-label` (uppercase micro-label) + `.form-input` / `.form-textarea` / `.form-select` — aged-paper fields, focus ring in sepia `--ring`
- File upload: `.dropzone` — dashed aged-paper edge, hover/focus/dragover turns bronze; title + hint inside
- Upload progress: `.upload-progress` wraps `.progress-track`/`.progress-fill` (bronze fill) with `.upload-progress-label` + `.upload-percent`
- Admin approval: `.approve-action` (warm green pill) / `.reject-action` (terracotta pill) for pending items
- Contribution flow: "Add to Our History" opens type chooser (8 types); form captures title, description, date/era, tags, related members/branch, source status, privacy; file types upload original via object storage with progress
- Pending items appear in admin approval list; approve stores to archive, reject marks rejected; no contributor notifications (out of scope)
- No PII (health, blood type, contact, addresses); original uploaded file preserved as-is; one multi-page file stays one item; one item links to many members without duplicating the file

## Family Archive Browsing Screen & Detail Page

- Browsing screen lists all approved items (newest first) from the approved-items API; only approved items are visible to regular members — pending/rejected never appear
- Filter bar (`.filter-bar`): type tabs (`.filter-tab` / `.filter-tab-active` — All, Photos, Documents, Audio, Video, Stories/Notes, Research, Work/Business, Other) + compact dropdowns (`.filter-select`) for family member and era/date; `.filter-clear` resets; selections persist in the page URL so they survive refresh and can be shared
- Card grid (`.archive-grid`): responsive 1/2/3 columns; each `.archive-card` shows title, type badge, date/era, contributor, related member chips, and a preview thumbnail (`.archive-card-thumb`) for photos with a type-appropriate icon tile (`.archive-card-icon`) for other types
- Empty state (`.archive-empty`): clear message + `.archive-empty-reset` action when no items match the current filters
- Detail page: clicking a card opens the Archive Detail for that item; back navigation returns to the browsing list with filters intact
- Detail layout (`.archive-detail`): original artifact viewer (`.artifact-viewer` — photo viewer / document view / audio-video player) on the left, `.archive-detail-section` panels on the right for description, tags (`.tag-chip`), source/evidence status (`.source-status` + `.source-primary`/`.source-copy`/`.source-inferred`/`.source-unverified`), contributor, submission date, and related family members (`.member-chip` with initials avatar linking to existing profiles)
- Uploaded originals are never altered or replaced; any derived content stays separate from the original artifact
- Existing family profiles, tree relationships, contribution flow, and admin approval flow remain unchanged

## Motion

- Entrance: staggered `fade-up` (0.6s) on hero and cards, `fade-in` on background
- Hover: card lifts with shadow-elevated + translate-y, smooth 0.3s; gallery thumb lifts + reveals photo-hover-overlay
- Decorative: soft-pulse on accent highlights
- Progress: `.progress-fill` width animates 0.6s on upload/completeness update
- Branch nodes: `branch-in` (0.4s scale+fade) on re-anchor; anchor halo `anchor-glow` (3s) on the centered person

## Heritage Branch View

- Anchor-centered, mobile-first family tree — an additional tree view beside the existing Family Tree; existing view, data, profiles, photos, and relationships unchanged
- Any family member can be the anchor; layout places parents above, spouse(s) beside, siblings nearby, children below; deeper branches (grandchildren+) stay collapsed until selected
- Only documented relationships render — absent relationships are omitted, never invented
- Canvas: `.branch-canvas` — warm paper wash behind the layout
- Compact portrait cards: `.branch-card` (min-width 4.5rem, rounded-xl, bg-card, shadow-subtle, hover lift) with `.branch-portrait` — circular photo-ring portrait or initials avatar fallback; `.branch-card-name` + `.branch-card-relation` labels
- Selection: `.branch-card-selected` — warm ink fill + border with foreground text; anchor: `.branch-card-anchor` — bronze halo ring around the centered person
- Connectors: `.branch-connector` — curved organic SVG paths (stroke-linecap round, stroke-width 1.5) in sepia `--branch-line`; `.branch-connector-soft` for lighter ties; `.branch-collapsed` dashed bronze hint + `.branch-collapsed-dot` expand affordance
- Action rail: `.branch-actions` + `.branch-action` pills (Relation to You, Relationship Path, Open Profile, Anchor Tree Here, This is Me); `.branch-action-primary` for the primary anchor action
- Header: `.branch-anchor-chip` — pill with bronze `.branch-anchor-dot` identifying the current anchor
- Tokens: `--branch-line` / `--branch-line-soft` (connector color), `--branch-selected` (selection fill), `--branch-anchor` (anchor halo), `--branch-collapsed` (dashed hint); dark-mode variants tuned for readability

## Constraints

- Token-only styling — no raw hex/rgb in components
- Mobile-first; large tappable targets with visible focus rings
- Decorative imagery must not obscure text or reduce readability
- No PII (health, blood type, contact, addresses); completeness uses only non-sensitive family-history fields
- Keep existing visual style — this is an extension, not a redesign; no new profile/tree/history content changes
- Heritage Branch View is a net-new additional view; it must not remove or alter the existing Family Tree view
- No full infinite canvas; no search/jump-to-person anchor; only documented relationships render

## Signature Detail

The aged sepia family portrait with a distressed torn-paper edge serves as the emotional centerpiece, framed by clean modern cards and crisp typography, now extended with archive contribution forms and admin approval that feel like ledger entries on the same warm paper — and a Heritage Branch View where curved sepia branch lines connect compact portrait cards around a bronze-haloed anchor person.
