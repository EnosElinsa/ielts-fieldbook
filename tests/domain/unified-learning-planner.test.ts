import { beforeEach, expect, test, vi } from 'vitest';
const catalog = vi.hoisted(() => {
  const entries = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, term: `term-${id}`, category: 'word', meaning: `Meaning ${id}`, example: `We use ${id}.`, tags: [], sources: [], senses: [{ id: 'one', definition: `Meaning ${id}`, example: `We use ${id}.`, pos: 'noun' }], createdAt: '2020-01-01', updatedAt: '2020-01-01' }));
  const units = [{ id: 'unit-a', bookId: 'book-a', kind: 'group', order: 1, contentStatus: 'complete', totalSourceWords: 3, entryIds: ['a', 'b', 'c'] }, { id: 'unit-b', bookId: 'book-b', kind: 'group', order: 1, contentStatus: 'complete', totalSourceWords: 3, entryIds: ['a', 'd', 'e'] }];
  return { entries, units, books: [{ id: 'book-a' }, { id: 'book-b' }], memberships: units.flatMap(unit => unit.entryIds.map((entryId, order) => ({ bookId: unit.bookId, unitId: unit.id, entryId, order }))) };
});
vi.mock('../../src/domain/vocabulary/catalog', () => ({ VOCABULARY_CATALOG: catalog }));
import { emptyState } from '../../src/domain/state';
import { normalizePlanning } from '../../src/domain/planningPreferences';
import { ensureUnifiedPlans, ensureUnifiedPlansAsync, nextLearningTarget, nextHomeLearning, selectedStudySkills, mutateStudyPlan, previewBacklogChange, applyBacklogPreview } from '../../src/lib/planTemplates';
import { addVocabularyItem, recordVocabularyReview } from '../../src/domain/vocabulary';
import { bindStudyPlanTargets } from '../../src/lib/planTargets';
import { orderReviewCards, oneQuestionPerWord } from '../../src/domain/vocabulary/reviewOrder';
import { selectScheduledVocabularyReview } from '../../src/domain/vocabulary/reviewPlanning';

const now = new Date('2026-10-20T12:00:00');
function fixture() {
  const state = emptyState() as any;
  state.settings = { ...state.settings, days: [1, 2, 3, 4, 5, 6, 7], dailyMinutes: 20, skills: [], planning: { vocabularyMode: 'ratio', vocabularyPercent: 100, newWordsPerDay: 2, carryoverPercent: 30 } };
  state.vocabulary = structuredClone(catalog.entries);
  state.wordbookEnrollments = [{ id: 'ea', bookId: 'book-a' }, { id: 'eb', bookId: 'book-b' }];
  state.plans = [];
  return state;
}
beforeEach(() => vi.useRealTimers());

test('browser scheduling preserves the same frozen tasks, learning allocation and review priorities',async()=>{
 const state=fixture();
 recordVocabularyReview(state,{entryId:'a',senseId:'one',mode:'dictation',result:'failure',occurredAt:'2026-10-19T12:00:00Z',response:'wrong'});
 state.plans=[{id:'protected',dateKey:'2026-10-20',origin:'manual',status:'in_progress',startedAt:'2026-10-20T09:00:00Z',skill:'vocabulary',kind:'vocabulary',estimatedMinutes:3,target:{type:'vocabulary',mode:'review',assessmentMode:'dictation',cards:[{entryId:'a',senseId:'one',mode:'dictation'}]}}];
 const expected=structuredClone(state);ensureUnifiedPlans(expected,undefined,now);
 await ensureUnifiedPlansAsync(state,now);
 expect(state).toEqual(expected);
});

