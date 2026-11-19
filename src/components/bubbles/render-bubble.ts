import type { Bubble } from '../../schema/bubble.js';
import type { Character } from '../../schema/character.js';
import type { ResolvedTheme } from '../../templates/themes.js';
import {
  FONT_FACES,
  baselineOffset,
  type TextRun,
} from '../font-metrics.js';
import {
  type DefsCollector,
  type PanelBox,
  el,
  escapeXml,
  fmt,
  glowFilter,
} from '../svg-utils.js';
import { type BubbleMetrics, buildBubbleBodyPath, measureBubble } from './bubble-geometry.js';
import { buildBubbleTail } from './tail-router.js';

export interface BubbleRenderContext {
  box: PanelBox;
  defs: DefsCollector;
  theme: ResolvedTheme;
  character?: Character;
  /** Pre-computed metrics (e.g. after collision nudging from pacing-layout). */
  metrics?: BubbleMetrics;
}

interface ResolvedBubblePaint {
  fill: string;
  stroke: string;
  strokeWidth: number;
  text: string;
  opacity: number;
  glow?: string;
  dashArray?: string;
}

function resolvePaint(bubble: Bubble, theme: ResolvedTheme, character?: Character): ResolvedBubblePaint {
  const ct = character?.bubbleTheme;
  const st = bubble.style;

  let fill = theme.bubble.fill;
  let stroke = theme.bubble.stroke;
  let text = theme.bubble.text;
  let strokeWidth = 2.8;
  let glow: string | undefined;
  let dashArray: string | undefined;

  switch (bubble.type) {
    case 'narration':
      fill = theme.narration.fill;
      stroke = theme.narration.stroke;
      text = theme.narration.text;
      strokeWidth = 2.2;
      break;
    case 'system_window':
      fill = theme.system.fill;
      stroke = theme.system.stroke;
      text = theme.system.text;
      strokeWidth = 2.4;
      glow = theme.system.accent;
      break;
    case 'phone_chat':
      fill = theme.phone.fill;
      stroke = theme.phone.stroke;
      text = theme.phone.text;
      strokeWidth = 2;
      break;
    case 'whisper':
      strokeWidth = 2.2;
      dashArray = '6,5';
      break;
    case 'shout':
      strokeWidth = 3.5;
      break;
    case 'telepathy':
      strokeWidth = 2.2;
      glow = ct?.glowColor ?? theme.accent2;
      break;
    default:
      break;
  }

  // Character theme overrides (for dialogue types, not system windows unless explicitly set).
  if (ct && bubble.type !== 'system_window') {
    if (ct.fillColor) fill = ct.fillColor;
    if (ct.strokeColor) stroke = ct.strokeColor;
    if (ct.textColor) text = ct.textColor;
    if (ct.glowColor) glow = ct.glowColor;
  }

  return {
    fill: st?.fillColor ?? fill,
    stroke: st?.strokeColor ?? stroke,
    strokeWidth: st?.strokeWidth ?? strokeWidth,
    text: st?.textColor ?? text,
    opacity: st?.opacity ?? (bubble.type === 'whisper' ? 0.92 : 1),
    glow,
    dashArray,
  };
}

function renderTextRuns(runs: TextRun[], m: BubbleMetrics): string {
  return runs
    .map((run) => {
      const face = FONT_FACES[m.fonts[run.style]];
      return el(
        'tspan',
        {
          'font-family': face.family,
          'font-weight': run.style === 'bold' ? 700 : face.weight,
          'font-style': run.style === 'italic' ? 'italic' : face.style,
        },
        escapeXml(run.text),
      );
    })
    .join('');
}

