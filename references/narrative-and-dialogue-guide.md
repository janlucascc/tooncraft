# Manhwa Screenwriting, Dialogue Engineering & Character Development Guide (Pass 1 Reference)

Great visuals catch a reader's eye for 2 seconds; **great conflict, subtext and character stakes keep them scrolling for 100 chapters**. Never jump directly from a user prompt into visual panels without first running **Pass 1: The Writer's Room**.

---

## 1. The 4 Pillars of Deep Manhwa Storytelling (`narrativeArc`)

Before creating a single panel, populate `narrativeArc` at the root of `story.json`:

1. **`emotionalAnchor` (The Concrete Human Stake):**
   - Abstract goals (*"save the tribe"*, *"protect the world"*, *"get stronger"*) feel hollow.
   - Anchor the protagonist's struggle in a **named person, physical token, or immediate human bond** (e.g. *"Taru's younger brother Kori lies dying of frost-lung in the snow cave, clutching their father's broken flint spear"*).
2. **`centralConflict` (Interpersonal & Moral Friction):**
   - Put at least **two opposing worldviews in the room**.
   - Example: Chief Brak represents ruthless tribal survival (*"Abandon the sick so the strong can outrun the frost"*), while Taru represents defiant loyalty (*"If survival costs our blood-kin, we are already dead"*).
3. **`protagonistChoice` (The Conscious Devil's Bargain):**
   - Power must never happen by accident. The protagonist must be warned of the price and **choose to pay it anyway**.
4. **`ironicCostOrTwist` (The Tragic Payoff / Cliffhanger):**
   - Every gift carries an ironic curse. When the protagonist seizes immortality to save someone mortal, the metamorphosis takes centuries — or demands a price that redefines their entire existence.

---

## 2. Character Development & Distinct Voices (`narrativeProfile`)

Give every character in `cast[]` a `narrativeProfile`:

- **`coreGoal`**: What they want in *this exact scene*.
- **`woundOrFlaw`**: The scar, guilt, fear, or physical weakness haunting them.
- **`speechStyle`**: Their distinct vocabulary, sentence rhythm, and metaphors:
  - *Stone Age Hunter:* Concrete, sensory nouns (*marrow, flint, ash, wolf-tooth, winter-breath, blood-kin*). Short, clipped sentences spoken through chattering teeth.
  - *Tribal Elder / pragmatic rival:* Cold proverbs, harsh collective imperatives (*"Dead wood gives no heat"*).
  - *Cosmic / Ancient Entity:* Timeless, poetic cruelty; addresses mortals as *ephemeral clay*, *sparks in the wind*, or *ash waiting to cool*.

---

## 3. The 5 Golden Laws of Manhwa Dialogue Engineering

### Law 1: Ban "Trailer Captions" & On-the-Nose Exposition
- ❌ **Weak:** *"O céu está queimando?! O que é aquilo?!"*
- ✅ **Gripping:** *"Estrelas não fazem barulho de carne na brasa..."* $\to$ *"Aquilo não está caindo. Está sangrando."*

### Law 2: The 3-Bubble Dramatic Cascade (Setup $\to$ Friction $\to$ Strike)
Instead of 1 lonely bubble per panel, chain **2 to 3 short bubbles (`5–15 words each`)** inside a panel along a descending diagonal (`y: 14` $\to$ `y: 40` $\to$ `y: 74`):
1. **Top Bubble (The Challenge / Setup):** A character or voice presses the wound.
2. **Middle Bubble (The Subtext / Hesitation):** A sharp turn, memory, or counter-observation.
3. **Bottom Bubble (The Emotional Strike):** The line that lands the punch before the reader scrolls to the next panel.

### Law 3: Show, Don't Tell (Keep `narration` $\le 30\%$)
- Never use a `narration` box to describe what is already drawn in the panel.
- Use `narration` only for **ironic time-skips, inner philosophical contrast, or sensory atmosphere** that cannot be seen.

### Law 4: Use Flashback & Trauma Beats (`memoryTint`)
- Insert at least one `flashback-memory` panel (`memoryTint: "sepia-flashback"`, `"crimson-trauma"`, or `"frost-despair"`) at the moment of greatest doubt so the reader *sees* the promise or trauma driving the protagonist's choice.

### Law 5: Scene Density (Pair Medium Panels Inside Slices)
- Because `sliceMaxHeight` is `1280px`, two medium panels (`480–560px` each + `tight`/`normal` gutter) fit inside **one single page slice**!
- For a **5-page request (`5 slices`)**, design **8 to 10 panels** (pairing two `500–550px` panels on dialogue/flashback pages and using full `980–1120px` splash panels on the climax and cliffhanger) so every page feels like a rich, published manhwa chapter.
