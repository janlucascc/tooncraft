import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { composeEpisode } from '../src/engine/composer.js';
import { renderToHtml } from '../src/engine/html-renderer.js';
import { exportToImages } from '../src/engine/image-exporter.js';

describe('end-to-end composer, HTML reader & image exporter', () => {
  it('composes 01-action-duel to standalone HTML and 800px smart-sliced PNG/WebP buffers', async () => {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), 'examples', '01-action-duel', 'story.json'), 'utf8'),
    );
    const composed = composeEpisode(raw);
    expect(composed.panels).toHaveLength(5);
    expect(composed.warnings).toEqual([]);

    const html = renderToHtml(composed, { embedFonts: false });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Neon Blade: Sector 9');
    expect(html).toContain('Director Inspector');

    const exported = await exportToImages(composed, { format: 'webp', mode: 'both' });
    expect(exported.slices.length).toBeGreaterThanOrEqual(3);
    expect(exported.strip).toBeDefined();

    // Verify real raster dimensions through sharp metadata.
    const stripMeta = await sharp(exported.strip!.buffer).metadata();
    expect(stripMeta.width).toBe(800);
    expect(stripMeta.height).toBe(composed.layout.totalHeight);

    let summedHeight = 0;
    for (const s of exported.slices) {
      const meta = await sharp(s.buffer).metadata();
      expect(meta.width).toBe(800);
      expect(meta.height).toBe(s.height);
      expect(meta.height!).toBeLessThanOrEqual(1280);
      summedHeight += meta.height!;
    }
    expect(summedHeight).toBe(composed.layout.totalHeight);
  });

  it('renders deterministically (identical SVG and PNG hash for the same seed)', async () => {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), 'examples', '03-system-awakening', 'story.json'), 'utf8'),
    );
    const a = composeEpisode(raw);
    const b = composeEpisode(raw);
    expect(a.panels.map((p) => p.svg)).toEqual(b.panels.map((p) => p.svg));

    const imgA = await exportToImages(a, { format: 'png', mode: 'sliced' });
    const imgB = await exportToImages(b, { format: 'png', mode: 'sliced' });
    expect(imgA.slices.map((s) => s.sha256)).toEqual(imgB.slices.map((s) => s.sha256));
  });
});
