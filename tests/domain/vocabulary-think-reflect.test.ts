import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import sources from '../../src/domain/vocabulary/dictionarySenseSources.json';
import {hasVocabularySenseEdits,learningTask} from '../../src/domain/vocabulary/content';
import {getVocabularyLearningPriority,isVocabularyReadingNote,supplementVocabularySense} from '../../src/domain/vocabulary/readiness';
import {resolveVocabularyLearningContext} from '../../src/domain/vocabulary/context';
import type {VocabularyEntry,VocabularySense} from '../../src/domain/vocabulary/types';
const terms=['think','regard','view','reflect'];
const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
const catalog=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
const originals=Object.fromEntries(terms.map(term=>[term,JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses as VocabularySense[]]));
const entryByTerm=new Map<string,VocabularyEntry>(catalog.entries.map((item:VocabularyEntry)=>[item.term,item]));
const correctionById=new Map(corrections.map(item=>[`${item.entryId}\u0000${item.senseId}`,item]));
const entry=(term:string)=>entryByTerm.get(term)!;
const raw=(term:string,at:number)=>originals[term][at];
const row=(term:string,at:number)=>correctionById.get(`${entry(term).id}\u0000${raw(term,at).id}`)!;
const selected=(term:string,at:number)=>supplementVocabularySense(entry(term).id,raw(term,at),[],hasVocabularySenseEdits);
const children=sources.filter(item=>item.term==='view');
const child=(definition:string)=>children.find(item=>item.sense.definition===definition)!;
const reviewedChild=(definition:string)=>correctionById.get(`${entry('view').id}\u0000${child(definition).sense.id}`)!;

test('all thirty-seven preserved records and nine independent view children are reviewed without replacing lexical parents',()=>{
 expect(ledger.records.filter(item=>terms.includes(item.term))).toHaveLength(46);
 for(const term of terms)for(const [at,sense]of originals[term].entries())expect(row(term,at).originalSense).toEqual(sense);
 expect(children).toHaveLength(9);expect(children.filter(item=>item.parentSenseId===raw('view',0).id)).toHaveLength(5);expect(children.filter(item=>item.parentSenseId===raw('view',2).id)).toHaveLength(4);
 for(const at of [0,2]){expect(row('view',at)).not.toHaveProperty('meaningGroup');expect(row('view',at).distinctionTask).toBeDefined();}
 for(const source of children)expect(reviewedChild(source.sense.definition).originalSense).toEqual(source.sense);
});
test('default learning meanings favour opinion, interpretation, looking and deliberate consideration',()=>{
 for(const [term,at]of [['think',4],['regard',5],['view',6],['reflect',6]] as const)expect(resolveVocabularyLearningContext(entry(term),{}).sense?.id).toBe(raw(term,at).id);
});
test('thought separates silent words, unsuccessful effort, judgement, uncertainty and contemplated action',()=>{
 expect(row('think',1).distinctionTask?.answer).toBe('said mentally to myself');
 expect(row('think',2).distinctionTask?.answer).toBe('does not imply that the problem was solved');
 expect(row('think',4).distinctionTask?.answer).toBe('an opinion about the route');
 expect(row('think',5).distinctionTask?.answer).toBe('a tentative belief');
 expect(row('think',6).distinctionTask?.answer).toBe('are considering a possible move');
 expect(row('think',8).example).toContain('sarcastically');expect(row('think',8).distinctions.join(' ')).toContain('genuinely ask');
});
test('chiefly British noun remains usable while obsolete seem and unlabelled venture keep distinct priorities',()=>{
 expect(row('think',9).usage).toContain('countable construction');expect(raw('think',9).register).toContain('uncountable');expect(row('think',9).distinctions.join(' ')).not.toContain('import');
 expect(getVocabularyLearningPriority(entry('think').id,selected('think',10))).toBe('historical');expect(row('think',10).usage).toContain('except in methinks');
 expect(getVocabularyLearningPriority(entry('think').id,selected('think',7))).toBeUndefined();
});
test('regard separates gaze, concern, aspect, esteem and judgement without extending historical labels',()=>{
 for(const [at,answer]of [[0,'his steady gaze'],[1,'consideration for her privacy'],[2,'the aspect being compared'],[3,'esteem her'],[5,'how the council considers the park']] as const)expect(row('regard',at).distinctionTask?.answer).toBe(answer);
 for(const at of [6,9])expect(getVocabularyLearningPriority(entry('regard').id,selected('regard',at))).toBe('historical');
 for(const at of [7,8,10])expect(getVocabularyLearningPriority(entry('regard').id,selected('regard',at))).toBeUndefined();
});
test('intentional filter avoidance is critical reading guidance rather than an invented misspelling exercise',()=>{
 const sense=selected('regard',10);expect(row('regard',10).definition).toContain('filter-avoidance');expect(row('regard',10)).not.toHaveProperty('referenceOnly');expect(row('regard',10)).not.toHaveProperty('distinctionTask');
 expect(isVocabularyReadingNote(entry('regard').id,sense)).toBe(true);expect(learningTask({...entry('regard'),senses:[sense]},sense,'cloze')).toBeUndefined();
});
test('view events retain their own identity and intention does not assert completion',()=>{
 const views=reviewedChild('An individual viewing of a web page or a video etc. by a user.');expect(views.example).toContain('three video views from two viewers');expect(views.distinctionTask?.answer).toBe('three counted viewing events');
 const aim=reviewedChild('An intention or prospect.');expect(aim.distinctionTask?.answer).toBe('their intended aim');expect(aim.usage).toContain('-ing');
 const old=child('Appearance; show; aspect.');const sense=supplementVocabularySense(entry('view').id,old.sense,[],hasVocabularySenseEdits);expect(isVocabularyReadingNote(entry('view').id,sense)).toBe(true);expect(getVocabularyLearningPriority(entry('view').id,sense)).toBe('historical');
});
test('software views remain separate from mental and physical meanings and do not invent materialized storage',()=>{
 expect(row('view',3).distinctions.join(' ')).toContain('materialized view');expect(row('view',3).distinctionTask?.answer).toBe('a logical table defined by that query');expect(row('view',4).distinctionTask?.answer).toBe('the visible interface');
 for(const at of [3,4])expect(getVocabularyLearningPriority(entry('view').id,selected('view',at))).toBe('specialist');
 expect(isVocabularyReadingNote(entry('view').id,selected('view',5))).toBe(true);expect(row('view',5)).not.toHaveProperty('distinctionTask');
});
test('reflection keeps normal-based ray geometry, grammatical subject, image and figurative meanings distinct',()=>{
 expect(row('reflect',0).distinctions.join(' ')).toContain('angles to the normal');expect(row('reflect',1).distinctionTask?.answer).toBe('the light');
 expect(row('reflect',2).distinctionTask?.answer).toBe('an image of the tree');expect(row('reflect',3).distinctionTask?.answer).toBe('the physical tree to be under the water');
 expect(row('reflect',4).distinctionTask?.answer).toBe('corresponds to those times');expect(row('reflect',5).distinctionTask?.answer).toBe('evidence of that quality');expect(row('reflect',6).distinctionTask?.answer).toBe('considered the question seriously');
 const personal={...selected('think',4),definition:'Our tutor’s own interpretation.',example:'My own note.'};expect(supplementVocabularySense(entry('think').id,personal,[],hasVocabularySenseEdits)).toEqual(personal);
});
