import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateEpisode } from '../../schema/index.js';
import { sanitizeSvgMarkup } from '../../components/scenes/svg-sanitizer.js';

export interface ValidateCommandOptions {
  strictSvg?: boolean;
  json?: boolean;
}

export function runValidate(filePath: string, opts: ValidateCommandOptions): number {
  const full = resolve(filePath);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(full, 'utf8'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      console.log(JSON.stringify({ valid: false, file: full, errors: [{ path: '(json)', message: msg, code: 'parse_error' }], svgWarnings: [] }, null, 2));
    } else {
      console.error(`✖ Failed to parse JSON "${filePath}": ${msg}`);
    }
    return 1;
  }

  const res = validateEpisode(raw);
  if (!res.success) {
    if (opts.json) {
      console.log(JSON.stringify({ valid: false, file: full, errors: res.errors, svgWarnings: [] }, null, 2));
    } else {
      console.error(`✖ Validation failed for "${filePath}" (${res.errors.length} error${res.errors.length === 1 ? '' : 's'}):`);
      for (const e of res.errors) console.error(`  • ${e.path}: ${e.message}`);
    }
    return 1;
  }

  const svgWarnings: Array<{ panelId: string; layerIndex: number; warning: string }> = [];
  for (const panel of res.data.panels) {
    panel.layers.forEach((layer, idx) => {
      if (layer.type === 'svg_raw') {
        const s = sanitizeSvgMarkup(layer.svgMarkup);
        for (const w of s.warnings) svgWarnings.push({ panelId: panel.id, layerIndex: idx, warning: w });
      } else if (layer.type === 'character_figure' && layer.detailOverlaySvg) {
        const s = sanitizeSvgMarkup(layer.detailOverlaySvg);
        for (const w of s.warnings) svgWarnings.push({ panelId: panel.id, layerIndex: idx, warning: w });
      }
    });
  }

  const failedStrict = Boolean(opts.strictSvg && svgWarnings.length > 0);
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          valid: !failedStrict,
          file: full,
          title: res.data.title,
          panels: res.data.panels.length,
          cast: res.data.cast.length,
          errors: [],
          svgWarnings,
        },
        null,
        2,
      ),
    );
  } else if (failedStrict) {
    console.error(`✖ Strict SVG validation failed for "${filePath}" (${svgWarnings.length} warning(s)):`);
    for (const w of svgWarnings) console.error(`  • panel "${w.panelId}" layer[${w.layerIndex}]: ${w.warning}`);
  } else {
    console.log(`✔ Valid episode: "${res.data.title}" (${res.data.panels.length} panels, ${res.data.cast.length} cast members)`);
    if (svgWarnings.length) {
      console.warn(`⚠ ${svgWarnings.length} svg_raw sanitizer warning(s):`);
      for (const w of svgWarnings) console.warn(`  • panel "${w.panelId}" layer[${w.layerIndex}]: ${w.warning}`);
    }
  }

  return failedStrict ? 1 : 0;
}
