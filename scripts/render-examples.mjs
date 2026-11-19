import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const examplesRoot = join(process.cwd(), 'examples');
const outRoot = join(process.cwd(), 'output', 'examples');
const dirs = readdirSync(examplesRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

for (const dir of dirs) {
  const story = join(examplesRoot, dir, 'story.json');
  const out = join(outRoot, dir);
  const res = spawnSync(
    process.execPath,
    ['dist/cli/index.js', 'render', story, '--format', 'all', '--mode', 'sliced', '--out', out],
    { stdio: 'inherit' },
  );
  if (res.status !== 0) process.exit(res.status ?? 1);
}
console.log(`✔ Rendered all ${dirs.length} examples into ${outRoot}`);
