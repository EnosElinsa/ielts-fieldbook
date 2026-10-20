import {expect,test} from 'vitest';
import {registerVocabularyTeaching,vocabularyTeaching,type ReadinessSupplement} from '../../src/domain/vocabulary/runtimeData';
import {hasVocabularySenseEdits} from '../../src/domain/vocabulary/content';
import {isVocabularyMeaningGroup,supplementVocabularySense} from '../../src/domain/vocabulary/readiness';
import type {VocabularySense} from '../../src/domain/vocabulary/types';

test('a source heading correction cannot overwrite distinct public course teaching that reuses its ID',()=>{
  const row=vocabularyTeaching.readiness.corrections.find(item=>item.meaningGroup)!;
  expect(row.originalSense).toBeDefined();
  const course:VocabularySense={...row.originalSense!,definition:'A separate course meaning under the preserved source identity.',example:'This course example must remain available.'};
  const before=structuredClone(course);
  expect(isVocabularyMeaningGroup(row.entryId,course)).toBe(false);
  // A public curriculum baseline is deliberately not a personal edit. It still must not become a source heading.
  expect(supplementVocabularySense(row.entryId,course,[course],()=>false)).toEqual(before);
  expect(course).toEqual(before);
  const heading=supplementVocabularySense(row.entryId,row.originalSense!,[row.originalSense!],()=>false);
  expect(isVocabularyMeaningGroup(row.entryId,heading)).toBe(true);
  expect(heading.definition).toBe(row.definition);
});

test('a focused correction updates its exact public text without replacing another course version under the same ID',()=>{
 const original=vocabularyTeaching.readiness.corrections;
 const source:VocabularySense={id:'test:scoped-sense',definition:'A basic or necessary part.',example:'This is a basic requirement.',pos:'adj'};
 const row={entryId:'test:scoped-entry',senseId:source.id,definition:source.definition,example:source.example,originalSense:source,collocations:['a basic requirement'],distinctions:['This use concerns a necessary part.'],contentScope:[{definition:source.definition,example:source.example,pos:source.pos}]} as ReadinessSupplement;
 const register=()=>registerVocabularyTeaching({senseBaselines:{},curriculum:{common:[],topics:[],source:[],repairs:[],modern:[]},readiness:{core:[],corrections:[row],defaults:[]},learning:{},tasks:{senseIds:{}},context:{version:'scope-test',bindings:[],defaults:[],unresolved:[]}});
 try{
  register();
  const updated=supplementVocabularySense(row.entryId,source,[source],hasVocabularySenseEdits);
  expect(updated.collocations).toEqual(row.collocations);
  expect(supplementVocabularySense(row.entryId,updated,[source],hasVocabularySenseEdits)).toEqual(updated);
  for(const patch of [{definition:'Another course definition.'},{example:'An example from a different course.'},{pos:'noun'}]){
   const course={...source,...patch};
   expect(supplementVocabularySense(row.entryId,course,[course],()=>false)).toEqual(course);
  }
  const personal={...updated,collocations:[]};
  expect(supplementVocabularySense(row.entryId,personal,[source],hasVocabularySenseEdits)).toEqual(personal);
 }finally{
  vocabularyTeaching.readiness.corrections=original;
  registerVocabularyTeaching({senseBaselines:{},curriculum:{common:[],topics:[],source:[],repairs:[],modern:[]},readiness:{core:[],corrections:[],defaults:[]},learning:{},tasks:{senseIds:{}},context:{version:'scope-test',bindings:[],defaults:[],unresolved:[]}});
 }
});
