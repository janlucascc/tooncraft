import type { Character, SilhouettePreset } from '../schema/character.js';
import type { CharacterFigureLayer, Framing, Pose } from '../schema/visual-layer.js';
import {
  type DefsCollector,
  type PanelBox,
  blurFilter,
  darken,
  el,
  fmt,
  glowFilter,
  lighten,
  linearGradient,
  pctPoint,
  radialGradient,
} from '../components/svg-utils.js';
import { sanitizeSvgMarkup } from '../components/scenes/svg-sanitizer.js';
import { createPrng } from '../engine/prng.js';
import {
  MANHWA_FACE_FRONT,
  MANHWA_FACE_PROFILE,
  type P,
  poly,
  renderAnimeEars,
  renderAnimeFaceFront,
  renderAnimeFaceProfile,
  renderAnimeGlowingEyes,
  renderAnimeHairBack,
  renderAnimeHairFront,
  renderBoneNecklace,
  renderFaceCelShading,
  renderFurCollarAccessory,
  renderNeckAndCollarCelShade,
  renderPrimitiveHunterOutfit,
  renderTorsoClothingFolds,
  renderWeaponProp,
  resolveHairStyle,
} from './anime-features.js';

/**
 * Procedural, High-Fidelity Cel-Shaded Anime/Manhwa Character Engine.
 *
 * Figures are drawn in a local coordinate system (feet at y=0, head top at
 * about y=-610, x centered on 0) from a posable skeleton, then cropped/scaled
 * by `framing` and anchored at `position` (bottom-center of the crop).
 *
 * Rendering passes:
 *   aura → rim light → wisps → back hair & cape → legs & lower body →
 *   upper torso & clothing folds → neck cel-shading → ears & V-jaw head →
 *   facial cel-shading → 6-layer anime eyes & mouth → front hair clumps +
 *   angel-ring shine → accessories & weapon props → Pass-2 detailOverlaySvg →
 *   dramatic shadow overlays & glowing eye trails.
 */

interface Part {
  d: string;
  fill: string;
  /** Participates in rim-light and shade passes (default true). */
  body?: boolean;
  /** Extra raw attributes for the base pass. */
  attrs?: Record<string, string | number | undefined>;
  /** Skip the ink outline. */
  noStroke?: boolean;
  /** Override stroke color (detail lines drawn on top, e.g. finger grooves). */
  stroke?: string;
  /** Stroke width used when `stroke` is set (local units). */
  strokeWidth?: number;
}

/** Local-space crop per framing: [top, bottom] and fraction of panel height to fill. */
const FRAMING_CROP: Record<Framing, { top: number; bottom: number; fill: number }> = {
  'full-body': { top: -632, bottom: 12, fill: 0.88 },
  'waist-up': { top: -632, bottom: -278, fill: 0.96 },
  bust: { top: -626, bottom: -385, fill: 0.97 },
  'close-up': { top: -614, bottom: -452, fill: 0.98 },
  'eyes-only': { top: -558, bottom: -508, fill: 1 },
};

const REF_HIP_Y = -262;

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
        armBack: [{ x: -76, y: -452 }, { x: -142, y: -385 }, { x: -196, y: -330 }],
        armFront: [{ x: 76, y: -452 }, { x: 172, y: -468 }, { x: 262, y: -478 }],
        legBack: [{ x: -28, y: -215 }, { x: -98, y: -112 }, { x: -168, y: -16 }],
        legFront: [{ x: 28, y: -215 }, { x: 108, y: -142 }, { x: 122, y: -16 }],
        backArmBehind: true,
        shoulderHalf: 80,
      };
    case 'power-awakening':
      return {
        hip: { x: 0, y: -245 },
        lean: -4,
        armBack: [{ x: -78, y: -452 }, { x: -142, y: -395 }, { x: -178, y: -315 }],
        armFront: [{ x: 78, y: -452 }, { x: 142, y: -395 }, { x: 178, y: -315 }],
        legBack: [{ x: -34, y: -245 }, { x: -58, y: -125 }, { x: -74, y: -14 }],
        legFront: [{ x: 34, y: -245 }, { x: 58, y: -125 }, { x: 74, y: -14 }],
        backArmBehind: false,
        shoulderHalf: 82,
      };
    case 'crouching':
      return {
        hip: { x: 0, y: -150 },
        lean: 9,
        armBack: [{ x: -76, y: -452 }, { x: -102, y: -362 }, { x: -112, y: -275 }],
        armFront: [{ x: 76, y: -452 }, { x: 114, y: -372 }, { x: 92, y: -300 }],
        legBack: [{ x: -28, y: -150 }, { x: -72, y: -112 }, { x: -44, y: -16 }],
        legFront: [{ x: 28, y: -150 }, { x: 84, y: -176 }, { x: 74, y: -16 }],
        backArmBehind: false,
        shoulderHalf: 80,
      };
    case 'dramatic-profile':
      return {
        hip: { x: 0, y: REF_HIP_Y },
        lean: 2,
        armBack: [{ x: -52, y: -452 }, { x: -72, y: -348 }, { x: -56, y: -246 }],
        armFront: [{ x: 52, y: -452 }, { x: 72, y: -348 }, { x: 56, y: -246 }],
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
        // Natural A-pose: elbows bow slightly outward, fists rest beside the hips.
        armBack: [{ x: -76, y: -452 }, { x: -98, y: -348 }, { x: -80, y: -246 }],
        armFront: [{ x: 76, y: -452 }, { x: 98, y: -348 }, { x: 80, y: -246 }],
        legBack: [{ x: -30, y: REF_HIP_Y }, { x: -34, y: -135 }, { x: -38, y: -14 }],
        legFront: [{ x: 30, y: REF_HIP_Y }, { x: 34, y: -135 }, { x: 38, y: -14 }],
        backArmBehind: false,
        shoulderHalf: 80,
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
  d += `A${fmt(wEnd)} ${fmt(wEnd)} 0 0 0 ${fmt(right[n - 1]!.x)} ${fmt(right[n - 1]!.y)}`;
  for (let i = n - 2; i >= 0; i--) d += `L${fmt(right[i]!.x)} ${fmt(right[i]!.y)}`;
  d += `A${fmt(wStart)} ${fmt(wStart)} 0 0 0 ${fmt(left[0]!.x)} ${fmt(left[0]!.y)}Z`;
  return d;
}

