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
  mix,
  pctPoint,
  radialGradient,
} from '../components/svg-utils.js';
import { sanitizeSvgMarkup } from '../components/scenes/svg-sanitizer.js';
import { createPrng } from '../engine/prng.js';
import {
  anatomicalBootPath,
  anatomicalCastingHand,
  anatomicalChinThinkHand,
  anatomicalHandDetailPath,
  anatomicalHandPath,
  anatomicalRelaxedHand,
  anatomicalTorsoPath,
  anatomicalWeaponGripFingers,
  buildAnatomicalArm,
  buildAnatomicalLeg,
  buildForearmWrapPath,
  lerpP,
  sub,
  taperedCurvePath,
  unit,
} from './anatomy-bezier.js';
import { renderParametricHead3D } from './head-3d.js';
import {
  MANHWA_FACE_FRONT,
  MANHWA_FACE_FRONT_FEMALE,
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
  /** Optional fill opacity (used for cel-shadow ribbons & G-pen tapered creases). */
  fillOpacity?: number;
  /** Participates in rim-light and shade passes (default true). */
  body?: boolean;
  /** Extra raw attributes for the base pass. */
  attrs?: Record<string, string | number | undefined>;
  /** Skip the ink outline. */
  noStroke?: boolean;
  /** Override stroke color (e.g. warm skin ink or detail lines). */
  stroke?: string;
  /** Stroke width used when `stroke` is set (local units). */
  strokeWidth?: number;
}

/** Local-space crop per framing: [top, bottom] and fraction of panel height to fill. */
const FRAMING_CROP: Record<Framing, { top: number; bottom: number; fill: number }> = {
  'full-body': { top: -608, bottom: 12, fill: 0.88 },
  'waist-up': { top: -608, bottom: -298, fill: 0.96 },
  bust: { top: -606, bottom: -395, fill: 0.97 },
  'close-up': { top: -600, bottom: -462, fill: 0.98 },
  'eyes-only': { top: -546, bottom: -498, fill: 1 },
};

const REF_HIP_Y = -288;

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

