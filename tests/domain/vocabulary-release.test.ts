import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

test('release catalogue contains full source membership without personal history',()=>{
  const catalogue=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
  expect(catalogue.books.map((book:{importedEntryCount:number})=>book.importedEntryCount)).toEqual([3632,376,3051,1399,361,386]);
  expect(catalogue.memberships).toHaveLength(9205);
  expect(catalogue.entries).toHaveLength(7021);
  expect(new Set(catalogue.entries.map((entry:{id:string})=>entry.id)).size).toBe(7021);
  for(const entry of catalogue.entries){
    expect(entry).not.toHaveProperty('records');expect(entry).not.toHaveProperty('history');expect(entry).not.toHaveProperty('wrongCount');
  }
  expect(JSON.stringify(catalogue)).not.toMatch(/[\u3400-\u9fff]/u);
});

test('released dictionary files preserve licensed English sense attribution',()=>{
  const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
  expect(Object.keys(index)).toHaveLength(5853);
  const sample=JSON.parse(readFileSync(`public/dictionary/${index.accommodation}`,'utf8'));
  expect(sample.senses.length).toBeGreaterThan(1);
  for(const sense of sample.senses){expect(sense.sourceUrl).toMatch(/^https:\/\/en.wiktionary.org/);expect(sense.license).toBe('CC-BY-SA-4.0');expect(sense.attribution).toBeTruthy();}
});
