import type { EnvironmentLayer } from '../schema/visual-layer.js';
import type { ResolvedTheme } from './themes.js';
import {
  type DefsCollector,
  type PanelBox,
  darken,
  el,
  fmt,
  glowFilter,
  lighten,
  linearGradient,
  mix,
  pctY,
  polygonPath,
  radialGradient,
} from '../components/svg-utils.js';
import { createPrng, type Prng } from '../engine/prng.js';

/**
 * Procedural vector scenery for each `EnvironmentPreset`.
 *
 * Every scene respects the panel dimensions (`box`) and horizon (`perspectiveY`),
 * draws multi-layer depth (far silhouettes → mid architecture/foliage → near
 * framing details → ground reflections/fog), and is seeded deterministically.
 */

export interface EnvironmentRenderContext {
  box: PanelBox;
  defs: DefsCollector;
  theme: ResolvedTheme;
  seed: number;
}

function atmosphericFog(
  box: PanelBox,
  horizonY: number,
  color: string,
  opacity: number,
  defs: DefsCollector,
): string {
  if (opacity <= 0) return '';
  const id = defs.add('envfog', (gid) =>
    linearGradient(
      gid,
      [
        { offset: 0, color, opacity: 0 },
        { offset: 0.45, color, opacity: opacity * 0.7 },
        { offset: 0.65, color, opacity },
        { offset: 1, color, opacity: opacity * 0.25 },
      ],
      90,
    ),
  );
  const y = Math.max(0, horizonY - box.height * 0.28);
  return el('rect', { x: 0, y, width: box.width, height: box.height - y, fill: `url(#${id})` });
}

