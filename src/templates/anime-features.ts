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

/** Manhwa-proportioned front head contour with angular V-jaw and cheekbones. */
export const MANHWA_FACE_FRONT =
  'M0 -588' +
  'C26 -588 42 -570 42 -542' +
  'C42 -526 39 -514 34 -504' +
  'L14 -486' +
  'Q0 -479 -14 -486' +
  'L-34 -504' +
  'C-39 -514 -42 -526 -42 -542' +
  'C-42 -570 -26 -588 0 -588Z';

/** Sharp anime side-profile head contour with distinct brow, nose bridge, lips and jaw. */
export const MANHWA_FACE_PROFILE =
  'M-4 -588' +
  'C24 -588 39 -571 39 -548' +
  'L41 -537' +
  'L51 -520' +
  'L43 -516' +
  'L45 -509' +
  'L41 -505' +
  'L43 -501' +
  'C39 -492 26 -484 10 -483' +
  'C-8 -486 -27 -500 -35 -520' +
  'C-41 -542 -37 -573 -4 -588Z';

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
): string {
  const shadow = darken(skin, 0.25);
  const deepShadow = darken(skin, 0.42);
  let out = '';

  if (profile) {
    // Single profile ear around (-8, -528)
    out += el('path', {
      d: 'M-13 -541C-19 -542 -22 -533 -20 -522C-18 -515 -12 -512 -7 -515C-3 -518 -3 -538 -13 -541Z',
      fill: skin,
      stroke: ink,
      'stroke-width': lw * 0.9,
    });
    out += el('path', {
      d: 'M-12 -536C-16 -536 -17 -528 -15 -521C-13 -519 -10 -520 -9 -525Z',
      fill: shadow,
    });
    out += el('path', {
      d: 'M-12 -537C-16 -535 -17 -527 -14 -520',
      fill: 'none',
      stroke: deepShadow,
      'stroke-width': lw * 0.65,
      'stroke-linecap': 'round',
    });
    if (earring) {
      out += el('circle', { cx: -13, cy: -512, r: 2.4, fill: accent, stroke: ink, 'stroke-width': 0.6 });
      out += el('path', { d: 'M-13 -509.5L-15 -501L-13 -498L-11 -501Z', fill: accent, stroke: ink, 'stroke-width': 0.5 });
    }
    return out;
  }

  for (const side of [-1, 1] as const) {
    const x0 = side * 40.5;
    const xOuter = side * 47.5;
    const xMid = side * 44.5;
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
): string {
  const shade1 = darken(skin, shading === 'soft' ? 0.18 : shading === 'heavy' || shading === 'dramatic-noir' ? 0.34 : 0.25);
  const shade2 = darken(skin, shading === 'dramatic-noir' ? 0.55 : 0.42);
  const dir = lightDir === 'right' ? -1 : 1; // shadow falls toward opposite side
  let out = '';

  // Base neck column with slight anatomical flare to trapezius
  out += el('path', {
    d: 'M-15 -504L15 -504L18 -466L28 -460L-28 -460L-18 -466Z',
    fill: skin,
    stroke: ink,
    'stroke-width': lw,
    'stroke-linejoin': 'round',
  });

  // Hard triangular cast shadow under the chin/jawline
  out += el('path', {
    d: `M-15 -494L15 -494L${fmt(8 * dir)} -471L${fmt(-14 * dir)} -482Z`,
    fill: shade1,
  });

  // Deep core occlusion right beneath chin point
  out += el('path', {
    d: `M-10 -491L10 -491L${fmt(3 * dir)} -479Z`,
    fill: shade2,
  });

  // Lateral neck shadow plane
  out += el('path', {
    d:
      dir > 0
        ? 'M4 -492L15 -492L18 -464L6 -464Z'
        : 'M-4 -492L-15 -492L-18 -464L-6 -464Z',
    fill: shade1,
    'fill-opacity': 0.85,
  });

  // Sternocleidomastoid tendons & collarbone (clavicle) ink lines
  out += el('path', {
    d: 'M-9 -484L-5 -465M9 -484L5 -465',
    fill: 'none',
    stroke: shade2,
    'stroke-width': lw * 0.65,
    'stroke-linecap': 'round',
    'stroke-opacity': 0.75,
  });

  return out;
}

/**
 * Renders lateral cheekbone/jawline cel-shadow and forehead bangs drop shadow on the face.
 */
export function renderFaceCelShading(
  skin: string,
  shading: ShadingIntensity,
  lightDir: LightDirection,
  profile: boolean,
  hasHairShadow: boolean,
): string {
  const shade = darken(skin, shading === 'soft' ? 0.14 : shading === 'dramatic-noir' ? 0.34 : 0.22);
  const deepShade = darken(skin, 0.36);
  const dir = lightDir === 'right' ? -1 : 1;
  let out = '';

  if (profile) {
    // Back of jaw & cheek plane shadow in profile
    out += el('path', {
      d: 'M-4 -585C-24 -575 -36 -545 -32 -518C-24 -500 -8 -488 8 -484C-2 -492 -14 -508 -14 -532C-14 -555 -8 -572 -4 -585Z',
      fill: shade,
      'fill-opacity': 0.85,
    });
    return out;
  }

  // Lateral face cel-shadow following the V-jawline on the shadow side
  if (dir > 0) {
    out += el('path', {
      d: 'M24 -578C38 -566 42 -548 42 -540C42 -524 38 -512 34 -504L14 -486L2 -482C14 -490 25 -502 29 -516C33 -532 31 -558 24 -578Z',
      fill: shade,
      'fill-opacity': 0.82,
    });
  } else {
    out += el('path', {
      d: 'M-24 -578C-38 -566 -42 -548 -42 -540C-42 -524 -38 -512 -34 -504L-14 -486L-2 -482C-14 -490 -25 -502 -29 -516C-33 -532 -31 -558 -24 -578Z',
      fill: shade,
      'fill-opacity': 0.82,
    });
  }

  // Forehead drop-shadow cast by the hair bangs
  if (hasHairShadow) {
    out += el('path', {
      d: 'M-38 -552Q0 -564 38 -552L34 -543L22 -551L10 -541L0 -550L-12 -540L-24 -550L-34 -542Z',
      fill: shade,
      'fill-opacity': 0.78,
    });
  }

  // Subtle cheekbone / temple tension lines on heavy/noir shading
  if (shading === 'heavy' || shading === 'dramatic-noir') {
    const sx = dir * 24;
    out += el('path', {
      d: `M${fmt(sx)} -520L${fmt(sx + dir * 7)} -515M${fmt(sx - dir * 1)} -516L${fmt(sx + dir * 6)} -511M${fmt(sx - dir * 2)} -512L${fmt(sx + dir * 5)} -507`,
      fill: 'none',
      stroke: deepShade,
      'stroke-width': 0.75,
      'stroke-linecap': 'round',
      'stroke-opacity': 0.65,
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
      const maxIrisRy = Math.max(2.0, (topH + botH) * 0.43 * spec.irisScale);
      const irisRx = Math.min(5.4, maxIrisRy * 0.94 + 0.6) * spec.irisScale;
      const irisCy = cy + (botH - topH) * 0.16;
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

      // Double eyelid fold (futae crease) + inner nose bridge tick
      out += el('path', {
        d: `M${fmt(inner.x + side * 1.2)} ${fmt(inner.y - 3.8)}Q${fmt(topCtrl.x)} ${fmt(topCtrl.y - lashThick - 2.2)} ${fmt(outer.x - side * 1.5)} ${fmt(outer.y - 3.2)}`,
        fill: 'none',
        stroke: skinDeep,
        'stroke-width': lw * 0.48 + 0.25,
        'stroke-linecap': 'round',
        'stroke-opacity': 0.78,
      });

      // Lower lash line + outer lower lash spur
      out += el('path', {
        d: `M${fmt(outer.x + side * 0.8)} ${fmt(outer.y + 0.6)}Q${fmt(botCtrl.x)} ${fmt(botCtrl.y)} ${fmt(inner.x + side * 1.8)} ${fmt(inner.y + 0.5)}`,
        fill: 'none',
        stroke: ink,
        'stroke-width': lw * 0.55 + 0.35,
        'stroke-linecap': 'round',
        'stroke-opacity': 0.75,
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
    // Triangular cast shadow on one side of nose bridge
    out += el('path', {
      d:
        nDir > 0
          ? 'M0.5 -527L3.8 -514L0.2 -512.5L-0.5 -514.5Z'
          : 'M-0.5 -527L-3.8 -514L-0.2 -512.5L0.5 -514.5Z',
      fill: skinShadow,
      'fill-opacity': 0.92,
    });
    // Crisp nose bridge & tip ink line
    out += el('path', {
      d:
        nDir > 0
          ? 'M0.6 -525L3.6 -514.2L-1.2 -513.2'
          : 'M-0.6 -525L-3.6 -514.2L1.2 -513.2',
      fill: 'none',
      stroke: skinDeep,
      'stroke-width': lw * 0.65 + 0.35,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    // Nostril tick
    out += el('circle', {
      cx: -nDir * 2.2,
      cy: -513.5,
      r: 0.55,
      fill: skinDeep,
      'fill-opacity': 0.75,
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
      // Classic 3-segment anime lip line with center slight break & lower lip cel-shadow
      out += el('path', {
        d: 'M-6.8 -501.5Q-3 -500.5 -0.8 -501M0.8 -501Q3 -500.5 6.8 -501.5',
        fill: 'none',
        stroke: skinDeep,
        'stroke-width': strokeW,
        'stroke-linecap': 'round',
      });
      // Lower lip shadow wedge
      out += el('path', {
        d: 'M-4.2 -497.5Q0 -495.2 4.2 -497.5Q0 -496.5 -4.2 -497.5Z',
        fill: skinShadow,
      });
      break;

    case 'firm':
      // Determined downward-cornered mouth
      out += el('path', {
        d: 'M-7.8 -500.2Q0 -502.8 7.8 -500.2',
        fill: 'none',
        stroke: skinDeep,
        'stroke-width': strokeW * 1.1,
        'stroke-linecap': 'round',
      });
      out += el('path', {
        d: 'M-4.5 -497.2L4.5 -497.2L0 -495.2Z',
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
      const w = mouth === 'open-shout' ? 7.8 : 6.4;
      const topY = -505.5;
      const botY = mouth === 'open-shout' ? -493.5 : -495.5;
      // Dark mouth cavity
      out += el('path', {
        d: `M${fmt(-w)} ${fmt(topY + 1.5)}Q0 ${fmt(topY - 2)} ${fmt(w)} ${fmt(topY + 1.5)}L${fmt(w * 0.82)} ${fmt(botY - 1)}Q0 ${fmt(botY + 1.8)} ${fmt(-w * 0.82)} ${fmt(botY - 1)}Z`,
        fill: darken(skin, 0.76),
        stroke: skinDeep,
        'stroke-width': strokeW * 0.95,
        'stroke-linejoin': 'round',
      });
      // Upper teeth bar
      out += el('path', {
        d: `M${fmt(-w * 0.85)} ${fmt(topY + 1.2)}Q0 ${fmt(topY - 0.8)} ${fmt(w * 0.85)} ${fmt(topY + 1.2)}L${fmt(w * 0.78)} ${fmt(topY + 3.2)}L${fmt(-w * 0.78)} ${fmt(topY + 3.2)}Z`,
        fill: '#F8FAFC',
      });
      // Tongue arch
      out += el('path', {
        d: `M${fmt(-w * 0.62)} ${fmt(botY - 1.2)}Q0 ${fmt(botY - 4.8)} ${fmt(w * 0.62)} ${fmt(botY - 1.2)}Q0 ${fmt(botY + 0.8)} ${fmt(-w * 0.62)} ${fmt(botY - 1.2)}Z`,
        fill: '#E15B64',
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
 * Renders the back volume of the hair (drawn behind the head and neck).
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

  if (style === 'wild-primitive') {
    // Rugged, layered primal mane cascading past the shoulders with jagged locks
    const maneOuter =
      'M-52 -555L-68 -538L-58 -522L-76 -496L-62 -484L-78 -448L-56 -454L-64 -416L-44 -436L-36 -412' +
      'L0 -428L36 -412L44 -436L64 -416L56 -454L78 -448L62 -484L76 -496L58 -522L68 -538L52 -555' +
      'C44 -602 -44 -602 -52 -555Z';
    const maneInner =
      'M-46 -520L-58 -475L-44 -480L-50 -435L-30 -455L0 -438L30 -455L50 -435L44 -480L58 -475L46 -520Z';
    return (
      el('path', {
        d: maneOuter,
        fill: baseDark,
        stroke: ink,
        'stroke-width': lw,
        'stroke-linejoin': 'round',
      }) + el('path', { d: maneInner, fill: deepDark })
    );
  }

  if (style === 'long-flowing') {
    const longD =
      'M-48 -550C-62 -510 -66 -455 -58 -405L-44 -424L-38 -398L-22 -422L0 -400L22 -422L38 -398L44 -424L58 -405' +
      'C66 -455 62 -510 48 -550C35 -604 -35 -604 -48 -550Z';
    return el('path', {
      d: longD,
      fill: baseDark,
      stroke: ink,
      'stroke-width': lw,
      'stroke-linejoin': 'round',
    });
  }

  if (style === 'ponytail-ronin') {
    const tailDir = pose === 'action-lunge' ? -1 : 1;
    const tailD =
      `M0 -590C${fmt(24 * tailDir)} -624 ${fmt(65 * tailDir)} -612 ${fmt(92 * tailDir)} -570` +
      `L${fmt(72 * tailDir)} -572L${fmt(88 * tailDir)} -542L${fmt(64 * tailDir)} -550L${fmt(70 * tailDir)} -518` +
      `C${fmt(45 * tailDir)} -538 ${fmt(22 * tailDir)} -562 0 -572Z`;
    const napeSpikes =
      'M-44 -515L-54 -492L-40 -498L-44 -478L-28 -492L28 -492L44 -478L40 -498L54 -492L44 -515Z';
    return (
      el('path', { d: tailD, fill: baseDark, stroke: ink, 'stroke-width': lw, 'stroke-linejoin': 'round' }) +
      el('path', { d: napeSpikes, fill: deepDark, stroke: ink, 'stroke-width': lw, 'stroke-linejoin': 'round' })
    );
  }

  // Default spiky-manhwa / undercut nape tufts sticking out around neck & ears
  const napeD =
    'M-44 -535L-58 -520L-47 -510L-56 -490L-40 -496L-42 -476L-26 -492' +
    'L26 -492L42 -476L40 -496L56 -490L47 -510L58 -520L44 -535Z';
  return el('path', {
    d: napeD,
    fill: baseDark,
    stroke: ink,
    'stroke-width': lw,
    'stroke-linejoin': 'round',
  });
}

/**
 * Renders the front multi-layered hair clumps, cheekbone side-locks,
 * internal cel-shadow strands, and the iconic anime "Angel Ring" shine band.
 */
export function renderAnimeHairFront(
  style: ResolvedHairStyle,
  pose: Pose,
  hairColor: string,
  accentColor: string,
  ink: string,
  lw: number,
  _prng: Prng,
): string {
  if (style === 'none') return '';

  const darkStrand = darken(hairColor, 0.25);
  const midHighlight = lighten(hairColor, 0.16);
  const angelRingColor = mix(lighten(hairColor, 0.5), accentColor, 0.25);

  if (pose === 'facing-away') {
    const backCap =
      'M-48 -502L-58 -522L-48 -538C-54 -578 -28 -610 0 -612C28 -610 54 -578 48 -538L58 -522L48 -502' +
      'L38 -484L28 -500L16 -480L6 -498L0 -478L-6 -498L-16 -480L-28 -500L-38 -484Z';
    const angelBack =
      'M-34 -562L-22 -572L-14 -558L0 -574L14 -558L22 -572L34 -562L28 -550L14 -564L0 -552L-14 -564L-28 -550Z';
    return (
      el('path', { d: backCap, fill: hairColor, stroke: ink, 'stroke-width': lw, 'stroke-linejoin': 'round' }) +
      el('path', { d: angelBack, fill: angelRingColor, 'fill-opacity': 0.42 })
    );
  }

  if (pose === 'dramatic-profile') {
    const profBase =
      'M-42 -504L-54 -522L-44 -536L-56 -558L-40 -566L-46 -588L-26 -588L-28 -608L-4 -598L14 -612L24 -596' +
      'C40 -594 52 -578 52 -554L41 -562L38 -534L29 -552L21 -526L14 -548L4 -524L-4 -546L-16 -518L-22 -536L-32 -506Z';
    const profShade =
      'M-38 -512L-26 -545L-16 -522L-6 -554L6 -530L12 -555L-14 -575L-36 -552Z';
    const profAngel =
      'M-24 -566L-10 -578L0 -564L14 -576L28 -564L22 -554L10 -566L-2 -554L-12 -566L-20 -556Z';
    return (
      el('path', { d: profBase, fill: hairColor, stroke: ink, 'stroke-width': lw, 'stroke-linejoin': 'round' }) +
      el('path', { d: profShade, fill: darkStrand, 'fill-opacity': 0.85 }) +
      el('path', { d: profAngel, fill: angelRingColor, 'fill-opacity': 0.45 })
    );
  }

  // Front view: Layer 1 — Under-fringe & cheekbone side-locks (arched above eyes at x=±16, dipping at center x=0 and sides x=±34)
  const underFringe =
    'M-44 -545L-49 -494L-38 -515L-34 -498L-29 -544' +
    'L-18 -548L-9 -546L-3 -528L0 -538L3 -528L9 -546L18 -548L29 -544' +
    'L34 -498L38 -515L49 -494L44 -545Z';

  // Layer 2 — Main sculpted crown & bang clusters (parted above left & right eyes so 6-layer eyes are 100% visible)
  let mainHairD = '';
  if (style === 'wild-primitive') {
    mainHairD =
      'M-46 -534' +
      'L-64 -546L-48 -560L-66 -582L-44 -584L-52 -608L-28 -598L-26 -620L-6 -602L8 -624L20 -600L44 -616L38 -592L64 -598L48 -576L66 -560L46 -546' +
      'L52 -486L40 -512L35 -492L30 -546' +
      'L22 -552L14 -546L7 -554L2 -526L-1 -545L-4 -528L-8 -554L-16 -546L-23 -552' +
      'L-30 -546L-35 -492L-40 -512L-52 -486Z';
  } else if (style === 'undercut-sleek') {
    mainHairD =
      'M-44 -540' +
      'C-46 -582 -26 -608 0 -610C28 -610 48 -584 44 -540' +
      'L38 -516L32 -548L22 -552L14 -546L6 -554L1 -526L-3 -552L-14 -546L-22 -554L-31 -546L-38 -516Z';
  } else {
    // spiky-manhwa / ponytail-ronin / long-flowing
    mainHairD =
      'M-45 -536' +
      'L-58 -550L-46 -562L-58 -586L-38 -586L-40 -608L-18 -596L-12 -616L4 -598L22 -614L26 -594L48 -602L40 -580L58 -572L45 -554' +
      'L48 -496L38 -520L33 -502L29 -548' +
      'L21 -552L14 -545L7 -555L2 -526L-2 -548L-5 -529L-9 -555L-17 -546L-23 -552' +
      'L-29 -548L-33 -502L-38 -520L-48 -496Z';
  }

  // Layer 3 — Upper crown cel-highlight strands
  const crownHighlight =
    'M-28 -582L-14 -602L-4 -584L10 -602L24 -582L12 -574L2 -588L-10 -572Z';

  // Layer 4 — Signature Anime "Angel Ring" zig-zag shine ribbon across mid-hair
  const angelRing =
    'M-34 -564L-24 -575L-16 -562L-4 -576L6 -561L18 -575L32 -562' +
    'L28 -553L17 -565L6 -552L-4 -566L-16 -552L-24 -565L-30 -555Z';

  // Layer 5 — Internal strand ink lines for hair texture
  const strandLines =
    'M-22 -586L-16 -548M-6 -592L-4 -536M10 -590L7 -538M24 -584L19 -546';

  return (
    el('path', { d: underFringe, fill: darkStrand, stroke: ink, 'stroke-width': lw * 0.85, 'stroke-linejoin': 'round' }) +
    el('path', { d: mainHairD, fill: hairColor, stroke: ink, 'stroke-width': lw, 'stroke-linejoin': 'round' }) +
    el('path', { d: crownHighlight, fill: midHighlight, 'fill-opacity': 0.55 }) +
    el('path', { d: angelRing, fill: angelRingColor, 'fill-opacity': 0.48 }) +
    el('path', {
      d: strandLines,
      fill: 'none',
      stroke: darkStrand,
      'stroke-width': lw * 0.65,
      'stroke-linecap': 'round',
      'stroke-opacity': 0.85,
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
  const bone = '#F1F5F9';
  const boneShadow = '#CBD5E1';
  const x = (v: number) => fmt(v * sh);
  let out = '';

  // Exposed muscular chest with sternal cleavage and pectoral cel-shading
  const chestShadow = darken(skin, 0.24);
  out += el('path', {
    d:
      `M${x(-14)} -470C${x(-42)} -468 ${x(-68)} -464 ${x(-76)} -450` +
      `L${x(-56)} -320L${x(56)} -320L${x(76)} -450C${x(68)} -464 ${x(42)} -468 ${x(14)} -470Z`,
    fill: skin,
    stroke: ink,
    'stroke-width': lw,
  });
  // Pectoral & abs cel-shadow polygons
  out += el('path', {
    d:
      `M-0.1 -454L0.1 -345` +
      `M${x(-46)} -408Q${x(-22)} -396 -3 -406` +
      `M3 -406Q${x(22)} -396 ${x(46)} -408`,
    fill: 'none',
    stroke: chestShadow,
    'stroke-width': lw * 0.9,
    'stroke-linecap': 'round',
  });
  out += el('path', {
    d: `M${x(-44)} -407Q${x(-22)} -397 -3 -405L-3 -396Q${x(-24)} -388 ${x(-46)} -400Z` +
       `M3 -405Q${x(22)} -397 ${x(44)} -407L${x(46)} -400Q${x(24)} -388 3 -396Z`,
    fill: chestShadow,
  });

  // Diagonal Beast-Pelt Tunic draped from left shoulder across torso to waist
  out += el('path', {
    d:
      `M${x(-78)} -458L${x(-24)} -470L${x(56)} -350L${x(60)} -256L${x(-60)} -256` +
      `L${x(-52)} -310L${x(-68)} -385Z`,
    fill: furBase,
    stroke: ink,
    'stroke-width': lw,
    'stroke-linejoin': 'round',
  });

  // Cel-shaded diagonal fold creases on the hide tunic
  out += el('path', {
    d:
      `M${x(-54)} -430L${x(18)} -340L${x(4)} -332Z` +
      `M${x(-44)} -365L${x(38)} -288L${x(20)} -282Z` +
      `M${x(18)} -352L${x(56)} -350L${x(60)} -256L${x(28)} -256Z`,
    fill: furDark,
  });

  // Cross-chest thick leather strap + rawhide stitching
  out += el('path', {
    d: `M${x(66)} -458L${x(82)} -448L${x(-46)} -296L${x(-58)} -310Z`,
    fill: leather,
    stroke: ink,
    'stroke-width': lw * 0.85,
  });

  // Rugged Jagged Wolf/Sabretooth Fur Shoulder Mantle (left & right shoulder)
  const furMantle =
    `M${x(-88)} -448L${x(-96)} -466L${x(-78)} -464L${x(-84)} -480L${x(-60)} -474L${x(-54)} -486L${x(-30)} -474` +
    `L${x(-18)} -468L${x(-22)} -442L${x(-36)} -454L${x(-44)} -434L${x(-58)} -448L${x(-68)} -428L${x(-76)} -444Z`;
  out += el('path', {
    d: furMantle,
    fill: furDark,
    stroke: ink,
    'stroke-width': lw,
    'stroke-linejoin': 'round',
  });
  // Fur tuft highlights
  out += el('path', {
    d: `M${x(-78)} -466L${x(-58)} -472L${x(-44)} -442L${x(-64)} -448Z`,
    fill: furLight,
    'fill-opacity': 0.45,
  });

  // Waist cord belt + bone buckle + jagged pelt hem spikes
  out += el('path', {
    d: `M${x(-58)} -302L${x(58)} -302L${x(60)} -284L${x(-60)} -284Z`,
    fill: leather,
    stroke: ink,
    'stroke-width': lw * 0.85,
  });
  // Bone skull/fang clasp at waist center
  out += el('path', {
    d: 'M-12 -306L0 -312L12 -306L9 -282L0 -276L-9 -282Z',
    fill: bone,
    stroke: ink,
    'stroke-width': lw * 0.8,
  });
  out += el('circle', { cx: -4, cy: -296, r: 2.2, fill: ink });
  out += el('circle', { cx: 4, cy: -296, r: 2.2, fill: ink });

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
    'stroke-width': lw * 0.9 + 0.8,
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
      d: `M${fmt(f.x - 2.6)} ${fmt(f.y)}L${fmt(f.x + 2.6)} ${fmt(f.y)}L${fmt(f.x + f.tilt)} ${fmt(f.y + f.len)}Z`,
      fill: bone,
      stroke: ink,
      'stroke-width': lw * 0.65,
      'stroke-linejoin': 'round',
    });
    out += el('path', {
      d: `M${fmt(f.x)} ${fmt(f.y)}L${fmt(f.x + 2.4)} ${fmt(f.y)}L${fmt(f.x + f.tilt)} ${fmt(f.y + f.len)}Z`,
      fill: boneShadow,
    });
  }
  return out;
}

/**
 * Renders fur collar accessory on any outfit preset.
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
        `M${x(-56)} -466L${x(-72)} -482L${x(-52)} -480L${x(-58)} -494L${x(-34)} -484L${x(-22)} -494L0 -476` +
        `L${x(22)} -494L${x(34)} -484L${x(58)} -494L${x(52)} -480L${x(72)} -482L${x(56)} -466` +
        `L${x(44)} -448L${x(28)} -460L${x(14)} -444L0 -458L${x(-14)} -444L${x(-28)} -460L${x(-44)} -448Z`,
      fill: fur,
      stroke: ink,
      'stroke-width': lw,
      'stroke-linejoin': 'round',
    }) +
    el('path', {
      d: `M${x(-44)} -478L${x(-24)} -484L0 -466L${x(24)} -484L${x(44)} -478L${x(28)} -464L0 -454L${x(-28)} -464Z`,
      fill: furTip,
      'fill-opacity': 0.38,
    })
  );
}

/**
 * Renders hard triangular cel-shaded clothing folds on torso and sleeves.
 */
export function renderTorsoClothingFolds(
  outfitMain: string,
  sh: number,
  shading: ShadingIntensity,
): string {
  const foldColor = darken(
    outfitMain,
    shading === 'soft' ? 0.22 : shading === 'dramatic-noir' ? 0.5 : 0.34,
  );
  const x = (v: number) => fmt(v * sh);
  // Armpit tension wedges, rib cage drape folds, and waist gathers
  const d =
    `M${x(-68)} -436L${x(-38)} -412L${x(-58)} -396Z` +
    `M${x(68)} -436L${x(38)} -412L${x(58)} -396Z` +
    `M${x(-52)} -364L${x(-12)} -344L${x(-46)} -334Z` +
    `M${x(52)} -364L${x(12)} -344L${x(46)} -334Z` +
    `M${x(-46)} -288L${x(10)} -274L${x(-38)} -266Z`;
  return el('path', { d, fill: foldColor, 'fill-opacity': 0.85 });
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
    return (
      `<g transform="translate(${fmt(hx)} ${fmt(hy)}) rotate(${fmt(tilt - 20)})">` +
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
        { offset: 0, color: '#FFFFFF', opacity: 0.98 },
        { offset: 0.45, color: accent, opacity: 0.9 },
        { offset: 1, color: accent, opacity: 0 },
      ]),
    );
    return (
      `<g transform="translate(${fmt(hx)} ${fmt(hy - 28)})">` +
      el('circle', { cx: 0, cy: 0, r: 34, fill: `url(#${orbGrad})` }) +
      el('circle', { cx: 0, cy: 0, r: 16, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 1.4, 'stroke-opacity': 0.85 }) +
      `</g>`
    );
  }

  return '';
}
