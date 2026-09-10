# Design Brief

## Direction
Norwood — the warm sepia family archive extended into a polished media presentation layer: Family Videos & Oral History, where uploaded video, oral-history video, and audio-only oral history are framed on the same aged-paper identity with embedded players, a bronze "voice" accent for the spoken word, and speaker identification.

## Tone
Refined, emotional, minimal — the same warm paper-and-ink contrast as the rest of the family app; media reads like turning the pages of a family album, with the spoken word given a distinct bronze warmth so oral history feels heard, never like a cold database.

## Differentiation
A voice-honest media layer: oral-history items wear a bronze-amber "voice" badge and a single primary speaker chip, rendered on a dark media stage behind embedded players — the one place the warm paper yields to a cinematic dark so the person speaking becomes the focus.

## Color Palette
| Token              | OKLCH (light) | OKLCH (dark) | Role                              |
| ------------------ | ------------- | ------------ | --------------------------------- |
| background         | 0.96 0.02 70  | 0.16 0.02 55 | warm cream paper                  |
| foreground         | 0.22 0.04 45  | 0.93 0.02 60 | deep ink-brown text               |
| card               | 0.985 0.015 70 | 0.2 0.02 55 | clean paper card                |
| primary            | 0.42 0.11 35  | 0.72 0.14 60 | sepia/terracotta accent           |
| accent             | 0.55 0.09 60  | 0.58 0.12 30 | dusty bronze highlight            |
| oral-history       | 0.6 0.11 55   | 0.68 0.12 55 | bronze-amber voice accent         |
| oral-history-foreground | 0.96 0.02 70 | 0.16 0.02 55 | text on voice accent            |
| speaker-accent     | 0.55 0.09 60  | 0.58 0.12 30 | primary speaker portrait ring     |
| media-stage        | 0.24 0.03 40  | 0.12 0.02 50 | dark stage behind players         |
| media-stage-foreground | 0.95 0.02 60 | 0.93 0.02 60 | text on media stage             |
| player-fill        | 0.6 0.11 55   | 0.68 0.12 55 | player progress fill              |
| media-overlay      | 0.16 0.02 55 / 0.6 | 0.1 0.01 50 / 0.65 | play overlay scrim       |
## Typography
- Display: Fraunces — media titles, player frame titles, speaker names (warm serif)
- Body: General Sans — previews, labels, chips, hints (clean modern contrast)
- Mono: Geist Mono — durations, years, era ranges (tabular numerals)
- Scale: card title `font-display text-lg`, player frame `font-display text-base`, label `text-xs uppercase tracking-[0.2em]`, badge `text-[11px] uppercase tracking-[0.12em]`, duration `text-[11px] tabular-nums`
## Elevation & Depth
Layered paper with a single cinematic exception: media cards and speaker cards lift gently on hover with `shadow-subtle`/`shadow-elevated`, while the embedded player sits on a dark `--media-stage` with `shadow-player` so the video/audio becomes the focal plate.
## Structural Zones
| Zone    | Background  | Border   | Notes                          |
| ------- | ----------- | -------- | ------------------------------ |
| Header  | bg-card     | border-b | title + back over paper        |
| Filters | bg-background | —      | `.filter-bar` tabs (All/Video/Oral History/Audio), `.filter-select` speaker/member |
| Content | bg-background | —      | `.media-card` grid, `.media-detail` player + info column |
| Footer  | bg-muted/40 | border-t | closing line                   |
## Spacing & Rhythm
Mobile-first single column (`max-w-2xl` centered), `px-4` gutters; media card grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`; detail `lg:grid-cols-[1.6fr_1fr]` player + info; empty states `py-16`.
## Component Patterns
- Media card: `.media-card` (16:9 `.media-card-thumb` stage + `.media-play-overlay`, title, `.speaker-chip`/`.member-chip`, `.oral-history-badge`, duration) → `.media-detail`
- Player: `.media-player` embeds `<video>`/`<audio>` on the dark stage; `.media-player-frame` is the polished empty/placeholder state
- Speaker: `.speaker-chip` (compact, hidden for non-oral-history) and `.speaker-card` (detail/profile presentation) with a bronze portrait ring
- Oral history badge: `.oral-history-badge` bronze-amber dot-pill, distinct from the sepia primary
- Empty states: `.media-empty` dashed plate with `.media-empty-mark` play crest + title + hint + `.media-empty-action`
- Filters: reuse `.filter-tab`/`.filter-tab-active`/`.filter-select`; `.filter-tab-active-media` for the Oral History tab; forms reuse `.form-input`/`.field-label`/`.dropzone`
## Motion
- Entrance: `fade-up` on media cards; `fold-in` on detail sections
- Hover: card lift + shadow 0.3s; play overlay fades in 0.3s; player border warms to the oral-history accent
- Decorative: `.voice-pulse` (2.4s) breathing on a live/playing oral-history indicator; empty states stay calm
## Constraints
- Token-only styling — no raw hex/rgb in components; mobile-first; min 44px tap targets with visible focus rings
- Preserve the existing Norwood identity — do NOT redesign Home or existing pages/navigation; keep NAV_ACTIVE = 'border-accent bg-accent/15 text-foreground'
- Family Archive remains the primary navigation parent; do NOT add Family Videos as a permanent top-level navbar pill
- Speaker is REQUIRED for Oral History, single primary speaker for MVP, and hidden for non-oral-history media
- Preserve the Norwood multi-select UX rule (immediate checkmark, saved selections reopen selected)
- Do NOT build AI transcription, searchable transcript, chapter markers, AI summary, or extracted names (future-ready model only)
- Never surface internal identifiers (personIds/slugs) in user-facing name displays
## Signature Detail
The voice-honest media layer: oral-history items are marked by a bronze-amber badge and a single speaker chip, and every embedded player sits on a dark cinematic stage — the one moment the warm paper recedes so the person speaking becomes the whole focus.
