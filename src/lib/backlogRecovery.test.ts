// @ts-nocheck
import {expect,test} from 'vitest';
import {VOCABULARY_CATALOG} from '../domain/vocabulary/catalog';
import {emptyState} from '../domain';
import {addVocabularyItem,recordVocabularyReview} from '../domain/vocabulary';
import {ensureUnifiedPlans,previewBacklogChange,applyBacklogPreview,mutateStudyPlan,nextLearningTarget} from './planTemplates';
import {bindStudyPlanTargets} from './planTargets';
import {vocabularyGroupProgress} from '../domain/vocabulary/progress';
const now=new Date('2026-10-19T12:00:00');
const setup=()=>{const s=emptyState();s.settings.days=[1,3];s.settings.dailyMinutes=30;s.settings.skills=['writing'];s.settings.planning={...s.settings.planning,vocabularyMode:'fixed',vocabularyMinutes:10};return s;};
const task=(id,minutes=20,patch={})=>({id,dateKey:'2026-10-01',status:'pending',skill:'writing',kind:'1',title:id,estimatedMinutes:minutes,origin:'automatic',target:{type:'question',skill:'writing',questionId:id,mode:'overview'},...patch});

test.each([9,12])('eligible learning members fit a %s minute budget and bind without phantom indexes',async minutes=>{
 const s=setup();s.settings.days=[1];s.settings.skills=[];s.settings.planning.vocabularyMinutes=minutes;s.wordbookEnrollments=[{bookId:'eligible-book'}];
 const entries=Array.from({length:12},(_,index)=>addVocabularyItem(s,{id:`eligible-${index}`,term:`eligible${index}`,meaning:'A meaning.'}).item);
 entries.slice(0,3).forEach(entry=>entry.tags.push('archived'));
 const unit={id:'eligible-group',bookId:'eligible-book',kind:'group',entryIds:[...entries.map(entry=>entry.id),entries[3].id],order:1};
 const members=unit.entryIds.map((entryId,order)=>({entryId,order,bookId:unit.bookId,unitId:unit.id}));
 VOCABULARY_CATALOG.units.push(unit);VOCABULARY_CATALOG.memberships.push(...members);
 try {
  ensureUnifiedPlans(s,undefined,now);
  const batches=s.plans.filter(plan=>plan.target?.mode==='learning-batch');
  expect(batches).toHaveLength(1);expect(batches[0]).toMatchObject({estimatedMinutes:9,quantity:9,target:{batchIndex:0}});
  s.plans=batches;await bindStudyPlanTargets(s,{vocabulary:async()=>{}});
  expect(batches[0].target.cards.map(ref=>ref.entryId)).toEqual(entries.slice(3).map(entry=>entry.id));
  s.vocabularySessions=[{status:'submitted',mode:'definition',selection:{kind:'learning-batch',bookId:unit.bookId,unitId:unit.id,batchIndex:0,batchSize:10,cards:batches[0].target.cards},results:batches[0].target.cards.map(ref=>({...ref,response:'answer'}))}];
  expect(vocabularyGroupProgress(s,unit)).toBe('Studied');expect(nextLearningTarget(s)).toBeNull();
 }finally{VOCABULARY_CATALOG.units.splice(VOCABULARY_CATALOG.units.indexOf(unit),1);for(const member of members)VOCABULARY_CATALOG.memberships.splice(VOCABULARY_CATALOG.memberships.indexOf(member),1);}
});

