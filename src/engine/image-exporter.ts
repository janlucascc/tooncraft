import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import sharp, { type OverlayOptions, type Sharp } from 'sharp';
import { getAllFontPaths } from '../components/font-metrics.js';
import { parseColor } from '../components/svg-utils.js';
import type { ComposedEpisode } from './composer.js';
import type { ProtectedBand } from './pacing-layout.js';

export type ImageFormat = 'png' | 'webp';
export type ExportMode = 'sliced' | 'strip' | 'both';

export interface SliceRange {
  index: number;
  yStart: number;
  yEnd: number;
  height: number;
  cutReason: 'end' | 'gutter' | 'clear-band' | 'max-height';
}

export interface ExportedSlice {
  index: number;
  filename: string;
  width: number;
  height: number;
  yStart: number;
  yEnd: number;
  cutReason: SliceRange['cutReason'];
  sha256: string;
  buffer: Buffer;
}

export interface ExportResult {
  width: number;
  totalHeight: number;
  format: ImageFormat;
  slices: ExportedSlice[];
  strip?: { filename: string; width: number; height: number; sha256: string; buffer: Buffer };
  manifestPath?: string;
}

export interface ExportImageOptions {
  format?: ImageFormat;
  mode?: ExportMode;
  /** Override `episode.canvas.sliceMaxHeight` (default 1280px). */
  maxSliceHeight?: number;
  /** WebP quality 1–100 (default 90). */
  quality?: number;
  /** When set, writes slice files, strip and `manifest.json` to disk. */
  outDir?: string;
}

function insideAnyBand(y: number, bands: readonly ProtectedBand[]): boolean {
  for (const b of bands) {
    if (y > b.yStart && y < b.yEnd) return true;
  }
  return false;
}

/**
 * Smart Slicer: splits a vertical strip of height `totalHeight` into slices
 * `<= maxSliceHeight`, preferring gutter midpoints first, then bubble/SFX-free
 * horizontal bands inside tall panels, falling back to `maxSliceHeight` only if
 * no clear line exists.
 */
export function computeSmartSlices(
  totalHeight: number,
  maxSliceHeight: number,
  gutterCutPoints: readonly number[],
  protectedBands: readonly ProtectedBand[],
): SliceRange[] {
  if (totalHeight <= 0) return [];
  const slices: SliceRange[] = [];
  const minSlice = Math.max(200, Math.round(maxSliceHeight * 0.35));
  let y = 0;
  let index = 1;

  while (y < totalHeight) {
    if (totalHeight - y <= maxSliceHeight) {
      slices.push({ index, yStart: y, yEnd: totalHeight, height: totalHeight - y, cutReason: 'end' });
      break;
    }

    const hardMax = y + maxSliceHeight;
    const minCut = y + minSlice;

    // 1. Prefer the lowest gutter midpoint that fits inside [minCut, hardMax].
    let chosen: number | undefined;
    for (const g of gutterCutPoints) {
      if (g >= minCut && g <= hardMax) chosen = g;
    }
    if (chosen !== undefined) {
      slices.push({ index, yStart: y, yEnd: chosen, height: chosen - y, cutReason: 'gutter' });
      y = chosen;
      index += 1;
      continue;
    }

    // 2. Scan upward from hardMax for a horizontal line clear of every bubble/SFX.
    let clearY: number | undefined;
    for (let cand = hardMax; cand >= minCut; cand -= 8) {
      if (!insideAnyBand(cand, protectedBands)) {
        clearY = cand;
        break;
      }
    }
    if (clearY !== undefined) {
      slices.push({ index, yStart: y, yEnd: clearY, height: clearY - y, cutReason: 'clear-band' });
      y = clearY;
      index += 1;
      continue;
    }

    // 3. Last resort: cut cleanly at maxSliceHeight.
    slices.push({ index, yStart: y, yEnd: hardMax, height: maxSliceHeight, cutReason: 'max-height' });
    y = hardMax;
    index += 1;
  }

  return slices;
}

/** Rasterize one SVG string to PNG buffer using the bundled OFL fonts. */
export function rasterizeSvgToPng(svg: string, width?: number): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: width ? { mode: 'width', value: width } : undefined,
    font: {
      fontFiles: getAllFontPaths(),
      loadSystemFonts: false,
      defaultFontFamily: 'Noto Sans',
    },
  });
  return Buffer.from(resvg.render().asPng());
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

