#!/usr/bin/env node
/**
 * Stream licensed Kaikki/Wiktionary JSONL records and emit a reviewable
 * enrichment file. The source file is not committed and the output includes
 * its attribution/license. This script never copies an entire dictionary.
 *
 * Usage: node scripts/enrich-vocabulary.mjs --input kaikki.jsonl --terms terms.txt --output enrichments.json
 */
import { createReadStream } from 'node:fs';
import { writeFile, rename, readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';

const args = Object.fromEntries(process.argv.slice(2).reduce((all,arg,index,argv) => {
  if (arg.startsWith('--')) all[arg.slice(2)] = argv[index+1]; return all;
}, {}));
if (!args.input || !args.terms || !args.output) throw new Error('Usage: --input dictionary.jsonl --terms terms.txt --output enrichments.json');
const termInput=await readFile(resolve(args.terms),'utf8');
const requestedTerms=/^\s*[\[{]/.test(termInput)?(()=>{const snapshot=JSON.parse(termInput);return (snapshot.records || snapshot.entries || snapshot.vocabulary || snapshot).map(item=>typeof item==='string'?item:item.term);})():termInput.split(/\r?\n/);
const terms = new Set(requestedTerms.map(term=>String(term || '').trim().toLowerCase()).filter(Boolean));
const enrichments = [];
let input;
if (/^https:\/\//.test(args.input)) {
  const url=new URL(args.input);
  if (url.hostname!=='kaikki.org') throw new Error('Dictionary downloads must use the official kaikki.org host.');
  const response=await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Dictionary download failed: HTTP ${response.status}`);
  input=Readable.fromWeb(response.body);
} else input=createReadStream(resolve(args.input),{encoding:'utf8'});
const lines = createInterface({input,crlfDelay:Infinity});
const english=(value)=>typeof value==='string' && !/[\u3400-\u9fff]/.test(value)?value.trim():'';
const relations=(value)=>Array.isArray(value)?value.map(item=>english(item.word || item)).filter(Boolean):[];
for await (const line of lines) {
  if (!line.trim()) continue;
  let item; try { item=JSON.parse(line); } catch { continue; }
  const term=String(item.word || item.lemma || '').trim();
  if (!terms.has(term.toLowerCase()) || (item.lang_code && item.lang_code!=='en')) continue;
  const senses=(item.senses || []).map((sense,index)=>({
    id:`kaikki:${item.pos || 'expression'}:${createHash('sha256').update(JSON.stringify([term,item.etymology_number,item.etymology_text,sense.glosses || sense.definition,index])).digest('hex').slice(0,16)}`,definition:english(sense.glosses?.[0] || sense.definition || ''),
    example:english(sense.examples?.[0]?.text || sense.examples?.[0] || ''),pos:english(item.pos || ''),
    synonyms:relations(sense.synonyms || item.synonyms),antonyms:relations(sense.antonyms || item.antonyms),
    source:'Kaikki.org English Wiktionary export',license:'CC-BY-SA-4.0',attribution:'English Wiktionary contributors',sourceUrl:`https://en.wiktionary.org/wiki/${encodeURIComponent(term)}`,
  })).filter(sense=>sense.definition);
  if (!senses.length) continue;
  const pronunciation=(item.sounds || []).map(sound=>({ipa:english(sound.ipa),tags:Array.isArray(sound.tags)?sound.tags.map(english).filter(Boolean):[]})).filter(sound=>sound.ipa);
  enrichments.push({term,senses,pronunciation,sourceUrl:'https://kaikki.org/dictionary/English/index.html',license:'CC-BY-SA-4.0'});
}
const output=resolve(args.output);
const temporary=`${output}.${process.pid}.tmp`;
await writeFile(temporary,`${JSON.stringify({schemaVersion:1,provider:'dictionary',generatedAt:new Date().toISOString(),source:'Kaikki.org English Wiktionary JSONL',license:'CC-BY-SA-4.0',entries:enrichments},null,2)}\n`,'utf8');
await rename(temporary,output);
console.log(`Wrote ${enrichments.length} licensed enrichments to ${args.output}`);