test('home follows the exact task for today, reserves protected budgets and observes rest days',()=>{
 const state=fixture();
 state.plans=[{id:'protected',dateKey:'2026-10-20',origin:'manual',status:'pending',skill:'writing',estimatedMinutes:19}];
 expect(nextHomeLearning(state,now)?.target.entryIds).toEqual(['a']);
 const task={id:'today',dateKey:'2026-10-20',status:'pending',target:{mode:'learning-batch',entryIds:['e'],bookId:'book-b'}};
 state.plans.push(task);
 expect(nextHomeLearning(state,now)).toEqual({plan:task,target:task.target});
 state.plans=[];state.settings.days=[];
 expect(nextHomeLearning(state,now)).toBeNull();
});

test('normalizes new-word, source and carryover preferences and preserves vocabulary-only modules', () => {
  expect(normalizePlanning({})).toMatchObject({ newWordsPerDay: 10, carryoverPercent: 30, wordbookMode: 'ordered' });
  expect(normalizePlanning({ newWordsPerDay: -4, carryoverPercent: 500, wordbookOrder: ['book-b', 'book-b'], pausedWordbooks: ['book-a'] })).toMatchObject({ newWordsPerDay: 0, carryoverPercent: 100, wordbookOrder: ['book-b'], pausedWordbooks: ['book-a'] });
  expect(selectedStudySkills({ skills: [] })).toEqual([]);
});

test('new exact batches fit the remaining capacity and skip words learned in another book', () => {
  const state = fixture();
  recordVocabularyReview(state, { entryId: 'a', senseId: 'one', mode: 'dictation', result: 'success', response: 'term-a', occurredAt: '2020-01-01' });
  const target = nextLearningTarget(state, new Set(), [], 1);
  expect(target).toMatchObject({ bookId: 'book-a', cards: [{ entryId: 'b', senseId: 'one' }] });
  expect(nextLearningTarget(state, new Set(), target!.cards, 2)?.cards.map(ref => ref.entryId)).not.toContain('a');
});

test('source ordering, pause and batch round-robin all use the same selector', () => {
  const state = fixture();
  state.settings.planning.wordbookOrder = ['book-b', 'book-a'];
  expect(nextLearningTarget(state, new Set(), [], 2)?.bookId).toBe('book-b');
  state.settings.planning.pausedWordbooks = ['book-b'];
  expect(nextLearningTarget(state, new Set(), [], 2)?.bookId).toBe('book-a');
  state.settings.planning.pausedWordbooks = [];
  state.settings.planning.wordbookMode = 'round-robin';
  state.plans.push({ status: 'pending', dateKey: '2026-10-20', target: { type: 'vocabulary', mode: 'learning-batch', bookId: 'book-b', cards: [] } });
  expect(nextLearningTarget(state, new Set(), [], 2)?.bookId).toBe('book-a');
  state.plans[0].dateKey='2026-10-25';
  expect(nextLearningTarget(state,new Set(),[],2,undefined,'2026-10-20')?.bookId).toBe('book-b');
});

test('review pressure does not consume the daily reserved new-word target', () => {
  const state = fixture();
  for (let index = 0; index < 30; index++) {
    const entry = addVocabularyItem(state, { term: `recall-${index}`, meaning: 'A saved practice word.', example: 'A useful practice word.' }).item!;
    state.vocabularyStates.find(row => row.entryId === entry.id).manualStatus = 'unfamiliar';
  }
  ensureUnifiedPlans(state, undefined, now);
  const today = state.plans.filter(plan => plan.dateKey === '2026-10-20' && plan.status !== 'skipped');
  expect(today.filter(plan => plan.target?.mode === 'learning-batch').reduce((sum, plan) => sum + plan.estimatedMinutes, 0)).toBe(2);
  expect(today.reduce((sum, plan) => sum + plan.estimatedMinutes, 0)).toBeLessThanOrEqual(20);
  expect(today.every(plan => plan.skill === 'vocabulary')).toBe(true);
});

