# Design Brief

## Direction
Norwood — the warm sepia family archive extended into a consumer sign-in experience: familiar 'Continue with Google' and 'Continue with Apple' buttons on a warm paper auth panel, used at login, Add Myself final submission, and 'This is Me' claims.

## Tone
Refined, emotional, minimal — warm paper-and-ink contrast of vintage imagery with crisp contemporary type; the family reads as a calm, tappable constellation and signing in feels like taking a place in the family, not a cold enterprise login.

## Differentiation
A warm bronze-haloed auth panel hosting two instantly recognizable provider buttons — Google's white card with its multi-color 'G', Apple's near-black card with its white logo — turns a security step into a warm 'save your place in the family' moment, with a single stable account identity separate from the person profile.

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
| signin-card | 0.985 0.015 70 | warm paper auth panel (0.2 0.02 55 dark) |
| signin-hint | 0.5 0.03 45 | auth subtitle/footnote (0.7 0.1 55 dark) |
| signin-google-bg | 0.99 0.005 90 | Google button white surface |
| signin-google-fg | 0.24 0.03 45 | Google button dark ink text |
| signin-apple-bg | 0.2 0.01 30 | Apple button near-black surface |
| signin-apple-fg | 0.96 0.01 60 | Apple button white text |
| success    | 0.55 0.12 150 | warm green — this-is-me badge     |
| claim-pending | 0.55 0.09 60 | pending claim (0.72 0.14 60 dark) |
| rel-confirmed | 0.55 0.12 150 | confirmed relationship (0.6 0.15 150 dark) |
| rel-disputed | 0.5 0.2 25 | disputed relationship (0.55 0.2 25 dark) |
| notif-unread | 0.55 0.09 60 | unread notification (0.72 0.14 60 dark) |
| owner-accent | 0.42 0.11 35 | owner-edit emphasis (0.72 0.14 60 dark) |
## Typography
- Display: Fraunces — auth titles, focus names, unit titles (warm serif)
- Body: General Sans — labels, buttons, relationship text (clean modern contrast)
- Scale: auth title `text-xl font-semibold`, sign-in button `text-[15px] font-semibold`, section labels `text-xs uppercase tracking-[0.2em]`, body `text-base`
## Elevation & Depth
Layered paper — cream background, lighter cards, warm brown subtle/elevated shadows; the sign-in panel carries a bronze halo (`shadow-signin` 3px `--photo-ring`), provider buttons lift on hover, compact relative/unit cards lift on hover, clusters sit as flat framed plates.
## Structural Zones
| Zone    | Background  | Border   | Notes                          |
| ------- | ----------- | -------- | ------------------------------ |
| Header  | bg-card     | border-b | title + anchor chip over paper |
| Content | bg-background / bg-card/40 | — | sign-in panel / Explore stage / HB map on paper wash |
| Footer  | bg-muted/40 | border-t | subtle closing line            |
## Spacing & Rhythm
Mobile-first centered single column (`max-w-sm` auth panel, `max-w-md` stage, `max-w-2xl` map), `px-4` gutters, tight `gap-3` between sign-in buttons and constellation rows; auth panel `p-6 sm:p-7`, `gap-5` between head/buttons/footnote.
## Component Patterns
- Sign-in: `.signin-panel` warm paper card + bronze halo; `.signin-google` white pill (Google 'G' SVG) + `.signin-apple` near-black pill (Apple SVG); `.signin-divider` 'or' separator; `.signin-footnote` trust note; all min 48px
- Buttons: `.ex-focus-action` pill bg-ex-focus; `.branch-action` pills; `.this-is-me-action` sepia pill; rounded-full, hover shadow-elevated
- Cards: rounded-xl, bg-card, border-border/60, shadow-subtle; focus card rounded-2xl + bronze halo
- Explore layout: `.ex-center-band` (spouse-left + focus-center), `.ex-parent-row`, `.ex-siblings-row`, `.ex-children-row`
- HB cards: `.hb-unit-card`, `.hb-branch-card`, `.hb-couple-anchor`, `.hb-node`; `.hb-count-chip`
## Consumer Sign-In (Google + Apple)
- Auth panel `.signin-panel` hosts a crest mark, title, subtitle, then two full-width provider buttons stacked with an 'or' divider and a trust footnote
- Google button: white surface (`.signin-google`), dark ink text, inline Google 'G' SVG carrying brand colors — familiar consumer look
- Apple button: near-black surface (`.signin-apple`), white text, inline Apple logo SVG — familiar consumer look
- Used identically at login, at Add Myself final submission ('Save your place in the family'), and for 'This is Me' claims; sign-in is deferred to final submission and returns to the exact state
- Account Identity is a stable internal ID separate from the Person Profile; no passwords, no email sign-in, never auto-approve claims
## Add Myself & This is Me
- Add Myself: no auth up front; at final submission show the sign-in panel with 'Save your place in the family' + 'Sign in securely to create your Norwood profile and send this family connection for confirmation.'
- This is Me: `.this-is-me-action` sepia pill invites ownership; claiming opens the same sign-in panel with Google + Apple options
- Claim status badges (`.claim-badge` + `-unclaimed`/`-claimed`/`-pending`); `.owner-ring` bronze halo marks owned portraits; `.claim-banner` shows pending claims
- Pending claim profile: reuse `.status-pill` + `.status-pending` (dusty bronze `--claim-pending`) labeled 'Profile claim pending' — no new token, no restyle
- Pending new-profile relationship: reuse `.status-pill` + `.status-pending` (dusty bronze `--rel-pending`) labeled 'Family connection pending confirmation'
- Duplicate matching: `.match-card` with `.match-this-is-me` / `.match-none`; `.relation-picker` for Parent/Child/Sibling/Spouse or Partner
## Navigation Identity
- Navbar never shows raw auth/account IDs; label resolves to the linked/approved Person Profile display name, else the pending personal profile's display name, else 'My Account' (no profile) or 'Complete Profile' (pending personal profile) — plain text label, no new styling
## Motion
- Entrance: staggered `fade-up` (0.6s), `fold-in` (0.3s) on clusters and sign-in panel; `signin-pop` (0.35s) on provider buttons
- Hover: card lift + shadow-elevated 0.3s; sign-in buttons lift 1px + deepen shadow 0.3s
- Explore: `recenter` (0.4s), `halo-pulse` (3.5s), `anchor-glow` (3s); HB map: `branch-in` (0.4s), `detail-in` (0.25s)
## Constraints
- Token-only styling — no raw hex/rgb in components (brand logos are inline SVGs that carry their own colors); mobile-first; large tappable targets (min 44px) with visible focus rings
- Add only sign-in tokens (`--signin-*`) and styles — do NOT restyle existing Home, Explore Family, Heritage Branch, Family Tree, Archive, profile, or claim cards
- Do NOT build email sign-in, passwords, or mocked auth; do not remove the working Internet Identity path before the replacement is verified
- Preserve all family data, profiles, graph, claims, notifications, Archive, Explore Family, and Heritage Branch; never auto-approve claims
## Signature Detail
The warm bronze-haloed auth panel with two instantly recognizable provider buttons — Google's white card and Apple's near-black card — turns the sign-in step into a warm 'save your place in the family' moment, extending the same paper-and-ink language used across the family tree, archive, and heritage views.
