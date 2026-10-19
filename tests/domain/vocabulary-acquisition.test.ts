import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect, test} from 'vitest';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import defaults from '../../src/domain/vocabulary/readinessDefaults.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import diagrams from '../../src/domain/vocabulary/senseDiagrams.json';
import {hasVocabularySenseEdits, learningTask} from '../../src/domain/vocabulary/content';
import {isVocabularyReadingNote, supplementVocabularySense} from '../../src/domain/vocabulary/readiness';
import {getVocabularySenseDiagram} from '../../src/domain/vocabulary/media';
import {getVocabularyDiagramPackId} from '../../src/features/vocabulary/diagramPacks';
import type {VocabularyEntry, VocabularySense} from '../../src/domain/vocabulary/types';

const terms=['acquire','obtain','gain','earn'];
const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
const catalog=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
const raw=(term:string):VocabularySense[]=>JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses;
const entry=(term:string):VocabularyEntry=>catalog.entries.find((e:VocabularyEntry)=>e.term===term);
const reviews=ledger.records.filter(row=>terms.includes(row.term));
const rows=corrections.filter(row=>reviews.some(review=>review.entryId===row.entryId&&review.senseId===row.senseId));
const current=(term:string,n:number)=>{
  const row=rows.find(row=>row.entryId===entry(term).id&&row.senseId===raw(term)[n].id);
  expect(row,term+' meaning '+n).toBeDefined();return row!;
};
const taught=(term:string,n:number)=>supplementVocabularySense(entry(term).id,raw(term)[n],[],hasVocabularySenseEdits);

test('all acquisition meanings remain independently addressable with their source fingerprints',()=>{
  expect(reviews).toHaveLength(44);
  for(const term of terms)for(const [n,sense]of raw(term).entries()){
    expect(current(term,n).originalSense).toEqual(sense);
    expect(reviews.find(row=>row.entryId===entry(term).id&&row.senseId===sense.id)?.sourceHash).toBe(createHash('sha256').update(JSON.stringify(sense)).digest('hex'));
    expect(taught(term,n).id).toBe(sense.id);
  }
});

test('opening these entries prefers the reviewed ordinary acquisition meaning',()=>{
  for(const term of terms){
    const row=defaults.find(row=>row.entryId===entry(term).id);
    expect(row?.sense.id).toBe(raw(term)[0].id);
    expect(row?.sense.definition).toBe(current(term,0).definition);
  }
});

test('contextual acquisition meanings offer real gaps and their own assessed distinction question',()=>{
  const contexts:Record<string,number[]>={acquire:[0,1,2,3,4],obtain:[0,4],gain:[0,1,3,4,5,7,8,9,10,11,20],earn:[0,1,2,3,4]};
  let count=0;
  for(const [term,indices]of Object.entries(contexts))for(const n of indices){
    const sense=taught(term,n),word={...entry(term),senses:[sense]},row=current(term,n);
    expect(isVocabularyReadingNote(word.id,sense)).toBe(false);
    expect(learningTask(word,sense,'cloze')?.acceptedAnswers).toContain(term);
    expect(learningTask(word,sense,'distinction')?.acceptedAnswers).toEqual([row.distinctionTask!.answer]);count++;
  }
  expect(count).toBe(23);
});

test('historical, regional and name reading explanations cannot create accidental sentence gaps',()=>{
  const readings:Record<string,number[]>={acquire:[],obtain:[1,2,3],gain:[2,6,12,13,14,15,16,17,18,19,21],earn:[5,6,7,8,9,10,11]};
  let count=0;
  for(const [term,indices]of Object.entries(readings))for(const n of indices){
    const sense=taught(term,n),word={...entry(term),senses:[sense]};
    expect(isVocabularyReadingNote(word.id,sense)).toBe(true);
    expect(learningTask(word,sense,'cloze')).toBeUndefined();count++;
  }
  expect(count).toBe(21);
});

test('contextual acquisition diagrams bind the displayed definition and stop matching changed personal definitions',()=>{
  const currentDiagrams=diagrams.filter(row=>terms.includes(row.term));expect(currentDiagrams).toHaveLength(23);
  for(const diagram of currentDiagrams){
    const sense={id:diagram.senseId,definition:diagram.definition,pos:diagram.pos,example:''};
    const resolved={entry:entry(diagram.term),sense,contentReviewed:false}as any;
    expect(getVocabularySenseDiagram(resolved)?.kind).toBe(diagram.kind);
    expect(getVocabularyDiagramPackId(diagram.kind)).toBe(diagram.term[0]);
    expect(getVocabularySenseDiagram({...resolved,sense:{...sense,definition:'My captured context uses a different meaning.'}})).toBeUndefined();
  }
});

test('personal definitions and examples do not inherit public notes or reviewed reading classifications',()=>{
  for(const [term,n]of [['obtain',1],['gain',19],['earn',9]]as const){
    const sense={...raw(term)[n],definition:'My own explanation of '+term,example:'A sentence from my reading passage.'};
    expect(supplementVocabularySense(entry(term).id,sense,[],hasVocabularySenseEdits)).toEqual(sense);
    expect(isVocabularyReadingNote(entry(term).id,sense)).toBe(false);
  }
});

test('the gain and earn name records remain names without spelling-error or historical flags',()=>{
  for(const [term,n]of [['gain',21],['earn',10],['earn',11]]as const){
    const row=current(term,n);expect(row.learningPriority).toBe('proper-name');
    expect(row).not.toHaveProperty('referenceOnly');expect(taught(term,n).pos).toBe('name');
  }
  expect(current('earn',9)).not.toHaveProperty('referenceOnly');
});
