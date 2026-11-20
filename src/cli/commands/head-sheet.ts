import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { getAllFontPaths } from '../../components/font-metrics.js';
import {
  DEFAULT_HEAD_SHEET_ANGLES,
  HEAD_SHEET_PRESETS,
  composeHeadSheetSvg,
  composeSinglePortraitSvg,
} from '../../engine/head-sheet.js';

export interface HeadSheetCliOptions {
  preset: string;
  out: string;
  ref?: string;
  yaw?: number;
  json?: boolean;
}

function rasterizeSvg(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'original' },
    font: {
      fontFiles: getAllFontPaths(),
      loadSystemFonts: false,
      defaultFontFamily: 'Noto Sans',
    },
  });
  return Buffer.from(resvg.render().asPng());
}

export async function runHeadSheet(opts: HeadSheetCliOptions): Promise<number> {
  const preset = HEAD_SHEET_PRESETS[opts.preset];
  if (!preset) {
    console.error(
      `✖ Unknown preset "${opts.preset}". Available presets: ${Object.keys(HEAD_SHEET_PRESETS).join(', ')}`,
    );
    return 1;
  }

  const outDir = path.resolve(opts.out);
  fs.mkdirSync(outDir, { recursive: true });

  const start = Date.now();
  const sheet = composeHeadSheetSvg({ preset, angles: DEFAULT_HEAD_SHEET_ANGLES });
  const svgPath = path.join(outDir, `head-sheet-${preset.id}.svg`);
  const pngPath = path.join(outDir, `head-sheet-${preset.id}.png`);
  fs.writeFileSync(svgPath, sheet.svg, 'utf8');
  const pngBuf = rasterizeSvg(sheet.svg);
  fs.writeFileSync(pngPath, pngBuf);

  const files: string[] = [pngPath, svgPath];

  // Optional side-by-side comparison against a reference image at matching scale
  if (opts.ref) {
    const refAbs = path.resolve(opts.ref);
    if (!fs.existsSync(refAbs)) {
      console.error(`✖ Reference image not found: ${refAbs}`);
      return 1;
    }
    const panelSize = 512;
    const gap = 16;
    const pad = 20;
    const headerH = 40;
    const refBuf = await sharp(refAbs)
      .resize(panelSize, panelSize, { fit: 'cover', position: 'attention' })
      .png()
      .toBuffer();

    const portraitSvg = composeSinglePortraitSvg(preset, opts.yaw ?? 34, panelSize, panelSize, false);
    const portraitBuf = rasterizeSvg(portraitSvg);

    const totalW = pad * 2 + panelSize * 2 + gap;
    const totalH = headerH + panelSize + pad;

    const headerSvg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">` +
      `<rect width="${totalW}" height="${totalH}" fill="#090D16"/>` +
      `<text x="${pad}" y="27" fill="#94A3B8" font-family="sans-serif" font-size="15" font-weight="700">REFERENCE</text>` +
      `<text x="${pad + panelSize + gap}" y="27" fill="#38BDF8" font-family="sans-serif" font-size="15" font-weight="700">TOONCRAFT 3D RIG (${opts.yaw ?? 34}°)</text>` +
      `</svg>`;
    const baseBuf = rasterizeSvg(headerSvg);

    const comparePath = path.join(outDir, `compare-${preset.id}.png`);
    await sharp(baseBuf)
      .composite([
        { input: refBuf, left: pad, top: headerH },
        { input: portraitBuf, left: pad + panelSize + gap, top: headerH },
      ])
      .png()
      .toFile(comparePath);
    files.push(comparePath);
  }

  const ms = Date.now() - start;
  if (opts.json) {
    console.log(JSON.stringify({ preset: preset.id, width: sheet.width, height: sheet.height, ms, files }, null, 2));
  } else {
    console.log(`✔ Generated head-sheet "${preset.id}" (${sheet.width}×${sheet.height}px) in ${ms}ms`);
    for (const f of files) {
      console.log(`  → ${f}`);
    }
  }
  return 0;
}
