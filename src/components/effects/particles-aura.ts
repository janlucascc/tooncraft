import type { EffectLayer } from '../../schema/visual-layer.js';
import {
  type DefsCollector,
  type PanelBox,
  el,
  fmt,
  glowFilter,
  lighten,
  pctPoint,
  radialGradient,
} from '../svg-utils.js';
import { createPrng } from '../../engine/prng.js';

/**
 * Weather, aura, glitch, fracture and impact overlays — all deterministic via
 * panel seed.
 */
export function renderParticleOrAuraEffect(
  layer: EffectLayer,
  box: PanelBox,
  defs: DefsCollector,
  seed: number,
): string {
  const { width: w, height: h } = box;
  const prng = createPrng(`${seed}-${layer.kind}`);

  switch (layer.kind) {
    case 'rain': {
      const count = Math.round(55 + layer.intensity * 130);
      const dx = -14;
      let out = '';
      for (let i = 0; i < count; i++) {
        const x = prng.range(-20, w + 40);
        const y = prng.range(-40, h);
        const len = prng.range(36, 115);
        out += el('line', {
          x1: x,
          y1: y,
          x2: x + dx * (len / 80),
          y2: y + len,
          stroke: layer.color,
          'stroke-width': prng.range(0.7, 1.8),
          opacity: prng.range(0.18, 0.62) * (0.45 + layer.intensity * 0.55),
        });
      }
      return `<g data-effect="rain">${out}</g>`;
    }

    case 'embers': {
      const glowId = defs.once(`ember-${layer.color}`, 'emberglow', (id) => glowFilter(id, 3, layer.color, 1));
      const count = Math.round(24 + layer.intensity * 60);
      let out = '';
      for (let i = 0; i < count; i++) {
        const cx = prng.range(0, w);
        const cy = prng.range(0, h);
        const rx = prng.range(1.5, 4.5);
        const ry = rx * prng.range(1.4, 3.2);
        const rot = prng.range(-35, 35);
        out += el('ellipse', {
          cx,
          cy,
          rx,
          ry,
          fill: i % 3 === 0 ? lighten(layer.color, 0.45) : layer.color,
          opacity: prng.range(0.4, 0.95),
          transform: `rotate(${fmt(rot)} ${fmt(cx)} ${fmt(cy)})`,
        });
      }
      return `<g filter="url(#${glowId})" data-effect="embers">${out}</g>`;
    }

    case 'mana-particles': {
      const glowId = defs.once(`mana-${layer.color}`, 'managlow', (id) => glowFilter(id, 3.5, layer.color, 1));
      const count = Math.round(18 + layer.intensity * 48);
      let out = '';
      for (let i = 0; i < count; i++) {
        const cx = prng.range(20, w - 20);
        const cy = prng.range(20, h - 20);
        const r = prng.range(3, 11);
        const op = prng.range(0.25, 0.85);
        if (i % 3 === 0) {
          // Diamond / hex mote.
          out += el('polygon', {
            points: `${fmt(cx)},${fmt(cy - r)} ${fmt(cx + r * 0.7)},${fmt(cy)} ${fmt(cx)},${fmt(cy + r)} ${fmt(cx - r * 0.7)},${fmt(cy)}`,
            fill: lighten(layer.color, 0.35),
            opacity: op,
          });
        } else {
          out += el('circle', { cx, cy, r: r * 0.55, fill: layer.color, opacity: op });
          // Rising light trail.
          out += el('line', {
            x1: cx,
            y1: cy,
            x2: cx,
            y2: cy + r * prng.range(3, 7),
            stroke: layer.color,
            'stroke-width': 1.2,
            opacity: op * 0.45,
          });
        }
      }
      return `<g filter="url(#${glowId})" data-effect="mana-particles">${out}</g>`;
    }

    case 'screen-crack': {
      const focal = pctPoint(box, layer.focalPoint);
      const branches = Math.round(7 + layer.intensity * 10);
      let mainD = '';
      let subD = '';
      for (let i = 0; i < branches; i++) {
        let ang = (i / branches) * Math.PI * 2 + prng.range(-0.22, 0.22);
        let x = focal.x;
        let y = focal.y;
        mainD += `M${fmt(x)} ${fmt(y)}`;
        const segs = prng.int(4, 7);
        for (let s = 0; s < segs; s++) {
          const len = prng.range(35, 115);
          ang += prng.range(-0.32, 0.32);
          x += Math.cos(ang) * len;
          y += Math.sin(ang) * len;
          mainD += `L${fmt(x)} ${fmt(y)}`;
          if (s >= 1 && prng.chance(0.55)) {
            const bAng = ang + (prng.chance(0.5) ? 1 : -1) * prng.range(0.35, 0.9);
            const bLen = prng.range(24, 72);
            subD += `M${fmt(x)} ${fmt(y)}L${fmt(x + Math.cos(bAng) * bLen)} ${fmt(y + Math.sin(bAng) * bLen)}`;
          }
        }
      }
      return (
        `<g data-effect="screen-crack">` +
        el('path', { d: mainD, fill: 'none', stroke: '#000000', 'stroke-width': 4.2, opacity: 0.75 }) +
        el('path', { d: mainD, fill: 'none', stroke: layer.color, 'stroke-width': 2.1, opacity: 0.95 }) +
        el('path', { d: subD, fill: 'none', stroke: layer.color, 'stroke-width': 1.2, opacity: 0.78 }) +
        `</g>`
      );
    }

    case 'chromatic-glitch': {
      const count = Math.round(10 + layer.intensity * 26);
      let out = '';
      for (let i = 0; i < count; i++) {
        const y = prng.range(0, h);
        const bh = prng.range(2, 12);
        const bw = prng.range(w * 0.12, w * 0.85);
        const x = prng.range(0, w - bw);
        const shift = prng.range(3, 12);
        out += el('rect', { x: x - shift, y, width: bw, height: bh, fill: '#00FFFF', opacity: 0.25 + layer.intensity * 0.25 });
        out += el('rect', { x: x + shift, y: y + 1, width: bw, height: bh, fill: '#FF0055', opacity: 0.25 + layer.intensity * 0.25 });
      }
      // Subtle scanlines.
      let scan = '';
      for (let y = 0; y < h; y += 6) scan += `M0 ${y}H${w}`;
      out += el('path', { d: scan, stroke: '#000000', 'stroke-width': 1, opacity: 0.16 });
      return `<g data-effect="chromatic-glitch">${out}</g>`;
    }

    case 'impact-flash': {
      const focal = pctPoint(box, layer.focalPoint);
      const r = Math.max(w, h) * (0.45 + layer.intensity * 0.35);
      const gradId = defs.add('flash', (id) =>
        radialGradient(
          id,
          [
            { offset: 0, color: '#FFFFFF', opacity: 0.95 },
            { offset: 0.28, color: layer.color, opacity: 0.65 * layer.intensity + 0.15 },
            { offset: 1, color: layer.color, opacity: 0 },
          ],
          { cx: focal.x / w, cy: focal.y / h, r: r / Math.max(w, h) },
        ),
      );
      // Starburst spikes from impact point.
      const spikes = 14;
      let star = '';
      for (let i = 0; i < spikes * 2; i++) {
        const ang = (i / (spikes * 2)) * Math.PI * 2;
        const dist = i % 2 === 0 ? prng.range(r * 0.35, r * 0.85) : prng.range(18, 42);
        star += `${i === 0 ? 'M' : 'L'}${fmt(focal.x + Math.cos(ang) * dist)} ${fmt(focal.y + Math.sin(ang) * dist)}`;
      }
      star += 'Z';
      return (
        `<g data-effect="impact-flash">` +
        el('rect', { x: 0, y: 0, width: w, height: h, fill: `url(#${gradId})` }) +
        el('path', { d: star, fill: '#FFFFFF', opacity: 0.45 + layer.intensity * 0.4 }) +
        `</g>`
      );
    }

    case 'vignette':
    default: {
      const gradId = defs.add('vig', (id) =>
        radialGradient(id, [
          { offset: 0, color: layer.color, opacity: 0 },
          { offset: 0.55, color: layer.color, opacity: 0 },
          { offset: 1, color: layer.color, opacity: Math.min(0.95, 0.3 + layer.intensity * 0.6) },
        ]),
      );
      return el('rect', { x: 0, y: 0, width: w, height: h, fill: `url(#${gradId})`, 'data-effect': 'vignette' });
    }
  }
}
