import { fmt } from '../components/svg-utils.js';
import type { P } from './anime-features.js';

/**
 * Organic Cubic Bézier 2D Anime Anatomy & G-Pen Line-Weight Engine.
 *
 * Replaces rigid tube-and-ball-joint limbs with continuous anatomical Bézier
 * silhouettes (deltoid, bicep/tricep, brachioradialis, tapered wrist, quads,
 * knee, calf, sculpted ankle/boot), T-junction muscle overlap creases,
 * simulated G-pen tapered strokes, and directional 2-tone cel-shadow ribbons.
 *
 * Strictly pure SVG paths — zero nested clipPaths, zero degenerate arcs.
 */

// ---------------------------------------------------------------------------
// Vector Helpers
// ---------------------------------------------------------------------------

export function add(a: P, b: P): P {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: P, b: P): P {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: P, k: number): P {
  return { x: v.x * k, y: v.y * k };
}

export function lerpP(a: P, b: P, t: number): P {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function unit(v: P): P {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}

/** Outward perpendicular normal relative to `side` (-1 left, +1 right). */
export function outwardNormal(u: P, side: number): P {
  return side > 0 ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x };
}

/** Offset point `p` along tangent `u` and outward normal `n`. */
function offsetPt(p: P, u: P, n: P, along: number, out: number): P {
  return {
    x: p.x + u.x * along + n.x * out,
    y: p.y + u.y * along + n.y * out,
  };
}

function pt(p: P): string {
  return `${fmt(p.x)} ${fmt(p.y)}`;
}

// ---------------------------------------------------------------------------
// Simulated G-Pen Variable-Width Tapered Stroke (Filled Spindle Ribbon)
// ---------------------------------------------------------------------------

/**
 * Generates a filled Bézier calligraphy ribbon that tapers from 0px at both
 * ends to `maxWidth` in the middle — authentic anime G-pen line weight.
 */
export function taperedCurvePath(p0: P, ctrl: P, p2: P, maxWidth: number): string {
  const t0 = unit(sub(ctrl, p0));
  const t1 = unit(sub(p2, p0));
  const t2 = unit(sub(p2, ctrl));
  const n1 = { x: -t1.y, y: t1.x };
  const half = maxWidth * 0.5;

  // Midpoint on quadratic Bézier at t=0.5: 0.25*p0 + 0.5*ctrl + 0.25*p2
  const mid: P = {
    x: 0.25 * p0.x + 0.5 * ctrl.x + 0.25 * p2.x,
    y: 0.25 * p0.y + 0.5 * ctrl.y + 0.25 * p2.y,
  };

  // Control points shifted slightly outward/inward along mid normal
  const cTop = add(ctrl, scale(n1, half * 1.15));
  const cBot = add(ctrl, scale(n1, -half * 1.15));
  // Subtle lead-in tangent stabilization
  const sTop = add(lerpP(p0, mid, 0.45), scale({ x: -t0.y, y: t0.x }, half * 0.6));
  const eBot = add(lerpP(p2, mid, 0.45), scale({ x: -t2.y, y: t2.x }, -half * 0.6));

  return (
    `M${pt(p0)}` +
    `C${pt(sTop)} ${pt(cTop)} ${pt(p2)}` +
    `C${pt(cBot)} ${pt(eBot)} ${pt(p0)}Z`
  );
}

/**
 * Tapered stroke thick at p0, tapering to a razor-sharp point at p2.
 */
export function taperedAccentPath(p0: P, ctrl: P, p2: P, baseWidth: number): string {
  const t0 = unit(sub(ctrl, p0));
  const n0 = { x: -t0.y, y: t0.x };
  const t1 = unit(sub(p2, p0));
  const n1 = { x: -t1.y, y: t1.x };
  const half = baseWidth * 0.5;

  const a = add(p0, scale(n0, half));
  const b = add(p0, scale(n0, -half));
  const c1 = add(ctrl, scale(n1, half * 0.65));
  const c2 = add(ctrl, scale(n1, -half * 0.65));

  return `M${pt(a)}Q${pt(c1)} ${pt(p2)}Q${pt(c2)} ${pt(b)}Z`;
}

// ---------------------------------------------------------------------------
// Organic Anatomical Torso (Trapezius → Deltoid Root → Lats → Waist → Iliac)
// ---------------------------------------------------------------------------

/**
 * Smooth anime heroic torso silhouette with natural trapezius slope and
 * tapered V-frame ribcage (eliminates flat coat-hanger shoulders).
 */
