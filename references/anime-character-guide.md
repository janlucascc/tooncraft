# High-Fidelity Anime & Manhwa Character Design Guide (Pass 2 Reference)

Because ToonCraft renders static SVG into high-resolution PNG/WebP slices and HTML readers, **there is zero real-time 60fps constraint**. Every panel can and should carry dense, publication-grade anime/manhwa vector detail.

---

## 1. Cast Setup (`cast[]` in `story.json`)

Always configure every recurring character with rich anime styling fields:

- `silhouettePreset`:
  - `"primitive-hunter"` — exposed muscular chest with pectoral cel-shading, diagonal beast-pelt tunic, wolf-fur shoulder mantle, bone-fang necklace, leather forearm wraps, and jagged hide skirt.
  - `"martial-artist"` — combat gi, sash, forearm wraps, warrior headband.
  - `"hooded-mage"` — high-collar arcane robe, trim stripes, deep hood with hair fringe peeking out.
  - `"armored-knight"` — beveled chest plate, pauldrons, metallic gauntlets, emblem.
  - `"cyber-assassin"` — tactical hood, neon-lined mask, flowing scarf, glowing circuit trims.
  - `"casual-student"` — tailored blazer, shirt collar, tie/ribbon.
  - `"suit-detective"` — long trench coat, lapels, fedora hat.
  - `"shadow-entity"` — horned void silhouette with glowing aura wisps.
- `eyeStyle`:
  - `"sharp-hunter"` (recommended for manhwa protagonists like Sung Jin-woo / Taru)
  - `"mystic-glow"` (concentric glowing arcane iris ring)
  - `"villain-narrow"` (razor-thin predatory eyes)
  - `"standard-anime"` (balanced shonen proportions)
  - `"soft-shojo"` (tall expressive eyes)
- `hairStyle`:
  - `"auto"` (matches `silhouettePreset`)
  - `"spiky-manhwa"` (layered sharp bangs + crown spikes + angel-ring shine)
  - `"wild-primitive"` (long jagged primal mane + fierce bangs)
  - `"undercut-sleek"` (modern manhwa parted fringe)
  - `"ponytail-ronin"` (high warrior tail + nape spikes)
  - `"long-flowing"` (cascading shoulder locks)
- `accessories`: array of `"scar-eye"`, `"tribal-marks"`, `"headband"`, `"earring"`, `"fur-collar"`, `"bone-necklace"`, `"cyber-visor"`, `"cloak-clasp"`.

---

## 2. The Second Pass (Pass 2: Character Polish Scan)

After drafting the episode structure and dialogues in **Pass 1**, you MUST perform **Pass 2** across every panel before rendering:

### Checklist for Every `character_figure` Layer:
1. **Directional Lighting (`lightDirection`)**:
   - Match the light source in the panel (`"left"`, `"right"`, `"top"`, `"bottom-fire"`, `"back-rim"`).
   - If the character stands before a flame, meteor, or glowing artifact below them, set `lightDirection: "bottom-fire"` and set `rimLightColor` to the fire/mana hex color.
2. **Cel-Shading Depth (`shadingIntensity`)**:
   - Use `"standard"` for normal scenes, `"heavy"` for action/tension, and `"dramatic-noir"` for life-or-death reveals or awakening moments.
3. **Micro-Expressions (`expression`)**:
   - Never leave characters on `"neutral"` during dramatic beats. Choose `"determined"`, `"angry"`, `"shocked"`, `"pain"`, `"smirk"`, `"menacing-glow"`, or `"shadowed"`.
4. **Built-in Weapon Props (`weaponProp`)**:
   - Attach `"stone-spear"`, `"katana"`, `"greatsword"`, `"dagger-dual"`, or `"magic-orb"` directly to the figure so it moves and scales with the character's hand.
5. **Awakening / Combat Auras (`auraIntensity`)**:
   - Set `auraIntensity` (`0.3` to `1.0`) and `glowEyes: true` when a character channels power, immortality, or killing intent.
6. **Custom Vector Detail Injection (`detailOverlaySvg`)**:
   - Each `character_figure` supports `detailOverlaySvg` — raw SVG paths drawn directly inside the character's local coordinate space!
   - **Local Coordinate Reference**:
     - Head center: `(0, -535)` | Eyes: `(-16, -532)` and `(16, -532)` | Mouth: `(0, -501)`
     - Neck & Collarbone: `(0, -475)` | Chest center: `(0, -410)` | Waist/Hip: `(0, -262)`
   - Use `detailOverlaySvg` in Pass 2 to inject panel-specific character details: glowing chest runes, blood/sweat droplets on the cheek, energy veins cracking across the face/chest, breath vapor in freezing air, or shattered weapon fragments.

---

## 3. Ready-to-Use `detailOverlaySvg` Snippets (Local Character Coords)

### A. Freezing Breath Vapor (near mouth `0, -500`)
```xml
<path d="M8 -500C22 -504 38 -496 52 -506C38 -490 20 -492 8 -498Z" fill="#E2E8F0" opacity="0.45"/>
<path d="M12 -495C26 -496 36 -488 46 -494C34 -484 22 -488 12 -493Z" fill="#F8FAFC" opacity="0.3"/>
```

### B. Glowing Immortality / Mana Heart Core & Chest Veins (`0, -415`)
```xml
<circle cx="0" cy="-415" r="14" fill="#F59E0B" opacity="0.35"/>
<circle cx="0" cy="-415" r="6" fill="#FEF08A"/>
<path d="M0 -415L-22 -435L-34 -430M0 -415L24 -432L36 -442M0 -415L-18 -388L-12 -368M0 -415L20 -390L28 -372M0 -415L0 -455" fill="none" stroke="#FDE047" stroke-width="1.8" stroke-linecap="round"/>
```

### C. Facial Energy Cracks / Awakening Marks (around eyes & cheeks)
```xml
<path d="M-18 -522L-24 -510L-19 -500M18 -522L25 -512L21 -498M0 -555L-5 -544L0 -536L5 -544Z" fill="none" stroke="#38BDF8" stroke-width="1.5" stroke-linecap="round"/>
```
