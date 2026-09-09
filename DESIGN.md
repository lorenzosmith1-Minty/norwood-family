# Design Brief

## Direction
Norwood — the warm sepia family archive extended into a mobile-first Family Governance & Safety Controls area: a tabbed steward console (Review Requests, Steward Management, Duplicate Profiles, Relationship Management, Archived Profiles, Audit History) on aged paper, keeping the existing paper-grain and brown/sepia accent language intact.

## Tone
Refined, emotional, minimal — the same warm paper-and-ink contrast as the rest of the family app; governance feels like carefully tending the family record, calm and tappable, never a cold enterprise admin panel.

## Differentiation
A governance console that reads like a family archive ledger — tabbed warm paper plates with sepia tab emphasis, duplicate/merge conflicts flagged on ochre, archived profiles quietly desaturated, and a bronze-dotted audit timeline — all kept out of the global navbar.

## Color Palette
| Token      | OKLCH (light) | OKLCH (dark) | Role                              |
| ---------- | ------------- | ------------ | --------------------------------- |
| background | 0.96 0.02 70  | 0.16 0.02 55 | warm cream paper                  |
| foreground | 0.22 0.04 45  | 0.93 0.02 60 | deep ink-brown text               |
| card       | 0.985 0.015 70 | 0.2 0.02 55 | clean paper card                |
| primary    | 0.42 0.11 35  | 0.72 0.14 60 | sepia/terracotta accent           |
| accent     | 0.55 0.09 60  | 0.58 0.12 30 | dusty bronze highlight            |
| gov-tab-active | 0.42 0.11 35 | 0.72 0.14 60 | active governance tab (sepia)  |
| gov-surface | 0.95 0.02 72 | 0.21 0.02 55 | governance section plate        |
| gov-merge  | 0.6 0.11 55   | 0.65 0.13 55 | merge-conflict flag (ochre)      |
| gov-archive| 0.5 0.03 45   | 0.7 0.1 55  | archived profile (muted)         |
| gov-restore| 0.55 0.09 60  | 0.72 0.14 60 | restore action (bronze)          |
| gov-dup-high | 0.5 0.2 25  | 0.55 0.2 25  | high-confidence duplicate        |
| gov-dup-medium | 0.6 0.11 55 | 0.65 0.13 55 | medium duplicate               |
| gov-dup-low | 0.5 0.03 45   | 0.7 0.1 55  | low duplicate                    |
| audit-actor| 0.42 0.11 35  | 0.72 0.14 60 | audit actor emphasis             |
| destructive| 0.5 0.2 25    | 0.55 0.2 25  | reject / remove                  |
## Typography
- Display: Fraunces — tab panel titles, person names, section titles (warm serif)
- Body: General Sans — labels, buttons, audit detail, hint text (clean modern contrast)
- Scale: tab `text-sm font-semibold`, section title `text-xs uppercase tracking-[0.2em]`, person name `font-display text-sm`, audit action `text-sm font-semibold`, detail `text-xs`
## Elevation & Depth
Layered paper — cream background, warmer `--gov-surface` section plates, warm brown subtle/elevated shadows; governance plates sit as flat framed plates, merge conflicts lift with an ochre `shadow-merge` ring, cards lift gently on hover.
## Structural Zones
| Zone    | Background  | Border   | Notes                          |
| ------- | ----------- | -------- | ------------------------------ |
| Header  | bg-card     | border-b | title + back over paper        |
| Tabs    | bg-background | —      | `.gov-tabs` horizontally scrollable segmented bar |
| Content | bg-background | —      | stacked `.gov-section` plates, gap-4 |
| Footer  | bg-muted/40 | border-t | closing line                   |
## Spacing & Rhythm
Mobile-first single column (`max-w-2xl` centered console), `px-4` gutters; `.gov-tabs` scroll on mobile and wrap on `sm:`; sections stacked `gap-4`, rows `gap-2` in `.steward-list`/`.archive-row`, duplicate compare `grid-cols-1 sm:grid-cols-2`, audit entries `mt-2`.
## Component Patterns
- Tabs: `.gov-tab` (min 44px) pill + `.gov-tab-active` sepia + `.gov-tab-count` badge; panel content `.gov-panel` with `tab-in` entrance
- Steward mgmt: `.steward-row` (portrait, name, role) + `.steward-role-badge` (owner-accent / successor-pending) + promote/remove actions
- Duplicates: `.dup-card` + `.dup-compare` two-person grid + `.dup-person-facts` with `.fact-match`/`.fact-diff` + `.dup-confidence` (high/medium/low) + merge actions
- Merge conflict: `.merge-item` + `.merge-conflict` ochre plate + `.merge-values` (owner vs value) + `.merge-resolve` ochre pill
- Archive/restore: `.archive-row` (archived = muted surface) + `.archive-state-badge` + `.archive-restore` bronze pill
- Audit: `.audit-list` + `.audit-entry` bronze-dot timeline (action, detail, actor + time)
- Review requests: reuse `.review-card` + `.steward-approve`/`.steward-reject`/`.steward-pending-action`; empty states via `.gov-empty`
## Motion
- Entrance: `tab-in` (0.25s) on active panel; `fold-in` (0.3s) on section plates
- Hover: card lift + shadow-elevated 0.3s; tab border warms to bronze 0.3s
- Merge: `shadow-merge` ochre ring draws attention to unresolved conflicts
## Constraints
- Token-only styling — no raw hex/rgb in components; mobile-first; large tappable targets (min 44px) with visible focus rings
- Extend the existing Norwood identity — do NOT redesign existing pages or navigation; keep governance sub-areas OUT of the global navbar (tabs only)
- Steward controls hidden from unauthenticated users and normal family members (admin/steward gating)
- Successor is a designation only — not an active steward until explicitly promoted; Audit History is steward-only
- Do NOT build emergency/inactivity stewardship transfer; do NOT build steward notifications for pending governance actions; do NOT expose audit history to profile owners
- Never surface internal identifiers (personIds/slugs) in user-facing name displays
## Signature Detail
The governance console reads like a family archive ledger — tabbed warm paper plates with sepia tab emphasis, ochre-flagged merge conflicts, quietly desaturated archived profiles, and a bronze-dotted audit timeline — so safety controls feel like careful record-keeping rather than enterprise administration.