export function renderBubble(bubble: Bubble, ctx: BubbleRenderContext): string {
  const { box, defs, theme, character } = ctx;
  const m = ctx.metrics ?? measureBubble(bubble, box, theme.fontPreset);
  const paint = resolvePaint(bubble, theme, character);
  const bodyPath = buildBubbleBodyPath(bubble.type, m, bubble.id);

  let filterAttr: string | undefined;
  if (paint.glow) {
    const gid = defs.once(`bubglow-${paint.glow}`, 'bubglow', (id) => glowFilter(id, 4, paint.glow, 0.95));
    filterAttr = `url(#${gid})`;
  }

  // Tail (seamless double-pass so no stroke cuts across the bubble interior).
  const tail = buildBubbleTail(bubble, m, box, paint);

  // Outer shape passes.
  let chrome = '';
  if (bubble.type === 'narration') {
    // Crisp offset shadow under narration boxes.
    chrome += el('path', { d: bodyPath, fill: '#000000', opacity: 0.35, transform: 'translate(4 4)' });
  }

  chrome += tail.standaloneSvg;
  chrome += tail.strokeSvg;
  chrome += el('path', {
    d: bodyPath,
    fill: paint.fill,
    stroke: paint.stroke,
    'stroke-width': paint.strokeWidth,
    'stroke-linejoin': 'round',
    'stroke-dasharray': paint.dashArray,
    filter: filterAttr,
  });
  chrome += tail.fillSvg;

  // Extra decorative chrome for special bubble types.
  if (bubble.type === 'telepathy') {
    chrome += el('ellipse', {
      cx: m.cx,
      cy: m.cy,
      rx: Math.max(10, m.rx - 5),
      ry: Math.max(10, m.ry - 5),
      fill: 'none',
      stroke: paint.glow ?? paint.stroke,
      'stroke-width': 1.2,
      opacity: 0.6,
    });
  } else if (bubble.type === 'system_window') {
    // Inner holographic border & corner tech brackets.
    const pad = 6;
    chrome += el('rect', {
      x: m.x + pad,
      y: m.y + pad,
      width: Math.max(10, m.width - pad * 2),
      height: Math.max(10, m.height - pad * 2),
      fill: 'none',
      stroke: theme.system.accent,
      'stroke-width': 1,
      opacity: 0.55,
    });
    if (bubble.style?.headerTitle) {
      const hy = m.y + m.headerHeight;
      const hFace = FONT_FACES.chakra;
      chrome += el('line', {
        x1: m.x + 14,
        y1: hy,
        x2: m.x + m.width - 14,
        y2: hy,
        stroke: theme.system.accent,
        'stroke-width': 1.4,
        opacity: 0.8,
      });
      chrome += el(
        'text',
        {
          x: m.cx,
          y: m.y + m.headerHeight / 2 + baselineOffset('chakra', Math.max(12, m.effectiveFontSize * 0.78)),
          'text-anchor': 'middle',
          fill: theme.system.header,
          'font-family': hFace.family,
          'font-weight': hFace.weight,
          'font-size': Math.max(12, Math.round(m.effectiveFontSize * 0.78)),
          'letter-spacing': 1.4,
        },
        escapeXml(bubble.style.headerTitle),
      );
    }
  }

  // Text block positioning.
  const contentTop = m.y + m.headerHeight;
  const contentHeight = m.height - m.headerHeight;
  const blockTop = contentTop + (contentHeight - m.wrap.height) / 2;
  const baseShift = baselineOffset(m.fonts.regular, m.effectiveFontSize);
  const anchor = bubble.align === 'left' ? 'start' : bubble.align === 'right' ? 'end' : 'middle';
  const textX =
    bubble.align === 'left'
      ? m.x + 22
      : bubble.align === 'right'
        ? m.x + m.width - 22
        : m.cx;
  const letterSpacing = bubble.type === 'shout' ? 0.8 : bubble.type === 'system_window' ? 0.4 : undefined;

  const textLines = m.wrap.lines
    .map((line, idx) => {
      const lineCenterY = blockTop + (idx + 0.5) * m.wrap.lineHeight;
      return el(
        'text',
        {
          x: textX,
          y: lineCenterY + baseShift,
          'text-anchor': anchor,
          fill: paint.text,
          'font-size': m.effectiveFontSize,
          'letter-spacing': letterSpacing,
        },
        renderTextRuns(line.runs, m),
      );
    })
    .join('');

  return `<g data-bubble="${escapeXml(bubble.id)}" data-bubble-type="${bubble.type}" opacity="${fmt(paint.opacity)}">${chrome}${textLines}</g>`;
}