test('a seven-day preview reserves due vocabulary on its local date even before the due hour', async () => {
  const state = fixture();
  state.wordbookEnrollments = [];
  state.settings.planning.newWordsPerDay = 0;
  const entry = state.vocabulary[0];
  const common = {entryId:entry.id, senseId:entry.senses[0].id, result:'success' as const, response:entry.term, occurredAt:'2026-10-18T12:00:00'};
  const learning = recordVocabularyReview(state, {...common, mode:'definition'});
  recordVocabularyReview(state, {...common, mode:'dictation'});
  const due = new Date('2026-10-21T15:00:00');
  learning.cards.definition!.due = due;
  learning.cards.dictation!.due = new Date('2026-11-05T12:00:00');
  const asyncState = structuredClone(state);
  ensureUnifiedPlans(state,undefined,now);
  await ensureUnifiedPlansAsync(asyncState,now);
  const plans = state.plans.filter(plan => plan.target?.mode === 'due-review');
  expect(plans).toHaveLength(1);
  expect(plans[0]).toMatchObject({dateKey:'2026-10-21',target:{assessmentMode:'definition',reviewAvailableAt:due.toISOString(),binding:'dynamic',cards:[]}});
  expect(asyncState.plans).toEqual(state.plans);
  expect(selectScheduledVocabularyReview(state,plans[0].target,new Date(due.getTime()-1),1)).toEqual([]);
  expect(selectScheduledVocabularyReview(state,plans[0].target,due,1)).toHaveLength(1);
});

test('due cards have room even when the daily new-word goal would use the entire vocabulary budget', () => {
  const state = fixture();
  state.settings.planning.newWordsPerDay = 10;
  state.settings.planning.vocabularyPercent = 20;
  const entry = addVocabularyItem(state,{term:'retention word',meaning:'A personal review word.'}).item!;
  const learning = recordVocabularyReview(state,{entryId:entry.id,mode:'definition',result:'success',response:entry.term,occurredAt:'2026-10-18T12:00:00'});
  learning.cards.definition!.due = new Date('2026-10-19T12:00:00');
  expect(nextHomeLearning(state,now)?.target.entryIds).toHaveLength(3);
  ensureUnifiedPlans(state,undefined,now);
  const today = state.plans.filter(plan => plan.dateKey === '2026-10-20');
  expect(today.filter(plan => plan.reviewReason === 'due')).toHaveLength(1);
  expect(today.filter(plan => plan.target?.mode === 'learning-batch').reduce((sum,plan)=>sum+plan.quantity,0)).toBe(3);
});

test('an automatic review can still select a due card whose reason changed to mistake recovery', () => {
  const state = fixture();
  const entry = state.vocabulary[0];
  const learning = recordVocabularyReview(state,{entryId:entry.id,mode:'dictation',result:'failure',response:'wrong',occurredAt:'2026-10-18T12:00:00'});
  const cards = selectScheduledVocabularyReview(state,{assessmentMode:'dictation',reviewReason:'due'},now,1);
  expect(cards.map(card => card.senseId)).toEqual([learning.senseId]);
});

test('adjusting a scoped review keeps its type, sorting, and exact scope', () => {
  const state = fixture();
  const plan = mutateStudyPlan(state,null,{
    type:'add',skill:'vocabulary',practice:'due-review',dateKey:'2026-10-21',estimatedMinutes:4,
    assessmentMode:'definition',reviewType:'custom',binding:'dynamic',reviewFilter:{bookId:'book-a'},
    selectedMeanings:[{entryId:'a',senseId:'one'}],questionOrder:'random',
  },now);
  const {target,title,completion} = structuredClone(plan);
  mutateStudyPlan(state,plan.id,{type:'resize',estimatedMinutes:2},now);
  expect(plan).toMatchObject({target:{...target,batchSize:2},title,completion,quantity:2,estimatedMinutes:2});
});

