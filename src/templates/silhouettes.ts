import type { Character, CharacterPalette, SilhouettePreset } from '../schema/character.js';
import type { CharacterFigureLayer, Expression, Framing, Pose } from '../schema/visual-layer.js';
import {
  type DefsCollector,
  type PanelBox,
  darken,
  el,
  fmt,
  glowFilter,
  lighten,
  linearGradient,
  pctPoint,
  radialGradient,
  blurFilter,
} from '../components/svg-utils.js';
import { createPrng, type Prng } from '../engine/prng.js';

/**
 * Procedural, cel-shaded character figures.
 *
 * Figures are drawn in a local coordinate system (feet at y=0, head top at
 * about y=-600, x centered on 0) from a posable skeleton, then cropped/scaled
 * by `framing` and anchored at `position` (bottom-center of the crop).
 *
 * Rendering passes: aura → rim light → base fills (+ ink outline) → shading →
 * face details → overlays (shadowed face, glowing eyes).
 */

interface P {
  x: number;
  y: number;
}

interface Part {
  d: string;
  fill: string;
  /** Participates in rim-light and shade passes (default true). */
  body?: boolean;
  /** Extra raw attributes for the base pass. */
  attrs?: Record<string, string | number | undefined>;
  /** Skip the ink outline. */
  noStroke?: boolean;
}

/** Local-space crop per framing: [top, bottom] and fraction of panel height to fill. */
const FRAMING_CROP: Record<Framing, { top: number; bottom: number; fill: number }> = {
  'full-body': { top: -630, bottom: 12, fill: 0.88 },
  'waist-up': { top: -630, bottom: -280, fill: 0.96 },
  bust: { top: -625, bottom: -385, fill: 0.97 },
  'close-up': { top: -612, bottom: -452, fill: 0.98 },
  'eyes-only': { top: -558, bottom: -508, fill: 1 },
};

const REF_HIP_Y = -262;
const HEAD = { x: 0, y: -535 };

interface Skeleton {
  hip: P;
  /** Upper body rotation (deg) around the hip; positive leans toward +x. */
  lean: number;
  /** Arms in standing (un-leaned, un-shifted) coordinates: shoulder, elbow, hand. */
  armBack: [P, P, P];
  armFront: [P, P, P];
  /** Legs in global coordinates: hip, knee, ankle. */
  legBack: [P, P, P];
  legFront: [P, P, P];
  /** Draw back arm behind the torso. */
  backArmBehind: boolean;
  shoulderHalf: number;
}

