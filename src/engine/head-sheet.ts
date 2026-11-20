import type { CharacterPalette, EyeStyle } from '../schema/character.js';
import type { Expression } from '../schema/visual-layer.js';
import { DefsCollector, IdFactory, el, fmt } from '../components/svg-utils.js';
import type { ResolvedHairStyle } from '../templates/anime-features.js';
import { renderParametricHead3D } from '../templates/head-3d.js';

export interface HeadSheetPreset {
  id: string;
  label: string;
  isSlender: boolean;
  palette: CharacterPalette;
  eyeStyle: EyeStyle;
  hairStyle: ResolvedHairStyle;
  expression: Expression;
  rimColor: string;
  earring: boolean;
  accent: string;
  collarColor?: string;
  coatColor?: string;
}

export const HEAD_SHEET_PRESETS: Record<string, HeadSheetPreset> = {
  lloyd: {
    id: 'lloyd',
    label: 'Male 3D Rig (Lloyd-ref palette)',
    isSlender: false,
    palette: {
      skin: '#F3E5C8',
      hair: '#5D4646',
      eyes: '#A3B86C',
      outfitPrimary: '#4A3B36',
      outfitAccent: '#38BDF8',
      aura: '#60A5FA',
    },
    eyeStyle: 'sharp-hunter',
    hairStyle: 'spiky-manhwa',
    expression: 'neutral',
    rimColor: '#60A5FA',
    earring: false,
    accent: '#38BDF8',
    collarColor: '#EEF2F6',
    coatColor: '#4A3B36',
  },
  aria: {
    id: 'aria',
    label: 'Female 3D Rig (Aria palette)',
    isSlender: true,
    palette: {
      skin: '#F2D5C4',
      hair: '#581C87',
      eyes: '#C084FC',
      outfitPrimary: '#312E81',
      outfitAccent: '#F59E0B',
      aura: '#C084FC',
    },
    eyeStyle: 'soft-shojo',
    hairStyle: 'long-flowing',
    expression: 'smirk',
    rimColor: '#C084FC',
    earring: true,
    accent: '#F59E0B',
    collarColor: '#E2E8F0',
    coatColor: '#312E81',
  },
};

export interface HeadSheetOptions {
  preset: HeadSheetPreset;
  angles?: readonly number[];
  pitchDeg?: number;
}

export const DEFAULT_HEAD_SHEET_ANGLES = [0, 15, 30, 45, 60, 90] as const;

/**
 * Generates a 3-row QA turnaround sheet SVG across 0°→90°:
 *  - Row 1: Shaded renders (with rotated neck, shoulders & collar)
 *  - Row 2: Pure black silhouettes (proportion & shape readability check)
 *  - Row 3: 3D construction guides overlay (cranium, curved centerline, eye line, ear root)
 */
