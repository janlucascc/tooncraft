import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { composeEpisode, ToonCraftValidationError } from '../../engine/composer.js';
import { renderToHtml } from '../../engine/html-renderer.js';
import { type ExportMode, type ImageFormat, exportToImages } from '../../engine/image-exporter.js';

export type RenderFormatOption = 'html' | 'png' | 'webp' | 'all';

export interface RenderCommandOptions {
  format: RenderFormatOption;
  mode: ExportMode;
  out: string;
  embedFonts?: boolean;
  allowImages?: boolean;
  json?: boolean;
}

export async function runRender(filePath: string, opts: RenderCommandOptions): Promise<number> {
  const start = performance.now();
  const full = resolve(filePath);
  const outDir = resolve(opts.out);

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(full, 'utf8'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`✖ Failed to read/parse "${filePath}": ${msg}`);
    return 1;
  }

  let composed;
  try {
    composed = composeEpisode(raw, {
      baseDir: dirname(full),
      allowImages: opts.allowImages,
    });
  } catch (err) {
    if (err instanceof ToonCraftValidationError) {
      if (opts.json) console.log(JSON.stringify({ ok: false, errors: err.issues }, null, 2));
      else console.error(`✖ ${err.message}`);
      return 1;
    }
    throw err;
  }

  mkdirSync(outDir, { recursive: true });
  const generated: string[] = [];

  if (opts.format === 'html' || opts.format === 'all') {
    const htmlPath = join(outDir, 'index.html');
    const html = renderToHtml(composed, { embedFonts: opts.embedFonts ?? true });
    writeFileSync(htmlPath, html, 'utf8');
    generated.push(htmlPath);
  }

  const imageFormats: ImageFormat[] =
    opts.format === 'all'
      ? ['webp', 'png']
      : opts.format === 'png' || opts.format === 'webp'
        ? [opts.format]
        : [];

  const sliceSummary: Record<string, number> = {};
  for (const fmt of imageFormats) {
    const targetDir = imageFormats.length > 1 ? join(outDir, fmt) : outDir;
    const res = await exportToImages(composed, {
      format: fmt,
      mode: opts.mode,
      outDir: targetDir,
    });
    if (res.strip) generated.push(join(targetDir, res.strip.filename));
    for (const s of res.slices) generated.push(join(targetDir, s.filename));
    if (res.manifestPath) generated.push(res.manifestPath);
    sliceSummary[fmt] = res.slices.length;
  }

  const elapsedMs = Math.round(performance.now() - start);
  const summary = {
    ok: true,
    title: composed.episode.title,
    panels: composed.panels.length,
    width: composed.layout.width,
    totalHeight: composed.layout.totalHeight,
    slices: sliceSummary,
    elapsedMs,
    warnings: composed.warnings,
    files: generated,
  };

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(
      `✔ Rendered "${composed.episode.title}" (${composed.panels.length} panels, ${composed.layout.width}×${composed.layout.totalHeight}px) in ${elapsedMs}ms`,
    );
    for (const f of generated) console.log(`  → ${f}`);
    if (composed.warnings.length) {
      console.warn(`⚠ ${composed.warnings.length} warning(s):`);
      for (const w of composed.warnings) console.warn(`  • ${w}`);
    }
  }

  return 0;
}
