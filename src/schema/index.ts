import type { z } from 'zod';
import { WebtoonEpisodeSchema, type WebtoonEpisode } from './story.js';

export * from './common.js';
export * from './character.js';
export * from './bubble.js';
export * from './sfx.js';
export * from './visual-layer.js';
export * from './panel.js';
export * from './story.js';

/** A validation error with a human/agent-friendly path. */
export interface FormattedIssue {
  /** Dotted path, e.g. `panels[2].bubbles[0].position.x`. */
  path: string;
  message: string;
  code: string;
}

export type ValidationResult =
  | { success: true; data: WebtoonEpisode }
  | { success: false; errors: FormattedIssue[] };

export function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else out += out ? `.${String(seg)}` : String(seg);
  }
  return out || '(root)';
}

export function formatIssues(error: z.ZodError): FormattedIssue[] {
  return error.issues.map((i) => ({
    path: formatPath(i.path),
    message: i.message,
    code: i.code,
  }));
}

/** Validate unknown input against the episode schema, applying defaults. */
export function validateEpisode(input: unknown): ValidationResult {
  const result = WebtoonEpisodeSchema.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  return { success: false, errors: formatIssues(result.error) };
}