export function composeHeadSheetSvg(opts: HeadSheetOptions): {
  svg: string;
  width: number;
  height: number;
} {
  const { preset, angles = DEFAULT_HEAD_SHEET_ANGLES, pitchDeg = 4 } = opts;
  const defs = new DefsCollector(new IdFactory('hs'));

  const cellW = 220;
  const cellH = 260;
  const padX = 24;
  const padTop = 58;
  const rowGap = 36;
  const colGap = 14;

  const width = padX * 2 + angles.length * cellW + (angles.length - 1) * colGap;
  const rows: Array<{ title: string; silhouetteOnly: boolean; debugGuides: boolean; bg: string }> = [
    { title: '1. SHADED (0° → 90°)', silhouetteOnly: false, debugGuides: false, bg: '#111827' },
    { title: '2. SILHOUETTE CHECK', silhouetteOnly: true, debugGuides: false, bg: '#E2E8F0' },
    { title: '3. 3D CONSTRUCTION GUIDES', silhouetteOnly: false, debugGuides: true, bg: '#0F172A' },
  ];
  const height = padTop + rows.length * (cellH + rowGap) + 20;

  let body = '';
  // Sheet background & header
  body += el('rect', { x: 0, y: 0, width, height, fill: '#090D16' });
  body += `<text x="${padX}" y="34" fill="#F8FAFC" font-family="sans-serif" font-size="18" font-weight="700">ToonCraft Head-Sheet QA — ${preset.label}</text>`;

  // Framing transform: fit head+collar (y=-595..-425, height ~170) cleanly inside 220x260 cell
  const scale = 1.32;
  const localCenterY = -512;

  rows.forEach((row, rIdx) => {
    const rowY = padTop + rIdx * (cellH + rowGap);
    body += `<text x="${padX}" y="${rowY - 10}" fill="#94A3B8" font-family="sans-serif" font-size="12" font-weight="700">${row.title}</text>`;

    angles.forEach((yawDeg, cIdx) => {
      const cellX = padX + cIdx * (cellW + colGap);
      const clipId = defs.add(
        'cellclip',
        (id) => `<clipPath id="${id}"><rect x="${cellX}" y="${rowY}" width="${cellW}" height="${cellH}" rx="8"/></clipPath>`,
      );

      // Cell frame
      body += el('rect', {
        x: cellX,
        y: rowY,
        width: cellW,
        height: cellH,
        rx: 8,
        fill: row.bg,
        stroke: '#334155',
        'stroke-width': 1.5,
      });

      const res = renderParametricHead3D({
        yawDeg,
        pitchDeg,
        isSlender: preset.isSlender,
        palette: preset.palette,
        eyeStyle: preset.eyeStyle,
        hairStyle: preset.hairStyle,
        expression: preset.expression,
        glowEyes: false,
        lightDirection: 'right',
        shadingIntensity: 'standard',
        rimColor: preset.rimColor,
        lw: 1.85,
        ink: '#0F172A',
        defs,
        earring: preset.earring,
        accent: preset.accent,
        collarColor: preset.collarColor,
        coatColor: preset.coatColor,
        silhouetteOnly: row.silhouetteOnly,
        debugGuides: row.debugGuides,
      });

      const cx = cellX + cellW * 0.5;
      const cy = rowY + cellH * 0.52;
      const tf = `translate(${fmt(cx)} ${fmt(cy)}) scale(${fmt(scale)}) translate(0 ${fmt(-localCenterY)})`;
      body += `<g clip-path="url(#${clipId})"><g transform="${tf}">${res.hairBackSvg}${res.neckAndCollarSvg}${res.headSvg}</g></g>`;

      // Angle badge
      const badgeBg = row.silhouetteOnly ? '#0F172A' : '#1E293B';
      body += el('rect', { x: cellX + 8, y: rowY + 8, width: 42, height: 20, rx: 4, fill: badgeBg, 'fill-opacity': 0.85 });
      body += `<text x="${cellX + 29}" y="${rowY + 22}" text-anchor="middle" fill="#F8FAFC" font-family="monospace" font-size="12" font-weight="700">${yawDeg}°</text>`;
    });
  });

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    defs.toString() +
    body +
    `</svg>`;

  return { svg, width, height };
}

/**
 * Generates a standalone 3/4 portrait SVG sized cleanly for side-by-side comparison
 * against a reference image.
 */
export function composeSinglePortraitSvg(
  preset: HeadSheetPreset,
  yawDeg = 34,
  width = 512,
  height = 512,
  debugGuides = false,
): string {
  const defs = new DefsCollector(new IdFactory('hs'));
  const res = renderParametricHead3D({
    yawDeg,
    pitchDeg: 4,
    isSlender: preset.isSlender,
    palette: preset.palette,
    eyeStyle: preset.eyeStyle,
    hairStyle: preset.hairStyle,
    expression: preset.expression,
    glowEyes: false,
    lightDirection: 'right',
    shadingIntensity: 'standard',
    rimColor: preset.rimColor,
    lw: 1.85,
    ink: '#0F172A',
    defs,
    earring: preset.earring,
    accent: preset.accent,
    collarColor: preset.collarColor,
    coatColor: preset.coatColor,
    debugGuides,
  });

  const bgId = defs.add('pbg', (id) =>
    `<linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="100%">` +
    `<stop offset="0%" stop-color="#0D3B56"/>` +
    `<stop offset="55%" stop-color="#1E3A5F"/>` +
    `<stop offset="100%" stop-color="#111C38"/>` +
    `</linearGradient>`,
  );

  const scale = width / 165;
  const tf = `translate(${fmt(width * 0.5)} ${fmt(height * 0.54)}) scale(${fmt(scale)}) translate(0 510)`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    defs.toString() +
    `<rect width="${width}" height="${height}" fill="url(#${bgId})"/>` +
    `<g transform="${tf}">${res.hairBackSvg}${res.neckAndCollarSvg}${res.headSvg}</g>` +
    `</svg>`
  );
}
