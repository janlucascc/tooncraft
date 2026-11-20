/**
 * Fase 2 — Variable-Weight Manhwa Ink & Tapered Ribbon Primitives.
 *
 * Pure SVG geometry (zero uniform `stroke`, zero nested `<clipPath>`, @resvg/resvg-js safe).
 * Every ink line is rendered as a closed, variable-width filled `<path>` that tapers
 * to razor-sharp tips (`~0.15px`) at endpoints and swells along curves/shadows.
 */

import { el, fmt } from '../components/svg-utils.js';

/** 2D point in SVG user space. */
export interface P2 {
  x: number;
  y: number;
}

/** Quadratic or cubic Bezier segment with per-endpoint and midpoint ink widths. */
export interface VariableInkSegment {
  p0: P2;
  p1: P2;
  p2: P2;
  /** Optional third control point; when present the segment is evaluated as a cubic Bezier. */
  p3?: P2;
  wStart: number;
  wMid: number;
  wEnd: number;
}

function dist(a: P2, b: P2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function deduplicatePoints(pts: readonly P2[], widths: readonly number[]): { pts: P2[]; widths: number[] } {
  const outPts: P2[] = [];
  const outW: number[] = [];
  const lastW = widths.length > 0 ? widths[widths.length - 1]! : 0.5;

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const w = widths[i] ?? lastW;
    const prev = outPts[outPts.length - 1];
    if (!prev || dist(prev, p) > 1e-3) {
      outPts.push(p);
      outW.push(Math.max(0.08, w));
    }
  }
  return { pts: outPts, widths: outW };
}

/**
 * Sample a quadratic Bezier curve `p0 -> p1 -> p2` into `steps + 1` points.
 */
export function sampleQuadBezier(p0: P2, p1: P2, p2: P2, steps = 12): P2[] {
  const n = Math.max(2, Math.round(steps));
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
  return out;
}

/**
 * Sample a cubic Bezier curve `p0 -> p1 -> p2 -> p3` into `steps + 1` points.
 */
export function sampleCubicBezier(p0: P2, p1: P2, p2: P2, p3: P2, steps = 16): P2[] {
  const n = Math.max(2, Math.round(steps));
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const u2 = u * u;
    const t2 = t * t;
    out.push({
      x: u2 * u * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t2 * t * p3.x,
      y: u2 * u * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t2 * t * p3.y,
    });
  }
  return out;
}

/**
 * Build a closed filled SVG `<path>` with variable thickness along `pts` (zero uniform `stroke`).
 * Endpoints naturally support razor-sharp tips (e.g. `0.15`), thickening along curves/shadows.
 */
