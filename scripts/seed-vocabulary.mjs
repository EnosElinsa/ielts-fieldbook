#!/usr/bin/env node
/**
 * Seed public catalogue tables through Supabase's administrator API.
 * Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the deployment environment.
 * Personal provider snapshots and credentials never enter this seed.
 */
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

try {
  const env = await readFile(new URL('../.env', import.meta.url), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const pair = line.match(/^([A-Z_]+)=(.*)$/);
    if (pair && !process.env[pair[1]]) process.env[pair[1]] = pair[2].trim().replace(/^['"]|['"]$/g, '');
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const endpoint = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!endpoint || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for a deployment job.');
const source = await readFile(new URL('../src/domain/vocabulary/catalog.ts', import.meta.url),'utf8');
const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const { VOCABULARY_CATALOG } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const url=new URL(endpoint);
if (url.protocol!=='https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Use HTTPS for a remote seed endpoint.');
const client=createClient(endpoint,key,{auth:{persistSession:false,autoRefreshToken:false}});
let catalogue=VOCABULARY_CATALOG;
try { catalogue=JSON.parse(await readFile(new URL('../public/vocabulary-catalog.json',import.meta.url),'utf8')); } catch(error) { if(error.code!=='ENOENT')throw error; }
const {entries,books,units,memberships}=catalogue;
if(entries.some(entry=>entry.sources?.some(source=>source.accountId||source.type==='assessment')) || entries.some(entry=>entry.history||entry.wrongCount||entry.records))throw new Error('A public catalogue cannot contain personal learning records.');
const senses=entries.flatMap(entry=>entry.senses.map(sense=>({...sense,id:`${entry.id}:${sense.id}`,entryId:entry.id})));
if (senses.some(sense=>sense.definition && !['CC-BY-4.0','CC-BY-SA-4.0'].includes(sense.license))) throw new Error('Public definitions must retain a supported open license.');
const relations=senses.flatMap(sense=>['synonyms','antonyms','collocations','distinctions'].flatMap(kind=>(sense[kind] || []).map((value,index)=>({id:`${sense.id}:${kind}:${index}`,entryId:sense.entryId,senseId:sense.id,kind,value,source:sense.source,license:sense.license}))));
const enrichments=entries.map(entry=>({id:entry.id,entryId:entry.id,status:entry.enrichmentPending?'pending':'available',source:entry.senses?.[0]?.source,license:entry.senses?.[0]?.license,enrichmentPending:Boolean(entry.enrichmentPending)}));
const tables={word_entries:entries,word_senses:senses,word_relations:relations,word_enrichments:enrichments,wordbooks:books,wordbook_units:units.map(unit=>({...unit,id:`${unit.bookId}:${unit.id}`,sourceUnitId:unit.id})),wordbook_memberships:memberships};
for (const [table,records] of Object.entries(tables)) {
  console.log(`Seeding ${table}: ${records.length} rows.`);
  for (let offset=0;offset<records.length;offset+=200) {
    const rows=records.slice(offset,offset+200).map(record=>({id:record.id,payload:record}));
    const {error}=await client.from(table).upsert(rows,{onConflict:'id'});
    if (error) throw new Error(`Vocabulary seed failed for ${table}: ${error.code || 'database error'}`);
  }
}
console.log(`Seeded ${entries.length} vocabulary entries and ${books.length} source-book metadata records.`);
