import type { Bubble, BubbleTail, TailStyle } from '../../schema/bubble.js';
import type { BubbleMetrics } from './bubble-geometry.js';
import { type PanelBox, el, fmt, pctPoint } from '../svg-utils.js';

export interface RenderedTail {
  /** Stroke layer drawn underneath the bubble fill (avoids inner seam). */
  strokeSvg: string;
  /** Fill layer drawn on top of the bubble stroke to seamlessly join the interior. */
  fillSvg: string;
  /** Self-contained tail elements (e.g. thought dots) drawn outside the bubble body. */
  standaloneSvg: string;
}

const EMPTY_TAIL: RenderedTail = { strokeSvg: '', fillSvg: '', standaloneSvg: '' };

function resolveTarget(tail: BubbleTail, m: BubbleMetrics, box: PanelBox): { x: number; y: number } | null {
  if (tail.target) return pctPoint(box, tail.target);
  if (tail.offscreenDirection) {
    switch (tail.offscreenDirection) {
      case 'left':
        return { x: Math.max(8, m.x - 56), y: m.cy + m.ry * 0.2 };
      case 'right':
        return { x: Math.min(box.width - 8, m.x + m.width + 56), y: m.cy + m.ry * 0.2 };
      case 'top':
        return { x: m.cx, y: Math.max(8, m.y - 52) };
      case 'bottom':
        return { x: m.cx, y: Math.min(box.height - 8, m.y + m.height + 52) };
    }
  }
  return null;
}

/** Point on an ellipse border in the given direction, inset slightly so fill joins cleanly. */
function perimeterPoint(m: BubbleMetrics, angle: number, inset = 0.88): { x: number; y: number } {
  return {
    x: m.cx + Math.cos(angle) * m.rx * inset,
    y: m.cy + Math.sin(angle) * m.ry * inset,
  };
}

export function buildBubbleTail(
  bubble: Bubble,
  m: BubbleMetrics,
  box: PanelBox,
  paint: { fill: string; stroke: string; strokeWidth: number; dashArray?: string },
): RenderedTail {
  if (bubble.type === 'narration' || bubble.type === 'system_window') return EMPTY_TAIL;
  const tail = bubble.tail;
  if (!tail || !tail.enabled || tail.style === 'none') return EMPTY_TAIL;

  const target = resolveTarget(tail, m, box);
  if (!target) return EMPTY_TAIL;

  const dx = target.x - m.cx;
  const dy = target.y - m.cy;
  const dist = Math.hypot(dx, dy);
  if (dist < 10) return EMPTY_TAIL;

  // Determine effective style (thought defaults to dots if user kept default curved).
  const style: TailStyle = bubble.type === 'thought' && tail.style === 'curved' ? 'dots' : tail.style;
  const angle = Math.atan2(dy, dx);

  // Clamp tail tip so it reaches toward target without crossing the entire panel awkwardly.
  const edgeR = Math.hypot(Math.cos(angle) * m.rx, Math.sin(angle) * m.ry);
  const maxReach = edgeR + 135;
  const minReach = edgeR + 24;
  const reach = Math.max(minReach, Math.min(maxReach, dist));
  const tip = {
    x: m.cx + Math.cos(angle) * reach,
    y: m.cy + Math.sin(angle) * reach,
  };

  if (style === 'dots') {
    const start = perimeterPoint(m, angle, 1.04);
    const radii = [9, 6, 3.5];
    const fracs = [0.22, 0.56, 0.88];
    let dots = '';
    for (let i = 0; i < radii.length; i++) {
      const t = fracs[i]!;
      const cx = start.x + (tip.x - start.x) * t;
      const cy = start.y + (tip.y - start.y) * t;
      dots += el('circle', {
        cx,
        cy,
        r: radii[i]!,
        fill: paint.fill,
        stroke: paint.stroke,
        'stroke-width': Math.max(1.5, paint.strokeWidth * 0.85),
      });
    }
    return { strokeSvg: '', fillSvg: '', standaloneSvg: dots };
  }

  // Compute angular half-spread on the bubble edge from tail.width.
  const spread = Math.min(0.32, Math.max(0.1, tail.width / Math.max(55, edgeR * 1.4)));
  const p1 = perimeterPoint(m, angle - spread, 0.78);
  const p2 = perimeterPoint(m, angle + spread, 0.78);

  let tailPath = '';
  if (style === 'sharp') {
    tailPath = `M${fmt(p1.x)} ${fmt(p1.y)}L${fmt(tip.x)} ${fmt(tip.y)}L${fmt(p2.x)} ${fmt(p2.y)}Z`;
  } else if (style === 'jagged') {
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    const mid1 = { x: p1.x + (tip.x - p1.x) * 0.45 + nx * 10, y: p1.y + (tip.y - p1.y) * 0.45 + ny * 10 };
    const mid2 = { x: p1.x + (tip.x - p1.x) * 0.55 - nx * 8, y: p1.y + (tip.y - p1.y) * 0.55 - ny * 8 };
    const ret1 = { x: p2.x + (tip.x - p2.x) * 0.62 - nx * 9, y: p2.y + (tip.y - p2.y) * 0.62 - ny * 9 };
    const ret2 = { x: p2.x + (tip.x - p2.x) * 0.38 + nx * 7, y: p2.y + (tip.y - p2.y) * 0.38 + ny * 7 };
    tailPath =
      `M${fmt(p1.x)} ${fmt(p1.y)}L${fmt(mid1.x)} ${fmt(mid1.y)}L${fmt(mid2.x)} ${fmt(mid2.y)}` +
      `L${fmt(tip.x)} ${fmt(tip.y)}L${fmt(ret1.x)} ${fmt(ret1.y)}L${fmt(ret2.x)} ${fmt(ret2.y)}` +
      `L${fmt(p2.x)} ${fmt(p2.y)}Z`;
  } else {
    // Graceful curved tail (classic webtoon lettering).
    const bendSign = dx >= 0 ? 1 : -1;
    const nx = -Math.sin(angle) * bendSign;
    const ny = Math.cos(angle) * bendSign;
    const bend = Math.min(22, (reach - edgeR) * 0.28);
    const c1 = { x: (p1.x + tip.x) / 2 + nx * bend, y: (p1.y + tip.y) / 2 + ny * bend };
    const c2 = { x: (p2.x + tip.x) / 2 + nx * (bend * 0.45), y: (p2.y + tip.y) / 2 + ny * (bend * 0.45) };
    tailPath = `M${fmt(p1.x)} ${fmt(p1.y)}Q${fmt(c1.x)} ${fmt(c1.y)} ${fmt(tip.x)} ${fmt(tip.y)}Q${fmt(c2.x)} ${fmt(c2.y)} ${fmt(p2.x)} ${fmt(p2.y)}Z`;
  }

  const strokeSvg = el('path', {
    d: tailPath,
    fill: paint.fill,
    stroke: paint.stroke,
    'stroke-width': paint.strokeWidth * 2,
    'stroke-linejoin': 'round',
    'stroke-dasharray': paint.dashArray,
  });
  const fillSvg = el('path', { d: tailPath, fill: paint.fill, stroke: 'none' });
  return { strokeSvg, fillSvg, standaloneSvg: '' };
}
