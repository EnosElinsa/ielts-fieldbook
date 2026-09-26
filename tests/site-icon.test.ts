import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the tab and the home screen use the navy F', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /rel="icon" href="\/favicon\.svg"/);
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
  assert.equal(html.includes('data:,'), false);

  const svg = readFileSync('public/favicon.svg', 'utf8');
  assert.match(svg, /#143848/i);
  assert.match(svg, /#fbf8f2/i);
  assert.match(svg, /<path/i);

  const png = readFileSync('public/apple-touch-icon.png');
  assert.equal(png.readUInt32BE(16), 180);
  assert.equal(png.readUInt32BE(20), 180);
});
