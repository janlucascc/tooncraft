import { z } from 'zod';

/**
 * Shared primitives used across every ToonCraft schema.
 *
 * Coordinates inside a panel are always expressed as percentages (0–100) so a
 * story stays valid even when a panel's pixel height changes.
 */

const HEX_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
const RGB_RE =
  /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/;

/** Hex color: #RGB, #RGBA, #RRGGBB or #RRGGBBAA. */
export const HexColorSchema = z
  .string()
  .regex(HEX_RE, 'Expected a hex color like "#FF0055" or "#F05"');

/** Hex color or rgb()/rgba() color. */
export const ColorSchema = z
  .string()
  .refine((v) => HEX_RE.test(v) || RGB_RE.test(v), {
    message: 'Expected a color: "#RRGGBB", "#RGB", "#RRGGBBAA", "rgb(r,g,b)" or "rgba(r,g,b,a)"',
  });

/** Point inside a panel, in percent of panel width (x) and panel height (y). */
export const PercentPointSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

export const AnchorSchema = z.enum([
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]);

/** Global visual preset — drives default palette, fonts and frame styling. */
export const ThemePresetSchema = z.enum([
  'cyberpunk-neon',
  'dark-fantasy',
  'solo-system',
  'slice-of-life-pastel',
  'noir-thriller',
  'action-shonen',
  'custom',
]);

export const FontPresetSchema = z.enum(['comic', 'modern', 'system', 'dramatic']);

/** Vertical canvas configuration. 800px is the Webtoon Canvas standard width. */
export const CanvasConfigSchema = z.object({
  width: z.number().int().min(400).max(1600).default(800),
  /** Color of the scroll background between panels. Defaults to the theme's. */
  backgroundColor: ColorSchema.optional(),
  /** Horizontal margin for non full-bleed panels. */
  defaultMarginX: z.number().int().min(0).max(120).default(24),
  /** Max height of each exported slice (Webtoon Canvas accepts up to 1280px). */
  sliceMaxHeight: z.number().int().min(600).max(2000).default(1280),
  /** Typography preset for bubbles. Defaults to the theme's. */
  fontPreset: FontPresetSchema.optional(),
});

export type HexColor = z.infer<typeof HexColorSchema>;
export type Color = z.infer<typeof ColorSchema>;
export type PercentPoint = z.infer<typeof PercentPointSchema>;
export type Anchor = z.infer<typeof AnchorSchema>;
export type ThemePreset = z.infer<typeof ThemePresetSchema>;
export type FontPreset = z.infer<typeof FontPresetSchema>;
export type CanvasConfig = z.infer<typeof CanvasConfigSchema>;
