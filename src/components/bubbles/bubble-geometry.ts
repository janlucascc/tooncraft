import type { Bubble, BubbleType } from '../../schema/bubble.js';
import type { FontPreset } from '../../schema/common.js';
import {
  FONT_SETS,
  type FontFamilySet,
  type WrapResult,
  wrapBalanced,
  wrapTextToWidth,
} from '../font-metrics.js';
import { type PanelBox, fmt, pctPoint } from '../svg-utils.js';
import { createPrng } from '../../engine/prng.js';

/**
 * Computes exact bubble dimensions from measured glyph metrics and builds the
 * outer SVG contour path for every `BubbleType`.
 */

export interface BubbleMetrics {
  cx: number;
  cy: number;
  width: number;
  height: number;
  /** Half-width / half-height (ellipse radii for oval/cloud/shout types). */
  rx: number;
  ry: number;
  /** Bounding box in panel pixels (before tail). */
  x: number;
  y: number;
  /** Header height reserved at top (non-zero for `system_window` with title). */
  headerHeight: number;
  fonts: FontFamilySet;
  effectiveFontSize: number;
  uppercase: boolean;
  wrap: WrapResult;
}

export function fontSetForBubble(type: BubbleType, themeFontPreset: FontPreset): FontFamilySet {
  switch (type) {
    case 'shout':
      return FONT_SETS.dramatic;
    case 'system_window':
    case 'phone_chat':
      return FONT_SETS.system;
    case 'narration':
      return FONT_SETS.narration;
    default:
      return FONT_SETS[themeFontPreset];
  }
}

export function measureBubble(
  bubble: Bubble,
  box: PanelBox,
  themeFontPreset: FontPreset,
  centerOverride?: { cx: number; cy: number },
): BubbleMetrics {
  const fonts = fontSetForBubble(bubble.type, themeFontPreset);
  const uppercase = bubble.type === 'shout';
  const effectiveFontSize =
    bubble.type === 'whisper'
      ? Math.max(12, Math.round(bubble.fontSize * 0.88))
      : bubble.type === 'shout'
        ? Math.min(46, Math.round(bubble.fontSize * 1.15))
        : bubble.fontSize;

  const isRectangular =
    bubble.type === 'narration' || bubble.type === 'system_window' || bubble.type === 'phone_chat';
  const wrapOpts = {
    fontSize: effectiveFontSize,
    maxWidth: bubble.maxWidth,
    fonts,
    uppercase,
    lineHeightFactor: bubble.type === 'shout' ? 1.14 : 1.24,
    letterSpacing: bubble.type === 'shout' ? 0.8 : bubble.type === 'system_window' ? 0.4 : 0,
  };
  const wrap = isRectangular
    ? wrapTextToWidth(bubble.text, wrapOpts)
    : wrapBalanced(bubble.text, wrapOpts);

  const hasHeader = bubble.type === 'system_window' && Boolean(bubble.style?.headerTitle);
  const headerHeight = hasHeader ? Math.round(effectiveFontSize * 1.45 + 10) : 0;

  let width: number;
  let height: number;
  if (bubble.type === 'narration') {
    width = Math.max(100, wrap.width + 36);
    height = Math.max(44, wrap.height + 24);
  } else if (bubble.type === 'system_window') {
    width = Math.max(180, wrap.width + 48);
    height = Math.max(60, wrap.height + 34 + headerHeight);
  } else if (bubble.type === 'phone_chat') {
    width = Math.max(96, wrap.width + 36);
    height = Math.max(44, wrap.height + 24);
  } else if (bubble.type === 'shout') {
    // Extra room so spikes never clip the letters.
    width = Math.max(130, wrap.width * 1.48 + 56);
    height = Math.max(88, wrap.height * 1.56 + 48);
  } else if (bubble.type === 'thought') {
    width = Math.max(120, wrap.width * 1.4 + 46);
    height = Math.max(76, wrap.height * 1.46 + 40);
  } else {
    // speech / whisper / telepathy — organic ellipse with balanced aspect ratio
    width = Math.max(108, wrap.width * 1.28 + 40);
    height = Math.max(68, wrap.height * 1.46 + 34);
  }

  const rawPos = centerOverride ?? (() => {
    const p = pctPoint(box, bubble.position);
    return { cx: p.x, cy: p.y };
  })();

  // Clamp softly so bubbles stay inside canvas width with at least 10px margin.
  const rx = width / 2;
  const ry = height / 2;
  const cx = Math.max(rx + 10, Math.min(box.width - rx - 10, rawPos.cx));
  const cy = Math.max(ry + 10, Math.min(box.height - ry - 10, rawPos.cy));

  return {
    cx,
    cy,
    width,
    height,
    rx,
    ry,
    x: cx - rx,
    y: cy - ry,
    headerHeight,
    fonts,
    effectiveFontSize,
    uppercase,
    wrap,
  };
}