test('metadata-only learning remains prospective until scoped resource loading supplies exact cards',async()=>{
 const s=setup();s.settings.days=[1];s.settings.planning.vocabularyMinutes=9;s.wordbookEnrollments=[{bookId:'external-book'}];
 const unit={id:'external-group',bookId:'external-book',kind:'group',entryIds:Array.from({length:12},(_,i)=>`external-${i}`),archivedEntryIds:['external-0','external-1','external-2'],order:1};
 VOCABULARY_CATALOG.units.push(unit);const members=[];
 try {
  ensureUnifiedPlans(s,undefined,now);s.plans=s.plans.filter(plan=>plan.target?.mode==='learning-batch');
  expect(s.plans).toHaveLength(1);expect(s.plans[0]).toMatchObject({estimatedMinutes:9,quantity:9,target:{cards:[],batchIndex:0}});
  await bindStudyPlanTargets(s,{vocabulary:async()=>{for(let i=0;i<12;i++){const entry=addVocabularyItem(s,{id:`external-${i}`,term:`external${i}`,meaning:'A meaning.'}).item;if(i<3)entry.tags.push('archived');members.push({entryId:entry.id,bookId:unit.bookId,unitId:unit.id,order:i});}VOCABULARY_CATALOG.memberships.push(...members);}});
  expect(s.plans[0].target.cards).toHaveLength(9);expect(s.plans[0].target.cards[0].entryId).toBe('external-3');
 }finally{VOCABULARY_CATALOG.units.splice(VOCABULARY_CATALOG.units.indexOf(unit),1);for(const member of members)VOCABULARY_CATALOG.memberships.splice(VOCABULARY_CATALOG.memberships.indexOf(member),1);}
});

test('resizing cannot under-budget or truncate an exact frozen review',()=>{
 const s=setup(),target={type:'vocabulary',mode:'due-review',binding:'frozen',assessmentMode:'definition',cards:[{entryId:'word',senseId:'one'},{entryId:'word',senseId:'two'}]};
 s.plans=[task('frozen-resize',2,{dateKey:'2026-10-19',skill:'vocabulary',kind:'vocabulary',target})];const before=structuredClone(s.plans);
 expect(()=>mutateStudyPlan(s,'frozen-resize',{type:'resize',estimatedMinutes:1},now)).toThrow(/prompt|frozen|exact/i);expect(s.plans).toEqual(before);
 mutateStudyPlan(s,'frozen-resize',{type:'resize',estimatedMinutes:3},now);expect(s.plans[0].target).toEqual(target);
});

test('resource loading reconciles provisional automatic batch counts without touching frozen targets',async()=>{
 const s=setup();s.settings.days=[1,3];s.settings.planning.vocabularyMinutes=12;s.wordbookEnrollments=[{bookId:'late-book'}];
 const unit={id:'late-group',bookId:'late-book',kind:'group',entryIds:Array.from({length:12},(_,i)=>`late-${i}`),order:1};
 VOCABULARY_CATALOG.units.push(unit);const members=[];
 try {
  ensureUnifiedPlans(s,undefined,now);s.plans=s.plans.filter(plan=>plan.target?.mode==='learning-batch');
  expect(s.plans.map(plan=>plan.target.batchIndex)).toEqual([0,1]);
  const frozen=task('keep-exact',2,{dateKey:'2026-10-21',skill:'vocabulary',kind:'vocabulary',target:{type:'vocabulary',mode:'learning-batch',bookId:unit.bookId,unitId:unit.id,batchIndex:0,batchSize:10,assessmentMode:'definition',binding:'frozen',cards:[{entryId:'fixed',senseId:'one'},{entryId:'fixed',senseId:'two'}]}});s.plans.push(frozen);const before=structuredClone(frozen);
  await bindStudyPlanTargets(s,{vocabulary:async()=>{if(members.length)return;for(let i=0;i<12;i++){const entry=addVocabularyItem(s,{id:`late-${i}`,term:`lateword${i}`,meaning:'A meaning.'}).item;if(i<3)entry.tags.push('archived');members.push({entryId:entry.id,bookId:unit.bookId,unitId:unit.id,order:i});}VOCABULARY_CATALOG.memberships.push(...members);}});
  expect(s.plans).toHaveLength(2);expect(s.plans[0]).toMatchObject({estimatedMinutes:9,quantity:9,target:{batchIndex:0}});expect(s.plans[0].target.cards).toHaveLength(9);expect(s.plans[1]).toEqual(before);
 }finally{VOCABULARY_CATALOG.units.splice(VOCABULARY_CATALOG.units.indexOf(unit),1);for(const member of members)VOCABULARY_CATALOG.memberships.splice(VOCABULARY_CATALOG.memberships.indexOf(member),1);}
});