async function encodeImage(pipeline: Sharp, format: ImageFormat, quality: number): Promise<Buffer> {
  if (format === 'webp') return pipeline.webp({ quality }).toBuffer();
  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}

/**
 * Rasterize a composed episode with `@resvg/resvg-js` + `sharp`, exporting
 * smart-sliced Webtoon blocks (`<= 800×1280`), a single continuous strip, or both.
 */
export async function exportToImages(
  composed: ComposedEpisode,
  options: ExportImageOptions = {},
): Promise<ExportResult> {
  const format: ImageFormat = options.format ?? 'webp';
  const mode: ExportMode = options.mode ?? 'sliced';
  const quality = options.quality ?? 90;
  const maxSliceHeight = options.maxSliceHeight ?? composed.episode.canvas.sliceMaxHeight;
  const { width, totalHeight } = composed.layout;

  // Rasterize every panel and non-empty gutter into composite inputs.
  const composites: OverlayOptions[] = [];
  for (const p of composed.panels) {
    composites.push({
      input: rasterizeSvgToPng(p.svg, width),
      left: 0,
      top: p.layout.yStart,
    });
    if (p.gutterAfter && p.gutterAfter.layout.height > 0 && p.gutterAfter.svg) {
      composites.push({
        input: rasterizeSvgToPng(p.gutterAfter.svg, width),
        left: 0,
        top: p.gutterAfter.layout.yStart,
      });
    }
  }

  const bg = parseColor(composed.theme.scrollBackground);
  const safePixelLimit = Math.max(268_402_689, width * totalHeight * 2);
  // Build raw RGBA buffer once so strip and all slices share a single composite pass.
  const rawComposite = await sharp({
    create: {
      width,
      height: totalHeight,
      channels: 4,
      background: { r: bg.r, g: bg.g, b: bg.b, alpha: 1 },
    },
    limitInputPixels: safePixelLimit,
  })
    .composite(composites)
    .raw()
    .toBuffer();

  const rawInfo = { width, height: totalHeight, channels: 4 as const };
  const ext = format;
  const slices: ExportedSlice[] = [];
  let strip: ExportResult['strip'];

  if (options.outDir) mkdirSync(options.outDir, { recursive: true });

  if (mode === 'strip' || mode === 'both') {
    const buf = await encodeImage(
      sharp(rawComposite, { raw: rawInfo, limitInputPixels: safePixelLimit }),
      format,
      quality,
    );
    const filename = `strip.${ext}`;
    if (options.outDir) writeFileSync(join(options.outDir, filename), buf);
    strip = { filename, width, height: totalHeight, sha256: sha256(buf), buffer: buf };
  }

  if (mode === 'sliced' || mode === 'both') {
    const ranges = computeSmartSlices(
      totalHeight,
      maxSliceHeight,
      composed.layout.gutterCutPoints,
      composed.layout.protectedBands,
    );

    for (const r of ranges) {
      const buf = await encodeImage(
        sharp(rawComposite, { raw: rawInfo, limitInputPixels: safePixelLimit }).extract({
          left: 0,
          top: r.yStart,
          width,
          height: r.height,
        }),
        format,
        quality,
      );
      const filename = `slice-${String(r.index).padStart(3, '0')}.${ext}`;
      if (options.outDir) writeFileSync(join(options.outDir, filename), buf);
      slices.push({
        index: r.index,
        filename,
        width,
        height: r.height,
        yStart: r.yStart,
        yEnd: r.yEnd,
        cutReason: r.cutReason,
        sha256: sha256(buf),
        buffer: buf,
      });
    }
  }

  let manifestPath: string | undefined;
  if (options.outDir) {
    manifestPath = join(options.outDir, 'manifest.json');
    const manifest = {
      title: composed.episode.title,
      episodeNumber: composed.episode.episodeNumber,
      format,
      mode,
      width,
      totalHeight,
      panelCount: composed.panels.length,
      strip: strip
        ? { filename: strip.filename, width: strip.width, height: strip.height, sha256: strip.sha256 }
        : undefined,
      slices: slices.map((s) => ({
        index: s.index,
        filename: s.filename,
        width: s.width,
        height: s.height,
        yStart: s.yStart,
        yEnd: s.yEnd,
        cutReason: s.cutReason,
        sha256: s.sha256,
      })),
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }

  return { width, totalHeight, format, slices, strip, manifestPath };
}
