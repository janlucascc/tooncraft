import { type FormattedIssue, validateEpisode } from '../schema/index.js';
import type { Character } from '../schema/character.js';
import type { Panel } from '../schema/panel.js';
import type { WebtoonEpisode } from '../schema/story.js';
import { type ResolvedTheme, resolveTheme } from '../templates/themes.js';
import {
  type EpisodeLayout,
  type GutterLayout,
  type LayoutOptions,
  type PanelLayout,
  computeEpisodeLayout,
} from './pacing-layout.js';
import { renderGutterSvg, renderPanelSvg } from './panel-renderer.js';

export class ToonCraftValidationError extends Error {
  constructor(public readonly issues: FormattedIssue[]) {
    super(
      `Invalid ToonCraft episode (${issues.length} issue${issues.length === 1 ? '' : 's'}):\n` +
        issues.map((i) => `  • ${i.path}: ${i.message}`).join('\n'),
    );
    this.name = 'ToonCraftValidationError';
  }
}

export interface ComposedPanel {
  panel: Panel;
  layout: PanelLayout;
  svg: string;
  gutterAfter?: {
    layout: GutterLayout;
    svg: string;
  };
}

export interface ComposedEpisode {
  episode: WebtoonEpisode;
  theme: ResolvedTheme;
  layout: EpisodeLayout;
  panels: ComposedPanel[];
  warnings: string[];
}

export interface ComposeOptions extends LayoutOptions {
  /** Base directory for resolving local `image_ref` paths when `allowImages` is true. */
  baseDir?: string;
  /** Opt-in flag for local `image_ref` layers (false by default). */
  allowImages?: boolean;
}

/**
 * Validate and compose a full webtoon episode into panel SVGs, transition
 * gutters, layout coordinates and smart-slicer cut data.
 */
export function composeEpisode(input: unknown, options: ComposeOptions = {}): ComposedEpisode {
  const checked = validateEpisode(input);
  if (!checked.success) throw new ToonCraftValidationError(checked.errors);
  const episode = checked.data;

  const theme = resolveTheme(episode.theme, {
    backgroundColor: episode.canvas.backgroundColor,
    fontPreset: episode.canvas.fontPreset,
  });

  const cast = new Map<string, Character>();
  for (const c of episode.cast) cast.set(c.id, c);

  const layout = computeEpisodeLayout(episode, theme, options);
  const warnings: string[] = [];

  const panels: ComposedPanel[] = episode.panels.map((panel, idx) => {
    const pLayout = layout.panels[idx]!;
    const svg = renderPanelSvg({
      panel,
      layout: pLayout,
      theme,
      defaultMarginX: episode.canvas.defaultMarginX,
      cast,
      baseDir: options.baseDir,
      allowImages: options.allowImages,
      warnings,
    });

    const gutterAfter = pLayout.gutterAfter
      ? {
          layout: pLayout.gutterAfter,
          svg: renderGutterSvg(pLayout.gutterAfter, layout.width, theme, idx),
        }
      : undefined;

    return { panel, layout: pLayout, svg, gutterAfter };
  });

  return { episode, theme, layout, panels, warnings };
}
