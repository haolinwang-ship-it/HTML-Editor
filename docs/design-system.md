# Design System

Rams principles × industrial restraint × Teenage Engineering's technical aesthetic.

## Core principles

1. **Function visible, decoration absent.** Every line, border, and label earns its place.
2. **Honest materials.** Grids are real grids. Monospace text is for metadata, not vibe.
3. **One accent, used precisely.** Industrial orange marks state changes and signals — never decoration.
4. **Density alongside whitespace.** TE-style: large empty zones contrast with dense information blocks.
5. **No animation that isn't telling you something.** Motion exists to confirm sync, presence, or state.

## Color tokens

```css
/* Surface */
--ink:          #0a0a0a;   /* near-black, text & strong rules */
--paper:        #fafaf9;   /* off-white, base background */
--panel:        #ffffff;   /* card / panel background */
--rule:         #0a0a0a;   /* default border color (always 1px solid ink) */
--rule-soft:    #d6d3d1;   /* secondary, low-emphasis dividers */
--muted:        #57534e;   /* labels, metadata text */
--subtle:       #a8a29e;   /* placeholder, tertiary */

/* Accent — used sparingly, single hue */
--signal:       #ff5a1f;   /* industrial orange, the only chroma in the system */
--signal-soft:  #fff1ec;   /* signal background wash */

/* Status (functional only, not decorative) */
--ok:           #0a7d3f;   /* sync confirmed, comment saved */
--warn:         #b45309;   /* presence drift, slow connection */
--error:        #b91c1c;   /* failure */

/* Per-user presence colors — assigned by hash of user ID */
--user-1:       #d97706;
--user-2:       #0891b2;
--user-3:       #65a30d;
--user-4:       #c026d3;
--user-5:       #dc2626;
--user-6:       #2563eb;
```

## Typography

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, 'SF Mono', monospace;

/* Size scale — sparse, deliberate */
--text-xs:   11px;  /* monospace metadata, labels */
--text-sm:   13px;  /* body, UI controls */
--text-md:   15px;  /* document body */
--text-lg:   20px;  /* section headings */
--text-xl:   28px;  /* page titles */
--text-display: 48px; /* hero, landing-only */

/* Weights — only what's needed */
--weight-regular: 400;
--weight-medium:  500;
--weight-bold:    700;
```

**Usage rules:**
- All metadata, labels, status indicators, bracketed tags → `--font-mono`
- Body text and headings → `--font-sans`
- No italics. No underlines except actual links.
- Uppercase only on monospace metadata (`[DOC-01]`, `EDIT MODE`, `2 USERS`)

## Geometry

```css
--unit:       4px;       /* base spacing unit */
--gutter:     16px;      /* default content gutter */
--radius:     0px;       /* default — square */
--radius-sm:  2px;       /* exception: input fields, buttons */
--rule-w:     1px;       /* all borders, no exceptions */
```

**No rounded corners** except input fields and primary buttons (2px). **No shadows.** Layering happens through borders, not depth.

## Components

### Bracket labels
Monospace, uppercase, square brackets. Used for: file IDs, mode indicators, sections.

```
[DOC-01]   [MAIN / EDIT / COMMENT]   [2 USERS · LIVE]
```

### Buttons

```
┌──────────────┐
│  ADD COMMENT │   ← uppercase, monospace, 1px ink border, square
└──────────────┘
```

Variants:
- **Primary** — inverted (ink fill, paper text)
- **Default** — paper fill, ink border + text
- **Signal** — signal fill, ink text (used only for high-stakes actions like "Export to AI")

### Panels
1px ink border, paper fill, no rounded corners, no shadow.

### Status strip (footer)
Persistent monospace strip at bottom showing: mode · users online · sync status · room ID.

## Motion

Permitted animations:
- Presence cursor movement (smooth tween, ~80ms)
- Comment badge appear (fade + 1px scale, ~120ms)
- Sync status pulse (subtle opacity loop)

Forbidden:
- Hover lift / shadow
- Color transitions on idle elements
- Loading spinners (use a static bracket placeholder instead: `[......]`)

## References

- [Teenage Engineering](https://teenage.engineering/) — the master reference for monospace metadata + bracketed labels + restrained color
- Dieter Rams' Braun work — geometric restraint, function-driven layout
- Swiss / International Typographic Style — grid discipline, sans-serif body
