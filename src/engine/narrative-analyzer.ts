import type { WebtoonEpisode } from '../schema/story.js';

export interface NarrativeMetrics {
  hasNarrativeArc: boolean;
  castWithProfiles: number;
  totalCast: number;
  panelsWithSubtext: number;
  panelsWithBeats: number;
  flashbackPanels: number;
  averageBubblesPerPanel: number;
  averageWordsPerBubble: number;
  narrationRatio: number;
  dialogueExchangePanels: number;
  protagonistSpokenLines: number;
  panelsPerSlice: number;
}

export interface NarrativeAnalysisReport {
  score: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  metrics: NarrativeMetrics;
  strengths: string[];
  warnings: string[];
}

/**
 * Evaluates the dramatic depth, dialogue engineering, character agency,
 * and scene density of a WebtoonEpisode ("Pass 1 Writer's Room Linter").
 */
export function analyzeEpisodeNarrative(
  episode: WebtoonEpisode,
  estimatedSlices: number,
): NarrativeAnalysisReport {
  const totalPanels = episode.panels.length;
  const totalCast = episode.cast.length;
  const castWithProfiles = episode.cast.filter(
    (c) =>
      Boolean(c.narrativeProfile?.coreGoal) ||
      Boolean(c.narrativeProfile?.woundOrFlaw) ||
      Boolean(c.narrativeProfile?.speechStyle),
  ).length;

  const protagonistIds = new Set(
    episode.cast.filter((c) => c.role === 'protagonist').map((c) => c.id),
  );
  if (protagonistIds.size === 0 && episode.cast.length > 0) {
    protagonistIds.add(episode.cast[0]!.id);
  }

  let totalBubbles = 0;
  let totalWords = 0;
  let narrationBubbles = 0;
  let protagonistSpokenLines = 0;
  let dialogueExchangePanels = 0;
  let panelsWithSubtext = 0;
  let panelsWithBeats = 0;
  let flashbackPanels = 0;

  for (const panel of episode.panels) {
    if (panel.subtextNote && panel.subtextNote.trim().length > 0) panelsWithSubtext++;
    if (panel.narrativeBeat) panelsWithBeats++;
    if (panel.memoryTint !== 'none' || panel.narrativeBeat === 'flashback-memory') {
      flashbackPanels++;
    }

    const speakersInPanel = new Set<string>();
    let nonNarrationInPanel = 0;

    for (const b of panel.bubbles) {
      totalBubbles++;
      const words = b.text.trim().split(/\s+/).filter(Boolean).length;
      totalWords += words;

      if (b.type === 'narration') {
        narrationBubbles++;
      } else {
        nonNarrationInPanel++;
        if (b.characterId) {
          speakersInPanel.add(b.characterId);
          if (protagonistIds.has(b.characterId)) {
            protagonistSpokenLines++;
          }
        }
      }
    }

    if (speakersInPanel.size >= 2 || nonNarrationInPanel >= 2) {
      dialogueExchangePanels++;
    }
  }

  const averageBubblesPerPanel =
    totalPanels > 0 ? Number((totalBubbles / totalPanels).toFixed(2)) : 0;
  const averageWordsPerBubble =
    totalBubbles > 0 ? Number((totalWords / totalBubbles).toFixed(1)) : 0;
  const narrationRatio =
    totalBubbles > 0 ? Number((narrationBubbles / totalBubbles).toFixed(2)) : 0;
  const panelsPerSlice =
    estimatedSlices > 0 ? Number((totalPanels / Math.max(1, estimatedSlices)).toFixed(2)) : totalPanels;
  const hasNarrativeArc = Boolean(episode.narrativeArc);

  const strengths: string[] = [];
  const warnings: string[] = [];
  let score = 50;

  // 1. Narrative Arc (Emotional Anchor + Conflict + Choice + Ironic Twist)
  if (hasNarrativeArc) {
    score += 12;
    strengths.push(
      'Structured narrativeArc defined (emotional anchor, conflict, choice, ironic twist).',
    );
  } else {
    warnings.push(
      'Missing "narrativeArc" in episode root: define emotionalAnchor, centralConflict, protagonistChoice, and ironicCostOrTwist in Pass 1.',
    );
  }

  // 2. Character Psychological & Speech Profiles
  if (totalCast >= 2) {
    score += 6;
    strengths.push(`Multi-character cast (${totalCast} members) enables interpersonal friction.`);
  } else {
    warnings.push(
      'Only 1 character in cast: add a foil, elder, rival, loved one, or antagonist to create real dialogue friction.',
    );
  }

  if (castWithProfiles > 0 && castWithProfiles === totalCast) {
    score += 10;
    strengths.push('Every cast member has a narrativeProfile (goal, wound/flaw, speechStyle).');
  } else if (castWithProfiles > 0) {
    score += 5;
  } else {
    warnings.push(
      'Cast members lack "narrativeProfile": define coreGoal, woundOrFlaw, and speechStyle to avoid generic voices.',
    );
  }

  // 3. Dialogue cadence & back-and-forth exchange
  if (averageBubblesPerPanel >= 2.0 && averageBubblesPerPanel <= 4.0) {
    score += 10;
    strengths.push(
      `Rich bubble cadence (${averageBubblesPerPanel} bubbles/panel) creates smooth vertical reading flow.`,
    );
  } else if (averageBubblesPerPanel < 1.8) {
    score -= 6;
    warnings.push(
      `Sparse dialogue cadence (${averageBubblesPerPanel} bubbles/panel): chain 2–3 short descending bubbles per panel for setup → tension → punchline.`,
    );
  }

  if (dialogueExchangePanels >= Math.ceil(totalPanels * 0.4)) {
    score += 8;
    strengths.push(
      `${dialogueExchangePanels}/${totalPanels} panels feature multi-bubble dialogue exchanges or speaker friction.`,
    );
  } else {
    warnings.push(
      `Low dialogue interaction (${dialogueExchangePanels}/${totalPanels} panels): include more back-and-forth exchanges between characters.`,
    );
  }

  // 4. Show, Don't Tell (Narration ratio)
  if (narrationRatio <= 0.35) {
    score += 6;
  } else {
    score -= 8;
    warnings.push(
      `Heavy exposition (${Math.round(narrationRatio * 100)}% narration boxes): keep narration <= 35% and tell the story through character dialogue and action.`,
    );
  }

  // 5. Subtext & Dramatic Beats
  if (panelsWithSubtext >= Math.ceil(totalPanels * 0.5) && panelsWithBeats >= Math.ceil(totalPanels * 0.5)) {
    score += 8;
    strengths.push(
      `Strong directorial subtext (${panelsWithSubtext}/${totalPanels} panels annotated with subtextNote & narrativeBeat).`,
    );
  } else {
    warnings.push(
      `Add "narrativeBeat" and "subtextNote" to panels so dialogue carries unspoken tension rather than on-the-nose exposition.`,
    );
  }

  // 6. Protagonist Agency
  if (protagonistSpokenLines >= 4) {
    score += 5;
  } else {
    warnings.push(
      `Low protagonist agency (${protagonistSpokenLines} spoken lines): give the protagonist active lines of defiance, bargaining, or decision.`,
    );
  }

  // 7. Flashback / Emotional Contrast
  if (flashbackPanels > 0) {
    score += 5;
    strengths.push(
      `Includes ${flashbackPanels} flashback/memory beat(s) for emotional depth and backstory contrast.`,
    );
  }

  score = Math.max(0, Math.min(100, score));
  const grade: NarrativeAnalysisReport['grade'] =
    score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 68 ? 'B' : score >= 55 ? 'C' : 'D';

  return {
    score,
    grade,
    metrics: {
      hasNarrativeArc,
      castWithProfiles,
      totalCast,
      panelsWithSubtext,
      panelsWithBeats,
      flashbackPanels,
      averageBubblesPerPanel,
      averageWordsPerBubble,
      narrationRatio,
      dialogueExchangePanels,
      protagonistSpokenLines,
      panelsPerSlice,
    },
    strengths,
    warnings,
  };
}
