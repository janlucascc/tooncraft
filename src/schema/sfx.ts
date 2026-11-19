import { z } from 'zod';
import { ColorSchema, PercentPointSchema } from './common.js';

/** Visual treatment of an onomatopoeia. */
export const SfxStyleSchema = z.enum([
  /** Heavy font, thick stroke, offset solid shadow (BOOM, CRASH). */
  'impact',
  /** Slanted/stretched with a cutting trail (SLASH, SHING). */
  'slash',
  /** Per-letter jitter (RUMBLE, GRRR). */
  'tremble',
  /** Thin, slightly translucent (DRIP, WHOOSH, TICK). */
  'ambient',
  /** Bright neon outline (BZZZT, LEVEL UP). */
  'glow',
]);

export const SfxSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(32),
  style: SfxStyleSchema.default('impact'),
  /** Center of the SFX, in panel %. */
  position: PercentPointSchema,
  rotation: z.number().min(-180).max(180).default(-8),
  fontSize: z.number().int().min(20).max(140).default(56),
  primaryColor: ColorSchema.default('#FFFFFF'),
  strokeColor: ColorSchema.default('#000000'),
  strokeWidth: z.number().min(1).max(16).default(6),
  shadowColor: ColorSchema.optional(),
  /** Bend the text along an arc (negative = arch down, positive = arch up). */
  curveArc: z.number().min(-40).max(40).default(0),
  zIndex: z.number().int().min(0).max(100).default(40),
});

export type SfxStyle = z.infer<typeof SfxStyleSchema>;
export type Sfx = z.infer<typeof SfxSchema>;
