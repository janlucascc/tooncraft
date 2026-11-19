import { z } from 'zod';
import { CanvasConfigSchema, ThemePresetSchema } from './common.js';
import { CharacterSchema } from './character.js';
import { PanelSchema } from './panel.js';

export const SCHEMA_VERSION = '1.0.0' as const;

/** Root document: one webtoon episode. */
export const WebtoonEpisodeSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
    title: z.string().min(1).max(120),
    episodeNumber: z.number().int().min(1).default(1),
    author: z.string().max(80).default('ToonCraft AI Director'),
    genre: z.string().max(40).default('Action'),
    synopsis: z.string().max(500).optional(),
    theme: ThemePresetSchema.default('dark-fantasy'),
    canvas: CanvasConfigSchema.prefault({}),
    cast: z.array(CharacterSchema).default([]),
    panels: z.array(PanelSchema).min(1).max(150),
  })
  .superRefine((ep, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });

    // 1. Unique cast ids.
    const castIds = new Set<string>();
    ep.cast.forEach((c, i) => {
      if (castIds.has(c.id)) issue(['cast', i, 'id'], `Duplicate character id "${c.id}"`);
      castIds.add(c.id);
    });

    // 2. Unique panel ids, unique bubble/sfx ids, valid character references.
    const panelIds = new Set<string>();
    const elementIds = new Set<string>();
    ep.panels.forEach((p, pi) => {
      if (panelIds.has(p.id)) issue(['panels', pi, 'id'], `Duplicate panel id "${p.id}"`);
      panelIds.add(p.id);

      p.bubbles.forEach((b, bi) => {
        if (elementIds.has(b.id))
          issue(['panels', pi, 'bubbles', bi, 'id'], `Duplicate bubble/sfx id "${b.id}"`);
        elementIds.add(b.id);
        if (b.characterId && !castIds.has(b.characterId))
          issue(
            ['panels', pi, 'bubbles', bi, 'characterId'],
            `Unknown characterId "${b.characterId}" — add it to "cast" first`,
          );
      });

      p.sfx.forEach((s, si) => {
        if (elementIds.has(s.id))
          issue(['panels', pi, 'sfx', si, 'id'], `Duplicate bubble/sfx id "${s.id}"`);
        elementIds.add(s.id);
      });

      p.layers.forEach((l, li) => {
        if (l.type === 'character_figure' && !castIds.has(l.characterId))
          issue(
            ['panels', pi, 'layers', li, 'characterId'],
            `Unknown characterId "${l.characterId}" — add it to "cast" first`,
          );
      });

      // 3. Custom pacing requires an explicit pixel value.
      if (p.pacingAfter === 'custom' && p.customPacingPx === undefined)
        issue(
          ['panels', pi, 'customPacingPx'],
          'pacingAfter is "custom" but customPacingPx is missing',
        );
    });
  });

/** Parsed (defaults applied) episode. */
export type WebtoonEpisode = z.output<typeof WebtoonEpisodeSchema>;
/** Authoring shape (what you write in story.json — defaults optional). */
export type WebtoonEpisodeInput = z.input<typeof WebtoonEpisodeSchema>;
