# ErgoKit — Design Brainstorm

## Context
Industrial ergonomics assessment software used by safety engineers, occupational health professionals, and industrial hygienists. The interface must convey precision, authority, and clinical reliability while remaining highly usable in factory/field contexts.

---

<response>
<probability>0.07</probability>
<text>

## Idea A — "Industrial Blueprint"

**Design Movement:** Technical Drafting / Engineering Blueprint Aesthetic

**Core Principles:**
1. Monochromatic blue-on-white with amber accent for risk levels — mirrors engineering drawings
2. Grid-based data density: every pixel earns its place, no decorative whitespace
3. Typographic hierarchy modeled on technical manuals: label → value → annotation
4. Status indicators use ISO-standard color coding (green/amber/red)

**Color Philosophy:** Deep navy (#0D1B2A) sidebar, white canvas, amber (#F59E0B) for warnings, red (#DC2626) for high-risk. Conveys authority and safety-critical precision.

**Layout Paradigm:** Fixed left sidebar (navigation + context), wide right content area split into a top toolbar strip and a main workspace. No hero sections — the interface opens directly into the assessment workspace.

**Signature Elements:**
- Thin 1px rule dividers in blueprint blue
- Monospaced data values (IBM Plex Mono) alongside humanist labels (IBM Plex Sans)
- Risk score "gauges" styled as engineering dials

**Interaction Philosophy:** Every action is reversible and auditable. Hover states reveal data provenance. Confirmations are explicit.

**Animation:** Minimal — 150ms ease-out for panel transitions, no decorative motion. Data updates use a 200ms number-count animation.

**Typography System:** IBM Plex Sans (UI labels, body) + IBM Plex Mono (scores, measurements) + IBM Plex Sans Condensed (section headers)

</text>
</response>

<response>
<probability>0.06</probability>
<text>

## Idea B — "Clinical Dashboard" ✅ SELECTED

**Design Movement:** Medical-grade SaaS / Precision Instrument UI

**Core Principles:**
1. Light, airy background (cool off-white) with deep slate primary — clinical cleanliness
2. Asymmetric sidebar-first layout: persistent left nav, content flows right
3. Data visualization as the hero: risk matrices, RULA/REBA score cards, body-part heat maps
4. Strict typographic scale using a geometric sans for headings and a humanist sans for body

**Color Philosophy:** Background: #F8FAFC (cool white). Primary: #1E3A5F (deep navy-slate). Accent: #0EA5E9 (sky blue for interactive). Risk: green (#16A34A) / amber (#D97706) / red (#DC2626). The palette reads as trustworthy and precise without being sterile.

**Layout Paradigm:** Fixed 240px left sidebar with icon + label nav, collapsible on mobile. Main area has a sticky top bar (breadcrumb + actions). Content uses a 12-column grid with card-based sections. Assessment wizard uses a stepped full-width layout.

**Signature Elements:**
- Segmented risk-level badge (Low / Medium / High / Very High) with filled color blocks
- Body silhouette SVG with color-coded joint overlays for RULA/REBA
- Horizontal "score tape" showing composite ergonomic risk score 0–10

**Interaction Philosophy:** Progressive disclosure — show summary first, drill into detail on demand. Wizard-style assessment flow with persistent progress indicator.

**Animation:** 200ms ease-out for sidebar collapse, 250ms for card entrance (staggered 40ms), 300ms for modal open. Score counters animate on first render.

**Typography System:** DM Sans (headings, nav labels) + Inter (body, form fields) — weight range 400–700. Heading scale: 2xl/xl/lg/base/sm.

</text>
</response>

<response>
<probability>0.05</probability>
<text>

## Idea C — "Field-Ready Dark Mode"

**Design Movement:** Aerospace HUD / Industrial Control Room

**Core Principles:**
1. Dark charcoal base (#111827) — readable in high-glare factory environments
2. Neon-accent risk indicators: green/yellow/red glow effects
3. Dense tabular layout optimized for data entry speed
4. High-contrast typography: white on dark, no mid-tone grays

**Color Philosophy:** Dark background reduces eye strain under factory lighting. Accent colors use luminous tones that remain distinguishable under poor lighting conditions.

**Layout Paradigm:** Top horizontal nav bar + full-width content panels. No sidebar — maximizes horizontal data density for wide-screen workstations.

**Signature Elements:**
- Glowing status rings around risk score numerals
- Frosted-glass card panels with subtle border glow
- Animated waveform background in hero section

**Interaction Philosophy:** Keyboard-first — all assessments completable without mouse. Tab order follows assessment sequence.

**Animation:** Glow pulse on risk score update (400ms), slide-in from right for new assessment steps.

**Typography System:** Space Grotesk (headings) + JetBrains Mono (data values) — high-contrast, technical feel.

</text>
</response>

---

## Selected Design: **Idea B — "Clinical Dashboard"**

Rationale: The clinical dashboard aesthetic best serves the target users (safety engineers, EHS professionals) who need to trust the tool's outputs and present findings to management. The light, precise interface reads as authoritative and professional, while the card-based layout accommodates the varied data types in ergonomics assessments (forms, scores, body diagrams, reports).