export function anatomicalTorsoPath(shoulderHalf: number, isSlender: boolean = false, hipY: number = -288): string {
  if (isSlender) {
    const k = shoulderHalf / 52;
    const x = (v: number) => fmt(v * k);
    const hy = fmt(hipY);
    return (
      `M${x(-12)} -474` +
      // Graceful feminine sloping trapezius into shoulder cap
      `C${x(-22)} -471 ${x(-36)} -466 ${x(-48)} -454` +
      // Delicate ribcage
      `C${x(-54)} -434 ${x(-48)} -406 ${x(-38)} -376` +
      // Slender waist taper
      `C${x(-34)} -352 ${x(-29)} -332 ${x(-29)} -312` +
      // Gentle hip flare
      `C${x(-31)} -298 ${x(-40)} -292 ${x(-45)} ${hy}` +
      `L${x(45)} ${hy}` +
      `C${x(40)} -292 ${x(31)} -298 ${x(29)} -312` +
      `C${x(29)} -332 ${x(34)} -352 ${x(38)} -376` +
      `C${x(48)} -406 ${x(54)} -434 ${x(48)} -454` +
      `C${x(36)} -466 ${x(22)} -471 ${x(12)} -474Z`
    );
  }
  const k = shoulderHalf / 72;
  const x = (v: number) => fmt(v * k);
  const hy = fmt(hipY);
  return (
    `M${x(-14)} -474` +
    // Left trapezius slope smoothly into athletic shoulder cap
    `C${x(-28)} -471 ${x(-50)} -466 ${x(-68)} -454` +
    // Outer lat sweep & ribcage
    `C${x(-76)} -436 ${x(-70)} -406 ${x(-60)} -378` +
    // Oblique waist taper
    `C${x(-52)} -350 ${x(-44)} -326 ${x(-43)} -306` +
    // Iliac / hip flare
    `C${x(-45)} -294 ${x(-49)} -288 ${x(-51)} ${hy}` +
    `L${x(51)} ${hy}` +
    `C${x(49)} -288 ${x(45)} -294 ${x(43)} -306` +
    `C${x(44)} -326 ${x(52)} -350 ${x(60)} -378` +
    `C${x(70)} -406 ${x(76)} -436 ${x(68)} -454` +
    `C${x(50)} -466 ${x(28)} -471 ${x(14)} -474Z`
  );
}

// ---------------------------------------------------------------------------
// Organic Cubic Bézier Arm (Deltoid → Bicep → Brachioradialis → Wrist)
// ---------------------------------------------------------------------------

export interface ArmGeometryOptions {
  /** Base width scale (1.0 standard, 1.08 muscular/primitive, 1.18 armor/robe). */
  bulk?: number;
  /** Flared sleeve cuff (robes / wide kimono sleeves). */
  wideSleeve?: boolean;
  /** Fraction of forearm covered (0..1, default 1.0 = full arm to wrist). */
  forearmRatio?: number;
  /** Light direction sign: +1 means shadow falls on +x side, -1 means shadow on -x side. */
  shadowSide: number;
}

export interface AnatomicalArmGeometry {
  /** Closed organic cubic Bézier fill silhouette of the arm or sleeve (draw with noStroke). */
  silhouette: string;
  /** Open ink contour (deltoid dome → outer arm → wrist → inner arm → armpit T-junction). No closed shoulder seam! */
  outline: string;
  /** Open G-pen tapered T-junction curves (deltoid cap overlap, inner elbow crease). */
  anatomyCreases: string;
  /** Hard 2-tone cel-shadow ribbon hugging the shadow edge of the arm. */
  celShadow: string;
  /** Exact wrist end point (after forearmRatio) and forearm unit direction. */
  endPoint: P;
  forearmUnit: P;
}

/**
 * Computes a complete organic cubic Bézier arm from shoulder → elbow → wrist.
 * Uses a closed fill silhouette paired with an OPEN ink contour (ending at the
 * armpit T-junction) so the arm merges organically into the torso like a real
 * 2D anime studio rig (zero circular ball-joint rings, zero boxy shoulder corners).
 */