test('count-only external metadata reserves prospective learning without inventing frozen cards',async()=>{
 const s=setup();s.settings.days=[1];s.wordbookEnrollments=[{bookId:'count-only-book'}];
 const unit={id:'count-only-group',bookId:'count-only-book',kind:'group',entryIds:[],totalSourceWords:12,order:1};VOCABULARY_CATALOG.units.push(unit);
 try{ensureUnifiedPlans(s,undefined,now);s.plans=s.plans.filter(plan=>plan.target?.mode==='learning-batch');expect(s.plans).toHaveLength(1);await bindStudyPlanTargets(s,{vocabulary:async()=>{}});expect(s.plans[0]).toMatchObject({estimatedMinutes:10,quantity:10,target:{cards:[],batchIndex:0}});}
 finally{VOCABULARY_CATALOG.units.splice(VOCABULARY_CATALOG.units.indexOf(unit),1);}
});

test('restoring an older empty no-longer-due target repairs only that skipped dynamic slot',()=>{
 const s=setup();s.plans=[task('old-empty',2,{dateKey:'2026-10-19',status:'skipped',skipReason:'no-longer-due',skill:'vocabulary',kind:'vocabulary',target:{type:'vocabulary',mode:'due-review',binding:'frozen',batchSize:2,assessmentMode:'definition',cards:[]}})];
 mutateStudyPlan(s,'old-empty',{type:'restore'},now);expect(s.plans[0]).toMatchObject({status:'pending',target:{binding:'dynamic',batchSize:2,cards:[]}});
});

test.each(['bogus','audio','production',[]])('manual recall rejects invalid assessed mode %j before mutation',mode=>{
 const s=setup(),before=structuredClone(s.plans);
 expect(()=>mutateStudyPlan(s,null,{type:'add',skill:'vocabulary',practice:'due-review',assessmentMode:mode,dateKey:'2026-10-19',estimatedMinutes:5},now)).toThrow(/assessed recall mode/i);expect(s.plans).toEqual(before);
});

test('loading prospective membership rechecks exact frozen learning reservations before binding',async()=>{
 const s=setup();s.settings.days=[1];s.settings.planning.vocabularyMinutes=20;s.settings.vocabulary.learningBatchSize=5;s.settings.vocabulary.mode='definition';s.wordbookEnrollments=[{bookId:'late-reserved-book'}];
 const unit={id:'late-reserved-group',bookId:'late-reserved-book',kind:'group',entryIds:[],totalSourceWords:10,order:1};VOCABULARY_CATALOG.units.push(unit);const members=[];
 const frozen=task('late-reserved',1,{dateKey:'2026-10-19',skill:'vocabulary',kind:'vocabulary',target:{type:'vocabulary',mode:'learning-batch',bookId:unit.bookId,unitId:unit.id,assessmentMode:'definition',batchIndex:0,batchSize:10,cards:[{entryId:'reserved-late-0',senseId:'reserved-sense-0'}]}});s.plans=[frozen];const before=structuredClone(frozen);
 try{
  ensureUnifiedPlans(s,undefined,now);s.plans=s.plans.filter(plan=>plan.target?.mode==='learning-batch');expect(s.plans).toHaveLength(3);
  await bindStudyPlanTargets(s,{vocabulary:async()=>{if(members.length)return;for(let i=0;i<10;i++){const entry=addVocabularyItem(s,{id:`reserved-late-${i}`,term:`reservedlate${i}`,senses:[{id:`reserved-sense-${i}`,definition:'A meaning.',example:'',pos:'noun'}]}).item;members.push({entryId:entry.id,bookId:unit.bookId,unitId:unit.id,order:i});}VOCABULARY_CATALOG.memberships.push(...members);}});
  expect(s.plans).toHaveLength(2);expect(s.plans[0]).toEqual(before);expect(s.plans[1].target.batchIndex).toBe(1);expect(s.plans[1].target.cards.map(ref=>ref.entryId)).toEqual(['reserved-late-5','reserved-late-6','reserved-late-7','reserved-late-8','reserved-late-9']);
 }finally{VOCABULARY_CATALOG.units.splice(VOCABULARY_CATALOG.units.indexOf(unit),1);for(const member of members)VOCABULARY_CATALOG.memberships.splice(VOCABULARY_CATALOG.memberships.indexOf(member),1);}
});
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
