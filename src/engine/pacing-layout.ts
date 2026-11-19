import type { WebtoonEpisode } from '../schema/story.js';
import type { PacingPreset, PacingTransition, Panel } from '../schema/panel.js';
import type { ResolvedTheme } from '../templates/themes.js';
import { type BubbleMetrics, measureBubble } from '../components/bubbles/bubble-geometry.js';
import { pctY } from '../components/svg-utils.js';

/** Semantic pixel gaps for vertical scroll rhythm. */
export const PACING_PX: Record<Exclude<PacingPreset, 'custom'>, number> = {
  tight: 16,
  normal: 64,
  breath: 140,
  dramatic_pause: 320,
  scene_transition: 480,
};

export interface ProtectedBand {
  yStart: number;
  yEnd: number;
  reason: string;
}

export interface GutterLayout {
  afterPanelId: string;
  yStart: number;
  yEnd: number;
  height: number;
  transition: PacingTransition;
  /** Safe cut line in the middle of this gutter (global Y). */
  safeCutY: number;
}

export interface PanelLayout {
  panelId: string;
  index: number;
  yStart: number;
  yEnd: number;
  width: number;
  height: number;
  /** Bubble metrics keyed by bubble id (after optional collision nudging). */
  bubbles: Map<string, BubbleMetrics>;
  gutterAfter?: GutterLayout;
}

export interface EpisodeLayout {
  width: number;
  topPadding: number;
  bottomPadding: number;
  totalHeight: number;
  panels: PanelLayout[];
  gutters: GutterLayout[];
  /** Preferred cut points (middle of each gutter). */
  gutterCutPoints: number[];
  /** Global vertical bands covered by speech bubbles or SFX (avoid slicing inside). */
  protectedBands: ProtectedBand[];
}

export interface LayoutOptions {
  /** Gently nudge overlapping bubbles inside the same panel vertically (default true). */
  resolveBubbleCollisions?: boolean;
  topPadding?: number;
  bottomPadding?: number;
}

export function resolvePacingPx(panel: Panel): number {
  if (panel.pacingAfter === 'custom') return panel.customPacingPx ?? PACING_PX.normal;
  return PACING_PX[panel.pacingAfter];
}

function rectsOverlapX(a: BubbleMetrics, b: BubbleMetrics, pad: number): boolean {
  return a.x - pad < b.x + b.width && a.x + a.width + pad > b.x;
}

/**
 * Measure all bubbles in a panel and gently push overlapping bubbles downward
 * in reading order so lettering stays legible.
 */
export function layoutPanelBubbles(
  panel: Panel,
  width: number,
  theme: ResolvedTheme,
  resolveCollisions: boolean,
): Map<string, BubbleMetrics> {
  const box = { width, height: panel.height };
  const measured = panel.bubbles.map((b) => ({
    bubble: b,
    metrics: measureBubble(b, box, theme.fontPreset),
  }));

  if (resolveCollisions && measured.length > 1) {
    // Sort top-to-bottom so upper bubbles anchor the reading flow.
    const sorted = [...measured].sort((a, b) => a.metrics.cy - b.metrics.cy);
    const gap = 10;
    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i]!;
      let moved = false;
      for (let j = 0; j < i; j++) {
        const prev = sorted[j]!;
        if (!rectsOverlapX(prev.metrics, curr.metrics, 6)) continue;
        const minTop = prev.metrics.y + prev.metrics.height + gap;
        if (curr.metrics.y < minTop) {
          const desiredCy = minTop + curr.metrics.ry;
          const clampedCy = Math.min(panel.height - curr.metrics.ry - 8, desiredCy);
          if (clampedCy > curr.metrics.cy) {
            curr.metrics = measureBubble(curr.bubble, box, theme.fontPreset, {
              cx: curr.metrics.cx,
              cy: clampedCy,
            });
            moved = true;
          }
        }
      }
      void moved;
    }
  }

  const map = new Map<string, BubbleMetrics>();
  for (const item of measured) map.set(item.bubble.id, item.metrics);
  return map;
}

export function computeEpisodeLayout(
  episode: WebtoonEpisode,
  theme: ResolvedTheme,
  options: LayoutOptions = {},
): EpisodeLayout {
  const width = episode.canvas.width;
  const topPadding = options.topPadding ?? 24;
  const bottomPadding = options.bottomPadding ?? 48;
  const resolveCollisions = options.resolveBubbleCollisions ?? true;

  const panels: PanelLayout[] = [];
  const gutters: GutterLayout[] = [];
  const gutterCutPoints: number[] = [];
  const protectedBands: ProtectedBand[] = [];

  let cursorY = topPadding;

  episode.panels.forEach((panel, index) => {
    const yStart = cursorY;
    const yEnd = yStart + panel.height;
    const bubbles = layoutPanelBubbles(panel, width, theme, resolveCollisions);

    // Record protected vertical spans for bubbles and SFX.
    for (const [id, m] of bubbles.entries()) {
      protectedBands.push({
        yStart: Math.max(0, yStart + m.y - 8),
        yEnd: yStart + m.y + m.height + 8,
        reason: `bubble:${id}`,
      });
    }
    for (const sfx of panel.sfx) {
      const sy = yStart + pctY({ width, height: panel.height }, sfx.position.y);
      const half = sfx.fontSize * 0.72;
      protectedBands.push({
        yStart: Math.max(0, sy - half),
        yEnd: sy + half,
        reason: `sfx:${sfx.id}`,
      });
    }

    let gutterAfter: GutterLayout | undefined;
    const isLast = index === episode.panels.length - 1;
    if (!isLast) {
      const gHeight = resolvePacingPx(panel);
      const gStart = yEnd;
      const gEnd = gStart + gHeight;
      const safeCutY = Math.round(gStart + gHeight / 2);
      gutterAfter = {
        afterPanelId: panel.id,
        yStart: gStart,
        yEnd: gEnd,
        height: gHeight,
        transition: panel.pacingTransition,
        safeCutY,
      };
      gutters.push(gutterAfter);
      if (gHeight >= 8) gutterCutPoints.push(safeCutY);
      cursorY = gEnd;
    } else {
      cursorY = yEnd;
    }

    panels.push({
      panelId: panel.id,
      index,
      yStart,
      yEnd,
      width,
      height: panel.height,
      bubbles,
      gutterAfter,
    });
  });

  const totalHeight = cursorY + bottomPadding;
  return {
    width,
    topPadding,
    bottomPadding,
    totalHeight,
    panels,
    gutters,
    gutterCutPoints,
    protectedBands,
  };
}
