# Webtoon Vertical Pacing & Cinematography Guide

In vertical-scroll manhwa, **vertical space equals time**. Unlike page-based manga where gutters are narrow and uniform, a Webtoon controls suspense, impact and emotional beats through panel height and gutter length.

---

## 1. Panel Height Semantics (at 800px Canvas Width)

| Panel Height | Feel / Role | Best Frame Types |
| :--- | :--- | :--- |
| `260–380 px` | Razor-sharp beat: eye flash, blade draw, heartbeat cut | `diagonal-both`, `standard`, `inset` |
| `480–640 px` | Dialogue exchange, reaction close-up, medium shot | `standard`, `diagonal-top`, `inset` |
| `720–920 px` | Establishing scene, dramatic confrontation, full-body stance | `full-bleed`, `standard`, `borderless` |
| `960–1400 px` | Heroic splash, climax strike, falling sequence, reveal | `full-bleed`, `shattered`, `diagonal-both` |

---

## 2. Gutter Pacing Presets (`pacingAfter`)

| Preset | Pixels | Narrative Meaning | Recommended `pacingTransition` |
| :--- | :---: | :--- | :--- |
| `tight` | `16 px` | Rapid back-and-forth blows or snappy banter | `solid` |
| `normal` | `64 px` | Standard reading flow inside a scene | `solid` |
| `breath` | `140 px` | Beat of hesitation, realization or camera shift | `solid` or `gradient-shift` |
| `dramatic_pause` | `320 px` | Heavy silence right before a reveal or punchline | `fade-to-black` or `fade-to-white` |
| `scene_transition` | `480 px` | Time skip, location change or flashback entry | `fade-to-black` |
| `custom` | `0–1200 px` | Exact editorial rhythm (`customPacingPx` required) | Any |

---

## 3. Golden Rules of Manhwa Direction

1. **The 3-Second Mobile Rule:** A reader scrolls ~1 mobile viewport (`~1730px` at 800px canvas scale) every 2–3 seconds. Place at most **1–2 panels** per screen during action, and use `dramatic_pause` before major reveals so the reveal scrolls cleanly into view.
2. **Shot Alternation:** Never stack three identical `medium` shots in a row. Alternate:
   `establishing` → `medium` → `close-up` → `extreme-close-up (eyes-only)` → `dutch-angle` splash.
3. **Lettering Economy:** Keep each speech bubble under **18–25 words**. Split long monologues across two stacked bubbles (top-left at `y: 22`, bottom-right at `y: 78`) to guide the reader's eye downward along a Z-path.
4. **Tail Targeting:** Always point `tail.target` near the speaker's mouth/head (e.g., if `character_figure` is at `x: 35, y: 100` in `close-up`, head center is around `x: 38, y: 52`).
5. **Contrast First:** On dark themes (`cyberpunk-neon`, `solo-system`, `noir-thriller`), keep protagonist dialogue bright (`#FFFFFF` fill) and reserve dark tinted bubbles for antagonists, narration or whispers.
