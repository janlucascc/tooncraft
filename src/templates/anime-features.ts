import type {
  CharacterAccessory,
  CharacterPalette,
  EyeStyle,
  HairStylePreset,
  SilhouettePreset,
} from '../schema/character.js';
import type {
  Expression,
  LightDirection,
  Pose,
  ShadingIntensity,
  WeaponProp,
} from '../schema/visual-layer.js';
import {
  type DefsCollector,
  darken,
  el,
  fmt,
  glowFilter,
  lighten,
  linearGradient,
  mix,
  radialGradient,
} from '../components/svg-utils.js';
import type { Prng } from '../engine/prng.js';

/**
 * High-Fidelity Anime / Manhwa Vector Feature Engine.
 *
 * Designed for static SVG rendering (zero 60fps constraint): uses multi-layered
 * vector geometry, 2-tone hard cel-shading, multi-stop iris gradients, dual
 * specular catchlights, faceted hair clumps with angel-ring highlights,
 * anatomical collarbones/neck shadows, clothing crease wedges, accessories,
 * and weapon props.
 *
 * NOTE: Never uses nested <clipPath> inside character local coordinates to
 * avoid @resvg/resvg-js Rust geom.rs panics under high scale factors.
 */

export interface P {
  x: number;
  y: number;
}

export function poly(points: ReadonlyArray<P>): string {
  if (points.length === 0) return '';
  return `M${points.map((p) => `${fmt(p.x)} ${fmt(p.y)}`).join('L')}Z`;
}

// ---------------------------------------------------------------------------
// Expression & Eye Configuration
// ---------------------------------------------------------------------------

export interface AnimeExpressionSpec {
  browInnerY: number;
  browOuterY: number;
  browCurve: number;
  eyeOpen: number;
  irisScale: number;
  pupilScale: number;
  lowerLidLift: number;
  mouth: 'calm' | 'smirk' | 'grit' | 'open-shout' | 'predator-grin' | 'pain-gasp' | 'firm';
  browFurrow: boolean;
  cheekTension: boolean;
}

export const ANIME_EXPRESSIONS: Record<Expression, AnimeExpressionSpec> = {
  neutral: {
    browInnerY: 0,
    browOuterY: 0,
    browCurve: -2.5,
    eyeOpen: 1.0,
    irisScale: 1.0,
    pupilScale: 1.0,
    lowerLidLift: 0,
    mouth: 'calm',
    browFurrow: false,
    cheekTension: false,
  },
  determined: {
    browInnerY: 4.5,
    browOuterY: -2,
    browCurve: -1.5,
    eyeOpen: 0.92,
    irisScale: 1.02,
    pupilScale: 0.95,
    lowerLidLift: 1.0,
    mouth: 'firm',
    browFurrow: true,
    cheekTension: false,
  },
  angry: {
    browInnerY: 7.5,
    browOuterY: -4.2,
    browCurve: -1.0,
    eyeOpen: 0.78,
    irisScale: 0.92,
    pupilScale: 0.82,
    lowerLidLift: 1.6,
    mouth: 'grit',
    browFurrow: true,
    cheekTension: true,
  },
  shocked: {
    browInnerY: -6.5,
    browOuterY: -3.5,
    browCurve: -4.5,
    eyeOpen: 1.32,
    irisScale: 0.62,
    pupilScale: 0.55,
    lowerLidLift: -1.5,
    mouth: 'open-shout',
    browFurrow: false,
    cheekTension: true,
  },
  pain: {
    browInnerY: -3.5,
    browOuterY: 4.5,
    browCurve: 1.5,
    eyeOpen: 0.65,
    irisScale: 0.85,
    pupilScale: 0.75,
    lowerLidLift: 2.2,
    mouth: 'pain-gasp',
    browFurrow: true,
    cheekTension: true,
  },
  smirk: {
    browInnerY: 1.8,
    browOuterY: -2.5,
    browCurve: -2.5,
    eyeOpen: 0.72,
    irisScale: 0.98,
    pupilScale: 0.95,
    lowerLidLift: 1.2,
    mouth: 'smirk',
    browFurrow: false,
    cheekTension: false,
  },
  'menacing-glow': {
    browInnerY: 8.0,
    browOuterY: -4.5,
    browCurve: -1.0,
    eyeOpen: 0.76,
    irisScale: 0.95,
    pupilScale: 0.7,
    lowerLidLift: 1.5,
    mouth: 'predator-grin',
    browFurrow: true,
    cheekTension: true,
  },
  shadowed: {
    browInnerY: 4.0,
    browOuterY: -1.0,
    browCurve: -1.5,
    eyeOpen: 0.8,
    irisScale: 0.95,
    pupilScale: 0.9,
    lowerLidLift: 0.8,
    mouth: 'firm',
    browFurrow: true,
    cheekTension: true,
  },
};

// ---------------------------------------------------------------------------
// Face & Jaw Geometry (Sharp Manhwa V-Jaw)
// ---------------------------------------------------------------------------

/** Manhwa-proportioned front head contour with smooth organic cheekbones and delicate V-jaw. */
export const MANHWA_FACE_FRONT =
  'M0 -589' +
  'C27 -589 43 -570 42.5 -542' +
  'C42 -524 38 -511 31.5 -501' +
  'C24 -491 12 -483 0 -481.5' +
  'C-12 -483 -24 -491 -31.5 -501' +
  'C-38 -511 -42 -524 -42.5 -542' +
  'C-43 -570 -27 -589 0 -589Z';

/** Slender, delicate front head contour for female anime characters. */
export const MANHWA_FACE_FRONT_FEMALE =
  'M0 -589' +
  'C22 -589 36 -572 36 -544' +
  'C35.5 -526 31 -512 25 -502' +
  'C18 -492 8 -483 0 -481' +
  'C-8 -483 -18 -492 -25 -502' +
  'C-31 -512 -35.5 -526 -36 -544' +
  'C-36 -572 -22 -589 0 -589Z';

/** Refined anime side-profile head contour with smooth brow, sculpted nose bridge, lips and curved jaw. */
export const MANHWA_FACE_PROFILE =
  'M-4 -589' +
  'C24 -589 39 -572 39.5 -548' +
  'Q40 -540 41.5 -535' +
  'Q47 -526 51.5 -520' +
  'Q48 -516.5 43 -515.5' +
  'Q45.5 -511.5 44.5 -508.5' +
  'Q42 -506 41 -504.5' +
  'Q43.5 -502 42.5 -499' +
  'C39 -490 26 -483 10 -482.5' +
  'C-9 -485 -28 -499 -36 -520' +
  'C-42 -542 -37 -574 -4 -589Z';

/** Three-quarter Manhwa head contour (turned ~35 deg right) with sleek eye-orbit indent and sharp V-jaw. */
export const MANHWA_FACE_3Q =
  'M-4 -589' +
  'C20 -589 34 -573 34 -551' +
  'Q32 -543 30.5 -537' +
  'Q32.5 -530 32 -523' +
  'C30 -509 25 -490 17 -483' +
  'C5 -484 -12 -492 -24 -504' +
  'C-35 -517 -40 -534 -40 -548' +
  'C-40 -573 -26 -589 -4 -589Z';

/** Slender three-quarter Manhwa head contour for female characters. */
export const MANHWA_FACE_3Q_FEMALE =
  'M-4 -589' +
  'C18 -589 30 -574 30 -552' +
  'Q28.5 -544 27 -538' +
  'Q29 -531 28.5 -524' +
  'C26.5 -510 22 -490 14.5 -482.5' +
  'C4 -483.5 -10 -492 -21 -504' +
  'C-31 -517 -35 -534 -35 -548' +
  'C-35 -573 -22 -589 -4 -589Z';

/**
 * Detailed anime ears with inner helix, antihelix and concha shadow.
 */
