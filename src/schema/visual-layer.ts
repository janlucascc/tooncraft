import { z } from 'zod';
import { ColorSchema, PercentPointSchema } from './common.js';

/**
 * Visual layers — everything drawn inside a panel, without generative images.
 * Discriminated by `type`. Layers are painted in ascending `zIndex` order and
 * clipped to the panel frame.
 */

/** Atmospheric background fill. */
export const BackdropLayerSchema = z.object({
  type: z.literal('backdrop'),
  kind: z.enum(['solid', 'linear-gradient', 'radial-gradient', 'night-sky', 'horizon-glow']),
  colors: z.array(ColorSchema).min(1).max(4),
  angleDeg: z.number().min(0).max(360).default(180),
  /** 0–1 density of stars (used by `night-sky`, optional elsewhere). */
  starsDensity: z.number().min(0).max(1).default(0),
  zIndex: z.number().int().default(0),
});

export const EnvironmentPresetSchema = z.enum([
  'cyberpunk-alley',
  'neon-skyline',
  'school-rooftop',
  'dark-forest',
  'dungeon-cavern',
  'throne-hall',
  'rainy-street',
  'abstract-void',
]);

/** Procedural vector scenery. */
export const EnvironmentLayerSchema = z.object({
  type: z.literal('environment'),
  preset: EnvironmentPresetSchema,
  /** Horizon line, in panel height %. */
  perspectiveY: z.number().min(0).max(100).default(65),
  accentColor: ColorSchema.optional(),
  fogOpacity: z.number().min(0).max(0.9).default(0.25),
  zIndex: z.number().int().default(10),
});

export const FramingSchema = z.enum(['eyes-only', 'close-up', 'bust', 'waist-up', 'full-body']);
export const PoseSchema = z.enum([
  'standing',
  'action-lunge',
  'facing-away',
  'crouching',
  'dramatic-profile',
  'power-awakening',
]);
export const ExpressionSchema = z.enum([
  'neutral',
  'angry',
  'shocked',
  'smirk',
  'menacing-glow',
  'shadowed',
  'determined',
  'pain',
]);

export const ShadingIntensitySchema = z.enum(['soft', 'standard', 'heavy', 'dramatic-noir']);
export const LightDirectionSchema = z.enum(['left', 'right', 'top', 'bottom-fire', 'back-rim']);
export const WeaponPropSchema = z.enum([
  'none',
  'stone-spear',
  'katana',
  'dagger-dual',
  'magic-orb',
  'greatsword',
]);

/** Procedural character silhouette built from the cast member's palette. */
export const CharacterFigureLayerSchema = z.object({
  type: z.literal('character_figure'),
  characterId: z.string().min(1),
  framing: FramingSchema.default('bust'),
  pose: PoseSchema.default('standing'),
  expression: ExpressionSchema.default('neutral'),
  /** Anchor point = bottom-center of the figure, in panel %. */
  position: PercentPointSchema,
  scale: z.number().min(0.3).max(3.5).default(1),
  flipX: z.boolean().default(false),
  rimLightColor: ColorSchema.optional(),
  /** Classic manhwa glowing eyes in shadow. */
  glowEyes: z.boolean().default(false),
  /** Depth of cel-shaded shadows and hatch lines. */
  shadingIntensity: ShadingIntensitySchema.default('standard'),
  /** Primary light source direction for cel-shading & catchlights. */
  lightDirection: LightDirectionSchema.default('left'),
  /** Optional glowing energy aura around the character (0 = off, 1 = blazing). */
  auraIntensity: z.number().min(0).max(1).default(0),
  /** Optional built-in weapon/prop anchored to the character's hands/back. */
  weaponProp: WeaponPropSchema.default('none'),
  /** Optional Pass-2 custom SVG detail markup rendered in character local coords (0,-535 = head center). */
  detailOverlaySvg: z.string().max(25_000).optional(),
  zIndex: z.number().int().default(20),
});

