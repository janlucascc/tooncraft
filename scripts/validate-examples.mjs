import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const examplesRoot = join(process.cwd(), 'examples');
const dirs = readdirSync(examplesRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

let failed = 0;
for (const dir of dirs) {
  const story = join(examplesRoot, dir, 'story.json');
  const res = spawnSync(process.execPath, ['dist/cli/index.js', 'validate', story, '--strict-svg'], {
    stdio: 'inherit',
  });
  if (res.status !== 0) failed += 1;
}

if (failed > 0) {
  console.error(`✖ ${failed} example(s) failed validation.`);
  process.exit(1);
}
console.log(`✔ All ${dirs.length} examples passed strict validation.`);