test('reordering visible tasks leaves history and held tasks unchanged', () => {
  const state = fixture();
  const day = '2026-10-20';
  const make = (id:string,order:number,patch={}) => ({id,dateKey:day,skill:'writing',status:'pending',origin:'automatic',estimatedMinutes:5,order,...patch});
  state.plans = [make('first',0),make('completed',1,{status:'completed'}),make('held',2,{onHold:true}),make('second',3)];
  const history = structuredClone(state.plans.slice(1,3));
  mutateStudyPlan(state,'first',{type:'reorder',direction:'down'},now);
  expect(state.plans.slice(1,3)).toEqual(history);
  expect(state.plans[0].order).toBeGreaterThan(state.plans[3].order);
});

test('an older review explicitly adjusted by the learner retains its date and scope until approved', () => {
  const state = fixture();
  state.wordbookEnrollments = [];
  state.plans = [{id:'edited',dateKey:'2026-10-19',skill:'vocabulary',kind:'vocabulary',origin:'automatic',status:'pending',estimatedMinutes:2,manuallyEditedAt:'2026-10-19T12:00:00',target:{type:'vocabulary',mode:'due-review',assessmentMode:'dictation',binding:'dynamic',batchSize:2,cards:[]}}];
  ensureUnifiedPlans(state,undefined,now);
  expect(state.plans.find(plan=>plan.id==='edited').dateKey).toBe('2026-10-19');
  const preview=previewBacklogChange(state,{type:'replan',ids:['edited']},now);
  applyBacklogPreview(state,preview,now);
  expect(state.plans.find(plan=>plan.id==='edited')).toMatchObject({status:'pending',dateKey:'2026-10-20',originalDateKey:'2026-10-19',target:{assessmentMode:'dictation',batchSize:2}});
});

test('automatic carryover is bounded and never merges a manually selected review', () => {
  const state = fixture(); state.wordbookEnrollments = [];
  state.plans = [
    { id: 'manual', dateKey: '2026-10-18', origin: 'manual', status: 'pending', skill: 'vocabulary', kind: 'vocabulary', estimatedMinutes: 10, target: { type: 'vocabulary', mode: 'due-review', binding: 'frozen', cards: [{ entryId: 'a', senseId: 'one' }] } },
    { id: 'small', dateKey: '2026-10-19', origin: 'automatic', status: 'pending', skill: 'vocabulary', kind: 'vocabulary', estimatedMinutes: 6, target: { type: 'vocabulary', mode: 'learning-batch', cards: [] } },
  ];
  ensureUnifiedPlans(state, undefined, now);
  expect(state.plans.find(plan => plan.id === 'manual')).toMatchObject({ status: 'pending', dateKey: '2026-10-18' });
  expect(state.plans.find(plan => plan.id === 'small')).toMatchObject({ dateKey: '2026-10-20', originalDateKey: '2026-10-19' });
});

test('hold and archive preserve task identity; unarchive does not reschedule or restore a skip', () => {
  const state = fixture(); state.wordbookEnrollments = [];
  state.plans.push({ id: 'old', dateKey: '2026-10-19', status: 'pending', origin: 'manual', skill: 'writing', kind: '1', estimatedMinutes: 5, target: { type: 'question' } });
  mutateStudyPlan(state, 'old', { type: 'hold' }, now);
  ensureUnifiedPlans(state, undefined, now);
  expect(state.plans.find(plan => plan.id === 'old')).toMatchObject({ dateKey: '2026-10-19', onHold: true });
  mutateStudyPlan(state, 'old', { type: 'skip' }, now);
  mutateStudyPlan(state, 'old', { type: 'archive' }, now);
  expect(state.plans.find(plan => plan.id === 'old').archivedAt).toBeTruthy();
  mutateStudyPlan(state, 'old', { type: 'unarchive' }, now);
  expect(state.plans.find(plan => plan.id === 'old')).toMatchObject({ status: 'skipped', dateKey: '2026-10-19' });
  expect(state.plans.find(plan => plan.id === 'old').archivedAt).toBeFalsy();
});

