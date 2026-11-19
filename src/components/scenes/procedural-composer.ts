import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import type { Character } from '../../schema/character.js';
import type { BackdropLayer, VisualLayer } from '../../schema/visual-layer.js';
import type { ResolvedTheme } from '../../templates/themes.js';
import { renderEnvironment } from '../../templates/environments.js';
import { renderCharacterFigure } from '../../templates/silhouettes.js';
import { renderEmotionBadge } from '../../templates/emotion-badges.js';
import { renderSpeedlines } from '../effects/speedlines.js';
import { renderHalftone } from '../effects/halftone.js';
import { renderParticleOrAuraEffect } from '../effects/particles-aura.js';
import { sanitizeSvgMarkup } from './svg-sanitizer.js';
import {
  type DefsCollector,
  type PanelBox,
  el,
  fmt,
  linearGradient,
  radialGradient,
} from '../svg-utils.js';
import { createPrng } from '../../engine/prng.js';

export interface SceneComposerContext {
  panelId: string;
  box: PanelBox;
  defs: DefsCollector;
  theme: ResolvedTheme;
  cast: Map<string, Character>;
  seed: number;
  /** Optional base directory for resolving local `image_ref` layers when enabled. */
  baseDir?: string;
  /** Must be explicitly enabled to render `image_ref` layers. */
  allowImages?: boolean;
  /** Accumulates non-fatal sanitizer warnings. */
  warnings: string[];
}

function renderBackdrop(layer: BackdropLayer, box: PanelBox, defs: DefsCollector, seed: number): string {
  const { width: w, height: h } = box;
  const colors = layer.colors;
  const first = colors[0] ?? '#0B0D13';
  const last = colors[colors.length - 1] ?? first;
  let fill = first;

  if (layer.kind === 'linear-gradient' || layer.kind === 'night-sky' || layer.kind === 'horizon-glow') {
    const stops =
      colors.length === 1
        ? [
            { offset: 0, color: first },
            { offset: 1, color: first },
          ]
        : colors.map((c, idx) => ({ offset: idx / (colors.length - 1), color: c }));
    // Schema angleDeg: 180 = top→bottom (matches CSS linear-gradient convention).
    const svgAngle = layer.kind === 'linear-gradient' ? layer.angleDeg - 90 : 90;
    const gid = defs.add('bg', (id) => linearGradient(id, stops, svgAngle));
    fill = `url(#${gid})`;
  } else if (layer.kind === 'radial-gradient') {
    const stops =
      colors.length === 1
        ? [
            { offset: 0, color: first },
            { offset: 1, color: first },
          ]
        : colors.map((c, idx) => ({ offset: idx / (colors.length - 1), color: c }));
    const gid = defs.add('bgrad', (id) => radialGradient(id, stops, { cx: 0.5, cy: 0.5, r: 0.7 }));
    fill = `url(#${gid})`;
  }

  let out = el('rect', { x: 0, y: 0, width: w, height: h, fill });

  if (layer.kind === 'horizon-glow') {
    const glowId = defs.add('hglow', (id) =>
      radialGradient(
        id,
        [
          { offset: 0, color: last, opacity: 0.72 },
          { offset: 0.55, color: last, opacity: 0.2 },
          { offset: 1, color: last, opacity: 0 },
        ],
        { cx: 0.5, cy: 0.78, r: 0.65 },
      ),
    );
    out += el('rect', { x: 0, y: 0, width: w, height: h, fill: `url(#${glowId})` });
  }

  const starDensity = layer.kind === 'night-sky' ? Math.max(0.35, layer.starsDensity) : layer.starsDensity;
  if (starDensity > 0) {
    const prng = createPrng(`${seed}-stars`);
    const count = Math.round(starDensity * 120);
    let stars = '';
    for (let i = 0; i < count; i++) {
      stars += el('circle', {
        cx: prng.range(4, w - 4),
        cy: prng.range(4, h * 0.8),
        r: prng.range(0.7, 2.2),
        fill: '#FFFFFF',
        opacity: prng.range(0.25, 0.95),
      });
    }
    out += `<g data-stars="1">${stars}</g>`;
  }

  return out;
}

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function renderImageRef(
  src: string,
  fit: 'cover' | 'contain',
  opacity: number,
  ctx: SceneComposerContext,
): string {
  if (!ctx.allowImages) {
    ctx.warnings.push(`Panel "${ctx.panelId}": skipped image_ref "${src}" (enable allowImages to load local files)`);
    return '';
  }
  if (/^https?:\/\//i.test(src)) {
    ctx.warnings.push(`Panel "${ctx.panelId}": rejected remote image_ref "${src}" — only local files are allowed`);
    return '';
  }
  const full = resolve(ctx.baseDir ?? process.cwd(), src);
  const mime = MIME_MAP[extname(full).toLowerCase()];
  if (!mime || !existsSync(full)) {
    ctx.warnings.push(`Panel "${ctx.panelId}": image_ref not found or unsupported format "${src}"`);
    return '';
  }
  const dataUri = `data:${mime};base64,${readFileSync(full).toString('base64')}`;
  return el('image', {
    href: dataUri,
    x: 0,
    y: 0,
    width: ctx.box.width,
    height: ctx.box.height,
    preserveAspectRatio: fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet',
    opacity,
  });
}

