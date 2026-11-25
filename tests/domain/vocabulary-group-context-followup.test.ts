import { afterEach, beforeEach, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { VOCABULARY_CATALOG } from '../../src/domain/vocabulary/catalog';
import { resolveVocabularyLearningContext } from '../../src/domain/vocabulary/context';
import { concealWordInflections, learningTask, vocabularyInflectedPattern } from '../../src/domain/vocabulary/content';
import { buildLearningBatch } from '../../src/domain/vocabulary/learningBatch';
import { currentGroupLearningRef, previewLearningPlanMeaningUpdate, updateLearningPlanMeanings } from '../../src/domain/vocabulary/learningMeaningUpdate';
import revisions from '../../src/domain/vocabulary/resourceDictionaryRevisions.json';
import baseline from '../../src/domain/vocabulary/resourceWordbookContextFollowupBaseline.json';
import reviewBaseline from '../../src/domain/vocabulary/resourceWordbookContextReviewBaseline.json';
import type { VocabularyEntry } from '../../src/domain/vocabulary/types';

const initial = structuredClone(VOCABULARY_CATALOG);
const released = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const entry = (term: string): VocabularyEntry => structuredClone(released.entries.find((row: VocabularyEntry) => row.term === term));

beforeEach(() => Object.assign(VOCABULARY_CATALOG, structuredClone(released)));
afterEach(() => Object.assign(VOCABULARY_CATALOG, structuredClone(initial)));

test('follow-up and review context revisions are registered in order with exact rollback coverage', () => {
  expect(revisions[0]).toBe('resourceWordbookContextReviewBaseline');
  expect(revisions).toContain('resourceWordbookContextFollowupBaseline');
  expect(revisions.indexOf('resourceWordbookContextReviewBaseline')).toBeLessThan(revisions.indexOf('resourceWordbookContextFollowupBaseline'));
  expect(revisions.indexOf('resourceWordbookContextFollowupBaseline')).toBeLessThan(revisions.indexOf('resourceAuditFixesBaseline'));
  expect(new Set(revisions).size).toBe(revisions.length);
  expect(baseline.removeCorrections).toEqual([]);
  expect(baseline.restoreCorrections).toEqual([]);
  expect(baseline.removeTopics).toHaveLength(6);
  expect(baseline.restoreTopicRows).toHaveLength(12);
  expect(reviewBaseline.removeCorrections).toEqual([]);
  expect(reviewBaseline.restoreCorrections).toEqual([]);
  expect(reviewBaseline.removeTopics).toEqual([]);
  expect(reviewBaseline.restoreTopicRows).toHaveLength(8);
});

test.each([
  ['absorb', 'ielts-vocabulary-chapter-06-group-01', 'kaikki:45fda064410978bf70', 'verb', 'kaikki:9cfebb50e0e983dc6b'],
  ['stumble', 'ielts-vocabulary-chapter-06-group-02', 'kaikki:1e02b352b6ab3fb77b', 'verb', 'kaikki:4251ec62d146deab6c'],
  ['miss', 'ielts-vocabulary-chapter-19-group-01', 'kaikki:c47779c174d09829c5', 'verb', 'kaikki:ffbea3133167d30178'],
  ['partner', 'ielts-vocabulary-chapter-19-group-02', 'kaikki:44b0b453f382aa1322', 'noun', 'kaikki:05ed13e4912d4644e1'],
  ['foremost', 'ielts-vocabulary-chapter-22-group-01', 'kaikki:ebc7ac03ad53e11b57', 'adj', 'kaikki:3133b1dd5b584e90cd'],
] as const)('resolved deferred term %s binds the evidence-backed sense and upgrades existing tasks cleanly', (term, unitId, newSenseId, pos, oldSenseId) => {
  const raw = entry(term);
  const scope = { bookId: 'ielts-vocabulary', unitId };
  const live = resolveVocabularyLearningContext(raw, scope);
  const explicit = resolveVocabularyLearningContext(raw, { ...scope, senseId: newSenseId });

  expect(live.curriculumCurrent).toBe(true);
  expect(live.contentReviewed).toBe(true);
  expect(live.sense).toMatchObject({ id: newSenseId, pos });
  expect(explicit.sense).toEqual(live.sense);

  const highlight = [...live.sense!.example.matchAll(vocabularyInflectedPattern(term, live.sense!.pos))];
  expect(highlight.length).toBeGreaterThan(0);

  const cloze = learningTask(live.entry, live.sense!, 'cloze');
  expect(cloze).toBeDefined();
  expect([...cloze!.prompt.matchAll(vocabularyInflectedPattern(term, live.sense!.pos))]).toEqual([]);

  // Existing unfinished task keeps its old sense until updated, and previews the upgrade cleanly.
  const plan = {
    id: `plan-${term}`,
    status: 'pending' as const,
    target: {
      type: 'vocabulary' as const,
      mode: 'learning-batch' as const,
      bookId: scope.bookId,
      unitId,
      batchIndex: 0,
      batchSize: 10,
      assessmentMode: 'definition',
      cards: [{ entryId: raw.id, senseId: oldSenseId }],
    },
  };
  const state = { vocabulary: [raw], plans: [structuredClone(plan)] };
  expect(currentGroupLearningRef(state, scope, { entryId: raw.id, senseId: oldSenseId }).senseId).toBe(newSenseId);
  const preview = previewLearningPlanMeaningUpdate(state, state.plans[0]);
  expect(preview?.changes).toHaveLength(1);
  expect(preview?.changes[0].from.senseId).toBe(oldSenseId);
  expect(preview?.changes[0].to.senseId).toBe(newSenseId);
  updateLearningPlanMeanings(state, plan.id, state.plans[0].target, '2026-11-25T10:00:00Z');
  expect(state.plans[0].target.cards[0].senseId).toBe(newSenseId);
  expect(state.plans[0].meaningUpdates).toHaveLength(1);

  // Personal edits remain protected.
  const edited = structuredClone(raw);
  edited.senses[0].definition = `Personal ${term} definition.`;
  edited.senses[0].example = `Personal ${term} example.`;
  const resolvedEdited = resolveVocabularyLearningContext(edited, scope);
  expect(resolvedEdited.sense?.definition).toBe(`Personal ${term} definition.`);
  expect(resolvedEdited.sense?.example).toBe(`Personal ${term} example.`);
});

test('celebrity keeps the confirmed fame sense and fixes its cloze answer giveaway', () => {
  const raw = entry('celebrity');
  const scope = { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-07-group-02' };
  const live = resolveVocabularyLearningContext(raw, scope);
  expect(live.sense?.id).toBe('kaikki:8b15829ceb1db3bc86');
  expect(live.sense?.example).not.toMatch(/celebrities/i);
  const cloze = learningTask(live.entry, live.sense!, 'cloze');
  expect(cloze).toBeDefined();
  expect(cloze!.prompt).not.toMatch(/celebrit/i);
});

test.each([
  ['ash', 'ielts-vocabulary-chapter-04-group-01', 'kaikki:4017026c24232e3ec8', 'noun'],
  ['studio', 'ielts-vocabulary-chapter-13-group-02', 'kaikki:c6e448b66c845eba73', 'noun'],
  ['benefit', 'ielts-vocabulary-chapter-16-group-02', 'kaikki:f8a47a6378f637f004', 'noun'],
] as const)('confirmed-keep deferred term %s retains its verified sense and cloze coverage', (term, unitId, senseId, pos) => {
  const raw = entry(term);
  const scope = { bookId: 'ielts-vocabulary', unitId };
  const live = resolveVocabularyLearningContext(raw, scope);
  expect(live.sense).toMatchObject({ id: senseId, pos });
  expect(learningTask(live.entry, live.sense!, 'cloze')).toBeDefined();
});

test.each([
  ['parallel', 'ielts-vocabulary-chapter-01-group-02', 'kaikki:b27ac56b1deff44909', 'adj', ['kaikki:def6070d850ac9dfe0']],
  ['crowd', 'ielts-vocabulary-chapter-03-group-01', 'kaikki:dc11e44719f91c606a', 'noun', ['kaikki:84cea590fc85f77dce', 'kaikki:de689af86961843679']],
  ['reuse', 'ielts-vocabulary-chapter-10-group-01', 'kaikki:20d5af2dece71139b2', 'verb', ['kaikki:1027d74d9d4e157397', 'kaikki:f13995717780a052f5']],
  ['smash', 'ielts-vocabulary-chapter-20-group-02', 'kaikki:00a8a21a600efb0a25', 'verb', ['kaikki:37a4d678bea39a089f', 'kaikki:0b25a4db5c6452fb79']],
  ['range', 'ielts-vocabulary-chapter-20-group-04', 'kaikki:3b067d9485d2a34516', 'verb', ['kaikki:798af9ba445137177d', 'kaikki:f95bb821d396bdb939']],
  ['crazy', 'ielts-vocabulary-chapter-21-group-07', 'kaikki:1ef053d9ac11491612', 'adj', ['kaikki:503b06b0f0706b0b7f']],
] as const)('re-audited PR #42 selection %s binds the corrected sense and upgrades both older and PR #42 tasks', (term, unitId, newSenseId, pos, retiredSenseIds) => {
  const raw = entry(term);
  const scope = { bookId: 'ielts-vocabulary', unitId };
  const live = resolveVocabularyLearningContext(raw, scope);
  const explicit = resolveVocabularyLearningContext(raw, { ...scope, senseId: newSenseId });

  expect(live.curriculumCurrent).toBe(true);
  expect(live.sense).toMatchObject({ id: newSenseId, pos });
  expect(explicit.sense).toEqual(live.sense);
  expect(concealWordInflections(live.sense!.definition, term)).toBe(live.sense!.definition);
  expect(learningTask(live.entry, live.sense!, 'cloze')).toBeDefined();

  for (const oldSenseId of retiredSenseIds) {
    expect(currentGroupLearningRef({ vocabulary: [raw] }, scope, { entryId: raw.id, senseId: oldSenseId }).senseId).toBe(newSenseId);
    // Keeping the original task meaning still resolves and remains assessable even if the learner never saved the retired PR #42 sense.
    const retired = resolveVocabularyLearningContext(raw, { ...scope, senseId: oldSenseId });
    expect(retired.sense?.id).toBe(oldSenseId);
    expect(retired.curriculumCurrent).toBe(false);
    const originalBatch = buildLearningBatch({ vocabulary: [] }, scope.bookId, scope.unitId, 0, 10, 'definition', [{ entryId: raw.id, senseId: oldSenseId }]);
    expect(originalBatch.cards).toHaveLength(1);
    expect(originalBatch.cards[0].senseId).toBe(oldSenseId);
  }
});

test('multi-group terms keep distinct meanings across chapters (absorb and range)', () => {
  const absorb = entry('absorb');
  const absorbPlant = resolveVocabularyLearningContext(absorb, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-02-group-02' });
  const absorbTech = resolveVocabularyLearningContext(absorb, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-06-group-01' });
  expect(absorbPlant.sense?.id).toBe('editorial:curriculum:plant-research:ve-4de44d8a:verb');
  expect(absorbTech.sense?.id).toBe('kaikki:45fda064410978bf70');

  const range = entry('range');
  const rangeGeo = resolveVocabularyLearningContext(range, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-01-group-03' });
  const rangeAct = resolveVocabularyLearningContext(range, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-20-group-04' });
  expect(rangeGeo.sense?.id).toBe('kaikki:798af9ba445137177d');
  expect(rangeGeo.sense?.pos).toBe('noun');
  expect(rangeAct.sense?.id).toBe('kaikki:3b067d9485d2a34516');
  expect(rangeAct.sense?.pos).toBe('verb');
});

test.each([
  ['comedy', 'ielts-vocabulary-chapter-09-group-01', 'kaikki:5c7d89dfcc7792d59e'],
  ['punishment', 'ielts-vocabulary-chapter-18-group-03', 'kaikki:114abbeeb24f48db6e'],
  ['curse', 'ielts-vocabulary-chapter-20-group-01', 'kaikki:cda9973a942a1cd991'],
  ['whistle', 'ielts-vocabulary-chapter-20-group-01', 'kaikki:d196c3725b6f1970f3'],
  ['designate', 'ielts-vocabulary-chapter-20-group-03', 'kaikki:044d19f688e293ffe5'],
  ['sort', 'ielts-vocabulary-chapter-20-group-04', 'kaikki:6719d9e24112eb6f76'],
] as const)('refined PR #42 definition for %s is capitalised, punctuated and free of circular giveaways', (term, unitId, senseId) => {
  const raw = entry(term);
  const live = resolveVocabularyLearningContext(raw, { bookId: 'ielts-vocabulary', unitId });
  expect(live.sense?.id).toBe(senseId);
  expect(live.sense?.definition).toMatch(/^[A-Z].*\.$/);
  expect(concealWordInflections(live.sense!.definition, term)).toBe(live.sense!.definition);
  if (term === 'punishment') expect(live.sense?.definition).not.toMatch(/\bpunish/i);
});

test('occur in Conflict and competition Group 3 highlights occurred via regular CVC doubling', () => {
  const raw = entry('occur');
  const live = resolveVocabularyLearningContext(raw, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-18-group-03' });
  const matches = [...live.sense!.example.matchAll(vocabularyInflectedPattern(raw.term, live.sense!.pos))].map(m => m[0]);
  expect(matches).toEqual(['occurred']);
});

test('retired previousSenses fallback preserves personal edits, group isolation and missing-sense guards', () => {
  const raw = entry('range');
  const ch20 = { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-20-group-04' };
  const ch01 = { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-01-group-03' };
  const retiredId = 'kaikki:f95bb821d396bdb939';

  // Personal edits on a saved retired sense still win over the stored retired snapshot.
  const edited = structuredClone(raw);
  edited.senses.push({ id: retiredId, pos: 'noun', definition: 'My saved array note.', example: 'A personal range example.', source: 'Personal note' });
  const resolvedEdited = resolveVocabularyLearningContext(edited, { ...ch20, senseId: retiredId });
  expect(resolvedEdited.sense?.definition).toBe('My saved array note.');
  expect(resolvedEdited.sense?.example).toBe('A personal range example.');

  // Another group never borrows Ch20 G4 retired previousSenses.
  const crossGroup = resolveVocabularyLearningContext(raw, { ...ch01, senseId: retiredId });
  expect(crossGroup.sense).toBeUndefined();

  // Unknown sense IDs never match retired previousSenses.
  const unknown = resolveVocabularyLearningContext(raw, { ...ch20, senseId: 'kaikki:nonexistent-sense' });
  expect(unknown.sense).toBeUndefined();
});

test.each([
  ['curl', 'ielts-vocabulary-chapter-03-group-01', 'kaikki:dc005d8fefec9f2d78', 'noun', ['kaikki:52fcff2fda3f9392ee']],
  ['revise', 'ielts-vocabulary-chapter-05-group-06', 'kaikki:6403081f8791569c23', 'verb', ['kaikki:7db231fca0dc078227']],
  ['miniature', 'ielts-vocabulary-chapter-10-group-03', 'kaikki:552839c4f245b2be71', 'adj', ['kaikki:d7ff4d251725eb19fb', 'kaikki:45617a6b2fe3d12ba6']],
  ['foul', 'ielts-vocabulary-chapter-18-group-03', 'kaikki:3ec567250f7e679336', 'adj', ['kaikki:69a6c7de8ea5677cad', 'kaikki:0a35aee8d5ecec1d6a']],
  ['reel', 'ielts-vocabulary-chapter-20-group-02', 'kaikki:7643448034a5bba273', 'verb', ['kaikki:36f383f07ca3b00af7', 'kaikki:c29b5a82b4da8e1037']],
] as const)('review-pass correction %s binds the source-confirmed sense and upgrades retired PR #42 tasks', (term, unitId, newSenseId, pos, retiredSenseIds) => {
  const raw = entry(term);
  const scope = { bookId: 'ielts-vocabulary', unitId };
  const live = resolveVocabularyLearningContext(raw, scope);
  const explicit = resolveVocabularyLearningContext(raw, { ...scope, senseId: newSenseId });

  expect(live.curriculumCurrent).toBe(true);
  expect(live.contentReviewed).toBe(true);
  expect(live.sense).toMatchObject({ id: newSenseId, pos });
  expect(explicit.sense).toEqual(live.sense);
  expect(concealWordInflections(live.sense!.definition, term)).toBe(live.sense!.definition);
  expect([...live.sense!.example.matchAll(vocabularyInflectedPattern(term, live.sense!.pos))].length).toBeGreaterThan(0);
  expect(learningTask(live.entry, live.sense!, 'cloze')).toBeDefined();

  for (const oldSenseId of retiredSenseIds) {
    expect(currentGroupLearningRef({ vocabulary: [raw] }, scope, { entryId: raw.id, senseId: oldSenseId }).senseId).toBe(newSenseId);
    const retired = resolveVocabularyLearningContext(raw, { ...scope, senseId: oldSenseId });
    expect(retired.sense?.id).toBe(oldSenseId);
    expect(retired.curriculumCurrent).toBe(false);
    const originalBatch = buildLearningBatch({ vocabulary: [] }, scope.bookId, scope.unitId, 0, 10, 'definition', [{ entryId: raw.id, senseId: oldSenseId }]);
    expect(originalBatch.cards).toHaveLength(1);
    expect(originalBatch.cards[0].senseId).toBe(oldSenseId);
  }

  // Personal edits stay protected.
  const edited = structuredClone(raw);
  edited.senses[0].definition = `Personal ${term} definition.`;
  edited.senses[0].example = `Personal ${term} example.`;
  const resolvedEdited = resolveVocabularyLearningContext(edited, scope);
  expect(resolvedEdited.sense?.definition).toBe(`Personal ${term} definition.`);
  expect(resolvedEdited.sense?.example).toBe(`Personal ${term} example.`);
});

test('reel keeps distinct meanings across School education (film spool noun) and Actions (dizzy verb)', () => {
  const reel = entry('reel');
  const spool = resolveVocabularyLearningContext(reel, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-05-group-03' });
  const dizzy = resolveVocabularyLearningContext(reel, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-20-group-02' });
  expect(spool.sense).toMatchObject({ id: 'editorial:curriculum:school-education:ve-7c78fa3b:noun', pos: 'noun' });
  expect(dizzy.sense).toMatchObject({ id: 'kaikki:7643448034a5bba273', pos: 'verb' });
});

test.each([
  ['respire', 'ielts-vocabulary-chapter-02-group-01', 'kaikki:45c9e8682870efbdfc', /respir/i],
  ['access', 'ielts-vocabulary-chapter-17-group-02', 'kaikki:622d5062d3feeb0fed', /access/i],
  ['X-ray', 'ielts-vocabulary-chapter-21-group-04', 'kaikki:2f63b0a5b4dad645b0', /x-?rays?/i],
] as const)('review-pass refined definition for %s removes answer giveaways while upgrading saved PR #42 copies', (term, unitId, senseId, giveaway) => {
  const raw = entry(term);
  const scope = { bookId: 'ielts-vocabulary', unitId };
  const live = resolveVocabularyLearningContext(raw, scope);
  expect(live.sense?.id).toBe(senseId);
  expect(live.sense?.definition).toMatch(/^[A-Z].*\.$/);
  expect(live.sense?.definition).not.toMatch(giveaway);
  expect(learningTask(live.entry, live.sense!, 'cloze')).toBeDefined();

  // An unmodified PR #42 saved snapshot upgrades cleanly to the refined definition.
  const pr42Row = reviewBaseline.restoreTopicRows.find(row => row.term === term && row.unitId === unitId)!;
  const withPr42Saved = structuredClone(raw);
  withPr42Saved.senses = [structuredClone(pr42Row.sense), ...withPr42Saved.senses.filter(s => s.id !== senseId)];
  const upgraded = resolveVocabularyLearningContext(withPr42Saved, scope);
  expect(upgraded.sense?.definition).toBe(live.sense?.definition);
  expect(upgraded.curriculumCurrent).toBe(true);
});