export function taperedInkRibbon(
  pts: readonly P2[],
  widths: readonly number[],
  color: string,
  opacity?: number,
): string {
  const clean = deduplicatePoints(pts, widths);
  const cPts = clean.pts;
  const cW = clean.widths;
  const count = cPts.length;
  if (count < 2) return '';

  const left: P2[] = [];
  const right: P2[] = [];

  const rawTangents: P2[] = [];

  for (let i = 0; i < count; i++) {
    const p = cPts[i]!;
    let tx = 0;
    let ty = 0;

    if (i === 0) {
      if (count >= 3) {
        const p1 = cPts[1]!;
        const p2 = cPts[2]!;
        tx = -3 * p.x + 4 * p1.x - p2.x;
        ty = -3 * p.y + 4 * p1.y - p2.y;
      } else {
        const p1 = cPts[1]!;
        tx = p1.x - p.x;
        ty = p1.y - p.y;
      }
    } else if (i === count - 1) {
      if (count >= 3) {
        const pm1 = cPts[count - 2]!;
        const pm2 = cPts[count - 3]!;
        tx = 3 * p.x - 4 * pm1.x + pm2.x;
        ty = 3 * p.y - 4 * pm1.y + pm2.y;
      } else {
        const pm1 = cPts[count - 2]!;
        tx = p.x - pm1.x;
        ty = p.y - pm1.y;
      }
    } else {
      const prev = cPts[i - 1]!;
      const next = cPts[i + 1]!;
      tx = next.x - prev.x;
      ty = next.y - prev.y;
    }

    const len = Math.hypot(tx, ty);
    if (len < 1e-6) {
      tx = 1;
      ty = 0;
    } else {
      tx /= len;
      ty /= len;
    }
    rawTangents.push({ x: tx, y: ty });
  }

  for (let i = 0; i < count; i++) {
    const p = cPts[i]!;
    let tx = rawTangents[i]!.x;
    let ty = rawTangents[i]!.y;

    // Smooth interior tangents across segment joints so C0 kinks never produce overlap/gap wedges
    if (i > 0 && i < count - 1) {
      const tPrev = rawTangents[i - 1]!;
      const tNext = rawTangents[i + 1]!;
      const sx = 0.25 * tPrev.x + 0.5 * tx + 0.25 * tNext.x;
      const sy = 0.25 * tPrev.y + 0.5 * ty + 0.25 * tNext.y;
      const sLen = Math.hypot(sx, sy);
      if (sLen > 1e-6) {
        tx = sx / sLen;
        ty = sy / sLen;
      }
    }

    // Left-hand unit normal
    const nx = -ty;
    const ny = tx;
    const halfW = (cW[i] ?? 0.15) * 0.5;

    left.push({ x: p.x + nx * halfW, y: p.y + ny * halfW });
    right.push({ x: p.x - nx * halfW, y: p.y - ny * halfW });
  }

  // Trace forward along left rail, then backward along right rail to form a closed ribbon.
  let d = `M${fmt(left[0]!.x)} ${fmt(left[0]!.y)}`;
  for (let i = 1; i < count; i++) {
    d += `L${fmt(left[i]!.x)} ${fmt(left[i]!.y)}`;
  }
  for (let i = count - 1; i >= 0; i--) {
    d += `L${fmt(right[i]!.x)} ${fmt(right[i]!.y)}`;
  }
  d += 'Z';

  return el('path', {
    d,
    fill: color,
    'fill-opacity': opacity,
  });
}

/**
 * Compute a smooth quadratic width interpolation across `t in [0, 1]`
 * passing through `(0, wStart)`, `(0.5, wMid)`, `(1, wEnd)`.
 */
function evalQuadWidth(wStart: number, wMid: number, wEnd: number, t: number): number {
  const w = (1 - t) * (1 - 2 * t) * wStart + 4 * t * (1 - t) * wMid + t * (2 * t - 1) * wEnd;
  return Math.max(0.08, w);
}

/**
 * Convert an array of quadratic or cubic Bezier segments with per-segment width
 * profiles into a single crisp variable-weight filled ink `<path>`.
 */
export function variableStrokeFromSegments(
  segments: readonly VariableInkSegment[],
  color: string,
  opacity?: number,
  stepsPerSeg = 14,
): string {
  if (segments.length === 0) return '';

  const allPts: P2[] = [];
  const allWidths: number[] = [];

  for (let sIdx = 0; sIdx < segments.length; sIdx++) {
    const seg = segments[sIdx]!;
    const sampled = seg.p3
      ? sampleCubicBezier(seg.p0, seg.p1, seg.p2, seg.p3, stepsPerSeg)
      : sampleQuadBezier(seg.p0, seg.p1, seg.p2, stepsPerSeg);

    const n = sampled.length - 1;
    const startIdx = sIdx === 0 ? 0 : 1;
    for (let i = startIdx; i <= n; i++) {
      const t = n > 0 ? i / n : 0;
      allPts.push(sampled[i]!);
      allWidths.push(evalQuadWidth(seg.wStart, seg.wMid, seg.wEnd, t));
    }
  }

  return taperedInkRibbon(allPts, allWidths, color, opacity);
}