function renderCyberpunkAlley(
  box: PanelBox,
  horizonY: number,
  accent: string,
  accent2: string,
  shadow: string,
  defs: DefsCollector,
  prng: Prng,
): string {
  const { width: w, height: h } = box;
  const cx = w * 0.5;
  const alleyW = w * 0.24;
  const glow1 = defs.once(`envglow-${accent}`, 'envglow', (id) => glowFilter(id, 4, accent, 1));
  const glow2 = defs.once(`envglow-${accent2}`, 'envglow', (id) => glowFilter(id, 3.5, accent2, 1));
  let out = '';

  // Distant skyscraper silhouette at vanishing point.
  for (let i = 0; i < 6; i++) {
    const bw = prng.range(36, 78);
    const bh = prng.range(h * 0.2, h * 0.45);
    const bx = cx - alleyW * 1.1 + i * (alleyW * 0.42);
    out += el('rect', { x: bx, y: horizonY - bh, width: bw, height: bh + 20, fill: lighten(shadow, 0.08) });
  }

  // Wet asphalt ground with perspective lane lines & neon puddle reflections.
  const groundGrad = defs.add('ground', (id) =>
    linearGradient(
      id,
      [
        { offset: 0, color: lighten(shadow, 0.1) },
        { offset: 1, color: darken(shadow, 0.5) },
      ],
      90,
    ),
  );
  out += el('rect', { x: 0, y: horizonY, width: w, height: h - horizonY, fill: `url(#${groundGrad})` });
  for (let i = 0; i < 12; i++) {
    const t = (i + 1) / 13;
    const ry = horizonY + (h - horizonY) * t * t;
    const rw = w * (0.1 + t * 0.36);
    const col = i % 2 === 0 ? accent : accent2;
    out += el('rect', {
      x: cx - rw * 0.5 + prng.range(-25, 25),
      y: ry,
      width: rw,
      height: 2 + t * 7,
      rx: 3,
      fill: col,
      opacity: 0.14 + t * 0.28,
    });
  }

  // Converging left & right megastructure walls.
  const leftWall = polygonPath([
    { x: 0, y: 0 },
    { x: cx - alleyW * 0.5, y: horizonY * 0.25 },
    { x: cx - alleyW * 0.5, y: horizonY },
    { x: 0, y: h },
  ]);
  const rightWall = polygonPath([
    { x: w, y: 0 },
    { x: cx + alleyW * 0.5, y: horizonY * 0.25 },
    { x: cx + alleyW * 0.5, y: horizonY },
    { x: w, y: h },
  ]);
  out += el('path', { d: leftWall, fill: shadow });
  out += el('path', { d: rightWall, fill: darken(shadow, 0.15) });

  // Vertical neon signs, AC units, cables & windows on both walls.
  for (const side of [-1, 1] as const) {
    const col = side === -1 ? accent : accent2;
    const gId = side === -1 ? glow1 : glow2;
    for (let i = 0; i < 4; i++) {
      const depth = 0.2 + i * 0.2;
      const sx = side === -1 ? w * (0.04 + depth * 0.34) : w * (0.96 - depth * 0.34);
      const sy = horizonY * (0.12 + depth * 0.5);
      const sw = 12 + (1 - depth) * 28;
      const sh = 38 + (1 - depth) * 85;
      const x = side === -1 ? sx : sx - sw;
      out += el('rect', {
        x,
        y: sy,
        width: sw,
        height: sh,
        rx: 2,
        fill: darken(shadow, 0.4),
        stroke: col,
        'stroke-width': 2.2,
        filter: `url(#${gId})`,
      });
      // Abstract glyph bars inside neon sign.
      for (let b = 0; b < 3; b++) {
        out += el('line', {
          x1: x + sw * 0.24,
          y1: sy + sh * (0.25 + b * 0.25),
          x2: x + sw * 0.76,
          y2: sy + sh * (0.25 + b * 0.25),
          stroke: lighten(col, 0.3),
          'stroke-width': 2.5,
          opacity: 0.9,
        });
      }
    }
  }

  // Overhead power cables.
  for (let i = 0; i < 4; i++) {
    const y0 = h * (0.04 + i * 0.06);
    const sag = y0 + prng.range(24, 64);
    out += el('path', {
      d: `M0 ${fmt(y0)}Q${fmt(cx)} ${fmt(sag)} ${fmt(w)} ${fmt(y0 + prng.range(-18, 18))}`,
      fill: 'none',
      stroke: darken(shadow, 0.6),
      'stroke-width': 1.8 - i * 0.25,
      opacity: 0.85,
    });
  }

  return out;
}

function renderNeonSkyline(
  box: PanelBox,
  horizonY: number,
  accent: string,
  accent2: string,
  shadow: string,
  defs: DefsCollector,
  prng: Prng,
): string {
  const { width: w, height: h } = box;
  let out = '';

  // Horizon glow band.
  const hGlow = defs.add('skylineglow', (id) =>
    radialGradient(
      id,
      [
        { offset: 0, color: accent, opacity: 0.45 },
        { offset: 0.6, color: accent2, opacity: 0.16 },
        { offset: 1, color: accent2, opacity: 0 },
      ],
      { cx: 0.5, cy: horizonY / h, r: 0.65 },
    ),
  );
  out += el('rect', { x: 0, y: 0, width: w, height: h, fill: `url(#${hGlow})` });

  // 3 parallax layers of towers.
  const layers = [
    { count: 14, minH: 0.18, maxH: 0.48, fill: lighten(shadow, 0.14), win: false },
    { count: 10, minH: 0.24, maxH: 0.56, fill: lighten(shadow, 0.06), win: true },
    { count: 7, minH: 0.2, maxH: 0.62, fill: darken(shadow, 0.25), win: true },
  ];
  layers.forEach((L, li) => {
    let x = -20;
    while (x < w + 20) {
      const bw = prng.range(w / L.count * 0.65, w / L.count * 1.35);
      const bh = prng.range(h * L.minH, h * L.maxH);
      const by = horizonY - bh;
      out += el('rect', { x, y: by, width: bw, height: h - by, fill: L.fill });
      if (prng.chance(0.45)) {
        // Spire / antenna.
        const sx = x + bw * prng.range(0.3, 0.7);
        out += el('line', { x1: sx, y1: by, x2: sx, y2: by - prng.range(18, 52), stroke: L.fill, 'stroke-width': 2 });
        out += el('circle', { cx: sx, cy: by - prng.range(18, 52), r: 2.2, fill: accent });
      }
      if (L.win && li >= 1) {
        const winCol = prng.chance(0.5) ? accent2 : accent;
        const rows = Math.floor(bh / 22);
        const cols = Math.max(1, Math.floor((bw - 14) / 14));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (prng.chance(0.38)) {
              out += el('rect', {
                x: x + 8 + c * 14,
                y: by + 12 + r * 20,
                width: 7,
                height: 10,
                fill: winCol,
                opacity: prng.range(0.25, 0.78),
              });
            }
          }
        }
      }
      x += bw - prng.range(4, 16);
    }
  });

  // Water / reflective terrace below horizon.
  out += el('rect', { x: 0, y: horizonY, width: w, height: h - horizonY, fill: darken(shadow, 0.45), opacity: 0.75 });
  for (let i = 0; i < 24; i++) {
    const ry = prng.range(horizonY + 8, h - 10);
    const rw = prng.range(24, 140);
    out += el('rect', {
      x: prng.range(0, w - rw),
      y: ry,
      width: rw,
      height: prng.range(1.5, 4),
      fill: i % 2 === 0 ? accent : accent2,
      opacity: prng.range(0.15, 0.45),
    });
  }
  return out;
}

