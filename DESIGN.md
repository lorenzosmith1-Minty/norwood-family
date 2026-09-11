# Design Brief

## Direction
Norwood — the warm sepia family archive on paper grain, extended with a Historical Research Intake workspace inside Family Steward. The research workspace is a scholarly intake surface that reuses the existing paper-and-ink language and adds a dusty research-cyan ink for research-only states, so it reads as a natural extension of the same archive, never a new theme.

## Tone
Refined, emotional, minimal — warm paper-and-ink contrast throughout; the research intake is a quiet archivist's desk where sources, proposed findings, and conflicts are weighed before they ever become family record.

## Differentiation
A research-cyan ink used sparingly (like an archivist's marginal annotation) marks every research-only state — sources, proposed findings evidence labels, person-match candidates, relationship proposals, conflict review, and the review queue — so the intake workspace stays visibly distinct from the warm sepia governance surfaces while remaining unmistakably Norwood.

## Color Palette
| Token              | OKLCH (light) | OKLCH (dark) | Role                              |
| ------------------ | ------------- | ------------ | --------------------------------- |
| background         | 0.96 0.02 70  | 0.16 0.02 55 | warm cream paper                  |
| foreground         | 0.22 0.04 45  | 0.93 0.02 60 | deep ink-brown text               |
| card               | 0.985 0.015 70 | 0.2 0.02 55 | clean paper card                |
| primary            | 0.42 0.11 35  | 0.72 0.14 60 | sepia/terracotta accent           |
| accent             | 0.55 0.09 60  | 0.58 0.12 30 | dusty bronze highlight            |
| steward-accent     | 0.5 0.14 30   | 0.72 0.13 30 | Family Steward hub rust           |
| research-accent    | 0.52 0.09 205 | 0.72 0.12 205 | research-cyan ink (intake)      |
| research-surface   | 0.94 0.03 210 | 0.21 0.03 210 | cool paper plate for research     |
| research-source    | 0.5 0.09 205  | 0.68 0.11 205 | source badge / evidence dot       |
| research-finding   | 0.55 0.12 150 | 0.6 0.15 150 | documented proposed finding       |
| research-candidate | 0.6 0.11 55   | 0.65 0.13 55 | new person candidate (bronze)     |
| research-relationship | 0.55 0.09 60 | 0.58 0.12 30 | relationship proposal (bronze)  |
| research-conflict  | 0.5 0.2 25    | 0.55 0.2 25  | conflict review (terracotta)      |
| research-queue     | 0.5 0.2 25    | 0.55 0.2 25  | review queue badge (red)          |
## Typography
- Display: Fraunces — workspace titles, source/finding titles (warm serif)
- Body: General Sans — labels, descriptions, hints (clean modern contrast)
- Mono: Geist Mono — timestamps, dates, queue counts (tabular numerals)
- Scale: workspace title `font-display text-xl`, section title `text-xs uppercase tracking-[0.2em]`, finding title `font-display text-sm`, body `text-sm`, meta `text-[11px]`
## Elevation & Depth
Layered paper with a single research-cyan ink: research cards lift gently on hover with `shadow-research`/`shadow-elevated`; the active research tab is a solid cyan pill; the review-queue badge floats on a card ring like the Pending badge.
## Structural Zones
| Zone       | Background  | Border   | Notes                          |
| ---------- | ----------- | -------- | ------------------------------ |
| Header     | bg-card     | border-b | hub back + title over paper    |
| Research   | bg-background | —      | `.research-panel` of `.research-section` plates |
| Footer     | bg-muted/40 | border-t | closing line                   |
## Spacing & Rhythm
Mobile-first single column (`max-w-2xl` centered), `px-4` gutters; research sections `gap-4`; each section `p-4 sm:p-5` with a cyan dot heading; cards `p-4`; conflict values `grid-cols-1 sm:grid-cols-2`; empty/loading states `py-14`.
## Component Patterns
- Research tabs: `.research-tabs`/`.research-tab`/`.research-tab-active` (mirror `.gov-tabs`, active = cyan pill) with `.research-tab-count` queue counts
- Source card: `.research-source-card` (document plate) with title, meta, and a `.research-evidence` label
- Proposed finding: `.research-finding-card` (warm plate) with one `.research-evidence` label + `.research-finding-meta` provenance line (actor in cyan)
- Evidence label: `.research-evidence` dot-pill; `.research-evidence-finding` (solid green) / `-candidate` (dashed bronze) / `-relationship` (dashed bronze) / `-conflict` (dashed terracotta)
- Match row: `.research-match-row` with `.research-match-portrait` (candidate ring) + `.research-match-actions`
- Conflict review: `.research-conflict-card` with `.research-conflict-block` (cyan plate) + `.research-resolve`
- Queue: `.research-queue`/`.research-queue-item` with `.research-queue-badge` (red)
- Audit: `.research-audit`/`.research-audit-entry` with `.research-actor` in cyan
## Motion
- Entrance: `section-in` on sections (0.35s rise + fade); `tab-in` on tab switches
- Hover: card lift + shadow 0.3s; border warms to the research-cyan accent
- Decorative: no pulsing on research surfaces; calm, archival feel
## Constraints
- Token-only styling — no raw hex/rgb in components; mobile-first; min 44px tap targets with visible focus rings
- Preserve the existing Norwood identity — do NOT redesign Home or existing pages/navigation; keep NAV_ACTIVE = 'border-accent bg-accent/15 text-foreground'
- Research Intake lives inside Family Steward; reuse existing steward/governance/evidence tokens where they fit, add research-cyan only for research-only states
- Reuse `.form-input`/`.form-textarea`/`.field-label` for intake forms; reuse `.status-pill`/`.evidence-badge` language for labels
- Do NOT build AI extraction of findings, Evidence Explained citation templates, or research exhaustion/search-log tracking
## Signature Detail
The research-cyan ink: one restrained accent that turns the whole Historical Research Intake workspace into a legible archivist's desk — sources, proposed findings, matches, conflicts, and the review queue each carry a cyan-marked state — while the warm sepia family archive stays exactly as it was.
