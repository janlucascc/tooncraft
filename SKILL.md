---
name: tooncraft
description: >-
  Code-as-Webtoon director and rendering skill. Use when the user asks to create,
  storyboard, write or render a vertical-scroll webtoon, manhwa, manga episode or
  comic strip from a text prompt — using deterministic procedural SVG art, exact
  font-measured lettering, speech bubbles, SFX and vertical pacing without
  generative image models.
---

# ToonCraft — Code-as-Webtoon Skill (Two-Pass High-Fidelity Edition)

Transform any story prompt, novel excerpt or scene idea into a production-ready
**vertical-scroll Webtoon / Manhwa** (800px native width) rendered with deterministic
high-density SVG, real glyph-measured lettering and smart-sliced PNG/WebP or standalone HTML5 output.

> **Important Philosophy:** Because ToonCraft outputs static SVG slices rather than real-time 60fps animations, **render time is never a constraint**. Always maximize vector detail on every character and scene using the mandatory **Two-Pass Workflow** below.

---

## Mandatory Two-Pass Workflow (Follow in Order)

### Pass 1 — Storyboard, Pacing & Camera Layout
1. **Direct the Episode Architecture**
   - Pick a `theme` matching the tone (`cyberpunk-neon`, `dark-fantasy`, `solo-system`, `slice-of-life-pastel`, `noir-thriller`, `action-shonen`).
   - Apply the **Manhwa 5-Beat Formula** from [references/webtoon-pacing-guide.md](./references/webtoon-pacing-guide.md):
     *1. Visual Hook $\to$ 2. Painful Status Quo $\to$ 3. Catalyst Incident $\to$ 4. Visceral Climax/Awakening $\to$ 5. Impact Cliffhanger*.
   - Alternate camera shots aggressively (`establishing` $\to$ `close-up` $\to$ `dutch-angle` $\to$ `extreme-close-up / eyes-only` $\to$ `full-bleed` splash). Never repeat two identical medium shots in a row.
   - Write punchy, cascading dialogue: keep each bubble between **3 and 14 words**, splitting longer thoughts into 2–3 staggered vertical bubbles (`y: 15` $\to$ `y: 45` $\to$ `y: 78`).

2. **Define the Cast Bible (`cast[]`)**
   - Give every character an authentic `silhouettePreset` (`primitive-hunter`, `martial-artist`, `hooded-mage`, `armored-knight`, `cyber-assassin`, `casual-student`, `suit-detective`, `shadow-entity`).
   - Configure `eyeStyle` (`sharp-hunter`, `mystic-glow`, `villain-narrow`, `standard-anime`, `soft-shojo`), `hairStyle` (`spiky-manhwa`, `wild-primitive`, `undercut-sleek`, `ponytail-ronin`, `long-flowing`), and `accessories` (`scar-eye`, `tribal-marks`, `headband`, `earring`, `fur-collar`, `bone-necklace`, `cyber-visor`, `cloak-clasp`).

---

### Pass 2 — High-Detail Character Polish Scan (Segunda Varredura)
**Before rendering or delivering**, perform a dedicated **Second Pass** over every panel in `story.json` specifically to upgrade character aesthetics and visual storytelling (consult [references/anime-character-guide.md](./references/anime-character-guide.md)):

1. **Panel-by-Panel Character Lighting & Shading**
   - Set `lightDirection` (`left`, `right`, `top`, `bottom-fire`, `back-rim`) on every `character_figure` to match the panel's primary light source (moonlight, meteor, fire, artifact, neon sign).
   - Set `shadingIntensity` (`standard`, `heavy`, `dramatic-noir`) to match the emotional weight of the beat.
   - Set an explicit `rimLightColor` so the character's silhouette pops sharply against the background.

2. **Micro-Expressions, Auras & Props**
   - Upgrade generic `neutral` faces to expressive anime states: `determined`, `angry`, `shocked`, `pain`, `smirk`, `menacing-glow`, or `shadowed`.
   - Attach built-in weapons via `weaponProp` (`stone-spear`, `katana`, `greatsword`, `dagger-dual`, `magic-orb`) where appropriate.
   - Dial in `auraIntensity` (`0.3..1.0`) and `glowEyes: true` during power surges or climactic reveals.

3. **Custom Local Detail Injection (`detailOverlaySvg` & `svg_raw`)**
   - Inject panel-specific high-detail vector overlays on the character via `detailOverlaySvg` (drawn in character local coords where `(0, -535)` is head center and `(0, -415)` is chest center) — e.g., freezing breath vapor, glowing immortality veins, facial energy cracks, blood/sweat drops, or rune markings.
   - Add foreground/background props via `svg_raw` (`0..800` × `0..panel.height`) — see [references/svg-composition-patterns.md](./references/svg-composition-patterns.md).
   - Check [references/schema-cheatsheet.md](./references/schema-cheatsheet.md) for all enum values.

---

### Validate, Inspect & Visual Verification

1. **Strict Schema & SVG Sanitizer Validation**
   ```bash
   node <skill-dir>/scripts/tooncraft.mjs validate ./story.json --strict-svg --json
   ```
   - Fix every schema error or sanitizer warning before rendering.

2. **Render HTML5 Reader & Smart-Sliced Images (`PNG` + `WebP`)**
   ```bash
   node <skill-dir>/scripts/tooncraft.mjs render ./story.json --format all --mode sliced --out ./out
   ```

3. **Visual Post-Render Check**
   - Inspect the rendered PNG slices to confirm that bubbles never obscure faces/eyes and that the Pass-2 character details look crisp and expressive.

## Quality Checklist Before Delivering

- [ ] **Pass 1 Complete:** 5-beat Manhwa pacing, aggressive camera alternation, short cascading dialogue bubbles (<= 15 words each).
- [ ] **Pass 2 Complete:** Every `character_figure` has tailored `expression`, `lightDirection`, `shadingIntensity`, `rimLightColor`, and rich character details (`accessories`, `weaponProp`, or `detailOverlaySvg`).
- [ ] `tooncraft validate --strict-svg` exits with code `0` and zero warnings.
- [ ] Visual inspection of the rendered PNG slices confirms zero text/face overlap and genuine anime/manhwa aesthetics.
