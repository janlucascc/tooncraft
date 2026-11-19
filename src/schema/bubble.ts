import { z } from 'zod';
import { ColorSchema, PercentPointSchema } from './common.js';

/** Every text container used in manhwa lettering. */
export const BubbleTypeSchema = z.enum([
  /** Organic ellipse with solid outline. */
  'speech',
  /** Cloud outline + trail of shrinking dots. */
  'thought',
  /** Spiky starburst, bold uppercase text. */
  'shout',
  /** Dashed outline, smaller/translucent text. */
  'whisper',
  /** Rectangular caption box, no tail. */
  'narration',
  /** Holographic RPG-style window (double neon border + header). */
  'system_window',
  /** Messaging-app style rounded bubble. */
  'phone_chat',
  /** Ellipse with inner glow and soft double border. */
  'telepathy',
]);

export const TailStyleSchema = z.enum(['curved', 'sharp', 'jagged', 'dots', 'none']);

export const BubbleTailSchema = z.object({
  enabled: z.boolean().default(true),
  style: TailStyleSchema.default('curved'),
  /** Point (in panel %) the tail points to — usually the speaker's mouth. */
  target: PercentPointSchema.optional(),
  /** When the speaker is off-panel, point the tail toward this edge. */
  offscreenDirection: z.enum(['left', 'right', 'top', 'bottom']).optional(),
  /** Base width of the tail where it joins the bubble, in px. */
  width: z.number().min(8).max(40).default(18),
});

export const BubbleStyleOverrideSchema = z.object({
  fillColor: ColorSchema.optional(),
  strokeColor: ColorSchema.optional(),
  strokeWidth: z.number().min(0).max(8).optional(),
  textColor: ColorSchema.optional(),
  opacity: z.number().min(0.1).max(1).default(1),
  /** Header shown on `system_window` bubbles, e.g. "[ QUEST ALERT ]". */
  headerTitle: z.string().max(40).optional(),
});

export const BubbleSchema = z.object({
  id: z.string().min(1),
  /** Links the bubble to a cast member (inherits their bubble theme). */
  characterId: z.string().optional(),
  type: BubbleTypeSchema.default('speech'),
  /** Supports inline **bold**, *italic* and manual line breaks (\n). */
  text: z.string().min(1).max(280),
  /** Center of the bubble, in panel %. */
  position: PercentPointSchema,
  /** Maximum text width in px before wrapping. */
  maxWidth: z.number().int().min(120).max(600).default(280),
  fontSize: z.number().int().min(12).max(42).default(19),
  align: z.enum(['left', 'center', 'right']).default('center'),
  tail: BubbleTailSchema.optional(),
  style: BubbleStyleOverrideSchema.optional(),
  zIndex: z.number().int().min(0).max(100).default(50),
});

export type BubbleType = z.infer<typeof BubbleTypeSchema>;
export type TailStyle = z.infer<typeof TailStyleSchema>;
export type BubbleTail = z.infer<typeof BubbleTailSchema>;
export type BubbleStyleOverride = z.infer<typeof BubbleStyleOverrideSchema>;
export type Bubble = z.infer<typeof BubbleSchema>;