export function renderVisualLayers(layers: readonly VisualLayer[], ctx: SceneComposerContext): string {
  // Stable sort by ascending zIndex.
  const ordered = layers
    .map((layer, index) => ({ layer, index }))
    .sort((a, b) => a.layer.zIndex - b.layer.zIndex || a.index - b.index);

  const chunks: string[] = [];

  for (const { layer, index } of ordered) {
    switch (layer.type) {
      case 'backdrop':
        chunks.push(renderBackdrop(layer, ctx.box, ctx.defs, ctx.seed + index));
        break;
      case 'environment':
        chunks.push(
          renderEnvironment(layer, {
            box: ctx.box,
            defs: ctx.defs,
            theme: ctx.theme,
            seed: ctx.seed + index,
          }),
        );
        break;
      case 'character_figure': {
        const character = ctx.cast.get(layer.characterId);
        if (!character) {
          ctx.warnings.push(`Panel "${ctx.panelId}": missing character "${layer.characterId}"`);
          break;
        }
        chunks.push(
          renderCharacterFigure(layer, {
            box: ctx.box,
            defs: ctx.defs,
            character,
            defaultRim: ctx.theme.accent,
            seed: ctx.seed + index,
          }),
        );
        break;
      }
      case 'svg_raw': {
        const res = sanitizeSvgMarkup(layer.svgMarkup, { idPrefix: `${ctx.defs.ids.prefix}-raw${index}` });
        for (const w of res.warnings) ctx.warnings.push(`Panel "${ctx.panelId}" svg_raw: ${w}`);
        chunks.push(`<g data-layer="svg_raw" opacity="${fmt(layer.opacity)}">${res.svg}</g>`);
        break;
      }
      case 'effect': {
        if (layer.kind === 'speedlines-radial' || layer.kind === 'speedlines-vertical') {
          chunks.push(renderSpeedlines(layer, ctx.box, ctx.seed + index));
        } else if (layer.kind === 'halftone-vignette') {
          chunks.push(renderHalftone(layer, ctx.box, ctx.defs));
        } else {
          chunks.push(renderParticleOrAuraEffect(layer, ctx.box, ctx.defs, ctx.seed + index));
        }
        break;
      }
      case 'emotion_badge':
        chunks.push(renderEmotionBadge(layer, ctx.box));
        break;
      case 'image_ref':
        chunks.push(renderImageRef(layer.src, layer.fit, layer.opacity, ctx));
        break;
    }
  }

  return chunks.join('');
}