export function buildAnatomicalArm(
  shoulder: P,
  elbow: P,
  wrist: P,
  side: number,
  opts: ArmGeometryOptions,
): AnatomicalArmGeometry {
  const bulk = opts.bulk ?? 1.0;
  const ratio = opts.forearmRatio ?? 1.0;
  const wide = opts.wideSleeve ?? false;

  const endPt = ratio >= 0.999 ? wrist : lerpP(elbow, wrist, ratio);
  const vU = sub(elbow, shoulder);
  const lenU = Math.hypot(vU.x, vU.y) || 1;
  const uU = { x: vU.x / lenU, y: vU.y / lenU };
  const nU = outwardNormal(uU, side);

  const vF = sub(endPt, elbow);
  const lenF = Math.hypot(vF.x, vF.y) || 1;
  const uF = { x: vF.x / lenF, y: vF.y / lenF };
  const nF = outwardNormal(uF, side);

  // Smooth bisector normal & tangent at the elbow for C1-continuous curvature
  const nE = unit(add(nU, nF));
  const uE = unit(add(uU, uF));

  // Anatomical half-widths (in local units)
  const wShoulder = 15.5 * bulk;
  const wDeltoid = 17.5 * bulk; // natural rounded deltoid swell
  const wBicepIn = 13.5 * bulk; // inner bicep / armpit
  const wElbowOut = 13.2 * bulk;
  const wElbowIn = 11.4 * bulk;
  const wBrachio = (wide ? 17.2 : 14.2) * bulk; // outer brachioradialis muscle swell
  const wForeIn = (wide ? 16.5 : 11.4) * bulk;
  const wWristOut = (wide ? 19.2 : 7.0 + (1 - ratio) * 4.8) * bulk;
  const wWristIn = (wide ? 18.2 : 6.6 + (1 - ratio) * 4.5) * bulk;

  // Rounded deltoid root tucked smoothly into the torso trapezius slope
  const pRootIn = offsetPt(shoulder, uU, nU, -10 * bulk, -wShoulder * 0.85);
  const pShoulderCrest = offsetPt(shoulder, uU, nU, -11.5 * bulk, -wShoulder * 0.12);
  const pDeltStart = offsetPt(shoulder, uU, nU, -4.5 * bulk, wDeltoid * 0.78);
  const pDeltPeak = offsetPt(shoulder, uU, nU, lenU * 0.24, wDeltoid);

  // Smooth elbow & forearm outer contour (C1-continuous through elbow)
  const pElbowOut = add(elbow, scale(nE, wElbowOut));
  const cToElbowOut = add(pElbowOut, scale(uE, -lenU * 0.22));
  const cFromElbowOut = add(pElbowOut, scale(uE, lenF * 0.22));
  const pBrachioPeak = offsetPt(elbow, uF, nF, lenF * 0.34, wBrachio);
  const pWristOut = add(endPt, scale(nF, wWristOut));

  // Inner contour (wrist → inner forearm → inner elbow → inner bicep → armpit T-junction)
  const pWristIn = add(endPt, scale(nF, -wWristIn));
  const pForeMidIn = offsetPt(elbow, uF, nF, lenF * 0.42, -wForeIn);
  const pElbowIn = add(elbow, scale(nE, -wElbowIn));
  const cFromElbowIn = add(pElbowIn, scale(uE, lenF * 0.16));
  const cToElbowIn = add(pElbowIn, scale(uE, -lenU * 0.18));
  const pBicepPeak = offsetPt(shoulder, uU, nU, lenU * 0.46, -wBicepIn);
  const pArmpit = offsetPt(shoulder, uU, nU, lenU * 0.14, -wBicepIn * 0.92);

  // Smooth organic curves along outer & inner edges
  const cDeltCurve1 = offsetPt(shoulder, uU, nU, -11 * bulk, wDeltoid * 0.46);
  const cDeltCurve2 = offsetPt(shoulder, uU, nU, lenU * 0.08, wDeltoid * 1.04);
  const cUOutMid = offsetPt(shoulder, uU, nU, lenU * 0.52, wDeltoid * 0.88);
  const cFOutWrist = offsetPt(elbow, uF, nF, lenF * 0.68, (wBrachio + wWristOut) * 0.46);

  const cWrist1 = offsetPt(endPt, uF, nF, wide ? 3.5 : 2.2, wWristOut * 0.4);
  const cWrist2 = offsetPt(endPt, uF, nF, wide ? 3.5 : 2.2, -wWristIn * 0.4);

  const cFInWrist = offsetPt(elbow, uF, nF, lenF * 0.72, -(wForeIn + wWristIn) * 0.44);
  const cUInArmpit = offsetPt(shoulder, uU, nU, lenU * 0.28, -wBicepIn * 1.02);

  // Open outer-to-inner contour path (NO closing line across shoulder!)
  const openContour =
    `M${pt(pShoulderCrest)}` +
    `C${pt(cDeltCurve1)} ${pt(pDeltStart)} ${pt(cDeltCurve2)}` +
    `C${pt(pDeltPeak)} ${pt(cUOutMid)} ${pt(cToElbowOut)}` +
    `Q${pt(pElbowOut)} ${pt(cFromElbowOut)}` +
    `C${pt(pBrachioPeak)} ${pt(cFOutWrist)} ${pt(pWristOut)}` +
    `C${pt(cWrist1)} ${pt(cWrist2)} ${pt(pWristIn)}` +
    `C${pt(cFInWrist)} ${pt(pForeMidIn)} ${pt(cFromElbowIn)}` +
    `Q${pt(pElbowIn)} ${pt(cToElbowIn)}` +
    `C${pt(pBicepPeak)} ${pt(cUInArmpit)} ${pt(pArmpit)}`;

  // Closed fill path tucks invisibly behind the torso shoulder line
  const silhouette = `${openContour}L${pt(pRootIn)}Q${pt(pShoulderCrest)} ${pt(pShoulderCrest)}Z`;

  // Open G-pen tapered T-junction anatomy creases (subtle deltoid-bicep curve + inner elbow tick)
  const deltStart = offsetPt(shoulder, uU, nU, lenU * 0.14, -wBicepIn * 0.72);
  const deltCtrl = offsetPt(shoulder, uU, nU, lenU * 0.28, -wBicepIn * 0.12);
  const deltEnd = offsetPt(shoulder, uU, nU, lenU * 0.34, wDeltoid * 0.38);

  const elbowStart = add(elbow, scale(nE, -wElbowIn * 0.88));
  const elbowCtrl = offsetPt(elbow, uF, nF, 3.0, -wElbowIn * 0.24);
  const elbowEnd = offsetPt(elbow, uF, nF, 7.5, wElbowOut * 0.14);

  const anatomyCreases =
    taperedCurvePath(deltStart, deltCtrl, deltEnd, 2.0) +
    taperedCurvePath(elbowStart, elbowCtrl, elbowEnd, 1.7);

  // Hard 2-tone directional cel-shadow along whichever edge faces away from light
  const shadowOnOut = opts.shadowSide * side > 0;
  let celShadow = '';
  if (shadowOnOut) {
    const sInset = 0.36;
    const sTop = offsetPt(shoulder, uU, nU, -2 * bulk, wDeltoid * 0.36);
    const sMid = offsetPt(shoulder, uU, nU, lenU * 0.55, wElbowOut * sInset);
    const sElb = add(elbow, scale(nE, wElbowOut * sInset));
    const sFore = offsetPt(elbow, uF, nF, lenF * 0.45, wBrachio * sInset);
    const sWri = add(endPt, scale(nF, wWristOut * 0.28));
    celShadow =
      `M${pt(pDeltStart)}` +
      `C${pt(cDeltCurve2)} ${pt(pDeltPeak)} ${pt(cUOutMid)}` +
      `Q${pt(pElbowOut)} ${pt(cFromElbowOut)}` +
      `C${pt(pBrachioPeak)} ${pt(cFOutWrist)} ${pt(pWristOut)}` +
      `L${pt(sWri)}Q${pt(sFore)} ${pt(sElb)}Q${pt(sMid)} ${pt(sTop)}Z`;
  } else {
    const sInset = -0.32;
    const sTop = offsetPt(shoulder, uU, nU, lenU * 0.14, wBicepIn * sInset);
    const sMid = offsetPt(shoulder, uU, nU, lenU * 0.52, wBicepIn * sInset);
    const sElb = add(elbow, scale(nE, wElbowIn * sInset));
    const sFore = offsetPt(elbow, uF, nF, lenF * 0.45, wForeIn * sInset);
    const sWri = add(endPt, scale(nF, -wWristIn * 0.24));
    celShadow =
      `M${pt(pWristIn)}` +
      `C${pt(cFInWrist)} ${pt(pForeMidIn)} ${pt(cFromElbowIn)}` +
      `Q${pt(pElbowIn)} ${pt(cToElbowIn)}` +
      `C${pt(pBicepPeak)} ${pt(cUInArmpit)} ${pt(pArmpit)}` +
      `L${pt(sTop)}Q${pt(sMid)} ${pt(sElb)}Q${pt(sFore)} ${pt(sWri)}Z`;
  }

  return {
    silhouette,
    outline: openContour,
    anatomyCreases,
    celShadow,
    endPoint: endPt,
    forearmUnit: uF,
  };
}

