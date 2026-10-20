import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
// @ts-expect-error Executable audit is an ES module.
import { inspectDictionaryReview } from '../../scripts/audit-vocabulary-dictionary.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,stable(v)])):value;
const fingerprint=value=>hash(stable(value));
const editable=['definition','example','pos','collocations','usage','synonyms','antonyms','distinctions','distinctionTask','wordFamily','register'];
const project=sense=>Object.fromEntries(['id',...editable].filter(k=>Object.hasOwn(sense,k)).map(k=>[k,sense[k]]));
const editorial={source:'Fieldbook core content review',license:'CC-BY-4.0',attribution:'Fieldbook editorial contributors'};
const raw={id:'river',definition:'Land beside a river.',example:'',pos:'noun'};
const reviewed={...raw,definition:'Land along a river.',example:'We sat on the river bank.',collocations:['river bank'],distinctions:['Shore is usual beside a sea.']};
const sourceScope={kind:'dictionary-source'},groupScope={kind:'group',bookId:'book',unitId:'unit'};
function variant(id,before,after,scopes,meta={}){return {entryId:'bank',senseId:raw.id,variantId:id,...Object.fromEntries(editable.filter(k=>Object.hasOwn(after,k)).map(k=>[k,after[k]])),originalSense:raw,previousSenses:[before],...meta,contentVariant:{schemaVersion:1,workItemId:id,sourceView:scopes.some(s=>s.kind==='dictionary-source'),sourceHash:hash(raw),beforeContent:project(before),afterContent:project(after),beforeDisplayHash:fingerprint(before),reviewedMaterialHash:fingerprint(after),afterDisplayHash:fingerprint({...after,editorial}),scopes}};}
const review={term:'bank',entryId:'bank',senseId:raw.id,sourceHash:hash(raw),reviewedAreas:['definition','example','collocations','distinctions']};
const input={entries:[{id:'bank',term:'bank'}],dictionaries:{bank:{senses:[raw]}},corrections:[],records:[],diagrams:[]};
test('canonical source and same-ID group siblings are separately checked',()=>{
 const s=variant('source',raw,reviewed,[sourceScope]); const group={...reviewed,example:'A bank stores money.',collocations:[],distinctions:[]};
 const g=variant('course',group,group,[groupScope]);
 const result=inspectDictionaryReview({...input,corrections:[s,g],records:[review]});
 assert.deepEqual(result.errors,[]);assert.equal(result.summary.reviewed,1);
});
test('a complete group variant cannot authorise a source ledger record',()=>{
 const g=variant('course',reviewed,reviewed,[groupScope]);
 const result=inspectDictionaryReview({...input,corrections:[g],records:[review]});
 assert.match(result.errors.join(' '),/missing supplement/i);assert.equal(result.summary.reviewed,0);
});
test('accepted partial variant priority does not require a full dictionary ledger',()=>{
 const result=inspectDictionaryReview({...input,corrections:[variant('source',raw,{...raw,example:'Reading note: river bank is land beside a river.'},[sourceScope],{learningPriority:'general',exampleKind:'reading-note'})]});
 assert.deepEqual(result.errors,[]);assert.equal(result.summary.reviewed,0);assert.equal(result.summary.pending,1);
});
test('legacy registration remains available underneath a source variant',()=>{
 const legacy={entryId:'bank',senseId:raw.id,originalSense:raw,...reviewed};
 const result=inspectDictionaryReview({...input,corrections:[legacy,variant('source',reviewed,reviewed,[sourceScope])],records:[review]});
 assert.deepEqual(result.errors,[]);assert.equal(result.summary.reviewed,1);
});
test('registration identity is independent of frozen review-work receipt identity',()=>{
 const s=variant('source',raw,reviewed,[sourceScope]);
 for(const variantId of ['retained:vq:receipt','heading:bank:river','selection:vq:receipt']) {
  const result=inspectDictionaryReview({...input,corrections:[{...s,variantId,contentVariant:{...s.contentVariant,workItemId:'vq:frozen-work'}}],records:[review]});
  assert.deepEqual(result.errors,[]);
 }
});
test('evidence-bound restored priority is independent of a full source-content ledger',()=>{
 const restored={id:'child',definition:'A river edge.',example:'',pos:'noun',sourceUrl:'https://en.wiktionary.org/w/index.php?title=bank&oldid=123',source:'English Wiktionary, restored submeaning',license:'CC-BY-SA-4.0',attribution:'English Wiktionary contributors'};
 const evidence={term:'bank',entryId:'bank',parentSenseId:raw.id,parentSourceHash:hash(raw),revision:123,sourcePage:'bank',sourceGloss:'## A river edge.',sense:restored};
 const row={entryId:'bank',senseId:restored.id,originalSense:restored,dictionaryParentSenseId:raw.id,definition:restored.definition,example:'The river edge is steep.',pos:'noun',learningPriority:'general'};
 const result=inspectDictionaryReview({...input,corrections:[row],restoredSources:[evidence]});
 assert.deepEqual(result.errors,[]);assert.equal(result.summary.reviewed,0);assert.equal(result.summary.restoredSenses,1);
});
test('duplicate full variant identities and ambiguous canonical sources fail',()=>{
 const s=variant('source',raw,reviewed,[sourceScope]);
 assert.match(inspectDictionaryReview({...input,corrections:[s,s]}).errors.join(' '),/duplicate supplement/i);
 assert.match(inspectDictionaryReview({...input,corrections:[s,{...s,variantId:'other',contentVariant:{...s.contentVariant,workItemId:'other'}}]}).errors.join(' '),/ambiguous canonical/i);
});
test('invalid complete snapshots and scope/source provenance fail even without a ledger',()=>{
 const s=variant('source',raw,reviewed,[sourceScope]);
 for(const patch of [{scopes:[groupScope]},{beforeContent:{...project(raw),usage:'unreviewed'}},{sourceHash:'f'.repeat(64)},{afterContent:{...project(reviewed),usage:'unreviewed'}}]){
  assert.ok(inspectDictionaryReview({...input,corrections:[{...s,contentVariant:{...s.contentVariant,...patch}}]}).errors.length,JSON.stringify(patch));
 }
});
test('malformed variant scope containers report errors without crashing',()=>{
 const s=variant('source',raw,reviewed,[sourceScope]);
 for(const scopes of [null,{},'dictionary-source',[null],[{kind:'group'}]]) assert.ok(inspectDictionaryReview({...input,corrections:[{...s,contentVariant:{...s.contentVariant,scopes}}]}).errors.length);
});
test('a structural source variant may remove old optional teaching without reviving it',()=>{
 const before={...raw,usage:'Old learning note.',collocations:['old cue'],distinctions:['Old comparison.']};
 const result=inspectDictionaryReview({...input,corrections:[variant('structural',before,raw,[sourceScope])]});
 assert.deepEqual(result.errors,[]);assert.equal(result.summary.reviewed,0);
});
test('pending structural headings are checked without forcing full review areas',()=>{
 const s=variant('heading:bank:river',raw,raw,[sourceScope],{meaningGroup:{sourceGloss:'# Not a source heading.'}});
 assert.match(inspectDictionaryReview({...input,corrections:[s]}).errors.join(' '),/meaning group/i);
});
