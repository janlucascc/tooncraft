# Webtoon Vertical Pacing & Cinematography Guide

In vertical-scroll manhwa, **vertical space equals time**. Unlike page-based manga where gutters are narrow and uniform, a Webtoon controls suspense, impact and emotional beats through panel height and gutter length.

---

## 1. The Manhwa 5-Beat Episode Formula

Structure every short episode or scene sequence around 5 distinct emotional and visual beats:

1. **Beat 1 — The Visual Hook / Cold Open (`establishing` or `low-angle`, `850–1050 px`)**
   - Immediate atmosphere and stakes. Establish the harsh world or imminent threat in the very first scroll.
2. **Beat 2 — Painful Status Quo / Vulnerability (`close-up` or `medium`, `520–720 px`)**
   - Show the protagonist's struggle, exhaustion, hunger, or weakness so the reader bonds with their plight.
3. **Beat 3 — The Cosmic / Catalyst Incident (`diagonal-both` or `shattered`, `780–980 px`)**
   - An anomalous event breaks the status quo (a falling star, a dungeon trap, a mysterious artifact). Follow with `pacingAfter: "dramatic_pause"`.
4. **Beat 4 — Visceral Climax / Transformation (`full-bleed` splash, `980–1300 px`)**
   - High-contrast lighting (`shadingIntensity: "dramatic-noir"`), `pose: "power-awakening"`, glowing eyes, radial speedlines, and raw physical/spiritual metamorphosis.
5. **Beat 5 — Impact Cliffhanger (`extreme-close-up` / `eyes-only` or heroic `low-angle`, `850–1100 px`)**
   - A chilling revelation, system message, or iconic closing line that leaves the reader desperate for the next episode.

---

## 2. Panel Height Semantics (at 800px Canvas Width)

| Panel Height | Feel / Role | Best Frame Types |
| :--- | :--- | :--- |
| `260–380 px` | Razor-sharp beat: eye flash, blade draw, heartbeat cut | `diagonal-both`, `standard`, `inset` |
| `480–640 px` | Dialogue exchange, reaction close-up, medium shot | `standard`, `diagonal-top`, `inset` |
| `720–920 px` | Establishing scene, dramatic confrontation, full-body stance | `full-bleed`, `standard`, `borderless` |
| `960–1400 px` | Heroic splash, climax strike, falling sequence, reveal | `full-bleed`, `shattered`, `diagonal-both` |

---

## 3. Gutter Pacing Presets (`pacingAfter`)

| Preset | Pixels | Narrative Meaning | Recommended `pacingTransition` |
| :--- | :---: | :--- | :--- |
| `tight` | `16 px` | Rapid back-and-forth blows or snappy banter | `solid` |
| `normal` | `64 px` | Standard reading flow inside a scene | `solid` |
| `breath` | `140 px` | Beat of hesitation, realization or camera shift | `solid` or `gradient-shift` |
| `dramatic_pause` | `320 px` | Heavy silence right before a reveal or punchline | `fade-to-black` or `fade-to-white` |
| `scene_transition` | `480 px` | Time skip, location change or flashback entry | `fade-to-black` |
| `custom` | `0–1200 px` | Exact editorial rhythm (`customPacingPx` required) | Any |

---

## 4. Golden Rules of Manhwa Direction & Dialogue Cascading

1. **Short Cascading Bubbles (3–12 Words Each):**
   - Never dump a 30-word paragraph into a single bubble.
   - Break a monologue into **2 or 3 short descending bubbles** (`y: 16` → `y: 44` → `y: 78`) staggering left-to-right (`x: 28` → `x: 72`) so the reader's eye flows effortlessly down the vertical canvas.
2. **Aggressive Camera Alternation:**
   - Never stack two identical `medium` or `waist-up` shots in a row.
   - Alternate: `establishing (full-body)` → `close-up` → `diagonal action-lunge` → `eyes-only` → `full-bleed power-awakening`.
3. **Tail Targeting:**
   - Always point `tail.target` near the speaker's mouth/head (e.g., if `character_figure` is at `x: 45, y: 98` in `bust`, head center is around `x: 45, y: 42`).
4. **Contrast First:**
   - On dark themes (`cyberpunk-neon`, `solo-system`, `dark-fantasy`), keep protagonist dialogue crisp and reserve dark/glowing bubbles (`telepathy`, `system_window`, `narration`) for ancient voices, system prompts, or narration.