// ---------------------------------------------------------------------------
// Organic Cubic Bézier Forearm Wrap / Bracer / Gauntlet
// ---------------------------------------------------------------------------

/**
 * Generates an anatomical tapered forearm wrap or bracer that hugs the
 * brachioradialis taper cleanly without round ball caps.
 */
export function buildForearmWrapPath(
  elbow: P,
  wrist: P,
  side: number,
  tStart: number,
  tEnd: number,
  wStart: number,
  wEnd: number,
): string {
  const a = lerpP(elbow, wrist, tStart);
  const b = lerpP(elbow, wrist, tEnd);
  const u = unit(sub(wrist, elbow));
  const n = outwardNormal(u, side);
  const mid = lerpP(a, b, 0.45);
  const wMid = wStart * 0.6 + wEnd * 0.4;

  const aOut = add(a, scale(n, wStart * 0.52));
  const aIn = add(a, scale(n, -wStart * 0.48));
  const bOut = add(b, scale(n, wEnd * 0.52));
  const bIn = add(b, scale(n, -wEnd * 0.48));
  const mOut = add(mid, scale(n, wMid * 0.54));
  const mIn = add(mid, scale(n, -wMid * 0.5));
  const topCurve = offsetPt(a, u, n, -3.5, 0);
  const botCurve = offsetPt(b, u, n, 3.0, 0);

  return (
    `M${pt(aIn)}` +
    `Q${pt(topCurve)} ${pt(aOut)}` +
    `Q${pt(mOut)} ${pt(bOut)}` +
    `Q${pt(botCurve)} ${pt(bIn)}` +
    `Q${pt(mIn)} ${pt(aIn)}Z`
  );
}

// ---------------------------------------------------------------------------
// Organic Cubic Bézier Leg (Quad → Patella/Knee → Calf → Slender Ankle)
// ---------------------------------------------------------------------------

export interface AnatomicalLegGeometry {
  silhouette: string;
  anatomyCreases: string;
  celShadow: string;
}

