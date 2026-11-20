/**
 * Fase 3 — Layered Multi-Clump Manhwa Hair Renderer.
 *
 * Pure SVG, zero nested `<clipPath>`, zero uniform `stroke`, @resvg/resvg-js safe.
 * Builds hair as 3-depth overlapping S/C-curved clumps with organic tapered tips,
 * variable-weight ink contours (`manhwa-ink.ts`), snug crown volume (`1.04–1.07x`),
 * directional highlight streaks, and fine stray wisps.
 */

import { el, fmt, lighten, mix } from '../components/svg-utils.js';
import {
  type P2,
  sampleCubicBezier,
  sampleQuadBezier,
  taperedInkRibbon,
} from './manhwa-ink.js';

/** 3D-to-2D projection context supplied by the parametric head renderer. */
export interface Hair3DProjection {
  surf: (thetaDeg: number, y: number, rScale?: number) => P2;
  proj: (x: number, y: number, z: number) => P2;
  rx: number;
  ry: number;
  rz: number;
  yawDeg: number;
  yawT: number;
  nearAz: number;
  farAz: number;
  earTop: P2;
  jawAngle: P2;
  chinPt: P2;
  collarY: number;
}

export interface ManhwaHairOptions {
  proj3d: Hair3DProjection;
  hairStyle: string;
  isFemale: boolean;
  hairFill: string;
  hairBase: string;
  hairDark: string;
  hairDeep: string;
  angelColor: string;
  ink: string;
  lw: number;
  silhouetteOnly: boolean;
}

export interface HairClumpGeometry {
  fillD: string;
  tip: P2;
  leftEdge: P2[];
  rightEdge: P2[];
  spine: P2[];
}

