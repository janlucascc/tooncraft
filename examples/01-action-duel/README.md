# Example 01 — Neon Blade: Sector 9 (Action Duel)

Showcases:
- `cyberpunk-neon` theme with `cyberpunk-alley` and `neon-skyline` procedural environments
- Dynamic framing (`full-bleed`, `diagonal-top`, `diagonal-both`, `shattered`, `borderless`)
- Custom `svg_raw` glowing plasma blade arc combined with `action-lunge` silhouette
- `speedlines-radial`, `impact-flash`, `embers`, `chromatic-glitch` and `slash` SFX

```bash
npx tooncraft validate examples/01-action-duel/story.json --strict-svg
npx tooncraft render examples/01-action-duel/story.json --format all --mode sliced --out ./out/01-action-duel
```
