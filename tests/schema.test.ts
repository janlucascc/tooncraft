import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateEpisode } from '../src/schema/index.js';

const loadExample = (name: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'examples', name, 'story.json'), 'utf8'));

describe('WebtoonEpisodeSchema validation', () => {
  it.each(['01-action-duel', '02-dramatic-pause', '03-system-awakening'])(
    'accepts showcase example "%s"',
    (name) => {
      const res = validateEpisode(loadExample(name));
      expect(res.success).toBe(true);
    },
  );

  it('applies sensible defaults to a minimal valid episode', () => {
    const res = validateEpisode({
      title: 'Minimal Test',
      panels: [
        {
          id: 'p1',
          height: 500,
          layers: [{ type: 'backdrop', kind: 'solid', colors: ['#111111'] }],
        },
      ],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.schemaVersion).toBe('1.0.0');
      expect(res.data.canvas.width).toBe(800);
      expect(res.data.canvas.sliceMaxHeight).toBe(1280);
      expect(res.data.panels[0]!.pacingAfter).toBe('normal');
    }
  });

  it('rejects duplicate cast ids, panel ids, and bubble/sfx ids', () => {
    const res = validateEpisode({
      title: 'Dupes',
      cast: [
        { id: 'hero', name: 'Hero 1' },
        { id: 'hero', name: 'Hero 2' },
      ],
      panels: [
        {
          id: 'p1',
          height: 400,
          layers: [{ type: 'backdrop', kind: 'solid', colors: ['#000000'] }],
          bubbles: [
            { id: 'dup', text: 'A', position: { x: 20, y: 20 } },
          ],
          sfx: [{ id: 'dup', text: 'BAM', position: { x: 50, y: 50 } }],
        },
        {
          id: 'p1',
          height: 400,
          layers: [{ type: 'backdrop', kind: 'solid', colors: ['#000000'] }],
        },
      ],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.errors.map((e) => e.path);
      expect(paths).toContain('cast[1].id');
      expect(paths).toContain('panels[0].sfx[0].id');
      expect(paths).toContain('panels[1].id');
    }
  });

  it('rejects unknown characterId in bubbles and character_figure layers', () => {
    const res = validateEpisode({
      title: 'Missing Cast',
      cast: [{ id: 'hero', name: 'Hero' }],
      panels: [
        {
          id: 'p1',
          height: 500,
          layers: [
            {
              type: 'character_figure',
              characterId: 'ghost',
              position: { x: 50, y: 100 },
            },
          ],
          bubbles: [
            { id: 'b1', characterId: 'villain', text: 'Hi', position: { x: 50, y: 20 } },
          ],
        },
      ],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.errors.map((e) => e.path)).toEqual(
        expect.arrayContaining(['panels[0].bubbles[0].characterId', 'panels[0].layers[0].characterId']),
      );
    }
  });

  it('rejects invalid colors and missing customPacingPx', () => {
    const res = validateEpisode({
      title: 'Bad Props',
      panels: [
        {
          id: 'p1',
          height: 500,
          layers: [{ type: 'backdrop', kind: 'solid', colors: ['not-a-color'] }],
          pacingAfter: 'custom',
        },
      ],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.errors.map((e) => e.path)).toEqual(
        expect.arrayContaining(['panels[0].layers[0].colors[0]', 'panels[0].customPacingPx']),
      );
    }
  });

  it.each(['../secret.png', 'sub/../secret.png', '/etc/passwd', 'C:\\secret.png'])(
    'rejects unsafe image_ref src "%s"',
    (badSrc) => {
      const res = validateEpisode({
        title: 'Unsafe Image Ref',
        panels: [
          {
            id: 'p1',
            height: 500,
            layers: [{ type: 'image_ref', src: badSrc }],
          },
        ],
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.errors.map((e) => e.path)).toContain('panels[0].layers[0].src');
      }
    },
  );

  it('accepts safe relative image_ref src', () => {
    const res = validateEpisode({
      title: 'Safe Image Ref',
      panels: [
        {
          id: 'p1',
          height: 500,
          layers: [{ type: 'image_ref', src: 'assets/panel-01.png' }],
        },
      ],
    });
    expect(res.success).toBe(true);
  });
});