/** Smooth ellipse path. */
function ellipseShape(cx: number, cy: number, rx: number, ry: number): string {
  return (
    `M${fmt(cx - rx)} ${fmt(cy)}` +
    `A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx + rx)} ${fmt(cy)}` +
    `A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx - rx)} ${fmt(cy)}Z`
  );
}

/** Organic scalloped cloud contour for thought bubbles. */
function cloudShape(cx: number, cy: number, rx: number, ry: number): string {
  const bumps = Math.max(10, Math.min(18, Math.round((rx + ry) / 17)));
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < bumps; i++) {
    const a = (i / bumps) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rx * 0.9, y: cy + Math.sin(a) * ry * 0.9 });
  }
  let d = `M${fmt(pts[0]!.x)} ${fmt(pts[0]!.y)}`;
  for (let i = 0; i < bumps; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % bumps]!;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const vx = midX - cx;
    const vy = midY - cy;
    const len = Math.hypot(vx, vy) || 1;
    const bulge = 14 + ((i % 3) * 3);
    const ctrlX = midX + (vx / len) * bulge;
    const ctrlY = midY + (vy / len) * bulge;
    d += `Q${fmt(ctrlX)} ${fmt(ctrlY)} ${fmt(b.x)} ${fmt(b.y)}`;
  }
  return `${d}Z`;
}

/** Energetic spiky starburst for shout bubbles. */
function shoutShape(cx: number, cy: number, rx: number, ry: number, seed: string): string {
  const prng = createPrng(`shout-${seed}`);
  const spikes = Math.max(14, Math.min(24, Math.round((rx + ry) / 14)));
  const total = spikes * 2;
  let d = '';
  for (let i = 0; i < total; i++) {
    const a = (i / total) * Math.PI * 2 + prng.range(-0.04, 0.04);
    const isOuter = i % 2 === 0;
    const rScale = isOuter ? prng.range(1.02, 1.18) : prng.range(0.76, 0.86);
    const x = cx + Math.cos(a) * rx * rScale;
    const y = cy + Math.sin(a) * ry * rScale;
    d += `${i === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`;
  }
  return `${d}Z`;
}

/** Chamfered 45-degree tech window for `system_window`. */
function chamferedRect(x: number, y: number, w: number, h: number, cut = 14): string {
  const c = Math.min(cut, w / 4, h / 4);
  return (
    `M${fmt(x + c)} ${fmt(y)}H${fmt(x + w - c)}L${fmt(x + w)} ${fmt(y + c)}` +
    `V${fmt(y + h - c)}L${fmt(x + w - c)} ${fmt(y + h)}H${fmt(x + c)}` +
    `L${fmt(x)} ${fmt(y + h - c)}V${fmt(y + c)}Z`
  );
}

/** Rounded rectangle path for `phone_chat` / `narration`. */
function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const cr = Math.min(r, w / 2, h / 2);
  if (cr <= 0) return `M${fmt(x)} ${fmt(y)}H${fmt(x + w)}V${fmt(y + h)}H${fmt(x)}Z`;
  return (
    `M${fmt(x + cr)} ${fmt(y)}H${fmt(x + w - cr)}A${fmt(cr)} ${fmt(cr)} 0 0 1 ${fmt(x + w)} ${fmt(y + cr)}` +
    `V${fmt(y + h - cr)}A${fmt(cr)} ${fmt(cr)} 0 0 1 ${fmt(x + w - cr)} ${fmt(y + h)}` +
    `H${fmt(x + cr)}A${fmt(cr)} ${fmt(cr)} 0 0 1 ${fmt(x)} ${fmt(y + h - cr)}` +
    `V${fmt(y + cr)}A${fmt(cr)} ${fmt(cr)} 0 0 1 ${fmt(x + cr)} ${fmt(y)}Z`
  );
}

export function buildBubbleBodyPath(type: BubbleType, m: BubbleMetrics, bubbleId: string): string {
  switch (type) {
    case 'thought':
      return cloudShape(m.cx, m.cy, m.rx, m.ry);
    case 'shout':
      return shoutShape(m.cx, m.cy, m.rx, m.ry, bubbleId);
    case 'narration':
      return roundedRect(m.x, m.y, m.width, m.height, 2);
    case 'system_window':
      return chamferedRect(m.x, m.y, m.width, m.height, 14);
    case 'phone_chat':
      return roundedRect(m.x, m.y, m.width, m.height, 16);
    case 'speech':
    case 'whisper':
    case 'telepathy':
    default:
      return ellipseShape(m.cx, m.cy, m.rx, m.ry);
  }
}
