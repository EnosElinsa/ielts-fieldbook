// @ts-nocheck
import {expect,test} from 'vitest';
import {VOCABULARY_CATALOG} from '../domain/vocabulary/catalog';
import {emptyState} from '../domain';
import {addVocabularyItem,recordVocabularyReview} from '../domain/vocabulary';
import {ensureUnifiedPlans,previewBacklogChange,applyBacklogPreview,mutateStudyPlan} from './planTemplates';
const now=new Date('2026-10-19T12:00:00');
const setup=()=>{const s=emptyState();s.settings.days=[1,3];s.settings.dailyMinutes=30;s.settings.skills=['writing'];s.settings.planning={...s.settings.planning,vocabularyMode:'fixed',vocabularyMinutes:10};return s;};
const task=(id,minutes=20,patch={})=>({id,dateKey:'2026-10-01',status:'pending',skill:'writing',kind:'1',title:id,estimatedMinutes:minutes,origin:'automatic',target:{type:'question',skill:'writing',questionId:id,mode:'overview'},...patch});
test('carryover wins capacity over generated work, started first, preserving content and drafts',()=>{
 const s=setup();ensureUnifiedPlans(s,undefined,now);
 const old=task('old'),started=task('started',20,{status:'in_progress',startedAt:'2026-10-18T12:00:00',dateKey:'2026-10-18',draft:{text:'Keep every word'}}),large=task('large',21);
 s.plans.push(old,started,large);const content=structuredClone(started.target);ensureUnifiedPlans(s,undefined,now);
 expect(started.dateKey).toBe('2026-10-19');expect(old.dateKey).toBe('2026-10-21');expect(large.dateKey).toBe('2026-10-01');
 expect(started.target).toEqual(content);expect(started.draft.text).toBe('Keep every word');expect(started.originalDateKey).toBe('2026-10-18');expect(started.rescheduledAt).toBe(now.toISOString());
 const before=structuredClone(s);ensureUnifiedPlans(s,undefined,now);expect(s).toEqual(before);
});
test('pending past review slots merge with history, frozen future and started reviews survive',()=>{
 const s=setup();const target={type:'vocabulary',mode:'due-review',assessmentMode:'definition',cards:[{entryId:'x',senseId:'s'}]};
 s.plans=[task('stale',5,{kind:'vocabulary',skill:'vocabulary',target}),task('running',5,{kind:'vocabulary',skill:'vocabulary',target:structuredClone(target),status:'in_progress',startedAt:'2026-10-01'}),task('fixed',5,{dateKey:'2026-10-21',kind:'vocabulary',skill:'vocabulary',target:{...target,binding:'frozen'}})];
 const before=structuredClone(s.plans);ensureUnifiedPlans(s,undefined,now);
 expect(s.plans.find(p=>p.id==='stale')).toMatchObject({...before[0],status:'skipped',skipReason:'merged-review'});
 expect(s.plans.find(p=>p.id==='running').target).toEqual(target);expect(s.plans.find(p=>p.id==='fixed')).toEqual(before[2]);
});
test('new review slots count actual prompts, split modes, reserve exact frozen identities, and defer new words',()=>{
 const s=setup();s.settings.days=[1,2,3,4,5,6,7];s.settings.planning.vocabularyMinutes=2;s.wordbookEnrollments=[{bookId:'book'}];
 const word=addVocabularyItem(s,{id:'word',term:'harbor',meaning:'A sheltered port'}).item;
 word.senses.push({...word.senses[0],id:'second',definition:'Another meaning'});
 for(const sense of word.senses)recordVocabularyReview(s,{entryId:word.id,senseId:sense.id,mode:'dictation',response:'wrong',result:'failure',occurredAt:'2020-01-01T00:00:00Z'});
 const evidence=structuredClone(s.vocabularyStates);ensureUnifiedPlans(s,undefined,now);
 const vocab=s.plans.filter(p=>p.skill==='vocabulary');expect(vocab.length).toBeGreaterThan(1);
 expect(vocab.every(p=>p.target.binding==='dynamic'&&p.target.cards.length===0&&p.estimatedMinutes===p.target.batchSize)).toBe(true);
 expect(new Set(vocab.map(p=>p.target.assessmentMode))).toEqual(new Set(['definition','dictation']));
 expect(s.vocabularyStates).toEqual(evidence);
 const frozen=task('frozen',1,{dateKey:'2026-10-19',skill:'vocabulary',kind:'vocabulary',target:{type:'vocabulary',mode:'due-review',assessmentMode:'dictation',binding:'frozen',cards:[{entryId:'word',senseId:word.senses[0].id}]}});s.plans.push(frozen);ensureUnifiedPlans(s,undefined,now);
 expect(s.plans.filter(p=>p.target?.binding==='dynamic').reduce((n,p)=>n+p.target.batchSize,0)).toBe(3);
});
test('bulk preview is pure, excludes started by default, commits exactly once and rejects stale input',()=>{
 const s=setup();s.plans=[task('old'),task('started',20,{status:'in_progress',startedAt:'2026-10-01',draft:'Draft'})];const before=structuredClone(s);
 const preview=previewBacklogChange(s,{type:'replan',ids:['old','started']},now);expect(s).toEqual(before);
 expect(preview.plans.find(p=>p.id==='started')).toEqual(before.plans[1]);expect(preview.plans.find(p=>p.id==='old').dateKey).toBe('2026-10-19');
 applyBacklogPreview(s,preview,now);expect(s.plans).toEqual(preview.plans);expect(()=>applyBacklogPreview(s,preview,now)).toThrow(/changed|stale/i);
 const stale=previewBacklogChange(before,{type:'skip',ids:['old']},now);before.settings.dailyMinutes=60;expect(()=>applyBacklogPreview(before,stale,now)).toThrow(/changed|stale/i);
});
test('bulk explicit started opt-in supports skip and restore without losing history or evidence',()=>{
 const s=setup();s.plans=[task('started',20,{status:'in_progress',startedAt:'2026-10-01',draft:{text:'draft'},target:{exact:'material'}})];
 const before=structuredClone(s);const preview=previewBacklogChange(s,{type:'skip',ids:['started'],includeStarted:true},now);applyBacklogPreview(s,preview,now);
 expect(s.plans[0]).toMatchObject({status:'skipped',previousStatus:'in_progress',skipReason:'bulk-skip',draft:{text:'draft'},target:{exact:'material'}});
 mutateStudyPlan(s,'started',{type:'restore',allowOverBudget:true},now);expect(s.plans[0].status).toBe('in_progress');expect(s.plans[0].skipReason).toBeUndefined();expect(s.vocabularyStates).toEqual(before.vocabularyStates);
});