function renderSchoolRooftop(
  box: PanelBox,
  horizonY: number,
  accent: string,
  shadow: string,
  prng: Prng,
): string {
  const { width: w, height: h } = box;
  let out = '';

  // Soft stylized clouds.
  for (let i = 0; i < 5; i++) {
    const cx = prng.range(w * 0.08, w * 0.92);
    const cy = prng.range(h * 0.08, horizonY * 0.65);
    const rw = prng.range(60, 140);
    out += el('ellipse', { cx, cy, rx: rw, ry: rw * 0.28, fill: '#FFFFFF', opacity: 0.42 });
    out += el('ellipse', { cx: cx + rw * 0.35, cy: cy - rw * 0.08, rx: rw * 0.65, ry: rw * 0.24, fill: '#FFFFFF', opacity: 0.36 });
  }

  // Distant town silhouette.
  let tx = 0;
  while (tx < w) {
    const bw = prng.range(32, 74);
    const bh = prng.range(24, 68);
    out += el('rect', { x: tx, y: horizonY - bh, width: bw + 2, height: bh + 20, fill: lighten(shadow, 0.32), opacity: 0.65 });
    tx += bw;
  }

  // Chain-link rooftop fence.
  const fenceTop = Math.max(40, horizonY - 110);
  const fenceBot = horizonY + 12;
  const step = 22;
  let mesh = '';
  for (let x = -120; x < w + 120; x += step) {
    mesh += `M${fmt(x)} ${fmt(fenceTop)}L${fmt(x + (fenceBot - fenceTop) * 0.7)} ${fmt(fenceBot)}`;
    mesh += `M${fmt(x)} ${fmt(fenceBot)}L${fmt(x + (fenceBot - fenceTop) * 0.7)} ${fmt(fenceTop)}`;
  }
  out += el('path', { d: mesh, stroke: lighten(shadow, 0.2), 'stroke-width': 1.2, opacity: 0.55 });
  // Fence rails & posts.
  out += el('line', { x1: 0, y1: fenceTop, x2: w, y2: fenceTop, stroke: darken(shadow, 0.1), 'stroke-width': 4 });
  out += el('line', { x1: 0, y1: (fenceTop + fenceBot) / 2, x2: w, y2: (fenceTop + fenceBot) / 2, stroke: darken(shadow, 0.1), 'stroke-width': 2.5 });
  for (let x = 60; x < w; x += 170) {
    out += el('rect', { x: x - 4, y: fenceTop - 6, width: 8, height: fenceBot - fenceTop + 14, fill: darken(shadow, 0.15) });
  }

  // Concrete ledge & rooftop floor.
  out += el('rect', { x: 0, y: fenceBot, width: w, height: 22, fill: lighten(shadow, 0.38), stroke: darken(shadow, 0.15), 'stroke-width': 2 });
  out += el('rect', { x: 0, y: fenceBot + 22, width: w, height: h - (fenceBot + 22), fill: mix(shadow, '#E5E7EB', 0.55) });
  // Sunlight diagonal sheen.
  out += el('polygon', {
    points: `0,${fmt(fenceBot + 22)} ${fmt(w * 0.65)},${fmt(fenceBot + 22)} ${fmt(w * 0.4)},${fmt(h)} 0,${fmt(h)}`,
    fill: accent,
    opacity: 0.12,
  });
  return out;
}