export function renderAnimeEars(
  skin: string,
  ink: string,
  lw: number,
  profile: boolean,
  earring: boolean,
  accent: string,
  isSlender = false,
  threeQuarter = false,
): string {
  const shadow = darken(skin, 0.25);
  const deepShadow = darken(skin, 0.42);
  let out = '';

  if (profile || threeQuarter) {
    // Single ear on back-temple (x=-13 for 90° profile, x=-26..-30 for 3/4 view so it's visible cleanly)
    const ex = profile ? -13 : isSlender ? -26 : -30;
    const ey = profile ? -541 : -536;
    out += el('path', {
      d: `M${fmt(ex)} ${fmt(ey)}C${fmt(ex - 6)} ${fmt(ey - 1)} ${fmt(ex - 9)} ${fmt(ey + 8)} ${fmt(ex - 7)} ${fmt(ey + 19)}C${fmt(ex - 5)} ${fmt(ey + 26)} ${fmt(ex + 1)} ${fmt(ey + 29)} ${fmt(ex + 6)} ${fmt(ey + 26)}C${fmt(ex + 10)} ${fmt(ey + 23)} ${fmt(ex + 10)} ${fmt(ey + 3)} ${fmt(ex)} ${fmt(ey)}Z`,
      fill: skin,
      stroke: ink,
      'stroke-width': lw * 0.9,
    });
    out += el('path', {
      d: `M${fmt(ex + 1)} ${fmt(ey + 5)}C${fmt(ex - 3)} ${fmt(ey + 5)} ${fmt(ex - 4)} ${fmt(ey + 13)} ${fmt(ex - 2)} ${fmt(ey + 20)}C${fmt(ex)} ${fmt(ey + 22)} ${fmt(ex + 3)} ${fmt(ey + 21)} ${fmt(ex + 4)} ${fmt(ey + 16)}Z`,
      fill: shadow,
    });
    out += el('path', {
      d: `M${fmt(ex + 1)} ${fmt(ey + 4)}C${fmt(ex - 3)} ${fmt(ey + 6)} ${fmt(ex - 4)} ${fmt(ey + 14)} ${fmt(ex - 1)} ${fmt(ey + 21)}`,
      fill: 'none',
      stroke: deepShadow,
      'stroke-width': lw * 0.65,
      'stroke-linecap': 'round',
    });
    if (earring) {
      out += el('circle', { cx: ex, cy: ey + 29, r: 2.4, fill: accent, stroke: ink, 'stroke-width': 0.6 });
      out += el('path', { d: `M${fmt(ex)} ${fmt(ey + 31.5)}L${fmt(ex - 2)} ${fmt(ey + 40)}L${fmt(ex)} ${fmt(ey + 43)}L${fmt(ex + 2)} ${fmt(ey + 40)}Z`, fill: accent, stroke: ink, 'stroke-width': 0.5 });
    }
    return out;
  }

  const earBaseX = isSlender ? 34.5 : 40.5;
  const earOuterX = isSlender ? 41.0 : 47.5;
  const earMidX = isSlender ? 38.0 : 44.5;
  for (const side of [-1, 1] as const) {
    const x0 = side * earBaseX;
    const xOuter = side * earOuterX;
    const xMid = side * earMidX;
    out += el('path', {
      d: `M${fmt(x0)} -540C${fmt(xOuter)} -542 ${fmt(xOuter + side * 1.5)} -528 ${fmt(xMid)} -516C${fmt(x0 + side * 2)} -512 ${fmt(x0 - side * 1)} -514 ${fmt(x0 - side * 1.5)} -520Z`,
      fill: skin,
      stroke: ink,
      'stroke-width': lw * 0.9,
      'stroke-linejoin': 'round',
    });
    // Inner concha cel-shadow
    out += el('path', {
      d: `M${fmt(x0 + side * 1)} -535C${fmt(xMid)} -535 ${fmt(xMid)} -525 ${fmt(x0 + side * 1.5)} -519Z`,
      fill: shadow,
    });
    // Helix line
    out += el('path', {
      d: `M${fmt(x0 + side * 1)} -536C${fmt(xMid + side * 0.5)} -534 ${fmt(xMid)} -524 ${fmt(x0 + side * 1)} -518`,
      fill: 'none',
      stroke: deepShadow,
      'stroke-width': lw * 0.6,
      'stroke-linecap': 'round',
    });
    if (earring) {
      out += el('circle', {
        cx: x0 + side * 2.5,
        cy: -513,
        r: 2.2,
        fill: accent,
        stroke: ink,
        'stroke-width': 0.5,
      });
      out += el('path', {
        d: `M${fmt(x0 + side * 2.5)} -511L${fmt(x0 + side * 4.2)} -502L${fmt(x0 + side * 2.5)} -499L${fmt(x0 + side * 0.8)} -502Z`,
        fill: accent,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Neck & Facial Cel-Shading
// ---------------------------------------------------------------------------

/**
 * Renders hard 2-tone cel-shaded neck muscles, under-chin occlusion triangle,
 * and collarbone definitions.
 */
export function renderNeckAndCollarCelShade(
  skin: string,
  ink: string,
  lw: number,
  shading: ShadingIntensity,
  lightDir: LightDirection,
  isSlender: boolean = false,
  threeQuarter: boolean = false,
): string {
  const shade1 = darken(skin, shading === 'soft' ? 0.16 : shading === 'heavy' || shading === 'dramatic-noir' ? 0.32 : 0.24);
  const shade2 = darken(skin, shading === 'dramatic-noir' ? 0.52 : 0.4);
  const skinInk = mix(darken(skin, 0.68), ink, 0.45);
  const dir = lightDir === 'right' ? -1 : 1; // shadow falls toward opposite side
  let out = '';

  if (threeQuarter) {
    // Angled 3/4 neck aligned with turned jaw (left/back edge runs up toward ear, front edge under chin)
    const lx = isSlender ? -18 : -21;
    const rx = isSlender ? 8 : 11;
    out += el('path', {
      d: `M${fmt(lx)} -506C${fmt(lx)} -490 ${fmt(lx - 2)} -472 ${fmt(lx - 4)} -454L${fmt(rx + 6)} -454C${fmt(rx + 2)} -470 ${fmt(rx)} -486 ${fmt(rx)} -500Z`,
      fill: skin,
    });
    out += el('path', {
      d: `M${fmt(lx)} -504C${fmt(lx)} -488 ${fmt(lx - 2)} -472 ${fmt(lx - 4)} -456M${fmt(rx)} -498C${fmt(rx)} -484 ${fmt(rx + 2)} -470 ${fmt(rx + 5)} -456`,
      fill: 'none',
      stroke: skinInk,
      'stroke-width': lw * 0.9,
      'stroke-linecap': 'round',
    });
    // Single clean diagonal under-jaw cel-shadow (no symmetrical front triangles!)
    out += el('path', {
      d: `M${fmt(lx)} -504Q-4 -490 ${fmt(rx)} -488L${fmt(rx)} -478Q-6 -478 ${fmt(lx - 1)} -486Z`,
      fill: shade1,
      'fill-opacity': 0.85,
    });
    // Subtle sternocleidomastoid line
    out += el('path', {
      d: `M${fmt(lx + 4)} -490Q-6 -474 -2 -458`,
      fill: 'none',
      stroke: shade2,
      'stroke-width': lw * 0.5,
      'stroke-linecap': 'round',
      'stroke-opacity': 0.65,
    });
    return out;
  }

  const nw = isSlender ? 11.5 : 15.5;
  const nwStr = fmt(nw);
  const swTrap = isSlender ? '28' : '36';

  // Base neck column with smooth organic curve into trapezius slope
  out += el('path', {
    d: `M-${nwStr} -505C-${nwStr} -490 -15 -476 -20 -466Q-24 -460 -${swTrap} -458L${swTrap} -458Q24 -460 20 -466C15 -476 ${nwStr} -490 ${nwStr} -505Z`,
    fill: skin,
  });
  // Open tapered ink lines ONLY along outer neck sides (no harsh bottom bar cutting across chest!)
  out += el('path', {
    d: `M-${nwStr} -503C-${nwStr} -489 -15 -476 -20 -466M${nwStr} -503C${nwStr} -489 15 -476 20 -466`,
    fill: 'none',
    stroke: skinInk,
    'stroke-width': lw * 0.92,
    'stroke-linecap': 'round',
  });

  // Curved anatomical cast shadow under the jawline/chin
  out += el('path', {
    d: `M-${nwStr} -496Q0 -490 ${nwStr} -496Q${fmt(14 * dir)} -482 ${fmt(5 * dir)} -472Q${fmt(-4 * dir)} -476 ${fmt(-14 * dir)} -484Z`,
    fill: shade1,
  });

  // Deep core ambient occlusion right beneath the chin point
  out += el('path', {
    d: `M-9 -492Q0 -488 9 -492Q${fmt(4 * dir)} -483 ${fmt(2 * dir)} -478Q${fmt(-4 * dir)} -482 -9 -492Z`,
    fill: shade2,
    'fill-opacity': 0.85,
  });

  // Lateral cylindrical neck cel-shadow plane
  out += el('path', {
    d:
      dir > 0
        ? `M4 -494C7 -482 8 -472 16 -462L22 -462C16 -474 15 -484 ${nwStr} -494Z`
        : `M-4 -494C-7 -482 -8 -472 -16 -462L-22 -462C-16 -474 -15 -484 -${nwStr} -494Z`,
    fill: shade1,
    'fill-opacity': 0.78,
  });

  // Clavicle (collarbone) ink lines (subtle & delicate on slender, defined on male)
  if (isSlender) {
    out += el('path', {
      d: 'M-4 -462Q-14 -464 -24 -460M4 -462Q14 -464 24 -460',
      fill: 'none',
      stroke: shade2,
      'stroke-width': lw * 0.48,
      'stroke-linecap': 'round',
      'stroke-opacity': 0.65,
    });
  } else {
    out += el('path', {
      d: 'M-10 -484Q-6 -474 -4 -465M10 -484Q6 -474 4 -465M-5 -462Q-18 -464 -31 -460M5 -462Q18 -464 31 -460',
      fill: 'none',
      stroke: shade2,
      'stroke-width': lw * 0.56,
      'stroke-linecap': 'round',
      'stroke-opacity': 0.72,
    });
  }

  return out;
}

/**
 * Renders smooth lateral cheekbone/jawline cel-shadow, subtle warm cheek tint,
 * and organic curved forehead bangs drop shadow on the face.
 */
export function renderFaceCelShading(
  skin: string,
  shading: ShadingIntensity,
  lightDir: LightDirection,
  profile: boolean,
  hasHairShadow: boolean,
  isSlender = false,
  hairStyle: HairStylePreset = 'spiky-manhwa',
  expression: Expression = 'neutral',
  threeQuarter = false,
): string {
  const shade = darken(skin, shading === 'soft' ? 0.13 : shading === 'dramatic-noir' ? 0.32 : 0.2);
  const deepShade = darken(skin, 0.36);
  const warmBlush = mix(skin, '#E15B64', 0.22);
  const dir = lightDir === 'right' ? -1 : 1;
  let out = '';

  if (profile) {
    // Back of jaw & cheek plane shadow in profile
    out += el('path', {
      d: 'M-4 -586C-25 -576 -36 -545 -32 -518C-24 -500 -8 -487 8 -483C-2 -492 -14 -508 -14 -532C-14 -555 -8 -572 -4 -586Z',
      fill: shade,
      'fill-opacity': 0.8,
    });
    return out;
  }

  if (threeQuarter) {
    // Back/temple & jawline plane shadow matching sleek MANHWA_FACE_3Q / FEMALE
    const bx = isSlender ? -35 : -40;
    const jx = isSlender ? -21 : -24;
    const cx = isSlender ? 14.5 : 17;
    out += el('path', {
      d: `M-4 -588C${fmt(bx + 12)} -584 ${fmt(bx)} -568 ${fmt(bx)} -548C${fmt(bx)} -534 ${fmt(bx + 4)} -517 ${fmt(jx)} -504C${fmt(jx + 12)} -492 ${fmt(cx - 8)} -483.5 ${fmt(cx)} -483C${fmt(cx - 10)} -488 ${fmt(jx + 6)} -503 ${fmt(jx)} -517C${fmt(bx + 14)} -533 ${fmt(bx + 18)} -560 -4 -588Z`,
      fill: shade,
      'fill-opacity': 0.7,
    });
    if (hasHairShadow) {
      out += el('path', {
        d: `M${fmt(bx + 8)} -562Q0 -568 ${fmt(isSlender ? 28 : 32)} -558Q${fmt(isSlender ? 17 : 20)} -548 6 -552Q-12 -546 ${fmt(bx + 10)} -550Z`,
        fill: shade,
        'fill-opacity': 0.52,
      });
    }
    return out;
  }

  // Subtle warm cheek subsurface blush (restrained on serious/gritty warriors)
  const isSeriousWarrior =
    !isSlender && (expression === 'determined' || expression === 'angry' || shading === 'heavy' || shading === 'dramatic-noir');
  const blushOpacity = isSeriousWarrior ? 0.06 : isSlender ? 0.16 : 0.12;
  const blushX = isSlender ? 18.5 : 21;
  out += el('ellipse', { cx: -blushX, cy: -518, rx: 8.5, ry: 3.6, fill: warmBlush, 'fill-opacity': blushOpacity });
  out += el('ellipse', { cx: blushX, cy: -518, rx: 8.5, ry: 3.6, fill: warmBlush, 'fill-opacity': blushOpacity });

  // Lateral face cel-shadow strictly hugging either MANHWA_FACE_FRONT_FEMALE (36px) or male (42.5px)
  if (isSlender) {
    const s = dir > 0 ? 1 : -1;
    out += el('path', {
      d: `M${fmt(s * 20)} -582C${fmt(s * 32)} -570 ${fmt(s * 36)} -552 ${fmt(s * 36)} -544C${fmt(s * 35.5)} -526 ${fmt(s * 31)} -512 ${fmt(s * 25)} -502C${fmt(s * 18)} -492 ${fmt(s * 8)} -483 0 -481C${fmt(s * 11)} -488 ${fmt(s * 19.5)} -500 ${fmt(s * 24)} -515C${fmt(s * 28.5)} -532 ${fmt(s * 27)} -558 ${fmt(s * 20)} -582Z`,
      fill: shade,
      'fill-opacity': 0.72,
    });
  } else {
    const s = dir > 0 ? 1 : -1;
    out += el('path', {
      d: `M${fmt(s * 24)} -580C${fmt(s * 38)} -568 ${fmt(s * 42.5)} -550 ${fmt(s * 42.5)} -541C${fmt(s * 42)} -524 ${fmt(s * 38)} -511 ${fmt(s * 31.5)} -501C${fmt(s * 24)} -491 ${fmt(s * 12)} -483 0 -481.5C${fmt(s * 13)} -488 ${fmt(s * 23)} -500 ${fmt(s * 28)} -515C${fmt(s * 33)} -532 ${fmt(s * 32)} -558 ${fmt(s * 24)} -580Z`,
      fill: shade,
      'fill-opacity': 0.78,
    });
  }

  // Bangs cast shadow tailored to hairStyle (never jagged center spikes on parted curtain bangs!)
  if (hasHairShadow) {
    if (hairStyle === 'long-flowing') {
      const tw = isSlender ? 34 : 40;
      out += el('path', {
        d:
          `M${fmt(-tw)} -558Q${fmt(-tw + 14)} -562 ${fmt(-tw + 18)} -546Q${fmt(-tw + 8)} -536 ${fmt(-tw)} -532Z` +
          `M${fmt(tw)} -558Q${fmt(tw - 14)} -562 ${fmt(tw - 18)} -546Q${fmt(tw - 8)} -536 ${fmt(tw)} -532Z`,
        fill: shade,
        'fill-opacity': 0.56,
      });
    } else {
      out += el('path', {
        d: 'M-39 -556Q0 -568 39 -556Q35 -546 31 -542Q25 -552 19 -549Q11 -541 7 -549Q2 -536 -1 -544Q-5 -538 -9 -549Q-17 -541 -22 -550Q-30 -544 -34 -542Z',
        fill: shade,
        'fill-opacity': 0.64,
      });
    }
  }

  // Subtle cheekbone / temple hatching on heavy/noir shading
  if (shading === 'heavy' || shading === 'dramatic-noir') {
    const sx = dir * 24;
    out += el('path', {
      d: `M${fmt(sx)} -520L${fmt(sx + dir * 7)} -515M${fmt(sx - dir * 1)} -516L${fmt(sx + dir * 6)} -511M${fmt(sx - dir * 2)} -512L${fmt(sx + dir * 5)} -507`,
      fill: 'none',
      stroke: deepShade,
      'stroke-width': 0.7,
      'stroke-linecap': 'round',
      'stroke-opacity': 0.58,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// 6-Layer Anime Eyes
// ---------------------------------------------------------------------------

export interface EyeRenderOptions {
  palette: CharacterPalette;
  eyeStyle: EyeStyle;
  expression: Expression;
  glowEyes: boolean;
  lightDirection: LightDirection;
  shadingIntensity: ShadingIntensity;
  defs: DefsCollector;
  lw: number;
  masked: boolean;
  accessories: ReadonlyArray<CharacterAccessory>;
}

/**
 * Renders high-detail front anime face: 6-layer eyes, sculpted brows,
 * cel-shaded angular nose, detailed lips/teeth, and facial accessories.
 */
export function renderAnimeFaceFront(opts: EyeRenderOptions): string {
  const {
    palette,
    eyeStyle,
    expression,
    glowEyes,
    lightDirection,
    shadingIntensity,
    defs,
    lw,
    masked,
    accessories,
  } = opts;
  const spec = ANIME_EXPRESSIONS[expression];
  const ink = darken(palette.hair, 0.72);
  const skinShadow = darken(palette.skin, 0.3);
  const skinDeep = darken(palette.skin, 0.58);
  const cy = -532;
  const hideEyes = expression === 'shadowed' || expression === 'menacing-glow';
  const catchDir = lightDirection === 'right' ? 1 : -1;

  let out = '';

  // Optional tribal war paint (drawn under eyes and on cheeks)
  if (accessories.includes('tribal-marks')) {
    const markColor = darken(palette.outfitAccent, 0.1);
    out += el('path', {
      d: 'M-35 -523L-16 -520L-19 -516L-36 -518ZM-33 -514L-18 -512L-21 -509L-34 -510Z',
      fill: markColor,
      'fill-opacity': 0.88,
    });
    out += el('path', {
      d: 'M35 -523L16 -520L19 -516L36 -518ZM33 -514L18 -512L21 -509L34 -510Z',
      fill: markColor,
      'fill-opacity': 0.88,
    });
    // Forehead predator mark
    out += el('path', {
      d: 'M0 -558L4 -546L0 -541L-4 -546Z',
      fill: markColor,
      'fill-opacity': 0.85,
    });
  }

  // Optional eye battle scar (across left eye x = +16)
  if (accessories.includes('scar-eye')) {
    out += el('path', {
      d: 'M21 -552L16 -534L13 -512',
      fill: 'none',
      stroke: darken(palette.skin, 0.45),
      'stroke-width': lw * 0.9 + 0.5,
      'stroke-linecap': 'round',
    });
    out += el('path', {
      d: 'M22 -552L17 -534L14 -512',
      fill: 'none',
      stroke: lighten(palette.skin, 0.25),
      'stroke-width': lw * 0.45,
      'stroke-linecap': 'round',
      'stroke-opacity': 0.7,
    });
  }

  // Build iris gradient once per character eye palette
  const irisBase = palette.eyes;
  const irisTop = darken(irisBase, 0.62);
  const irisMid = irisBase;
  const irisBright = lighten(irisBase, 0.42);
  const irisGradId = defs.once(`anime-iris-${irisBase}`, 'irisgrad', (id) =>
    linearGradient(
      id,
      [
        { offset: 0, color: irisTop },
        { offset: 0.48, color: irisMid },
        { offset: 1, color: irisBright },
      ],
      90,
    ),
  );

  // Shape modifiers by eyeStyle
  const styleH =
    eyeStyle === 'soft-shojo'
      ? 1.24
      : eyeStyle === 'villain-narrow'
        ? 0.74
        : eyeStyle === 'sharp-hunter'
          ? 0.88
          : 1.0;
  const wingTilt =
    eyeStyle === 'villain-narrow' ? -3.6 : eyeStyle === 'sharp-hunter' ? -2.8 : -1.8;

  for (const side of [-1, 1] as const) {
    const cx = side * 16.2;
    const open = spec.eyeOpen * styleH;
    const topH = 6.8 * open;
    const botH = Math.max(2.2, (4.8 - spec.lowerLidLift * 0.7) * open);

    const inner = { x: cx - side * 8.4, y: cy + 1.2 };
    const outer = { x: cx + side * 11.2, y: cy + wingTilt };
    const topCtrl = { x: cx + side * 1.2, y: cy - topH * 1.35 };
    const botCtrl = { x: cx + side * 1.0, y: cy + botH * 1.35 };

    const upperCurve = `M${fmt(inner.x)} ${fmt(inner.y)}Q${fmt(topCtrl.x)} ${fmt(topCtrl.y)} ${fmt(outer.x)} ${fmt(outer.y)}`;
    const lowerCurve = `Q${fmt(botCtrl.x)} ${fmt(botCtrl.y)} ${fmt(inner.x)} ${fmt(inner.y)}`;
    const eyeAperture = `${upperCurve}${lowerCurve}Z`;

    if (!hideEyes) {
      // 1. Sclera base
      out += el('path', { d: eyeAperture, fill: '#F8FAFC' });

      // 2. Upper sclera socket shadow crescent (gives 3D eyeball depth)
      const shadowLowerCtrl = { x: cx + side * 1.2, y: cy - topH * 0.45 };
      out += el('path', {
        d: `${upperCurve}Q${fmt(shadowLowerCtrl.x)} ${fmt(shadowLowerCtrl.y)} ${fmt(inner.x)} ${fmt(inner.y)}Z`,
        fill: '#CBD5E1',
        'fill-opacity': 0.78,
      });

      // 3. Multi-layered Iris (bounded strictly inside the eye aperture without clipPath)
      const yTop = 0.25 * inner.y + 0.5 * topCtrl.y + 0.25 * outer.y;
      const yBot = 0.25 * inner.y + 0.5 * botCtrl.y + 0.25 * outer.y;
      const eyeHalfH = Math.max(1.8, (yBot - yTop) * 0.5);
      const maxIrisRy = Math.min(eyeHalfH * 0.94, Math.max(1.8, eyeHalfH * 0.92 * spec.irisScale));
      const irisRx = Math.min(4.8, maxIrisRy * 0.96 + 0.45) * spec.irisScale;
      const irisCy = Math.min((yTop + yBot) * 0.5 - 0.15, yBot - maxIrisRy - 0.25);
      const irisCx = cx + side * 0.5;

      // Outer dark limbal ring
      out += el('ellipse', {
        cx: irisCx,
        cy: irisCy,
        rx: irisRx,
        ry: maxIrisRy,
        fill: irisTop,
      });

      // Inner gradient iris body
      out += el('ellipse', {
        cx: irisCx,
        cy: irisCy,
        rx: irisRx * 0.88,
        ry: maxIrisRy * 0.88,
        fill: `url(#${irisGradId})`,
      });

      // Lower luminous jewel crescent inside iris
      out += el('ellipse', {
        cx: irisCx,
        cy: irisCy + maxIrisRy * 0.28,
        rx: irisRx * 0.64,
        ry: maxIrisRy * 0.42,
        fill: irisBright,
        'fill-opacity': 0.75,
      });

      // Mystic ring if mystic-glow or glowEyes
      if (eyeStyle === 'mystic-glow' || glowEyes) {
        out += el('ellipse', {
          cx: irisCx,
          cy: irisCy,
          rx: irisRx * 0.66,
          ry: maxIrisRy * 0.66,
          fill: 'none',
          stroke: lighten(irisBase, 0.55),
          'stroke-width': 0.75,
          'stroke-opacity': 0.9,
        });
      }

      // 4. Deep dark pupil + core tint
      const pupilR = Math.max(1.1, irisRx * 0.42 * spec.pupilScale);
      out += el('ellipse', {
        cx: irisCx,
        cy: irisCy - 0.15,
        rx: pupilR * 0.92,
        ry: pupilR * 1.06,
        fill: '#060810',
      });

      //Upper iris shade cap (under upper lashes)
      out += el('ellipse', {
        cx: irisCx,
        cy: irisCy - maxIrisRy * 0.38,
        rx: irisRx * 0.8,
        ry: maxIrisRy * 0.38,
        fill: irisTop,
        'fill-opacity': 0.65,
      });

      // 5. Dual Specular Catchlights
      const hlX1 = irisCx + catchDir * irisRx * 0.36;
      const hlY1 = irisCy - maxIrisRy * 0.32;
      const hlR1 = Math.max(0.85, irisRx * 0.27);
      out += el('ellipse', {
        cx: hlX1,
        cy: hlY1,
        rx: hlR1 * 0.88,
        ry: hlR1 * 1.15,
        fill: '#FFFFFF',
        'fill-opacity': 0.96,
      });
      // Secondary bounce catchlight
      const hlX2 = irisCx - catchDir * irisRx * 0.34;
      const hlY2 = irisCy + maxIrisRy * 0.34;
      const hlR2 = Math.max(0.5, irisRx * 0.14);
      out += el('circle', {
        cx: hlX2,
        cy: hlY2,
        r: hlR2,
        fill: '#FFFFFF',
        'fill-opacity': 0.82,
      });

      // 6. Sculpted Thick Upper Eyelash with Sharp Manhwa Wing
      const lashThick = 2.6 + lw * 0.5;
      const wingTip = { x: outer.x + side * 3.8, y: outer.y - 2.4 };
      const wingBase = { x: outer.x + side * 1.2, y: outer.y + 0.9 };
      const topLashOuterCtrl = { x: topCtrl.x + side * 0.6, y: topCtrl.y - lashThick };
      const lashPoly =
        `M${fmt(inner.x - side * 0.8)} ${fmt(inner.y + 0.6)}` +
        `Q${fmt(topLashOuterCtrl.x)} ${fmt(topLashOuterCtrl.y)} ${fmt(wingTip.x)} ${fmt(wingTip.y)}` +
        `L${fmt(wingBase.x)} ${fmt(wingBase.y)}` +
        `Q${fmt(topCtrl.x)} ${fmt(topCtrl.y + 0.3)} ${fmt(inner.x)} ${fmt(inner.y + 0.8)}Z`;
      out += el('path', { d: lashPoly, fill: ink });

      // Outer lash spikes (2 fine anime eyelash flicks)
      out += el('path', {
        d:
          `M${fmt(outer.x - side * 2)} ${fmt(outer.y - 1.2)}L${fmt(outer.x + side * 1.8)} ${fmt(outer.y - 3.6)}` +
          `M${fmt(outer.x + side * 0.4)} ${fmt(outer.y + 0.2)}L${fmt(outer.x + side * 3.2)} ${fmt(outer.y - 0.6)}`,
        fill: 'none',
        stroke: ink,
        'stroke-width': lw * 0.55 + 0.35,
        'stroke-linecap': 'round',
      });

      // Subtle double eyelid fold (futae crease) hugging the upper lash
      out += el('path', {
        d: `M${fmt(inner.x + side * 3.2)} ${fmt(inner.y - 1.6)}Q${fmt(topCtrl.x + side * 0.5)} ${fmt(topCtrl.y - lashThick - 0.8)} ${fmt(outer.x - side * 1.8)} ${fmt(outer.y - 1.9)}`,
        fill: 'none',
        stroke: skinDeep,
        'stroke-width': lw * 0.36 + 0.15,
        'stroke-linecap': 'round',
        'stroke-opacity': 0.52,
      });

      // Lower lash line + outer lower lash spur
      out += el('path', {
        d: `M${fmt(outer.x + side * 0.8)} ${fmt(outer.y + 0.6)}Q${fmt(botCtrl.x)} ${fmt(botCtrl.y)} ${fmt(inner.x + side * 1.8)} ${fmt(inner.y + 0.5)}`,
        fill: 'none',
        stroke: ink,
        'stroke-width': lw * 0.55 + 0.35,
        'stroke-linecap': 'round',
        'stroke-opacity': 0.85,
      });
      // Under-eye tension bag / exhaustion crease on intense expressions
      if (spec.cheekTension || shadingIntensity === 'heavy' || shadingIntensity === 'dramatic-noir') {
        out += el('path', {
          d: `M${fmt(inner.x + side * 3)} ${fmt(inner.y + botH * 0.85)}Q${fmt(cx + side * 1)} ${fmt(cy + botH * 1.35)} ${fmt(outer.x - side * 2)} ${fmt(outer.y + botH * 0.6)}`,
          fill: 'none',
          stroke: skinShadow,
          'stroke-width': lw * 0.45 + 0.2,
          'stroke-linecap': 'round',
          'stroke-opacity': 0.7,
        });
      }
    }

    // 7. Sculpted Tapered Eyebrow (filled polygon for realistic anime line weight taper)
    const bInner = { x: cx - side * 9.5, y: cy - 13.5 + spec.browInnerY };
    const bOuter = { x: cx + side * 12.5, y: cy - 15.2 + spec.browOuterY };
    const bMidY = Math.min(bInner.y, bOuter.y) + spec.browCurve;
    const browFill = darken(palette.hair, 0.22);
    const browD =
      `M${fmt(bInner.x)} ${fmt(bInner.y + 1.2)}` +
      `Q${fmt(cx + side * 1.5)} ${fmt(bMidY - 2.2)} ${fmt(bOuter.x)} ${fmt(bOuter.y)}` +
      `Q${fmt(cx + side * 1.8)} ${fmt(bMidY + 0.8)} ${fmt(bInner.x + side * 0.6)} ${fmt(bInner.y + 2.6)}Z`;
    out += el('path', {
      d: browD,
      fill: browFill,
      stroke: ink,
      'stroke-width': 0.4,
      'stroke-linejoin': 'round',
    });
  }

  // Glabella (between-brows) furrow creases on angry/determined/pain
  if (spec.browFurrow) {
    out += el('path', {
      d: 'M-2.8 -545L-1.6 -538M2.8 -545L1.6 -538M-0.1 -543L0.1 -539',
      fill: 'none',
      stroke: skinDeep,
      'stroke-width': lw * 0.45 + 0.25,
      'stroke-linecap': 'round',
      'stroke-opacity': 0.75,
    });
  }

  // Optional Cyber Visor accessory
  if (accessories.includes('cyber-visor')) {
    const visorGlow = defs.once(`visor-${palette.outfitAccent}`, 'visorglow', (id) =>
      glowFilter(id, 2.2, palette.outfitAccent, 0.9),
    );
    out += el('path', {
      d: 'M-36 -538L0 -531L36 -538L33 -522L0 -517L-33 -522Z',
      fill: palette.outfitAccent,
      'fill-opacity': 0.55,
      filter: `url(#${visorGlow})`,
    });
    out += el('path', {
      d: 'M-36 -538L0 -531L36 -538L33 -522L0 -517L-33 -522Z',
      fill: 'none',
      stroke: lighten(palette.outfitAccent, 0.45),
      'stroke-width': 1.1,
    });
  }

  if (!masked) {
    // 8. Angular Cel-Shaded Anime Nose
    const nDir = lightDirection === 'right' ? -1 : 1;
    // Minimal anime nose: a tiny soft tip accent and a faint bridge shadow (no closed polygon).
    out += el('path', {
      d: nDir > 0 ? 'M1.6 -521Q2.6 -516.5 1.2 -513.6' : 'M-1.6 -521Q-2.6 -516.5 -1.2 -513.6',
      fill: 'none',
      stroke: skinShadow,
      'stroke-width': lw * 0.5 + 0.2,
      'stroke-linecap': 'round',
      'stroke-opacity': 0.7,
    });
    out += el('path', {
      d: 'M-1.7 -513.2Q0 -512 1.7 -513.2',
      fill: 'none',
      stroke: skinDeep,
      'stroke-width': lw * 0.55 + 0.2,
      'stroke-linecap': 'round',
      'stroke-opacity': 0.8,
    });

    // 9. Sculpted Anime Mouth & Lower Lip Shadow
    out += renderAnimeMouthFront(spec.mouth, palette.skin, skinShadow, skinDeep, lw);
  }

  return out;
}

function renderAnimeMouthFront(
  mouth: AnimeExpressionSpec['mouth'],
  skin: string,
  skinShadow: string,
  skinDeep: string,
  lw: number,
): string {
  let out = '';
  const strokeW = lw * 0.75 + 0.45;

  switch (mouth) {
    case 'calm':
      // Graceful continuous anime lip line (no dashed gaps!) + subtle lower lip shadow
      out += el('path', {
        d: 'M-6.2 -501.5Q0 -500.5 6.2 -501.5',
        fill: 'none',
        stroke: skinDeep,
        'stroke-width': strokeW,
        'stroke-linecap': 'round',
      });
      out += el('path', {
        d: 'M-3.6 -497.6Q0 -495.6 3.6 -497.6Q0 -496.6 -3.6 -497.6Z',
        fill: skinShadow,
      });
      break;

    case 'firm':
      // Determined downward-cornered mouth
      out += el('path', {
        d: 'M-7.2 -500.6Q0 -502.4 7.2 -500.6',
        fill: 'none',
        stroke: skinDeep,
        'stroke-width': strokeW * 1.05,
        'stroke-linecap': 'round',
      });
      out += el('path', {
        d: 'M-4.2 -497.2L4.2 -497.2L0 -495.2Z',
        fill: skinShadow,
      });
      break;

    case 'smirk':
      out += el('path', {
        d: 'M-6.5 -500.8Q1.5 -500.5 8.8 -505.2',
        fill: 'none',
        stroke: skinDeep,
        'stroke-width': strokeW * 1.05,
        'stroke-linecap': 'round',
      });
      // Smirk corner dimple crease
      out += el('path', {
        d: 'M9.2 -507.2L10.4 -504.2',
        fill: 'none',
        stroke: skinDeep,
        'stroke-width': strokeW * 0.75,
        'stroke-linecap': 'round',
      });
      out += el('path', {
        d: 'M-3.5 -497.2Q1 -495.5 4.8 -498.2Z',
        fill: skinShadow,
      });
      break;

    case 'grit':
      // Clenched bared teeth
      out += el('path', {
        d: 'M-9.5 -504.5Q0 -506 9.5 -504.5L8.2 -497.5Q0 -496.2 -8.2 -497.5Z',
        fill: '#F8FAFC',
        stroke: skinDeep,
        'stroke-width': strokeW * 0.9,
        'stroke-linejoin': 'round',
      });
      // Tooth grid & center bite line
      out += el('path', {
        d: 'M-8.6 -501L8.5 -500.9M-4.5 -505L-4.2 -497.2M-0.1 -505.4L0.1 -496.8M4.5 -505L4.2 -497.2',
        fill: 'none',
        stroke: skinDeep,
        'stroke-width': 0.65,
      });
      // Lower lip shadow
      out += el('path', {
        d: 'M-5.5 -494.8Q0 -492.5 5.5 -494.8Z',
        fill: skinShadow,
      });
      break;

    case 'open-shout':
    case 'pain-gasp': {
      const w = mouth === 'open-shout' ? 6.2 : 5.2;
      const topY = -503.5;
      const depth = mouth === 'open-shout' ? 8.5 : 6;
      const cavity = darken(skin, 0.8);
      // Soft rounded open mouth: slim upper lip line, deep cavity, small tongue; teeth only a thin sliver.
      out += el('path', {
        d: `M${fmt(-w)} ${fmt(topY)}Q0 ${fmt(topY - 1.6)} ${fmt(w)} ${fmt(topY)}Q${fmt(w * 0.8)} ${fmt(topY + depth)} 0 ${fmt(topY + depth + 0.8)}Q${fmt(-w * 0.8)} ${fmt(topY + depth)} ${fmt(-w)} ${fmt(topY)}Z`,
        fill: cavity,
        stroke: skinDeep,
        'stroke-width': strokeW * 0.8,
        'stroke-linejoin': 'round',
      });
      out += el('path', {
        d: `M${fmt(-w * 0.72)} ${fmt(topY + 0.5)}Q0 ${fmt(topY - 0.9)} ${fmt(w * 0.72)} ${fmt(topY + 0.5)}L${fmt(w * 0.6)} ${fmt(topY + 1.6)}Q0 ${fmt(topY + 0.5)} ${fmt(-w * 0.6)} ${fmt(topY + 1.6)}Z`,
        fill: '#F8FAFC',
        'fill-opacity': 0.92,
      });
      out += el('path', {
        d: `M${fmt(-w * 0.5)} ${fmt(topY + depth - 0.6)}Q0 ${fmt(topY + depth - 4.2)} ${fmt(w * 0.5)} ${fmt(topY + depth - 0.6)}Q0 ${fmt(topY + depth + 0.4)} ${fmt(-w * 0.5)} ${fmt(topY + depth - 0.6)}Z`,
        fill: '#D9626E',
        'fill-opacity': 0.85,
      });
      break;
    }

    case 'predator-grin':
      out += el('path', {
        d: 'M-12.5 -506.5Q0 -502.5 12.5 -506.5Q8.5 -494.5 0 -494.2Q-8.5 -494.5 -12.5 -506.5Z',
        fill: '#F8FAFC',
        stroke: skinDeep,
        'stroke-width': strokeW * 0.95,
        'stroke-linejoin': 'round',
      });
      // Sharp fang divisions
      out += el('path', {
        d: 'M-9 -504.8L-7.5 -497.5M-4.5 -504L-4 -495.2M-0.1 -503.8L0.1 -494.4M4.5 -504L4 -495.2M9 -504.8L7.5 -497.5',
        fill: 'none',
        stroke: skinDeep,
        'stroke-width': 0.65,
      });
      break;
  }

  return out;
}

/**
 * Renders high-detail 3/4 perspective Manhwa face (head turned ~35 deg right):
 * full near eye, foreshortened far eye, angular nose bridge + shadow, and shifted mouth.
 */
export function renderAnimeFaceThreeQuarter(opts: EyeRenderOptions): string {
  const {
    palette,
    eyeStyle,
    expression,
    glowEyes,
    shadingIntensity,
    lw,
    defs,
    masked = false,
  } = opts;
  const spec = ANIME_EXPRESSIONS[expression];
  const ink = darken(palette.hair, 0.72);
  const skin = palette.skin;
  const skinShadow = darken(skin, shadingIntensity === 'soft' ? 0.16 : 0.24);
  const skinDeep = darken(skin, 0.44);
  const hideEyes = expression === 'shadowed' || expression === 'menacing-glow';

  const irisBase = palette.eyes;
  const irisTop = darken(irisBase, 0.58);
  const irisBright = lighten(irisBase, 0.42);
  const irisGradId = defs.once(`anime-iris-3q-${irisBase}`, 'irisgrad', (id) =>
    linearGradient(
      id,
      [
        { offset: 0, color: irisTop },
        { offset: 0.5, color: irisBase },
        { offset: 1, color: irisBright },
      ],
      90,
    ),
  );

  let out = '';
  const cy = -533;
  const styleH =
    eyeStyle === 'soft-shojo' ? 1.18 : eyeStyle === 'villain-narrow' ? 0.76 : eyeStyle === 'sharp-hunter' ? 0.9 : 1.0;

  // Near eye (left, well-spaced from nose bridge) and Far eye (right, perspective-foreshortened)
  const eyes = [
    { cx: 1.5, halfW: 8.6, perspX: 1.0, irisOffset: 1.1, isNear: true },
    { cx: 24.5, halfW: 5.5, perspX: 0.72, irisOffset: 0.6, isNear: false },
  ];

  for (const e of eyes) {
    const open = spec.eyeOpen * styleH;
    const topH = 6.2 * open;
    const botH = Math.max(2.0, (4.4 - spec.lowerLidLift * 0.6) * open);
    const inner = { x: e.cx + (e.isNear ? e.halfW : -e.halfW), y: cy + 1.0 };
    const outer = { x: e.cx + (e.isNear ? -e.halfW : e.halfW), y: cy - (e.isNear ? 1.6 : 1.0) };
    const topCtrl = { x: e.cx, y: cy - topH * 1.3 };
    const botCtrl = { x: e.cx, y: cy + botH * 1.3 };

    const upperCurve = `M${fmt(inner.x)} ${fmt(inner.y)}Q${fmt(topCtrl.x)} ${fmt(topCtrl.y)} ${fmt(outer.x)} ${fmt(outer.y)}`;
    const lowerCurve = `Q${fmt(botCtrl.x)} ${fmt(botCtrl.y)} ${fmt(inner.x)} ${fmt(inner.y)}`;

    if (!hideEyes) {
      // Sclera + upper socket shadow
      out += el('path', { d: `${upperCurve}${lowerCurve}Z`, fill: '#F8FAFC' });
      out += el('path', {
        d: `${upperCurve}Q${fmt(e.cx)} ${fmt(cy - topH * 0.4)} ${fmt(inner.x)} ${fmt(inner.y)}Z`,
        fill: '#CBD5E1',
        'fill-opacity': 0.75,
      });

      // Strictly bounded Iris
      const yTop = 0.25 * inner.y + 0.5 * topCtrl.y + 0.25 * outer.y;
      const yBot = 0.25 * inner.y + 0.5 * botCtrl.y + 0.25 * outer.y;
      const eyeHalfH = Math.max(1.8, (yBot - yTop) * 0.5);
      const maxIrisRy = Math.min(eyeHalfH * 0.94, Math.max(1.8, eyeHalfH * 0.9 * spec.irisScale));
      const irisRx = Math.min(4.4, maxIrisRy * 0.94 + 0.4) * spec.irisScale * e.perspX;
      const irisCy = Math.min((yTop + yBot) * 0.5 - 0.1, yBot - maxIrisRy - 0.25);
      const irisCx = e.cx + e.irisOffset;

      out += el('ellipse', { cx: irisCx, cy: irisCy, rx: irisRx, ry: maxIrisRy, fill: irisTop });
      out += el('ellipse', { cx: irisCx, cy: irisCy, rx: irisRx * 0.86, ry: maxIrisRy * 0.86, fill: `url(#${irisGradId})` });
      out += el('ellipse', { cx: irisCx, cy: irisCy + maxIrisRy * 0.26, rx: irisRx * 0.6, ry: maxIrisRy * 0.4, fill: irisBright, 'fill-opacity': 0.72 });
      if (eyeStyle === 'mystic-glow' || glowEyes) {
        out += el('ellipse', { cx: irisCx, cy: irisCy, rx: irisRx * 0.64, ry: maxIrisRy * 0.64, fill: 'none', stroke: lighten(irisBase, 0.55), 'stroke-width': 0.7 });
      }
      const pupilR = Math.max(1.0, irisRx * 0.42 * spec.pupilScale);
      out += el('ellipse', { cx: irisCx, cy: irisCy - 0.1, rx: pupilR * 0.92, ry: pupilR * 1.08, fill: '#060810' });
      out += el('circle', { cx: irisCx - irisRx * 0.34, cy: irisCy - maxIrisRy * 0.3, r: Math.max(0.7, irisRx * 0.24), fill: '#FFFFFF', 'fill-opacity': 0.96 });
      out += el('circle', { cx: irisCx + irisRx * 0.3, cy: irisCy + maxIrisRy * 0.32, r: Math.max(0.4, irisRx * 0.13), fill: '#FFFFFF', 'fill-opacity': 0.8 });

      // Tapered upper lash
      const lashThick = 2.4 + lw * 0.45;
      const wingDir = e.isNear ? -1 : 1;
      const lashPoly =
        `M${fmt(inner.x)} ${fmt(inner.y + 0.5)}` +
        `Q${fmt(topCtrl.x)} ${fmt(topCtrl.y - lashThick)} ${fmt(outer.x + wingDir * 2.8)} ${fmt(outer.y - 1.8)}` +
        `L${fmt(outer.x + wingDir * 0.8)} ${fmt(outer.y + 0.8)}` +
        `Q${fmt(topCtrl.x)} ${fmt(topCtrl.y + 0.3)} ${fmt(inner.x)} ${fmt(inner.y + 0.8)}Z`;
      out += el('path', { d: lashPoly, fill: ink });

      // Subtle futae crease
      out += el('path', {
        d: `M${fmt(inner.x + (e.isNear ? -2 : 1.5))} ${fmt(inner.y - 1.5)}Q${fmt(topCtrl.x)} ${fmt(topCtrl.y - lashThick - 0.7)} ${fmt(outer.x - wingDir * 1.5)} ${fmt(outer.y - 1.7)}`,
        fill: 'none',
        stroke: skinDeep,
        'stroke-width': lw * 0.34 + 0.15,
        'stroke-linecap': 'round',
        'stroke-opacity': 0.5,
      });

      // Lower lash line
      out += el('path', {
        d: `M${fmt(outer.x)} ${fmt(outer.y + 0.4)}Q${fmt(botCtrl.x)} ${fmt(botCtrl.y)} ${fmt(inner.x)} ${fmt(inner.y + 0.4)}`,
        fill: 'none',
        stroke: ink,
        'stroke-width': lw * 0.5 + 0.3,
        'stroke-linecap': 'round',
        'stroke-opacity': 0.85,
      });
    }
  }

  // Sculpted tapered eyebrows (near & foreshortened far)
  const browFill = darken(palette.hair, 0.22);
  out += el('path', {
    d: `M-7.5 ${fmt(-545 + spec.browOuterY * 0.4)}Q1.5 -550 10.5 ${fmt(-545 + spec.browInnerY * 0.5)}L10 ${fmt(-543 + spec.browInnerY * 0.5)}Q1.5 -547.5 -7 ${fmt(-543.5 + spec.browOuterY * 0.4)}Z`,
    fill: browFill,
  });
  out += el('path', {
    d: `M19.5 ${fmt(-545 + spec.browInnerY * 0.5)}Q25 -549.5 30 ${fmt(-545.5 + spec.browOuterY * 0.4)}L29.5 ${fmt(-543.8 + spec.browOuterY * 0.4)}Q25 -547.2 20 ${fmt(-543.2 + spec.browInnerY * 0.5)}Z`,
    fill: browFill,
  });

  if (!masked) {
    // Crisp Manhwa 3/4 nose near the far cheek plane + delicate narrow shadow (never a chunky gray triangle)
    out += el('path', {
      d: 'M21.5 -529L25.5 -517.5L22 -516Z',
      fill: skinShadow,
      'fill-opacity': 0.36,
    });
    out += el('path', {
      d: 'M21.8 -528L26.2 -517.5Q25.4 -515.8 22.4 -515.2',
      fill: 'none',
      stroke: skinDeep,
      'stroke-width': lw * 0.65 + 0.25,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });

    // Shifted asymmetric Manhwa mouth + subtle lower lip shadow
    const my = -500.5;
    if (spec.mouth === 'smirk') {
      out += el('path', {
        d: `M14 ${fmt(my)}Q18.5 ${fmt(my + 0.8)} 23 ${fmt(my - 1.5)}`,
        fill: 'none',
        stroke: skinDeep,
        'stroke-width': lw * 0.72 + 0.35,
        'stroke-linecap': 'round',
      });
    } else if (spec.mouth === 'open-shout' || spec.mouth === 'pain-gasp') {
      out += el('path', {
        d: `M14 ${fmt(my - 1)}Q18.5 ${fmt(my - 2.5)} 23 ${fmt(my - 1)}Q22 ${fmt(my + 5)} 18.5 ${fmt(my + 5.5)}Q15 ${fmt(my + 5)} 14 ${fmt(my - 1)}Z`,
        fill: '#450A0A',
        stroke: skinDeep,
        'stroke-width': lw * 0.7,
      });
    } else {
      out += el('path', {
        d: `M15.5 ${fmt(my)}Q19 ${fmt(my + 0.4)} 22.5 ${fmt(my - 0.5)}`,
        fill: 'none',
        stroke: skinDeep,
        'stroke-width': lw * 0.72 + 0.35,
        'stroke-linecap': 'round',
      });
    }
    // Lower lip cel-shadow accent
    out += el('path', {
      d: `M17 ${fmt(my + 3.0)}Q19 ${fmt(my + 3.8)} 21 ${fmt(my + 3.0)}`,
      fill: 'none',
      stroke: skinShadow,
      'stroke-width': 1.2,
      'stroke-linecap': 'round',
      'stroke-opacity': 0.75,
    });
  }

  return out;
}

/**
 * Renders high-detail side-profile anime eye, brow, nose shadow and mouth.
 */
export function renderAnimeFaceProfile(
  palette: CharacterPalette,
  expr: Expression,
  defs: DefsCollector,
  lw: number,
  masked: boolean,
): string {
  const spec = ANIME_EXPRESSIONS[expr];
  const ink = darken(palette.hair, 0.72);
  const skinShadow = darken(palette.skin, 0.3);
  const skinDeep = darken(palette.skin, 0.58);
  let out = '';

  const irisBase = palette.eyes;
  const irisTop = darken(irisBase, 0.6);
  const irisBright = lighten(irisBase, 0.42);
  const irisGradId = defs.once(`anime-iris-${irisBase}`, 'irisgrad', (id) =>
    linearGradient(
      id,
      [
        { offset: 0, color: irisTop },
        { offset: 0.5, color: irisBase },
        { offset: 1, color: irisBright },
      ],
      90,
    ),
  );

  if (expr !== 'shadowed' && expr !== 'menacing-glow') {
    const o = spec.eyeOpen;
    // Triangular profile eye opening
    const eyeD = `M18 -530.5Q26 ${fmt(-537 - 4.2 * o)} 34.5 -534.5Q31 ${fmt(-527 + 2 * o)} 18 -530.5Z`;
    out += el('path', { d: eyeD, fill: '#F8FAFC' });
    // Upper socket shade
    out += el('path', {
      d: `M18 -530.5Q26 ${fmt(-537 - 4.2 * o)} 34.5 -534.5Q27 ${fmt(-533 - 1.5 * o)} 18 -530.5Z`,
      fill: '#CBD5E1',
    });
    // Profile iris positioned near the front edge of the eye
    const ry = 3.8 * Math.min(1.05, o + 0.1) * spec.irisScale;
    const rx = 2.4 * spec.irisScale;
    out += el('ellipse', { cx: 30.2, cy: -532.2, rx, ry, fill: `url(#${irisGradId})` });
    out += el('ellipse', { cx: 30.6, cy: -532.2, rx: rx * 0.48, ry: ry * 0.52, fill: '#060810' });
    out += el('circle', { cx: 29.4, cy: -533.8, r: 0.95, fill: '#FFFFFF' });
    out += el('circle', { cx: 31.2, cy: -530.5, r: 0.5, fill: '#FFFFFF', 'fill-opacity': 0.85 });

    // Thick winged profile upper lash
    out += el('path', {
      d: `M15.5 -530.5Q25 ${fmt(-539.5 - 4.2 * o)} 36 -534.5L34 -533Q25 ${fmt(-536.5 - 4.2 * o)} 17.5 -530Z`,
      fill: ink,
    });
    // Double eyelid fold
    out += el('path', {
      d: `M18 -534.5Q26 ${fmt(-541.5 - 4 * o)} 34.5 -537.5`,
      fill: 'none',
      stroke: skinDeep,
      'stroke-width': lw * 0.45 + 0.2,
      'stroke-linecap': 'round',
    });
  }

  // Sculpted profile brow
  out += el('path', {
    d: `M15 ${fmt(-545 + spec.browOuterY * 0.4)}Q26 -551 37.5 ${fmt(-546 + spec.browInnerY * 0.5)}L36.5 ${fmt(-543.8 + spec.browInnerY * 0.5)}Q26 -548.2 15.5 ${fmt(-543.5 + spec.browOuterY * 0.4)}Z`,
    fill: darken(palette.hair, 0.22),
  });

  if (!masked) {
    // Under-nose shadow wedge
    out += el('path', {
      d: 'M43 -516L50 -519.5L44.5 -513.5Z',
      fill: skinShadow,
    });
    // Mouth line
    out += el('path', {
      d: spec.mouth === 'smirk' ? 'M33 -505.5Q38 -504 42.5 -505' : 'M34.5 -504.5L42.5 -505',
      fill: 'none',
      stroke: skinDeep,
      'stroke-width': lw * 0.75 + 0.4,
      'stroke-linecap': 'round',
    });
  }

  return out;
}

/**
 * Dramatic glowing manhwa eyes with trailing energy flare (Solo Leveling style).
 */
export function renderAnimeGlowingEyes(
  color: string,
  defs: DefsCollector,
  profile: boolean,
): string {
  const filterId = defs.once(`glow-eyes-${color}`, 'eyeglow', (id) => glowFilter(id, 3.2, color, 1));
  const coreColor = lighten(color, 0.65);

  if (profile) {
    const d = poly([
      { x: 18, y: -530.5 },
      { x: 27, y: -536.5 },
      { x: 35.5, y: -535 },
      { x: 30, y: -529.5 },
    ]);
    const trail = 'M34 -535C44 -539 56 -546 68 -558C54 -542 42 -534 31 -530Z';
    return (
      `<g filter="url(#${filterId})">` +
      el('path', { d: trail, fill: color, 'fill-opacity': 0.75 }) +
      el('path', { d, fill: color }) +
      el('path', { d, fill: coreColor, transform: 'scale(0.75)', 'transform-origin': '28 -533' }) +
      `</g>`
    );
  }

  const eyeShape = (cx: number, side: number) =>
    poly([
      { x: cx - side * 9, y: -530.5 },
      { x: cx + side * 1, y: -536.5 },
      { x: cx + side * 12, y: -537.5 },
      { x: cx + side * 4, y: -529.5 },
    ]);
  const flareTrail = (cx: number, side: number) =>
    `M${fmt(cx + side * 8)} -536C${fmt(cx + side * 22)} -542 ${fmt(cx + side * 36)} -554 ${fmt(cx + side * 48)} -570` +
    `C${fmt(cx + side * 34)} -548 ${fmt(cx + side * 20)} -536 ${fmt(cx + side * 6)} -531Z`;

  const d = `${eyeShape(-16.2, -1)}${eyeShape(16.2, 1)}`;
  const trails = `${flareTrail(-16.2, -1)}${flareTrail(16.2, 1)}`;
  return (
    `<g filter="url(#${filterId})">` +
    el('path', { d: trails, fill: color, 'fill-opacity': 0.7 }) +
    el('path', { d, fill: color }) +
    el('path', { d: `${eyeShape(-16.2, -1)}`, fill: coreColor }) +
    el('path', { d: `${eyeShape(16.2, 1)}`, fill: coreColor }) +
    `</g>`
  );
}

// ---------------------------------------------------------------------------
// Multi-Layered Faceted Anime Hair + Angel Ring Shine
// ---------------------------------------------------------------------------

export type ResolvedHairStyle =
  | 'spiky-manhwa'
  | 'wild-primitive'
  | 'undercut-sleek'
  | 'ponytail-ronin'
  | 'long-flowing'
  | 'hooded-shadow'
  | 'none';

export function resolveHairStyle(
  presetStyle: HairStylePreset | undefined,
  silhouette: SilhouettePreset,
): ResolvedHairStyle {
  if (presetStyle && presetStyle !== 'auto') return presetStyle;
  switch (silhouette) {
    case 'primitive-hunter':
      return 'wild-primitive';
    case 'martial-artist':
      return 'spiky-manhwa';
    case 'hooded-mage':
      return 'long-flowing';
    case 'cyber-assassin':
      return 'spiky-manhwa';
    case 'casual-student':
      return 'undercut-sleek';
    case 'armored-knight':
      return 'ponytail-ronin';
    case 'suit-detective':
      return 'undercut-sleek';
    case 'shadow-entity':
      return 'none';
    case 'none':
    default:
      return 'spiky-manhwa';
  }
}

/**
 * Renders the back volume of the hair (drawn behind the head and neck) using
 * flowing organic S/C-curve Bézier locks instead of straight-polygon spikes.
 */
export function renderAnimeHairBack(
  style: ResolvedHairStyle,
  pose: Pose,
  hairColor: string,
  ink: string,
  lw: number,
): string {
  if (style === 'none' || style === 'hooded-shadow') return '';
  const baseDark = darken(hairColor, 0.22);
  const deepDark = darken(hairColor, 0.38);

  if (pose === 'three-quarter') {
    const isFemaleLong = style === 'long-flowing';
    const nape3Q = isFemaleLong
      ? 'M-36 -528C-50 -494 -50 -450 -40 -414Q-28 -436 -20 -438C-22 -470 -22 -504 -26 -528Z'
      : 'M-38 -528C-46 -502 -45 -476 -37 -462Q-31 -476 -26 -478Q-22 -466 -18 -472C-22 -492 -24 -510 -26 -528Z';
    return el('path', {
      d: nape3Q,
      fill: baseDark,
      stroke: ink,
      'stroke-width': lw * 0.92,
      'stroke-linejoin': 'round',
    });
  }

  if (style === 'wild-primitive') {
    // Flowing layered primal mane: curved convex-to-concave locks with razor-sharp pointed tips
    const maneOuter =
      'M-48 -558' +
      'Q-66 -544 -68 -528Q-58 -530 -56 -520' +
      'Q-76 -500 -76 -476Q-62 -482 -58 -470' +
      'Q-76 -446 -68 -418Q-54 -434 -46 -440' +
      'Q-44 -416 -30 -404Q-22 -426 -12 -432' +
      'Q0 -416 12 -432Q22 -426 30 -404' +
      'Q44 -416 46 -440Q54 -434 68 -418' +
      'Q76 -446 58 -470Q62 -482 76 -476' +
      'Q76 -500 56 -520Q58 -530 68 -528' +
      'Q66 -544 48 -558C38 -604 -38 -604 -48 -558Z';
    const maneInner =
      'M-44 -524Q-56 -486 -44 -442Q-34 -456 -24 -434Q0 -448 24 -434Q34 -456 44 -442Q56 -486 44 -524Z';
    const maneStrands =
      'M-54 -526Q-62 -484 -54 -436M-40 -512Q-46 -470 -36 -424M40 -512Q46 -470 36 -424M54 -526Q62 -484 54 -436';
    return (
      el('path', {
        d: maneOuter,
        fill: baseDark,
        stroke: ink,
        'stroke-width': lw * 0.95,
        'stroke-linejoin': 'round',
      }) +
      el('path', { d: maneInner, fill: deepDark, 'fill-opacity': 0.9 }) +
      el('path', {
        d: maneStrands,
        fill: 'none',
        stroke: deepDark,
        'stroke-width': lw * 0.55,
        'stroke-linecap': 'round',
      })
    );
  }

  if (style === 'long-flowing') {
    const longD =
      'M-48 -554' +
      'C-64 -512 -68 -454 -56 -398' +
      'Q-46 -418 -38 -424' +
      'Q-34 -402 -24 -392' +
      'Q-14 -414 -4 -416' +
      'Q4 -396 14 -416' +
      'Q24 -402 30 -392' +
      'Q38 -414 46 -424' +
      'Q54 -406 58 -398' +
      'C68 -454 64 -512 48 -554' +
      'C36 -606 -36 -606 -48 -554Z';
    const innerShade =
      'M-40 -520C-46 -478 -44 -438 -36 -414Q0 -434 36 -414C44 -438 46 -478 40 -520Z';
    const flowLines =
      'M-50 -524C-58 -484 -58 -446 -48 -414M50 -524C58 -484 58 -446 48 -414';
    return (
      el('path', {
        d: longD,
        fill: baseDark,
        stroke: ink,
        'stroke-width': lw * 0.95,
        'stroke-linejoin': 'round',
      }) +
      el('path', { d: innerShade, fill: deepDark, 'fill-opacity': 0.85 }) +
      el('path', {
        d: flowLines,
        fill: 'none',
        stroke: deepDark,
        'stroke-width': lw * 0.5,
        'stroke-linecap': 'round',
      })
    );
  }

  if (style === 'ponytail-ronin') {
    const tailDir = pose === 'action-lunge' ? -1 : 1;
    const tailD =
      `M0 -590C${fmt(26 * tailDir)} -626 ${fmt(68 * tailDir)} -610 ${fmt(94 * tailDir)} -566` +
      `Q${fmt(78 * tailDir)} -570 ${fmt(70 * tailDir)} -564` +
      `Q${fmt(88 * tailDir)} -544 ${fmt(84 * tailDir)} -526` +
      `Q${fmt(68 * tailDir)} -540 ${fmt(60 * tailDir)} -536` +
      `Q${fmt(66 * tailDir)} -518 ${fmt(58 * tailDir)} -506` +
      `C${fmt(40 * tailDir)} -532 ${fmt(20 * tailDir)} -560 0 -572Z`;
    const napeSpikes =
      'M-44 -518Q-56 -500 -48 -484Q-38 -496 -34 -476Q-20 -492 0 -490Q20 -492 34 -476Q38 -496 48 -484Q56 -500 44 -518Z';
    return (
      el('path', { d: tailD, fill: baseDark, stroke: ink, 'stroke-width': lw * 0.95, 'stroke-linejoin': 'round' }) +
      el('path', { d: napeSpikes, fill: deepDark, stroke: ink, 'stroke-width': lw * 0.9, 'stroke-linejoin': 'round' })
    );
  }

  // Default spiky-manhwa / undercut curved nape locks framing neck & ears
  const napeD =
    'M-44 -536Q-58 -518 -50 -504Q-60 -490 -46 -482Q-46 -470 -32 -484Q-16 -490 0 -488Q16 -490 32 -484Q46 -470 46 -482Q60 -490 50 -504Q58 -518 44 -536Z';
  return el('path', {
    d: napeD,
    fill: baseDark,
    stroke: ink,
    'stroke-width': lw * 0.95,
    'stroke-linejoin': 'round',
  });
}

/**
 * Renders flowing multi-layered organic Bézier hair ribbons, cheek-framing
 * side-locks, curved cel-shadow strands, stray flyaway wisps, and a smooth
 * curved anime "Angel Ring" highlight ribbon.
 */
export function renderAnimeHairFront(
  style: ResolvedHairStyle,
  pose: Pose,
  hairColor: string,
  accentColor: string,
  ink: string,
  lw: number,
  _prng: Prng,
  defs?: DefsCollector,
  rimColor?: string,
): string {
  if (style === 'none') return '';

  const darkStrand = darken(hairColor, 0.25);
  const deepStrand = darken(hairColor, 0.42);
  const midHighlight = lighten(hairColor, 0.16);
  const angelRingColor = mix(lighten(hairColor, 0.54), accentColor, 0.22);

  // Atmospheric rim/sky gradient fill (gives Manhwa 3D lighting across the hair mass)
  const hairFill =
    defs && rimColor
      ? `url(#${defs.once(`hair-atmo-${hairColor}-${rimColor}`, 'hairatmo', (id) =>
          linearGradient(
            id,
            [
              { offset: 0, color: mix(hairColor, rimColor, 0.36) },
              { offset: 0.42, color: hairColor },
              { offset: 1, color: darken(hairColor, 0.14) },
            ],
            155,
          ),
        )})`
      : hairColor;

  if (pose === 'three-quarter') {
    const isFemaleLong = style === 'long-flowing';
    const hair3Q = isFemaleLong
      ? // Silky female 3/4 dome with soft parted curtain bangs & long cheek-framing lock (leaving ear notch!)
        'M-41 -532' +
        'C-46 -564 -34 -598 -10 -608' +
        'C12 -616 32 -602 38 -572' +
        'C38 -558 34 -548 30 -544' +
        // Parted curtain bangs curving softly to the temples
        'C24 -556 14 -562 6 -562' +
        'C-2 -562 -10 -556 -16 -546' +
        // Sideburn lock in front of the ear (ear sits cleanly at x=-26 behind this!)
        'C-20 -526 -20 -494 -16 -468' +
        'Q-25 -486 -26 -508' +
        'Q-28 -534 -35 -536' +
        // Sweeping back-of-ear hair to nape (covering temple skin cleanly)
        'Q-40 -532 -42 -520Z'
      : // Male Manhwa 3/4 layered sweeping bangs, leaving ear cleanly visible behind sideburn!
        'M-41 -524' +
        'C-47 -550 -42 -586 -18 -606' +
        'C6 -618 32 -604 38 -572' +
        'Q40 -556 35 -548' +
        'Q31 -558 26 -556' +
        // Bangs sweeping cleanly above brow & temple
        'Q24 -544 19 -540' +
        'Q19 -554 13 -555' +
        'Q11 -538 4 -534' +
        'Q3 -552 -3 -552' +
        'Q-7 -534 -13 -528' +
        'Q-16 -548 -20 -548' +
        // Cheek-framing sideburn in front of the ear
        'C-22 -528 -22 -504 -18 -486' +
        'Q-24 -500 -26 -514' +
        'Q-29 -536 -36 -536' +
        'Q-40 -532 -41 -524Z';

    const shade3Q =
      'M-38 -534C-38 -560 -22 -590 4 -598C-12 -582 -18 -562 -16 -544Q-26 -546 -38 -534Z';
    const angel3Q =
      'M-20 -582C-4 -595 16 -593 28 -578Q16 -584 0 -586Q-12 -586 -20 -582Z';
    const lockGrooves3Q = isFemaleLong
      ? 'M-30 -586Q-36 -558 -32 -536M-16 -534Q-20 -504 -18 -474'
      : 'M-26 -586Q-32 -558 -28 -534M-8 -596Q-10 -570 -7 -550M8 -596Q14 -572 10 -554';

    return (
      el('path', { d: hair3Q, fill: hairFill, stroke: ink, 'stroke-width': lw * 0.95, 'stroke-linejoin': 'round' }) +
      el('path', { d: shade3Q, fill: darkStrand, 'fill-opacity': 0.3 }) +
      el('path', { d: angel3Q, fill: angelRingColor, 'fill-opacity': 0.45 }) +
      el('path', { d: lockGrooves3Q, fill: 'none', stroke: deepStrand, 'stroke-width': lw * 0.48, 'stroke-linecap': 'round', 'stroke-opacity': 0.58 })
    );
  }

  if (pose === 'facing-away') {
    const backCap =
      'M-48 -504Q-58 -522 -50 -538C-54 -580 -28 -612 0 -614C28 -612 54 -580 50 -538Q58 -522 48 -504' +
      'Q42 -486 34 -482Q30 -498 22 -498Q16 -480 8 -476Q4 -494 0 -494Q-4 -494 -8 -476Q-16 -480 -22 -498Q-30 -498 -34 -482Q-42 -486 -48 -504Z';
    const angelBack =
      'M-34 -564Q-18 -574 -6 -564Q0 -570 6 -564Q18 -574 34 -564Q24 -556 10 -558Q0 -562 -10 -558Q-24 -556 -34 -564Z';
    return (
      el('path', { d: backCap, fill: hairColor, stroke: ink, 'stroke-width': lw * 0.95, 'stroke-linejoin': 'round' }) +
      el('path', { d: angelBack, fill: angelRingColor, 'fill-opacity': 0.42 })
    );
  }

  if (pose === 'dramatic-profile') {
    const profBase =
      'M-42 -504' +
      'Q-56 -514 -58 -528Q-48 -528 -44 -536' +
      'Q-60 -552 -56 -568Q-44 -566 -38 -572' +
      'Q-46 -592 -32 -604Q-22 -594 -16 -596' +
      'Q-10 -616 10 -612Q18 -604 22 -598' +
      'C40 -596 52 -578 52 -552' +
      'Q44 -562 39 -556' +
      'Q42 -536 34 -528' +
      'Q31 -548 25 -548' +
      'Q22 -526 14 -520' +
      'Q12 -544 6 -546' +
      'Q2 -522 -6 -518' +
      'Q-8 -542 -14 -544' +
      'Q-20 -516 -30 -506Z';
    const profShade =
      'M-38 -512C-44 -532 -40 -556 -24 -574Q-6 -562 8 -546Q-4 -536 -14 -522Q-24 -532 -38 -512Z';
    const profAngel =
      'M-26 -568Q-8 -580 10 -574Q24 -570 34 -562Q22 -558 8 -564Q-10 -568 -24 -558Z';
    const profLines =
      'M-18 -590Q-26 -556 -20 -524M4 -594Q12 -562 10 -528M24 -588Q34 -564 32 -536';
    return (
      el('path', { d: profBase, fill: hairColor, stroke: ink, 'stroke-width': lw * 0.95, 'stroke-linejoin': 'round' }) +
      el('path', { d: profShade, fill: darkStrand, 'fill-opacity': 0.72 }) +
      el('path', { d: profAngel, fill: angelRingColor, 'fill-opacity': 0.44 }) +
      el('path', { d: profLines, fill: 'none', stroke: deepStrand, 'stroke-width': lw * 0.5, 'stroke-linecap': 'round' })
    );
  }

  // Front view: Layer 1 — Curved under-fringe & cheek-hugging side-locks
  const underFringe =
    style === 'long-flowing'
      ? ''
      : 'M-44 -546' +
        'C-52 -524 -50 -502 -42 -488' +
        'Q-40 -508 -34 -514' +
        'Q-34 -498 -28 -490' +
        'C-30 -514 -31 -534 -28 -546' +
        'Q-14 -550 -5 -546' +
        'Q-3 -534 0 -526' +
        'Q3 -534 5 -546' +
        'Q14 -550 28 -546' +
        'C31 -534 30 -514 28 -490' +
        'Q34 -498 34 -514' +
        'Q40 -508 42 -488' +
        'C50 -502 52 -524 44 -546Z';

  // Layer 2 — Main sculpted crown & flowing curved razor-tipped anime locks
  let mainHairD = '';
  let flyaways = '';
  if (style === 'wild-primitive') {
    mainHairD =
      'M-46 -540' +
      // Left-to-top curved sweeping anime spikes (convex curve to sharp tip, concave curve to valley)
      'Q-62 -544 -68 -556Q-54 -558 -48 -564' +
      'Q-66 -578 -62 -594Q-48 -588 -40 -590' +
      'Q-46 -610 -32 -618Q-24 -606 -16 -604' +
      'Q-12 -624 4 -626Q10 -612 14 -606' +
      'Q28 -622 44 -612Q38 -600 36 -594' +
      'Q58 -598 64 -580Q50 -576 48 -568' +
      'Q64 -558 64 -544Q52 -546 46 -540' +
      // Right cheek-framing curved lock
      'C52 -514 50 -494 42 -482' +
      'Q42 -504 35 -512' +
      'Q34 -494 28 -486' +
      'C31 -512 31 -536 28 -550' +
      // Flowing parted bangs arched above eyes (x=±16) with central curved lock
      'Q20 -556 14 -546' +
      'Q10 -556 5 -552' +
      'Q4 -532 0 -522' +
      'Q-4 -536 -5 -552' +
      'Q-10 -556 -14 -546' +
      'Q-20 -556 -28 -550' +
      // Left cheek-framing curved lock
      'C-31 -536 -31 -512 -28 -486' +
      'Q-34 -494 -35 -512' +
      'Q-42 -504 -42 -482' +
      'C-50 -494 -52 -514 -46 -540Z';
    flyaways = 'M-6 -614Q2 -632 16 -626M38 -596Q54 -610 64 -600';
  } else if (style === 'long-flowing') {
    // Smooth silky anime dome crown with elegant parted curtain bangs framing the temples cleanly
    mainHairD =
      'M-46 -542' +
      'C-50 -582 -30 -608 0 -610' +
      'C30 -608 50 -582 46 -542' +
      // Right cheek-framing long silky lock
      'C52 -514 50 -486 42 -466' +
      'Q40 -496 35 -516' +
      'C33 -532 32 -544 28 -552' +
      // Elegant parted curtain bangs (curve from temple to side parting, brow center stays open)
      'C24 -554 18 -558 12 -560' +
      'C8 -562 3 -564 0 -562' +
      'C-3 -564 -8 -562 -12 -560' +
      'C-18 -558 -24 -554 -28 -552' +
      // Left cheek-framing long silky lock
      'C-32 -544 -33 -532 -35 -516' +
      'Q-40 -496 -42 -466' +
      'C-50 -486 -52 -514 -46 -542Z';
    flyaways = 'M-2 -609Q10 -622 22 -616';
  } else if (style === 'undercut-sleek') {
    mainHairD =
      'M-44 -542' +
      'C-48 -584 -26 -610 0 -612' +
      'C28 -612 48 -586 44 -542' +
      'C42 -524 38 -512 34 -506' +
      'Q34 -530 29 -548' +
      'Q21 -556 14 -546' +
      'Q8 -556 3 -550' +
      'Q2 -532 -1 -524' +
      'Q-5 -538 -6 -552' +
      'Q-14 -556 -21 -548' +
      'Q-28 -554 -31 -546' +
      'Q-35 -528 -35 -508' +
      'C-40 -518 -43 -528 -44 -542Z';
    flyaways = 'M-4 -611Q6 -624 18 -618';
  } else {
    // spiky-manhwa / ponytail-ronin: swept curved razor-tipped anime locks
    mainHairD =
      'M-45 -540' +
      'Q-58 -546 -60 -558Q-48 -560 -45 -566' +
      'Q-58 -580 -52 -594Q-40 -588 -34 -590' +
      'Q-38 -608 -24 -614Q-16 -604 -10 -602' +
      'Q-4 -620 12 -618Q16 -606 20 -600' +
      'Q36 -614 48 -602Q40 -592 38 -586' +
      'Q56 -588 58 -570Q46 -568 45 -560' +
      'Q56 -550 54 -538Q48 -540 45 -538' +
      // Smooth cheek-framing ribbons
      'C48 -514 46 -496 38 -486' +
      'Q38 -506 32 -514' +
      'Q31 -532 28 -548' +
      'Q20 -556 14 -546' +
      'Q9 -556 4 -552' +
      'Q3 -532 0 -523' +
      'Q-4 -536 -5 -552' +
      'Q-10 -556 -15 -546' +
      'Q-21 -556 -28 -548' +
      'Q-31 -532 -32 -514' +
      'Q-38 -506 -38 -486' +
      'C-46 -496 -48 -514 -45 -540Z';
    flyaways = 'M4 -614Q14 -628 26 -622M-36 -592Q-48 -604 -56 -596';
  }

  // Layer 3 — Upper crown cel-highlight sheen following skull curvature
  const crownHighlight =
    'M-26 -586C-14 -602 14 -602 26 -586Q14 -582 4 -590Q-4 -582 -14 -590Q-20 -584 -26 -586Z';

  // Layer 4 — Smooth Curved Anime "Angel Ring" glossy highlight sheen high on the dome
  const angelRing =
    style === 'long-flowing'
      ? 'M-24 -584C-12 -594 12 -594 24 -584Q12 -586 0 -588Q-12 -586 -24 -584Z'
      : 'M-28 -576C-14 -588 14 -588 28 -576Q14 -579 0 -581Q-14 -579 -28 -576Z';

  // Layer 5 — Style-matched curved hair lock grooves (never dangling across open foreheads or headbands)
  const strandLines =
    style === 'long-flowing'
      ? 'M-30 -582Q-34 -568 -32 -554M30 -582Q34 -568 32 -554' +
        'M-41 -552Q-46 -520 -42 -484M41 -552Q46 -520 42 -484'
      : 'M-18 -598Q-20 -586 -17 -574M14 -600Q16 -588 14 -574' +
        'M-38 -546Q-42 -520 -38 -498M38 -546Q42 -520 38 -498';

  return (
    (underFringe
      ? el('path', { d: underFringe, fill: darkStrand, stroke: ink, 'stroke-width': lw * 0.8, 'stroke-linejoin': 'round' })
      : '') +
    el('path', { d: mainHairD, fill: hairFill, stroke: ink, 'stroke-width': lw * 0.95, 'stroke-linejoin': 'round' }) +
    el('path', { d: crownHighlight, fill: midHighlight, 'fill-opacity': 0.48 }) +
    el('path', { d: angelRing, fill: angelRingColor, 'fill-opacity': 0.44 }) +
    el('path', {
      d: strandLines,
      fill: 'none',
      stroke: deepStrand,
      'stroke-width': lw * 0.48,
      'stroke-linecap': 'round',
      'stroke-opacity': 0.62,
    }) +
    (flyaways
      ? el('path', {
          d: flyaways,
          fill: 'none',
          stroke: ink,
          'stroke-width': lw * 0.65,
          'stroke-linecap': 'round',
        })
      : '')
  );
}

/**
 * Renders a structured 3D Manhwa shirt collar & outer coat lapel wrapping around the neck
 * with angular cel-shaded inner folds and cast shadow on the neck.
 */
export function renderLayeredCollar(
  collarColor: string,
  coatColor: string,
  skin: string,
  ink: string,
  lw: number,
  isSlender = false,
  threeQuarter = false,
): string {
  const collarShade = darken(collarColor, 0.24);
  const collarInner = darken(collarColor, 0.42);
  const coatShade = darken(coatColor, 0.28);
  const neckShadow = darken(skin, 0.34);

  if (threeQuarter) {
    // 3/4 turned collar hugging the shifted neck + crisp folded lapels grounded on shoulders
    const lx = isSlender ? -20 : -23;
    const rx = isSlender ? 12 : 16;
    const neckCast = el('path', {
      d: `M${fmt(lx)} -466Q-4 -458 ${fmt(rx)} -460L${fmt(rx - 2)} -450Q-6 -448 ${fmt(lx)} -458Z`,
      fill: neckShadow,
      'fill-opacity': 0.55,
    });
    const shirtBase = el('path', {
      d: `M${fmt(lx - 4)} -462Q-2 -454 ${fmt(rx + 2)} -458L${fmt(rx - 2)} -422L-4 -418L${fmt(lx - 6)} -430Z`,
      fill: collarColor,
      stroke: ink,
      'stroke-width': lw * 0.8,
      'stroke-linejoin': 'round',
    });
    const backFlap = el('path', {
      d: `M${fmt(lx - 4)} -470Q-6 -458 6 -442L-10 -434Q-24 -444 -32 -456Z`,
      fill: collarColor,
      stroke: ink,
      'stroke-width': lw * 0.9,
      'stroke-linejoin': 'round',
    });
    const backFlapShade = el('path', {
      d: `M${fmt(lx - 4)} -470Q-10 -460 -2 -446L-10 -434Q-24 -444 -32 -456Z`,
      fill: collarShade,
      'fill-opacity': 0.55,
    });
    const frontFlap = el('path', {
      d: `M${fmt(rx)} -464L${fmt(rx + 12)} -444L${fmt(rx - 4)} -436L${fmt(rx - 6)} -452Z`,
      fill: collarColor,
      stroke: ink,
      'stroke-width': lw * 0.9,
      'stroke-linejoin': 'round',
    });
    const coatShoulder = el('path', {
      d: `M${fmt(lx - 14)} -458Q-16 -444 4 -428L-16 -416Q-38 -432 -52 -442Z`,
      fill: coatColor,
      stroke: ink,
      'stroke-width': lw * 0.95,
      'stroke-linejoin': 'round',
    });
    return neckCast + shirtBase + backFlap + backFlapShade + frontFlap + coatShoulder;
  }

  // Front-facing structured V-collar with layered flaps
  const w = isSlender ? 20 : 24;
  return (
    el('path', {
      d: `M${fmt(-w)} -472Q0 -462 ${fmt(w)} -472L${fmt(w * 0.7)} -454L0 -446L${fmt(-w * 0.7)} -454Z`,
      fill: collarInner,
      stroke: ink,
      'stroke-width': lw * 0.75,
    }) +
    el('path', {
      d: `M${fmt(-w - 2)} -474L${fmt(-w * 0.25)} -448L${fmt(-w * 1.15)} -444Z`,
      fill: collarColor,
      stroke: ink,
      'stroke-width': lw * 0.85,
      'stroke-linejoin': 'round',
    }) +
    el('path', {
      d: `M${fmt(w + 2)} -474L${fmt(w * 0.25)} -448L${fmt(w * 1.15)} -444Z`,
      fill: collarColor,
      stroke: ink,
      'stroke-width': lw * 0.85,
      'stroke-linejoin': 'round',
    })
  );
}

// ---------------------------------------------------------------------------
// High-Detail Outfit Folds, Primal Furs, Accessories & Weapons
// ---------------------------------------------------------------------------

/**
 * Renders the specialized Primitive Hunter (Stone Age / Barbarian) outfit parts:
 * jagged beast-pelt mantle, cross-chest hide strap, bone tooth necklace,
 * and forearm bindings.
 */
export function renderPrimitiveHunterOutfit(
  outfitMain: string,
  accent: string,
  skin: string,
  ink: string,
  lw: number,
  sh: number,
): string {
  const furBase = outfitMain;
  const furDark = darken(furBase, 0.3);
  const furLight = lighten(furBase, 0.2);
  const leather = darken(accent, 0.35);
  const skinInk = mix(darken(skin, 0.68), ink, 0.42);
  const bone = '#F1F5F9';
  const boneShadow = '#CBD5E1';
  const x = (v: number) => fmt(v * sh);
  let out = '';

  // Exposed muscular chest with smooth trapezius-to-shoulder slope and organic torso silhouette
  const chestShadow = darken(skin, 0.24);
  const chestDeep = darken(skin, 0.38);
  out += el('path', {
    d:
      `M${x(-15)} -474C${x(-30)} -471 ${x(-54)} -466 ${x(-74)} -454` +
      `C${x(-82)} -434 ${x(-76)} -404 ${x(-66)} -376` +
      `C${x(-58)} -348 ${x(-50)} -326 ${x(-50)} -302L${x(50)} -302` +
      `C${x(50)} -326 ${x(58)} -348 ${x(66)} -376` +
      `C${x(76)} -404 ${x(82)} -434 ${x(74)} -454` +
      `C${x(54)} -466 ${x(30)} -471 ${x(15)} -474Z`,
    fill: skin,
    stroke: skinInk,
    'stroke-width': lw * 0.92,
  });
  // Soft organic pectoral & sternum cel-shadows
  out += el('path', {
    d:
      `M${x(-44)} -408Q${x(-22)} -396 -3 -405Q${x(-12)} -392 ${x(-42)} -399Z` +
      `M3 -405Q${x(22)} -396 ${x(44)} -408Q${x(42)} -399 ${x(12)} -392Z`,
    fill: chestShadow,
    'fill-opacity': 0.85,
  });
  // Delicate pectoral & deltoid-pectoral T-junction ink strokes
  out += el('path', {
    d:
      `M0 -454Q0.5 -428 0 -404` +
      `M${x(-48)} -412Q${x(-24)} -396 -3 -405` +
      `M3 -405Q${x(24)} -396 ${x(48)} -412` +
      `M${x(54)} -448Q${x(62)} -432 ${x(56)} -412`,
    fill: 'none',
    stroke: chestDeep,
    'stroke-width': lw * 0.6,
    'stroke-linecap': 'round',
    'stroke-opacity': 0.78,
  });

  // Curved Diagonal Beast-Pelt Tunic draped smoothly across chest to waist
  out += el('path', {
    d:
      `M${x(-76)} -456Q${x(-48)} -468 ${x(-22)} -470` +
      `C${x(-4)} -432 ${x(28)} -392 ${x(58)} -352` +
      `C${x(60)} -320 ${x(58)} -288 ${x(60)} -256` +
      `L${x(-60)} -256C${x(-58)} -288 ${x(-50)} -312 ${x(-52)} -332` +
      `C${x(-62)} -364 ${x(-74)} -404 ${x(-76)} -456Z`,
    fill: furBase,
    stroke: ink,
    'stroke-width': lw * 0.95,
    'stroke-linejoin': 'round',
  });

  // Smooth curved cel-shaded drape folds on the hide tunic
  out += el('path', {
    d:
      `M${x(-56)} -432Q${x(-18)} -388 ${x(18)} -342Q${x(10)} -336 ${x(2)} -334Q${x(-28)} -378 ${x(-56)} -432Z` +
      `M${x(-46)} -366Q${x(-8)} -326 ${x(36)} -290Q${x(26)} -284 ${x(18)} -284Q${x(-16)} -318 ${x(-46)} -366Z` +
      `M${x(20)} -354Q${x(40)} -352 ${x(58)} -352C${x(60)} -320 ${x(58)} -288 ${x(60)} -256L${x(28)} -256Q${x(32)} -304 ${x(20)} -354Z`,
    fill: furDark,
    'fill-opacity': 0.88,
  });

  // Curved Cross-chest leather strap hugging chest volume
  out += el('path', {
    d:
      `M${x(62)} -458Q${x(72)} -454 ${x(78)} -446` +
      `C${x(42)} -398 ${x(-6)} -344 ${x(-46)} -296` +
      `L${x(-56)} -308C${x(-14)} -356 ${x(30)} -410 ${x(62)} -458Z`,
    fill: leather,
    stroke: ink,
    'stroke-width': lw * 0.8,
  });

  // Organic Curved Wolf/Sabretooth Fur Shoulder Mantle (flowing tufts instead of sawtooth)
  const furMantle =
    `M${x(-86)} -448` +
    `Q${x(-96)} -460 ${x(-84)} -468` +
    `Q${x(-86)} -480 ${x(-66)} -476` +
    `Q${x(-56)} -488 ${x(-36)} -476` +
    `Q${x(-22)} -472 ${x(-18)} -466` +
    `Q${x(-20)} -450 ${x(-26)} -442` +
    `Q${x(-34)} -452 ${x(-42)} -436` +
    `Q${x(-54)} -446 ${x(-66)} -430` +
    `Q${x(-74)} -442 ${x(-86)} -448Z`;
  out += el('path', {
    d: furMantle,
    fill: furDark,
    stroke: ink,
    'stroke-width': lw * 0.9,
    'stroke-linejoin': 'round',
  });
  out += el('path', {
    d: `M${x(-78)} -466Q${x(-58)} -476 ${x(-40)} -466Q${x(-48)} -446 ${x(-66)} -450Z`,
    fill: furLight,
    'fill-opacity': 0.4,
  });

  // Waist cord belt with slight anatomical dip + bone buckle
  out += el('path', {
    d: `M${x(-56)} -302Q0 -296 ${x(56)} -302L${x(58)} -284Q0 -278 ${x(-58)} -284Z`,
    fill: leather,
    stroke: ink,
    'stroke-width': lw * 0.82,
  });
  // Sculpted bone clasp at waist center
  out += el('path', {
    d: 'M-11 -304Q0 -312 11 -304C11 -294 9 -284 0 -277C-9 -284 -11 -294 -11 -304Z',
    fill: bone,
    stroke: ink,
    'stroke-width': lw * 0.78,
  });
  out += el('circle', { cx: -3.8, cy: -294, r: 2.0, fill: ink });
  out += el('circle', { cx: 3.8, cy: -294, r: 2.0, fill: ink });

  // Sabretooth Bone Fang Necklace around collarbone
  out += renderBoneNecklace(bone, boneShadow, leather, ink, lw);

  return out;
}

export function renderBoneNecklace(
  bone: string,
  boneShadow: string,
  cordColor: string,
  ink: string,
  lw: number,
): string {
  let out = '';
  out += el('path', {
    d: 'M-22 -470Q0 -448 22 -470',
    fill: 'none',
    stroke: cordColor,
    'stroke-width': lw * 0.85 + 0.7,
    'stroke-linecap': 'round',
  });
  const fangs: ReadonlyArray<{ x: number; y: number; len: number; tilt: number }> = [
    { x: -15, y: -460, len: 13, tilt: -4 },
    { x: -7.5, y: -456, len: 16, tilt: -2 },
    { x: 0, y: -454, len: 20, tilt: 0 },
    { x: 7.5, y: -456, len: 16, tilt: 2 },
    { x: 15, y: -460, len: 13, tilt: 4 },
  ];
  for (const f of fangs) {
    out += el('path', {
      d: `M${fmt(f.x - 2.5)} ${fmt(f.y)}Q${fmt(f.x)} ${fmt(f.y - 1.5)} ${fmt(f.x + 2.5)} ${fmt(f.y)}Q${fmt(f.x + 2 + f.tilt * 0.4)} ${fmt(f.y + f.len * 0.55)} ${fmt(f.x + f.tilt)} ${fmt(f.y + f.len)}Q${fmt(f.x - 2 + f.tilt * 0.4)} ${fmt(f.y + f.len * 0.55)} ${fmt(f.x - 2.5)} ${fmt(f.y)}Z`,
      fill: bone,
      stroke: ink,
      'stroke-width': lw * 0.6,
      'stroke-linejoin': 'round',
    });
    out += el('path', {
      d: `M${fmt(f.x)} ${fmt(f.y)}L${fmt(f.x + 2.3)} ${fmt(f.y)}Q${fmt(f.x + 1.8 + f.tilt * 0.4)} ${fmt(f.y + f.len * 0.55)} ${fmt(f.x + f.tilt)} ${fmt(f.y + f.len)}Z`,
      fill: boneShadow,
    });
  }
  return out;
}

/**
 * Renders organic curved fur collar accessory on any outfit preset.
 */
export function renderFurCollarAccessory(
  outfitMain: string,
  ink: string,
  lw: number,
  sh: number,
): string {
  const fur = darken(outfitMain, 0.25);
  const furTip = lighten(outfitMain, 0.22);
  const x = (v: number) => fmt(v * sh);
  return (
    el('path', {
      d:
        `M${x(-56)} -466Q${x(-72)} -478 ${x(-56)} -482Q${x(-54)} -494 ${x(-34)} -484Q${x(-18)} -492 0 -476` +
        `Q${x(18)} -492 ${x(34)} -484Q${x(54)} -494 ${x(56)} -482Q${x(72)} -478 ${x(56)} -466` +
        `Q${x(48)} -450 ${x(30)} -458Q${x(16)} -444 0 -456Q${x(-16)} -444 ${x(-30)} -458Q${x(-48)} -450 ${x(-56)} -466Z`,
      fill: fur,
      stroke: ink,
      'stroke-width': lw * 0.9,
      'stroke-linejoin': 'round',
    }) +
    el('path', {
      d: `M${x(-44)} -476Q${x(-22)} -484 0 -466Q${x(22)} -484 ${x(44)} -476Q${x(26)} -462 0 -454Q${x(-26)} -462 ${x(-44)} -476Z`,
      fill: furTip,
      'fill-opacity': 0.36,
    })
  );
}

/**
 * Renders smooth curved Bézier cel-shaded clothing tension folds on torso (fine G-pen lines, no ugly polygon stamps).
 */
export function renderTorsoClothingFolds(
  outfitMain: string,
  sh: number,
  shading: ShadingIntensity,
): string {
  const foldColor = darken(
    outfitMain,
    shading === 'soft' ? 0.16 : shading === 'dramatic-noir' ? 0.38 : 0.26,
  );
  const foldInk = darken(outfitMain, 0.54);
  const x = (v: number) => fmt(v * sh);
  // Flowing fabric tension crease lines following ribcage and waist
  const creaseLines =
    `M${x(-56)} -442Q${x(-38)} -428 ${x(-22)} -418` +
    `M${x(56)} -442Q${x(38)} -428 ${x(22)} -418` +
    `M${x(-46)} -368Q${x(-26)} -356 ${x(-8)} -350` +
    `M${x(46)} -368Q${x(26)} -356 ${x(8)} -350` +
    `M${x(-38)} -312Q${x(-14)} -304 ${x(16)} -300`;
  const softShadowRibbons =
    `M${x(-54)} -440Q${x(-36)} -426 ${x(-20)} -416` +
    `M${x(54)} -440Q${x(36)} -426 ${x(20)} -416` +
    `M${x(-44)} -366Q${x(-24)} -354 ${x(-6)} -348` +
    `M${x(44)} -366Q${x(24)} -354 ${x(6)} -348`;
  return (
    el('path', {
      d: softShadowRibbons,
      fill: 'none',
      stroke: foldColor,
      'stroke-width': 3.2,
      'stroke-linecap': 'round',
      'stroke-opacity': 0.35,
    }) +
    el('path', {
      d: creaseLines,
      fill: 'none',
      stroke: foldInk,
      'stroke-width': 1.1,
      'stroke-linecap': 'round',
      'stroke-opacity': 0.65,
    })
  );
}

/**
 * Renders built-in weapon props anchored to the character's hand/torso coordinates.
 */
export function renderWeaponProp(
  prop: WeaponProp,
  hand: P,
  pose: Pose,
  accent: string,
  ink: string,
  lw: number,
  defs: DefsCollector,
): string {
  if (prop === 'none') return '';
  const hx = hand.x;
  const hy = hand.y;
  const tilt = pose === 'action-lunge' ? -28 : pose === 'power-awakening' ? -12 : 8;

  if (prop === 'stone-spear') {
    // Rugged wooden shaft + leather cross-bindings + multi-faceted chipped flint head
    return (
      `<g transform="translate(${fmt(hx)} ${fmt(hy)}) rotate(${fmt(tilt)})">` +
      // Wooden shaft
      el('path', {
        d: 'M-4 -240L4 -240L5 210L-5 210Z',
        fill: '#5C3A21',
        stroke: ink,
        'stroke-width': lw * 0.9,
      }) +
      // Wood grain cel-shadow
      el('path', { d: 'M1 -240L4 -240L5 210L1 210Z', fill: '#3B2312' }) +
      // Rawhide bindings below spearhead
      el('path', {
        d: 'M-6 -246L6 -246L6 -222L-6 -222Z',
        fill: '#92400E',
        stroke: ink,
        'stroke-width': lw * 0.75,
      }) +
      el('path', {
        d: 'M-6 -240L6 -236M-6 -234L6 -230M-6 -228L6 -224',
        fill: 'none',
        stroke: ink,
        'stroke-width': 0.9,
      }) +
      // Chipped flint / obsidian spearhead
      el('path', {
        d: 'M0 -330L18 -276L12 -244L-12 -244L-18 -276Z',
        fill: '#94A3B8',
        stroke: ink,
        'stroke-width': lw,
        'stroke-linejoin': 'round',
      }) +
      // Flint facet highlights & shadows
      el('path', { d: 'M0 -330L18 -276L12 -244L0 -244Z', fill: '#475569' }) +
      el('path', { d: 'M0 -330L-18 -276L-5 -268Z', fill: '#E2E8F0' }) +
      el('path', { d: 'M-15 -268L0 -258L15 -268', fill: 'none', stroke: '#CBD5E1', 'stroke-width': 0.9 }) +
      `</g>`
    );
  }

  if (prop === 'katana') {
    if (pose === 'standing') {
      // Natural low ready / resting carry: blade extends downward and slightly backward along the leg
      return (
        `<g transform="translate(${fmt(hx)} ${fmt(hy)}) rotate(26)">` +
        // Hilt (tsuka) extends upward from the hand
        el('path', { d: 'M-3.5 -50L3.5 -50L4 0L-4 0Z', fill: '#1E293B', stroke: ink, 'stroke-width': lw * 0.85 }) +
        // Diamond hilt bindings
        el('path', { d: 'M-2 -38L0 -33L2 -38L0 -43ZM-2 -24L0 -19L2 -24L0 -29ZM-2 -10L0 -5L2 -10L0 -15Z', fill: accent }) +
        // Guard (tsuba)
        el('path', { d: 'M-12 0L12 0L12 6L-12 6Z', fill: accent, stroke: ink, 'stroke-width': lw * 0.8 }) +
        // Curved steel blade extending DOWNWARD along leg toward the ground
        el('path', {
          d: 'M-3.5 6C-4 80 -2 165 6 235C9 165 6 80 3.5 6Z',
          fill: '#E2E8F0',
          stroke: ink,
          'stroke-width': lw * 0.9,
        }) +
        el('path', {
          d: 'M0 6C0 80 2 165 6 235C9 165 6 80 3.5 6Z',
          fill: '#64748B',
        }) +
        `</g>`
      );
    }
    return (
      `<g transform="translate(${fmt(hx)} ${fmt(hy)}) rotate(${fmt(tilt - 35)})">` +
      // Hilt (tsuka)
      el('path', { d: 'M-3.5 -35L3.5 -35L4 38L-4 38Z', fill: '#1E293B', stroke: ink, 'stroke-width': lw * 0.85 }) +
      // Guard (tsuba)
      el('path', { d: 'M-12 -40L12 -40L12 -34L-12 -34Z', fill: accent, stroke: ink, 'stroke-width': lw * 0.8 }) +
      // Curved steel blade
      el('path', {
        d: 'M-3.5 -40C-4 -140 -2 -230 6 -295C9 -230 6 -140 3.5 -40Z',
        fill: '#E2E8F0',
        stroke: ink,
        'stroke-width': lw * 0.9,
      }) +
      el('path', {
        d: 'M0 -40C0 -140 2 -230 6 -295C9 -230 6 -140 3.5 -40Z',
        fill: '#64748B',
      }) +
      `</g>`
    );
  }

  if (prop === 'greatsword') {
    const rot = pose === 'standing' ? 18 : tilt - 20;
    return (
      `<g transform="translate(${fmt(hx)} ${fmt(hy)}) rotate(${fmt(rot)})">` +
      el('path', { d: 'M-5 -40L5 -40L6 48L-6 48Z', fill: '#334155', stroke: ink, 'stroke-width': lw }) +
      el('path', { d: 'M-28 -52L0 -44L28 -52L22 -38L0 -34L-22 -38Z', fill: accent, stroke: ink, 'stroke-width': lw }) +
      el('path', {
        d: 'M-16 -46L-18 -270L0 -325L18 -270L16 -46Z',
        fill: '#475569',
        stroke: ink,
        'stroke-width': lw,
      }) +
      el('path', { d: 'M0 -46L0 -325L18 -270L16 -46Z', fill: '#1E293B' }) +
      el('path', { d: 'M-3 -60L3 -60L2 -255L-2 -255Z', fill: accent, 'fill-opacity': 0.85 }) +
      `</g>`
    );
  }

  if (prop === 'dagger-dual') {
    return (
      `<g transform="translate(${fmt(hx)} ${fmt(hy)}) rotate(${fmt(tilt + 15)})">` +
      el('path', { d: 'M-3 -20L3 -20L3 24L-3 24Z', fill: '#1E293B', stroke: ink, 'stroke-width': lw * 0.8 }) +
      el('path', { d: 'M-9 22L9 22L7 27L-7 27Z', fill: accent }) +
      el('path', { d: 'M-7 27L0 135L7 27Z', fill: '#CBD5E1', stroke: ink, 'stroke-width': lw * 0.85 }) +
      el('path', { d: 'M0 27L0 135L7 27Z', fill: accent, 'fill-opacity': 0.65 }) +
      `</g>`
    );
  }

  if (prop === 'magic-orb') {
    const orbGrad = defs.add('magicorb', (id) =>
      radialGradient(id, [
        { offset: 0, color: '#FFFFFF', opacity: 1 },
        { offset: 0.35, color: lighten(accent, 0.45), opacity: 0.95 },
        { offset: 0.7, color: accent, opacity: 0.8 },
        { offset: 1, color: accent, opacity: 0 },
      ]),
    );
    return (
      `<g transform="translate(${fmt(hx)} ${fmt(hy - 36)})">` +
      // Outer radiant arcane aura
      el('circle', { cx: 0, cy: 0, r: 42, fill: `url(#${orbGrad})` }) +
      // Concentric rotating rune circles
      el('circle', { cx: 0, cy: 0, r: 24, fill: 'none', stroke: lighten(accent, 0.55), 'stroke-width': 1.2, 'stroke-dasharray': '5 3', 'stroke-opacity': 0.88 }) +
      el('circle', { cx: 0, cy: 0, r: 16, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 1.5, 'stroke-opacity': 0.94 }) +
      // Arcane diamond cardinal nodes
      el('path', { d: 'M0 -28L3.5 -24.5L0 -21L-3.5 -24.5ZM28 0L24.5 3.5L21 0L24.5 -3.5ZM0 28L-3.5 24.5L0 21L3.5 24.5ZM-28 0L-24.5 -3.5L-21 0L-24.5 3.5Z', fill: '#FFFFFF' }) +
      // Inner glowing plasma core
      el('circle', { cx: 0, cy: 0, r: 8, fill: '#FFFFFF' }) +
      `</g>`
    );
  }

  return '';
}
