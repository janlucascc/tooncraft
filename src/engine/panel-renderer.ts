import type { Character } from '../schema/character.js';
import type { MemoryTint, Panel } from '../schema/panel.js';
import type { ResolvedTheme } from '../templates/themes.js';
import type { GutterLayout, PanelLayout } from './pacing-layout.js';
import {
  DefsCollector,
  IdFactory,
   type PanelBox,
  el,
  escapeXml,
  linearGradient,
  radialGradient,
} from '../components/svg-utils.js';
import { buildPanelFrame } from '../components/frames/panel-frame.js';
import { renderVisualLayers } from '../components/scenes/procedural-composer.js';
import { renderBubble } from '../components/bubbles/render-bubble.js';
import { renderSfx } from '../components/sfx/render-sfx.js';

function renderMemoryTintOverlay(
  tint: MemoryTint | undefined,
  box: PanelBox,
  defs: DefsCollector,
): string {
  if (!tint || tint === 'none') return '';

  const cfg: Record<
    Exclude<MemoryTint, 'none'>,
    { wash: string; washOpacity: number; edge: string; barsColor: string }
  > = {
    'sepia-flashback': {
      wash: '#78350F',
      washOpacity: 0.28,
      edge: '#1C1108',
      barsColor: '#FEF3C7',
    },
    'crimson-trauma': {
      wash: '#7F1D1D',
      washOpacity: 0.26,
      edge: '#180406',
      barsColor: '#FCA5A5',
    },
    'frost-despair': {
      wash: '#1E3A8A',
      washOpacity: 0.25,
      edge: '#060B19',
      barsColor: '#BAE6FD',
    },
  };

  const c = cfg[tint];
  const vigId = defs.add('memvig', (id) =>
    radialGradient(id, [
      { offset: 0, color: c.wash, opacity: 0.05 },
      { offset: 0.65, color: c.wash, opacity: c.washOpacity },
      { offset: 1, color: c.edge, opacity: 0.78 },
    ]),
  );

  // Subtle horizontal memory scan/fade lines at top and bottom of the flashback frame
  let bars = '';
  const lineYs = [18, 28, 36, box.height - 36, box.height - 28, box.height - 18];
  for (const y of lineYs) {
    bars += el('line', {
      x1: 0,
      y1: y,
      x2: box.width,
      y2: y,
      stroke: c.barsColor,
      'stroke-width': 1.2,
      'stroke-opacity': 0.22,
      'stroke-dasharray': '18 10 6 10',
    });
  }

  return (
    `<g data-memory-tint="${tint}">` +
    el('rect', {
      x: 0,
      y: 0,
      width: box.width,
      height: box.height,
      fill: c.wash,
      'fill-opacity': c.washOpacity * 0.65,
    }) +
    el('rect', { x: 0, y: 0, width: box.width, height: box.height, fill: `url(#${vigId})` }) +
    bars +
    `</g>`
  );
}

export interface PanelRenderOptions {
  panel: Panel;
  layout: PanelLayout;
  theme: ResolvedTheme;
  defaultMarginX: number;
  cast: Map<string, Character>;
  baseDir?: string;
  allowImages?: boolean;
  warnings: string[];
}

/**
 * Compile a single Panel into a self-contained SVG document of `width × height`.
 * Visual layers are clipped to the frame; SFX and bubbles float above the frame
 * so intentional panel-breaks render cleanly.
 */
export function renderPanelSvg(opts: PanelRenderOptions): string {
  const { panel, layout, theme, cast } = opts;
  const box = { width: layout.width, height: layout.height };
  const ids = new IdFactory(`p${layout.index}`);
  const defs = new DefsCollector(ids);

  const frame = buildPanelFrame(panel.frame, box, {
    defaultMarginX: opts.defaultMarginX,
    defaultBorderColor: theme.panelBorder,
    scrollBackground: theme.scrollBackground,
    seed: panel.seed,
    defs,
  });

  const scene = renderVisualLayers(panel.layers, {
    panelId: panel.id,
    box,
    defs,
    theme,
    cast,
    seed: panel.seed,
    baseDir: opts.baseDir,
    allowImages: opts.allowImages,
    warnings: opts.warnings,
  });

  // Render SFX and bubbles sorted together by zIndex above the frame border.
  type Overlay = { z: number; order: number; svg: string };
  const overlays: Overlay[] = [];
  let seq = 0;

  for (const sfx of panel.sfx) {
    overlays.push({
      z: sfx.zIndex,
      order: seq++,
      svg: renderSfx(sfx, { box, defs, seed: panel.seed }),
    });
  }
  for (const bubble of panel.bubbles) {
    overlays.push({
      z: bubble.zIndex,
      order: seq++,
      svg: renderBubble(bubble, {
        box,
        defs,
        theme,
        character: bubble.characterId ? cast.get(bubble.characterId) : undefined,
        metrics: layout.bubbles.get(bubble.id),
      }),
    });
  }

  overlays.sort((a, b) => a.z - b.z || a.order - b.order);

  const memoryOverlay = renderMemoryTintOverlay(panel.memoryTint, box, defs);

  const body =
    el('rect', { x: 0, y: 0, width: box.width, height: box.height, fill: theme.scrollBackground }) +
    `<g data-scene="1">${scene}</g>` +
    memoryOverlay +
    frame.matteSvg +
    frame.borderSvg +
    overlays.map((o) => o.svg).join('');

  const title = panel.moodDescription ? `<title>${escapeXml(panel.moodDescription)}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}" viewBox="0 0 ${box.width} ${box.height}" data-panel-id="${escapeXml(panel.id)}">${title}${defs}${body}</svg>`;
}

/**
 * Render the transition gap (gutter) between two panels as a standalone SVG.
 */
export function renderGutterSvg(
  gutter: GutterLayout,
  width: number,
  theme: ResolvedTheme,
  index: number,
): string {
  const h = gutter.height;
  if (h <= 0) return '';
  const bg = theme.scrollBackground;
  const defs = new DefsCollector(new IdFactory(`g${index}`));
  let fill = bg;

  if (gutter.transition === 'fade-to-black') {
    const id = defs.add('gfade', (gid) =>
      linearGradient(
        gid,
        [
          { offset: 0, color: bg },
          { offset: 0.4, color: '#000000' },
          { offset: 0.6, color: '#000000' },
          { offset: 1, color: bg },
        ],
        90,
      ),
    );
    fill = `url(#${id})`;
  } else if (gutter.transition === 'fade-to-white') {
    const id = defs.add('gfade', (gid) =>
      linearGradient(
        gid,
        [
          { offset: 0, color: bg },
          { offset: 0.45, color: '#FFFFFF' },
          { offset: 0.55, color: '#FFFFFF' },
          { offset: 1, color: bg },
        ],
        90,
      ),
    );
    fill = `url(#${id})`;
  } else if (gutter.transition === 'gradient-shift') {
    const id = defs.add('gshift', (gid) =>
      linearGradient(
        gid,
        [
          { offset: 0, color: bg },
          { offset: 0.5, color: theme.accent, opacity: 0.25 },
          { offset: 1, color: bg },
        ],
        90,
      ),
    );
    fill = `url(#${id})`;
  }

  const baseBg =
    gutter.transition === 'gradient-shift'
      ? el('rect', { x: 0, y: 0, width, height: h, fill: bg })
      : '';
  const overlay = el('rect', { x: 0, y: 0, width, height: h, fill });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">${defs}${baseBg}${overlay}</svg>`;
}
