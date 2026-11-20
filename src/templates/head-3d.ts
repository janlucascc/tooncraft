import type { CharacterPalette, EyeStyle } from '../schema/character.js';
import type { Expression, LightDirection, ShadingIntensity } from '../schema/visual-layer.js';
import {
  type DefsCollector,
  darken,
  el,
  fmt,
  lighten,
  linearGradient,
  mix,
} from '../components/svg-utils.js';
import { ANIME_EXPRESSIONS, type ResolvedHairStyle } from './anime-features.js';
import { variableStrokeFromSegments } from './manhwa-ink.js';
import { renderManhwaHair3D } from './manhwa-hair.js';

/**
 * Parametric 3D-Projected Manhwa Head & Upper-Torso Rig (0° → 90° continuous yaw).
 *
 * Fase 1 upgraded anatomy:
 *  - True Manhwa neck proportions (~43% male / ~36% female head width, ~22px visible height)
 *    originating behind the skull base and anchoring smoothly into rotated 3/4 shoulders.
 *  - Curved mandibular jawline, sculpted far eye-orbit indent + cheekbone, and smoothly
 *    rounded chin (no ruler-straight diagonals or needle chin).
 *  - +15% larger expressive eyes with breathing room from the far edge, and compact ears
 *    seated strictly between eye-line and nose-tip height.
 *  - Built-in silhouette-only mode and 3D construction-guide debug mode for head-sheet QA.
 *
 * Strictly pure SVG paths — zero nested <clipPath> for @resvg/resvg-js safety.
 */

export interface P2 {
  x: number;
  y: number;
}

export interface ProjPt extends P2 {
  z: number;
  s: number;
}

export interface Head3DOptions {
  /** Yaw in degrees: 0 = front, 30..45 = three-quarter right, 90 = side profile right. */
  yawDeg: number;
  /** Pitch in degrees: slight chin tuck (+3..+5). */
  pitchDeg?: number;
  isSlender: boolean;
  palette: CharacterPalette;
  eyeStyle: EyeStyle;
  hairStyle: ResolvedHairStyle;
  expression: Expression;
  glowEyes: boolean;
  lightDirection: LightDirection;
  shadingIntensity: ShadingIntensity;
  rimColor: string;
  lw: number;
  ink: string;
  defs: DefsCollector;
  earring: boolean;
  accent: string;
  masked?: boolean;
  headband?: boolean;
  primitiveOutfit?: boolean;
  collarColor?: string;
  coatColor?: string;
  /** Render solid black silhouette for proportion & silhouette QA. */
  silhouetteOnly?: boolean;
  /** Overlay 3D construction guides (cranium, curved centerline, eye line, ear root). */
  debugGuides?: boolean;
}

export interface Head3DResult {
  neckAndCollarSvg: string;
  hairBackSvg: string;
  headSvg: string;
  chinPoint: P2;
}

const HEAD_CX = 0;
const HEAD_CY = -542;
const FOCAL = 340;

function makeProjector(yawDeg: number, pitchDeg: number) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);

  return (x: number, y: number, z: number): ProjPt => {
    const x1 = x * cosY + z * sinY;
    const z1 = -x * sinY + z * cosY;
    const y2 = y * cosP - z1 * sinP;
    const z2 = y * sinP + z1 * cosP;
    const s = FOCAL / (FOCAL - z2);
    return { x: HEAD_CX + x1 * s, y: HEAD_CY + y2 * s, z: z2, s };
  };
}

