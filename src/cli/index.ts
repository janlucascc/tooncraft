#!/usr/bin/env node
import { Command } from 'commander';
import { runValidate } from './commands/validate.js';
import { type RenderFormatOption, runRender } from './commands/render.js';
import { runInit } from './commands/init.js';
import { runInspect } from './commands/inspect.js';
import type { ExportMode } from '../engine/image-exporter.js';

const program = new Command();

program
  .name('tooncraft')
  .description('Code-as-Webtoon engine: turn story JSON into vertical-scroll SVG webtoons.')
  .version('0.1.0');

program
  .command('validate')
  .description('Validate a story.json file against the strict ToonCraft Zod schema')
  .argument('<file>', 'Path to story.json')
  .option('--strict-svg', 'Fail if any svg_raw layer triggers sanitizer warnings', false)
  .option('--json', 'Emit machine-readable JSON output', false)
  .action((file: string, opts: { strictSvg?: boolean; json?: boolean }) => {
    process.exitCode = runValidate(file, opts);
  });

program
  .command('render')
  .description('Render a story.json into an interactive HTML reader and/or PNG/WebP slices')
  .argument('<file>', 'Path to story.json')
  .option('-f, --format <format>', 'Output format: html | png | webp | all', 'html')
  .option('-m, --mode <mode>', 'Image export mode: sliced | strip | both', 'sliced')
  .option('-o, --out <dir>', 'Output directory', './out')
  .option('--no-embed-fonts', 'Skip base64 font embedding in HTML output')
  .option('--allow-images', 'Allow local image_ref layers', false)
  .option('--json', 'Emit machine-readable JSON summary', false)
  .action(
    async (
      file: string,
      opts: {
        format: string;
        mode: string;
        out: string;
        embedFonts: boolean;
        allowImages: boolean;
        json: boolean;
      },
    ) => {
      const validFormats: RenderFormatOption[] = ['html', 'png', 'webp', 'all'];
      const validModes: ExportMode[] = ['sliced', 'strip', 'both'];
      if (!validFormats.includes(opts.format as RenderFormatOption)) {
        console.error(`✖ Invalid --format "${opts.format}". Expected: ${validFormats.join(' | ')}`);
        process.exitCode = 1;
        return;
      }
      if (!validModes.includes(opts.mode as ExportMode)) {
        console.error(`✖ Invalid --mode "${opts.mode}". Expected: ${validModes.join(' | ')}`);
        process.exitCode = 1;
        return;
      }
      process.exitCode = await runRender(file, {
        format: opts.format as RenderFormatOption,
        mode: opts.mode as ExportMode,
        out: opts.out,
        embedFonts: opts.embedFonts,
        allowImages: opts.allowImages,
        json: opts.json,
      });
    },
  );

program
  .command('init')
  .description('Create a starter story.json template in the target directory')
  .argument('[dir]', 'Target directory', '.')
  .option('--force', 'Overwrite existing story.json', false)
  .action((dir: string, opts: { force?: boolean }) => {
    process.exitCode = runInit(dir, opts);
  });

program
  .command('inspect')
  .description('Show episode metrics: dimensions, pacing breakdown, cast and smart-slice plan')
  .argument('<file>', 'Path to story.json')
  .option('--json', 'Emit machine-readable JSON report', false)
  .action((file: string, opts: { json?: boolean }) => {
    process.exitCode = runInspect(file, opts);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
