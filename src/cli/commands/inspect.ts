import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateEpisode } from '../../schema/index.js';
import { resolveTheme } from '../../templates/themes.js';
import { computeEpisodeLayout } from '../../engine/pacing-layout.js';
import { computeSmartSlices } from '../../engine/image-exporter.js';

export interface InspectCommandOptions {
  json?: boolean;
}

export function runInspect(filePath: string, opts: InspectCommandOptions): number {
  const full = resolve(filePath);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(full, 'utf8'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`✖ Failed to parse "${filePath}": ${msg}`);
    return 1;
  }

  const res = validateEpisode(raw);
  if (!res.success) {
    console.error(`✖ Invalid episode (${res.errors.length} error(s)):`);
    for (const e of res.errors) console.error(`  • ${e.path}: ${e.message}`);
    return 1;
  }

  const ep = res.data;
  const theme = resolveTheme(ep.theme, {
    backgroundColor: ep.canvas.backgroundColor,
    fontPreset: ep.canvas.fontPreset,
  });
  const layout = computeEpisodeLayout(ep, theme);
  const slices = computeSmartSlices(
    layout.totalHeight,
    ep.canvas.sliceMaxHeight,
    layout.gutterCutPoints,
    layout.protectedBands,
  );

  const pacingCounts: Record<string, number> = {};
  let totalBubbles = 0;
  let totalSfx = 0;
  let totalWords = 0;

  for (const p of ep.panels) {
    pacingCounts[p.pacingAfter] = (pacingCounts[p.pacingAfter] ?? 0) + 1;
    totalBubbles += p.bubbles.length;
    totalSfx += p.sfx.length;
    for (const b of p.bubbles) totalWords += b.text.trim().split(/\s+/).filter(Boolean).length;
  }

  // Average phone screen ~844px tall at 390px wide → ~1730px of 800px canvas height per screen.
  const mobileScreens = Number((layout.totalHeight / 1730).toFixed(1));

  const report = {
    title: ep.title,
    episodeNumber: ep.episodeNumber,
    theme: ep.theme,
    genre: ep.genre,
    cast: ep.cast.map((c) => ({ id: c.id, name: c.name, role: c.role, silhouette: c.silhouettePreset })),
    dimensions: {
      width: layout.width,
      totalHeight: layout.totalHeight,
      estimatedMobileScreens: mobileScreens,
    },
    counts: {
      panels: ep.panels.length,
      bubbles: totalBubbles,
      sfx: totalSfx,
      words: totalWords,
      estimatedSlices: slices.length,
    },
    pacingDistribution: pacingCounts,
    slices: slices.map((s) => ({ index: s.index, height: s.height, yStart: s.yStart, yEnd: s.yEnd, cutReason: s.cutReason })),
  };

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }

  console.log(`\n📖 ${ep.title} (Ep. ${ep.episodeNumber}) — [${ep.theme} / ${ep.genre}]`);
  console.log(`   Canvas: ${layout.width}×${layout.totalHeight}px (~${mobileScreens} mobile viewports)`);
  console.log(`   Panels: ${ep.panels.length} · Bubbles: ${totalBubbles} (${totalWords} words) · SFX: ${totalSfx}`);
  console.log(`   Cast (${ep.cast.length}): ${ep.cast.map((c) => `${c.name} (${c.id})`).join(', ') || 'none'}`);
  console.log(
    `   Pacing: ${Object.entries(pacingCounts)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}`,
  );
  console.log(`   Smart Slices (max ${ep.canvas.sliceMaxHeight}px): ${slices.length}`);
  for (const s of slices) {
    console.log(`     • slice-${String(s.index).padStart(3, '0')}: ${layout.width}×${s.height}px (y ${s.yStart}..${s.yEnd}, cut=${s.cutReason})`);
  }
  console.log('');
  return 0;
}
