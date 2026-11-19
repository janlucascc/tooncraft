import type { EffectLayer } from '../../schema/visual-layer.js';
import { type PanelBox, el, fmt, pctPoint } from '../svg-utils.js';
import { createPrng } from '../../engine/prng.js';

/**
 * Procedural manga/manhwa speedlines — both radial focus bursts and vertical
 * high-speed motion streaks — generated deterministically from the panel seed.
 */

export function renderSpeedlines(layer: EffectLayer, box: PanelBox, seed: number): string {
  const prng = createPrng(`${seed}-${layer.kind}`);
  const { width: w, height: h } = box;

  if (layer.kind === 'speedlines-radial') {
    const focal = pctPoint(box, layer.focalPoint);
    const maxR = Math.hypot(Math.max(focal.x, w - focal.x), Math.max(focal.y, h - focal.y)) + 40;
    const clearBase = Math.min(w, h) * (0.36 - layer.intensity * 0.14);
    const count = Math.round(48 + layer.intensity * 110);
    let paths = '';

    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + prng.range(-0.025, 0.025);
      const innerR = clearBase * prng.range(0.75, 1.38);
      const spread = prng.range(0.004, 0.015 + layer.intensity * 0.01);
      const xTip = focal.x + Math.cos(ang) * innerR;
      const yTip = focal.y + Math.sin(ang) * innerR;
      const x1 = focal.x + Math.cos(ang - spread) * maxR;
      const y1 = focal.y + Math.sin(ang - spread) * maxR;
      const x2 = focal.x + Math.cos(ang + spread) * maxR;
      const y2 = focal.y + Math.sin(ang + spread) * maxR;
      paths += `M${fmt(xTip)} ${fmt(yTip)}L${fmt(x1)} ${fmt(y1)}L${fmt(x2)} ${fmt(y2)}Z`;
    }

    return el('path', {
      d: paths,
      fill: layer.color,
      opacity: 0.45 + layer.intensity * 0.45,
      'data-effect': 'speedlines-radial',
    });
  }

  // speedlines-vertical
  const count = Math.round(32 + layer.intensity * 85);
  let out = '';
  for (let i = 0; i < count; i++) {
    // Cluster denser near the left/right edges so the center subject stays legible.
    const raw = prng.next();
    const biased = raw < 0.5 ? Math.pow(raw * 2, 1.5) * 0.5 : 1 - Math.pow((1 - raw) * 2, 1.5) * 0.5;
    const x = biased * w;
    const y0 = prng.range(-h * 0.15, h * 0.65);
    const len = prng.range(h * 0.22, h * 0.85);
    const sw = prng.range(0.8, 3.6 * layer.intensity + 1);
    const op = prng.range(0.22, 0.78) * (0.4 + layer.intensity * 0.6);
    out += el('line', {
      x1: x,
      y1: y0,
      x2: x,
      y2: y0 + len,
      stroke: layer.color,
      'stroke-width': sw,
      opacity: op,
    });
  }
  return `<g data-effect="speedlines-vertical">${out}</g>`;
}