function renderDarkForest(
  box: PanelBox,
  horizonY: number,
  accent: string,
  shadow: string,
  defs: DefsCollector,
  prng: Prng,
): string {
  const { width: w, height: h } = box;
  let out = '';

  // Moon / eerie glow behind canopy.
  const moonX = w * prng.range(0.35, 0.68);
  const moonY = horizonY * 0.42;
  const moonGlow = defs.add('moonglow', (id) =>
    radialGradient(
      id,
      [
        { offset: 0, color: '#F8FAFC', opacity: 0.9 },
        { offset: 0.35, color: accent, opacity: 0.35 },
        { offset: 1, color: accent, opacity: 0 },
      ],
    ),
  );
  out += el('circle', { cx: moonX, cy: moonY, r: 150, fill: `url(#${moonGlow})` });
  out += el('circle', { cx: moonX, cy: moonY, r: 34, fill: '#F8FAFC', opacity: 0.9 });

  // 3 depth passes of pine/gnarled trees.
  const passes = [
    { count: 16, fill: lighten(shadow, 0.12), wMin: 12, wMax: 24, yBase: horizonY + 10 },
    { count: 10, fill: lighten(shadow, 0.04), wMin: 20, wMax: 38, yBase: horizonY + 35 },
    { count: 6, fill: darken(shadow, 0.38), wMin: 34, wMax: 64, yBase: h },
  ];
  for (const pass of passes) {
    for (let i = 0; i < pass.count; i++) {
      const x = (i / pass.count) * w + prng.range(-25, 25);
      const tw = prng.range(pass.wMin, pass.wMax);
      const top = prng.range(-20, horizonY * 0.25);
      out += el('path', {
        d: `M${fmt(x - tw * 0.5)} ${fmt(pass.yBase)}L${fmt(x - tw * 0.25)} ${fmt(top)}L${fmt(x + tw * 0.25)} ${fmt(top)}L${fmt(x + tw * 0.5)} ${fmt(pass.yBase)}Z`,
        fill: pass.fill,
      });
      // Jagged branches.
      for (let b = 0; b < 4; b++) {
        const by = top + (pass.yBase - top) * (0.18 + b * 0.18);
        const dir = b % 2 === 0 ? -1 : 1;
        const len = tw * prng.range(1.6, 3.1);
        out += el('path', {
          d: `M${fmt(x)} ${fmt(by)}L${fmt(x + dir * len)} ${fmt(by - prng.range(12, 34))}L${fmt(x)} ${fmt(by + tw * 0.28)}Z`,
          fill: pass.fill,
        });
      }
    }
  }

  // Forest floor.
  out += el('rect', { x: 0, y: horizonY + 25, width: w, height: h - horizonY, fill: darken(shadow, 0.5), opacity: 0.85 });
  return out;
}

