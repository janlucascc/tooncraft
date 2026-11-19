import { z } from 'zod';
import { ColorSchema } from './common.js';

/**
 * Character Bible — keeps every cast member visually consistent across panels
 * (palette, silhouette and bubble styling).
 */

export const CharacterRoleSchema = z.enum([
  'protagonist',
  'antagonist',
  'supporting',
  'narrator',
  'system',
]);

export const SilhouettePresetSchema = z.enum([
  'hooded-mage',
  'armored-knight',
  'cyber-assassin',
  'casual-student',
  'suit-detective',
  'martial-artist',
  'shadow-entity',
  'none',
]);

export const CharacterPaletteSchema = z.object({
  skin: ColorSchema.default('#F2C9AC'),
  hair: ColorSchema.default('#1F2937'),
  eyes: ColorSchema.default('#38BDF8'),
  outfitPrimary: ColorSchema.default('#1E293B'),
  outfitAccent: ColorSchema.default('#F59E0B'),
  aura: ColorSchema.default('#60A5FA'),
});

export const CharacterBubbleThemeSchema = z.object({
  fillColor: ColorSchema.optional(),
  strokeColor: ColorSchema.optional(),
  textColor: ColorSchema.optional(),
  glowColor: ColorSchema.optional(),
});

export const CharacterSchema = z.object({
  /** Unique slug, e.g. "kael" or "system-ai". */
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'Character id must be a lowercase slug (a-z, 0-9, -)'),
  name: z.string().min(1).max(60),
  role: CharacterRoleSchema.default('supporting'),
  palette: CharacterPaletteSchema.prefault({}),
  silhouettePreset: SilhouettePresetSchema.default('none'),
  bubbleTheme: CharacterBubbleThemeSchema.optional(),
});

export type CharacterRole = z.infer<typeof CharacterRoleSchema>;
export type SilhouettePreset = z.infer<typeof SilhouettePresetSchema>;
export type CharacterPalette = z.infer<typeof CharacterPaletteSchema>;
export type CharacterBubbleTheme = z.infer<typeof CharacterBubbleThemeSchema>;
export type Character = z.infer<typeof CharacterSchema>;
