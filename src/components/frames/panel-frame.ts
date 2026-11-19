import type { PanelFrame } from '../../schema/panel.js';
import {
  type DefsCollector,
  type PanelBox,
  el,
  fmt,
  linearGradient,
  polygonPath,
} from '../svg-utils.js';
import { createPrng } from '../../engine/prng.js';

export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderedFrame {
  /** Outer matte drawn over internal layers to mask margins, diagonals, corners and borderless fades cleanly without nested clipPath isolation buffers. */
  matteSvg: string;
  /** Frame outline drawn on top of the matte (below bubbles/SFX). */
  borderSvg: string;
  /** Safe bounding box of the visible panel interior. */
  rect: FrameRect;
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const cr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (cr === 0) return `M${fmt(x)} ${fmt(y)}H${fmt(x + w)}V${fmt(y + h)}H${fmt(x)}Z`;
  return (
    `M${fmt(x + cr)} ${fmt(y)}` +
    `H${fmt(x + w - cr)}A${fmt(cr)} ${fmt(cr)} 0 0 1 ${fmt(x + w)} ${fmt(y + cr)}` +
    `V${fmt(y + h - cr)}A${fmt(cr)} ${fmt(cr)} 0 0 1 ${fmt(x + w - cr)} ${fmt(y + h)}` +
    `H${fmt(x + cr)}A${fmt(cr)} ${fmt(cr)} 0 0 1 ${fmt(x)} ${fmt(y + h - cr)}` +
    `V${fmt(y + cr)}A${fmt(cr)} ${fmt(cr)} 0 0 1 ${fmt(x + cr)} ${fmt(y)}Z`
  );
}

