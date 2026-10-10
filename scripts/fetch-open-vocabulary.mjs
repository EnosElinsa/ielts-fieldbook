import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { parseFragment } from 'parse5';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);

const source = await readFile(new URL('../src/domain/vocabulary/catalog.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { VOCABULARY_CATALOG } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const plain = html => {
  const walk = node => node.nodeName === '#text' ? node.value : (node.childNodes || []).map(walk).join('');
  return walk(parseFragment(html || '')).replace(/\s+/g, ' ').trim();
};
const results = [];
const failures = [];
let previous;
try { previous = JSON.parse(await readFile(new URL('../public/vocabulary-dictionary.json', import.meta.url), 'utf8')); } catch { previous = null; }
if (previous?.entries) results.push(...previous.entries);
const previousTerms = new Set(results.map(entry => entry.term));
const requested = VOCABULARY_CATALOG.entries.filter(entry => !previousTerms.has(entry.term));
let cursor = 0;
async function worker() {
  while (cursor < requested.length) {
    const entry = requested[cursor++];
    const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(entry.term.replaceAll(' ', '_'))}`;
    try {
      let data;
      if (process.platform === 'win32') {
        const escaped = url.replaceAll("'", "''");
        const result = await execute('pwsh.exe', ['-NoProfile', '-Command', `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); $ErrorActionPreference = 'Stop'; (Invoke-WebRequest -Uri '${escaped}' -TimeoutSec 20).Content`], { timeout: 25000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
        data = JSON.parse(result.stdout.replace(/^\ufeff/, '').trim());
      } else {
        const response = await fetch(url, { headers: { 'User-Agent': 'IELTS-Fieldbook/1.0 (open vocabulary educational catalogue)' }, signal: AbortSignal.timeout(20000) });
        if (!response.ok) { failures.push({ term: entry.term, status: response.status }); continue; }
        data = await response.json();
      }
      const senses = (data.en || []).flatMap((group, groupIndex) => (group.definitions || []).map((definition, index) => {
        const text = plain(definition.definition);
        return { id: `wiktionary:${createHash('sha256').update(`${entry.term}:${groupIndex}:${index}:${text}`).digest('hex').slice(0,16)}`, definition: text, example: plain(definition.parsedExamples?.[0]?.example || definition.examples?.[0] || ''), pos: group.partOfSpeech.toLowerCase(), source: 'English Wiktionary', sourceUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(entry.term.replaceAll(' ', '_'))}#English`, attribution: 'English Wiktionary contributors', license: 'CC-BY-SA-4.0' };
      })).filter(sense => sense.definition && !/[\u3400-\u9fff]/u.test(sense.definition));
      if (senses.length) results.push({ term: entry.term, senses });
      else failures.push({ term: entry.term, status: 'no-English-senses' });
    } catch (error) { failures.push({ term: entry.term, status: error.code || error.name || 'unavailable' }); }
    if ((results.length + failures.length) % 12 === 0) console.log(`Read ${results.length + failures.length}/${VOCABULARY_CATALOG.entries.length} terms.`);
  }
}
await worker();
results.sort((a,b) => a.term.localeCompare(b.term));
const output = new URL('../public/vocabulary-dictionary.json', import.meta.url);
const temporary = new URL('../public/vocabulary-dictionary.json.tmp', import.meta.url);
await writeFile(temporary, `${JSON.stringify({ schemaVersion: 1, provider: 'dictionary', retrievedAt: new Date().toISOString(), source: 'English Wiktionary REST definitions', entries: results, failures }, null, 2)}\n`, 'utf8');
await rename(temporary, output);
console.log(`Fetched ${results.length} English entries, ${results.reduce((sum,entry)=>sum+entry.senses.length,0)} senses; ${failures.length} unavailable.`);
