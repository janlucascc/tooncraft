import type { EffectLayer } from '../../schema/visual-layer.js';
import { type DefsCollector, type PanelBox, el, pctPoint, radialGradient } from '../svg-utils.js';

/**
 * Classic 45-degree halftone / screentone dot pattern masked radially around
 * the panel focal point.
 */
export function renderHalftone(layer: EffectLayer, box: PanelBox, defs: DefsCollector): string {
  const { width: w, height: h } = box;
  const focal = pctPoint(box, layer.focalPoint);
  const spacing = 10;
  const dotR = 1.6 + layer.intensity * 1.8;

  const patId = defs.add('halftone', (id) =>
    el(
      'pattern',
      {
        id,
        width: spacing,
        height: spacing,
        patternUnits: 'userSpaceOnUse',
        patternTransform: 'rotate(45)',
      },
      el('circle', { cx: spacing / 2, cy: spacing / 2, r: dotR, fill: layer.color }),
    ),
  );

  const gradId = defs.add('htgrad', (id) =>
    radialGradient(
      id,
      [
        { offset: 0, color: '#000000' },
        { offset: 0.45, color: '#000000' },
        { offset: 0.78, color: '#999999' },
        { offset: 1, color: '#FFFFFF' },
      ],
      { cx: focal.x / w, cy: focal.y / h, r: 0.72 },
    ),
  );

  const maskId = defs.add('htmask', (id) =>
    el('mask', { id }, el('rect', { x: 0, y: 0, width: w, height: h, fill: `url(#${gradId})` })),
  );

  return el('rect', {
    x: 0,
    y: 0,
    width: w,
    height: h,
    fill: `url(#${patId})`,
    mask: `url(#${maskId})`,
    opacity: 0.3 + layer.intensity * 0.55,
    'data-effect': 'halftone-vignette',
  });
}
