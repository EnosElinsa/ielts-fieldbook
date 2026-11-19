import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = new Set(JSON.parse(fs.readFileSync(path.join(root, 'scripts/typecheck-baseline.json'), 'utf8')));
const current = [];
function scan(directory, includeTests = false) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(absolute, includeTests);
    else if (/\.tsx?$/.test(entry.name) && (includeTests || !/\.(test|spec)\.tsx?$/.test(entry.name))
      && /@ts-nocheck\b/.test(fs.readFileSync(absolute, 'utf8'))) current.push(path.relative(root, absolute).replaceAll('\\', '/'));
  }
}
scan(path.join(root, 'src'));
for (const directory of ['functions', 'e2e']) {
  if (fs.existsSync(path.join(root, directory))) scan(path.join(root, directory), true);
}
for (const file of ['playwright.config.ts', 'tests/diagnostics.test.ts', 'tests/diagnosticsClient.test.ts']) {
  if (/@ts-nocheck\b/.test(fs.readFileSync(path.join(root, file), 'utf8'))) current.push(file);
}
const added = current.filter(file => !baseline.has(file));
if (added.length) {
  console.error(`New @ts-nocheck suppressions are prohibited:\n${added.join('\n')}`);
  process.exitCode = 1;
} else console.log(`Type safety: ${current.length} grandfathered files; no new @ts-nocheck suppressions.`);