export function buildAnatomicalLeg(
  hip: P,
  knee: P,
  ankle: P,
  side: number,
  bulk: number,
  shadowSide: number,
): AnatomicalLegGeometry {
  const vT = sub(knee, hip);
  const lenT = Math.hypot(vT.x, vT.y) || 1;
  const uT = { x: vT.x / lenT, y: vT.y / lenT };
  const nT = outwardNormal(uT, side);

  const vS = sub(ankle, knee);
  const lenS = Math.hypot(vS.x, vS.y) || 1;
  const uS = { x: vS.x / lenS, y: vS.y / lenS };
  const nS = outwardNormal(uS, side);

  const nK = unit(add(nT, nS));

  const wHipOut = 24.0 * bulk;
  const wHipIn = 18.0 * bulk;
  const wQuadOut = 27.5 * bulk;
  const wThighIn = 17.5 * bulk;
  const wKneeOut = 16.0 * bulk;
  const wKneeIn = 14.0 * bulk;
  const wCalfOut = 21.0 * bulk; // athletic sweeping gastrocnemius curve
  const wCalfIn = 16.5 * bulk;
  const wAnkleOut = 10.0 * bulk;
  const wAnkleIn = 9.0 * bulk;

  const pHipOut = add(hip, scale(nT, wHipOut));
  const pHipIn = add(hip, scale(nT, -wHipIn));
  const pQuadCtrl = offsetPt(hip, uT, nT, lenT * 0.42, wQuadOut);
  const pKneeOut = add(knee, scale(nK, wKneeOut));
  const pCalfOutCtrl = offsetPt(knee, uS, nS, lenS * 0.34, wCalfOut);
  const pAnkleOut = add(ankle, scale(nS, wAnkleOut));

  const pAnkleIn = add(ankle, scale(nS, -wAnkleIn));
  const pCalfInCtrl = offsetPt(knee, uS, nS, lenS * 0.38, -wCalfIn);
  const pKneeIn = add(knee, scale(nK, -wKneeIn));
  const pThighInCtrl = offsetPt(hip, uT, nT, lenT * 0.48, -wThighIn);

  const silhouette =
    `M${pt(pHipIn)}` +
    `Q${pt(offsetPt(hip, uT, nT, -12, 2))} ${pt(pHipOut)}` +
    `Q${pt(pQuadCtrl)} ${pt(pKneeOut)}` +
    `C${pt(pCalfOutCtrl)} ${pt(offsetPt(knee, uS, nS, lenS * 0.72, wAnkleOut * 1.15))} ${pt(pAnkleOut)}` +
    `L${pt(pAnkleIn)}` +
    `C${pt(offsetPt(knee, uS, nS, lenS * 0.72, -wAnkleIn * 1.1))} ${pt(pCalfInCtrl)} ${pt(pKneeIn)}` +
    `Q${pt(pThighInCtrl)} ${pt(pHipIn)}Z`;

  // Subtle anime kneecap (patella) + shin tendon tapered strokes
  const k1 = offsetPt(knee, uT, nT, -8, -4);
  const kCtrl = offsetPt(knee, uT, nT, 2, 1);
  const k2 = offsetPt(knee, uS, nS, 10, 4);
  const anatomyCreases = taperedCurvePath(k1, kCtrl, k2, 1.9);

  // Directional cel-shadow ribbon along leg
  const shadowOnOut = shadowSide * side > 0;
  let celShadow = '';
  if (shadowOnOut) {
    const tMid = offsetPt(hip, uT, nT, lenT * 0.45, wQuadOut * 0.32);
    const kMid = add(knee, scale(nK, wKneeOut * 0.25));
    const sMid = offsetPt(knee, uS, nS, lenS * 0.38, wCalfOut * 0.26);
    const aMid = add(ankle, scale(nS, wAnkleOut * 0.18));
    celShadow =
      `M${pt(pHipOut)}Q${pt(pQuadCtrl)} ${pt(pKneeOut)}` +
      `C${pt(pCalfOutCtrl)} ${pt(offsetPt(knee, uS, nS, lenS * 0.72, wAnkleOut * 1.15))} ${pt(pAnkleOut)}` +
      `L${pt(aMid)}Q${pt(sMid)} ${pt(kMid)}Q${pt(tMid)} ${pt(add(hip, scale(nT, wHipOut * 0.3)))}Z`;
  } else {
    const tMid = offsetPt(hip, uT, nT, lenT * 0.45, -wThighIn * 0.22);
    const kMid = add(knee, scale(nK, -wKneeIn * 0.22));
    const sMid = offsetPt(knee, uS, nS, lenS * 0.38, -wCalfIn * 0.22);
    const aMid = add(ankle, scale(nS, -wAnkleIn * 0.18));
    celShadow =
      `M${pt(pAnkleIn)}` +
      `C${pt(offsetPt(knee, uS, nS, lenS * 0.72, -wAnkleIn * 1.1))} ${pt(pCalfInCtrl)} ${pt(pKneeIn)}` +
      `Q${pt(pThighInCtrl)} ${pt(pHipIn)}` +
      `L${pt(add(hip, scale(nT, -wHipIn * 0.25)))}Q${pt(tMid)} ${pt(kMid)}Q${pt(sMid)} ${pt(aMid)}Z`;
  }

  return { silhouette, anatomyCreases, celShadow };
}

// ---------------------------------------------------------------------------
// Sculpted Anime Boot / Foot Silhouette (Replaces Flat Oval Shoes)
// ---------------------------------------------------------------------------

/**
 * Draws a sculpted anime boot/foot with curved instep, grounded sole, and heel.
 */
export function anatomicalBootPath(ankle: P, dir: number): string {
  const x = (dx: number) => fmt(ankle.x + dx * dir);
  const y = (dy: number) => fmt(ankle.y + dy);
  return (
    `M${x(-10)} ${y(-10)}` +
    `L${x(9)} ${y(-10)}` +
    // Curved ankle instep flowing into toe box
    `C${x(13)} ${y(-2)} ${x(22)} ${y(1)} ${x(28)} ${y(7)}` +
    // Rounded toe tip to grounded sole
    `Q${x(31)} ${y(14)} ${x(22)} ${y(15)}` +
    // Flat grounded sole with subtle arch
    `L${x(-7)} ${y(15)}` +
    `Q${x(-14)} ${y(15)} ${x(-13)} ${y(7)}` +
    `C${x(-12)} ${y(1)} ${x(-11)} ${y(-4)} ${x(-10)} ${y(-10)}Z`
  );
}

