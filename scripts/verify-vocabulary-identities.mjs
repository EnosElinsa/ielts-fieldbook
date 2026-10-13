import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const catalog=JSON.parse(fs.readFileSync('public/vocabulary-catalog.json','utf8'));
const prior=JSON.parse(execFileSync('git',['show','HEAD:public/vocabulary-catalog.json'],{encoding:'utf8',maxBuffer:30*1024*1024}));
const mappingPath='src/domain/vocabulary/identityMapping.json';
const mapping=JSON.parse(fs.readFileSync(mappingPath,'utf8'));
assert.equal(mapping.books.length,6); assert.equal(mapping.units.length,206); assert.equal(mapping.memberships.length,9205);
assert.deepEqual(catalog.entries,prior.entries);
assert.deepEqual(catalog.memberships.map(row=>[row.entryId,row.order,row.sourceWordId,row.source,row.verifiedSourceMembership]),prior.memberships.map(row=>[row.entryId,row.order,row.sourceWordId,row.source,row.verifiedSourceMembership]));
for(const unit of catalog.units) { assert(mapping.units.some(row=>row.id===unit.id)); assert(catalog.books.some(book=>book.id===unit.bookId)); if(unit.parentId) assert(catalog.units.some(row=>row.id===unit.parentId)); }
for(const row of catalog.memberships) { assert(mapping.memberships.some(member=>member.id===row.id)); assert(catalog.units.some(unit=>unit.id===row.unitId&&unit.bookId===row.bookId)); }
const evidence={books:catalog.books.length,units:catalog.units.length,memberships:catalog.memberships.length,entries:catalog.entries.length,senses:catalog.entries.reduce((sum,row)=>sum+row.senses.length,0),entryContentSha256:createHash('sha256').update(JSON.stringify(catalog.entries)).digest('hex'),mappingSha256:createHash('sha256').update(fs.readFileSync(mappingPath)).digest('hex')};
console.log(JSON.stringify(evidence,null,2));
