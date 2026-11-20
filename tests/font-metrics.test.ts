import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FONT_FACES,
  FONT_SETS,
  type FontKey,
  clearFontCache,
  getAllFontPaths,
  loadFont,
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

  it('clearFontCache() clears cached font instances', () => {
    const first = loadFont('comic-bold');
    expect(loadFont('comic-bold')).toBe(first);
    clearFontCache();
    const second = loadFont('comic-bold');
    expect(second).not.toBe(first);
    expect(measureTextLine('Test', 'comic-bold', 20)).toBeGreaterThan(0);
  });

  it('factors letterSpacing into wrapTextToWidth line-width and hard-break decisions', () => {
    const text = 'Alpha Beta Gamma';
    const maxWidth = 170;
    const tight = wrapTextToWidth(text, {
      fontSize: 18,
      maxWidth,
      fonts: FONT_SETS.modern,
      letterSpacing: 0,
    });
    const spaced = wrapTextToWidth(text, {
      fontSize: 18,
      maxWidth,
      fonts: FONT_SETS.modern,
      letterSpacing: 8,
    });
    expect(spaced.lines.length).toBeGreaterThan(tight.lines.length);
    for (const line of spaced.lines) {
      expect(line.width).toBeLessThanOrEqual(maxWidth + 0.5);
    }

    const longWord = wrapTextToWidth('ABCDEFGHIJKLMN', {
      fontSize: 18,
      maxWidth: 100,
      fonts: FONT_SETS.modern,
      letterSpacing: 10,
    });
    expect(longWord.lines.length).toBeGreaterThan(1);
    for (const line of longWord.lines) {
      expect(line.width).toBeLessThanOrEqual(100 + 0.5);
    }
  });
});
