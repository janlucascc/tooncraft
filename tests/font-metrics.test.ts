import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FONT_FACES,
  FONT_SETS,
  type FontKey,
  getAllFontPaths,
  measureTextLine,
  parseInlineMarkup,
  wrapBalanced,
  wrapTextToWidth,
} from '../src/components/font-metrics.js';

describe('font-metrics (opentype.js)', () => {
  it('locates and loads every bundled OFL font file', () => {
    const paths = getAllFontPaths();
    expect(paths.length).toBe(Object.keys(FONT_FACES).length);
    for (const p of paths) expect(existsSync(p)).toBe(true);

    for (const key of Object.keys(FONT_FACES) as FontKey[]) {
      const w = measureTextLine('Ação — ToonCraft 123!', key, 20);
      expect(w).toBeGreaterThan(50);
    }
  });

  it('parses **bold** and *italic* inline markup cleanly', () => {
    const runs = parseInlineMarkup('Hello **bold** and *italic* world');
    expect(runs).toEqual([
      { text: 'Hello ', style: 'regular' },
      { text: 'bold', style: 'bold' },
      { text: ' and ', style: 'regular' },
      { text: 'italic', style: 'italic' },
      { text: ' world', style: 'regular' },
    ]);
  });

  it('never produces lines wider than maxWidth', () => {
    const maxWidth = 220;
    const text =
      'Every hunter remembers the first time the dungeon gate opened and whispered their name into the dark.';
    const wrapped = wrapTextToWidth(text, {
      fontSize: 19,
      maxWidth,
      fonts: FONT_SETS.comic,
    });
    expect(wrapped.lines.length).toBeGreaterThan(2);
    for (const line of wrapped.lines) {
      expect(line.width).toBeLessThanOrEqual(maxWidth + 0.5);
    }
  });

  it('hard-breaks overlong single words and preserves manual line breaks', () => {
    const res = wrapTextToWidth('LineOne\nSupercalifragilisticexpialidocious', {
      fontSize: 20,
      maxWidth: 140,
      fonts: FONT_SETS.modern,
    });
    expect(res.lines[0]!.runs[0]!.text).toBe('LineOne');
    expect(res.lines.length).toBeGreaterThanOrEqual(3);
    for (const l of res.lines) expect(l.width).toBeLessThanOrEqual(141);
  });

  it('balances line widths without increasing line count', () => {
    const opts = { fontSize: 19, maxWidth: 280, fonts: FONT_SETS.comic };
    const text = 'You are three minutes late and the rain is getting worse.';
    const greedy = wrapTextToWidth(text, opts);
    const balanced = wrapBalanced(text, opts);
    expect(balanced.lines.length).toBeLessThanOrEqual(greedy.lines.length);
    expect(balanced.width).toBeLessThanOrEqual(greedy.width + 1);
  });
});
