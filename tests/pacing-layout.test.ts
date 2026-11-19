import { describe, expect, it } from 'vitest';
import { WebtoonEpisodeSchema } from '../src/schema/story.js';
import { resolveTheme } from '../src/templates/themes.js';
import { PACING_PX, computeEpisodeLayout } from '../src/engine/pacing-layout.js';
import { computeSmartSlices } from '../src/engine/image-exporter.js';

describe('pacing-layout & smart-slicer', () => {
  it('computes cumulative Y offsets, gutter cut points and total height', () => {
    const ep = WebtoonEpisodeSchema.parse({
      title: 'Layout Test',
      panels: [
        {
          id: 'p1',
          height: 500,
          layers: [{ type: 'backdrop', kind: 'solid', colors: ['#000'] }],
          pacingAfter: 'tight',
        },
        {
          id: 'p2',
          height: 600,
          layers: [{ type: 'backdrop', kind: 'solid', colors: ['#111'] }],
          pacingAfter: 'dramatic_pause',
        },
        {
          id: 'p3',
          height: 700,
          layers: [{ type: 'backdrop', kind: 'solid', colors: ['#222'] }],
          pacingAfter: 'normal',
        },
      ],
    });
    const layout = computeEpisodeLayout(ep, resolveTheme(ep.theme), { topPadding: 20, bottomPadding: 40 });
    expect(layout.panels[0]!.yStart).toBe(20);
    expect(layout.panels[0]!.yEnd).toBe(520);
    expect(layout.panels[1]!.yStart).toBe(520 + PACING_PX.tight);
    expect(layout.panels[2]!.yStart).toBe(520 + PACING_PX.tight + 600 + PACING_PX.dramatic_pause);
    expect(layout.totalHeight).toBe(layout.panels[2]!.yEnd + 40);
    expect(layout.gutterCutPoints).toEqual([520 + 8, 520 + 16 + 600 + 160]);
  });

  it('nudges overlapping speech bubbles downward inside the same panel', () => {
    const ep = WebtoonEpisodeSchema.parse({
      title: 'Overlap Test',
      panels: [
        {
          id: 'p1',
          height: 600,
          layers: [{ type: 'backdrop', kind: 'solid', colors: ['#000'] }],
          bubbles: [
            { id: 'b1', text: 'First bubble right here', position: { x: 50, y: 25 } },
            { id: 'b2', text: 'Second bubble accidentally placed on top', position: { x: 50, y: 27 } },
          ],
        },
      ],
    });
    const layout = computeEpisodeLayout(ep, resolveTheme(ep.theme));
    const m1 = layout.panels[0]!.bubbles.get('b1')!;
    const m2 = layout.panels[0]!.bubbles.get('b2')!;
    expect(m2.y).toBeGreaterThanOrEqual(m1.y + m1.height);
  });

  it('smart-slices preferentially at gutter midpoints and avoids protected text bands', () => {
    // Strip 2600px tall, max slice 1280px, gutter midpoint at 1050px.
    const slices = computeSmartSlices(2600, 1280, [1050, 2100], [{ yStart: 1200, yEnd: 1320, reason: 'bubble:b1' }]);
    expect(slices.length).toBe(3);
    expect(slices[0]!.yEnd).toBe(1050);
    expect(slices[0]!.cutReason).toBe('gutter');
    expect(slices[1]!.yEnd).toBe(2100);
    expect(slices[1]!.cutReason).toBe('gutter');
    expect(slices[2]!.yEnd).toBe(2600);
    expect(slices[2]!.cutReason).toBe('end');
    for (const s of slices) expect(s.height).toBeLessThanOrEqual(1280);

    // Tall splash panel (2000px) with NO gutters and a bubble spanning y=1220..1340:
    // smart slicer must cut BEFORE the bubble (< 1220), not at 1280!
    const splashSlices = computeSmartSlices(2000, 1280, [], [{ yStart: 1220, yEnd: 1340, reason: 'bubble:b2' }]);
    expect(splashSlices[0]!.cutReason).toBe('clear-band');
    expect(splashSlices[0]!.yEnd).toBeLessThanOrEqual(1220);
  });
});
