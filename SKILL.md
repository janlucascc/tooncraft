---
name: tooncraft
description: >-
  Code-as-Webtoon director and rendering skill. Use when the user asks to create,
  storyboard, write or render a vertical-scroll webtoon, manhwa, manga episode or
  comic strip from a text prompt — using deterministic procedural SVG art, exact
  font-measured lettering, speech bubbles, SFX and vertical pacing without
  generative image models.
---

# ToonCraft — Code-as-Webtoon Skill (3-Pass Director Edition)

Transform any story prompt, novel excerpt or scene idea into a production-ready
**vertical-scroll Webtoon / Manhwa** (800px native width) with deep screenplay writing,
subtext-rich dialogues, deterministic high-density anime SVG art, real glyph-measured
lettering and smart-sliced PNG/WebP or standalone HTML5 output.

> **Core Philosophy:** Never treat a webtoon as a shallow slide-deck of 1-sentence captions. Because ToonCraft outputs static SVG slices (zero 60fps constraint), always combine **literary screenplay depth** with **maximum vector character detail** by executing the mandatory **Three-Pass Director Pipeline** below.

---

## Mandatory Three-Pass Director Pipeline (Follow in Order)

### Pass 1 — The Writer's Room: Plot, Character Psychology & Dialogue Engineering
Consult [references/narrative-and-dialogue-guide.md](./references/narrative-and-dialogue-guide.md) before writing a single panel:

1. **Architect the Episode (`narrativeArc`)**
   - Define `emotionalAnchor` (a specific named person, promise, or concrete human bond at stake — never an abstract cliché).
   - Define `centralConflict` (clash of wills between at least 2 distinct characters/voices).
   - Define `protagonistChoice` (the conscious bargain or sacrifice at the climax).
   - Define `ironicCostOrTwist` (the tragic price paid or revelation that hooks the next episode).

2. **Build the Cast Psychology (`cast[].narrativeProfile`)**
   - Include at least **2–3 cast members** (e.g. protagonist + human foil/elder/loved one + antagonist/cosmic entity) so scenes have real interpersonal dialogue friction.
   - Give every character a `narrativeProfile` (`coreGoal`, `woundOrFlaw`, `speechStyle`) so their vocabulary and metaphors sound unmistakably distinct.

3. **Engineer Scene Density & Subtext-Rich Dialogues**
   - Pair medium panels (`480–560px` each) inside `1280px` page slices so a **5-page episode contains 8–10 rich panels** (combining 2-panel dialogue/flashback pages with tall `980–1120px` splash pages for the climax and cliffhanger).
   - Include at least one flashback/trauma panel (`memoryTint: "sepia-flashback"`, `"crimson-trauma"`, or `"frost-despair"`).
   - Annotate every panel with `narrativeBeat` and `subtextNote`.
   - Chain **2 to 3 descending bubbles per panel** (Setup $\to$ Friction $\to$ Emotional Strike), keeping narration boxes $\le 30\%$ of total bubbles.

---

### Pass 2 — Cinematography, Framing & Vertical Pacing
Consult [references/webtoon-pacing-guide.md](./references/webtoon-pacing-guide.md) and [references/svg-composition-patterns.md](./references/svg-composition-patterns.md):

1. **Aggressive Camera Alternation**
   - Never stack three identical medium shots in a row. Alternate: `establishing` $\to$ `close-up` $\to$ `inset / flashback` $\to$ `dutch-angle` $\to$ `extreme-close-up / eyes-only` $\to$ `full-bleed` splash.
2. **Gutter Rhythm (`pacingAfter`)**
   - Use `tight` (`16px`) or `normal` (`64px`) between paired panels on the same page slice, and `breath` (`140px`) or `dramatic_pause` (`320px`) at major page transitions.

---

### Pass 3 — High-Detail Character Polish Scan (Varredura Visual dos Personagens)
Consult [references/anime-character-guide.md](./references/anime-character-guide.md) and [references/schema-cheatsheet.md](./references/schema-cheatsheet.md):

1. **Panel-by-Panel Lighting & Cel-Shading**
   - Set `lightDirection` (`left`, `right`, `top`, `bottom-fire`, `back-rim`), `shadingIntensity` (`standard`, `heavy`, `dramatic-noir`), and `rimLightColor` on every `character_figure`.
2. **Micro-Expressions, Auras, Accessories & Props**
   - Use expressive states (`determined`, `angry`, `shocked`, `pain`, `smirk`, `menacing-glow`, `shadowed`), attach `weaponProp` (`stone-spear`, `katana`, `greatsword`, `dagger-dual`, `magic-orb`), and set `auraIntensity` / `glowEyes` during power surges.
3. **Custom Local Detail Injection (`detailOverlaySvg`)**
   - Inject panel-specific SVG details in character local coordinates (`(0, -535)` = head, `(0, -415)` = chest) — freezing breath vapor, glowing immortality veins, tears/blood, or runic marks.

---

### Validate, Inspect Narrative Health & Render

1. **Strict Schema & SVG Sanitizer Validation**
   ```bash
   node <skill-dir>/scripts/tooncraft.mjs validate ./story.json --strict-svg --json
   ```
2. **Inspect Narrative Health Score & Smart Slices**
   ```bash
   node <skill-dir>/scripts/tooncraft.mjs inspect ./story.json
   ```
   - Ensure **Narrative Health** achieves **Grade A or S** (`>= 80/100`) with zero narrative warnings!
3. **Render HTML5 Reader & Smart-Sliced Images (`PNG` + `WebP`)**
   ```bash
   node <skill-dir>/scripts/tooncraft.mjs render ./story.json --format all --mode sliced --out ./out
   ```

## Quality Checklist Before Delivering

- [ ] **Pass 1 Complete:** `narrativeArc`, `cast[].narrativeProfile`, `narrativeBeat`, `subtextNote`, multi-speaker dialogue friction, and `tooncraft inspect` Narrative Health Grade **A** or **S**.
- [ ] **Pass 2 Complete:** Dynamic camera alternation, flashback tint (`memoryTint`) where appropriate, and balanced smart-slice heights (`<= 1280px`).
- [ ] **Pass 3 Complete:** Every `character_figure` has tailored `expression`, `lightDirection`, `shadingIntensity`, `rimLightColor`, and rich details (`accessories`, `weaponProp`, or `detailOverlaySvg`).
- [ ] `tooncraft validate --strict-svg` exits with code `0` and visual inspection of rendered PNG slices confirms zero text/face overlap.