// ---------------------------------------------------------------------------
// Forearm-Aligned Organic Anime Hand / Fist (Cubic Bézier)
// ---------------------------------------------------------------------------

function handLocalPt(local: P, wrist: P, uFore: P, side: number, r: number): P {
  const nOut = outwardNormal(uFore, side);
  return {
    x: wrist.x + uFore.x * local.y * r + nOut.x * local.x * r,
    y: wrist.y + uFore.y * local.y * r + nOut.y * local.x * r,
  };
}

/**
 * Smooth organic anime fist aligned dynamically to the forearm vector so it
 * looks natural in standing, lunging, crouching, and weapon-holding poses.
 */
export function anatomicalHandPath(wrist: P, uFore: P, r: number, side: number): string {
  const hp = (lx: number, ly: number) => handLocalPt({ x: lx, y: ly }, wrist, uFore, side, r);
  const pWristIn = hp(-0.58, -0.18);
  const pWristOut = hp(0.62, -0.14);
  const pBackKnuckle = hp(0.96, 0.55);
  const pOuterFinger = hp(0.92, 1.38);
  const pMidFinger = hp(0.32, 1.65);
  const pInnerFinger = hp(-0.34, 1.48);
  const pThumbTip = hp(-0.98, 0.92);
  const pThumbBase = hp(-0.88, 0.25);

  return (
    `M${pt(pWristIn)}` +
    `L${pt(pWristOut)}` +
    `Q${pt(hp(0.98, 0.16))} ${pt(pBackKnuckle)}` +
    `C${pt(hp(1.08, 0.92))} ${pt(hp(1.06, 1.24))} ${pt(pOuterFinger)}` +
    `Q${pt(hp(0.66, 1.68))} ${pt(pMidFinger)}` +
    `Q${pt(hp(-0.04, 1.68))} ${pt(pInnerFinger)}` +
    `Q${pt(hp(-0.72, 1.36))} ${pt(pThumbTip)}` +
    `Q${pt(hp(-1.08, 0.58))} ${pt(pThumbBase)}` +
    `Q${pt(hp(-0.74, 0.02))} ${pt(pWristIn)}Z`
  );
}

/**
 * Delicate fingercurl & thumb-fold ink details aligned with `anatomicalHandPath`.
 */
export function anatomicalHandDetailPath(wrist: P, uFore: P, r: number, side: number): string {
  const hp = (lx: number, ly: number) => handLocalPt({ x: lx, y: ly }, wrist, uFore, side, r);
  // Thumb wrap curve across curled fingers
  const thumbCrease = taperedCurvePath(
    hp(-0.76, 0.62),
    hp(-0.22, 0.98),
    hp(0.28, 0.86),
    1.5,
  );
  // Finger segment ticks
  const finger1 = taperedCurvePath(
    hp(0.36, 1.02),
    hp(0.35, 1.32),
    hp(0.28, 1.56),
    1.2,
  );
  const finger2 = taperedCurvePath(
    hp(0.68, 0.92),
    hp(0.7, 1.2),
    hp(0.65, 1.45),
    1.15,
  );
  return thumbCrease + finger1 + finger2;
}

/**
 * Renders anatomical fingers and thumb tightly locked OVER a weapon hilt.
 */
export function anatomicalWeaponGripFingers(
  wrist: P,
  uFore: P,
  r: number,
  side: number,
  skin: string,
  ink: string,
  lw: number,
): string {
  const hp = (lx: number, ly: number) => handLocalPt({ x: lx, y: ly }, wrist, uFore, side, r);
  let out = '';
  // 4 wrapped finger segments across the hilt
  const fingerD =
    `M${pt(hp(0.85, 0.45))}C${pt(hp(0.9, 0.7))} ${pt(hp(0.5, 0.85))} ${pt(hp(-0.25, 0.72))}` +
    `L${pt(hp(-0.25, 1.45))}C${pt(hp(0.5, 1.55))} ${pt(hp(0.9, 1.35))} ${pt(hp(0.85, 0.45))}Z`;
  out += `<path d="${fingerD}" fill="${skin}" stroke="${ink}" stroke-width="${fmt(lw * 0.85)}" stroke-linejoin="round"/>`;
  // Knuckle division grooves
  out += `<path d="M${pt(hp(0.55, 0.68))}L${pt(hp(0.05, 0.74))}M${pt(hp(0.58, 0.95))}L${pt(hp(0.08, 1.01))}M${pt(hp(0.55, 1.22))}L${pt(hp(0.05, 1.28))}" fill="none" stroke="${ink}" stroke-width="${fmt(lw * 0.6)}" stroke-linecap="round"/>`;
  // Thumb wrapping over the front of the hilt
  const thumbD =
    `M${pt(hp(-0.75, 0.25))}C${pt(hp(-0.85, 0.65))} ${pt(hp(-0.55, 1.05))} ${pt(hp(0.15, 0.92))}` +
    `Q${pt(hp(0.35, 0.75))} ${pt(hp(0.1, 0.55))}` +
    `C${pt(hp(-0.35, 0.5))} ${pt(hp(-0.55, 0.35))} ${pt(hp(-0.75, 0.25))}Z`;
  out += `<path d="${thumbD}" fill="${skin}" stroke="${ink}" stroke-width="${fmt(lw * 0.85)}" stroke-linejoin="round"/>`;
  return out;
}

