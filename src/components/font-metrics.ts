import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import type { FontPreset } from '../schema/common.js';

/**
 * Real glyph metrics for the bundled fonts.
 *
 * SVG has no automatic word-wrap, so every line break and every bubble size is
 * computed here from the actual .ttf advance widths (with kerning). The same
 * files are injected into the rasterizer and embedded in the HTML reader, so
 * measurement and rendering always agree.
 */

export type FontKey =
  | 'comic-bold'
  | 'comic-italic'
  | 'bangers'
  | 'chakra'
  | 'noto-regular'
  | 'noto-bold';

export interface FontFaceInfo {
  key: FontKey;
  file: string;
  /** CSS/SVG font-family name (must match the family inside the .ttf). */
  family: string;
  weight: number;
  style: 'normal' | 'italic';
}

export const FONT_FACES: Record<FontKey, FontFaceInfo> = {
  'comic-bold': { key: 'comic-bold', file: 'ComicNeue-Bold.ttf', family: 'Comic Neue', weight: 700, style: 'normal' },
  'comic-italic': { key: 'comic-italic', file: 'ComicNeue-BoldItalic.ttf', family: 'Comic Neue', weight: 700, style: 'italic' },
  bangers: { key: 'bangers', file: 'Bangers-Regular.ttf', family: 'Bangers', weight: 400, style: 'normal' },
  chakra: { key: 'chakra', file: 'ChakraPetch-Bold.ttf', family: 'Chakra Petch', weight: 700, style: 'normal' },
  'noto-regular': { key: 'noto-regular', file: 'NotoSans-Regular.ttf', family: 'Noto Sans', weight: 400, style: 'normal' },
  'noto-bold': { key: 'noto-bold', file: 'NotoSans-Bold.ttf', family: 'Noto Sans', weight: 700, style: 'normal' },
};

/** A text style family: which face to use for regular / bold / italic runs. */
export interface FontFamilySet {
  regular: FontKey;
  bold: FontKey;
  italic: FontKey;
}

export const FONT_SETS: Record<FontPreset | 'narration', FontFamilySet> = {
  comic: { regular: 'comic-bold', bold: 'comic-bold', italic: 'comic-italic' },
  modern: { regular: 'noto-regular', bold: 'noto-bold', italic: 'noto-regular' },
  system: { regular: 'chakra', bold: 'chakra', italic: 'chakra' },
  dramatic: { regular: 'bangers', bold: 'bangers', italic: 'bangers' },
  narration: { regular: 'noto-regular', bold: 'noto-bold', italic: 'noto-regular' },
};

// ---------------------------------------------------------------------------
// Font loading
// ---------------------------------------------------------------------------

let cachedFontsDir: string | undefined;

/** Locate `assets/fonts` by walking up from this module (works from src/ and dist/). */
export function getFontsDir(): string {
  if (cachedFontsDir) return cachedFontsDir;
  const envDir = process.env.TOONCRAFT_FONTS_DIR;
  if (envDir && existsSync(join(envDir, FONT_FACES['comic-bold'].file))) {
    cachedFontsDir = resolve(envDir);
    return cachedFontsDir;
  }
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'assets', 'fonts');
    if (existsSync(join(candidate, FONT_FACES['comic-bold'].file))) {
      cachedFontsDir = candidate;
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'ToonCraft: could not locate assets/fonts. Set TOONCRAFT_FONTS_DIR to the directory containing the bundled .ttf files.',
  );
}

export function getFontPath(key: FontKey): string {
  return join(getFontsDir(), FONT_FACES[key].file);
}

/** All font file paths (for the rasterizer). */
export function getAllFontPaths(): string[] {
  return (Object.keys(FONT_FACES) as FontKey[]).map(getFontPath);
}

const fontCache = new Map<FontKey, opentype.Font>();

