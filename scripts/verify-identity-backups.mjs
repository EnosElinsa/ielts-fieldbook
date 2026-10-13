import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';

const [beforeDirectory,afterDirectory,output]=process.argv.slice(2);
if(!beforeDirectory||!afterDirectory)throw new Error('Specify verified before and after backup directories.');
const mapping=JSON.parse(await readFile('src/domain/vocabulary/identityMapping.json','utf8'));
const source=(await readFile('src/domain/vocabulary/identities.ts','utf8')).replace("import mapping from './identityMapping.json';",`const mapping=${JSON.stringify(mapping)};`);
const transpiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {normalizeVocabularyIdentities,normalizeVocabularyRowId}=await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);
const before=JSON.parse(await readFile(resolve(beforeDirectory,'backup-manifest.json'),'utf8'));
const after=JSON.parse(await readFile(resolve(afterDirectory,'backup-manifest.json'),'utf8'));
const changed=new Set(['plans','vocabulary','vocabulary_states','vocabulary_evidence','vocabulary_reviews','vocabulary_activities','wordbook_progress','wordbook_enrollments','vocabulary_import_batches','vocabulary_sessions','drafts','wordbooks','wordbook_units','wordbook_memberships']);
const ids=new Set(['wordbook_progress','wordbook_enrollments','wordbooks','wordbook_units','wordbook_memberships']);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const report={passed:true,tables:{},checkedAt:new Date().toISOString()};
for(const table of Object.keys(before.tables)){
  const load=async(directory,manifest)=>{const bytes=await readFile(resolve(directory,`${table}.json`));assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.tables[table].sha256);return JSON.parse(bytes);};
  const original=await load(beforeDirectory,before);
  const current=await load(afterDirectory,after);
  assert.equal(current.length,original.length,`${table} count changed`);
  const expected=original.map(row=>{
    const converted=structuredClone(row);
    if(table==='profiles')converted.settings=normalizeVocabularyIdentities(row.settings);
    if(changed.has(table))converted.payload=normalizeVocabularyIdentities(row.payload);
    if(ids.has(table)){converted.id=normalizeVocabularyRowId(row.id);converted.payload.id=converted.id;}
    return converted;
  });
  assert.deepEqual(current.map(hash).sort(),expected.map(hash).sort(),`${table} full-row preservation failed`);
  report.tables[table]={count:current.length,fullRowsPreserved:true};
}
if(output)await writeFile(resolve(output),JSON.stringify(report,null,2)+'\n');
console.log(`Independent full-row identity verification passed across ${Object.keys(report.tables).length} tables.`);
