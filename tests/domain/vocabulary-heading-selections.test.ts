import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,expect,test} from 'vitest';
import {VOCABULARY_CATALOG} from '../../src/domain/vocabulary/catalog';
import {hasVocabularySenseEdits,learningTask,reviewedEntry} from '../../src/domain/vocabulary/content';
import {resolveVocabularyLearningContext} from '../../src/domain/vocabulary/context';
import {isVocabularyMeaningGroup,supplementVocabularySense} from '../../src/domain/vocabulary/readiness';
import {vocabularyTeaching} from '../../src/domain/vocabulary/runtimeData';
import type {VocabularyEntry,VocabularySense} from '../../src/domain/vocabulary/types';

const catalog=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
const original={...VOCABULARY_CATALOG};
beforeEach(()=>Object.assign(VOCABULARY_CATALOG,catalog));
afterEach(()=>Object.assign(VOCABULARY_CATALOG,original));
const entry=(term:string):VocabularyEntry=>catalog.entries.find((row:VocabularyEntry)=>row.term===term);

test.each(['metal','feel','hit','sink','fall','mark','tag'])('%s opens on a specific lexical meaning and retains its source directory',term=>{
 const base=entry(term),selected=reviewedEntry(base).senses[0];
 expect(selected.id).toMatch(/^wiktionary:restored:/);
 expect(isVocabularyMeaningGroup(base.id,selected)).toBe(false);
 expect(selected.collocations?.length).toBeGreaterThan(0);
 expect(learningTask({...base,senses:[selected]},selected,'cloze')).toBeDefined();
 const group=vocabularyTeaching.readiness.corrections.find(row=>row.entryId===base.id&&row.meaningGroup)!;
 expect(group).toBeDefined();
 const directory=supplementVocabularySense(base.id,group.originalSense!,[group.originalSense!],hasVocabularySenseEdits);
 expect(isVocabularyMeaningGroup(base.id,directory)).toBe(true);
 for(const mode of ['recognition','dictation','cloze','distinction','production'] as const){
  expect(learningTask({...base,senses:[directory]},directory,mode)).toBeUndefined();
 }
});

test('latest selects recency while retaining a separate comparison of lateness',()=>{
 const base=entry('latest'),selected=reviewedEntry(base).senses[0];
 expect(selected.id).toBe('kaikki:6a6ddcc7566478f876');
 expect(selected.definition).toBe('Most recent.');
 const generic=vocabularyTeaching.readiness.corrections.find(row=>row.entryId===base.id&&row.senseId==='kaikki:a41576109b11c20e4b')!;
 const other=supplementVocabularySense(base.id,generic.originalSense!,[],hasVocabularySenseEdits);
 expect(other.definition).toContain('later than');
 expect(other.definition).not.toBe(selected.definition);
 const context=resolveVocabularyLearningContext(base,{bookId:'ielts-listening-vocabulary',unitId:'ielts-listening-vocabulary-chapter-02-group-02'});
 expect(context.sense?.id).toBe(selected.id);
});

test('a label topic selects its real child and the unrelated marks lesson retains both meanings',()=>{
 const tag=entry('tag');
 const topic=resolveVocabularyLearningContext(tag,{bookId:'ielts-vocabulary',unitId:'ielts-vocabulary-chapter-10-group-02'});
 expect(topic.sense?.id).toMatch(/^wiktionary:restored:/);
 expect(topic.sense?.definition).toContain('label');
 const mark=entry('mark');
 const multiple=resolveVocabularyLearningContext(mark,{bookId:'ielts-listening-essentials',unitId:'ielts-listening-essentials-chapter-04-group-01'});
 expect(multiple.curriculum?.senses).toHaveLength(2);
 expect(multiple.curriculum?.senses.map(sense=>sense.definition)).toEqual(expect.arrayContaining(['A visible sign or spot on a surface.','A score given for work or an examination.']));
 expect(multiple.curriculum?.senses.every(sense=>!isVocabularyMeaningGroup(mark.id,sense))).toBe(true);
});

test.each(['metal','feel','hit','sink','fall','mark','tag','latest'])('%s keeps an intentionally edited primary meaning',term=>{
 const base=entry(term),personal:VocabularySense={...base.senses[0],definition:'My own meaning from a reading passage.',example:'My own example remains unchanged.'};
 const selected=reviewedEntry({...base,senses:[personal]}).senses[0];
 expect(selected).toEqual(personal);
});