export function loadFont(key: FontKey): opentype.Font {
  const cached = fontCache.get(key);
  if (cached) return cached;
  const buf = readFileSync(getFontPath(key));
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  fontCache.set(key, font);
  return font;
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/** Width in px of a single line of text using real glyph advance widths and kerning. */
export function measureTextLine(text: string, key: FontKey, fontSize: number, letterSpacing = 0): number {
  if (!text) return 0;
  const font = loadFont(key);
  const scale = fontSize / font.unitsPerEm;
  const chars = [...text];
  let width = 0;
  let prev: opentype.Glyph | null = null;
  for (const ch of chars) {
    const glyph = font.charToGlyph(ch);
    if (prev) width += font.getKerningValue(prev, glyph) * scale;
    width += (glyph.advanceWidth ?? font.unitsPerEm * 0.5) * scale;
    prev = glyph;
  }
  return width + letterSpacing * Math.max(0, chars.length - 1);
}

/** Vertical metrics in px. `ascent` is positive, `descent` is negative. */
export function fontVerticalMetrics(key: FontKey, fontSize: number): { ascent: number; descent: number } {
  const font = loadFont(key);
  const scale = fontSize / font.unitsPerEm;
  return { ascent: font.ascender * scale, descent: font.descender * scale };
}

/**
 * Offset to add to a line's vertical center to get its baseline, so that the
 * visual em-box is centered.
 */
export function baselineOffset(key: FontKey, fontSize: number): number {
  const { ascent, descent } = fontVerticalMetrics(key, fontSize);
  return (ascent + descent) / 2;
}

// ---------------------------------------------------------------------------
// Inline markup + wrapping
// ---------------------------------------------------------------------------

export type RunStyle = 'regular' | 'bold' | 'italic';

export interface TextRun {
  text: string;
  style: RunStyle;
}

/**
 * Parse `**bold**` and `*italic*` markup into styled runs.
 * Unclosed markers are kept literally.
 */
export function parseInlineMarkup(input: string): TextRun[] {
  const runs: TextRun[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/gs;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    if (m.index > last) runs.push({ text: input.slice(last, m.index), style: 'regular' });
    if (m[1] !== undefined) runs.push({ text: m[1], style: 'bold' });
    else if (m[2] !== undefined) runs.push({ text: m[2], style: 'italic' });
    last = m.index + m[0].length;
  }
  if (last < input.length) runs.push({ text: input.slice(last), style: 'regular' });
  return runs.filter((r) => r.text.length > 0);
}

export interface WrappedLine {
  runs: TextRun[];
  width: number;
}

export interface WrapResult {
  lines: WrappedLine[];
  /** Widest line, in px. */
  width: number;
  /** Total block height, in px (lines × lineHeight). */
  height: number;
  lineHeight: number;
}

export interface WrapOptions {
  fontSize: number;
  maxWidth: number;
  fonts: FontFamilySet;
  lineHeightFactor?: number;
  letterSpacing?: number;
  uppercase?: boolean;
}

interface Token {
  text: string;
  style: RunStyle;
  /** True when this token is whitespace. */
  space: boolean;
}

function fontFor(style: RunStyle, fonts: FontFamilySet): FontKey {
  return fonts[style];
}

/** Merge adjacent runs that share a style. */
function mergeRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const r of runs) {
    const prev = out[out.length - 1];
    if (prev && prev.style === r.style) prev.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

function measureRuns(runs: TextRun[], o: WrapOptions): number {
  return runs.reduce(
    (sum, r) => sum + measureTextLine(r.text, fontFor(r.style, o.fonts), o.fontSize, o.letterSpacing ?? 0),
    0,
  );
}

/** Split a token that is wider than maxWidth into character chunks. */
function hardBreak(token: Token, o: WrapOptions): Token[] {
  const out: Token[] = [];
  let current = '';
  for (const ch of [...token.text]) {
    const candidate = current + ch;
    if (current && measureTextLine(candidate, fontFor(token.style, o.fonts), o.fontSize) > o.maxWidth) {
      out.push({ ...token, text: current });
      current = ch;
    } else current = candidate;
  }
  if (current) out.push({ ...token, text: current });
  return out;
}

/**
 * Greedy word-wrap with real glyph metrics. Honors manual `\n` breaks and
 * inline markup; no produced line exceeds `maxWidth` (words longer than the
 * width are hard-broken).
 */
export function wrapTextToWidth(text: string, o: WrapOptions): WrapResult {
  const lineHeight = o.fontSize * (o.lineHeightFactor ?? 1.22);
  const source = o.uppercase ? text.toUpperCase() : text;
  const paragraphs = source.replace(/\r\n?/g, '\n').split('\n');
  const lines: WrappedLine[] = [];

  // Markup can span manual line breaks, so parse once per full text, then split.
  const allRuns = parseInlineMarkup(paragraphs.join('\u0000'));
  const paraRuns: TextRun[][] = [[]];
  for (const run of allRuns) {
    const parts = run.text.split('\u0000');
    parts.forEach((part, i) => {
      if (i > 0) paraRuns.push([]);
      if (part) paraRuns[paraRuns.length - 1]!.push({ text: part, style: run.style });
    });
  }

  for (const runs of paraRuns) {
    const tokens: Token[] = [];
    for (const run of runs) {
      for (const piece of run.text.split(/(\s+)/)) {
        if (!piece) continue;
        tokens.push({ text: piece, style: run.style, space: /^\s+$/.test(piece) });
      }
    }

    let current: TextRun[] = [];
    let currentWidth = 0;
    const flush = () => {
      // Trim trailing whitespace.
      while (current.length && /^\s+$/.test(current[current.length - 1]!.text)) current.pop();
      const merged = mergeRuns(current);
      lines.push({ runs: merged, width: measureRuns(merged, o) });
      current = [];
      currentWidth = 0;
    };

    const queue = [...tokens];
    while (queue.length) {
      const tok = queue.shift()!;
      if (tok.space) {
        if (current.length === 0) continue; // no leading spaces
        const spaceTok = { text: ' ', style: tok.style };
        current.push(spaceTok);
        currentWidth = measureRuns(mergeRuns(current), o);
        continue;
      }
      const tokWidth = measureTextLine(tok.text, fontFor(tok.style, o.fonts), o.fontSize, o.letterSpacing ?? 0);
      if (tokWidth > o.maxWidth) {
        if (current.length) flush();
        queue.unshift(...hardBreak(tok, o));
        const first = queue.shift()!;
        current.push({ text: first.text, style: first.style });
        currentWidth = measureRuns(current, o);
        continue;
      }
      const candidate = mergeRuns([...current, { text: tok.text, style: tok.style }]);
      const candidateWidth = measureRuns(candidate, o);
      if (candidateWidth > o.maxWidth && current.length) {
        flush();
        current.push({ text: tok.text, style: tok.style });
        currentWidth = tokWidth;
      } else {
        current.push({ text: tok.text, style: tok.style });
        currentWidth = candidateWidth;
      }
    }
    void currentWidth;
    flush();
  }

  const width = lines.reduce((m, l) => Math.max(m, l.width), 0);
  return { lines, width, height: lines.length * lineHeight, lineHeight };
}

/**
 * Balance line lengths: shrink the wrap width as long as the number of lines
 * stays the same. Produces the rounder, more "lettered" look of pro manhwa.
 */
export function wrapBalanced(text: string, o: WrapOptions): WrapResult {
  const base = wrapTextToWidth(text, o);
  if (base.lines.length <= 1) return base;
  let lo = o.maxWidth * 0.45;
  let hi = base.width;
  let best = base;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const attempt = wrapTextToWidth(text, { ...o, maxWidth: mid });
    if (attempt.lines.length <= base.lines.length) {
      best = attempt;
      hi = mid;
    } else lo = mid;
  }
  return best;
}
