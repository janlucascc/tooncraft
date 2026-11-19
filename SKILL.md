---
name: tooncraft
description: >-
  Code-as-Webtoon director and rendering skill. Use when the user asks to create,
  storyboard, write or render a vertical-scroll webtoon, manhwa, manga episode or
  comic strip from a text prompt — using deterministic procedural SVG art, exact
  font-measured lettering, speech bubbles, SFX and vertical pacing without
  generative image models.
---

# ToonCraft — Code-as-Webtoon Skill

Transform any story prompt, novel excerpt or scene idea into a production-ready
**vertical-scroll Webtoon** (800px native width) rendered with deterministic SVG,
real glyph-measured lettering and smart-sliced PNG/WebP or standalone HTML5 output.

## Workflow (Follow in Order)

1. **Direct the Episode**
   - Pick a `theme` matching the tone (`cyberpunk-neon`, `dark-fantasy`, `solo-system`, `slice-of-life-pastel`, `noir-thriller`, `action-shonen`).
   - Define every recurring character in `cast[]` with a consistent `palette`, `silhouettePreset`, and optional `bubbleTheme`.
   - Plan 4–10 panels with alternating camera shots (`establishing` → `medium` → `close-up` → `eyes-only` → tall action splash) and vertical pacing gaps (`tight`, `normal`, `breath`, `dramatic_pause`, `scene_transition`).
   - Consult [references/webtoon-pacing-guide.md](./references/webtoon-pacing-guide.md) when designing rhythm, tension or panel heights.

2. **Compose Visual Layers (No Generative Images)**
   - Layer each panel from back to front: `backdrop` → `environment` → `character_figure` → `svg_raw` (custom props/blades/magic circles/framing shapes) → `effect` (`speedlines-*`, `rain`, `mana-particles`, `halftone-vignette`, `impact-flash`, `vignette`) → `emotion_badge`.
   - Keep `svg_raw` strictly inside the panel coordinate box (`0..800` × `0..panel.height`) using whitelisted SVG elements only — see [references/svg-composition-patterns.md](./references/svg-composition-patterns.md).
   - Keep coordinates (`position`, `tail.target`, `focalPoint`) strictly within `0..100` (percent).
   - Check [references/schema-cheatsheet.md](./references/schema-cheatsheet.md) for exact enum values and defaults.

3. **Write `story.json` & Validate Strictly**
   Use the bundled CLI helper [scripts/tooncraft.mjs](./scripts/tooncraft.mjs) (works from any working directory):
   ```bash
   node <skill-dir>/scripts/tooncraft.mjs validate ./story.json --strict-svg --json
   ```
   - Fix every schema error or `svg_raw` sanitizer warning before rendering. Never ignore validation errors.

4. **Inspect Pacing & Smart Slices (Optional Check)**
   ```bash
   node <skill-dir>/scripts/tooncraft.mjs inspect ./story.json
   ```
   - Verify estimated mobile viewports, word density (aim for <= 25 words per bubble) and slice heights (`<= 1280px`).

5. **Render Output**
   - Interactive standalone HTML5 reader (best for immediate preview):
     ```bash
     node <skill-dir>/scripts/tooncraft.mjs render ./story.json --format html --out ./out
     ```
   - Smart-sliced Webtoon Canvas / Tapas upload images (`800×<=1280` WebP/PNG) + HTML:
     ```bash
     node <skill-dir>/scripts/tooncraft.mjs render ./story.json --format all --mode sliced --out ./out
     ```

## Quality Checklist Before Delivering

- [ ] Every character referenced in `bubbles[]` or `character_figure` exists in `cast[]`.
- [ ] All IDs (`cast[].id`, `panels[].id`, `bubbles[].id`, `sfx[].id`) are unique.
- [ ] Bubbles stay concise (<= 22 words each) and use `**bold**` / `*italic*` sparingly for emphasis.
- [ ] `tooncraft validate --strict-svg` exits with code `0` and zero warnings.
- [ ] At least one visual check of the rendered HTML or PNG slices confirms readable bubbles and clean pacing.
