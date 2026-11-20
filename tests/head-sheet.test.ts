import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import {
  DEFAULT_HEAD_SHEET_ANGLES,
  HEAD_SHEET_PRESETS,
  composeHeadSheetSvg,
} from '../src/engine/head-sheet.js';

describe('head-sheet QA turnaround & parametric 3D head rig', () => {
  it('renders deterministic 0°→90° turnaround sheets for both lloyd and aria and rasterizes cleanly', () => {
    for (const id of ['lloyd', 'aria'] as const) {
      const preset = HEAD_SHEET_PRESETS[id]!;
      const run1 = composeHeadSheetSvg({ preset, angles: DEFAULT_HEAD_SHEET_ANGLES });
      const run2 = composeHeadSheetSvg({ preset, angles: DEFAULT_HEAD_SHEET_ANGLES });

      expect(run1.svg).toBe(run2.svg);
      expect(run1.width).toBeGreaterThan(1000);
      expect(run1.height).toBeGreaterThan(800);

      const png = Buffer.from(
        new Resvg(run1.svg, { fitTo: { mode: 'original' } }).render().asPng(),
      );
      expect(png.byteLength).toBeGreaterThan(20_000);

      const hash = crypto.createHash('sha256').update(png).digest('hex');
      expect(hash).toHaveLength(64);
    }
  });
});
