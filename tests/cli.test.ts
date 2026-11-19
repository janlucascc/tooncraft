import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const CLI = join(process.cwd(), 'src', 'cli', 'index.ts');
const TSX = join(process.cwd(), 'node_modules', '.bin', 'tsx');
const tempDirs: string[] = [];

function runCli(args: string[]) {
  return spawnSync(TSX, [CLI, ...args], { encoding: 'utf8' });
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('tooncraft CLI', () => {
  it('validates examples with --json and --strict-svg', () => {
    const res = runCli(['validate', 'examples/02-dramatic-pause/story.json', '--strict-svg', '--json']);
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.valid).toBe(true);
    expect(parsed.panels).toBe(4);
    expect(parsed.svgWarnings).toEqual([]);
  });

  it('inspects an episode and emits JSON metrics', () => {
    const res = runCli(['inspect', 'examples/03-system-awakening/story.json', '--json']);
    expect(res.status).toBe(0);
    const report = JSON.parse(res.stdout);
    expect(report.dimensions.width).toBe(800);
    expect(report.counts.panels).toBe(3);
    expect(report.counts.estimatedSlices).toBeGreaterThanOrEqual(2);
  });

  it('initializes a starter story.json and renders it to HTML + PNG slices', () => {
    const work = mkdtempSync(join(tmpdir(), 'tooncraft-cli-'));
    tempDirs.push(work);

    const initRes = runCli(['init', work]);
    expect(initRes.status).toBe(0);
    const storyPath = join(work, 'story.json');
    expect(existsSync(storyPath)).toBe(true);

    const outDir = join(work, 'rendered');
    const renderRes = runCli([
      'render',
      storyPath,
      '--format',
      'html',
      '--no-embed-fonts',
      '--out',
      outDir,
      '--json',
    ]);
    expect(renderRes.status).toBe(0);
    const summary = JSON.parse(renderRes.stdout);
    expect(summary.ok).toBe(true);
    expect(existsSync(join(outDir, 'index.html'))).toBe(true);
    expect(readFileSync(join(outDir, 'index.html'), 'utf8')).toContain('Untitled Awakening');
  });
});