test('bulk hold and recoverable history archive preview exact selected identities and reject stale state', () => {
  const state=fixture();state.wordbookEnrollments=[];
  state.plans=[{id:'waiting',dateKey:'2026-10-19',status:'pending',origin:'manual',skill:'writing',estimatedMinutes:5},{id:'history',dateKey:'2026-10-18',status:'skipped',origin:'automatic',skill:'writing',estimatedMinutes:5}];
  const held=previewBacklogChange(state,{type:'hold',ids:['waiting']},now);
  expect(state.plans[0].onHold).toBeUndefined();
  applyBacklogPreview(state,held,now);expect(state.plans[0].onHold).toBe(true);
  const archive=previewBacklogChange(state,{type:'archive',ids:['history']},now);
  applyBacklogPreview(state,archive,now);
  expect(state.plans[1]).toMatchObject({id:'history',status:'skipped'});expect(state.plans[1].archivedAt).toBeTruthy();
  expect(()=>applyBacklogPreview(state,archive,now)).toThrow(/changed/);
});

test('replan preview includes related automatic task additions removals and duration changes', () => {
  const state=fixture();state.wordbookEnrollments=[];
  Object.assign(state.settings,{dailyMinutes:30,skills:['writing'],planning:{vocabularyMode:'ratio',vocabularyPercent:0,newWordsPerDay:0,carryoverPercent:30}});
  ensureUnifiedPlans(state,undefined,now);
  const today=state.plans.find(plan=>plan.dateKey==='2026-10-20');
  const missing=state.plans.find(plan=>plan.dateKey==='2026-10-22');
  state.plans=state.plans.filter(plan=>plan.id!==missing.id);
  state.plans.push({id:'obsolete',dateKey:'2026-10-23',title:'Obsolete automatic task',origin:'automatic',schemaVersion:2,status:'pending',skill:'writing',estimatedMinutes:3});
  state.plans.push({id:'selected',dateKey:'2026-10-19',title:'Selected waiting task',origin:'manual',status:'pending',skill:'writing',kind:'1',estimatedMinutes:6,target:{type:'question'}});
  state.plans.push({id:'unselected',dateKey:'2026-10-18',title:'Unselected waiting task',origin:'manual',status:'pending',skill:'writing',kind:'1',estimatedMinutes:6,target:{type:'question'}});
  const unselected=structuredClone(state.plans.find(plan=>plan.id==='unselected'));
  const preview=previewBacklogChange(state,{type:'replan',ids:['selected']},now);
  expect(preview.changes.find(change=>change.id==='selected')).toMatchObject({selected:true,from:'2026-10-19',to:'2026-10-20'});
  expect(preview.changes.find(change=>change.id===today.id)).toMatchObject({selected:false,changeType:'updated',fromMinutes:30,toMinutes:24});
  expect(preview.changes.find(change=>change.id==='obsolete')).toMatchObject({selected:false,changeType:'removed'});
  expect(preview.changes.find(change=>change.id===missing.id)).toMatchObject({selected:false,changeType:'added'});
  expect(preview.changes.some(change=>change.id==='unselected')).toBe(false);
  applyBacklogPreview(state,preview,now);
  expect(state.plans.find(plan=>plan.id==='unselected')).toEqual(unselected);
});

test('bulk skip does not apply related replan scope to unselected tasks', () => {
  const state=fixture();state.wordbookEnrollments=[];
  state.plans=['selected','unselected'].map(id=>({id,dateKey:'2026-10-19',title:id,origin:'manual',status:'pending',skill:'writing',kind:'1',estimatedMinutes:6,target:{type:'question'}}));
  const untouched=structuredClone(state.plans[1]);
  const preview=previewBacklogChange(state,{type:'skip',ids:['selected']},now);
  expect(preview.changes.map(change=>change.id)).toEqual(['selected']);
  applyBacklogPreview(state,preview,now);
  expect(state.plans[0]).toMatchObject({status:'skipped',skipReason:'bulk-skip'});
  expect(state.plans[1]).toEqual(untouched);
});