function skeletonFor(pose: Pose): Skeleton {
  switch (pose) {
    case 'action-lunge':
      return {
        hip: { x: 0, y: -215 },
        lean: 14,
        armBack: [{ x: -74, y: -452 }, { x: -140, y: -385 }, { x: -195, y: -330 }],
        armFront: [{ x: 74, y: -452 }, { x: 170, y: -468 }, { x: 262, y: -478 }],
        legBack: [{ x: -28, y: -215 }, { x: -98, y: -112 }, { x: -168, y: -16 }],
        legFront: [{ x: 28, y: -215 }, { x: 108, y: -142 }, { x: 122, y: -16 }],
        backArmBehind: true,
        shoulderHalf: 78,
      };
    case 'crouching':
      return {
        hip: { x: 0, y: -150 },
        lean: 9,
        armBack: [{ x: -74, y: -452 }, { x: -100, y: -362 }, { x: -112, y: -275 }],
        armFront: [{ x: 74, y: -452 }, { x: 112, y: -372 }, { x: 92, y: -300 }],
        legBack: [{ x: -28, y: -150 }, { x: -72, y: -112 }, { x: -44, y: -16 }],
        legFront: [{ x: 28, y: -150 }, { x: 84, y: -176 }, { x: 74, y: -16 }],
        backArmBehind: false,
        shoulderHalf: 78,
      };
    case 'dramatic-profile':
      return {
        hip: { x: 0, y: REF_HIP_Y },
        lean: 2,
        armBack: [{ x: -52, y: -452 }, { x: -60, y: -345 }, { x: -58, y: -248 }],
        armFront: [{ x: 52, y: -452 }, { x: 64, y: -345 }, { x: 70, y: -248 }],
        legBack: [{ x: -22, y: REF_HIP_Y }, { x: -24, y: -135 }, { x: -26, y: -14 }],
        legFront: [{ x: 22, y: REF_HIP_Y }, { x: 26, y: -135 }, { x: 30, y: -14 }],
        backArmBehind: true,
        shoulderHalf: 58,
      };
    case 'facing-away':
    case 'standing':
    default:
      return {
        hip: { x: 0, y: REF_HIP_Y },
        lean: 0,
        armBack: [{ x: -74, y: -452 }, { x: -92, y: -345 }, { x: -98, y: -246 }],
        armFront: [{ x: 74, y: -452 }, { x: 92, y: -345 }, { x: 98, y: -246 }],
        legBack: [{ x: -30, y: REF_HIP_Y }, { x: -34, y: -135 }, { x: -38, y: -14 }],
        legFront: [{ x: 30, y: REF_HIP_Y }, { x: 34, y: -135 }, { x: 38, y: -14 }],
        backArmBehind: false,
        shoulderHalf: 78,
      };
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Tapered limb through joints, with round caps. */
function limbPath(pts: P[], widths: number[]): string {
  const n = pts.length;
  const left: P[] = [];
  const right: P[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(n - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w = (widths[i] ?? widths[widths.length - 1] ?? 10) / 2;
    left.push({ x: pts[i]!.x + nx * w, y: pts[i]!.y + ny * w });
    right.push({ x: pts[i]!.x - nx * w, y: pts[i]!.y - ny * w });
  }
  const wEnd = (widths[n - 1] ?? 10) / 2;
  const wStart = (widths[0] ?? 10) / 2;
  let d = `M${fmt(left[0]!.x)} ${fmt(left[0]!.y)}`;
  for (let i = 1; i < n; i++) d += `L${fmt(left[i]!.x)} ${fmt(left[i]!.y)}`;
  d += `A${fmt(wEnd)} ${fmt(wEnd)} 0 0 1 ${fmt(right[n - 1]!.x)} ${fmt(right[n - 1]!.y)}`;
  for (let i = n - 2; i >= 0; i--) d += `L${fmt(right[i]!.x)} ${fmt(right[i]!.y)}`;
  d += `A${fmt(wStart)} ${fmt(wStart)} 0 0 1 ${fmt(left[0]!.x)} ${fmt(left[0]!.y)}Z`;
  return d;
}

const circlePath = (c: P, r: number) =>
  `M${fmt(c.x - r)} ${fmt(c.y)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(r * 2)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-r * 2)} 0Z`;

const ellipsePath = (c: P, rx: number, ry: number) =>
  `M${fmt(c.x - rx)} ${fmt(c.y)}a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(rx * 2)} 0a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(-rx * 2)} 0Z`;

function poly(points: P[]): string {
  return `M${points.map((p) => `${fmt(p.x)} ${fmt(p.y)}`).join('L')}Z`;
}

function lerp(a: P, b: P, t: number): P {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// ---------------------------------------------------------------------------
// Outfit configuration
// ---------------------------------------------------------------------------

type HairStyle = 'spiky' | 'short' | 'messy' | 'none' | 'long';

interface OutfitStyle {
  hair: HairStyle;
  hood: boolean;
  robe: boolean;
  coat: boolean;
  mask: boolean;
  armor: boolean;
  blazer: boolean;
  gi: boolean;
  hat: boolean;
  scarf: boolean;
  headband: boolean;
  neonLines: boolean;
  entity: boolean;
}

function outfitFor(preset: SilhouettePreset): OutfitStyle {
  const none: OutfitStyle = {
    hair: 'short', hood: false, robe: false, coat: false, mask: false, armor: false,
    blazer: false, gi: false, hat: false, scarf: false, headband: false, neonLines: false, entity: false,
  };
  switch (preset) {
    case 'hooded-mage':
      return { ...none, hair: 'long', hood: true, robe: true };
    case 'armored-knight':
      return { ...none, hair: 'short', armor: true };
    case 'cyber-assassin':
      return { ...none, hair: 'messy', hood: true, mask: true, scarf: true, neonLines: true };
    case 'casual-student':
      return { ...none, hair: 'messy', blazer: true };
    case 'suit-detective':
      return { ...none, hair: 'short', coat: true, hat: true };
    case 'martial-artist':
      return { ...none, hair: 'spiky', gi: true, headband: true };
    case 'shadow-entity':
      return { ...none, hair: 'none', entity: true };
    case 'none':
    default:
      return none;
  }
}

// ---------------------------------------------------------------------------
// Body part builders
// ---------------------------------------------------------------------------

function torsoPath(half: number): string {
  const k = half / 78;
  const x = (v: number) => fmt(v * k);
  return (
    `M${x(-14)} -472C${x(-40)} -470 ${x(-70)} -468 ${x(-80)} -454` +
    `C${x(-88)} -432 ${x(-78)} -402 ${x(-70)} -382C${x(-62)} -352 ${x(-52)} -322 ${x(-50)} -302` +
    `C${x(-54)} -286 ${x(-60)} -274 ${x(-60)} -258L${x(60)} -258` +
    `C${x(60)} -274 ${x(54)} -286 ${x(50)} -302C${x(52)} -322 ${x(62)} -352 ${x(70)} -382` +
    `C${x(78)} -402 ${x(88)} -432 ${x(80)} -454C${x(70)} -468 ${x(40)} -470 ${x(14)} -472Z`
  );
}

const FACE_FRONT =
  'M0 -584C25 -584 41 -566 41 -540C41 -522 37 -510 31 -501C23 -493 11 -486 0 -485C-11 -486 -23 -493 -31 -501C-37 -510 -41 -522 -41 -540C-41 -566 -25 -584 0 -584Z';

const FACE_PROFILE =
  'M-4 -585C24 -585 40 -567 40 -547L47 -529L51 -518L42 -514C43 -508 41 -504 38 -500C34 -491 22 -485 9 -485C-7 -487 -27 -500 -35 -520C-41 -541 -37 -571 -4 -585Z';

function hairBack(style: HairStyle, pose: Pose): string | null {
  if (style === 'none') return null;
  if (pose === 'facing-away') return null; // handled by hairCap
  if (style === 'long')
    return 'M-50 -440C-58 -520 -52 -600 0 -602C52 -600 58 -520 50 -440C30 -452 -30 -452 -50 -440Z';
  return 'M-47 -500C-54 -562 -30 -602 0 -602C30 -602 54 -562 47 -500L38 -516L-38 -516Z';
}

function hairFront(style: HairStyle, pose: Pose, prng: Prng): string | null {
  if (style === 'none') return null;
  if (pose === 'facing-away') {
    // Full cap seen from behind.
    const spikes: P[] = [];
    for (let i = 0; i <= 8; i++) {
      const x = -46 + (92 * i) / 8;
      spikes.push({ x, y: -500 + (i % 2 === 0 ? 0 : -14) });
    }
    return `M-47 -500C-54 -566 -30 -604 0 -604C30 -604 54 -566 47 -500${spikes
      .reverse()
      .map((p) => `L${fmt(p.x)} ${fmt(p.y)}`)
      .join('')}Z`;
  }
  if (pose === 'dramatic-profile') {
    return 'M-42 -504C-48 -572 -18 -604 6 -603C32 -602 46 -580 43 -552L36 -557L33 -544L25 -560L16 -546L9 -566L-2 -552L-10 -574L-22 -560L-30 -540L-38 -520Z';
  }
  const top = 'M-45 -538C-46 -582 -24 -602 0 -602C24 -602 46 -582 45 -538';
  if (style === 'short') {
    return `${top}L38 -552L30 -546L22 -560L12 -550L4 -562L-6 -550L-16 -562L-24 -548L-32 -556L-39 -544Z`;
  }
  if (style === 'long') {
    return `${top}L40 -500L34 -548L22 -566L8 -556L-4 -570L-18 -556L-30 -566L-36 -546L-40 -500Z`;
  }
  // spiky / messy: jagged fringe + crown spikes
  const pts: P[] = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = 44 - 88 * t;
    const low = style === 'spiky' ? -540 : -545;
    const y = i % 2 === 0 ? low + prng.range(-6, 4) : -562 + prng.range(-6, 4);
    pts.push({ x: x + prng.range(-2, 2), y });
  }
  const crown: P[] = [];
  const spikesN = style === 'spiky' ? 7 : 5;
  for (let i = 0; i <= spikesN * 2; i++) {
    const t = i / (spikesN * 2);
    const ang = Math.PI + t * Math.PI; // left → right over the top
    const r = i % 2 === 1 ? (style === 'spiky' ? prng.range(78, 96) : prng.range(64, 74)) : 52;
    crown.push({ x: Math.cos(ang) * r * 0.92, y: -548 + Math.sin(ang) * r });
  }
  return `M-45 -538${crown.map((p) => `L${fmt(p.x)} ${fmt(p.y)}`).join('')}L45 -538${pts
    .map((p) => `L${fmt(p.x)} ${fmt(p.y)}`)
    .join('')}Z`;
}

// ---------------------------------------------------------------------------
// Face
// ---------------------------------------------------------------------------

interface FaceStyle {
  browInner: number;
  browOuter: number;
  open: number;
  iris: number;
  mouth: 'line' | 'frown' | 'open' | 'smirk' | 'grin' | 'grit';
}

const EXPRESSIONS: Record<Expression, FaceStyle> = {
  neutral: { browInner: 0, browOuter: 0, open: 1, iris: 1, mouth: 'line' },
  angry: { browInner: 7, browOuter: -3, open: 0.72, iris: 0.9, mouth: 'grit' },
  shocked: { browInner: -6, browOuter: -4, open: 1.3, iris: 0.55, mouth: 'open' },
  smirk: { browInner: 2, browOuter: -2, open: 0.62, iris: 1, mouth: 'smirk' },
  'menacing-glow': { browInner: 8, browOuter: -4, open: 0.7, iris: 1, mouth: 'grin' },
  shadowed: { browInner: 4, browOuter: -1, open: 0.8, iris: 1, mouth: 'line' },
};

function frontFace(
  palette: CharacterPalette,
  expr: Expression,
  glowEyes: boolean,
  defs: DefsCollector,
  lw: number,
  masked: boolean,
): string {
  const f = EXPRESSIONS[expr];
  const ink = darken(palette.hair, 0.55);
  const lineInk = darken(palette.skin, 0.62);
  let out = '';
  const cy = -532;
  const hideEyes = expr === 'shadowed' || expr === 'menacing-glow';

  for (const side of [-1, 1] as const) {
    const cx = side * 15.5;
    const o = f.open;
    const inner = { x: cx - side * 8, y: cy + 1 };
    const outer = { x: cx + side * 10.5, y: cy - 2.5 };
    const upper = `M${fmt(inner.x)} ${fmt(inner.y)}Q${fmt(cx + side * 1)} ${fmt(cy - 8.5 * o)} ${fmt(outer.x)} ${fmt(outer.y)}`;
    const lower = `Q${fmt(cx + side * 1)} ${fmt(cy + 5.5 * o)} ${fmt(inner.x)} ${fmt(inner.y)}`;
    const eyeShape = `${upper}${lower}Z`;

    if (!hideEyes || !glowEyes) {
      if (!hideEyes) {
        const clipId = defs.add('eyeclip', (id) => `<clipPath id="${id}"><path d="${eyeShape}"/></clipPath>`);
        out += el('path', { d: eyeShape, fill: '#FBFBFD' });
        const irisR = 5.2 * Math.min(1, o + 0.15) * f.iris;
        out += `<g clip-path="url(#${clipId})">`;
        out += el('ellipse', { cx: cx + side * 0.6, cy: cy - 0.8, rx: irisR * 0.92, ry: irisR * 1.08, fill: palette.eyes });
        out += el('ellipse', { cx: cx + side * 0.6, cy: cy + 1.2, rx: irisR * 0.7, ry: irisR * 0.5, fill: lighten(palette.eyes, 0.35), opacity: 0.7 });
        out += el('circle', { cx: cx + side * 0.6, cy: cy - 0.8, r: irisR * 0.42, fill: '#0A0A12' });
        out += el('circle', { cx: cx + side * 0.6 - 1.8, cy: cy - 3, r: Math.max(0.9, irisR * 0.26), fill: '#FFFFFF' });
        out += '</g>';
        // Lash line (thick upper lid with flick at outer corner).
        out += el('path', {
          d: `${upper}L${fmt(outer.x + side * 3)} ${fmt(outer.y - 2.5)}`,
          fill: 'none',
          stroke: ink,
          'stroke-width': lw * 1.5 + 1.4,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        });
        out += el('path', { d: `M${fmt(outer.x)} ${fmt(outer.y)}${lower}`, fill: 'none', stroke: ink, 'stroke-width': lw * 0.6 + 0.4, opacity: 0.6 });
      }
    }

    // Brows.
    const bi = { x: cx - side * 9, y: cy - 13 + f.browInner };
    const bo = { x: cx + side * 11, y: cy - 15 + f.browOuter };
    out += el('path', {
      d: `M${fmt(bi.x)} ${fmt(bi.y)}Q${fmt(cx + side * 1)} ${fmt(Math.min(bi.y, bo.y) - 3)} ${fmt(bo.x)} ${fmt(bo.y)}`,
      fill: 'none',
      stroke: darken(palette.hair, 0.25),
      'stroke-width': lw + 2.2,
      'stroke-linecap': 'round',
    });
  }

  if (!masked) {
    // Nose hint.
    out += el('path', { d: 'M1.5 -521L3.5 -514L-0.5 -513', fill: 'none', stroke: lineInk, 'stroke-width': lw * 0.8 + 0.3, 'stroke-linecap': 'round', opacity: 0.8 });
    // Mouth.
    const m = f.mouth;
    const mouthStroke = { fill: 'none', stroke: lineInk, 'stroke-width': lw + 0.6, 'stroke-linecap': 'round' as const };
    if (m === 'line') out += el('path', { d: 'M-6 -502Q0 -500.5 6 -502', ...mouthStroke });
    else if (m === 'frown') out += el('path', { d: 'M-7 -500Q0 -505 7 -500', ...mouthStroke });
    else if (m === 'smirk') out += el('path', { d: 'M-6 -501Q2 -501 8 -506', ...mouthStroke });
    else if (m === 'open') {
      out += el('path', { d: 'M-5 -505Q0 -509 5 -505Q6 -496 0 -494Q-6 -496 -5 -505Z', fill: darken(palette.skin, 0.7) });
      out += el('path', { d: 'M-3 -497Q0 -495 3 -497', fill: 'none', stroke: '#E57373', 'stroke-width': 1.6 });
    } else if (m === 'grit') {
      out += el('path', { d: 'M-8 -505L8 -505L7 -498L-7 -498Z', fill: '#FFFFFF', stroke: lineInk, 'stroke-width': lw * 0.8 + 0.4 });
      out += el('path', { d: 'M-7.5 -501.5L7.5 -501.5M-3 -505L-3 -498M2 -505L2 -498', stroke: lineInk, 'stroke-width': 0.8 });
    } else if (m === 'grin') {
      out += el('path', { d: 'M-12 -508Q0 -494 12 -508Q0 -500 -12 -508Z', fill: '#F8F8F8', stroke: darken(palette.skin, 0.8), 'stroke-width': 0.9 });
    }
  }

  // Glowing eyes (drawn above any shadow overlay by the caller).
  void glowEyes;
  return out;
}

function glowingEyes(color: string, defs: DefsCollector, profile: boolean): string {
  const filterId = defs.once(`glow-eyes-${color}`, 'eyeglow', (id) => glowFilter(id, 2.6, color, 1));
  const eye = (cx: number, side: number) =>
    poly([
      { x: cx - side * 9, y: -530 },
      { x: cx + side * 1, y: -535.5 },
      { x: cx + side * 11, y: -537 },
      { x: cx + side * 3, y: -530 },
    ]);
  const d = profile ? eye(26, 1) : `${eye(-15.5, -1)}${eye(15.5, 1)}`;
  return `<g filter="url(#${filterId})">${el('path', { d, fill: lighten(color, 0.55) })}${el('path', { d, fill: color, opacity: 0.85 })}</g>`;
}

function profileFace(palette: CharacterPalette, expr: Expression, lw: number): string {
  const f = EXPRESSIONS[expr];
  const ink = darken(palette.hair, 0.55);
  const lineInk = darken(palette.skin, 0.62);
  let out = '';
  if (expr !== 'shadowed' && expr !== 'menacing-glow') {
    const o = f.open;
    out += el('path', { d: `M19 -530Q25 ${fmt(-536 - 4 * o)} 32 -534Q28 ${fmt(-528 + 2 * o)} 19 -530Z`, fill: '#FBFBFD' });
    out += el('ellipse', { cx: 28.5, cy: -532, rx: 2.6, ry: 3.6 * Math.min(1, o + 0.1), fill: palette.eyes });
    out += el('path', { d: `M17 -531Q25 ${fmt(-537 - 4 * o)} 33 -534`, fill: 'none', stroke: ink, 'stroke-width': lw * 1.4 + 1.2, 'stroke-linecap': 'round' });
  }
  out += el('path', { d: `M16 ${fmt(-545 + f.browInner * 0.5)}Q26 -550 36 ${fmt(-546 + f.browOuter * 0.4)}`, fill: 'none', stroke: darken(palette.hair, 0.25), 'stroke-width': lw + 2, 'stroke-linecap': 'round' });
  out += el('path', { d: f.mouth === 'smirk' ? 'M32 -503Q37 -503 40 -507' : 'M33 -503L40 -503', fill: 'none', stroke: lineInk, 'stroke-width': lw + 0.5, 'stroke-linecap': 'round' });
  return out;
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

export interface FigureRenderContext {
  box: PanelBox;
  defs: DefsCollector;
  character: Character;
  /** Theme accent used as default rim light. */
  defaultRim: string;
  seed: number;
}

export function renderCharacterFigure(layer: CharacterFigureLayer, ctx: FigureRenderContext): string {
  const { box, defs, character } = ctx;
  const palette = character.palette;
  const outfit = outfitFor(character.silhouettePreset);
  const prng = createPrng(`${ctx.seed}-${character.id}`);
  const sk = skeletonFor(layer.pose);
  const crop = FRAMING_CROP[layer.framing];

  // Scale: fit crop height into the panel, honor layer.scale, keep heads sane.
  let s = ((crop.fill * box.height) / (crop.bottom - crop.top)) * layer.scale;
  if (layer.framing === 'eyes-only' || layer.framing === 'close-up') {
    s = Math.min(s, ((box.width * 1.25) / 100) * layer.scale);
  }
  const lw = 2.4 / s + 0.35; // ink line width in local units (~2.4px on screen)
  const anchor = pctPoint(box, layer.position);
  const flip = layer.flipX ? -1 : 1;
  const transform = `translate(${fmt(anchor.x)} ${fmt(anchor.y)}) scale(${fmt(s * flip)} ${fmt(s)}) translate(0 ${fmt(-crop.bottom)})`;

  const isEntity = outfit.entity;
  const away = layer.pose === 'facing-away';
  const profile = layer.pose === 'dramatic-profile';
  const rim = layer.rimLightColor ?? (isEntity ? palette.aura : ctx.defaultRim);

  // Palette derivations.
  const skin = isEntity ? '#07060C' : palette.skin;
  const outfitMain = isEntity ? '#07060C' : palette.outfitPrimary;
  const pants = isEntity ? '#07060C' : darken(palette.outfitPrimary, 0.35);
  const shoes = isEntity ? '#07060C' : darken(palette.outfitPrimary, 0.7);
  const hair = isEntity ? '#07060C' : palette.hair;
  const accent = palette.outfitAccent;

  const upperShift = sk.hip.y - REF_HIP_Y;
  const upperTransform = `translate(${fmt(sk.hip.x)} ${fmt(upperShift)}) rotate(${fmt(sk.lean)} 0 ${REF_HIP_Y})`;

  // ---- Parts -------------------------------------------------------------
  const backLayer: Part[] = []; // global coords, behind everything (legs, robe back)
  const legParts: Part[] = [];
  const upperBack: Part[] = []; // upper-body coords, behind torso
  const upperParts: Part[] = []; // upper-body coords
  const upperFront: Part[] = []; // upper-body coords, after head (hood front, hat)

  // Legs.
  const legW = outfit.gi ? [54, 46, 34] : [46, 36, 25];
  if (!outfit.robe) {
    legParts.push({ d: limbPath(sk.legBack, legW), fill: darken(pants, 0.12) });
    legParts.push({ d: limbPath(sk.legFront, legW), fill: pants });
  }
  for (const leg of [sk.legBack, sk.legFront]) {
    const a = leg[2];
    const dir = leg === sk.legFront ? 1 : -1;
    legParts.push({ d: ellipsePath({ x: a.x + dir * 8, y: a.y + 4 }, 22, 11), fill: shoes });
  }
  // Pelvis.
  if (!outfit.robe) {
    const h = sk.hip;
    legParts.push({
      d: poly([
        { x: h.x - 60, y: h.y - 14 },
        { x: h.x + 60, y: h.y - 14 },
        { x: h.x + 58, y: h.y + 26 },
        { x: h.x, y: h.y + 42 },
        { x: h.x - 58, y: h.y + 26 },
      ]),
      fill: pants,
    });
  }
  // Long coats & robes (global coords, follow hip).
  if (outfit.robe || outfit.coat) {
    const h = sk.hip;
    const hemY = outfit.robe ? -6 : -118;
    const spread = layer.pose === 'action-lunge' ? 70 : layer.pose === 'crouching' ? 40 : 20;
    const robeD =
      `M${fmt(h.x - 62)} ${fmt(h.y - 20)}L${fmt(h.x + 62)} ${fmt(h.y - 20)}` +
      `C${fmt(h.x + 74)} ${fmt(h.y + 60)} ${fmt(h.x + 92 + spread)} ${fmt(hemY - 60)} ${fmt(h.x + 100 + spread)} ${fmt(hemY)}` +
      `Q${fmt(h.x + 50)} ${fmt(hemY + 12)} ${fmt(h.x)} ${fmt(hemY + 4)}` +
      `Q${fmt(h.x - 50)} ${fmt(hemY + 12)} ${fmt(h.x - 100 - spread)} ${fmt(hemY)}` +
      `C${fmt(h.x - 92 - spread)} ${fmt(hemY - 60)} ${fmt(h.x - 74)} ${fmt(h.y + 60)} ${fmt(h.x - 62)} ${fmt(h.y - 20)}Z`;
    legParts.push({ d: robeD, fill: outfit.robe ? outfitMain : darken(outfitMain, 0.05) });
    if (outfit.robe) {
      legParts.push({
        d: `M${fmt(h.x - 96 - spread)} ${fmt(hemY - 4)}Q${fmt(h.x)} ${fmt(hemY + 14)} ${fmt(h.x + 96 + spread)} ${fmt(hemY - 4)}L${fmt(h.x + 100 + spread)} ${fmt(hemY)}Q${fmt(h.x + 50)} ${fmt(hemY + 12)} ${fmt(h.x)} ${fmt(hemY + 4)}Q${fmt(h.x - 50)} ${fmt(hemY + 12)} ${fmt(h.x - 100 - spread)} ${fmt(hemY)}Z`,
        fill: accent,
        noStroke: true,
      });
      legParts.push({ d: `M${fmt(h.x - 3)} ${fmt(h.y - 20)}L${fmt(h.x + 3)} ${fmt(h.y - 20)}L${fmt(h.x + 4)} ${fmt(hemY + 2)}L${fmt(h.x - 4)} ${fmt(hemY + 2)}Z`, fill: accent, noStroke: true, body: false });
    }
  }

  // Scarf (behind upper body).
  if (outfit.scarf) {
    const tail = layer.pose === 'action-lunge' ? -1 : -0.6;
    upperBack.push({
      d: `M-18 -474C-60 -470 ${fmt(-120 * -tail - 40)} -470 ${fmt(-220 * -tail)} -430C${fmt(-180 * -tail)} -446 ${fmt(-120 * -tail)} -448 -60 -452C${fmt(-150 * -tail)} -420 ${fmt(-200 * -tail)} -400 ${fmt(-250 * -tail)} -392C${fmt(-160 * -tail)} -404 -80 -430 -10 -456Z`,
      fill: accent,
    });
  }
  // Hood back.
  if (outfit.hood) {
    upperBack.push({
      d: away
        ? 'M-58 -470C-70 -540 -50 -618 0 -622C50 -618 70 -540 58 -470Z'
        : 'M-62 -468C-74 -540 -48 -620 4 -624C56 -620 74 -540 62 -468Z',
      fill: darken(outfitMain, 0.25),
    });
  }
  if (!outfit.hood) {
    const hb = hairBack(outfit.hair, layer.pose);
    if (hb) upperBack.push({ d: hb, fill: darken(hair, 0.15) });
  }

  // Arms.
  const armW = outfit.robe ? [34, 36, 40] : outfit.armor ? [36, 32, 28] : [28, 24, 19];
  const sleeveColor = outfit.gi ? lighten(outfitMain, 0.05) : outfitMain;
  const armPart = (arm: [P, P, P], shade: number): Part[] => {
    const parts: Part[] = [];
    const sleeveEnd = outfit.gi ? lerp(arm[1], arm[2], 0.15) : outfit.robe ? lerp(arm[1], arm[2], 0.85) : lerp(arm[1], arm[2], 0.82);
    if (outfit.gi) {
      parts.push({ d: limbPath([arm[1], arm[2]], [22, 18]), fill: darken(skin, shade) });
    }
    parts.push({ d: limbPath([arm[0], arm[1], sleeveEnd], armW), fill: darken(sleeveColor, shade) });
    // Hand.
    parts.push({ d: circlePath(arm[2], outfit.armor ? 15 : 12), fill: outfit.armor ? darken(lighten(outfitMain, 0.25), shade) : darken(skin, shade) });
    if (outfit.armor) parts.push({ d: limbPath([lerp(arm[1], arm[2], 0.3), lerp(arm[1], arm[2], 0.85)], [30, 26]), fill: darken(lighten(outfitMain, 0.3), shade) });
    if (outfit.neonLines)
      parts.push({ d: limbPath([lerp(arm[0], arm[1], 0.2), arm[1], lerp(arm[1], arm[2], 0.7)], [4, 4, 4]), fill: accent, noStroke: true, body: false, attrs: { 'data-neon': 1 } });
    return parts;
  };
  if (sk.backArmBehind) upperBack.push(...armPart(sk.armBack, 0.18));

  // Neck + torso.
  upperParts.push({ d: 'M-12 -505L12 -505L15 -466L-15 -466Z', fill: darken(skin, 0.12) });
  upperParts.push({ d: torsoPath(sk.shoulderHalf), fill: outfitMain });

  const sh = sk.shoulderHalf / 78;
  if (outfit.blazer) {
    upperParts.push({ d: `M-14 -472L14 -472L0 -400Z`, fill: '#F4F4F5' });
    upperParts.push({ d: `M-4 -466L4 -466L6 -380L0 -368L-6 -380Z`, fill: accent });
    upperParts.push({ d: `M-16 -472L${fmt(-34 * sh)} -460L-8 -392L0 -400Z`, fill: darken(outfitMain, 0.2) });
    upperParts.push({ d: `M16 -472L${fmt(34 * sh)} -460L8 -392L0 -400Z`, fill: darken(outfitMain, 0.2) });
  }
  if (outfit.gi) {
    upperParts.push({ d: `M-16 -472L24 -360L12 -352L-24 -462Z`, fill: darken(outfitMain, 0.15) });
    upperParts.push({ d: `M16 -472L-20 -380L-26 -390L8 -470Z`, fill: darken(skin, 0.15) });
    upperParts.push({ d: `M${fmt(-52 * sh)} -316L${fmt(52 * sh)} -316L${fmt(54 * sh)} -296L${fmt(-54 * sh)} -296Z`, fill: accent });
    upperParts.push({ d: `M10 -300L22 -250L12 -248L4 -298ZM-4 -298L-14 -246L-24 -250L-12 -300Z`, fill: accent });
  }
  if (outfit.coat) {
    upperParts.push({ d: `M-16 -472L${fmt(-50 * sh)} -458L-30 -360L-6 -420Z`, fill: darken(outfitMain, 0.22) });
    upperParts.push({ d: `M16 -472L${fmt(50 * sh)} -458L30 -360L6 -420Z`, fill: darken(outfitMain, 0.22) });
    upperParts.push({ d: `M${fmt(-56 * sh)} -306L${fmt(56 * sh)} -306L${fmt(56 * sh)} -290L${fmt(-56 * sh)} -290Z`, fill: darken(outfitMain, 0.4) });
    upperParts.push({ d: `M-8 -308L8 -308L8 -288L-8 -288Z`, fill: accent, noStroke: true });
  }
  if (outfit.armor) {
    const metal = lighten(outfitMain, 0.25);
    upperParts.push({ d: `M${fmt(-58 * sh)} -456Q0 -478 ${fmt(58 * sh)} -456L${fmt(48 * sh)} -340Q0 -322 ${fmt(-48 * sh)} -340Z`, fill: metal });
    upperParts.push({ d: `M0 -440L12 -410L0 -372L-12 -410Z`, fill: accent });
    upperParts.push({ d: `M${fmt(-54 * sh)} -320L${fmt(54 * sh)} -320L${fmt(56 * sh)} -300L${fmt(-56 * sh)} -300Z`, fill: darken(outfitMain, 0.35) });
  }
  if (outfit.robe) {
    upperParts.push({ d: `M-4 -470L4 -470L4 -260L-4 -260Z`, fill: accent, noStroke: true, body: false });
    upperParts.push({ d: `M-16 -472Q0 -440 16 -472L22 -466Q0 -426 -22 -466Z`, fill: accent });
  }
  if (outfit.neonLines) {
    upperParts.push({ d: `M-40 -455L-30 -380L-44 -300L-40 -300L-26 -380L-36 -455Z`, fill: accent, noStroke: true, body: false, attrs: { 'data-neon': 1 } });
    upperParts.push({ d: `M40 -455L30 -380L44 -300L40 -300L26 -380L36 -455Z`, fill: accent, noStroke: true, body: false, attrs: { 'data-neon': 1 } });
  }

  // Front arms (pauldrons on top).
  if (!sk.backArmBehind) upperParts.push(...armPart(sk.armBack, 0.12));
  upperParts.push(...armPart(sk.armFront, 0));
  if (outfit.armor) {
    const metal = lighten(outfitMain, 0.32);
    upperParts.push({ d: ellipsePath({ x: -72 * sh, y: -452 }, 34, 24), fill: metal });
    upperParts.push({ d: ellipsePath({ x: 72 * sh, y: -452 }, 34, 24), fill: metal });
  }

  // Head.
  const headParts: Part[] = [];
  if (!away && !profile) {
    headParts.push({ d: ellipsePath({ x: -41, y: -528 }, 5.5, 11), fill: darken(skin, 0.08) });
    headParts.push({ d: ellipsePath({ x: 41, y: -528 }, 5.5, 11), fill: darken(skin, 0.08) });
  }
  if (profile) headParts.push({ d: ellipsePath({ x: -6, y: -528 }, 7, 11), fill: darken(skin, 0.08) });
  headParts.push({ d: profile ? FACE_PROFILE : FACE_FRONT, fill: skin });
  if (isEntity) {
    // Horns.
    headParts.push({ d: 'M-30 -570C-46 -600 -62 -620 -78 -648C-58 -628 -40 -616 -20 -584Z', fill: '#07060C' });
    headParts.push({ d: 'M30 -570C46 -600 62 -620 78 -648C58 -628 40 -616 20 -584Z', fill: '#07060C' });
  }

  // Front hair / hood / hat.
  if (!outfit.hood && !outfit.hat) {
    const hf = hairFront(outfit.hair, layer.pose, prng.fork('hair'));
    if (hf) upperFront.push({ d: hf, fill: hair });
  } else if (outfit.hat) {
    const hf = hairFront('short', layer.pose, prng.fork('hair'));
    if (hf) upperFront.push({ d: hf, fill: hair });
    upperFront.push({ d: 'M-74 -566Q0 -590 74 -566Q60 -556 0 -566Q-60 -556 -74 -566Z', fill: darken(outfitMain, 0.45) });
    upperFront.push({ d: 'M-40 -568C-44 -610 -30 -628 0 -630C30 -628 44 -610 40 -568Q0 -580 -40 -568Z', fill: darken(outfitMain, 0.4) });
    upperFront.push({ d: 'M-41 -578Q0 -590 41 -578L40 -568Q0 -580 -40 -568Z', fill: accent, noStroke: true });
  }
  if (outfit.hood && !away) {
    // Fringe peeking out, then hood rim.
    upperFront.push({ d: 'M-36 -552L-26 -572L-14 -556L-4 -576L8 -556L20 -572L32 -552L36 -566Q0 -600 -36 -566Z', fill: hair });
    upperFront.push({
      d: 'M-62 -468C-74 -540 -48 -620 4 -624C56 -620 74 -540 62 -468L46 -470C52 -530 38 -588 0 -590C-38 -588 -52 -530 -46 -470Z',
      fill: darken(outfitMain, 0.05),
    });
  } else if (outfit.hood && away) {
    // Solid back of hood with center drape fold.
    upperFront.push({
      d: 'M-58 -470C-70 -540 -50 -618 0 -622C50 -618 70 -540 58 -470Q0 -454 -58 -470Z',
      fill: outfitMain,
    });
    upperFront.push({
      d: 'M-2 -620Q-14 -548 -6 -466L6 -466Q14 -548 2 -620Z',
      fill: darken(outfitMain, 0.2),
      noStroke: true,
      body: false,
    });
  }
  if (outfit.headband && !away) {
    upperFront.push({ d: 'M-46 -556Q0 -572 46 -556L46 -546Q0 -562 -46 -546Z', fill: accent });
    upperFront.push({ d: 'M-44 -552C-70 -550 -92 -536 -118 -520C-96 -540 -76 -548 -60 -556C-84 -556 -104 -548 -128 -544C-100 -558 -70 -562 -44 -556Z', fill: accent });
  }
  if (outfit.mask && !away) {
    upperFront.push({ d: profile ? 'M10 -522L50 -520L44 -500C30 -486 10 -484 -6 -492L-8 -516Z' : 'M-41 -524Q0 -516 41 -524C40 -508 30 -492 0 -484C-30 -492 -40 -508 -41 -524Z', fill: darken(outfitMain, 0.3) });
    upperFront.push({ d: profile ? 'M12 -516L48 -516L47 -513L12 -513Z' : 'M-34 -516Q0 -510 34 -516L33 -513Q0 -507 -33 -513Z', fill: accent, noStroke: true, body: false, attrs: { 'data-neon': 1 } });
  }

  // ---- Defs -------------------------------------------------------------
  const shadeId = defs.add('figshade', (id) =>
    linearGradient(
      id,
      [
        { offset: 0, color: '#000000', opacity: 0 },
        { offset: 0.55, color: '#000000', opacity: 0.05 },
        { offset: 1, color: '#000000', opacity: 0.5 },
      ],
      0,
      'userSpaceOnUse',
      { x1: -40, y1: 0, x2: 110, y2: 0 },
    ),
  );
  const neonId = defs.once(`neon-${accent}`, 'neon', (id) => glowFilter(id, 3, accent, 1));

  // ---- Assemble ---------------------------------------------------------
  const ink = isEntity ? '#000000' : darken(outfitMain, 0.75);
  const renderBase = (parts: Part[]) =>
    parts
      .map((p) => {
        const neon = p.attrs?.['data-neon'] !== undefined;
        return el('path', {
          d: p.d,
          fill: p.fill,
          stroke: p.noStroke ? undefined : ink,
          'stroke-width': p.noStroke ? undefined : lw,
          'stroke-linejoin': 'round',
          filter: neon ? `url(#${neonId})` : undefined,
        });
      })
      .join('');
  const renderRim = (parts: Part[]) =>
    parts
      .filter((p) => p.body !== false)
      .map((p) => el('path', { d: p.d, fill: rim }))
      .join('');
  const renderShade = (parts: Part[]) =>
    parts
      .filter((p) => p.body !== false)
      .map((p) => el('path', { d: p.d, fill: `url(#${shadeId})` }))
      .join('');

  const upperAll = [...upperBack, ...upperParts];
  const rimOffset = 4.5 / s;
  const rimPass =
    `<g transform="translate(${fmt(-rimOffset * flip)} ${fmt(-rimOffset * 0.6)})" opacity="0.95">` +
    renderRim([...backLayer, ...legParts]) +
    `<g transform="${upperTransform}">${renderRim([...upperAll, ...headParts, ...upperFront])}</g></g>`;

  // Face details.
  let face = '';
  const masked = outfit.mask;
  if (!away && !isEntity) {
    face = profile ? profileFace(palette, layer.expression, lw) : frontFace(palette, layer.expression, layer.glowEyes, defs, lw, masked);
  }

  // Shadow overlays on the face (filled directly onto the face shape without nested clipPath).
  let faceOverlay = '';
  if (!away && (layer.expression === 'shadowed' || layer.expression === 'menacing-glow' || outfit.hood)) {
    const strong = layer.expression === 'shadowed' || layer.expression === 'menacing-glow';
    const gradId = defs.add('faceshadow', (id) =>
      linearGradient(
        id,
        [
          { offset: 0, color: darken(outfitMain, 0.85), opacity: strong ? 0.94 : 0.7 },
          { offset: strong ? (layer.expression === 'menacing-glow' ? 0.85 : 0.52) : 0.3, color: darken(outfitMain, 0.85), opacity: strong ? 0.9 : 0.35 },
          { offset: strong ? (layer.expression === 'menacing-glow' ? 1 : 0.62) : 0.45, color: darken(outfitMain, 0.85), opacity: 0 },
        ],
        90,
        'userSpaceOnUse',
        { x1: 0, y1: -590, x2: 0, y2: -484 },
      ),
    );
    faceOverlay = el('path', { d: profile ? FACE_PROFILE : FACE_FRONT, fill: `url(#${gradId})` });
  }
  let eyesGlow = '';
  const wantsGlow = layer.glowEyes || layer.expression === 'menacing-glow' || isEntity;
  if (!away && wantsGlow) {
    eyesGlow = glowingEyes(isEntity || layer.expression === 'menacing-glow' ? palette.aura : palette.eyes, defs, profile);
  }

  // Aura (entities and menacing figures).
  let aura = '';
  if (isEntity || layer.expression === 'menacing-glow') {
    const auraId = defs.add('aura', (id) =>
      radialGradient(id, [
        { offset: 0, color: palette.aura, opacity: 0.55 },
        { offset: 0.6, color: palette.aura, opacity: 0.18 },
        { offset: 1, color: palette.aura, opacity: 0 },
      ]),
    );
    aura = el('ellipse', { cx: 0, cy: -330, rx: 230, ry: 380, fill: `url(#${auraId})` });
  }
  // Entity wisps.
  let wisps = '';
  if (isEntity) {
    const wp = prng.fork('wisps');
    const blurId = defs.add('wispblur', (id) => blurFilter(id, 3));
    let d = '';
    for (let i = 0; i < 22; i++) {
      const y = wp.range(-560, -20);
      const side = wp.chance(0.5) ? -1 : 1;
      const x0 = side * wp.range(30, 80);
      const len = wp.range(40, 120);
      const w = wp.range(10, 22);
      d += `M${fmt(x0)} ${fmt(y)}Q${fmt(x0 + side * len * 0.6)} ${fmt(y - len * 0.3)} ${fmt(x0 + side * len)} ${fmt(y - len * 0.9)}Q${fmt(x0 + side * len * 0.3)} ${fmt(y - len * 0.2)} ${fmt(x0)} ${fmt(y + w)}Z`;
    }
    wisps = `<path d="${d}" fill="#07060C"/><path d="${d}" fill="${palette.aura}" opacity="0.35" filter="url(#${blurId})"/>`;
  }

  const body =
    aura +
    rimPass +
    wisps +
    renderBase([...backLayer, ...legParts]) +
    renderShade([...backLayer, ...legParts]) +
    `<g transform="${upperTransform}">` +
    renderBase(upperAll) +
    renderShade(upperAll) +
    renderBase(headParts) +
    renderShade(headParts.slice(-1)) +
    face +
    faceOverlay +
    renderBase(upperFront) +
    renderShade(upperFront.filter((p) => p.body !== false)) +
    eyesGlow +
    '</g>';

  return `<g transform="${transform}" data-character="${character.id}">${body}</g>`;
}

/** Exposed for tests/docs: local crop table. */
export const FIGURE_FRAMING = FRAMING_CROP;
