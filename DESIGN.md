# Design Brief

## Direction
Norwood — the warm sepia family archive extended into a consolidated navigation: three hub pages (Family History, Message Board, Family Steward) group existing functionality behind large cards that mirror the Home navigation cards, preserving the established Norwood identity exactly.

## Tone
Refined, emotional, minimal — the same warm paper-and-ink contrast as the rest of the app; each hub reads as a keepsake index of a shared family archive, never a generic menu.

## Differentiation
A keepsake hub system: every hub option card wears the Home card language (warm plate, rounded-xl, sepia/bronze accent, gentle lift), with a per-hub accent — Family History bronze, Message Board sepia, Family Steward rust — so the three hubs stay consistent yet individually recognizable.

## Color Palette
| Token              | OKLCH (light) | OKLCH (dark) | Role                              |
| ------------------ | ------------- | ------------ | --------------------------------- |
| background         | 0.96 0.02 70  | 0.16 0.02 55 | warm cream paper                  |
| foreground         | 0.22 0.04 45  | 0.93 0.02 60 | deep ink-brown text               |
| card               | 0.985 0.015 70 | 0.2 0.02 55 | clean paper card                |
| primary            | 0.42 0.11 35  | 0.72 0.14 60 | sepia/terracotta accent           |
| accent             | 0.55 0.09 60  | 0.58 0.12 30 | dusty bronze highlight            |
| hub-surface        | 0.95 0.02 72  | 0.21 0.02 55 | warm plate for hub cards          |
| hub-accent         | 0.42 0.11 35  | 0.72 0.14 60 | sepia hub active/arrow accent     |
| hub-primary        | 0.42 0.11 35  | 0.72 0.14 60 | primary hub access (Family Board) |
| hub-secondary      | 0.55 0.09 60  | 0.58 0.12 30 | secondary hub access (Messages)   |
| hub-muted          | 0.5 0.03 45   | 0.7 0.1 55   | hub subtitle / descriptive text   |
| history-accent     | 0.55 0.09 60  | 0.58 0.12 30 | Family History hub bronze         |
| comm-accent        | 0.42 0.11 35  | 0.72 0.14 60 | Message Board hub sepia           |
| steward-accent     | 0.5 0.14 30   | 0.72 0.13 30 | Family Steward hub rust           |
## Typography
- Display: Fraunces — hub titles, option card titles (warm serif)
- Body: General Sans — option subtitles, labels, hints (clean modern contrast)
- Mono: Geist Mono — timestamps, unread counts, dates (tabular numerals)
- Scale: hub title `font-display text-xl`, option title `font-display text-lg`, option subtitle `text-sm`, group label `text-[11px] uppercase tracking-[0.22em]`
## Elevation & Depth
Layered paper with a single sepia ink accent: hub option cards lift gently on hover with `shadow-hub`/`shadow-elevated`, the back affordance is a paper circle that warms its border on hover, and the red Pending badge floats on a card ring like the Notifications badge.
## Structural Zones
| Zone       | Background  | Border   | Notes                          |
| ---------- | ----------- | -------- | ------------------------------ |
| Header     | bg-card     | border-b | hub back + title over paper    |
| Hub        | bg-background | —      | `.hub-grid` of `.hub-option` cards |
| Footer     | bg-muted/40 | border-t | closing line                   |
## Spacing & Rhythm
Mobile-first single column (`max-w-2xl` centered), `px-4` gutters; hub option grid `grid-cols-1 sm:grid-cols-2 gap-4`; each option `p-4` with icon `h-11 w-11`, title, and subtitle; empty/loading states `py-16`.
## Component Patterns
- Hub header: `.hub-header` with `.hub-back` (paper circle, `h-10 w-10`) + `.hub-title` (Fraunces) + `.hub-subtitle`
- Option card: `.hub-option` (warm plate, rounded-xl, lift on hover) with `.hub-option-icon` (accent circle), `.hub-option-title`, `.hub-option-desc`, `.hub-option-arrow`
- Primary vs secondary: `.hub-option-primary` (sepia, default Family Board) / `.hub-option-secondary` (bronze, Private Messages)
- Per-hub tint: `.hub-accent-history` / `.hub-accent-comm` / `.hub-accent-steward` color the option icon + arrow
- Group label: `.hub-group-label` (tracked caption flanked by short rules)
- Pending badge: `.pending-badge` (same red style as `.notif-badge`)
## Motion
- Entrance: `hub-in` on option cards (0.35s rise + fade); stagger across the grid
- Hover: card lift + shadow 0.3s; border warms to the hub accent
- Decorative: no pulsing on hub surfaces; calm, keepsake feel
## Constraints
- Token-only styling — no raw hex/rgb in components; mobile-first; min 44px tap targets with visible focus rings
- Preserve the existing Norwood identity — do NOT redesign Home or existing pages/navigation; keep NAV_ACTIVE = 'border-accent bg-accent/15 text-foreground'
- Hub cards mirror the Home navigation card language (warm plate, rounded-xl, sepia/bronze accent, gentle lift)
- Family History hub: three options — Family Stories, Family Mysteries, Travel Through Time — each with its descriptive subtitle
- Message Board hub: Family Message Board is the primary/default option; Private Messages secondary
- Family Steward hub: groups existing administrative functions; Pending badge uses the same red style as Notifications
- Do NOT build group chat, attachments, reactions, typing indicators, read receipts, board pinning, or search (future-ready model only)
## Signature Detail
The keepsake hub system: large option cards mirroring the Home navigation cards, each tinted with its hub's accent (bronze history, sepia conversation, rust stewardship) so the consolidated navigation reads as one warm, private Norwood archive.