function renderDungeonCavern(
  box: PanelBox,
  horizonY: number,
  accent: string,
  shadow: string,
  defs: DefsCollector,
  prng: Prng,
): string {
  const { width: w, height: h } = box;
  const cx = w * 0.5;
  let out = '';

  // Glowing crystal/mana core deep in the cavern.
  const core = defs.add('cavern', (id) =>
    radialGradient(
      id,
      [
        { offset: 0, color: accent, opacity: 0.72 },
        { offset: 0.45, color: accent, opacity: 0.2 },
        { offset: 1, color: accent, opacity: 0 },
      ],
      { cx: 0.5, cy: horizonY / h, r: 0.55 },
    ),
  );
  out += el('rect', { x: 0, y: 0, width: w, height: h, fill: `url(#${core})` });

  // Stalactites from ceiling.
  const topPts: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
  for (let x = 0; x <= w; x += 38) {
    const edgeBoost = Math.abs(x - cx) / cx;
    const drop = prng.range(30, 120) + edgeBoost * 130;
    topPts.push({ x, y: drop });
    topPts.push({ x: x + 19, y: prng.range(12, 48) + edgeBoost * 50 });
  }
  topPts.push({ x: w, y: 0 });
  out += el('path', { d: polygonPath(topPts), fill: darken(shadow, 0.35) });

  // Jagged cavern side walls framing the corridor.
  const leftWall = polygonPath([
    { x: 0, y: 0 },
    { x: w * 0.24, y: h * 0.2 },
    { x: w * 0.16, y: horizonY * 0.7 },
    { x: w * 0.26, y: horizonY },
    { x: w * 0.08, y: h },
    { x: 0, y: h },
  ]);
  const rightWall = polygonPath([
    { x: w, y: 0 },
    { x: w * 0.76, y: h * 0.22 },
    { x: w * 0.84, y: horizonY * 0.72 },
    { x: w * 0.74, y: horizonY },
    { x: w * 0.92, y: h },
    { x: w, y: h },
  ]);
  out += el('path', { d: leftWall, fill: shadow });
  out += el('path', { d: rightWall, fill: darken(shadow, 0.18) });

  // Glowing mana crystals sprouting along the walls.
  const glowId = defs.once(`crystalglow-${accent}`, 'crystalglow', (id) => glowFilter(id, 4, accent, 0.9));
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const bx = side === -1 ? prng.range(24, w * 0.2) : prng.range(w * 0.8, w - 24);
    const by = prng.range(horizonY * 0.65, h * 0.9);
    const ch = prng.range(36, 86);
    const cw = ch * 0.34;
    const tilt = side * prng.range(-18, -6);
    out += el('polygon', {
      points: `${fmt(bx - cw * 0.5)},${fmt(by)} ${fmt(bx + tilt)},${fmt(by - ch)} ${fmt(bx + cw * 0.5)},${fmt(by)}`,
      fill: accent,
      opacity: 0.85,
      filter: `url(#${glowId})`,
    });
  }

  // Rocky dungeon floor.
  out += el('path', {
    d: `M0 ${fmt(horizonY + 18)}Q${fmt(cx)} ${fmt(horizonY - 8)} ${fmt(w)} ${fmt(horizonY + 18)}L${fmt(w)} ${fmt(h)}L0 ${fmt(h)}Z`,
    fill: darken(shadow, 0.42),
  });
  return out;
}

