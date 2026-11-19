import type { Sfx } from '../../schema/sfx.js';
import { FONT_FACES, type FontKey, baselineOffset, measureTextLine } from '../font-metrics.js';
import {
  type DefsCollector,
  type PanelBox,
  el,
  escapeXml,
  fmt,
  glowFilter,
  lighten,
  pctPoint,
} from '../svg-utils.js';
import { createPrng } from '../../engine/prng.js';

export interface SfxRenderContext {
  box: PanelBox;
  defs: DefsCollector;
  seed: number;
}

function fontForSfx(style: Sfx['style']): FontKey {
  switch (style) {
    case 'glow':
      return 'chakra';
    case 'ambient':
      return 'comic-italic';
    default:
      return 'bangers';
  }
}

export function renderSfx(sfx: Sfx, ctx: SfxRenderContext): string {
  const { box, defs, seed } = ctx;
  const pos = pctPoint(box, sfx.position);
  const fontKey = fontForSfx(sfx.style);
  const face = FONT_FACES[fontKey];
  const baseShift = baselineOffset(fontKey, sfx.fontSize);
  const shadowColor = sfx.shadowColor ?? sfx.strokeColor;
  const letterSpacing = sfx.style === 'impact' ? 2.5 : sfx.style === 'slash' ? 3 : 1.5;

  let filterAttr: string | undefined;
  if (sfx.style === 'glow') {
    const gid = defs.once(`sfxglow-${sfx.primaryColor}`, 'sfxglow', (id) =>
      glowFilter(id, 5, sfx.primaryColor, 1),
    );
    filterAttr = `url(#${gid})`;
  }

  let inner = '';

  // Curved path mode when `curveArc !== 0`.
  if (sfx.curveArc !== 0) {
    const totalW = Math.max(120, measureTextLine(sfx.text, fontKey, sfx.fontSize, letterSpacing) * 1.2);
    const half = totalW / 2;
    const arcY = -sfx.curveArc * 2.2;
    const pathId = defs.add('sfxarc', (id) =>
      el('path', { id, d: `M${fmt(-half)} 0Q0 ${fmt(arcY)} ${fmt(half)} 0`, fill: 'none' }),
    );
    const textPath = `<textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${escapeXml(sfx.text)}</textPath>`;
    const common = {
      'font-family': face.family,
      'font-weight': face.weight,
      'font-style': face.style,
      'font-size': sfx.fontSize,
      'letter-spacing': letterSpacing,
    };
    if (sfx.style === 'impact' || sfx.style === 'slash') {
      inner += el('text', { ...common, fill: shadowColor, transform: 'translate(5 6)', opacity: 0.9 }, textPath);
    }
    inner += el(
      'text',
      {
        ...common,
        fill: sfx.primaryColor,
        stroke: sfx.strokeColor,
        'stroke-width': sfx.strokeWidth * 2,
        'stroke-linejoin': 'round',
        'paint-order': 'stroke fill',
        filter: filterAttr,
      },
      textPath,
    );
  } else if (sfx.style === 'tremble') {
    // Per-character deterministic jitter for rumbling/shaking sounds.
    const prng = createPrng(`${seed}-sfx-${sfx.id}`);
    const chars = [...sfx.text];
    const widths = chars.map((ch) => measureTextLine(ch, fontKey, sfx.fontSize, 0) + letterSpacing);
    const totalW = widths.reduce((a, b) => a + b, 0);
    let cursor = -totalW / 2;

    chars.forEach((ch, idx) => {
      const cw = widths[idx]!;
      const cx = cursor + cw / 2;
      const jx = prng.range(-3.2, 3.2);
      const jy = prng.range(-5.5, 5.5);
      const jr = prng.range(-8, 8);
      const common = {
        x: 0,
        y: baseShift,
        'text-anchor': 'middle',
        'font-family': face.family,
        'font-weight': face.weight,
        'font-size': sfx.fontSize,
      };
      inner +=
        `<g transform="translate(${fmt(cx + jx)} ${fmt(jy)}) rotate(${fmt(jr)})">` +
        el('text', { ...common, fill: shadowColor, dx: 4, dy: 4 }, escapeXml(ch)) +
        el(
          'text',
          {
            ...common,
            fill: sfx.primaryColor,
            stroke: sfx.strokeColor,
            'stroke-width': sfx.strokeWidth * 2,
            'stroke-linejoin': 'round',
            'paint-order': 'stroke fill',
          },
          escapeXml(ch),
        ) +
        `</g>`;
      cursor += cw;
    });
  } else {
    const common = {
      x: 0,
      y: baseShift,
      'text-anchor': 'middle',
      'font-family': face.family,
      'font-weight': face.weight,
      'font-style': face.style,
      'font-size': sfx.fontSize,
      'letter-spacing': letterSpacing,
    };

    // Decorative cutting streak behind `slash` SFX.
    if (sfx.style === 'slash') {
      const tw = measureTextLine(sfx.text, fontKey, sfx.fontSize, letterSpacing);
      inner += el('polygon', {
        points: `${fmt(-tw * 0.72)},${fmt(sfx.fontSize * 0.14)} ${fmt(tw * 0.75)},${fmt(-sfx.fontSize * 0.24)} ${fmt(tw * 0.7)},${fmt(-sfx.fontSize * 0.08)} ${fmt(-tw * 0.76)},${fmt(sfx.fontSize * 0.26)}`,
        fill: lighten(sfx.primaryColor, 0.5),
        opacity: 0.82,
      });
    }

    if (sfx.style === 'impact' || sfx.style === 'slash') {
      inner += el(
        'text',
        {
          ...common,
          dx: 5,
          dy: 6,
          fill: shadowColor,
          stroke: shadowColor,
          'stroke-width': sfx.strokeWidth * 1.8,
          'stroke-linejoin': 'round',
          'paint-order': 'stroke fill',
        },
        escapeXml(sfx.text),
      );
    }

    inner += el(
      'text',
      {
        ...common,
        fill: sfx.primaryColor,
        stroke: sfx.strokeColor,
        'stroke-width': sfx.style === 'ambient' ? Math.max(1.5, sfx.strokeWidth) : sfx.strokeWidth * 2,
        'stroke-linejoin': 'round',
        'paint-order': 'stroke fill',
        opacity: sfx.style === 'ambient' ? 0.78 : 1,
        filter: filterAttr,
      },
      escapeXml(sfx.text),
    );
  }

  const skew = sfx.style === 'slash' ? ' skewX(-16)' : '';
  return `<g transform="translate(${fmt(pos.x)} ${fmt(pos.y)}) rotate(${fmt(sfx.rotation)})${skew}" data-sfx="${escapeXml(sfx.id)}" data-sfx-style="${sfx.style}">${inner}</g>`;
}
