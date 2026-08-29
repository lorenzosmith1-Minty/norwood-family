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

## Motion

- Entrance: staggered `fade-up` (0.6s) on hero and cards, `fade-in` on background
- Hover: card lifts with shadow-elevated + translate-y, smooth 0.3s
- Decorative: soft-pulse on accent highlights

## Constraints

- Token-only styling — no raw hex/rgb in components
- Mobile-first; large tappable targets with visible focus rings
- Decorative imagery must not obscure text or reduce readability

## Signature Detail

The aged sepia family portrait with a distressed torn-paper edge serves as the emotional centerpiece, framed by clean modern cards and crisp typography.
