import type { EmotionBadgeLayer } from '../schema/visual-layer.js';
import { type PanelBox, el, fmt, pctPoint } from '../components/svg-utils.js';

/**
 * Classic manga/manhwa expressive overlay icons drawn in clean vector paths.
 */

export function renderEmotionBadge(layer: EmotionBadgeLayer, box: PanelBox): string {
  const pos = pctPoint(box, layer.position);
  const s = layer.scale;
  let inner = '';

  switch (layer.kind) {
    case 'sweat-drop': {
      const fill = layer.color ?? '#7DD3FC';
      inner =
        el('path', {
          d: 'M0 -28C10 -12 18 2 18 12A18 18 0 0 1 -18 12C-18 2 -10 -12 0 -28Z',
          fill,
          stroke: '#0F172A',
          'stroke-width': 3,
          'stroke-linejoin': 'round',
        }) +
        el('path', {
          d: 'M-6 -2C-9 5 -9 13 -4 18',
          fill: 'none',
          stroke: '#FFFFFF',
          'stroke-width': 3.5,
          'stroke-linecap': 'round',
        });
      break;
    }
    case 'anger-vein': {
      const stroke = layer.color ?? '#EF4444';
      const arcs = [
        'M-20 -6Q-6 -6 -6 -20',
        'M20 -6Q6 -6 6 -20',
        'M-20 6Q-6 6 -6 20',
        'M20 6Q6 6 6 20',
      ];
      inner = arcs
        .map(
          (d) =>
            el('path', { d, fill: 'none', stroke: '#000000', 'stroke-width': 7, 'stroke-linecap': 'round' }) +
            el('path', { d, fill: 'none', stroke, 'stroke-width': 3.6, 'stroke-linecap': 'round' }),
        )
        .join('');
      break;
    }
    case 'shock-lines': {
      const stroke = layer.color ?? '#FDE047';
      const rays = [
        'M-26 -14L-10 -6',
        'M-24 2L-8 2',
        'M-20 18L-6 10',
        'M0 -28L0 -10',
        'M26 -14L10 -6',
        'M24 2L8 2',
      ];
      inner = rays
        .map(
          (d) =>
            el('path', { d, stroke: '#000000', 'stroke-width': 6.5, 'stroke-linecap': 'round' }) +
            el('path', { d, stroke, 'stroke-width': 3.2, 'stroke-linecap': 'round' }),
        )
        .join('');
      break;
    }
    case 'sparkle': {
      const fill = layer.color ?? '#FEF08A';
      inner =
        el('path', {
          d: 'M0 -28Q4 -4 28 0Q4 4 0 28Q-4 4 -28 0Q-4 -4 0 -28Z',
          fill,
          stroke: '#FFFFFF',
          'stroke-width': 1.5,
        }) +
        el('path', {
          d: 'M18 -24Q20 -16 28 -14Q20 -12 18 -4Q16 -12 8 -14Q16 -16 18 -24Z',
          fill: '#FFFFFF',
          opacity: 0.9,
        });
      break;
    }
    case 'dark-gloom': {
      const stroke = layer.color ?? '#475569';
      let lines = '';
      for (let i = -3; i <= 3; i++) {
        const x = i * 9;
        const top = -28 + Math.abs(i) * 4;
        const bot = 28 - Math.abs(i) * 3;
        lines += el('line', {
          x1: x,
          y1: top,
          x2: x,
          y2: bot,
          stroke,
          'stroke-width': 3.2,
          'stroke-linecap': 'round',
          opacity: 0.85,
        });
      }
      inner = lines;
      break;
    }
    case 'question-mark': {
      const fill = layer.color ?? '#F8FAFC';
      inner =
        el('path', {
          d: 'M-12 -14C-12 -26 12 -26 12 -12C12 -2 0 -2 0 8',
          fill: 'none',
          stroke: '#000000',
          'stroke-width': 11,
          'stroke-linecap': 'round',
        }) +
        el('path', {
          d: 'M-12 -14C-12 -26 12 -26 12 -12C12 -2 0 -2 0 8',
          fill: 'none',
          stroke: fill,
          'stroke-width': 5.5,
          'stroke-linecap': 'round',
        }) +
        el('circle', { cx: 0, cy: 20, r: 5, fill, stroke: '#000000', 'stroke-width': 2.8 });
      break;
    }
    case 'exclamation': {
      const fill = layer.color ?? '#EF4444';
      inner =
        el('path', {
          d: 'M-5 -28L5 -28L3 8L-3 8Z',
          fill,
          stroke: '#000000',
          'stroke-width': 3,
          'stroke-linejoin': 'round',
        }) + el('circle', { cx: 0, cy: 20, r: 5, fill, stroke: '#000000', 'stroke-width': 3 });
      break;
    }
  }

  return `<g transform="translate(${fmt(pos.x)} ${fmt(pos.y)}) scale(${fmt(s)})" data-badge="${layer.kind}">${inner}</g>`;
}
