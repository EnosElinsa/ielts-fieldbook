import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';

test('Kaikki import uses the specific meaning below a grouping heading and excludes standalone headings', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fieldbook-dictionary-'));
  try {
    const input = { word: 'form', lang_code: 'en', pos: 'noun', senses: [
      { glosses: ['To do with shape.', 'The shape or visible structure of a thing.'], tags: ['heading'], examples: [{ text: 'The sculpture has a curved form.' }] },
      { glosses: ['To do with structure or procedure.', 'Level of performance.'], examples: [{ text: 'The team is in good form.' }] },
      { glosses: ['To do with shape.'], tags: ['heading'] },
      { definition: 'A blank document to be completed.' },
    ] };
    writeFileSync(path.join(dir, 'source.jsonl'), JSON.stringify(input) + '\n');
    writeFileSync(path.join(dir, 'terms.txt'), 'form\n');
    execFileSync(process.execPath, ['scripts/enrich-vocabulary.mjs', '--input', path.join(dir, 'source.jsonl'), '--terms', path.join(dir, 'terms.txt'), '--output', path.join(dir, 'out.json')], { windowsHide: true });
    const [entry] = JSON.parse(readFileSync(path.join(dir, 'out.json'), 'utf8')).entries;
    expect(entry.senses.map((sense: any) => sense.definition)).toEqual([
      'The shape or visible structure of a thing.', 'Level of performance.', 'A blank document to be completed.',
    ]);
    expect(entry.senses[1].example).toBe('The team is in good form.');
    expect(entry.senses.every((sense: any) => sense.license === 'CC-BY-SA-4.0' && sense.attribution)).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
