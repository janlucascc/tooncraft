# ToonCraft Schema Cheatsheet (`schemaVersion: "1.0.0"`)

Quick reference of every enum, constraint and default enforced by `src/schema/`.

---

## Root (`WebtoonEpisode`)
- `schemaVersion`: `"1.0.0"` (default)
- `title`: string (1–120 chars, **required**)
- `episodeNumber`: int >= 1 (default `1`)
- `author`: string (default `"ToonCraft AI Director"`)
- `genre`: string (default `"Action"`)
- `synopsis`: optional string (<= 500 chars)
- `theme`: `"cyberpunk-neon"` | `"dark-fantasy"` | `"solo-system"` | `"slice-of-life-pastel"` | `"noir-thriller"` | `"action-shonen"` | `"custom"`
- `canvas`: `{ width: 400..1600 (800), backgroundColor?: Color, defaultMarginX: 0..120 (24), sliceMaxHeight: 600..2000 (1280), fontPreset?: "comic" | "modern" | "system" | "dramatic" }`
- `cast`: `Character[]`
- `panels`: `Panel[]` (1–150 panels, **required**)

## Cast (`Character`)
- `id`: lowercase slug `^[a-z0-9-]+$` (**required**, unique)
- `name`: string (1–60 chars, **required**)
- `role`: `"protagonist"` | `"antagonist"` | `"supporting"` | `"narrator"` | `"system"`
- `silhouettePreset`: `"hooded-mage"` | `"armored-knight"` | `"cyber-assassin"` | `"casual-student"` | `"suit-detective"` | `"martial-artist"` | `"shadow-entity"` | `"none"`
- `palette`: `{ skin, hair, eyes, outfitPrimary, outfitAccent, aura }` (all `Color`)
- `bubbleTheme`: optional `{ fillColor?, strokeColor?, textColor?, glowColor? }`

## Panel (`Panel`)
- `id`: string (**required**, unique)
- `height`: int `200..2200` (**required**)
- `camera`: `"extreme-close-up"` | `"close-up"` | `"medium"` | `"wide"` | `"establishing"` | `"dutch-angle"` | `"birds-eye"` | `"low-angle"`
- `moodDescription`: optional string (<= 300 chars)
- `frame`: `{ type, borderColor?, borderWidth: 0..16 (4), marginX?: 0..160, skewDeg: -20..20 (6), cornerRadius: 0..40 (0) }`
  - `frame.type`: `"standard"` | `"full-bleed"` | `"diagonal-top"` | `"diagonal-bottom"` | `"diagonal-both"` | `"borderless"` | `"shattered"` | `"inset"`
- `layers`: `VisualLayer[]` (min 1, **required**)
- `bubbles`: `Bubble[]`
- `sfx`: `Sfx[]`
- `pacingAfter`: `"tight"` | `"normal"` | `"breath"` | `"dramatic_pause"` | `"scene_transition"` | `"custom"`
- `customPacingPx`: int `0..1200` (**required** if `pacingAfter === "custom"`)
- `pacingTransition`: `"solid"` | `"fade-to-black"` | `"fade-to-white"` | `"gradient-shift"`
- `seed`: int (default `42`)

## Visual Layers (`VisualLayer` — discriminated by `type`)
1. `backdrop`: `{ type: "backdrop", kind: "solid"|"linear-gradient"|"radial-gradient"|"night-sky"|"horizon-glow", colors: Color[1..4], angleDeg?: 0..360, starsDensity?: 0..1, zIndex?: 0 }`
2. `environment`: `{ type: "environment", preset: "cyberpunk-alley"|"neon-skyline"|"school-rooftop"|"dark-forest"|"dungeon-cavern"|"throne-hall"|"rainy-street"|"abstract-void", perspectiveY?: 0..100 (65), accentColor?, fogOpacity?: 0..0.9 (0.25), zIndex?: 10 }`
3. `character_figure`: `{ type: "character_figure", characterId, framing: "eyes-only"|"close-up"|"bust"|"waist-up"|"full-body", pose: "standing"|"action-lunge"|"facing-away"|"crouching"|"dramatic-profile", expression: "neutral"|"angry"|"shocked"|"smirk"|"menacing-glow"|"shadowed", position: { x: 0..100, y: 0..100 }, scale?: 0.3..3.5 (1), flipX?: false, rimLightColor?, glowEyes?: false, zIndex?: 20 }`
4. `svg_raw`: `{ type: "svg_raw", svgMarkup: string (<=50000), opacity?: 0..1 (1), zIndex?: 25 }`
5. `effect`: `{ type: "effect", kind: "speedlines-radial"|"speedlines-vertical"|"halftone-vignette"|"rain"|"embers"|"mana-particles"|"screen-crack"|"chromatic-glitch"|"impact-flash"|"vignette", color?: "#FFFFFF", intensity?: 0.1..1 (0.6), focalPoint?: { x: 50, y: 50 }, zIndex?: 30 }`
6. `emotion_badge`: `{ type: "emotion_badge", kind: "sweat-drop"|"anger-vein"|"shock-lines"|"sparkle"|"dark-gloom"|"question-mark"|"exclamation", position: { x, y }, scale?: 0.4..2.5 (1), color?, zIndex?: 35 }`
7. `image_ref`: `{ type: "image_ref", src: string, fit?: "cover"|"contain", opacity?: 0..1, zIndex?: 15 }` *(opt-in via `--allow-images`)*

## Bubbles (`Bubble`)
- `id`: unique string (**required**)
- `characterId`: optional slug (must exist in `cast[]`)
- `type`: `"speech"` | `"thought"` | `"shout"` | `"whisper"` | `"narration"` | `"system_window"` | `"phone_chat"` | `"telepathy"`
- `text`: 1–280 chars (supports `**bold**`, `*italic*`, `\n`)
- `position`: `{ x: 0..100, y: 0..100 }`
- `maxWidth`: `120..600` (default `280`), `fontSize`: `12..42` (default `19`), `align`: `"left"|"center"|"right"`
- `tail`: `{ enabled?: true, style?: "curved"|"sharp"|"jagged"|"dots"|"none", target?: { x, y }, offscreenDirection?: "left"|"right"|"top"|"bottom", width?: 8..40 (18) }`
- `style`: `{ fillColor?, strokeColor?, strokeWidth?: 0..8, textColor?, opacity?: 0.1..1, headerTitle?: string (<=40) }`

## SFX (`Sfx`)
- `id`: unique string (**required**)
- `text`: 1–32 chars
- `style`: `"impact"` | `"slash"` | `"tremble"` | `"ambient"` | `"glow"`
- `position`: `{ x: 0..100, y: 0..100 }`
- `rotation`: `-180..180` (`-8`), `fontSize`: `20..140` (`56`), `curveArc`: `-40..40` (`0`)
- `primaryColor`, `strokeColor`, `strokeWidth` (`1..16`), `shadowColor?`