test('smaller settings reallocate pending automatic carryover without overtime or rewriting material',()=>{
 const s=setup();const old=task('old',20);s.plans=[old];ensureUnifiedPlans(s,undefined,now);expect(old.dateKey).toBe('2026-10-19');
 s.settings.dailyMinutes=25;ensureUnifiedPlans(s,undefined,now);expect(old.dateKey).toBe('2026-10-01');expect(old.target.questionId).toBe('old');
 for(const day of ['2026-10-19','2026-10-21'])expect(s.plans.filter(p=>p.dateKey===day&&p.status!=='skipped').reduce((n,p)=>n+p.estimatedMinutes,0)).toBeLessThanOrEqual(25);
 const before=structuredClone(s);ensureUnifiedPlans(s,undefined,now);expect(s).toEqual(before);
});

test('no-capacity and rest-day previews keep selected indivisible work waiting',()=>{
 const s=setup();s.settings.days=[];s.plans=[task('old'),task('large',120,{status:'in_progress',startedAt:'2026-10-01'})];
 const preview=previewBacklogChange(s,{type:'replan',ids:['old','large'],includeStarted:true},now);
 expect(preview.changes.every(row=>row.waiting)).toBe(true);expect(preview.plans).toEqual(s.plans);
});

test('homogeneous batching never spends capacity on a foundation gap ahead of another due mode',()=>{
 const s=setup();s.settings.days=[1];s.settings.planning.vocabularyMinutes=2;
 for(const id of ['a','b']){addVocabularyItem(s,{id,term:`word-${id}`,meaning:'A meaning'});const learned=s.vocabularyStates.find(row=>row.entryId===id);learned.manualStatus='unfamiliar';if(id==='a'){learned.cards.definition={due:new Date('2026-10-01')};learned.cards.dictation={due:new Date('2027-01-01')};}else learned.cards.dictation={due:new Date('2026-10-02')};}
 ensureUnifiedPlans(s,undefined,now);const tasks=s.plans.filter(p=>p.skill==='vocabulary');
 expect(tasks.map(p=>[p.target.assessmentMode,p.target.batchSize])).toEqual([['definition',1],['dictation',1]]);
});

test('explicitly restored historical reviews stay actionable rather than immediately merging again',()=>{
 const s=setup();s.plans=[task('review',5,{kind:'vocabulary',skill:'vocabulary',target:{type:'vocabulary',mode:'due-review',assessmentMode:'definition',cards:[{entryId:'word',senseId:'sense'}]}})];
 ensureUnifiedPlans(s,undefined,now);expect(s.plans.find(p=>p.id==='review').status).toBe('skipped');
 mutateStudyPlan(s,'review',{type:'restore',allowOverBudget:true},now);ensureUnifiedPlans(s,undefined,now);
 expect(s.plans.find(p=>p.id==='review')).toMatchObject({status:'pending',dateKey:'2026-10-19',target:{cards:[{entryId:'word',senseId:'sense'}]}});
});

