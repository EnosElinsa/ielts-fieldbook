import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { parse } from 'parse5';

const directory = resolve(process.argv[2] || 'dist');
const document = parse(await readFile(resolve(directory, 'index.html'), 'utf8'));
const paths = new Set();
function visit(node) {
  const attrs = Object.fromEntries((node.attrs || []).map(attr => [attr.name, attr.value]));
  const asset = node.tagName === 'script' ? attrs.src : node.tagName === 'link' && attrs.rel === 'modulepreload' ? attrs.href : undefined;
  if (asset?.endsWith('.js')) paths.add(asset.replace(/^\//, ''));
  (node.childNodes || []).forEach(visit);
}
visit(document);
let bytes = 0;
for (const path of paths) {
  const code = await readFile(resolve(directory, path));
  bytes += gzipSync(code).length;
  if (/groupCurriculum|readinessContent|wavesurfer|Could not load your workspace/.test(code.toString())) {
    throw new Error(`Authenticated or teaching content leaked into login asset: ${path}`);
  }
}
console.log(`Login JS gzip: ${bytes} bytes (${paths.size} assets)`);
if (bytes > 300 * 1024) throw new Error('Login JS exceeds 300 KiB gzip budget');
const assets = await Promise.all((await readdir(resolve(directory, 'assets'))).filter(name => name.endsWith('.js')).map(async name => ({ name, bytes: (await stat(resolve(directory, 'assets', name))).size })));
const largest = assets.sort((left, right) => right.bytes - left.bytes)[0];
console.log(`Largest JS asset: ${largest.name} (${largest.bytes} bytes)`);
if (largest.bytes > 500 * 1024) throw new Error('A JS asset exceeds the 500 KiB runtime budget');