export interface HairClumpParams {
  root: P2;
  rootHalfW: number;
  tip: P2;
  /** Lateral bow at ~36% length (positive = left-hand normal of root->tip). */
  midOffset: number;
  /** Lateral bow at ~72% length (opposite sign yields an S-curve; same sign yields a C-curve). */
  tipOffset: number;
  /** Width multiplier around mid-clump (default 0.92). */
  bellyScale?: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerpPt(a: P2, b: P2, t: number): P2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function pt(p: P2): string {
  return `${fmt(p.x)} ${fmt(p.y)}`;
}

/**
 * Build a smooth S/C-curved hair clump blade with an organic tapered tip.
 * Returns closed path data plus sampled left, right, and spine curves for variable-weight ink.
 */
export function buildHairClumpPath(params: HairClumpParams): HairClumpGeometry {
  const { root, rootHalfW, tip, midOffset, tipOffset, bellyScale = 0.92 } = params;
  const dx = tip.x - root.x;
  const dy = tip.y - root.y;
  const len = Math.max(1e-4, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;

  const rootL: P2 = { x: root.x + nx * rootHalfW, y: root.y + ny * rootHalfW };
  const rootR: P2 = { x: root.x - nx * rootHalfW, y: root.y - ny * rootHalfW };

  const mid1Base = lerpPt(root, tip, 0.36);
  const mid2Base = lerpPt(root, tip, 0.72);
  const mid1: P2 = { x: mid1Base.x + nx * midOffset, y: mid1Base.y + ny * midOffset };
  const mid2: P2 = { x: mid2Base.x + nx * tipOffset, y: mid2Base.y + ny * tipOffset };

  const cL1: P2 = {
    x: mid1.x + nx * (rootHalfW * bellyScale),
    y: mid1.y + ny * (rootHalfW * bellyScale),
  };
  const cL2: P2 = {
    x: mid2.x + nx * (rootHalfW * 0.34),
    y: mid2.y + ny * (rootHalfW * 0.34),
  };
  const cR1: P2 = {
    x: mid1.x - nx * (rootHalfW * bellyScale * 0.92),
    y: mid1.y - ny * (rootHalfW * bellyScale * 0.92),
  };
  const cR2: P2 = {
    x: mid2.x - nx * (rootHalfW * 0.3),
    y: mid2.y - ny * (rootHalfW * 0.3),
  };

  const fillD =
    `M${pt(rootL)}` +
    `C${pt(cL1)} ${pt(cL2)} ${pt(tip)}` +
    `C${pt(cR2)} ${pt(cR1)} ${pt(rootR)}Z`;

  return {
    fillD,
    tip,
    leftEdge: sampleCubicBezier(rootL, cL1, cL2, tip, 12),
    rightEdge: sampleCubicBezier(rootR, cR1, cR2, tip, 12),
    spine: sampleCubicBezier(root, mid1, mid2, tip, 12),
  };
}

/** Build a tapered width profile along `count` samples: razor tip -> mid swell -> razor tip. */
function makeContourWidths(count: number, peakW: number, startW = 0.15, endW = 0.15): number[] {
  const out: number[] = [];
  const last = Math.max(1, count - 1);
  for (let i = 0; i < count; i++) {
    const t = i / last;
    const bell = Math.sin(Math.PI * Math.pow(t, 0.85));
    out.push(lerp(t < 0.5 ? startW : endW, peakW, bell));
  }
  return out;
}

/** Render a single hair clump with fill, variable-weight left/right ink, and optional sheen streak. */
function renderClump(
  geom: HairClumpGeometry,
  opts: {
    fill: string;
    ink: string;
    leftInkW: number;
    rightInkW: number;
    sheenColor?: string;
    sheenWidth?: number;
    sheenOpacity?: number;
    silhouetteOnly: boolean;
  },
): string {
  const parts: string[] = [el('path', { d: geom.fillD, fill: opts.fill })];

  if (!opts.silhouetteOnly) {
    if (opts.sheenColor && opts.sheenWidth && opts.sheenWidth > 0.1) {
      const sPts = geom.spine.slice(2, 9);
      if (sPts.length >= 3) {
        parts.push(
          taperedInkRibbon(
            sPts,
            makeContourWidths(sPts.length, opts.sheenWidth, 0.12, 0.12),
            opts.sheenColor,
            opts.sheenOpacity ?? 0.52,
          ),
        );
      }
    }
    if (opts.leftInkW > 0.15) {
      parts.push(
        taperedInkRibbon(
          geom.leftEdge,
          makeContourWidths(geom.leftEdge.length, opts.leftInkW, 0.15, 0.15),
          opts.ink,
        ),
      );
    }
    if (opts.rightInkW > 0.15) {
      parts.push(
        taperedInkRibbon(
          geom.rightEdge,
          makeContourWidths(geom.rightEdge.length, opts.rightInkW, 0.15, 0.15),
          opts.ink,
        ),
      );
    }
  }

  return parts.join('');
}

/** Render a fine tapered stray/flyaway strand from a quadratic curve. */
function renderStrayWisp(
  p0: P2,
  p1: P2,
  p2: P2,
  peakW: number,
  color: string,
  opacity = 0.92,
): string {
  const pts = sampleQuadBezier(p0, p1, p2, 10);
  return taperedInkRibbon(pts, makeContourWidths(pts.length, peakW, 0.15, 0.15), color, opacity);
}

/** Build snug (1.04–1.07x) crown dome path + outer variable-weight contour. */
function buildCrownVolume(
  p3d: Hair3DProjection,
  isFemale: boolean,
  fill: string,
  shadeColor: string,
  ink: string,
  lw: number,
  silhouetteOnly: boolean,
): string {
  const { surf, proj, ry, yawDeg, yawT, nearAz, farAz, earTop } = p3d;
  const crownScale = isFemale ? 1.055 : 1.065;
  const topLift = isFemale ? 1.055 : 1.065;

  const backCraniumLow = surf(nearAz + 4, ry * 0.24, 1.05);
  const backLow = {
    x: Math.min(earTop.x - 3.5, backCraniumLow.x),
    y: Math.max(earTop.y + 8, backCraniumLow.y),
  };
  const backMid = surf(nearAz + 4, -ry * 0.36, 1.06);
  const backHigh = surf(nearAz + 10, -ry * 0.72, crownScale);
  const apex = proj(0, -ry * topLift, 0);
  const frontTop = surf(farAz - 16, -ry * 0.76, crownScale);
  const frontTemple = surf(farAz - 2, -ry * 0.36, 1.04);
  const hairlineMid = surf(lerp(0, 10, yawT), -ry * 0.52, 1.02);
  // Temple anchor tracks the ear across 0°..90° in SVG space (earTop.y ≈ -545)
  const sideburnAnchor = { x: earTop.x + lerp(7, 11, yawT), y: earTop.y + 5 };
  const nearTemple = { x: earTop.x + lerp(14, 20, yawT), y: earTop.y - 14 };

  const crownD =
    `M${pt(backLow)}` +
    `C${pt(backMid)} ${pt(backHigh)} ${pt(apex)}` +
    `C${pt(frontTop)} ${pt(surf(farAz - 6, -ry * 0.56, crownScale))} ${pt(frontTemple)}` +
    `Q${pt(hairlineMid)} ${pt(nearTemple)}` +
    `Q${fmt(earTop.x + lerp(11, 15, yawT))} ${fmt(earTop.y - 3)} ${pt(sideburnAnchor)}` +
    `Q${fmt(earTop.x + 2)} ${fmt(earTop.y - 3)} ${pt(backLow)}Z`;

  const parts: string[] = [el('path', { d: crownD, fill })];

  if (!silhouetteOnly) {
    // Cel-shaded shadow crescent along the back/near crown
    const shadeD =
      `M${pt(backLow)}` +
      `C${pt(backMid)} ${pt(backHigh)} ${pt(apex)}` +
      `C${pt(surf(lerp(nearAz, 0, 0.55), -ry * 0.88, 1.03))} ${pt(nearTemple)} ${pt(sideburnAnchor)}` +
      `Q${fmt(earTop.x + 2)} ${fmt(earTop.y - 3)} ${pt(backLow)}Z`;
    parts.push(el('path', { d: shadeD, fill: shadeColor, 'fill-opacity': 0.55 }));

    // Outer crown silhouette ink (tapered at temple & nape)
    const domePts = [
      ...sampleCubicBezier(backLow, backMid, backHigh, apex, 12),
      ...sampleCubicBezier(apex, frontTop, surf(farAz - 6, -ry * 0.56, crownScale), frontTemple, 12).slice(1),
    ];
    parts.push(
      taperedInkRibbon(
        domePts,
        makeContourWidths(domePts.length, lw * 1.15, 0.2, 0.2),
        ink,
      ),
    );
  }

  return parts.join('');
}

/**
 * Male (Lloyd-inspired) layered multi-clump hair:
 * - Tapered nape locks ending cleanly around collarY
 * - 6–8 asymmetric overlapping curved bangs sweeping across forehead/brow/bridge
 * - Layered sideburns framing earTop -> jawAngle
 * - Crown sheen arcs & fine stray wisps
 */
function renderMaleManhwaHair(opts: ManhwaHairOptions): { hairBackSvg: string; hairFrontSvg: string } {
  const { proj3d, hairFill, hairBase, hairDark, hairDeep, angelColor, ink, lw, silhouetteOnly } = opts;
  const { surf, proj, ry, rz, yawDeg, yawT, nearAz, farAz, earTop, jawAngle, collarY } = proj3d;

  const baseFill = silhouetteOnly ? hairFill : hairBase;
  const darkFill = silhouetteOnly ? hairFill : hairDark;
  const deepFill = silhouetteOnly ? hairFill : hairDeep;
  const midShade = silhouetteOnly ? hairFill : mix(hairBase, hairDark, 0.52);
  const sheen = lighten(angelColor, 0.25);

  // --- Depth 1: hairBackSvg (tapered nape locks ending cleanly around collarY) ---
  const backParts: string[] = [];
  {
    const napeEndY = collarY - 1;
    const napeRootTop = surf(nearAz + 18, -ry * 0.12, 0.94);
    const napeRootMid = surf(nearAz + 24, ry * 0.12, 0.96);
    const napeRootLow = surf(nearAz + 28, ry * 0.34, 0.96);

    // Outer deep nape silhouette lock
    const lock1 = buildHairClumpPath({
      root: napeRootTop,
      rootHalfW: lerp(4.2, 5.8, yawT),
      tip: { x: napeRootMid.x - lerp(2, 5, yawT), y: napeEndY + 2 },
      midOffset: -3.2,
      tipOffset: 1.6,
      bellyScale: 0.94,
    });
    backParts.push(
      renderClump(lock1, {
        fill: deepFill,
        ink,
        leftInkW: lw * 1.1,
        rightInkW: lw * 0.65,
        silhouetteOnly,
      }),
    );

    // Secondary overlapping nape lock
    const lock2 = buildHairClumpPath({
      root: napeRootMid,
      rootHalfW: lerp(4.8, 6.8, yawT),
      tip: { x: napeRootMid.x + lerp(6, 9, yawT), y: napeEndY - 2 },
      midOffset: -2.8,
      tipOffset: 2.2,
      bellyScale: 0.9,
    });
    backParts.push(
      renderClump(lock2, {
        fill: darkFill,
        ink,
        leftInkW: lw * 0.95,
        rightInkW: lw * 0.55,
        silhouetteOnly,
      }),
    );

    // Inner collar-grazing lock behind the ear
    const lock3 = buildHairClumpPath({
      root: napeRootLow,
      rootHalfW: 4.5,
      tip: { x: earTop.x - 3, y: napeEndY + 1 },
      midOffset: 2.4,
      tipOffset: -1.4,
      bellyScale: 0.85,
    });
    backParts.push(
      renderClump(lock3, {
        fill: darkFill,
        ink,
        leftInkW: lw * 0.85,
        rightInkW: lw * 0.5,
        silhouetteOnly,
      }),
    );

    // Far-side peek-out nape lock ONLY at near-frontal angles (yawDeg < 14) so it never hangs off the far cheek in 3/4!
    if (yawDeg < 14) {
      const farNape = surf(farAz - 16, ry * 0.22, 1.04);
      const lockFar = buildHairClumpPath({
        root: farNape,
        rootHalfW: 4.5,
        tip: { x: farNape.x - 1.5, y: napeEndY - 3 },
        midOffset: 2.2,
        tipOffset: -1.2,
        bellyScale: 0.86,
      });
      backParts.push(
        renderClump(lockFar, {
          fill: deepFill,
          ink,
          leftInkW: lw * 0.6,
          rightInkW: lw * 0.95,
          silhouetteOnly,
        }),
      );
    }
  }

  // --- Depth 2 & 3: hairFrontSvg (Crown Volume + Layered Sideburns + 7 Asymmetric Bangs + Wisps) ---
  const frontParts: string[] = [];

  // Depth 2: Snug crown volume
  frontParts.push(buildCrownVolume(proj3d, false, baseFill, darkFill, ink, lw, silhouetteOnly));

  // Layered sideburns rooted high inside the temple crown (using earTop.y in SVG space!)
  const nearSideRoot = { x: earTop.x + lerp(5, 8, yawT), y: earTop.y - 14 };
  const nearSideburn1 = buildHairClumpPath({
    root: nearSideRoot,
    rootHalfW: 5.8,
    tip: { x: lerp(earTop.x + 2, jawAngle.x, 0.55), y: Math.min(jawAngle.y - 1, earTop.y + 19) },
    midOffset: 2.2,
    tipOffset: -1.2,
    bellyScale: 0.92,
  });
  frontParts.push(
    renderClump(nearSideburn1, {
      fill: midShade,
      ink,
      leftInkW: lw * 0.85,
      rightInkW: lw * 0.78,
      sheenColor: sheen,
      sheenWidth: lw * 0.75,
      silhouetteOnly,
    }),
  );

  const nearSideburn2 = buildHairClumpPath({
    root: { x: earTop.x + lerp(10, 15, yawT), y: earTop.y - 18 },
    rootHalfW: 5.5,
    tip: { x: lerp(earTop.x + 6, jawAngle.x + 3, 0.75), y: Math.min(jawAngle.y + 1, earTop.y + 22) },
    midOffset: 1.8,
    tipOffset: -1.2,
    bellyScale: 0.88,
  });
  frontParts.push(
    renderClump(nearSideburn2, {
      fill: baseFill,
      ink,
      leftInkW: lw * 0.65,
      rightInkW: lw * 0.85,
      silhouetteOnly,
    }),
  );

  // Far-side temple framing lock (seated in backParts with yaw culling & anterior temple tip)
  if (yawDeg < 42) {
    const farSideRoot = surf(farAz - 12, -ry * 0.38, 1.04);
    const farSideTip = surf(farAz - 8, -ry * 0.08, 1.03);
    const farSideLock = buildHairClumpPath({
      root: farSideRoot,
      rootHalfW: lerp(4.2, 2.8, yawT),
      tip: { x: farSideTip.x + 1.5, y: farSideTip.y + 4 },
      midOffset: 1.8,
      tipOffset: -1.2,
      bellyScale: 0.86,
    });
    backParts.push(
      renderClump(farSideLock, {
        fill: midShade,
        ink,
        leftInkW: lw * 0.75,
        rightInkW: lw * 0.95,
        silhouetteOnly,
      }),
    );
  }

  // Temple transition clump bridging outer bangs to far temple
  if (yawDeg < 50) {
    const transRoot = surf(farAz - 28, -ry * 0.42, 1.03);
    const transTip = surf(farAz - 20, ry * 0.08, 1.04);
    const transLock = buildHairClumpPath({
      root: transRoot,
      rootHalfW: lerp(4.5, 2.5, yawT),
      tip: { x: transTip.x, y: transTip.y + 3 },
      midOffset: -1.8,
      tipOffset: 1.0,
      bellyScale: 0.82,
    });
    frontParts.push(
      renderClump(transLock, {
        fill: midShade,
        ink,
        leftInkW: lw * 0.65,
        rightInkW: lw * 0.65,
        silhouetteOnly,
      }),
    );
  }

  // 7 Asymmetric Overlapping Curved Bangs (Lloyd-inspired lush sweep across forehead/brow/bridge)
  const bangSpecs: Array<{
    rootAz: number;
    rootY: number;
    tipAz: number;
    tipY: number;
    halfW: number;
    midOff: number;
    tipOff: number;
    fill: string;
    sheenW: number;
  }> = [
    // Far-outer framing bang
    {
      rootAz: 42,
      rootY: -ry * 0.78,
      tipAz: 52,
      tipY: ry * 0.06,
      halfW: 7.2,
      midOff: -3.6,
      tipOff: 1.8,
      fill: midShade,
      sheenW: lw * 0.7,
    },
    // Far-brow sweeping lock
    {
      rootAz: 24,
      rootY: -ry * 0.82,
      tipAz: 34,
      tipY: ry * 0.02,
      halfW: 8.6,
      midOff: -4.2,
      tipOff: 2.0,
      fill: baseFill,
      sheenW: lw * 1.1,
    },
    // Right-of-bridge sharp S-lock (grazing brow)
    {
      rootAz: 8,
      rootY: -ry * 0.85,
      tipAz: 16,
      tipY: ry * 0.14,
      halfW: 8.4,
      midOff: -3.2,
      tipOff: 2.2,
      fill: baseFill,
      sheenW: lw * 1.25,
    },
    // Center-bridge hero lock (longest asymmetric sweep)
    {
      rootAz: -6,
      rootY: -ry * 0.86,
      tipAz: 4,
      tipY: ry * 0.18,
      halfW: 9.0,
      midOff: -3.8,
      tipOff: 2.5,
      fill: baseFill,
      sheenW: lw * 1.35,
    },
    // Left-brow overlapping shorter bang
    {
      rootAz: -22,
      rootY: -ry * 0.84,
      tipAz: -12,
      tipY: -ry * 0.02,
      halfW: 8.6,
      midOff: -2.8,
      tipOff: 1.6,
      fill: midShade,
      sheenW: lw * 0.95,
    },
    // Near-temple sweeping bang
    {
      rootAz: -38,
      rootY: -ry * 0.80,
      tipAz: -28,
      tipY: ry * 0.12,
      halfW: 9.2,
      midOff: 3.4,
      tipOff: -1.8,
      fill: baseFill,
      sheenW: lw * 1.05,
    },
    // Near-outer framing bang
    {
      rootAz: -52,
      rootY: -ry * 0.72,
      tipAz: -44,
      tipY: ry * 0.24,
      halfW: 7.8,
      midOff: 3.2,
      tipOff: -1.6,
      fill: darkFill,
      sheenW: lw * 0.65,
    },
  ];

  for (const b of bangSpecs) {
    const rPt = surf(b.rootAz, Math.max(b.rootY, -ry * 0.72), 1.015);
    const tPt = surf(b.tipAz, b.tipY, 1.05);
    const clump = buildHairClumpPath({
      root: rPt,
      rootHalfW: b.halfW,
      tip: tPt,
      midOffset: b.midOff,
      tipOffset: b.tipOff,
      bellyScale: 0.94,
    });
    frontParts.push(
      renderClump(clump, {
        fill: b.fill,
        ink,
        leftInkW: lw * 0.92,
        rightInkW: lw * 0.76,
        sheenColor: sheen,
        sheenWidth: b.sheenW,
        sheenOpacity: 0.55,
        silhouetteOnly,
      }),
    );
  }

  // Crown sheen halo + fine stray flyaway strands
  if (!silhouetteOnly) {
    const sheenArc = sampleQuadBezier(
      surf(-42, -ry * 0.68, 1.055),
      proj(0, -ry * 0.88, rz * 0.78),
      surf(38, -ry * 0.68, 1.055),
      14,
    );
    frontParts.push(
      taperedInkRibbon(
        sheenArc,
        makeContourWidths(sheenArc.length, lw * 2.2, 0.15, 0.15),
        sheen,
        0.58,
      ),
    );

    // Stray crown cowlick / flyaway wisps
    const crownTop = proj(0, -ry * 1.06, 0);
    frontParts.push(
      renderStrayWisp(
        { x: crownTop.x - 4, y: crownTop.y + 1 },
        { x: crownTop.x - 10, y: crownTop.y - 7 },
        { x: crownTop.x - 16, y: crownTop.y - 3 },
        lw * 0.75,
        ink,
      ),
    );
    frontParts.push(
      renderStrayWisp(
        { x: crownTop.x + 3, y: crownTop.y + 2 },
        { x: crownTop.x + 11, y: crownTop.y - 5 },
        { x: crownTop.x + 17, y: crownTop.y + 1 },
        lw * 0.65,
        ink,
      ),
    );
    // Forehead stray wisp
    const midTip = surf(4, ry * 0.22, 1.05);
    frontParts.push(
      renderStrayWisp(
        surf(-4, -ry * 0.3, 1.05),
        { x: midTip.x - 3, y: midTip.y - 6 },
        { x: midTip.x + 2, y: midTip.y + 4 },
        lw * 0.5,
        ink,
        0.85,
      ),
    );
  }

  return {
    hairBackSvg: backParts.join(''),
    hairFrontSvg: frontParts.join(''),
  };
}

/**
 * Female (Aria-inspired) silky layered multi-clump hair:
 * - Lush multi-clump flowing back hair cascading over the shoulders (or medium-layered fallback)
 * - Silky parted curtain bangs + delicate forehead wisps
 * - Layered cheek-hugging side locks framing jawAngle & chinPt
 * - Directional crown & cascade highlight streaks
 */
function renderFemaleManhwaHair(opts: ManhwaHairOptions): { hairBackSvg: string; hairFrontSvg: string } {
  const { proj3d, hairStyle, hairFill, hairBase, hairDark, hairDeep, angelColor, ink, lw, silhouetteOnly } = opts;
  const { surf, proj, rx, ry, rz, yawDeg, yawT, nearAz, farAz, earTop, jawAngle, chinPt, collarY } = proj3d;

  const baseFill = silhouetteOnly ? hairFill : hairBase;
  const darkFill = silhouetteOnly ? hairFill : hairDark;
  const deepFill = silhouetteOnly ? hairFill : hairDeep;
  const midShade = silhouetteOnly ? hairFill : mix(hairBase, hairDark, 0.45);
  const sheen = lighten(angelColor, 0.3);
  const isLongFlowing = hairStyle === 'long-flowing';
  const dropY = isLongFlowing ? collarY + 64 : collarY + 14;

  // --- Depth 1: hairBackSvg (lush multi-clump flowing back hair) ---
  const backParts: string[] = [];
  const napeL = surf(nearAz + 12, -ry * 0.45, 1.05);
  const napeR = surf(lerp(80, -28, yawT), -ry * 0.4, 1.05);
  const leftDropX = napeL.x - lerp(11, 16, yawT);
  const rightDropX = lerp(rx * 1.16, napeR.x + 4, clamp(yawDeg / 40, 0, 1));

  // Inner deep shadow mass behind neck/shoulders
  const innerMassD =
    `M${pt(napeL)}` +
    `C${fmt(napeL.x - 10)} ${fmt(napeL.y + 34)} ${fmt(leftDropX + 2)} ${fmt(collarY + 12)} ${fmt(leftDropX + 8)} ${fmt(dropY - 4)}` +
    `Q${fmt((leftDropX + rightDropX) * 0.5)} ${fmt(dropY - 12)} ${fmt(rightDropX - 6)} ${fmt(dropY - 2)}` +
    `C${fmt(rightDropX + 4)} ${fmt(collarY + 10)} ${fmt(napeR.x + 6)} ${fmt(napeR.y + 30)} ${pt(napeR)}Z`;
  backParts.push(el('path', { d: innerMassD, fill: deepFill }));

  // 4 overlapping flowing back hair clumps with organic tapered tips
  const backClumps: HairClumpParams[] = [
    {
      root: { x: napeL.x + 4, y: napeL.y + 8 },
      rootHalfW: 11,
      tip: { x: leftDropX + 1, y: dropY + 2 },
      midOffset: -7.5,
      tipOffset: 4.5,
      bellyScale: 1.05,
    },
    {
      root: { x: lerp(napeL.x, napeR.x, 0.32), y: napeL.y + 12 },
      rootHalfW: 12,
      tip: { x: lerp(leftDropX, rightDropX, 0.28), y: dropY + 7 },
      midOffset: -5.0,
      tipOffset: 3.5,
      bellyScale: 1.0,
    },
    {
      root: { x: lerp(napeL.x, napeR.x, 0.68), y: napeR.y + 12 },
      rootHalfW: 11.5,
      tip: { x: lerp(leftDropX, rightDropX, 0.72), y: dropY + 5 },
      midOffset: 5.5,
      tipOffset: -3.2,
      bellyScale: 1.0,
    },
    {
      root: { x: napeR.x - 3, y: napeR.y + 8 },
      rootHalfW: 10,
      tip: { x: rightDropX, y: dropY },
      midOffset: 7.0,
      tipOffset: -4.0,
      bellyScale: 1.02,
    },
  ];

  for (let i = 0; i < backClumps.length; i++) {
    const geom = buildHairClumpPath(backClumps[i]!);
    backParts.push(
      renderClump(geom, {
        fill: i === 0 || i === 3 ? darkFill : deepFill,
        ink,
        leftInkW: i === 0 ? lw * 1.15 : lw * 0.75,
        rightInkW: i === 3 ? lw * 1.1 : lw * 0.7,
        sheenColor: isLongFlowing ? mix(hairBase, sheen, 0.35) : undefined,
        sheenWidth: isLongFlowing ? lw * 1.0 : 0,
        sheenOpacity: 0.32,
        silhouetteOnly,
      }),
    );
  }

  // --- Depth 2 & 3: hairFrontSvg (Snug Crown + Curtain Bangs + Cheek-Hugging Side Locks + Wisps) ---
  const frontParts: string[] = [];

  // Depth 2: Snug crown volume
  frontParts.push(buildCrownVolume(proj3d, true, baseFill, darkFill, ink, lw, silhouetteOnly));

  // Cheek-hugging layered side locks (near side in front of ear & far side)
  const nearSideRoot = surf(-52, -ry * 0.34, 1.045);
  const nearSideInner = buildHairClumpPath({
    root: nearSideRoot,
    rootHalfW: 7.5,
    tip: { x: jawAngle.x - 2, y: chinPt.y + (isLongFlowing ? 24 : 8) },
    midOffset: -3.8,
    tipOffset: 3.2,
    bellyScale: 0.96,
  });
  frontParts.push(
    renderClump(nearSideInner, {
      fill: midShade,
      ink,
      leftInkW: lw * 1.0,
      rightInkW: lw * 0.82,
      sheenColor: sheen,
      sheenWidth: lw * 0.9,
      sheenOpacity: 0.48,
      silhouetteOnly,
    }),
  );

  const nearSideOuter = buildHairClumpPath({
    root: surf(-64, -ry * 0.28, 1.05),
    rootHalfW: 7.2,
    tip: { x: earTop.x - 10, y: collarY + (isLongFlowing ? 18 : 2) },
    midOffset: -5.2,
    tipOffset: 3.6,
    bellyScale: 0.95,
  });
  frontParts.push(
    renderClump(nearSideOuter, {
      fill: darkFill,
      ink,
      leftInkW: lw * 1.05,
      rightInkW: lw * 0.75,
      silhouetteOnly,
    }),
  );

  // Far-side cheek-hugging lock (moved to backParts with yaw culling & lateral temple tip)
  if (yawDeg < 38) {
    const farSideRoot = surf(farAz - 12, -ry * 0.36, 1.045);
    const farSideTip = surf(farAz - 10, -ry * 0.05, 1.04);
    const farSideLock = buildHairClumpPath({
      root: farSideRoot,
      rootHalfW: lerp(6.8, 4.2, yawT),
      tip: { x: farSideTip.x + 2, y: farSideTip.y + (isLongFlowing ? 18 : 4) },
      midOffset: -3.5,
      tipOffset: 2.8,
      bellyScale: 0.94,
    });
    backParts.push(
      renderClump(farSideLock, {
        fill: midShade,
        ink,
        leftInkW: lw * 0.8,
        rightInkW: lw * 1.0,
        sheenColor: sheen,
        sheenWidth: lw * 0.85,
        sheenOpacity: 0.45,
        silhouetteOnly,
      }),
    );
  }

  // Transition lock bridging curtain bangs to far temple
  if (yawDeg < 48) {
    const transRoot = surf(farAz - 24, -ry * 0.4, 1.03);
    const transTip = surf(farAz - 18, ry * 0.15, 1.04);
    const transLock = buildHairClumpPath({
      root: transRoot,
      rootHalfW: lerp(5.0, 3.0, yawT),
      tip: { x: transTip.x, y: transTip.y + 2 },
      midOffset: -2.0,
      tipOffset: 1.2,
      bellyScale: 0.85,
    });
    frontParts.push(
      renderClump(transLock, {
        fill: midShade,
        ink,
        leftInkW: lw * 0.7,
        rightInkW: lw * 0.7,
        sheenColor: sheen,
        sheenWidth: lw * 0.7,
        sheenOpacity: 0.4,
        silhouetteOnly,
      }),
    );
  }

  // Silky parted curtain bangs (asymmetric off-center part around theta = -4 deg, anchored high on crown)
  const partAz = lerp(-4, 6, yawT);
  const curtainSpecs: HairClumpParams[] = [
    // Left curtain main sweep
    {
      root: surf(partAz - 3, -ry * 0.72, 1.015),
      rootHalfW: 8.6,
      tip: surf(-48, ry * 0.16, 1.05),
      midOffset: 4.6,
      tipOffset: -2.6,
      bellyScale: 0.96,
    },
    // Left curtain upper-temple layer
    {
      root: surf(partAz - 16, -ry * 0.7, 1.015),
      rootHalfW: 7.6,
      tip: surf(-58, ry * 0.36, 1.045),
      midOffset: 3.8,
      tipOffset: -2.2,
      bellyScale: 0.92,
    },
    // Right curtain main sweep
    {
      root: surf(partAz + 4, -ry * 0.72, 1.015),
      rootHalfW: 8.2,
      tip: surf(44, ry * 0.14, 1.05),
      midOffset: -4.4,
      tipOffset: 2.5,
      bellyScale: 0.96,
    },
    // Right curtain outer-cheek layer
    {
      root: surf(partAz + 16, -ry * 0.68, 1.015),
      rootHalfW: 7.2,
      tip: surf(54, ry * 0.34, 1.045),
      midOffset: -3.6,
      tipOffset: 1.9,
      bellyScale: 0.9,
    },
  ];

  for (let i = 0; i < curtainSpecs.length; i++) {
    const geom = buildHairClumpPath(curtainSpecs[i]!);
    frontParts.push(
      renderClump(geom, {
        fill: i % 2 === 0 ? baseFill : midShade,
        ink,
        leftInkW: lw * 0.88,
        rightInkW: lw * 0.82,
        sheenColor: sheen,
        sheenWidth: lw * 1.1,
        sheenOpacity: 0.56,
        silhouetteOnly,
      }),
    );
  }

  // Delicate forehead wisps + crown angel-ring highlight + fine flyaways
  if (!silhouetteOnly) {
    // 2 delicate forehead wisps near the part
    const wisp1 = buildHairClumpPath({
      root: surf(partAz - 1, -ry * 0.66, 1.045),
      rootHalfW: 1.7,
      tip: surf(partAz - 10, -ry * 0.08, 1.04),
      midOffset: 2.0,
      tipOffset: -1.1,
      bellyScale: 0.78,
    });
    frontParts.push(
      renderClump(wisp1, {
        fill: baseFill,
        ink,
        leftInkW: lw * 0.65,
        rightInkW: lw * 0.55,
        silhouetteOnly,
      }),
    );

    const wisp2 = buildHairClumpPath({
      root: surf(partAz + 3, -ry * 0.65, 1.045),
      rootHalfW: 1.5,
      tip: surf(partAz + 12, -ry * 0.12, 1.04),
      midOffset: -1.8,
      tipOffset: 1.0,
      bellyScale: 0.75,
    });
    frontParts.push(
      renderClump(wisp2, {
        fill: baseFill,
        ink,
        leftInkW: lw * 0.55,
        rightInkW: lw * 0.65,
        silhouetteOnly,
      }),
    );

    // Silky crown angel-ring highlight arc
    const haloArc = sampleQuadBezier(
      surf(-46, -ry * 0.64, 1.055),
      proj(0, -ry * 0.86, rz * 0.8),
      surf(44, -ry * 0.64, 1.055),
      16,
    );
    frontParts.push(
      taperedInkRibbon(
        haloArc,
        makeContourWidths(haloArc.length, lw * 2.4, 0.15, 0.15),
        sheen,
        0.62,
      ),
    );

    // Fine stray flyaway strands near crown & shoulder
    const crownTop = proj(0, -ry * 1.055, 0);
    frontParts.push(
      renderStrayWisp(
        { x: crownTop.x - 6, y: crownTop.y + 2 },
        { x: crownTop.x - 14, y: crownTop.y - 5 },
        { x: crownTop.x - 21, y: crownTop.y + 2 },
        lw * 0.55,
        ink,
        0.85,
      ),
    );
    frontParts.push(
      renderStrayWisp(
        { x: nearSideInner.tip.x, y: nearSideInner.tip.y - 10 },
        { x: nearSideInner.tip.x - 5, y: nearSideInner.tip.y - 2 },
        { x: nearSideInner.tip.x - 2, y: nearSideInner.tip.y + 7 },
        lw * 0.48,
        ink,
        0.82,
      ),
    );
  }

  return {
    hairBackSvg: backParts.join(''),
    hairFrontSvg: frontParts.join(''),
  };
}

/**
 * Render 3-depth layered Manhwa hair (`hairBackSvg` + `hairFrontSvg`)
 * using overlapping S/C-curved clumps, variable-weight ink contours,
 * snug skull crown volume, and directional sheen highlights.
 */
export function renderManhwaHair3D(opts: ManhwaHairOptions): { hairBackSvg: string; hairFrontSvg: string } {
  if (opts.hairStyle === 'none' || opts.hairStyle === 'hooded-shadow') {
    return { hairBackSvg: '', hairFrontSvg: '' };
  }
  return opts.isFemale ? renderFemaleManhwaHair(opts) : renderMaleManhwaHair(opts);
}
