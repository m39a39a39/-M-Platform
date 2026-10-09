import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Check every authored JavaScript entry point, including unbundled studio scripts.
// Keep generated output and installed dependencies outside this list.
const sourceDirectories = ['backend', 'api', 'scripts', 'shared', 'mobile-app/src', 'mobile-app/public'];
let count = 0;

async function checkDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await checkDirectory(file);
    } else if (/\.(mjs|js)$/.test(file)) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`${file}\n${result.stderr}`);
      count++;
    }
  }
}

for (const directory of sourceDirectories) await checkDirectory(directory);
console.log(`Checked ${count} server, shared, frontend and build JavaScript files.`);