/**
 * Free-form SVG authored by the agent ("Remotion mode"). Inner markup only
 * (no <svg> root), in a coordinate system of `0 0 canvasWidth panelHeight`.
 * Sanitized with a strict whitelist before rendering.
 */
export const SvgRawLayerSchema = z.object({
  type: z.literal('svg_raw'),
  svgMarkup: z.string().min(1).max(50_000),
  opacity: z.number().min(0).max(1).default(1),
  zIndex: z.number().int().default(25),
});

export const EffectKindSchema = z.enum([
  'speedlines-radial',
  'speedlines-vertical',
  'halftone-vignette',
  'rain',
  'embers',
  'mana-particles',
  'screen-crack',
  'chromatic-glitch',
  'impact-flash',
  'vignette',
]);

/** Impact & weather effects. */
export const EffectLayerSchema = z.object({
  type: z.literal('effect'),
  kind: EffectKindSchema,
  color: ColorSchema.default('#FFFFFF'),
  intensity: z.number().min(0.1).max(1).default(0.6),
  focalPoint: PercentPointSchema.prefault({ x: 50, y: 50 }),
  zIndex: z.number().int().default(30),
});

export const EmotionBadgeKindSchema = z.enum([
  'sweat-drop',
  'anger-vein',
  'shock-lines',
  'sparkle',
  'dark-gloom',
  'question-mark',
  'exclamation',
]);

/** Classic manga/manhwa emotion icons. */
export const EmotionBadgeLayerSchema = z.object({
  type: z.literal('emotion_badge'),
  kind: EmotionBadgeKindSchema,
  position: PercentPointSchema,
  scale: z.number().min(0.4).max(2.5).default(1),
  color: ColorSchema.optional(),
  zIndex: z.number().int().default(35),
});

/**
 * Reserved slot for future raster art (user uploads or generative models).
 * Only local files are allowed and rendering requires `allowImages: true`.
 */
export const ImageRefLayerSchema = z.object({
  type: z.literal('image_ref'),
  src: z.string().min(1),
  fit: z.enum(['cover', 'contain']).default('cover'),
  opacity: z.number().min(0).max(1).default(1),
  zIndex: z.number().int().default(15),
});

export const VisualLayerSchema = z.discriminatedUnion('type', [
  BackdropLayerSchema,
  EnvironmentLayerSchema,
  CharacterFigureLayerSchema,
  SvgRawLayerSchema,
  EffectLayerSchema,
  EmotionBadgeLayerSchema,
  ImageRefLayerSchema,
]);

export type BackdropLayer = z.infer<typeof BackdropLayerSchema>;
export type EnvironmentPreset = z.infer<typeof EnvironmentPresetSchema>;
export type EnvironmentLayer = z.infer<typeof EnvironmentLayerSchema>;
export type Framing = z.infer<typeof FramingSchema>;
export type Pose = z.infer<typeof PoseSchema>;
export type Expression = z.infer<typeof ExpressionSchema>;
export type ShadingIntensity = z.infer<typeof ShadingIntensitySchema>;
export type LightDirection = z.infer<typeof LightDirectionSchema>;
export type WeaponProp = z.infer<typeof WeaponPropSchema>;
export type CharacterFigureLayer = z.infer<typeof CharacterFigureLayerSchema>;
export type SvgRawLayer = z.infer<typeof SvgRawLayerSchema>;
export type EffectKind = z.infer<typeof EffectKindSchema>;
export type EffectLayer = z.infer<typeof EffectLayerSchema>;
export type EmotionBadgeKind = z.infer<typeof EmotionBadgeKindSchema>;
export type EmotionBadgeLayer = z.infer<typeof EmotionBadgeLayerSchema>;
export type ImageRefLayer = z.infer<typeof ImageRefLayerSchema>;
export type VisualLayer = z.infer<typeof VisualLayerSchema>;