/**
 * Open graceful anime casting hand (used for magic / orbs).
 */
export function anatomicalCastingHand(
  wrist: P,
  uFore: P,
  r: number,
  side: number,
): string {
  const hp = (lx: number, ly: number) => handLocalPt({ x: lx, y: ly }, wrist, uFore, side, r);
  return (
    `M${pt(hp(-0.5, -0.15))}` +
    `L${pt(hp(0.5, -0.12))}` +
    `Q${pt(hp(0.72, 0.35))} ${pt(hp(0.78, 0.75))}` +
    // Pinky
    `C${pt(hp(0.95, 1.25))} ${pt(hp(0.88, 1.55))} ${pt(hp(0.72, 1.75))}` +
    `Q${pt(hp(0.62, 1.45))} ${pt(hp(0.55, 1.15))}` +
    // Ring finger
    `C${pt(hp(0.65, 1.65))} ${pt(hp(0.55, 2.05))} ${pt(hp(0.38, 2.15))}` +
    `Q${pt(hp(0.3, 1.75))} ${pt(hp(0.24, 1.25))}` +
    // Middle finger
    `C${pt(hp(0.28, 1.75))} ${pt(hp(0.18, 2.25))} ${pt(hp(0.02, 2.35))}` +
    `Q${pt(hp(-0.06, 1.85))} ${pt(hp(-0.1, 1.28))}` +
    // Index finger
    `C${pt(hp(-0.12, 1.72))} ${pt(hp(-0.25, 2.12))} ${pt(hp(-0.42, 2.18))}` +
    `Q${pt(hp(-0.46, 1.65))} ${pt(hp(-0.42, 1.15))}` +
    // Thumb spread
    `C${pt(hp(-0.75, 1.05))} ${pt(hp(-1.05, 1.15))} ${pt(hp(-1.18, 0.95))}` +
    `Q${pt(hp(-0.95, 0.45))} ${pt(hp(-0.72, 0.15))}` +
    `Q${pt(hp(-0.6, -0.05))} ${pt(hp(-0.5, -0.15))}Z`
  );
}

/**
 * Natural relaxed hanging anime hand (for standing / non-combat poses instead of mirrored mittens).
 */
export function anatomicalRelaxedHand(
  wrist: P,
  uFore: P,
  r: number,
  side: number,
): string {
  const hp = (lx: number, ly: number) => handLocalPt({ x: lx, y: ly }, wrist, uFore, side, r);
  return (
    `M${pt(hp(-0.52, -0.15))}` +
    `L${pt(hp(0.52, -0.12))}` +
    `Q${pt(hp(0.68, 0.45))} ${pt(hp(0.64, 1.05))}` +
    `C${pt(hp(0.62, 1.55))} ${pt(hp(0.45, 1.85))} ${pt(hp(0.28, 1.92))}` +
    `Q${pt(hp(0.18, 1.65))} ${pt(hp(0.14, 1.35))}` +
    `C${pt(hp(0.08, 1.82))} ${pt(hp(-0.08, 2.02))} ${pt(hp(-0.24, 1.98))}` +
    `Q${pt(hp(-0.34, 1.68))} ${pt(hp(-0.38, 1.25))}` +
    `C${pt(hp(-0.58, 1.18))} ${pt(hp(-0.82, 1.05))} ${pt(hp(-0.88, 0.82))}` +
    `Q${pt(hp(-0.76, 0.35))} ${pt(hp(-0.52, -0.15))}Z`
  );
}

/**
 * Articulated Manhwa close-up gestural hand (slender curled fingers + thumb with nail detail).
 * Ideal for three-quarter / thoughtful chin-rest / dialogue poses.
 */