function skeletonFor(pose: Pose, isSlender: boolean = false, isHeavy: boolean = false): Skeleton {
  if (isSlender) {
    switch (pose) {
      case 'action-lunge':
        return {
          hip: { x: 0, y: -235 },
          lean: 12,
          armBack: [{ x: -50, y: -452 }, { x: -102, y: -390 }, { x: -145, y: -340 }],
          armFront: [{ x: 50, y: -452 }, { x: 122, y: -468 }, { x: 195, y: -475 }],
          legBack: [{ x: -20, y: -235 }, { x: -74, y: -125 }, { x: -135, y: -16 }],
          legFront: [{ x: 20, y: -235 }, { x: 84, y: -155 }, { x: 96, y: -16 }],
          backArmBehind: true,
          shoulderHalf: 52,
        };
      case 'power-awakening':
        return {
          hip: { x: 0, y: -268 },
          lean: -2,
          armBack: [{ x: -52, y: -452 }, { x: -94, y: -385 }, { x: -118, y: -310 }],
          armFront: [{ x: 52, y: -452 }, { x: 94, y: -385 }, { x: 118, y: -310 }],
          legBack: [{ x: -22, y: -268 }, { x: -38, y: -142 }, { x: -48, y: -14 }],
          legFront: [{ x: 22, y: -268 }, { x: 38, y: -142 }, { x: 48, y: -14 }],
          backArmBehind: false,
          shoulderHalf: 54,
        };
      case 'crouching':
        return {
          hip: { x: 0, y: -165 },
          lean: 8,
          armBack: [{ x: -50, y: -452 }, { x: -74, y: -365 }, { x: -82, y: -285 }],
          armFront: [{ x: 50, y: -452 }, { x: 84, y: -375 }, { x: 68, y: -305 }],
          legBack: [{ x: -20, y: -165 }, { x: -58, y: -120 }, { x: -36, y: -16 }],
          legFront: [{ x: 20, y: -165 }, { x: 68, y: -180 }, { x: 60, y: -16 }],
          backArmBehind: false,
          shoulderHalf: 52,
        };
      case 'dramatic-profile':
        return {
          hip: { x: 0, y: REF_HIP_Y },
          lean: 2,
          armBack: [{ x: -38, y: -452 }, { x: -52, y: -355 }, { x: -44, y: -260 }],
          armFront: [{ x: 38, y: -452 }, { x: 52, y: -355 }, { x: 44, y: -260 }],
          legBack: [{ x: -16, y: REF_HIP_Y }, { x: -18, y: -152 }, { x: -20, y: -14 }],
          legFront: [{ x: 16, y: REF_HIP_Y }, { x: 18, y: -152 }, { x: 20, y: -14 }],
          backArmBehind: true,
          shoulderHalf: 42,
        };
      case 'three-quarter':
        return {
          hip: { x: 0, y: REF_HIP_Y },
          lean: -3,
          armBack: [{ x: -46, y: -452 }, { x: -56, y: -355 }, { x: -48, y: -260 }],
          armFront: [{ x: 34, y: -452 }, { x: 40, y: -355 }, { x: 34, y: -260 }],
          legBack: [{ x: -18, y: REF_HIP_Y }, { x: -20, y: -152 }, { x: -22, y: -14 }],
          legFront: [{ x: 18, y: REF_HIP_Y }, { x: 20, y: -152 }, { x: 22, y: -14 }],
          backArmBehind: true,
          shoulderHalf: 44,
        };
      case 'facing-away':
      case 'standing':
      default:
        return {
          hip: { x: 0, y: REF_HIP_Y },
          lean: 0,
          armBack: [{ x: -50, y: -452 }, { x: -58, y: -355 }, { x: -52, y: -260 }],
          armFront: [{ x: 50, y: -452 }, { x: 58, y: -355 }, { x: 52, y: -260 }],
          legBack: [{ x: -20, y: REF_HIP_Y }, { x: -22, y: -152 }, { x: -24, y: -14 }],
          legFront: [{ x: 20, y: REF_HIP_Y }, { x: 22, y: -152 }, { x: 24, y: -14 }],
          backArmBehind: false,
          shoulderHalf: 52,
        };
    }
  }

  if (isHeavy) {
    switch (pose) {
      case 'power-awakening':
        return {
          hip: { x: 0, y: -268 },
          lean: -3,
          armBack: [{ x: -78, y: -452 }, { x: -132, y: -395 }, { x: -168, y: -315 }],
          armFront: [{ x: 78, y: -452 }, { x: 132, y: -395 }, { x: 168, y: -315 }],
          legBack: [{ x: -32, y: -268 }, { x: -54, y: -142 }, { x: -68, y: -14 }],
          legFront: [{ x: 32, y: -268 }, { x: 54, y: -142 }, { x: 68, y: -14 }],
          backArmBehind: false,
          shoulderHalf: 82,
        };
      case 'standing':
      default:
        return {
          hip: { x: 0, y: REF_HIP_Y },
          lean: 0,
          armBack: [{ x: -78, y: -452 }, { x: -92, y: -355 }, { x: -84, y: -260 }],
          armFront: [{ x: 78, y: -452 }, { x: 92, y: -355 }, { x: 84, y: -260 }],
          legBack: [{ x: -32, y: REF_HIP_Y }, { x: -36, y: -152 }, { x: -40, y: -14 }],
          legFront: [{ x: 32, y: REF_HIP_Y }, { x: 36, y: -152 }, { x: 40, y: -14 }],
          backArmBehind: false,
          shoulderHalf: 82,
        };
    }
  }

  switch (pose) {
    case 'action-lunge':
      return {
        hip: { x: 0, y: -235 },
        lean: 14,
        armBack: [{ x: -68, y: -452 }, { x: -130, y: -385 }, { x: -180, y: -330 }],
        armFront: [{ x: 68, y: -452 }, { x: 156, y: -468 }, { x: 238, y: -478 }],
        legBack: [{ x: -26, y: -235 }, { x: -88, y: -125 }, { x: -152, y: -16 }],
        legFront: [{ x: 26, y: -235 }, { x: 98, y: -155 }, { x: 110, y: -16 }],
        backArmBehind: true,
        shoulderHalf: 70,
      };
    case 'power-awakening':
      return {
        hip: { x: 0, y: -268 },
        lean: -4,
        armBack: [{ x: -70, y: -452 }, { x: -124, y: -395 }, { x: -158, y: -315 }],
        armFront: [{ x: 70, y: -452 }, { x: 124, y: -395 }, { x: 158, y: -315 }],
        legBack: [{ x: -30, y: -268 }, { x: -52, y: -142 }, { x: -66, y: -14 }],
        legFront: [{ x: 30, y: -268 }, { x: 52, y: -142 }, { x: 66, y: -14 }],
        backArmBehind: false,
        shoulderHalf: 72,
      };
    case 'crouching':
      return {
        hip: { x: 0, y: -165 },
        lean: 9,
        armBack: [{ x: -68, y: -452 }, { x: -94, y: -365 }, { x: -102, y: -285 }],
        armFront: [{ x: 68, y: -452 }, { x: 104, y: -375 }, { x: 84, y: -305 }],
        legBack: [{ x: -26, y: -165 }, { x: -66, y: -120 }, { x: -40, y: -16 }],
        legFront: [{ x: 26, y: -165 }, { x: 76, y: -180 }, { x: 68, y: -16 }],
        backArmBehind: false,
        shoulderHalf: 70,
      };
    case 'dramatic-profile':
      return {
        hip: { x: 0, y: REF_HIP_Y },
        lean: 2,
        armBack: [{ x: -48, y: -452 }, { x: -66, y: -355 }, { x: -52, y: -260 }],
        armFront: [{ x: 48, y: -452 }, { x: 66, y: -355 }, { x: 52, y: -260 }],
        legBack: [{ x: -20, y: REF_HIP_Y }, { x: -22, y: -152 }, { x: -24, y: -14 }],
        legFront: [{ x: 20, y: REF_HIP_Y }, { x: 22, y: -152 }, { x: 24, y: -14 }],
        backArmBehind: true,
        shoulderHalf: 54,
      };
    case 'three-quarter':
      return {
        hip: { x: 0, y: REF_HIP_Y },
        lean: -3,
        armBack: [{ x: -58, y: -452 }, { x: -68, y: -355 }, { x: -60, y: -260 }],
        armFront: [{ x: 42, y: -452 }, { x: 48, y: -355 }, { x: 42, y: -260 }],
        legBack: [{ x: -24, y: REF_HIP_Y }, { x: -26, y: -152 }, { x: -28, y: -14 }],
        legFront: [{ x: 24, y: REF_HIP_Y }, { x: 26, y: -152 }, { x: 28, y: -14 }],
        backArmBehind: true,
        shoulderHalf: 56,
      };
    case 'facing-away':
    case 'standing':
    default:
      return {
        hip: { x: 0, y: REF_HIP_Y },
        lean: 0,
        armBack: [{ x: -68, y: -452 }, { x: -76, y: -355 }, { x: -70, y: -260 }],
        armFront: [{ x: 68, y: -452 }, { x: 76, y: -355 }, { x: 70, y: -260 }],
        legBack: [{ x: -28, y: REF_HIP_Y }, { x: -30, y: -152 }, { x: -32, y: -14 }],
        legFront: [{ x: 28, y: REF_HIP_Y }, { x: 30, y: -152 }, { x: 32, y: -14 }],
        backArmBehind: false,
        shoulderHalf: 70,
      };
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Sculpted curved anime armor shoulder pauldron (replaces flat ellipse). */
function armorPauldronPath(cx: number, cy: number, side: number): string {
  const x = (dx: number) => fmt(cx + dx * side);
  const y = (dy: number) => fmt(cy + dy);
  return (
    `M${x(-22)} ${y(-12)}` +
    `Q${x(4)} ${y(-28)} ${x(30)} ${y(-10)}` +
    `C${x(40)} ${y(-2)} ${x(38)} ${y(16)} ${x(22)} ${y(24)}` +
    `Q${x(4)} ${y(16)} ${x(-18)} ${y(14)}` +
    `Q${x(-28)} ${y(2)} ${x(-22)} ${y(-12)}Z`
  );
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
  const isSlender = character.eyeStyle === 'soft-shojo' || character.hairStyle === 'long-flowing';
  const isHeavy = outfit.armor;
  const prng = createPrng(`${ctx.seed}-${character.id}`);
  const sk = skeletonFor(layer.pose, isSlender, isHeavy);
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
  const threeQuarter = layer.pose === 'three-quarter';
  const rim = layer.rimLightColor ?? (isEntity ? palette.aura : ctx.defaultRim);
  const shading = layer.shadingIntensity ?? 'standard';
  const lightDir = layer.lightDirection ?? 'left';
  const shadowSide = lightDir === 'right' ? -1 : 1;

  // Palette derivations (anime-tinted warm lineart for skin, deep shaded ink for outfits).
  const skin = isEntity ? '#07060C' : palette.skin;
  const outfitMain = isEntity ? '#07060C' : palette.outfitPrimary;
  const pants = isEntity ? '#07060C' : outfit.primitive ? darken(skin, 0.04) : darken(palette.outfitPrimary, 0.35);
  const shoes = isEntity ? '#07060C' : darken(palette.outfitPrimary, 0.7);
  const hair = isEntity ? '#07060C' : palette.hair;
  const accent = palette.outfitAccent;
  const ink = isEntity ? '#000000' : darken(outfitMain, 0.78);
  const skinInk = isEntity ? '#000000' : mix(darken(skin, 0.68), ink, 0.42);
  const celAlpha =
    shading === 'soft' ? 0.55 : shading === 'heavy' ? 0.82 : shading === 'dramatic-noir' ? 0.9 : 0.72;

  const upperShift = sk.hip.y - REF_HIP_Y;
  const upperTransform = `translate(${fmt(sk.hip.x)} ${fmt(upperShift)}) rotate(${fmt(sk.lean)} 0 ${REF_HIP_Y})`;

  // ---- Parts -------------------------------------------------------------
  const backLayer: Part[] = [];
  const legParts: Part[] = [];
  const upperBack: Part[] = [];
  const upperParts: Part[] = [];
  const upperFront: Part[] = [];

  // Legs (organic cubic Bézier quads → knee → calf → ankle + cel-shadow ribbons + sculpted boots).
  const legBulk = outfit.gi ? 1.15 : isSlender ? 0.88 : outfit.armor ? 1.12 : 1.0;
  if (!outfit.robe) {
    const legSpecs: ReadonlyArray<{ leg: [P, P, P]; side: number; base: string }> = [
      { leg: sk.legBack, side: -1, base: darken(pants, 0.12) },
      { leg: sk.legFront, side: 1, base: pants },
    ];
    for (const { leg, side, base } of legSpecs) {
      const geo = buildAnatomicalLeg(leg[0], leg[1], leg[2], side, legBulk, shadowSide);
      legParts.push({
        d: geo.silhouette,
        fill: base,
        stroke: outfit.primitive ? skinInk : ink,
      });
      if (!isEntity) {
        legParts.push({
          d: geo.celShadow,
          fill: darken(base, 0.24),
          fillOpacity: celAlpha,
          noStroke: true,
          body: false,
        });
        legParts.push({
          d: geo.anatomyCreases,
          fill: darken(base, 0.46),
          fillOpacity: 0.72,
          noStroke: true,
          body: false,
        });
      }
      // Tapered shin wraps / leg bindings for primitive hunter or martial artist
      if (outfit.primitive || outfit.gi) {
        legParts.push({
          d: buildForearmWrapPath(leg[1], leg[2], side, 0.36, 0.98, 29, 20),
          fill: darken(outfitMain, side < 0 ? 0.32 : 0.24),
        });
      }
    }
  }
  for (const leg of [sk.legBack, sk.legFront]) {
    const a = leg[2];
    const dir = leg === sk.legFront ? 1 : -1;
    legParts.push({ d: anatomicalBootPath(a, dir), fill: shoes });
  }
  // Pelvis / Loincloth.
  if (!outfit.robe) {
    const h = sk.hip;
    if (outfit.primitive) {
      // Curved organic beast-hide loincloth skirt
      legParts.push({
        d:
          `M${fmt(h.x - 60)} ${fmt(h.y - 16)}L${fmt(h.x + 60)} ${fmt(h.y - 16)}` +
          `C${fmt(h.x + 64)} ${fmt(h.y + 12)} ${fmt(h.x + 68)} ${fmt(h.y + 34)} ${fmt(h.x + 66)} ${fmt(h.y + 50)}` +
          `Q${fmt(h.x + 52)} ${fmt(h.y + 36)} ${fmt(h.x + 40)} ${fmt(h.y + 36)}` +
          `Q${fmt(h.x + 30)} ${fmt(h.y + 54)} ${fmt(h.x + 18)} ${fmt(h.y + 66)}` +
          `Q${fmt(h.x + 4)} ${fmt(h.y + 44)} ${fmt(h.x - 6)} ${fmt(h.y + 40)}` +
          `Q${fmt(h.x - 20)} ${fmt(h.y + 56)} ${fmt(h.x - 32)} ${fmt(h.y + 64)}` +
          `Q${fmt(h.x - 48)} ${fmt(h.y + 44)} ${fmt(h.x - 64)} ${fmt(h.y + 46)}` +
          `C${fmt(h.x - 66)} ${fmt(h.y + 26)} ${fmt(h.x - 64)} ${fmt(h.y + 4)} ${fmt(h.x - 60)} ${fmt(h.y - 16)}Z`,
        fill: outfitMain,
      });
    } else {
      const pw = isSlender ? 44 : isHeavy ? 56 : 50;
      legParts.push({
        d: poly([
          { x: h.x - pw, y: h.y - 14 },
          { x: h.x + pw, y: h.y - 14 },
          { x: h.x + pw - 2, y: h.y + 24 },
          { x: h.x, y: h.y + 38 },
          { x: h.x - pw + 2, y: h.y + 24 },
        ]),
        fill: pants,
      });
    }
  }

  // Long coats & robes (global coords, follow hip).
  if (outfit.robe || outfit.coat) {
    const h = sk.hip;
    const hemY = outfit.robe ? -6 : -118;
    const spread = layer.pose === 'action-lunge' || layer.pose === 'power-awakening' ? 56 : layer.pose === 'crouching' ? 34 : 18;
    const rw = isSlender ? 46 : 58;
    const hemW = isSlender ? rw + 28 + spread : rw + 40 + spread;
    const robeD =
      `M${fmt(h.x - rw)} ${fmt(h.y - 18)}L${fmt(h.x + rw)} ${fmt(h.y - 18)}` +
      `C${fmt(h.x + rw + 8)} ${fmt(h.y + 50)} ${fmt(h.x + hemW - 10)} ${fmt(hemY - 50)} ${fmt(h.x + hemW)} ${fmt(hemY)}` +
      `Q${fmt(h.x + 35)} ${fmt(hemY + 10)} ${fmt(h.x)} ${fmt(hemY + 3)}` +
      `Q${fmt(h.x - 35)} ${fmt(hemY + 10)} ${fmt(h.x - hemW)} ${fmt(hemY)}` +
      `C${fmt(h.x - hemW + 10)} ${fmt(hemY - 50)} ${fmt(h.x - rw - 8)} ${fmt(h.y + 50)} ${fmt(h.x - rw)} ${fmt(h.y - 18)}Z`;
    legParts.push({ d: robeD, fill: outfit.robe ? outfitMain : darken(outfitMain, 0.05) });
    if (outfit.robe) {
      legParts.push({
        d: `M${fmt(h.x - hemW + 4)} ${fmt(hemY - 4)}Q${fmt(h.x)} ${fmt(hemY + 14)} ${fmt(h.x + hemW - 4)} ${fmt(hemY - 4)}L${fmt(h.x + hemW)} ${fmt(hemY)}Q${fmt(h.x + 35)} ${fmt(hemY + 10)} ${fmt(h.x)} ${fmt(hemY + 3)}Q${fmt(h.x - 35)} ${fmt(hemY + 10)} ${fmt(h.x - hemW)} ${fmt(hemY)}Z`,
        fill: accent,
        noStroke: true,
      });
      legParts.push({
        d: `M${fmt(h.x - 3)} ${fmt(h.y - 18)}L${fmt(h.x + 3)} ${fmt(h.y - 18)}L${fmt(h.x + 3)} ${fmt(hemY + 2)}L${fmt(h.x - 3)} ${fmt(hemY + 2)}Z`,
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
  const hoodBack: Part[] = [];
  if (outfit.hood) {
    hoodBack.push({
      d: away
        ? 'M-58 -470C-70 -540 -50 -618 0 -622C50 -618 70 -540 58 -470Z'
        : 'M-62 -468C-74 -540 -48 -620 4 -624C56 -620 74 -540 62 -468Z',
      fill: darken(outfitMain, 0.25),
    });
  }

  // Arms (organic cubic Bézier deltoid → bicep → brachioradialis → tapered wrist,
  // seamless shoulder blending with NO circular ball-joint rings, open G-pen T-junctions,
  // and forearm-aligned organic fists).
  const sleeveColor = outfit.gi ? lighten(outfitMain, 0.05) : outfitMain;
  const armPart = (arm: [P, P, P], shade: number, side: number): Part[] => {
    const parts: Part[] = [];
    const wrist = lerpP(arm[1], arm[2], 0.9);
    const armSkin = darken(skin, shade);
    const armSkinInk = isEntity ? '#000000' : mix(darken(armSkin, 0.68), ink, 0.42);

    if (outfit.primitive) {
      const armGeo = buildAnatomicalArm(arm[0], arm[1], wrist, side, {
        bulk: 1.04,
        shadowSide,
      });
      parts.push({ d: armGeo.silhouette, fill: armSkin, noStroke: true });
      if (!isEntity) {
        parts.push({
          d: armGeo.celShadow,
          fill: darken(armSkin, 0.25),
          fillOpacity: celAlpha,
          noStroke: true,
          body: false,
        });
      }
      // Open ink contour (ends cleanly at armpit T-junction — zero closed shoulder seam!)
      parts.push({
        d: armGeo.outline,
        fill: 'none',
        stroke: armSkinInk,
        strokeWidth: lw * 0.92,
        body: false,
      });
      if (!isEntity) {
        parts.push({
          d: armGeo.anatomyCreases,
          fill: darken(armSkin, 0.48),
          fillOpacity: 0.78,
          noStroke: true,
          body: false,
        });
      }
      // Sculpted leather forearm bracer hugging the brachioradialis taper
      parts.push({
        d: buildForearmWrapPath(arm[1], arm[2], side, 0.26, 0.87, 25, 17.5),
        fill: darken(outfitMain, shade + 0.14),
      });
      // Forearm-aligned organic fist + G-pen finger grooves
      parts.push({
        d: anatomicalHandPath(wrist, armGeo.forearmUnit, 12.2, side),
        fill: armSkin,
        stroke: armSkinInk,
      });
      if (!isEntity) {
        parts.push({
          d: anatomicalHandDetailPath(wrist, armGeo.forearmUnit, 12.2, side),
          fill: darken(armSkin, 0.5),
          fillOpacity: 0.82,
          noStroke: true,
          body: false,
        });
      }
      return parts;
    }

    // Bare skin arm underneath (leaves real tapered wrist visible past sleeve cuff)
    const bareBulk = isSlender ? 0.78 : 0.96;
    const bareGeo = buildAnatomicalArm(arm[0], arm[1], wrist, side, {
      bulk: bareBulk,
      shadowSide,
    });
    parts.push({ d: bareGeo.silhouette, fill: armSkin, noStroke: true });
    if (!isEntity) {
      parts.push({
        d: bareGeo.celShadow,
        fill: darken(armSkin, 0.24),
        fillOpacity: celAlpha,
        noStroke: true,
        body: false,
      });
    }
    parts.push({
      d: bareGeo.outline,
      fill: 'none',
      stroke: armSkinInk,
      strokeWidth: lw * 0.9,
      body: false,
    });

    // Organic Bézier sleeve over the arm (closed fill + open ink contour = seamless shoulder!)
    const sleeveRatio = outfit.gi ? 0.22 : outfit.robe ? 0.86 : 0.8;
    const sleeveBulk = outfit.robe ? (isSlender ? 0.94 : 1.16) : outfit.armor ? 1.14 : isSlender ? 0.84 : 1.03;
    const slColor = darken(sleeveColor, shade);
    const sleeveGeo = buildAnatomicalArm(arm[0], arm[1], wrist, side, {
      bulk: sleeveBulk,
      wideSleeve: outfit.robe,
      forearmRatio: sleeveRatio,
      shadowSide,
    });
    parts.push({ d: sleeveGeo.silhouette, fill: slColor, noStroke: true });
    if (!isEntity) {
      parts.push({
        d: sleeveGeo.celShadow,
        fill: darken(slColor, 0.26),
        fillOpacity: celAlpha,
        noStroke: true,
        body: false,
      });
    }
    parts.push({
      d: sleeveGeo.outline,
      fill: 'none',
      stroke: ink,
      strokeWidth: lw * 0.94,
      body: false,
    });
    if (!isEntity) {
      parts.push({
        d: sleeveGeo.anatomyCreases,
        fill: darken(slColor, 0.48),
        fillOpacity: 0.72,
        noStroke: true,
        body: false,
      });
    }

    // Armored gauntlet
    if (outfit.armor) {
      parts.push({
        d: buildForearmWrapPath(arm[1], arm[2], side, 0.28, 0.86, 27, 19),
        fill: darken(lighten(outfitMain, 0.28), shade),
      });
    }

    // Forearm-aligned organic fist / open casting hand for magic
    const isFrontArm = side === 1;
    const hasFrontWeapon = isFrontArm && layer.weaponProp && layer.weaponProp !== 'none';
    const isMagic = hasFrontWeapon && layer.weaponProp === 'magic-orb';
    const handR = isSlender ? 8.6 : outfit.armor ? 13.5 : 11.0;
    const handFill = outfit.armor ? darken(lighten(outfitMain, 0.25), shade) : armSkin;

    if (isMagic) {
      parts.push({
        d: anatomicalCastingHand(wrist, bareGeo.forearmUnit, handR, side),
        fill: handFill,
        stroke: armSkinInk,
      });
    } else if ((layer.pose === 'standing' || threeQuarter) && !hasFrontWeapon && !outfit.armor && !isEntity) {
      parts.push({
        d: anatomicalRelaxedHand(wrist, bareGeo.forearmUnit, handR, side),
        fill: handFill,
        stroke: armSkinInk,
      });
    } else {
      parts.push({
        d: anatomicalHandPath(wrist, bareGeo.forearmUnit, handR, side),
        fill: handFill,
        stroke: outfit.armor ? ink : armSkinInk,
      });
      if (!outfit.armor && !isEntity) {
        parts.push({
          d: anatomicalHandDetailPath(wrist, bareGeo.forearmUnit, handR, side),
          fill: darken(armSkin, 0.5),
          fillOpacity: 0.8,
          noStroke: true,
          body: false,
        });
      }
    }

    if (outfit.neonLines) {
      parts.push({
        d: taperedCurvePath(lerpP(arm[0], arm[1], 0.18), arm[1], lerpP(arm[1], arm[2], 0.86), 4.5),
        fill: accent,
        noStroke: true,
        body: false,
        attrs: { 'data-neon': 1 },
      });
    }
    return parts;
  };

  // On primitive-hunter, tuck back arm behind the fur shoulder mantle naturally!
  const backArmInBack = sk.backArmBehind || outfit.primitive;
  if (backArmInBack) upperBack.push(...armPart(sk.armBack, 0.14, -1));

  // Torso base (organic trapezius-to-hip Bézier silhouette).
  const sh = sk.shoulderHalf / (isSlender ? 52 : 72);
  if (!outfit.primitive || isEntity) {
    upperParts.push({ d: anatomicalTorsoPath(sk.shoulderHalf, isSlender, REF_HIP_Y), fill: outfitMain });
  }

  if (outfit.blazer) {
    upperParts.push({ d: `M-14 -472L14 -472L0 -400Z`, fill: '#F4F4F5' });
    upperParts.push({ d: `M-4 -466L4 -466L6 -380L0 -368L-6 -380Z`, fill: accent });
    upperParts.push({ d: `M-16 -472L${fmt(-34 * sh)} -460L-8 -392L0 -400Z`, fill: darken(outfitMain, 0.2) });
    upperParts.push({ d: `M16 -472L${fmt(34 * sh)} -460L8 -392L0 -400Z`, fill: darken(outfitMain, 0.2) });
  }
  if (outfit.gi) {
    upperParts.push({ d: `M-14 -472Q0 -415 26 -338L14 -332Q-8 -410 -20 -468Z`, fill: darken(outfitMain, 0.15) });
    upperParts.push({ d: `M14 -472L-12 -385L-18 -395L6 -470Z`, fill: darken(skin, 0.15) });
    upperParts.push({
      d: `M${fmt(-44 * sh)} -322Q0 -314 ${fmt(44 * sh)} -322L${fmt(46 * sh)} -298Q0 -290 ${fmt(-46 * sh)} -298Z`,
      fill: accent,
    });
    upperParts.push({
      d: `M6 -300Q16 -270 20 -242L12 -240Q8 -268 2 -298ZM-2 -298Q-10 -268 -14 -240L-22 -242Q-18 -270 -6 -300Z`,
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

  // Front arms (sculpted pauldrons on top for armor).
  if (!backArmInBack) upperParts.push(...armPart(sk.armBack, 0.1, -1));
  upperParts.push(...armPart(sk.armFront, 0, 1));
  if (outfit.armor) {
    const metal = lighten(outfitMain, 0.32);
    upperParts.push({ d: armorPauldronPath(-70 * sh, -454, -1), fill: metal });
    upperParts.push({ d: armorPauldronPath(70 * sh, -454, 1), fill: metal });
  }

  // Head base shape (smooth organic Manhwa V-jawline with warm skin-toned ink).
  const headFaceShape = profile
    ? MANHWA_FACE_PROFILE
    : isSlender
      ? MANHWA_FACE_FRONT_FEMALE
      : MANHWA_FACE_FRONT;
  const headParts: Part[] = [{ d: headFaceShape, fill: skin, stroke: skinInk, strokeWidth: lw * 0.92 }];
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
  const use3DHead = threeQuarter && !isEntity && !away;
  if (!use3DHead && (outfit.headband || accessories.includes('headband')) && !away) {
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
    shading === 'soft' ? 0.22 : shading === 'heavy' ? 0.44 : shading === 'dramatic-noir' ? 0.6 : 0.34;
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
        { offset: 0.55, color: '#000000', opacity: 0.04 },
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
        const strokeW = p.strokeWidth ?? (isDetailLine ? 1.4 : lw * 0.94);
        return el('path', {
          d: p.d,
          fill: p.fill,
          'fill-opacity': p.fillOpacity,
          stroke: p.noStroke ? undefined : (p.stroke ?? ink),
          'stroke-width': p.noStroke ? undefined : strokeW,
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

  // Parametric 3D-projected Manhwa head rig for true 3/4 perspective poses
  const head3D =
    threeQuarter && !isEntity && !away
      ? renderParametricHead3D({
          yawDeg: 34,
          pitchDeg: 4,
          isSlender,
          palette,
          eyeStyle: character.eyeStyle ?? 'sharp-hunter',
          hairStyle,
          expression: layer.expression,
          glowEyes: layer.glowEyes,
          lightDirection: lightDir,
          shadingIntensity: shading,
          rimColor: rim,
          lw,
          ink,
          defs,
          earring: accessories.includes('earring'),
          accent,
          masked: outfit.mask,
          headband: (outfit.headband || accessories.includes('headband')) && !away,
          primitiveOutfit: Boolean(outfit.primitive),
          coatColor: outfitMain,
          debugGuides: process.env.TOONCRAFT_DEBUG_HEAD_GUIDES === '1',
        })
      : null;

  const chinHandSvg =
    head3D && layer.framing === 'close-up' && !outfit.armor && (!layer.weaponProp || layer.weaponProp === 'none')
      ? anatomicalChinThinkHand(head3D.chinPoint, isSlender ? 0.84 : 0.95, skin, skinInk, lw)
      : '';

  // High-detail Hair Back & Hair Front SVG strings
  const hairBackSvg = head3D
    ? head3D.hairBackSvg
    : !outfit.hood
      ? renderAnimeHairBack(hairStyle, layer.pose, hair, ink, lw)
      : '';
  const hairFrontSvg = head3D
    ? ''
    : !outfit.hood && !outfit.hat
      ? renderAnimeHairFront(hairStyle, layer.pose, hair, accent, ink, lw, prng.fork('hair'), defs, rim)
      : outfit.hat
        ? renderAnimeHairFront('undercut-sleek', layer.pose, hair, accent, ink, lw, prng.fork('hair'), defs, rim)
        : '';

  // Neck + Collarbone Cel-Shading
  const neckSvg = head3D
    ? ''
    : !isEntity
      ? renderNeckAndCollarCelShade(skin, ink, lw, shading, lightDir, isSlender, threeQuarter)
      : '<path d="M-14 -504L14 -504L18 -466L-18 -466Z" fill="#07060C"/>';

  // Primitive Hunter specialized torso OR standard torso clothing folds
  const primitiveTorsoSvg =
    outfit.primitive && !isEntity
      ? renderPrimitiveHunterOutfit(outfitMain, accent, skin, ink, lw, sh)
      : '';
  const clothingFoldsSvg =
    !outfit.primitive && !isEntity ? renderTorsoClothingFolds(outfitMain, sh, shading) : '';

  // Optional Fur Collar / Bone Necklace / Cloak Clasp / Layered 3D Collar on non-primitive outfits
  let torsoAccessoriesSvg = '';
  if (!isEntity) {
    if (accessories.includes('fur-collar') && !outfit.primitive) {
      torsoAccessoriesSvg += renderFurCollarAccessory(outfitMain, ink, lw, sh);
    }
    if (accessories.includes('bone-necklace') && !outfit.primitive) {
      torsoAccessoriesSvg += renderBoneNecklace('#F1F5F9', '#CBD5E1', darken(accent, 0.35), ink, lw);
    }
    if (accessories.includes('cloak-clasp')) {
      const cw = isSlender ? 48 : 62;
      torsoAccessoriesSvg +=
        el('path', {
          d: `M-${fmt(cw)} -458Q0 -438 ${fmt(cw)} -458Q${fmt(cw - 8)} -430 0 -428Q-${fmt(cw - 8)} -430 -${fmt(cw)} -458Z`,
          fill: darken(outfitMain, 0.18),
          stroke: ink,
          'stroke-width': lw * 0.9,
          'stroke-linejoin': 'round',
        }) +
        el('path', {
          d: `M-${fmt(cw - 6)} -456Q0 -440 ${fmt(cw - 6)} -456Q${fmt(cw - 12)} -444 0 -440Q-${fmt(cw - 12)} -444 -${fmt(cw - 6)} -456Z`,
          fill: lighten(outfitMain, 0.14),
          'fill-opacity': 0.35,
        }) +
        el('path', { d: 'M0 -458L10 -448L0 -438L-10 -448Z', fill: accent, stroke: ink, 'stroke-width': lw * 0.85 }) +
        el('circle', { cx: 0, cy: -448, r: 3.5, fill: lighten(accent, 0.45) });
    }
  }

  // Ears & Facial Cel-Shading
  const earsSvg =
    !away && !isEntity
      ? renderAnimeEars(skin, ink, lw, profile, accessories.includes('earring'), accent, isSlender, threeQuarter)
      : '';
  const faceCelShadeSvg =
    !away && !isEntity
      ? renderFaceCelShading(
          skin,
          shading,
          lightDir,
          profile,
          !outfit.hood && hairStyle !== 'none',
          isSlender,
          character.hairStyle ?? 'spiky-manhwa',
          layer.expression,
          threeQuarter,
        )
      : '';

  // 6-Layer Anime Eyes, Brows, Nose & Mouth
  let faceDetailsSvg = '';
  const masked = outfit.mask;
  if (!away && !isEntity) {
    const eyeOpts = {
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
    };
    faceDetailsSvg = profile
      ? renderAnimeFaceProfile(palette, layer.expression, defs, lw, masked)
      : renderAnimeFaceFront(eyeOpts);
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
  const weaponPropName = layer.weaponProp ?? 'none';
  const weaponSvg = renderWeaponProp(
    weaponPropName,
    sk.armFront[2],
    layer.pose,
    accent,
    ink,
    lw,
    defs,
  );

  // Anatomical fingers wrapped over the weapon hilt/shaft
  let gripOverlay = '';
  if (weaponPropName !== 'none' && weaponPropName !== 'magic-orb') {
    const wrist = sk.armFront[2];
    const elbow = sk.armFront[1];
    const uFore = unit(sub(wrist, elbow));
    const handR = isSlender ? 8.6 : outfit.armor ? 13.5 : 11.0;
    const handFill = outfit.armor ? darken(lighten(outfitMain, 0.25), 0.15) : skin;
    const handInk = outfit.armor ? ink : skinInk;
    gripOverlay = anatomicalWeaponGripFingers(wrist, uFore, handR, 1, handFill, handInk, lw);
  }

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
  // Heroic proportions: shrink the head toward the neck base so the figure reads ~25% less bobblehead.
  const headTransform = `translate(0 -478) scale(0.78) translate(0 478)`;
  const rimOffset = 4.5 / s;
  const rimDir = lightDir === 'right' ? 1 : -1;
  const rimPass =
    `<g transform="translate(${fmt(rimOffset * rimDir * flip)} ${fmt(-rimOffset * 0.6)})">` +
    renderRim([...backLayer, ...legParts]) +
    `<g transform="${upperTransform}">${renderRim(upperAll)}<g transform="${headTransform}">${renderRim(head3D ? [...hoodBack, ...upperFront] : [...hoodBack, ...headParts, ...upperFront])}</g></g></g>`;

  const headContent = head3D
    ? head3D.neckAndCollarSvg +
      head3D.headSvg +
      faceOverlay +
      renderBase(upperFront) +
      renderShade(upperFront.filter((p) => p.body !== false)) +
      eyesGlow +
      chinHandSvg
    : earsSvg +
      renderBase(headParts) +
      faceCelShadeSvg +
      renderShade(headParts.slice(-1)) +
      faceDetailsSvg +
      faceOverlay +
      hairFrontSvg +
      renderBase(upperFront) +
      renderShade(upperFront.filter((p) => p.body !== false)) +
      eyesGlow;

  const body =
    aura +
    rimPass +
    wisps +
    renderBase([...backLayer, ...legParts]) +
    renderShade([...backLayer, ...legParts]) +
    `<g transform="${upperTransform}">` +
    renderBase(upperBack) +
    `<g transform="${headTransform}">${hairBackSvg}${renderBase(hoodBack)}</g>` +
    neckSvg +
    primitiveTorsoSvg +
    renderBase(upperParts) +
    clothingFoldsSvg +
    torsoAccessoriesSvg +
    renderShade(upperAll) +
    `<g transform="${headTransform}">` +
    headContent +
    '</g>' +
    weaponSvg +
    gripOverlay +
    customDetailSvg +
    '</g>';

  return `<g transform="${transform}" data-character="${character.id}">${body}</g>`;
}
