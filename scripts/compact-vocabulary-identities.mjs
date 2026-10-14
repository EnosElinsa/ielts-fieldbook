import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

export function compactVocabularyIdentities(mapping) {
  const groups = new Map();
  const units = new Map(mapping.units.map((unit, index) => [unit.oldStorageId, index]));
  for (const member of mapping.memberships) {
    const split = member.oldId.lastIndexOf(':');
    const unit = units.get(member.oldId.slice(0, split));
    assert.notEqual(unit, undefined, `Unknown legacy group: ${member.oldId}`);
    const rows = groups.get(unit) || [];
    const sourceId = member.oldId.slice(split + 1);
    assert.equal(String(Number(sourceId)), sourceId, 'Legacy member identifiers must be losslessly numeric');
    assert.equal(member.id, `${mapping.units[unit].id}-member-${String(rows.length + 1).padStart(3, '0')}`);
    rows.push([Number(sourceId), member.entryId]);
    groups.set(unit, rows);
  }
  return { version: mapping.version, books: mapping.books, units: mapping.units, groups: [...groups] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const input = await readFile(path.join(root, 'src/domain/vocabulary/identityMapping.json'), 'utf8');
  const output = JSON.stringify(compactVocabularyIdentities(JSON.parse(input))) + '\n';
  const target = path.join(root, 'src/domain/vocabulary/identityRuntime.json');
  if (process.argv.includes('--check')) assert.equal(await readFile(target, 'utf8'), output, 'Run node scripts/compact-vocabulary-identities.mjs to refresh the compact mapping');
  else await writeFile(target, output);
  console.log(`Vocabulary identity resource: ${Buffer.byteLength(output)} bytes (authoring: ${Buffer.byteLength(input)} bytes)`);
}
