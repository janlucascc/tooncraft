import { z } from 'zod';
import { ColorSchema } from './common.js';
import { VisualLayerSchema } from './visual-layer.js';
import { BubbleSchema } from './bubble.js';
import { SfxSchema } from './sfx.js';

export const FrameTypeSchema = z.enum([
  /** Rectangle with side margins and a crisp border. */
  'standard',
  /** Full canvas width, no side margins. */
  'full-bleed',
  /** Slanted top edge. */
  'diagonal-top',
  /** Slanted bottom edge. */
  'diagonal-bottom',
  /** Parallelogram — dynamic action. */
  'diagonal-both',
  /** No border; edges fade into the scroll background. */
  'borderless',
  /** Jagged broken-glass edges for impacts. */
  'shattered',
  /** Smaller, recessed frame — reaction shots / detail close-ups. */
  'inset',
]);

export const CameraShotSchema = z.enum([
  'extreme-close-up',
  'close-up',
  'medium',
  'wide',
  'establishing',
  'dutch-angle',
  'birds-eye',
  'low-angle',
]);

/**
 * Vertical gap after a panel. Gaps are the "time" of a webtoon:
 * tight = 16px, normal = 64px, breath = 140px, dramatic_pause = 320px,
 * scene_transition = 480px, custom = `customPacingPx`.
 */
export const PacingPresetSchema = z.enum([
  'tight',
  'normal',
  'breath',
  'dramatic_pause',
  'scene_transition',
  'custom',
]);

export const PacingTransitionSchema = z.enum([
  'solid',
  'fade-to-black',
  'fade-to-white',
  'gradient-shift',
]);

export const PanelFrameSchema = z.object({
  type: FrameTypeSchema.default('standard'),
  /** Defaults to the theme's border color. */
  borderColor: ColorSchema.optional(),
  borderWidth: z.number().min(0).max(16).default(4),
  /** Overrides `canvas.defaultMarginX`. */
  marginX: z.number().int().min(0).max(160).optional(),
  /** Slant amount (degrees) for diagonal frames. */
  skewDeg: z.number().min(-20).max(20).default(6),
  cornerRadius: z.number().int().min(0).max(40).default(0),
});

export const PanelSchema = z.object({
  id: z.string().min(1),
  height: z.number().int().min(200).max(2200),
  camera: CameraShotSchema.default('medium'),
  /** Narrative/mood metadata — used for docs, inspector and alt text. */
  moodDescription: z.string().max(300).optional(),
  frame: PanelFrameSchema.prefault({}),
  layers: z.array(VisualLayerSchema).min(1),
  bubbles: z.array(BubbleSchema).default([]),
  sfx: z.array(SfxSchema).default([]),
  pacingAfter: PacingPresetSchema.default('normal'),
  customPacingPx: z.number().int().min(0).max(1200).optional(),
  /** How the gap after this panel is painted. */
  pacingTransition: PacingTransitionSchema.default('solid'),
  /** Seed for deterministic procedural effects. */
  seed: z.number().int().default(42),
});

export type FrameType = z.infer<typeof FrameTypeSchema>;
export type CameraShot = z.infer<typeof CameraShotSchema>;
export type PacingPreset = z.infer<typeof PacingPresetSchema>;
export type PacingTransition = z.infer<typeof PacingTransitionSchema>;
export type PanelFrame = z.infer<typeof PanelFrameSchema>;
export type Panel = z.infer<typeof PanelSchema>;
