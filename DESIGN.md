# Design Brief

## Direction
Norwood — the warm sepia family archive extended into a mobile-first Edit My Profile form: a sectioned personal record on aged paper (Identity, Basic Information, About, Photo, Timeline, Privacy) with clear section headings, a sticky save/cancel bar, and a local draft-autosave reassurance.

## Tone
Refined, emotional, minimal — the same warm paper-and-ink contrast as the rest of the family app; editing a profile feels like carefully filling in a family record, calm and tappable, never a cold enterprise form.

## Differentiation
A long personal form that reads like a family record — sectioned warm paper plates with bronze section headings, a quiet draft-autosave status chip that reassures work is protected, and a sticky save/cancel bar that stays reachable while scrolling.

## Color Palette
| Token      | OKLCH (light) | OKLCH (dark) | Role                              |
| ---------- | ------------- | ------------ | --------------------------------- |
| background | 0.96 0.02 70  | 0.16 0.02 55 | warm cream paper                  |
| foreground | 0.22 0.04 45  | 0.93 0.02 60 | deep ink-brown text               |
| card       | 0.985 0.015 70 | 0.2 0.02 55 | clean paper card                |
| primary    | 0.42 0.11 35  | 0.72 0.14 60 | sepia/terracotta accent           |
| accent     | 0.55 0.09 60  | 0.58 0.12 30 | dusty bronze highlight            |
| muted      | 0.92 0.02 70  | 0.24 0.02 55 | soft paper wash                   |
| border     | 0.86 0.03 70  | 0.28 0.02 55 | faint aged-paper edge             |
| photo-ring | 0.55 0.09 60  | 0.72 0.14 60 | warm bronze ring for profile photo |
| edit-section | 0.42 0.11 35 | 0.72 0.14 60 | section heading accent          |
| edit-surface | 0.95 0.02 72 | 0.21 0.02 55 | section card plate              |
| draft-saved | 0.55 0.12 150 | 0.6 0.15 150 | autosave confirmation (warm green) |
| draft-unsaved | 0.55 0.09 60 | 0.72 0.14 60 | dirty/unsaved indicator (bronze) |
| owner-accent | 0.42 0.11 35 | 0.72 0.14 60 | save button + owner emphasis   |
| destructive | 0.5 0.2 25    | 0.55 0.2 25  | remove-photo / remove-timeline   |
## Typography
- Display: Fraunces — section titles, timeline entry titles, focus names (warm serif)
- Body: General Sans — labels, inputs, buttons, hint text (clean modern contrast)
- Scale: section title `text-xs uppercase tracking-[0.2em]`, field label `text-xs uppercase tracking-[0.2em]`, input `text-sm`, timeline entry title `font-display text-sm`, body `text-base`
## Elevation & Depth
Layered paper — cream background, warmer `--edit-surface` section plates, warm brown subtle/elevated shadows; section cards sit as flat framed plates, the sticky action bar floats above content on a blurred paper surface, cards lift gently on hover.
## Structural Zones
| Zone    | Background  | Border   | Notes                          |
| ------- | ----------- | -------- | ------------------------------ |
| Header  | bg-card     | border-b | title + back + draft status over paper |
| Content | bg-background | —      | stacked `.edit-section-card` plates, gap-4 |
| Footer  | bg-muted/40 | border-t | closing line + privacy note    |
| Action  | bg-background/90 | border-t | sticky save/cancel bar (blur) |
## Spacing & Rhythm
Mobile-first single column (`max-w-2xl` centered form), `px-4` gutters; sections stacked `gap-4`, fields `gap-4` in `.edit-field-grid` (single column on mobile, `sm:grid-cols-2` for pairs), section card `p-4 sm:p-5`, sticky bar `py-3`.
## Component Patterns
- Section card: `.edit-section-card` rounded-xl warm plate + `.edit-section-head` bronze dot + `.edit-section-title` tracked caption + `.edit-section-hint`
- Fields: reuse `.form-input`/`.form-textarea`/`.form-select` + `.field-label`; `.edit-field-grid` for compact pairs
- Save: `.owner-save` sepia pill (min 44px); Cancel/back: `.edit-cancel` quiet outline pill
- Timeline: `.timeline-entry-card` framed plate (date, title, detail) + `.timeline-entry-action` edit/remove + `.timeline-add` dashed add plate
- Draft status: `.draft-status` + `.draft-saved` (pulsing warm-green dot) / `.draft-unsaved` (bronze dot)
- Photo: reuse `.photo-ring`/`.photo-hover-overlay`/`.dropzone`/`.remove-photo-action`; initials placeholder when no photo
## Motion
- Entrance: `fold-in` (0.3s) on section cards; `fade-up` (0.6s) on the form head
- Hover: card lift + shadow-elevated 0.3s; timeline entry border warms to bronze 0.3s
- Draft: `draft-pulse` (2s) breathing dot on the saved confirmation
## Constraints
- Token-only styling — no raw hex/rgb in components; mobile-first; large tappable targets (min 44px) with visible focus rings
- Extend the existing Norwood identity — do NOT redesign the profile page, Explore Family, Heritage Branch, Family Tree, Archive, or navigation
- Do NOT build a Public visibility option for editable fields; do NOT build structured timeline media attachments
- Never expose email/auth/account credentials; never surface internal identifiers (personIds/slugs) in user-facing name displays
- Living profiles without an uploaded photo use the initials/photo placeholder; do not directly edit relationships
## Signature Detail
The long personal form is tamed into warm paper section plates with bronze section headings and a quiet breathing draft-autosave dot — so editing a family record feels like carefully tending a page in the family archive, with every change protected as you go.
