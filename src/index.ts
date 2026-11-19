/**
 * ToonCraft — Code-as-Webtoon engine.
 *
 * Public programmatic API for validating, composing, rendering to HTML5 and
 * exporting smart-sliced Webtoon PNG/WebP strips.
 */

export * from './schema/index.js';
export { THEMES, resolveTheme, type ResolvedTheme, type ThemeOverrides } from './templates/themes.js';
export { createPrng, seededPick, seededRange, type Prng } from './engine/prng.js';
export {
  PACING_PX,
  computeEpisodeLayout,
  layoutPanelBubbles,
  resolvePacingPx,
  type EpisodeLayout,
  type GutterLayout,
  type LayoutOptions,
  type PanelLayout,
  type ProtectedBand,
} from './engine/pacing-layout.js';
export { renderPanelSvg, renderGutterSvg, type PanelRenderOptions } from './engine/panel-renderer.js';
export {
  composeEpisode,
  ToonCraftValidationError,
  type ComposeOptions,
  type ComposedEpisode,
  type ComposedPanel,
} from './engine/composer.js';
export { renderToHtml, type HtmlRenderOptions } from './engine/html-renderer.js';
export {
  computeSmartSlices,
  exportToImages,
  rasterizeSvgToPng,
  type ExportImageOptions,
  type ExportMode,
  type ExportResult,
  type ExportedSlice,
  type ImageFormat,
  type SliceRange,
} from './engine/image-exporter.js';
export { sanitizeSvgMarkup, ALLOWED_TAGS, type SanitizeOptions, type SanitizeResult } from './components/scenes/svg-sanitizer.js';
export {
  FONT_FACES,
  FONT_SETS,
  getAllFontPaths,
  getFontPath,
  getFontsDir,
  measureTextLine,
  parseInlineMarkup,
  wrapBalanced,
  wrapTextToWidth,
  type FontFamilySet,
  type FontKey,
  type WrapOptions,
  type WrapResult,
} from './components/font-metrics.js';