function renderThroneHall(
  box: PanelBox,
  horizonY: number,
  accent: string,
  shadow: string,
  defs: DefsCollector,
): string {
  const { width: w, height: h } = box;
  const cx = w * 0.5;
  let out = '';

  // Tall Gothic window light shaft behind the dais.
  const beam = defs.add('thronebeam', (id) =>
    linearGradient(
      id,
      [
        { offset: 0, color: accent, opacity: 0.42 },
        { offset: 0.65, color: accent, opacity: 0.14 },
        { offset: 1, color: accent, opacity: 0 },
      ],
      90,
    ),
  );
  out += el('path', {
    d: `M${fmt(cx - 56)} ${fmt(horizonY)}L${fmt(cx - 56)} ${fmt(horizonY * 0.22)}Q${fmt(cx)} ${fmt(horizonY * 0.02)} ${fmt(cx + 56)} ${fmt(horizonY * 0.22)}L${fmt(cx + 56)} ${fmt(horizonY)}Z`,
    fill: accent,
    opacity: 0.28,
  });
  out += el('polygon', {
    points: `${fmt(cx - 56)},${fmt(horizonY * 0.2)} ${fmt(cx + 56)},${fmt(horizonY * 0.2)} ${fmt(cx + 220)},${fmt(h)} ${fmt(cx - 220)},${fmt(h)}`,
    fill: `url(#${beam})`,
  });

  // Flanking colonnade pillars in perspective.
  const depths = [0.22, 0.48, 0.82];
  for (const d of depths) {
    const pw = 24 + d * 48;
    const dx = 90 + d * (w * 0.4);
    const fill = mix(lighten(shadow, 0.14), darken(shadow, 0.35), d);
    for (const side of [-1, 1] as const) {
      const px = cx + side * dx - pw / 2;
      out += el('rect', { x: px, y: 0, width: pw, height: h, fill });
      out += el('rect', { x: px - 6, y: horizonY - 12 + d * 45, width: pw + 12, height: 14, fill: lighten(fill, 0.12) });
    }
  }

  // Marble floor & red/accent royal carpet converging on the throne.
  out += el('rect', { x: 0, y: horizonY, width: w, height: h - horizonY, fill: darken(shadow, 0.35) });
  out += el('polygon', {
    points: `${fmt(cx - 46)},${fmt(horizonY)} ${fmt(cx + 46)},${fmt(horizonY)} ${fmt(cx + 185)},${fmt(h)} ${fmt(cx - 185)},${fmt(h)}`,
    fill: darken(accent, 0.35),
  });
  out += el('polygon', {
    points: `${fmt(cx - 38)},${fmt(horizonY)} ${fmt(cx + 38)},${fmt(horizonY)} ${fmt(cx + 155)},${fmt(h)} ${fmt(cx - 155)},${fmt(h)}`,
    fill: 'none',
    stroke: accent,
    'stroke-width': 2.5,
    opacity: 0.75,
  });
  return out;
}

function renderRainyStreet(
  box: PanelBox,
  horizonY: number,
  accent: string,
  shadow: string,
  defs: DefsCollector,
  prng: Prng,
): string {
  const { width: w, height: h } = box;
  let out = '';

  // Dim block silhouettes.
  let x = 0;
  while (x < w) {
    const bw = prng.range(54, 128);
    const bh = prng.range(h * 0.22, h * 0.5);
    out += el('rect', { x, y: horizonY - bh, width: bw + 2, height: bh + 6, fill: lighten(shadow, prng.range(0.03, 0.1)) });
    x += bw;
  }

  // Wet street.
  out += el('rect', { x: 0, y: horizonY, width: w, height: h - horizonY, fill: darken(shadow, 0.45) });

  // Streetlamps with warm/noir pools of light.
  const lamps = [w * 0.18, w * 0.82];
  for (const lx of lamps) {
    const topY = horizonY - h * 0.32;
    const cone = defs.add('lamp', (id) =>
      radialGradient(id, [
        { offset: 0, color: accent, opacity: 0.55 },
        { offset: 0.45, color: accent, opacity: 0.15 },
        { offset: 1, color: accent, opacity: 0 },
      ]),
    );
    out += el('circle', { cx: lx, cy: topY + 6, r: 110, fill: `url(#${cone})` });
    out += el('rect', { x: lx - 3, y: topY, width: 6, height: horizonY + 18 - topY, fill: darken(shadow, 0.6) });
    out += el('ellipse', { cx: lx, cy: topY + 4, rx: 14, ry: 5, fill: '#F8FAFC' });
    // Wet puddle reflection.
    out += el('ellipse', {
      cx: lx,
      cy: horizonY + (h - horizonY) * 0.45,
      rx: 28,
      ry: (h - horizonY) * 0.36,
      fill: accent,
      opacity: 0.18,
    });
  }
  return out;
}