export function anatomicalGesturalHand(
  wrist: P,
  uFore: P,
  r: number,
  side: number,
  skin: string,
  ink: string,
  lw: number,
): string {
  const hp = (lx: number, ly: number) => handLocalPt({ x: lx, y: ly }, wrist, uFore, side, r);
  const sw = fmt(lw * 0.8);
  const fineSw = fmt(lw * 0.5);

  // Curled ring & pinky fingers tucked gracefully behind
  const backFingers =
    `M${pt(hp(0.05, 0.85))}C${pt(hp(0.32, 0.95))} ${pt(hp(0.38, 1.38))} ${pt(hp(0.2, 1.58))}` +
    `C${pt(hp(0.1, 1.62))} ${pt(hp(0.02, 1.45))} ${pt(hp(0.02, 1.18))}Z`;

  // Slender palm + relaxed curved index & middle fingers + natural thumb (open wrist base)
  const palmAndIndex =
    `M${pt(hp(-0.3, -0.25))}` +
    `C${pt(hp(-0.34, 0.25))} ${pt(hp(-0.46, 0.65))} ${pt(hp(-0.56, 0.98))}` +
    // Natural thumb resting gently upward/inward
    `C${pt(hp(-0.66, 1.25))} ${pt(hp(-0.58, 1.52))} ${pt(hp(-0.44, 1.48))}` +
    `C${pt(hp(-0.34, 1.42))} ${pt(hp(-0.32, 1.15))} ${pt(hp(-0.28, 0.95))}` +
    // Slender gracefully curved index finger (pointing softly toward chin)
    `C${pt(hp(-0.32, 1.45))} ${pt(hp(-0.36, 1.98))} ${pt(hp(-0.26, 2.28))}` +
    `C${pt(hp(-0.18, 2.34))} ${pt(hp(-0.1, 2.18))} ${pt(hp(-0.08, 1.65))}` +
    // Middle finger slightly lower & closer (no V-spread!)
    `C${pt(hp(-0.02, 1.98))} ${pt(hp(0.08, 2.12))} ${pt(hp(0.16, 2.02))}` +
    `C${pt(hp(0.24, 1.88))} ${pt(hp(0.22, 1.38))} ${pt(hp(0.24, 0.95))}` +
    `C${pt(hp(0.32, 0.55))} ${pt(hp(0.32, 0.15))} ${pt(hp(0.28, -0.25))}`;

  // Subtle finger crease only (no ugly oval hole!)
  const creases =
    `M${pt(hp(-0.24, 1.72))}Q${pt(hp(-0.18, 1.74))} ${pt(hp(-0.14, 1.71))}` +
    `M${pt(hp(-0.04, 1.48))}Q${pt(hp(0.06, 1.52))} ${pt(hp(0.14, 1.48))}`;

  return (
    `<path d="${backFingers}" fill="${skin}" fill-opacity="0.88" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"/>` +
    `<path d="${palmAndIndex}" fill="${skin}" stroke="${ink}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${creases}" fill="none" stroke="${ink}" stroke-width="${fineSw}" stroke-linecap="round"/>`
  );
}

/**
 * Manhwa 3/4 side-profile thoughtful hand poised gracefully right below the chin
 * (Lloyd-style: curved index finger reaching toward chin, tucked curled middle/ring
 * fingers underneath, upright thumb on near side with subtle nail accent).
 */
export function anatomicalChinThinkHand(
  chin: P,
  scale: number,
  skin: string,
  ink: string,
  lw: number,
): string {
  const s = scale;
  const p = (dx: number, dy: number) => `${fmt(chin.x + dx * s)} ${fmt(chin.y + dy * s)}`;
  const shade = 'rgba(0,0,0,0.14)';
  const sw = fmt(lw * 0.85);
  const fineSw = fmt(lw * 0.52);

  // Curled middle finger tucked behind/below index finger
  const midFinger =
    `M${p(6, 12)}C${p(-2, 11)} ${p(-6, 14)} ${p(-5, 18)}` +
    `C${p(-3, 21)} ${p(4, 21)} ${p(11, 20)}Z`;

  // Main hand silhouette: index finger curving up to chin + outer palm + wrist descending
  const mainHand =
    `M${p(4, 3)}` +
    `C${p(9, 1)} ${p(16, 6)} ${p(22, 13)}` +
    `C${p(26, 18)} ${p(28, 25)} ${p(26, 32)}` +
    `C${p(24, 38)} ${p(20, 44)} ${p(18, 52)}` +
    `L${p(5, 52)}` +
    `C${p(5, 42)} ${p(4, 32)} ${p(2, 24)}` +
    // Thumb upright on viewer-facing side
    `C${p(2, 17)} ${p(4, 13)} ${p(7, 13)}` +
    `C${p(10, 14)} ${p(11, 20)} ${p(13, 27)}` +
    // Palm inner web up to curled index underside
    `Q${p(15, 22)} ${p(14, 16)}` +
    `Q${p(9, 11)} ${p(3, 8)}` +
    `C${p(1, 6)} ${p(2, 4)} ${p(4, 3)}Z`;

  // Cel-shadow along the back of the thumb & curled inner palm
  const handShade =
    `M${p(7, 13)}C${p(10, 14)} ${p(11, 20)} ${p(13, 27)}L${p(18, 35)}L${p(12, 38)}C${p(9, 30)} ${p(7, 22)} ${p(7, 13)}Z`;

  // Clean subtle thumb nail + knuckle creases
  const details =
    `M${p(4, 15.5)}L${p(4, 18.5)}Q${p(6, 19.5)} ${p(7.5, 18.5)}L${p(7.5, 15.5)}` +
    `M${p(13, 10)}Q${p(16, 12)} ${p(17, 15)}` +
    `M${p(2, 15)}Q${p(5, 15.5)} ${p(8, 16)}`;

  return (
    `<path d="${midFinger}" fill="${skin}" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"/>` +
    `<path d="${midFinger}" fill="${shade}"/>` +
    `<path d="${mainHand}" fill="${skin}" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"/>` +
    `<path d="${handShade}" fill="${shade}"/>` +
    `<path d="${details}" fill="none" stroke="${ink}" stroke-width="${fineSw}" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}
