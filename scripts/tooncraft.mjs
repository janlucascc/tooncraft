#!/usr/bin/env node
/**
 * Skill helper entrypoint — forwards all CLI arguments to the built ToonCraft
 * CLI located next to this skill, so agents can invoke ToonCraft from any
 * working directory without requiring a global npm install.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = resolve(skillRoot, 'dist', 'cli', 'index.js');

if (!existsSync(cliPath)) {
  console.error(
    `✖ ToonCraft is not built yet at "${cliPath}". Run: cd "${skillRoot}" && npm install && npm run build`,
  );
  process.exit(1);
}

const res = spawnSync(process.execPath, [cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(res.status ?? 1);