export function buildPanelFrame(
  frame: PanelFrame,
  box: PanelBox,
  opts: {
    defaultMarginX: number;
    defaultBorderColor: string;
    scrollBackground: string;
    seed: number;
    defs: DefsCollector;
  },
): RenderedFrame {
  const { width: w, height: h } = box;
  const borderColor = frame.borderColor ?? opts.defaultBorderColor;
  const bw = frame.borderWidth;
  const halfB = bw / 2;

  let marginX = frame.marginX ?? opts.defaultMarginX;
  if (frame.type === 'full-bleed' || frame.type === 'borderless') marginX = 0;
  else if (frame.type === 'inset') marginX = frame.marginX ?? Math.max(96, opts.defaultMarginX * 3.5);

  const marginY = frame.type === 'inset' ? Math.min(28, h * 0.08) : halfB;
  const x0 = Math.min(marginX, w * 0.35);
  const x1 = w - x0;
  const y0 = marginY;
  const y1 = h - marginY;
  const rw = Math.max(40, x1 - x0);
  const rh = Math.max(40, y1 - y0);

  // Diagonal slant offset (clamped to <= 22% of panel height so content stays generous).
  const skew = frame.skewDeg === 0 ? 6 : frame.skewDeg;
  const slant = Math.max(-rh * 0.22, Math.min(rh * 0.22, Math.tan((skew * Math.PI) / 180) * rw));
  const topLeftY = slant >= 0 ? y0 : y0 - slant;
  const topRightY = slant >= 0 ? y0 + slant : y0;
  const botLeftY = slant >= 0 ? y1 - slant : y1;
  const botRightY = slant >= 0 ? y1 : y1 + slant;

  let shapePath = '';
  let matteSvg = '';
  let extraBorder = '';

  switch (frame.type) {
    case 'full-bleed': {
      shapePath = roundedRectPath(0, 0, w, h, 0);
      break;
    }
    case 'borderless': {
      shapePath = roundedRectPath(0, 0, w, h, 0);
      const topFadeId = opts.defs.add('bltop', (id) =>
        linearGradient(
          id,
          [
            { offset: 0, color: opts.scrollBackground, opacity: 1 },
            { offset: 1, color: opts.scrollBackground, opacity: 0 },
          ],
          90,
        ),
      );
      const botFadeId = opts.defs.add('blbot', (id) =>
        linearGradient(
          id,
          [
            { offset: 0, color: opts.scrollBackground, opacity: 0 },
            { offset: 1, color: opts.scrollBackground, opacity: 1 },
          ],
          90,
        ),
      );
      const band = Math.round(h * 0.16);
      matteSvg =
        el('rect', { x: 0, y: 0, width: w, height: band, fill: `url(#${topFadeId})` }) +
        el('rect', { x: 0, y: h - band, width: w, height: band, fill: `url(#${botFadeId})` });
      break;
    }
    case 'diagonal-top': {
      shapePath = polygonPath([
        { x: x0, y: topLeftY },
        { x: x1, y: topRightY },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ]);
      break;
    }
    case 'diagonal-bottom': {
      shapePath = polygonPath([
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: botRightY },
        { x: x0, y: botLeftY },
      ]);
      break;
    }
    case 'diagonal-both': {
      shapePath = polygonPath([
        { x: x0, y: topLeftY },
        { x: x1, y: topRightY },
        { x: x1, y: botRightY },
        { x: x0, y: botLeftY },
      ]);
      break;
    }
    case 'shattered': {
      const prng = createPrng(`${opts.seed}-shatter`);
      const pts: Array<{ x: number; y: number }> = [];
      const pad = Math.max(12, x0);
      const stepsX = 7;
      const stepsY = Math.max(4, Math.round(rh / 95));
      for (let i = 0; i <= stepsX; i++) {
        const x = pad + ((w - pad * 2) * i) / stepsX;
        pts.push({ x, y: y0 + (i === 0 || i === stepsX ? 6 : prng.range(2, 22)) });
      }
      for (let i = 1; i < stepsY; i++) {
        const y = y0 + (rh * i) / stepsY;
        pts.push({ x: w - pad - prng.range(0, 18), y });
      }
      for (let i = stepsX; i >= 0; i--) {
        const x = pad + ((w - pad * 2) * i) / stepsX;
        pts.push({ x, y: y1 - (i === 0 || i === stepsX ? 6 : prng.range(2, 22)) });
      }
      for (let i = stepsY - 1; i >= 1; i--) {
        const y = y0 + (rh * i) / stepsY;
        pts.push({ x: pad + prng.range(0, 18), y });
      }
      shapePath = polygonPath(pts);

      // Floating glass shards outside the fractured frame.
      for (let i = 0; i < 6; i++) {
        const sx = i % 2 === 0 ? prng.range(4, pad + 20) : prng.range(w - pad - 20, w - 4);
        const sy = prng.range(24, h - 24);
        const sz = prng.range(8, 22);
        extraBorder += el('polygon', {
          points: `${fmt(sx)},${fmt(sy)} ${fmt(sx + sz)},${fmt(sy - sz * 0.4)} ${fmt(sx + sz * 0.3)},${fmt(sy + sz * 0.8)}`,
          fill: borderColor,
          opacity: 0.75,
        });
      }
      break;
    }
    case 'inset': {
      shapePath = roundedRectPath(x0, y0, rw, rh, frame.cornerRadius);
      // Clean exterior drop-shadow strips on right and bottom edges.
      extraBorder =
        el('rect', { x: x1, y: y0 + 10, width: 10, height: rh, fill: '#000000', opacity: 0.45 }) +
        el('rect', { x: x0 + 10, y: y1, width: rw, height: 10, fill: '#000000', opacity: 0.45 });
      break;
    }
    case 'standard':
    default: {
      shapePath = roundedRectPath(x0, y0, rw, rh, frame.cornerRadius);
      break;
    }
  }

  // Even-odd outer matte cleanly masks margins, diagonals, rounded corners & shattered notches.
  if (frame.type !== 'full-bleed' && frame.type !== 'borderless') {
    const outer = `M-4 -4H${fmt(w + 4)}V${fmt(h + 4)}H-4Z`;
    matteSvg = el('path', {
      d: `${outer} ${shapePath}`,
      fill: opts.scrollBackground,
      'fill-rule': 'evenodd',
    });
  }

  let borderSvg = '';
  if (frame.type !== 'borderless' && bw > 0) {
    if (frame.type === 'full-bleed') {
      borderSvg =
        el('line', { x1: 0, y1: halfB, x2: w, y2: halfB, stroke: borderColor, 'stroke-width': bw }) +
        el('line', { x1: 0, y1: h - halfB, x2: w, y2: h - halfB, stroke: borderColor, 'stroke-width': bw });
    } else {
      borderSvg =
        extraBorder +
        el('path', {
          d: shapePath,
          fill: 'none',
          stroke: borderColor,
          'stroke-width': bw,
          'stroke-linejoin': 'miter',
        });
    }
  } else if (extraBorder) {
    borderSvg = extraBorder;
  }

  return {
    matteSvg,
    borderSvg,
    rect: { x: x0, y: y0, width: rw, height: rh },
  };
}
