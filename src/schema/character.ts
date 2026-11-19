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
  'primitive-hunter',
  'shadow-entity',
  'none',
]);

export const EyeStyleSchema = z.enum([
  'standard-anime',
  'sharp-hunter',
  'mystic-glow',
  'villain-narrow',
  'soft-shojo',
]);

export const HairStylePresetSchema = z.enum([
  'auto',
  'spiky-manhwa',
  'wild-primitive',
  'undercut-sleek',
  'ponytail-ronin',
  'long-flowing',
  'hooded-shadow',
]);

export const CharacterAccessorySchema = z.enum([
  'scar-eye',
  'tribal-marks',
  'headband',
  'earring',
  'fur-collar',
  'bone-necklace',
  'cyber-visor',
  'cloak-clasp',
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

/**
 * Psychological & linguistic profile for Pass-1 Writer's Room development.
 * Keeps character voice, inner wound and goal distinct across scenes.
 */
export const CharacterNarrativeProfileSchema = z.object({
  /** Immediate visceral objective (e.g. "Keep his dying brother Kori warm through the blizzard"). */
  coreGoal: z.string().max(200).optional(),
  /** Inner wound, guilt, flaw or taboo (e.g. "Exiled by the clan elders for refusing to abandon the weak"). */
  woundOrFlaw: z.string().max(200).optional(),
  /** Speech diction, metaphors and rhythm (e.g. "Short primal sentences; metaphors of flint, marrow, ember and frost"). */
  speechStyle: z.string().max(200).optional(),
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
  eyeStyle: EyeStyleSchema.default('sharp-hunter'),
  hairStyle: HairStylePresetSchema.default('auto'),
  accessories: z.array(CharacterAccessorySchema).default([]),
  narrativeProfile: CharacterNarrativeProfileSchema.optional(),
  bubbleTheme: CharacterBubbleThemeSchema.optional(),
});

export type CharacterRole = z.infer<typeof CharacterRoleSchema>;
export type SilhouettePreset = z.infer<typeof SilhouettePresetSchema>;
export type EyeStyle = z.infer<typeof EyeStyleSchema>;
export type HairStylePreset = z.infer<typeof HairStylePresetSchema>;
export type CharacterAccessory = z.infer<typeof CharacterAccessorySchema>;
export type CharacterPalette = z.infer<typeof CharacterPaletteSchema>;
export type CharacterBubbleTheme = z.infer<typeof CharacterBubbleThemeSchema>;
export type CharacterNarrativeProfile = z.infer<typeof CharacterNarrativeProfileSchema>;
export type Character = z.infer<typeof CharacterSchema>;