function renderAbstractVoid(
  box: PanelBox,
  horizonY: number,
  accent: string,
  accent2: string,
  defs: DefsCollector,
  prng: Prng,
): string {
  const { width: w, height: h } = box;
  const cx = w * 0.5;
  let out = '';

  const gridGrad = defs.add('voidgrid', (id) =>
    linearGradient(
      id,
      [
        { offset: 0, color: accent, opacity: 0.55 },
        { offset: 1, color: accent2, opacity: 0.06 },
      ],
      90,
    ),
  );

  // Subtle perspective grid below horizon.
  let grid = '';
  for (let i = -8; i <= 8; i++) {
    grid += `M${fmt(cx + i * 24)} ${fmt(horizonY)}L${fmt(cx + i * 115)} ${fmt(h)}`;
  }
  for (let r = 0; r < 8; r++) {
    const t = r / 7;
    const y = horizonY + (h - horizonY) * t * t;
    grid += `M0 ${fmt(y)}L${fmt(w)} ${fmt(y)}`;
  }
  out += el('path', { d: grid, stroke: `url(#${gridGrad})`, 'stroke-width': 1.2 });

  // Floating geometric monolith shards.
  for (let i = 0; i < 8; i++) {
    const sx = prng.range(w * 0.08, w * 0.92);
    const sy = prng.range(h * 0.1, horizonY * 0.95);
    const size = prng.range(14, 48);
    out += el('polygon', {
      points: `${fmt(sx)},${fmt(sy - size)} ${fmt(sx + size * 0.6)},${fmt(sy)} ${fmt(sx)},${fmt(sy + size * 0.8)} ${fmt(sx - size * 0.55)},${fmt(sy)}`,
      fill: i % 2 === 0 ? accent : accent2,
      opacity: prng.range(0.08, 0.25),
      stroke: i % 2 === 0 ? accent : accent2,
      'stroke-width': 1,
    });
  }
  return out;
}

export function renderEnvironment(layer: EnvironmentLayer, ctx: EnvironmentRenderContext): string {
  const { box, defs, theme } = ctx;
  const horizonY = pctY(box, layer.perspectiveY);
  const accent = layer.accentColor ?? theme.accent;
  const accent2 = theme.accent2;
  const shadow = theme.shadowTone;
  const prng = createPrng(`${ctx.seed}-env-${layer.preset}`);

  let content = '';
  switch (layer.preset) {
    case 'cyberpunk-alley':
      content = renderCyberpunkAlley(box, horizonY, accent, accent2, shadow, defs, prng);
      break;
    case 'neon-skyline':
      content = renderNeonSkyline(box, horizonY, accent, accent2, shadow, defs, prng);
      break;
    case 'school-rooftop':
      content = renderSchoolRooftop(box, horizonY, accent, shadow, prng);
      break;
    case 'dark-forest':
      content = renderDarkForest(box, horizonY, accent, shadow, defs, prng);
      break;
    case 'dungeon-cavern':
      content = renderDungeonCavern(box, horizonY, accent, shadow, defs, prng);
      break;
    case 'throne-hall':
      content = renderThroneHall(box, horizonY, accent, shadow, defs);
      break;
    case 'rainy-street':
      content = renderRainyStreet(box, horizonY, accent, shadow, defs, prng);
      break;
    case 'abstract-void':
      content = renderAbstractVoid(box, horizonY, accent, accent2, defs, prng);
      break;
  }

  const fog = atmosphericFog(box, horizonY, mix(accent, theme.sky[1], 0.5), layer.fogOpacity, defs);
  return `<g data-environment="${layer.preset}">${content}${fog}</g>`;
}