/** Outward tilt (deg) applied to every fist so hanging hands angle away from the body. */
const HAND_TILT_DEG = -12;

/** Mirror + rotate a local hand-space point around the wrist center. */
function handPoint(local: P, c: P, r: number, side: number, tiltDeg: number = HAND_TILT_DEG): P {
  const a = (tiltDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return {
    x: c.x + side * (local.x * cos - local.y * sin) * r,
    y: c.y + (local.x * sin + local.y * cos) * r,
  };
}

/**
 * Stylized closed fist: palm mass, thumb capsule on the inner side and two
 * knuckle grooves at the bottom — sculpted enough to still read as a hand at
 * small render scales (the previous hexagon blob collapsed into a ball).
 */
function sculptedHandPath(c: P, r: number, side: number): string {
  const outline: P[] = [
    { x: -0.78, y: -1.02 }, // wrist (back of hand)
    { x: 0.62, y: -0.98 }, // knuckle ridge
    { x: 1.08, y: -0.3 }, // fingertip (back edge)
    { x: 1.02, y: 0.58 }, // fingertip (front edge)
    { x: 0.42, y: 0.34 }, // groove between fingers
    { x: 0.08, y: 0.92 }, // palm-base groove
    { x: -0.5, y: 0.62 }, // heel
    { x: -0.88, y: -0.12 }, // thumb base (inner side)
    { x: -1.22, y: -0.5 }, // thumb tip
    { x: -1.02, y: -0.8 }, // thumb base (upper)
  ];
  return poly(outline.map((p) => handPoint(p, c, r, side)));
}

/** Finger/knuckle grooves stroked over the fist (never receives rim/shade passes). */
function handDetailPath(c: P, r: number, side: number): string {
  const lines: P[][] = [
    [
      { x: -0.55, y: 0.5 },
      { x: 0.78, y: 0.42 },
    ], // groove across the fingers
    [
      { x: -0.3, y: 0.05 },
      { x: 0.95, y: -0.02 },
    ], // secondary groove
    [
      { x: -0.6, y: -0.82 },
      { x: 0.95, y: -0.62 },
    ], // knuckle ridge line
  ];
  return lines
    .map((line) => {
      const p1 = handPoint(line[0]!, c, r, side);
      const p2 = handPoint(line[1]!, c, r, side);
      return `M${fmt(p1.x)} ${fmt(p1.y)}L${fmt(p2.x)} ${fmt(p2.y)}`;
    })
    .join('');
}

const ellipsePath = (c: P, rx: number, ry: number) =>
  `M${fmt(c.x - rx)} ${fmt(c.y)}a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(rx * 2)} 0a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(-rx * 2)} 0Z`;

function lerp(a: P, b: P, t: number): P {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// ---------------------------------------------------------------------------
// Outfit configuration
// ---------------------------------------------------------------------------

interface OutfitStyle {
  hood: boolean;
  robe: boolean;
  coat: boolean;
  mask: boolean;
  armor: boolean;
  blazer: boolean;
  gi: boolean;
  primitive: boolean;
  hat: boolean;
  scarf: boolean;
  headband: boolean;
  neonLines: boolean;
  entity: boolean;
}

function outfitFor(preset: SilhouettePreset): OutfitStyle {
  const none: OutfitStyle = {
    hood: false,
    robe: false,
    coat: false,
    mask: false,
    armor: false,
    blazer: false,
    gi: false,
    primitive: false,
    hat: false,
    scarf: false,
    headband: false,
    neonLines: false,
    entity: false,
  };
  switch (preset) {
    case 'hooded-mage':
      return { ...none, hood: true, robe: true };
    case 'armored-knight':
      return { ...none, armor: true };
    case 'cyber-assassin':
      return { ...none, hood: true, mask: true, scarf: true, neonLines: true };
    case 'casual-student':
      return { ...none, blazer: true };
    case 'suit-detective':
      return { ...none, coat: true, hat: true };
    case 'martial-artist':
      return { ...none, gi: true, headband: true };
    case 'primitive-hunter':
      return { ...none, primitive: true, headband: true };
    case 'shadow-entity':
      return { ...none, entity: true };
    case 'none':
    default:
      return none;
  }
}

function torsoPath(half: number): string {
  const k = half / 78;
  const x = (v: number) => fmt(v * k);
  return (
    `M${x(-14)} -472C${x(-42)} -470 ${x(-72)} -468 ${x(-82)} -454` +
    `C${x(-90)} -432 ${x(-80)} -402 ${x(-70)} -382C${x(-62)} -352 ${x(-52)} -322 ${x(-50)} -302` +
    `C${x(-54)} -286 ${x(-60)} -274 ${x(-60)} -258L${x(60)} -258` +
    `C${x(60)} -274 ${x(54)} -286 ${x(50)} -302C${x(52)} -322 ${x(62)} -352 ${x(70)} -382` +
    `C${x(80)} -402 ${x(90)} -432 ${x(82)} -454C${x(72)} -468 ${x(42)} -470 ${x(14)} -472Z`
  );
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
  const hairStyle = resolveHairStyle(character.hairStyle, character.silhouettePreset);
  const accessories = character.accessories ?? [];
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
  const shading = layer.shadingIntensity ?? 'standard';
  const lightDir = layer.lightDirection ?? 'left';

  // Palette derivations.
  const skin = isEntity ? '#07060C' : palette.skin;
  const outfitMain = isEntity ? '#07060C' : palette.outfitPrimary;
  const pants = isEntity ? '#07060C' : outfit.primitive ? darken(skin, 0.05) : darken(palette.outfitPrimary, 0.35);
  const shoes = isEntity ? '#07060C' : darken(palette.outfitPrimary, 0.7);
  const hair = isEntity ? '#07060C' : palette.hair;
  const accent = palette.outfitAccent;
  const ink = isEntity ? '#000000' : darken(outfitMain, 0.78);

  const upperShift = sk.hip.y - REF_HIP_Y;
  const upperTransform = `translate(${fmt(sk.hip.x)} ${fmt(upperShift)}) rotate(${fmt(sk.lean)} 0 ${REF_HIP_Y})`;

  // ---- Parts -------------------------------------------------------------
  const backLayer: Part[] = [];
  const legParts: Part[] = [];
  const upperBack: Part[] = [];
  const upperParts: Part[] = [];
  const upperFront: Part[] = [];

  // Legs.
  const legW = outfit.gi ? [54, 46, 34] : [46, 36, 22];
  if (!outfit.robe) {
    legParts.push({ d: limbPath(sk.legBack, legW), fill: darken(pants, 0.14) });
    legParts.push({ d: limbPath(sk.legFront, legW), fill: pants });
    // Shin wraps for primitive hunter or martial artist
    if (outfit.primitive || outfit.gi) {
      for (const leg of [sk.legBack, sk.legFront]) {
        const shinTop = lerp(leg[1], leg[2], 0.35);
        legParts.push({
          d: limbPath([shinTop, leg[2]], [30, 24]),
          fill: darken(outfitMain, 0.25),
        });
      }
    }
  }
  for (const leg of [sk.legBack, sk.legFront]) {
    const a = leg[2];
    const dir = leg === sk.legFront ? 1 : -1;
    legParts.push({ d: ellipsePath({ x: a.x + dir * 8, y: a.y + 4 }, 22, 11), fill: shoes });
  }
  // Pelvis / Loincloth.
  if (!outfit.robe) {
    const h = sk.hip;
    if (outfit.primitive) {
      // Jagged beast-hide loincloth skirt
      legParts.push({
        d: poly([
          { x: h.x - 62, y: h.y - 16 },
          { x: h.x + 62, y: h.y - 16 },
          { x: h.x + 68, y: h.y + 52 },
          { x: h.x + 42, y: h.y + 34 },
          { x: h.x + 18, y: h.y + 68 },
          { x: h.x - 6, y: h.y + 40 },
          { x: h.x - 32, y: h.y + 66 },
          { x: h.x - 66, y: h.y + 44 },
        ]),
        fill: outfitMain,
      });
    } else {
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
  }

  // Long coats & robes (global coords, follow hip).
  if (outfit.robe || outfit.coat) {
    const h = sk.hip;
    const hemY = outfit.robe ? -6 : -118;
    const spread = layer.pose === 'action-lunge' || layer.pose === 'power-awakening' ? 72 : layer.pose === 'crouching' ? 40 : 22;
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
      legParts.push({
        d: `M${fmt(h.x - 3)} ${fmt(h.y - 20)}L${fmt(h.x + 3)} ${fmt(h.y - 20)}L${fmt(h.x + 4)} ${fmt(hemY + 2)}L${fmt(h.x - 4)} ${fmt(hemY + 2)}Z`,
        fill: accent,
        noStroke: true,
        body: false,
      });
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

  // Arms.
  const armW = outfit.robe ? [35, 36, 22] : outfit.armor ? [38, 33, 20] : [30, 26, 14];
  const sleeveColor = outfit.gi ? lighten(outfitMain, 0.05) : outfitMain;
  const armPart = (arm: [P, P, P], shade: number, side: number): Part[] => {
    const parts: Part[] = [];
    // Wrist point: the forearm tapers to a thin wrist just before the fist, so
    // the hand reads as a hand instead of a ball stuck on a tube.
    const wrist = lerp(arm[1], arm[2], 0.9);
    if (outfit.primitive) {
      // Bare muscular arms with leather bracers/wraps on forearms
      parts.push({ d: limbPath([arm[0], arm[1], wrist], [32, 27, 15]), fill: darken(skin, shade) });
      // Deltoid cap so the arm grows out of the shoulder instead of a pinned-on tube.
      parts.push({ d: ellipsePath(arm[0], 19, 13.5), fill: darken(skin, shade) });
      const wrapStart = lerp(arm[1], arm[2], 0.25);
      const wrapEnd = lerp(arm[1], arm[2], 0.88);
      parts.push({ d: limbPath([wrapStart, wrapEnd], [26, 21]), fill: darken(outfitMain, shade + 0.15) });
      parts.push({ d: sculptedHandPath(arm[2], 12.5, side), fill: darken(skin, shade) });
      parts.push({
        d: handDetailPath(arm[2], 12.5, side),
        fill: 'none',
        stroke: darken(skin, 0.5),
        strokeWidth: 1.5,
        body: false,
      });
      return parts;
    }
    // Bare skin limb underneath: the sleeve/cowl covers most of it and leaves a
    // real wrist segment visible between sleeve end and fist.
    parts.push({ d: limbPath([arm[0], arm[1], wrist], [30, 26, 14]), fill: darken(skin, shade) });
    // Deltoid cap (sleeve color) merges the arm root into the torso silhouette.
    const capRx = (armW[0] ?? 30) / 2 + 3.5;
    parts.push({ d: ellipsePath(arm[0], capRx, capRx * 0.74), fill: darken(sleeveColor, shade) });
    const sleeveEnd = outfit.gi
      ? lerp(arm[1], arm[2], 0.15)
      : outfit.robe
        ? lerp(arm[1], arm[2], 0.85)
        : lerp(arm[1], arm[2], 0.78);
    parts.push({ d: limbPath([arm[0], arm[1], sleeveEnd], armW), fill: darken(sleeveColor, shade) });
    const handR = outfit.armor ? 14 : 12.5;
    parts.push({
      d: sculptedHandPath(arm[2], handR, side),
      fill: outfit.armor ? darken(lighten(outfitMain, 0.25), shade) : darken(skin, shade),
    });
    if (!outfit.armor) {
      parts.push({
        d: handDetailPath(arm[2], handR, side),
        fill: 'none',
        stroke: darken(skin, 0.5),
        strokeWidth: 1.5,
        body: false,
      });
    }
    if (outfit.armor) {
      parts.push({
        d: limbPath([lerp(arm[1], arm[2], 0.3), lerp(arm[1], arm[2], 0.85)], [30, 22]),
        fill: darken(lighten(outfitMain, 0.3), shade),
      });
    }
    if (outfit.neonLines) {
      parts.push({
        d: limbPath([lerp(arm[0], arm[1], 0.2), arm[1], lerp(arm[1], arm[2], 0.88)], [4, 4, 4]),
        fill: accent,
        noStroke: true,
        body: false,
        attrs: { 'data-neon': 1 },
      });
    }
    return parts;
  };

  if (sk.backArmBehind) upperBack.push(...armPart(sk.armBack, 0.18, -1));

  // Torso base (unless primitive hunter, which draws muscular chest + hide tunic separately).
  const sh = sk.shoulderHalf / 78;
  if (!outfit.primitive) {
    upperParts.push({ d: torsoPath(sk.shoulderHalf), fill: outfitMain });
  }

  if (outfit.blazer) {
    upperParts.push({ d: `M-14 -472L14 -472L0 -400Z`, fill: '#F4F4F5' });
    upperParts.push({ d: `M-4 -466L4 -466L6 -380L0 -368L-6 -380Z`, fill: accent });
    upperParts.push({ d: `M-16 -472L${fmt(-34 * sh)} -460L-8 -392L0 -400Z`, fill: darken(outfitMain, 0.2) });
    upperParts.push({ d: `M16 -472L${fmt(34 * sh)} -460L8 -392L0 -400Z`, fill: darken(outfitMain, 0.2) });
  }
  if (outfit.gi) {
    upperParts.push({ d: `M-16 -472L24 -360L12 -352L-24 -462Z`, fill: darken(outfitMain, 0.15) });
    upperParts.push({ d: `M16 -472L-20 -380L-26 -390L8 -470Z`, fill: darken(skin, 0.15) });
    upperParts.push({
      d: `M${fmt(-52 * sh)} -316L${fmt(52 * sh)} -316L${fmt(54 * sh)} -296L${fmt(-54 * sh)} -296Z`,
      fill: accent,
    });
    upperParts.push({
      d: `M10 -300L22 -250L12 -248L4 -298ZM-4 -298L-14 -246L-24 -250L-12 -300Z`,
      fill: accent,
    });
  }
  if (outfit.coat) {
    upperParts.push({ d: `M-16 -472L${fmt(-50 * sh)} -458L-30 -360L-6 -420Z`, fill: darken(outfitMain, 0.22) });
    upperParts.push({ d: `M16 -472L${fmt(50 * sh)} -458L30 -360L6 -420Z`, fill: darken(outfitMain, 0.22) });
    upperParts.push({
      d: `M${fmt(-56 * sh)} -306L${fmt(56 * sh)} -306L${fmt(56 * sh)} -290L${fmt(-56 * sh)} -290Z`,
      fill: darken(outfitMain, 0.4),
    });
    upperParts.push({ d: `M-8 -308L8 -308L8 -288L-8 -288Z`, fill: accent, noStroke: true });
  }
  if (outfit.armor) {
    const metal = lighten(outfitMain, 0.25);
    upperParts.push({
      d: `M${fmt(-58 * sh)} -456Q0 -478 ${fmt(58 * sh)} -456L${fmt(48 * sh)} -340Q0 -322 ${fmt(-48 * sh)} -340Z`,
      fill: metal,
    });
    upperParts.push({ d: `M0 -440L12 -410L0 -372L-12 -410Z`, fill: accent });
    upperParts.push({
      d: `M${fmt(-54 * sh)} -320L${fmt(54 * sh)} -320L${fmt(56 * sh)} -300L${fmt(-56 * sh)} -300Z`,
      fill: darken(outfitMain, 0.35),
    });
  }
  if (outfit.robe) {
    upperParts.push({ d: `M-4 -470L4 -470L4 -260L-4 -260Z`, fill: accent, noStroke: true, body: false });
    upperParts.push({ d: `M-16 -472Q0 -440 16 -472L22 -466Q0 -426 -22 -466Z`, fill: accent });
  }
  if (outfit.neonLines) {
    upperParts.push({
      d: `M-40 -455L-30 -380L-44 -300L-40 -300L-26 -380L-36 -455Z`,
      fill: accent,
      noStroke: true,
      body: false,
      attrs: { 'data-neon': 1 },
    });
    upperParts.push({
      d: `M40 -455L30 -380L44 -300L40 -300L26 -380L36 -455Z`,
      fill: accent,
      noStroke: true,
      body: false,
      attrs: { 'data-neon': 1 },
    });
  }

  // Front arms (pauldrons on top).
  if (!sk.backArmBehind) upperParts.push(...armPart(sk.armBack, 0.12, -1));
  upperParts.push(...armPart(sk.armFront, 0, 1));
  if (outfit.armor) {
    const metal = lighten(outfitMain, 0.32);
    upperParts.push({ d: ellipsePath({ x: -72 * sh, y: -452 }, 34, 24), fill: metal });
    upperParts.push({ d: ellipsePath({ x: 72 * sh, y: -452 }, 34, 24), fill: metal });
  }

  // Head base shape (sharp Manhwa V-jawline).
  const headFaceShape = profile ? MANHWA_FACE_PROFILE : MANHWA_FACE_FRONT;
  const headParts: Part[] = [{ d: headFaceShape, fill: skin }];
  if (isEntity) {
    headParts.push({ d: 'M-30 -570C-46 -600 -62 -620 -78 -648C-58 -628 -40 -616 -20 -584Z', fill: '#07060C' });
    headParts.push({ d: 'M30 -570C46 -600 62 -620 78 -648C58 -628 40 -616 20 -584Z', fill: '#07060C' });
  }

  // Hat / Hood / Headband / Mask overlays (drawn after hair).
  if (outfit.hat) {
    upperFront.push({
      d: 'M-74 -566Q0 -590 74 -566Q60 -556 0 -566Q-60 -556 -74 -566Z',
      fill: darken(outfitMain, 0.45),
    });
    upperFront.push({
      d: 'M-40 -568C-44 -610 -30 -628 0 -630C30 -628 44 -610 40 -568Q0 -580 -40 -568Z',
      fill: darken(outfitMain, 0.4),
    });
    upperFront.push({
      d: 'M-41 -578Q0 -590 41 -578L40 -568Q0 -580 -40 -568Z',
      fill: accent,
      noStroke: true,
    });
  }
  if (outfit.hood && !away) {
    upperFront.push({
      d: 'M-36 -552L-26 -572L-14 -556L-4 -576L8 -556L20 -572L32 -552L36 -566Q0 -600 -36 -566Z',
      fill: hair,
    });
    upperFront.push({
      d: 'M-62 -468C-74 -540 -48 -620 4 -624C56 -620 74 -540 62 -468L46 -470C52 -530 38 -588 0 -590C-38 -588 -52 -530 -46 -470Z',
      fill: darken(outfitMain, 0.05),
    });
  } else if (outfit.hood && away) {
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
  if ((outfit.headband || accessories.includes('headband')) && !away) {
    upperFront.push({
      d: 'M-44 -558Q0 -572 44 -558L44 -548Q0 -562 -44 -548Z',
      fill: accent,
    });
    upperFront.push({
      d: 'M-42 -554C-68 -552 -92 -538 -118 -522C-96 -542 -76 -550 -60 -558C-84 -558 -104 -550 -128 -546C-100 -560 -70 -564 -42 -558Z',
      fill: accent,
    });
  }
  if (outfit.mask && !away) {
    upperFront.push({
      d: profile
        ? 'M10 -522L50 -520L44 -500C30 -486 10 -484 -6 -492L-8 -516Z'
        : 'M-41 -524Q0 -516 41 -524C40 -508 30 -492 0 -484C-30 -492 -40 -508 -41 -524Z',
      fill: darken(outfitMain, 0.3),
    });
    upperFront.push({
      d: profile
        ? 'M12 -516L48 -516L47 -513L12 -513Z'
        : 'M-34 -516Q0 -510 34 -516L33 -513Q0 -507 -33 -513Z',
      fill: accent,
      noStroke: true,
      body: false,
      attrs: { 'data-neon': 1 },
    });
  }

  // ---- Defs -------------------------------------------------------------
  const shadeOpacity =
    shading === 'soft' ? 0.32 : shading === 'heavy' ? 0.58 : shading === 'dramatic-noir' ? 0.72 : 0.46;
  const shadeBox =
    lightDir === 'right'
      ? { x1: 40, y1: 0, x2: -110, y2: 0 }
      : lightDir === 'bottom-fire'
        ? { x1: 0, y1: -180, x2: 0, y2: -610 }
        : { x1: -40, y1: 0, x2: 110, y2: 0 };

  const shadeId = defs.add('figshade', (id) =>
    linearGradient(
      id,
      [
        { offset: 0, color: '#000000', opacity: 0 },
        { offset: 0.52, color: '#000000', opacity: 0.06 },
        { offset: 1, color: '#000000', opacity: shadeOpacity },
      ],
      0,
      'userSpaceOnUse',
      shadeBox,
    ),
  );
  const neonId = defs.once(`neon-${accent}`, 'neon', (id) => glowFilter(id, 3, accent, 1));

  // ---- Render Helpers ---------------------------------------------------
  const renderBase = (parts: Part[]) =>
    parts
      .map((p) => {
        const neon = p.attrs?.['data-neon'] !== undefined;
        const isDetailLine = p.fill === 'none' && p.stroke !== undefined;
        return el('path', {
          d: p.d,
          fill: p.fill,
          stroke: p.noStroke ? undefined : (p.stroke ?? ink),
          'stroke-width': p.noStroke ? undefined : (p.stroke ? (p.strokeWidth ?? 1.4) : lw),
          'stroke-linejoin': 'round',
          'stroke-linecap': isDetailLine ? 'round' : undefined,
          filter: neon ? `url(#${neonId})` : undefined,
        });
      })
      .join('');
  const renderRim = (parts: Part[]) =>
    parts
      .filter((p) => p.body !== false)
      .map((p) => el('path', { d: p.d, fill: rim, 'fill-opacity': 0.92 }))
      .join('');
  const renderShade = (parts: Part[]) =>
    parts
      .filter((p) => p.body !== false)
      .map((p) => el('path', { d: p.d, fill: `url(#${shadeId})` }))
      .join('');

  // High-detail Hair Back & Hair Front SVG strings
  const hairBackSvg = !outfit.hood ? renderAnimeHairBack(hairStyle, layer.pose, hair, ink, lw) : '';
  const hairFrontSvg =
    !outfit.hood && !outfit.hat
      ? renderAnimeHairFront(hairStyle, layer.pose, hair, accent, ink, lw, prng.fork('hair'))
      : outfit.hat
        ? renderAnimeHairFront('undercut-sleek', layer.pose, hair, accent, ink, lw, prng.fork('hair'))
        : '';

  // Neck + Collarbone Cel-Shading
  const neckSvg = !isEntity ? renderNeckAndCollarCelShade(skin, ink, lw, shading, lightDir) : '';

  // Primitive Hunter specialized torso OR standard torso clothing folds
  const primitiveTorsoSvg =
    outfit.primitive && !isEntity
      ? renderPrimitiveHunterOutfit(outfitMain, accent, skin, ink, lw, sh)
      : '';
  const clothingFoldsSvg =
    !outfit.primitive && !isEntity ? renderTorsoClothingFolds(outfitMain, sh, shading) : '';

  // Optional Fur Collar / Bone Necklace / Cloak Clasp on non-primitive outfits
  let torsoAccessoriesSvg = '';
  if (!isEntity) {
    if (accessories.includes('fur-collar') && !outfit.primitive) {
      torsoAccessoriesSvg += renderFurCollarAccessory(outfitMain, ink, lw, sh);
    }
    if (accessories.includes('bone-necklace') && !outfit.primitive) {
      torsoAccessoriesSvg += renderBoneNecklace('#F1F5F9', '#CBD5E1', darken(accent, 0.35), ink, lw);
    }
    if (accessories.includes('cloak-clasp')) {
      torsoAccessoriesSvg +=
        el('path', { d: 'M0 -476L11 -464L0 -452L-11 -464Z', fill: accent, stroke: ink, 'stroke-width': lw * 0.85 }) +
        el('circle', { cx: 0, cy: -464, r: 4, fill: lighten(accent, 0.45) });
    }
  }

  // Ears & Facial Cel-Shading
  const earsSvg =
    !away && !isEntity
      ? renderAnimeEars(skin, ink, lw, profile, accessories.includes('earring'), accent)
      : '';
  const faceCelShadeSvg =
    !away && !isEntity
      ? renderFaceCelShading(skin, shading, lightDir, profile, !outfit.hood && hairStyle !== 'none')
      : '';

  // 6-Layer Anime Eyes, Brows, Nose & Mouth
  let faceDetailsSvg = '';
  const masked = outfit.mask;
  if (!away && !isEntity) {
    faceDetailsSvg = profile
      ? renderAnimeFaceProfile(palette, layer.expression, defs, lw, masked)
      : renderAnimeFaceFront({
          palette,
          eyeStyle: character.eyeStyle ?? 'sharp-hunter',
          expression: layer.expression,
          glowEyes: layer.glowEyes,
          lightDirection: lightDir,
          shadingIntensity: shading,
          defs,
          lw,
          masked,
          accessories,
        });
  }

  // Dramatic Shadow Overlays on Face (filled directly onto face shape — no nested clipPath!)
  let faceOverlay = '';
  if (!away && (layer.expression === 'shadowed' || layer.expression === 'menacing-glow' || outfit.hood || shading === 'dramatic-noir')) {
    const strong = layer.expression === 'shadowed' || layer.expression === 'menacing-glow';
    const gradId = defs.add('faceshadow', (id) =>
      linearGradient(
        id,
        [
          { offset: 0, color: darken(outfitMain, 0.88), opacity: strong ? 0.94 : 0.72 },
          {
            offset: strong ? (layer.expression === 'menacing-glow' ? 0.85 : 0.52) : 0.34,
            color: darken(outfitMain, 0.85),
            opacity: strong ? 0.88 : 0.35,
          },
          {
            offset: strong ? (layer.expression === 'menacing-glow' ? 1 : 0.64) : 0.5,
            color: darken(outfitMain, 0.85),
            opacity: 0,
          },
        ],
        90,
        'userSpaceOnUse',
        { x1: 0, y1: -590, x2: 0, y2: -480 },
      ),
    );
    faceOverlay = el('path', { d: headFaceShape, fill: `url(#${gradId})` });
  }

  // Glowing Eyes & Energy Trails
  let eyesGlow = '';
  const wantsGlow = layer.glowEyes || layer.expression === 'menacing-glow' || isEntity;
  if (!away && wantsGlow) {
    eyesGlow = renderAnimeGlowingEyes(
      isEntity || layer.expression === 'menacing-glow' ? palette.aura : palette.eyes,
      defs,
      profile,
    );
  }

  // Weapon Prop anchored to front hand
  const weaponSvg = renderWeaponProp(
    layer.weaponProp ?? 'none',
    sk.armFront[2],
    layer.pose,
    accent,
    ink,
    lw,
    defs,
  );

  // Optional Pass-2 Custom Detail SVG Overlay (sanitized)
  let customDetailSvg = '';
  if (layer.detailOverlaySvg) {
    const clean = sanitizeSvgMarkup(layer.detailOverlaySvg);
    if (clean.svg) {
      customDetailSvg = `<g data-pass2-detail="true">${clean.svg}</g>`;
    }
  }

  // Aura (entities, menacing figures, or explicit auraIntensity > 0).
  let aura = '';
  const auraStrength =
    layer.auraIntensity && layer.auraIntensity > 0
      ? layer.auraIntensity
      : isEntity || layer.expression === 'menacing-glow' || layer.pose === 'power-awakening'
        ? 0.65
        : 0;
  if (auraStrength > 0) {
    const auraId = defs.add('aura', (id) =>
      radialGradient(id, [
        { offset: 0, color: palette.aura, opacity: 0.68 * auraStrength },
        { offset: 0.55, color: palette.aura, opacity: 0.24 * auraStrength },
        { offset: 1, color: palette.aura, opacity: 0 },
      ]),
    );
    aura = el('ellipse', { cx: 0, cy: -340, rx: 245, ry: 390, fill: `url(#${auraId})` });
  }

  // Energy / Shadow Wisps (skip in tight head/eyes crops where wisps would be offscreen).
  let wisps = '';
  const tightHeadCrop = layer.framing === 'eyes-only' || layer.framing === 'close-up';
  if ((isEntity || auraStrength >= 0.5) && !tightHeadCrop) {
    const wp = prng.fork('wisps');
    const blurId = defs.add('wispblur', (id) => blurFilter(id, 3));
    let d = '';
    const count = isEntity ? 22 : 14;
    for (let i = 0; i < count; i++) {
      const y = wp.range(-565, -30);
      const side = wp.chance(0.5) ? -1 : 1;
      const x0 = side * wp.range(32, 86);
      const len = wp.range(42, 118);
      const w = wp.range(9, 20);
      d += `M${fmt(x0)} ${fmt(y)}Q${fmt(x0 + side * len * 0.6)} ${fmt(y - len * 0.3)} ${fmt(x0 + side * len)} ${fmt(y - len * 0.9)}Q${fmt(x0 + side * len * 0.3)} ${fmt(y - len * 0.2)} ${fmt(x0)} ${fmt(y + w)}Z`;
    }
    const wispCore = isEntity ? '#07060C' : lighten(palette.aura, 0.35);
    wisps =
      `<path d="${d}" fill="${wispCore}" fill-opacity="${isEntity ? '1' : '0.55'}"/>` +
      `<path d="${d}" fill="${palette.aura}" fill-opacity="0.4" filter="url(#${blurId})"/>`;
  }

  const upperAll = [...upperBack, ...upperParts];
  const rimOffset = 4.5 / s;
  const rimDir = lightDir === 'right' ? 1 : -1;
  const rimPass =
    `<g transform="translate(${fmt(rimOffset * rimDir * flip)} ${fmt(-rimOffset * 0.6)})">` +
    renderRim([...backLayer, ...legParts]) +
    `<g transform="${upperTransform}">${renderRim([...upperAll, ...headParts, ...upperFront])}</g></g>`;

  const body =
    aura +
    rimPass +
    wisps +
    renderBase([...backLayer, ...legParts]) +
    renderShade([...backLayer, ...legParts]) +
    `<g transform="${upperTransform}">` +
    hairBackSvg +
    renderBase(upperBack) +
    neckSvg +
    primitiveTorsoSvg +
    renderBase(upperParts) +
    clothingFoldsSvg +
    torsoAccessoriesSvg +
    renderShade(upperAll) +
    earsSvg +
    renderBase(headParts) +
    faceCelShadeSvg +
    renderShade(headParts.slice(-1)) +
    faceDetailsSvg +
    faceOverlay +
    hairFrontSvg +
    renderBase(upperFront) +
    renderShade(upperFront.filter((p) => p.body !== false)) +
    weaponSvg +
    customDetailSvg +
    eyesGlow +
    '</g>';

  return `<g transform="${transform}" data-character="${character.id}">${body}</g>`;
}