test('a final short learning batch consumes its actual prompt count in spare vocabulary capacity',()=>{
 const s=setup();s.settings.planning.vocabularyMinutes=5;s.wordbookEnrollments=[{bookId:'short-book'}];
 const unit={id:'short-unit',bookId:'short-book',kind:'unit',entryIds:['one','two','three'],order:1};
 VOCABULARY_CATALOG.units.push(unit);
 try{ensureUnifiedPlans(s,undefined,now);expect(s.plans.find(p=>p.skill==='vocabulary')).toMatchObject({estimatedMinutes:3,quantity:3,target:{batchSize:10,batchIndex:0,unitId:'short-unit'}});}finally{VOCABULARY_CATALOG.units.splice(VOCABULARY_CATALOG.units.indexOf(unit),1);}
});

test.each(['learning-batch','due-review'])('frozen %s identities reserve overlapping learning material after batch-size changes',mode=>{
 const s=setup();s.settings.days=[1,2,3,4,5,6,7];s.settings.vocabulary.mode='definition';s.settings.vocabulary.learningBatchSize=5;s.wordbookEnrollments=[{bookId:'reserved-book'}];
 const entries=Array.from({length:15},(_,index)=>addVocabularyItem(s,{id:`reserve-${index}`,term:`term${index}`,meaning:'A meaning'}).item);
 const unit={id:'reserved-unit',bookId:'reserved-book',kind:'group',entryIds:entries.map(row=>row.id),order:1};
 const members=entries.map((entry,index)=>({entryId:entry.id,bookId:unit.bookId,unitId:unit.id,order:index}));
 VOCABULARY_CATALOG.units.push(unit);VOCABULARY_CATALOG.memberships.push(...members);
 const frozen=task('frozen-ten',10,{dateKey:'2026-10-19',skill:'vocabulary',kind:'vocabulary',draft:{answers:'keep'},target:{type:'vocabulary',binding:'frozen',mode,assessmentMode:'definition',bookId:unit.bookId,unitId:unit.id,batchIndex:0,batchSize:10,cards:entries.slice(0,10).map(entry=>({entryId:entry.id,senseId:entry.senses[0].id}))}});s.plans=[frozen];const before=structuredClone(frozen);
 try {
  ensureUnifiedPlans(s,undefined,now);const generated=s.plans.filter(row=>row.id!==frozen.id&&row.target?.mode==='learning-batch');
  expect(generated.length).toBeGreaterThan(0);expect(generated.every(row=>row.target.batchIndex>=2)).toBe(true);expect(frozen).toEqual(before);
  const stable=structuredClone(s.plans);ensureUnifiedPlans(s,undefined,now);expect(s.plans).toEqual(stable);
  frozen.target.assessmentMode='dictation';ensureUnifiedPlans(s,undefined,now);expect(s.plans.some(row=>row.id!==frozen.id&&row.target?.mode==='learning-batch'&&row.target.batchIndex===0)).toBe(true);
  frozen.target.assessmentMode='definition';frozen.target.cards=frozen.target.cards.map(ref=>({...ref,senseId:'another-sense'}));ensureUnifiedPlans(s,undefined,now);expect(s.plans.some(row=>row.id!==frozen.id&&row.target?.mode==='learning-batch'&&row.target.batchIndex===0)).toBe(true);
 }finally{VOCABULARY_CATALOG.units.splice(VOCABULARY_CATALOG.units.indexOf(unit),1);for(const member of members)VOCABULARY_CATALOG.memberships.splice(VOCABULARY_CATALOG.memberships.indexOf(member),1);}
});

test('frozen reservations compare resolved learning batches when archived words shift their boundaries',()=>{
 const s=setup();s.settings.days=[1,2,3,4,5,6,7];s.settings.vocabulary.mode='definition';s.settings.vocabulary.learningBatchSize=5;s.wordbookEnrollments=[{bookId:'shift-book'}];
 const entries=Array.from({length:15},(_,index)=>addVocabularyItem(s,{id:`shift-${index}`,term:`shiftword${index}`,meaning:'A meaning'}).item);
 entries.slice(0,5).forEach(entry=>entry.tags.push('archived'));
 const unit={id:'shift-unit',bookId:'shift-book',kind:'group',entryIds:entries.map(row=>row.id),order:1},members=entries.map((entry,order)=>({entryId:entry.id,bookId:unit.bookId,unitId:unit.id,order}));
 VOCABULARY_CATALOG.units.push(unit);VOCABULARY_CATALOG.memberships.push(...members);
 s.plans=[task('frozen-shift',1,{dateKey:'2026-10-19',skill:'vocabulary',kind:'vocabulary',target:{type:'vocabulary',binding:'frozen',mode:'due-review',assessmentMode:'definition',cards:[{entryId:entries[10].id,senseId:entries[10].senses[0].id}]}})];
 try {ensureUnifiedPlans(s,undefined,now);const batches=s.plans.filter(row=>row.target?.mode==='learning-batch');expect(batches.length).toBeGreaterThan(0);expect(batches.some(row=>row.target.batchIndex===1)).toBe(false);}
 finally{VOCABULARY_CATALOG.units.splice(VOCABULARY_CATALOG.units.indexOf(unit),1);for(const member of members)VOCABULARY_CATALOG.memberships.splice(VOCABULARY_CATALOG.memberships.indexOf(member),1);}
});