function pt(p: P2): string {
  return `${fmt(p.x)} ${fmt(p.y)}`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function renderParametricHead3D(opts: Head3DOptions): Head3DResult {
  const {
    yawDeg: rawYaw,
    pitchDeg = 4,
    isSlender,
    palette,
    eyeStyle,
    hairStyle,
    expression,
    glowEyes,
    shadingIntensity,
    rimColor,
    lw,
    ink,
    defs,
    earring,
    accent,
    masked = false,
    headband = false,
    primitiveOutfit = false,
    collarColor = '#E2E8F0',
    coatColor = palette.outfitPrimary,
    silhouetteOnly = false,
    debugGuides = false,
  } = opts;

  const yawDeg = clamp(rawYaw, 0, 90);
  const yawRad = (yawDeg * Math.PI) / 180;
  const yawT = yawDeg / 90; // 0 (front) → 1 (profile)
  const isFrontBlend = clamp(1 - yawDeg / 18, 0, 1);

  const proj = makeProjector(yawDeg, pitchDeg);
  const spec = ANIME_EXPRESSIONS[expression];

  const silColor = '#0B0F19';
  const skin = silhouetteOnly ? silColor : palette.skin;
  const skinInk = silhouetteOnly ? silColor : mix(darken(palette.skin, 0.66), ink, 0.42);
  const skinShade = darken(
    palette.skin,
    shadingIntensity === 'soft' ? 0.14 : shadingIntensity === 'dramatic-noir' ? 0.28 : 0.19,
  );
  const skinDeep = darken(palette.skin, 0.46);
  const strokeInk = silhouetteOnly ? silColor : ink;

  // Cranium dimensions (balanced Manhwa proportions: slender female vs athletic male)
  const rx = isSlender ? 34.5 : 37.5;
  const ry = isSlender ? 37.0 : 39.0;
  const rz = isSlender ? 35.5 : 38.0;

  const surf = (thetaDeg: number, y: number, rScale = 1.0): ProjPt => {
    const th = (thetaDeg * Math.PI) / 180;
    const yNorm = clamp(y / ry, -0.96, 0.96);
    const ring = Math.sqrt(Math.max(0.08, 1 - yNorm * yNorm * 0.72));
    return proj(Math.sin(th) * rx * ring * rScale, y, Math.cos(th) * rz * ring * rScale);
  };

  // Anatomical vertical landmarks (true Manhwa ratio: eyes slightly below mid-cranium for rich hair crown!)
  const topY = -ry;
  const hairlineY = -ry * 0.58;
  const browY = -ry * 0.11;
  const eyeY = ry * 0.16;
  const cheekY = ry * 0.42;
  const noseY = ry * 0.50;
  const mouthY = ry * 0.74;
  const chinY = isSlender ? ry * 1.06 : ry * 1.11;

  // Key 3D-projected face landmarks
  const skullTop = proj(0, topY, 0);
  const farAz = 90 - yawDeg;
  const nearAz = -90 - yawDeg;

  const farTemple = surf(farAz, hairlineY + 4, 1.0);
  const farBrow = surf(farAz - 4, browY + 2, 0.99);
  // Clear inward orbit dip + sculpted cheekbone projection on 3/4 angles with C1 tangent continuity
  const orbitIndent = lerp(1.0, 0.89, Math.sin(yawRad * 2));
  const cheekPush = lerp(0.99, 1.02, Math.sin(yawRad * 1.8));
  const farOrbit = surf(farAz - 6, eyeY + 3, orbitIndent);
  const farCheek = surf(farAz - 5, cheekY, cheekPush);
  const rawLowerCheek = surf(farAz - 12, mouthY - 1.5, 0.91);
  const c1LowerCheek = {
    x: farCheek.x + 0.6667 * (farCheek.x - farOrbit.x),
    y: farCheek.y + 0.6667 * (farCheek.y - farOrbit.y),
    z: farCheek.z + 0.6667 * (farCheek.z - farOrbit.z),
    s: farCheek.s,
  };
  const farLowerCheek: ProjPt = {
    x: lerp(c1LowerCheek.x, rawLowerCheek.x, 0.35),
    y: lerp(c1LowerCheek.y, rawLowerCheek.y, 0.45),
    z: lerp(c1LowerCheek.z, rawLowerCheek.z, 0.4),
    s: farCheek.s,
  };

  // Smoothly rounded chin (left / center / right so there is NEVER a sharp needle tip!)
  const chinW = isSlender ? 5.2 : 6.8;
  const chinPt = proj(0, chinY, rz * 0.56);
  const chinRight = proj(chinW, chinY - 1.2, rz * 0.54);
  const chinLeft = proj(-chinW, chinY - 1.2, rz * 0.54);

  // Curved mandibular jawline on the near side (smooth tangent flow through jaw angle)
  const nearJawLower = proj(-rx * 0.48, chinY - 6.0, rz * 0.24);
  const nearJawAngle = proj(-rx * 0.77, mouthY + 2.0, -rz * 0.04);
  const nearUpperJaw = proj(-rx * 0.89, cheekY + 2.5, -rz * 0.12);
  const earRoot = proj(-rx * 0.92, eyeY + 7, -rz * 0.18);
  const farEarRoot = proj(rx * 0.92, eyeY + 7, -rz * 0.18);

  const backCranium = surf(nearAz, -4, 1.03);
  const backTop = surf(nearAz, -ry * 0.68, 1.02);

  // Profile nose/lips silhouette points (smoothly emerge & shift with 3/4 yaw)
  const noseOffsetX = lerp(0, rx * 0.12, yawT);
  const noseBridge3D = proj(noseOffsetX * 0.7, eyeY + 1.5, rz * 0.97);
  const noseTip3D = proj(noseOffsetX, noseY, rz * 1.22);
  const noseBase3D = proj(noseOffsetX * 0.85, noseY + 3.6, rz * 0.96);
  const upperLip3D = proj(0, mouthY - 2.6, rz * 1.03);
  const lipIndent3D = proj(0, mouthY + 0.2, rz * 0.94);
  const lowerLip3D = proj(0, mouthY + 3.0, rz * 1.0);
  const chinIndent3D = proj(0, mouthY + 6.5, rz * 0.86);

  // -------------------------------------------------------------------------
  // 1. Face Silhouette Contour (continuous 0° → 90°, rounded chin & curved jaw)
  // -------------------------------------------------------------------------
  let faceD = '';
  if (yawDeg >= 58) {
    // Sculpted 60°..90° profile silhouette with projecting nose bridge, lips, and curved chin
    faceD =
      `M${pt(skullTop)}` +
      `C${pt(proj(rx * 0.54, topY + 2, rz * 0.36))} ${pt(farTemple)} ${pt(farBrow)}` +
      `Q${pt(farOrbit)} ${pt(noseBridge3D)}` +
      `L${pt(noseTip3D)}` +
      `Q${fmt(noseTip3D.x - 1)} ${fmt(noseBase3D.y)} ${pt(noseBase3D)}` +
      `Q${fmt(upperLip3D.x + 1.5)} ${fmt(upperLip3D.y - 1)} ${pt(upperLip3D)}` +
      `L${pt(lipIndent3D)}` +
      `Q${fmt(lowerLip3D.x + 1)} ${fmt(lowerLip3D.y)} ${pt(lowerLip3D)}` +
      `Q${pt(chinIndent3D)} ${pt(chinPt)}` +
      `C${pt(nearJawLower)} ${pt(nearJawAngle)} ${pt(earRoot)}` +
      `C${pt(backCranium)} ${pt(backTop)} ${pt(skullTop)}Z`;
  } else if (yawDeg <= 4) {
    // Clean symmetric front silhouette with smooth cheekbone and gently rounded chin
    const cheekR = proj(rx * 0.96, eyeY + 6, rz * 0.14);
    const jawR = proj(rx * 0.78, mouthY + 1.5, rz * 0.18);
    const cheekL = proj(-rx * 0.96, eyeY + 6, rz * 0.14);
    const jawL = proj(-rx * 0.78, mouthY + 1.5, rz * 0.18);
    faceD =
      `M${pt(skullTop)}` +
      `C${pt(proj(rx * 0.65, topY, rz * 0.1))} ${pt(proj(rx * 1.02, hairlineY + 6, rz * 0.08))} ${pt(cheekR)}` +
      `C${pt(proj(rx * 0.92, cheekY + 6, rz * 0.16))} ${pt(jawR)} ${pt(chinRight)}` +
      `Q${pt(chinPt)} ${pt(chinLeft)}` +
      `C${pt(jawL)} ${pt(proj(-rx * 0.92, cheekY + 6, rz * 0.16))} ${pt(cheekL)}` +
      `C${pt(proj(-rx * 1.02, hairlineY + 6, rz * 0.08))} ${pt(proj(-rx * 0.65, topY, rz * 0.1))} ${pt(skullTop)}Z`;
  } else {
    // Smooth 15°..65° three-quarter silhouette: orbit indent, sculpted cheekbone, curved jaw, rounded chin
    faceD =
      `M${pt(skullTop)}` +
      `C${pt(proj(rx * 0.56, topY + 2, rz * 0.28))} ${pt(farTemple)} ${pt(farBrow)}` +
      `Q${pt(farOrbit)} ${pt(farCheek)}` +
      `C${pt(farLowerCheek)} ${pt(proj(rx * 0.34, chinY - 4.5, rz * 0.52))} ${pt(chinRight)}` +
      `Q${pt(chinPt)} ${pt(chinLeft)}` +
      `C${pt(nearJawLower)} ${pt(nearJawAngle)} ${pt(nearUpperJaw)}` +
      `Q${fmt(earRoot.x - 1)} ${fmt((nearUpperJaw.y + earRoot.y) * 0.5)} ${pt(earRoot)}` +
      `C${pt(backCranium)} ${pt(backTop)} ${pt(skullTop)}Z`;
  }

  // -------------------------------------------------------------------------
  // 2. Refined Manhwa Neck (~43% male / ~36% female width, ~22px visible)
  //    & Rotated 3/4 Shoulders + Layered Collar (visible inside close-ups!)
  // -------------------------------------------------------------------------
  const neckHalfRatio = isSlender ? 0.35 : 0.42;
  const neckBackTop = proj(
    -rx * (neckHalfRatio + 0.04 * yawT),
    chinY - 19,
    -rz * (0.24 + 0.14 * yawT),
  );
  const neckFrontTop = proj(
    rx * (neckHalfRatio - 0.18 * yawT),
    chinY - 10,
    rz * (0.12 - 0.04 * yawT),
  );

  // Realistic short Manhwa neck: collar top sits right up at y = -482..-484 (~14-16px below chin!)
  const collarY = isSlender ? -484 : -482;
  const neckLeanX = -2.2 * yawT;
  const neckBackBot = { x: neckBackTop.x + neckLeanX - 2.0, y: collarY + 10 };
  const neckFrontBot = { x: neckFrontTop.x + neckLeanX + 1.5, y: collarY + 12 };

  // Rotated 3/4 shoulders (near shoulder broad on left, far shoulder foreshortened on right!)
  const baseShoulderW = isSlender ? 58 : 76;
  const nearShoulderX = -baseShoulderW * lerp(1.0, 0.88, yawT) - 10 * yawT;
  const farShoulderX = baseShoulderW * lerp(1.0, 0.44, yawT) + 6 * yawT;
  const shoulderY = collarY + 20;
  const coatBottomY = collarY + 66;

  let neckAndCollarSvg = '';

  // Outer Coat & Rotated Shoulders Base (drawn behind collar flaps so head is anchored to a real body!)
  const coatFill = silhouetteOnly ? silColor : coatColor;
  const coatShade = darken(coatColor, 0.24);
  const coatD =
    `M${fmt(nearShoulderX - 10)} ${fmt(coatBottomY)}` +
    `C${fmt(nearShoulderX - 6)} ${fmt(shoulderY + 6)} ${fmt(nearShoulderX + 8)} ${fmt(shoulderY - 4)} ${fmt(neckBackBot.x - 10)} ${fmt(collarY + 2)}` +
    `L${fmt(neckFrontBot.x + 8)} ${fmt(collarY + 5)}` +
    `C${fmt(farShoulderX - 4)} ${fmt(shoulderY - 2)} ${fmt(farShoulderX + 8)} ${fmt(shoulderY + 10)} ${fmt(farShoulderX + 12)} ${fmt(coatBottomY)}Z`;
  neckAndCollarSvg += el('path', {
    d: coatD,
    fill: coatFill,
    stroke: strokeInk,
    'stroke-width': lw * 0.95,
    'stroke-linejoin': 'round',
  });
  if (!silhouetteOnly) {
    // Subtle shoulder fold shadow on near shoulder
    neckAndCollarSvg += el('path', {
      d: `M${fmt(nearShoulderX + 4)} ${fmt(shoulderY + 4)}Q${fmt(nearShoulderX + 22)} ${fmt(shoulderY + 20)} ${fmt(nearShoulderX + 18)} ${fmt(coatBottomY)}L${fmt(nearShoulderX - 8)} ${fmt(coatBottomY)}C${fmt(nearShoulderX - 4)} ${fmt(shoulderY + 12)} ${fmt(nearShoulderX)} ${fmt(shoulderY + 6)} ${fmt(nearShoulderX + 4)} ${fmt(shoulderY + 4)}Z`,
      fill: coatShade,
      'fill-opacity': 0.55,
    });
  }

  // Base Neck Column (slender, natural curve into trapezius — NOT a giant pole!)
  const neckD =
    `M${pt(neckBackTop)}` +
    `C${fmt(neckBackTop.x - 1)} ${fmt((neckBackTop.y + neckBackBot.y) * 0.5)} ${fmt(neckBackBot.x)} ${fmt(neckBackBot.y - 4)} ${pt(neckBackBot)}` +
    `L${pt(neckFrontBot)}` +
    `C${fmt(neckFrontBot.x)} ${fmt(neckFrontBot.y - 4)} ${fmt(neckFrontTop.x + 1)} ${fmt((neckFrontTop.y + neckFrontBot.y) * 0.5)} ${pt(neckFrontTop)}Z`;
  neckAndCollarSvg += el('path', { d: neckD, fill: skin });

  if (!silhouetteOnly) {
    // Curved under-jaw cast shadow following the jawline contour (NOT a horizontal rectangle!)
    const shadowMidX = (neckBackTop.x + neckFrontTop.x) * 0.5;
    const shadowPeakY = chinPt.y + 9;
    neckAndCollarSvg += el('path', {
      d: `M${pt(neckBackTop)}L${pt(neckFrontTop)}L${fmt(neckFrontTop.x + 0.4)} ${fmt(chinPt.y + 5)}Q${fmt(shadowMidX + 2)} ${fmt(shadowPeakY + 3)} ${fmt(neckBackTop.x - 0.6)} ${fmt(neckBackTop.y + 16)}Z`,
      fill: skinShade,
      'fill-opacity': 0.85,
    });
    // Variable-weight calligraphic neck outer contours (thick under jaw, tapering toward collar)
    neckAndCollarSvg += variableStrokeFromSegments(
      [
        {
          p0: neckBackTop,
          p1: { x: neckBackTop.x - 1.2, y: (neckBackTop.y + neckBackBot.y) * 0.5 },
          p2: neckBackBot,
          wStart: lw * 1.15,
          wMid: lw * 0.85,
          wEnd: lw * 0.45,
        },
      ],
      skinInk,
    );
    neckAndCollarSvg += variableStrokeFromSegments(
      [
        {
          p0: neckFrontTop,
          p1: { x: neckFrontTop.x + 0.8, y: (neckFrontTop.y + neckFrontBot.y) * 0.5 },
          p2: neckFrontBot,
          wStart: lw * 0.95,
          wMid: lw * 0.72,
          wEnd: lw * 0.35,
        },
      ],
      skinInk,
    );
    // Delicate tapered sternocleidomastoid line
    neckAndCollarSvg += variableStrokeFromSegments(
      [
        {
          p0: { x: neckBackTop.x + 4, y: neckBackTop.y + 10 },
          p1: { x: shadowMidX - 1, y: collarY + 1 },
          p2: { x: neckFrontBot.x - 6, y: collarY + 10 },
          wStart: 0.14,
          wMid: lw * 0.38,
          wEnd: 0.12,
        },
      ],
      skinDeep,
      0.48,
    );
  }

  // Collar / Shoulder Neckline (rugged fur/hide wrap for primitiveOutfit vs tailored V-neck collar)
  const nb = neckBackBot;
  const nf = neckFrontBot;
  const shoulderCenterX = (nearShoulderX + farShoulderX) * 0.5;
  const collarMidX = lerp((nb.x + nf.x) * 0.5, shoulderCenterX, 0.25) + 6 * yawT;
  const vBottomY = collarY + 28;

  if (primitiveOutfit) {
    // Rugged primitive hide/fur shoulder mantle wrapping the neck base (no dress shirt collar!)
    const furBase = silhouetteOnly ? silColor : darken(coatColor, 0.16);
    const furHighlight = silhouetteOnly ? silColor : lighten(coatColor, 0.12);
    neckAndCollarSvg += el('path', {
      d:
        `M${fmt(nb.x - 12)} ${fmt(collarY + 2)}` +
        `Q${fmt(collarMidX)} ${fmt(collarY + 18)} ${fmt(nf.x + 10)} ${fmt(collarY + 4)}` +
        `L${fmt(nf.x + 18)} ${fmt(vBottomY + 4)}` +
        `L${fmt( collarMidX + 8 )} ${fmt(vBottomY - 2)}` +
        `L${fmt(collarMidX)} ${fmt(vBottomY + 8)}` +
        `L${fmt(collarMidX - 10)} ${fmt(vBottomY - 1)}` +
        `L${fmt(nb.x - 20)} ${fmt(vBottomY + 5)}Z`,
      fill: furBase,
      stroke: strokeInk,
      'stroke-width': lw * 0.88,
      'stroke-linejoin': 'round',
    });
    if (!silhouetteOnly) {
      neckAndCollarSvg += el('path', {
        d: `M${fmt(nb.x - 10)} ${fmt(collarY + 4)}Q${fmt(collarMidX)} ${fmt(collarY + 16)} ${fmt(nf.x + 8)} ${fmt(collarY + 5)}L${fmt(nf.x + 4)} ${fmt(collarY + 12)}Q${fmt(collarMidX)} ${fmt(collarY + 22)} ${fmt(nb.x - 6)} ${fmt(collarY + 11)}Z`,
        fill: furHighlight,
        'fill-opacity': 0.55,
      });
    }
  } else {
    const collarFill = silhouetteOnly ? silColor : collarColor;
    const collarShade = darken(collarColor, 0.22);

    // Inner open shirt V-neck base anchored directly to neckBackBot/neckFrontBot
    neckAndCollarSvg += el('path', {
      d: `M${fmt(nb.x - 2)} ${fmt(collarY)}L${fmt(collarMidX + 2)} ${fmt(vBottomY)}L${fmt(nf.x + 2)} ${fmt(collarY + 2)}L${fmt(nf.x + 10)} ${fmt(vBottomY + 6)}L${fmt(nb.x - 12)} ${fmt(vBottomY + 6)}Z`,
      fill: silhouetteOnly ? silColor : darken(collarColor, 0.14),
      stroke: strokeInk,
      'stroke-width': lw * 0.8,
      'stroke-linejoin': 'round',
    });
    // Near standing/folded shirt collar sweeping diagonally from behind nape down to chest V
    const nearLapelTipX = collarMidX + lerp(-2, 18, yawT);
    const nearLapelTipY = vBottomY + 2;
    neckAndCollarSvg += el('path', {
      d: `M${fmt(nb.x - 4)} ${fmt(collarY - 5)}Q${fmt(nb.x + 8)} ${fmt(collarY + 4)} ${fmt(nearLapelTipX)} ${fmt(nearLapelTipY)}L${fmt(nb.x - 14)} ${fmt(collarY + 16)}Q${fmt(nb.x - 12)} ${fmt(collarY + 2)} ${fmt(nb.x - 4)} ${fmt(collarY - 5)}Z`,
      fill: collarFill,
      stroke: strokeInk,
      'stroke-width': lw * 0.88,
      'stroke-linejoin': 'round',
    });
    if (!silhouetteOnly) {
      neckAndCollarSvg += el('path', {
        d: `M${fmt(nb.x - 4)} ${fmt(collarY - 5)}Q${fmt(nb.x + 4)} ${fmt(collarY + 5)} ${fmt(nearLapelTipX - 6)} ${fmt(nearLapelTipY - 1)}L${fmt(nb.x - 14)} ${fmt(collarY + 16)}Z`,
        fill: collarShade,
        'fill-opacity': 0.52,
      });
    }
    // Far folded collar flap (shrinks gracefully as yaw → 90°)
    if (yawDeg < 60) {
      const farLapelW = lerp(14, 6, yawT);
      neckAndCollarSvg += el('path', {
        d: `M${fmt(nf.x + 2)} ${fmt(collarY)}L${fmt(nf.x + farLapelW)} ${fmt(collarY + 15)}L${fmt(collarMidX + 4)} ${fmt(vBottomY)}L${fmt(nf.x - 1)} ${fmt(collarY + 9)}Z`,
        fill: collarFill,
        stroke: strokeInk,
        'stroke-width': lw * 0.88,
        'stroke-linejoin': 'round',
      });
    }
  }

  // -------------------------------------------------------------------------
  // 3. Hair Back / Nape (anchored directly to back of 3D cranium)
  // -------------------------------------------------------------------------
  const hairBase = palette.hair;
  const hairDark = silhouetteOnly ? silColor : darken(hairBase, 0.22);
  const hairDeep = darken(hairBase, 0.42);
  const hairAtmoId = defs.once(`hair3d-atmo-${hairBase}-${rimColor}`, 'h3datmo', (id) =>
    linearGradient(
      id,
      [
        { offset: 0, color: mix(hairBase, rimColor, 0.42) },
        { offset: 0.36, color: hairBase },
        { offset: 1, color: darken(hairBase, 0.14) },
      ],
      135,
    ),
  );
  const hairFill = silhouetteOnly ? silColor : `url(#${hairAtmoId})`;
  const angelColor = mix(lighten(hairBase, 0.5), rimColor, 0.26);

  const nearEarTopRef = { x: earRoot.x - 1.5, y: earRoot.y - 7.5 };
  const hairRes =
    hairStyle !== 'none' && hairStyle !== 'hooded-shadow'
      ? renderManhwaHair3D({
          proj3d: {
            surf,
            proj,
            rx,
            ry,
            rz,
            yawDeg,
            yawT,
            nearAz,
            farAz,
            earTop: nearEarTopRef,
            jawAngle: nearJawAngle,
            chinPt,
            collarY,
          },
          hairStyle,
          isFemale: isSlender,
          hairFill,
          hairBase,
          hairDark,
          hairDeep,
          angelColor,
          ink: strokeInk,
          lw,
          silhouetteOnly,
        })
      : { hairBackSvg: '', hairFrontSvg: '' };
  const hairBackSvg = hairRes.hairBackSvg;

  // -------------------------------------------------------------------------
  // 4. Head Base + Variable-Weight Calligraphic Contour + Cel-Shading + Ear
  // -------------------------------------------------------------------------
  let headSvg = '';
  headSvg += el('path', { d: faceD, fill: skin });

  if (!silhouetteOnly) {
    // Variable-weight calligraphic face & jawline contour (zero uniform stroke!)
    if (yawDeg > 4 && yawDeg < 58) {
      headSvg += variableStrokeFromSegments(
        [
          {
            p0: farTemple,
            p1: farBrow,
            p2: farCheek,
            wStart: lw * 0.4,
            wMid: lw * 0.65,
            wEnd: lw * 0.78,
          },
          {
            p0: farCheek,
            p1: farLowerCheek,
            p2: chinRight,
            wStart: lw * 0.78,
            wMid: lw * 0.92,
            wEnd: lw * 1.05,
          },
          {
            p0: chinRight,
            p1: chinPt,
            p2: chinLeft,
            wStart: lw * 1.05,
            wMid: lw * 1.2,
            wEnd: lw * 1.25,
          },
          {
            p0: chinLeft,
            p1: nearJawLower,
            p2: nearJawAngle,
            wStart: lw * 1.25,
            wMid: lw * 1.35,
            wEnd: lw * 1.15,
          },
          {
            p0: nearJawAngle,
            p1: { x: (nearJawAngle.x + earRoot.x) * 0.52, y: (nearJawAngle.y + earRoot.y + 8.5) * 0.5 },
            p2: { x: earRoot.x + 0.8, y: earRoot.y + 8.5 },
            wStart: lw * 1.15,
            wMid: lw * 0.68,
            wEnd: 0.18,
          },
        ],
        skinInk,
      );
    } else {
      headSvg += el('path', {
        d: faceD,
        fill: 'none',
        stroke: skinInk,
        'stroke-width': lw * 0.85,
        'stroke-linejoin': 'round',
      });
    }
  }

  if (!silhouetteOnly) {
    // Smooth lateral cel-shadow along back/jaw plane
    const shadeD =
      `M${pt(skullTop)}` +
      `C${pt(backTop)} ${pt(backCranium)} ${pt(earRoot)}` +
      `Q${fmt(earRoot.x - 1)} ${fmt((nearUpperJaw.y + earRoot.y) * 0.5)} ${pt(nearUpperJaw)}` +
      `C${pt(nearJawAngle)} ${pt(nearJawLower)} ${pt(chinLeft)}` +
      `Q${pt(chinPt)} ${fmt(chinPt.x - 8)} ${fmt(chinPt.y - 4)}` +
      `C${fmt(nearJawAngle.x + 10)} ${fmt(nearJawAngle.y - 6)} ${fmt(earRoot.x + 12)} ${fmt(earRoot.y - 5)} ${fmt(backCranium.x + 15)} ${fmt(backCranium.y)}` +
      `C${fmt(backTop.x + 15)} ${fmt(backTop.y)} ${pt(skullTop)}Z`;
    headSvg += el('path', { d: shadeD, fill: skinShade, 'fill-opacity': 0.58 });

    // Soft bangs drop shadow on forehead
    if (hairStyle !== 'none' && hairStyle !== 'hooded-shadow') {
      const fl = surf(-46, hairlineY + 4, 1.0);
      const fm = surf(0, hairlineY + 10, 1.0);
      const fr = surf(40, hairlineY + 5, 1.0);
      headSvg += el('path', {
        d: `M${pt(fl)}Q${pt(surf(0, hairlineY - 6, 1.0))} ${pt(fr)}Q${fmt(fr.x - 5)} ${fmt(fr.y + 7)} ${pt(fm)}Q${fmt(fl.x + 7)} ${fmt(fl.y + 8)} ${pt(fl)}Z`,
        fill: skinShade,
        'fill-opacity': 0.38,
      });
    }
  }

  // Compact anatomical ear seated strictly between eye-line and nose-tip height (~17px tall!) with perspective scaling
  const drawEar = (root: ProjPt, side: -1 | 1, perspectiveScale = 1.0) => {
    const earTop = { x: root.x + side * 1.5 * perspectiveScale, y: root.y - 7.5 * perspectiveScale };
    const earOuter = { x: root.x + side * 8.5 * perspectiveScale, y: root.y + 0.5 * perspectiveScale };
    const earLobe = { x: root.x + side * 1.5 * perspectiveScale, y: root.y + 10.5 * perspectiveScale };
    const earInnerBot = { x: root.x - side * 3.0 * perspectiveScale, y: root.y + 7.0 * perspectiveScale };
    headSvg += el('path', {
      d: `M${pt(earTop)}C${fmt(earOuter.x + side * 0.8 * perspectiveScale)} ${fmt(earTop.y - 1.5 * perspectiveScale)} ${fmt(earOuter.x + side * 1.2 * perspectiveScale)} ${fmt(earOuter.y + 4.5 * perspectiveScale)} ${pt(earLobe)}Q${fmt(earInnerBot.x)} ${fmt(earLobe.y + 0.8 * perspectiveScale)} ${pt(earInnerBot)}`,
      fill: skin,
      stroke: skinInk,
      'stroke-width': lw * 0.85,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    if (!silhouetteOnly) {
      headSvg += el('path', {
        d: `M${fmt(earTop.x + side * 0.5 * perspectiveScale)} ${fmt(earTop.y + 3 * perspectiveScale)}C${fmt(earOuter.x - side * 2.5 * perspectiveScale)} ${fmt(earOuter.y - 1.5 * perspectiveScale)} ${fmt(earOuter.x - side * 2.5 * perspectiveScale)} ${fmt(earOuter.y + 5.5 * perspectiveScale)} ${fmt(earLobe.x)} ${fmt(earLobe.y - 2.5 * perspectiveScale)}Z`,
        fill: skinShade,
      });
      headSvg += el('path', {
        d: `M${fmt(earTop.x + side * 0.5 * perspectiveScale)} ${fmt(earTop.y + 3 * perspectiveScale)}C${fmt(earOuter.x - side * 2.5 * perspectiveScale)} ${fmt(earOuter.y - 1 * perspectiveScale)} ${fmt(earOuter.x - side * 2.5 * perspectiveScale)} ${fmt(earOuter.y + 5 * perspectiveScale)} ${fmt(earLobe.x)} ${fmt(earLobe.y - 2.5 * perspectiveScale)}`,
        fill: 'none',
        stroke: skinDeep,
        'stroke-width': lw * 0.5,
        'stroke-linecap': 'round',
      });
    }
    if (earring && !silhouetteOnly && side === -1) {
      headSvg += el('circle', {
        cx: earLobe.x,
        cy: earLobe.y + 1.8,
        r: 2.0,
        fill: accent,
        stroke: ink,
        'stroke-width': 0.5,
      });
      headSvg += el('path', {
        d: `M${fmt(earLobe.x)} ${fmt(earLobe.y + 3.6)}L${fmt(earLobe.x - 1.8)} ${fmt(earLobe.y + 10.5)}L${fmt(earLobe.x)} ${fmt(earLobe.y + 13.2)}L${fmt(earLobe.x + 1.8)} ${fmt(earLobe.y + 10.5)}Z`,
        fill: accent,
        stroke: ink,
        'stroke-width': 0.45,
      });
    }
    return earTop;
  };

  const nearEarPerspective = clamp(lerp(1.0, 0.86, yawT), 0.72, 1.0);
  drawEar(earRoot, -1, nearEarPerspective);
  if (yawDeg <= 22) {
    const farEarPerspective = clamp(lerp(0.85, 0.35, yawT), 0.3, 0.85);
    drawEar(farEarRoot, 1, farEarPerspective);
  }

  // -------------------------------------------------------------------------
  // 5. 3D-Projected Eyes (+15% larger, clean far-edge breathing room),
  //    Eyebrows, Refined Nose & Mouth
  // -------------------------------------------------------------------------
  if (!silhouetteOnly) {
    const hideEyes = expression === 'shadowed' || expression === 'menacing-glow';
    const irisBase = palette.eyes;
    const irisTop = darken(irisBase, 0.56);
    const irisBright = lighten(irisBase, 0.44);
    const irisGradId = defs.once(`iris3d-${irisBase}`, 'iris3d', (id) =>
      linearGradient(
        id,
        [
          { offset: 0, color: irisTop },
          { offset: 0.48, color: irisBase },
          { offset: 1, color: irisBright },
        ],
        90,
      ),
    );

    const styleH =
      eyeStyle === 'soft-shojo' ? 1.16 : eyeStyle === 'villain-narrow' ? 0.8 : eyeStyle === 'sharp-hunter' ? 0.94 : 1.02;

    // Balanced longitudes & unified gaze offset so both eyes track the exact same focal point!
    const eyeConfigs: Array<{ thOuter: number; thCenter: number; thInner: number; isNear: boolean }> = [
      { thOuter: -33, thCenter: -20.5, thInner: -8.5, isNear: true },
    ];
    if (yawDeg < 68) {
      eyeConfigs.push({ thOuter: 31, thCenter: 20, thInner: 9, isNear: false });
    }

    for (const ec of eyeConfigs) {
      const pOuter = surf(ec.thOuter, eyeY - (ec.isNear ? 1.1 : 0.7), 0.98);
      const pInner = surf(ec.thInner, eyeY + 1.1, 0.98);
      const pMid = surf(ec.thCenter, eyeY, 0.99);
      const open = spec.eyeOpen * styleH;
      // +15% larger Manhwa eyes!
      const topH = 7.0 * open;
      const botH = Math.max(2.2, (4.9 - spec.lowerLidLift * 0.55) * open);

      const topCtrl = { x: pMid.x, y: pMid.y - topH * 1.32 };
      const botCtrl = { x: pMid.x, y: pMid.y + botH * 1.32 };
      const upperCurve = `M${pt(pInner)}Q${pt(topCtrl)} ${pt(pOuter)}`;
      const lowerCurve = `Q${pt(botCtrl)} ${pt(pInner)}`;

      if (!hideEyes) {
        // Sclera + upper socket shadow
        headSvg += el('path', { d: `${upperCurve}${lowerCurve}Z`, fill: '#F8FAFC' });
        headSvg += el('path', {
          d: `${upperCurve}Q${fmt(pMid.x)} ${fmt(pMid.y - topH * 0.35)} ${pt(pInner)}Z`,
          fill: '#CBD5E1',
          'fill-opacity': 0.72,
        });

        // Strictly bounded larger iris with natural perspective foreshortening & synchronized gaze
        const yTop = 0.25 * pInner.y + 0.5 * topCtrl.y + 0.25 * pOuter.y;
        const yBot = 0.25 * pInner.y + 0.5 * botCtrl.y + 0.25 * pOuter.y;
        const eyeHalfH = Math.max(2.0, (yBot - yTop) * 0.5);
        const eyeW = Math.abs(pOuter.x - pInner.x);
        const maxIrisRy = Math.min(eyeHalfH * 0.95, Math.max(2.0, eyeHalfH * 0.93 * spec.irisScale));
        const perspRatio = clamp(eyeW / 16.0, 0.52, 1.0);
        const irisRx = Math.min(eyeW * 0.34, (maxIrisRy * 0.94 + 0.35) * perspRatio) * spec.irisScale;
        const irisCy = Math.min((yTop + yBot) * 0.5 - 0.08, yBot - maxIrisRy - 0.2);
        const gazeShift = lerp(0, 0.65, yawT);
        const irisCx = pMid.x + gazeShift;

        headSvg += el('ellipse', { cx: irisCx, cy: irisCy, rx: irisRx, ry: maxIrisRy, fill: irisTop });
        headSvg += el('ellipse', { cx: irisCx, cy: irisCy, rx: irisRx * 0.86, ry: maxIrisRy * 0.86, fill: `url(#${irisGradId})` });
        headSvg += el('ellipse', { cx: irisCx, cy: irisCy + maxIrisRy * 0.26, rx: irisRx * 0.58, ry: maxIrisRy * 0.38, fill: irisBright, 'fill-opacity': 0.74 });
        if (eyeStyle === 'mystic-glow' || glowEyes) {
          headSvg += el('ellipse', { cx: irisCx, cy: irisCy, rx: irisRx * 0.64, ry: maxIrisRy * 0.64, fill: 'none', stroke: lighten(irisBase, 0.55), 'stroke-width': 0.7 });
        }
        const pupilR = Math.max(1.1, irisRx * 0.42 * spec.pupilScale);
        headSvg += el('ellipse', { cx: irisCx, cy: irisCy - 0.1, rx: pupilR * 0.92, ry: pupilR * 1.06, fill: '#060810' });
        headSvg += el('circle', { cx: irisCx - irisRx * 0.32, cy: irisCy - maxIrisRy * 0.3, r: Math.max(0.75, irisRx * 0.24), fill: '#FFFFFF', 'fill-opacity': 0.96 });
        headSvg += el('circle', { cx: irisCx + irisRx * 0.28, cy: irisCy + maxIrisRy * 0.3, r: Math.max(0.42, irisRx * 0.13), fill: '#FFFFFF', 'fill-opacity': 0.82 });

        // Sculpted upper eyelash
        const lashThick = 2.3 + lw * 0.4;
        const wingDir = ec.isNear ? -1 : 1;
        const wingLen = ec.isNear ? 2.2 : 1.4;
        const lashD =
          `M${pt(pInner)}` +
          `Q${fmt(topCtrl.x)} ${fmt(topCtrl.y - lashThick)} ${fmt(pOuter.x + wingDir * wingLen)} ${fmt(pOuter.y - 1.3)}` +
          `L${fmt(pOuter.x + wingDir * 0.4)} ${fmt(pOuter.y + 0.7)}` +
          `Q${fmt(topCtrl.x)} ${fmt(topCtrl.y + 0.3)} ${fmt(pInner.x)} ${fmt(pInner.y + 0.6)}Z`;
        headSvg += el('path', { d: lashD, fill: ink });

        // Subtle futae crease hugging the upper lid
        headSvg += el('path', {
          d: `M${fmt(pInner.x + (ec.isNear ? -1.8 : 1.4))} ${fmt(pInner.y - 1.6)}Q${fmt(topCtrl.x)} ${fmt(topCtrl.y - lashThick - 0.6)} ${fmt(pOuter.x - wingDir * 1.3)} ${fmt(pOuter.y - 1.6)}`,
          fill: 'none',
          stroke: skinDeep,
          'stroke-width': lw * 0.32 + 0.12,
          'stroke-linecap': 'round',
          'stroke-opacity': 0.46,
        });

        // Lower lash line
        headSvg += el('path', {
          d: `M${pt(pOuter)}Q${pt(botCtrl)} ${pt(pInner)}`,
          fill: 'none',
          stroke: ink,
          'stroke-width': lw * 0.46 + 0.26,
          'stroke-linecap': 'round',
          'stroke-opacity': 0.84,
        });
      }

      // 3D-projected eyebrow tucked cleanly over brow ridge
      const bOuter = surf(ec.thOuter, browY + 0.6 + spec.browOuterY * 0.35, 1.0);
      const bMid = surf(ec.thCenter, browY - 1.8, 1.01);
      const bInner = surf(ec.thInner, browY + 0.4 + spec.browInnerY * 0.45, 1.0);
      const browFill = darken(hairBase, 0.22);
      headSvg += el('path', {
        d: `M${pt(bOuter)}Q${pt(bMid)} ${pt(bInner)}L${fmt(bInner.x)} ${fmt(bInner.y + 1.9)}Q${fmt(bMid.x)} ${fmt(bMid.y + 2.1)} ${fmt(bOuter.x)} ${fmt(bOuter.y + 1.1)}Z`,
        fill: browFill,
      });
    }

    // Refined Manhwa Nose (clean tip + tiny delicate shadow — NO big gray wedge in middle of cheek!)
    if (!masked && yawDeg < 58) {
      if (isFrontBlend > 0.6) {
        // Minimal front nose accent
        headSvg += el('path', {
          d: `M${fmt(noseTip3D.x - 1.4)} ${fmt(noseTip3D.y - 1)}Q${fmt(noseTip3D.x)} ${fmt(noseTip3D.y + 1.2)} ${fmt(noseTip3D.x + 1.6)} ${fmt(noseTip3D.y - 0.4)}`,
          fill: 'none',
          stroke: skinDeep,
          'stroke-width': lw * 0.55 + 0.2,
          'stroke-linecap': 'round',
        });
      } else {
        // Small crisp Manhwa 3/4 nose ridge & underside shadow
        const noseMid = { x: lerp(noseBridge3D.x, noseTip3D.x, 0.52), y: lerp(noseBridge3D.y, noseTip3D.y, 0.52) };
        headSvg += el('path', {
          d: `M${pt(noseTip3D)}L${pt(noseBase3D)}L${fmt(noseBase3D.x - 2.2)} ${fmt(noseBase3D.y - 1.2)}Z`,
          fill: skinShade,
          'fill-opacity': 0.68,
        });
        headSvg += el('path', {
          d: `M${pt(noseMid)}L${pt(noseTip3D)}Q${fmt(noseTip3D.x - 1.0)} ${fmt(noseTip3D.y + 2.0)} ${pt(noseBase3D)}`,
          fill: 'none',
          stroke: skinDeep,
          'stroke-width': lw * 0.58 + 0.2,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        });
      }
    }

    // 3D-Projected Mouth
    if (!masked && yawDeg < 58) {
      const mLeft = proj(-7.0, mouthY, rz * 0.85);
      const mMid = proj(0, mouthY + 0.2, rz * 0.9);
      const mRight = proj(6.6, mouthY - 0.3, rz * 0.85);
      const lipShadeL = proj(-2.8, mouthY + 3.0, rz * 0.86);
      const lipShadeR = proj(2.4, mouthY + 2.8, rz * 0.86);

      if (spec.mouth === 'smirk') {
        headSvg += variableStrokeFromSegments(
          [
            {
              p0: mLeft,
              p1: { x: mMid.x, y: mMid.y + 0.9 },
              p2: { x: mRight.x, y: mRight.y - 1.5 },
              wStart: 0.16,
              wMid: lw * 0.65,
              wEnd: 0.2,
            },
          ],
          skinDeep,
        );
      } else if (spec.mouth === 'open-shout' || spec.mouth === 'pain-gasp') {
        headSvg += el('path', {
          d: `M${pt(mLeft)}Q${fmt(mMid.x)} ${fmt(mMid.y - 1.8)} ${pt(mRight)}Q${fmt(mMid.x)} ${fmt(mMid.y + 5.2)} ${pt(mLeft)}Z`,
          fill: '#450A0A',
          stroke: skinDeep,
          'stroke-width': lw * 0.65,
        });
      } else {
        headSvg += variableStrokeFromSegments(
          [
            {
              p0: mLeft,
              p1: mMid,
              p2: mRight,
              wStart: 0.16,
              wMid: lw * 0.62,
              wEnd: 0.16,
            },
          ],
          skinDeep,
        );
      }
      headSvg += el('path', {
        d: `M${pt(lipShadeL)}Q${fmt((lipShadeL.x + lipShadeR.x) * 0.5)} ${fmt(lipShadeL.y + 1.1)} ${pt(lipShadeR)}`,
        fill: 'none',
        stroke: skinShade,
        'stroke-width': 1.1,
        'stroke-linecap': 'round',
        'stroke-opacity': 0.7,
      });
    } else if (!masked && yawDeg >= 58) {
      // Crisp profile mouth inset
      headSvg += el('path', {
        d: `M${fmt(lipIndent3D.x - 6)} ${fmt(lipIndent3D.y + 0.4)}Q${fmt(lipIndent3D.x - 2)} ${fmt(lipIndent3D.y + 0.8)} ${pt(lipIndent3D)}`,
        fill: 'none',
        stroke: skinDeep,
        'stroke-width': lw * 0.65 + 0.25,
        'stroke-linecap': 'round',
      });
    }
  }

  // -------------------------------------------------------------------------
  // 6. Layered Multi-Clump Manhwa Hair (Fase 3) & 3D-Projected Headband
  // -------------------------------------------------------------------------
  headSvg += hairRes.hairFrontSvg;

  if (headband && !silhouetteOnly) {
    // 3D-projected headband hugging the rotated cranium & temple (no floating 2D right corner!)
    const hbYTop = hairlineY - 1.5;
    const hbYBot = hairlineY + 7.2;
    const hbNearTop = surf(nearAz + 16, hbYTop + 2, 1.045);
    const hbMidTop = surf(0, hbYTop - 1.5, 1.055);
    const hbFarTop = surf(farAz - 1, hbYTop + 2, 1.04);
    const hbFarBot = surf(farAz - 1, hbYBot + 1.5, 1.04);
    const hbMidBot = surf(0, hbYBot - 1.0, 1.055);
    const hbNearBot = surf(nearAz + 16, hbYBot + 1.5, 1.045);

    const hbShade = darken(accent, 0.22);
    headSvg += el('path', {
      d: `M${pt(hbNearTop)}Q${pt(hbMidTop)} ${pt(hbFarTop)}L${pt(hbFarBot)}Q${pt(hbMidBot)} ${pt(hbNearBot)}Z`,
      fill: accent,
      stroke: strokeInk,
      'stroke-width': lw * 0.85,
      'stroke-linejoin': 'round',
    });
    headSvg += el('path', {
      d: `M${pt(hbNearBot)}Q${pt(hbMidBot)} ${pt(hbFarBot)}L${fmt(hbFarBot.x)} ${fmt(hbFarBot.y - 2.4)}Q${fmt(hbMidBot.x)} ${fmt(hbMidBot.y - 2.4)} ${fmt(hbNearBot.x)} ${fmt(hbNearBot.y - 2.4)}Z`,
      fill: hbShade,
      'fill-opacity': 0.55,
    });
  }

  // -------------------------------------------------------------------------
  // 7. Optional 3D Construction Debug Guides
  // -------------------------------------------------------------------------
  if (debugGuides) {
    const centerTop = proj(0, topY, rz * 0.2);
    const centerBrow = proj(0, browY, rz);
    const centerEye = proj(0, eyeY, rz);
    const eyeLineL = surf(-85, eyeY, 1.0);
    const eyeLineR = surf(clamp(85 - yawDeg, 10, 85), eyeY, 1.0);
    headSvg +=
      el('ellipse', {
        cx: HEAD_CX,
        cy: HEAD_CY,
        rx,
        ry,
        fill: 'none',
        stroke: '#06B6D4',
        'stroke-width': 0.85,
        'stroke-dasharray': '3 2',
      }) +
      el('path', {
        d: `M${pt(centerTop)}Q${pt(centerBrow)} ${pt(centerEye)}L${pt(noseTip3D)}L${pt(chinPt)}`,
        fill: 'none',
        stroke: '#EC4899',
        'stroke-width': 0.95,
      }) +
      el('path', {
        d: `M${pt(eyeLineL)}Q${pt(centerEye)} ${pt(eyeLineR)}`,
        fill: 'none',
        stroke: '#22C55E',
        'stroke-width': 0.95,
      }) +
      el('circle', { cx: earRoot.x, cy: earRoot.y, r: 2.3, fill: '#FACC15' });
  }

  return {
    neckAndCollarSvg,
    hairBackSvg,
    headSvg,
    chinPoint: { x: chinPt.x, y: chinPt.y },
  };
}
