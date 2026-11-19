# SVG Composition Patterns for `svg_raw` Layers

ToonCraft supports free-form vector illustration via `{ "type": "svg_raw", "svgMarkup": "..." }` — allowing the AI director to draw blades, magic circles, weapons, UI overlays, silhouettes, light beams or architectural focal points directly inside any panel.

---

## 1. Coordinate System

- Width is always `canvas.width` (default **`800`**).
- Height is **`panel.height`** (e.g. `680`, `960`).
- Do **not** wrap `svgMarkup` in `<svg>...</svg>` — emit only inner elements (`<defs>`, `<g>`, `<path>`, `<circle>`, `<polygon>`, `<rect>`, `<line>`, `<ellipse>`, `<text>`).
- Local IDs inside `<defs>` are automatically prefixed per panel by the sanitizer, so `id="blade"` + `fill="url(#blade)"` is always safe and collision-free.

---

## 2. Allowed Elements (Strict Security Whitelist)

**Allowed:** `g`, `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `text`, `tspan`, `textPath`, `defs`, `linearGradient`, `radialGradient`, `stop`, `clipPath`, `mask`, `pattern`, `symbol`, `use`, `filter`, `feGaussianBlur`, `feOffset`, `feMerge`, `feMergeNode`, `feColorMatrix`, `feBlend`, `feFlood`, `feComposite`, `feDropShadow`.

**Forbidden (stripped by sanitizer & rejected by `--strict-svg`):**
- `<script>`, `<style>`, `<foreignObject>`, `<image>`, `<a>`, `<iframe>`, `<animate*>`
- Event handlers (`onload`, `onclick`, `on*`)
- External URLs (`http://`, `https://`, `data:`, `javascript:`)

---

## 3. High-Impact Vector Recipes

### A. Energy Blade Slash Arc (for `800×960` action panel)
```xml
<defs>
  <linearGradient id="slashGrad" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#FFFFFF"/>
    <stop offset="0.45" stop-color="#22D3EE"/>
    <stop offset="1" stop-color="#FF2E88"/>
  </linearGradient>
  <filter id="slashGlow" x="-40%" y="-40%" width="180%" height="180%">
    <feGaussianBlur stdDeviation="7" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>
<path d="M60 760 C 260 520 500 320 770 110 C 560 360 340 590 120 820 Z"
      fill="url(#slashGrad)" filter="url(#slashGlow)"/>
<path d="M95 775 C 290 545 520 350 755 135"
      fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
```

### B. Arcane Magic Circle (centered at `400, 340`)
```xml
<g opacity="0.42" stroke="#60A5FA" fill="none">
  <circle cx="400" cy="340" r="210" stroke-width="2" stroke-dasharray="12 8"/>
  <circle cx="400" cy="340" r="165" stroke-width="3"/>
  <polygon points="400,150 565,435 235,435" stroke-width="2"/>
  <polygon points="400,530 565,245 235,245" stroke-width="2"/>
</g>
```

### C. Dramatic Light Beam / Spotlight
```xml
<defs>
  <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FEF08A" stop-opacity="0.55"/>
    <stop offset="1" stop-color="#FEF08A" stop-opacity="0"/>
  </linearGradient>
</defs>
<polygon points="320,0 480,0 640,760 160,760" fill="url(#beam)"/>
```

---

## 4. Layering Best Practices

- Place `svg_raw` at `zIndex: 15` (behind characters) for runes, light beams and emblems, or `zIndex: 28` (in front of characters, behind SFX/bubbles) for slashes, projectiles and foreground debris.
- Keep silhouettes crisp with strong figure-ground contrast: dark foreground shapes over glowing backgrounds, or bright rim-lit figures over deep shadows.