test('manual dynamic review can be scheduled ahead when nothing is due and freezes fixed meaning lists',()=>{
 const state=fixture();
 const dynamic=mutateStudyPlan(state,null,{type:'add',skill:'vocabulary',practice:'due-review',dateKey:'2026-10-25',estimatedMinutes:4,reviewType:'due',binding:'dynamic',reviewFilter:{bookId:'book-a'}},now);
 expect(dynamic.target).toMatchObject({binding:'dynamic',reviewType:'due',reviewFilter:{bookId:'book-a'},cards:[],batchSize:4});
 const fixed=mutateStudyPlan(state,null,{type:'add',skill:'vocabulary',practice:'due-review',dateKey:'2026-10-25',estimatedMinutes:2,reviewType:'custom',binding:'frozen',cards:[{entryId:'a',senseId:'one'},{entryId:'b',senseId:'one'}]},now);
 expect(fixed.target).toMatchObject({binding:'frozen',reviewType:'custom',cards:[{entryId:'a',senseId:'one'},{entryId:'b',senseId:'one'}]});
 expect(()=>mutateStudyPlan(state,null,{type:'add',skill:'vocabulary',practice:'due-review',dateKey:'2026-10-25',estimatedMinutes:2,assessmentMode:'audio',binding:'dynamic'},now)).toThrow(/assessed/);
});

test('dynamic custom tasks retain their selected meanings and source ordering until the list freezes',()=>{
 const state=fixture();
 for(const entry of state.vocabulary)entry.sources=[{type:'wordbook',id:entry.id,bookId:'book-a',unitId:'unit-a'}];
 const plan=mutateStudyPlan(state,null,{type:'add',skill:'vocabulary',practice:'due-review',dateKey:'2026-10-25',estimatedMinutes:2,assessmentMode:'definition',reviewType:'custom',binding:'dynamic',reviewFilter:{bookId:'book-a'},selectedMeanings:[{entryId:'c',senseId:'one'},{entryId:'b',senseId:'one'}],questionOrder:'source'},now);
 expect(selectScheduledVocabularyReview(state,plan.target,now,2).map(card=>card.entryId)).toEqual(['b','c']);
 expect(plan.target.cards).toEqual([]);
 expect(plan.target.selectedMeanings).toHaveLength(2);
});

test('binding a prospective partial batch preserves its exact identities instead of expanding to a legacy batch',async()=>{
  const state=fixture();
  state.plans=[{id:'partial',status:'pending',origin:'automatic',estimatedMinutes:1,target:{type:'vocabulary',mode:'learning-batch',bookId:'book-a',unitId:'unit-a',batchIndex:0,batchSize:10,assessmentMode:'dictation',selectionPolicy:'exact',entryIds:['b'],cards:[]}}];
  await bindStudyPlanTargets(state,{vocabulary:async()=>{},bank:async()=>[],catalog:async()=>({}) as never,section:async()=>({}) as never});
  expect(state.plans[0].target).toMatchObject({binding:'frozen',cards:[{entryId:'b',senseId:'one'}]});
  expect(state.plans[0].estimatedMinutes).toBe(1);
});

test('review source order follows book groups, while mixed sources retain saved order and explicit senses remain selectable',()=>{
  const state=fixture();state.vocabulary.reverse();
  const cards=['c','a','b'].map(entryId=>({entryId,id:entryId,senseId:'one'})) as never;
  expect(orderReviewCards(cards,state,{bookId:'book-a'}).map(card=>card.entryId)).toEqual(['a','b','c']);
  expect(orderReviewCards(cards,state,{}).map(card=>card.entryId)).toEqual(['c','b','a']);
  const senses=[{entryId:'a',id:'first'},{entryId:'a',id:'second'},{entryId:'b',id:'third'}] as never;
  expect(oneQuestionPerWord(senses).map(card=>card.id)).toEqual(['first','third']);
});
