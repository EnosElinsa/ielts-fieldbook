import { afterEach, test } from 'vitest';
import assert from 'node:assert/strict';
import * as runtime from '../../src/domain/vocabulary/runtimeData';
import * as readiness from '../../src/domain/vocabulary/readiness';
import * as content from '../../src/domain/vocabulary/content';
import * as context from '../../src/domain/vocabulary/context';
import { VOCABULARY_CATALOG as catalog } from '../../src/domain/vocabulary/catalog';

const originalTeaching=structuredClone(runtime.vocabularyTeaching);
const originalCatalog={entries:catalog.entries,units:catalog.units,memberships:catalog.memberships};
afterEach(()=>{reset(structuredClone(originalTeaching));Object.assign(catalog,originalCatalog);});
const clone = structuredClone;
const empty = () => ({ senseBaselines: {}, curriculum: { common: [], topics: [], source: [], repairs: [], modern: [] }, readiness: { core: [], corrections: [], defaults: [] }, learning: {}, tasks: { senseIds: {} }, context: { version: 'proposal-test', bindings: [], defaults: [], unresolved: [] } });
function reset(data = empty(), entries = [], scopes = []) {
  const cleared = empty();
  for (const key of ['curriculum', 'readiness', 'context', 'tasks']) Object.assign(runtime.vocabularyTeaching[key], cleared[key]);
  for (const key of ['senseBaselines', 'learning']) for (const name of Object.keys(runtime.vocabularyTeaching[key])) delete runtime.vocabularyTeaching[key][name];
  catalog.entries = entries;
  catalog.units = scopes.map(({ bookId, unitId, parentId }) => ({ id: unitId, bookId, parentId, kind: 'group', title: unitId }));
  catalog.memberships = scopes.flatMap(({ bookId, unitId }) => entries.map(e => ({ bookId, unitId, entryId: e.id })));
  runtime.registerVocabularyTeaching(data);
}
const sense = (patch = {}) => ({ id: 'same', definition: 'A public source meaning.', example: 'The token appears in a source.', pos: 'noun', source: 'English Wiktionary via Kaikki.org', ...patch });
const entry = (s, id = 'test:token') => ({ id, term: 'token', meaning: s.definition, example: s.example, category: 'word', tags: [], sources: [], senses: [s], createdAt: '', updatedAt: '' });
const sourceScope = { kind: 'dictionary-source' }, defaultScope = { kind: 'default' };
const groupScope = { kind: 'group', bookId: 'ielts-listening-essentials', unitId: 'proposal-multiple' };
function variant(id, before, after, scopes, metadata = {}, entryId = 'test:token') {
  return { entryId, senseId: before.id, variantId: id, definition: after.definition, example: after.example, pos: after.pos, ...metadata,
    originalSense: clone(before), contentVariant: { schemaVersion: 1, workItemId: id, sourceView: scopes.some(s => s.kind === 'dictionary-source'), sourceHash: 'test', beforeDisplayHash: 'test', afterDisplayHash: 'test', reviewedMaterialHash: 'test', beforeContent: clone(before), afterContent: clone(after), scopes } };
}
function project(s) { return Object.fromEntries(['id', 'definition', 'example', 'pos', 'collocations', 'usage', 'synonyms', 'antonyms', 'distinctions', 'distinctionTask', 'wordFamily', 'register'].filter(k => Object.hasOwn(s, k)).map(k => [k, s[k]])); }

test('registration retains legacy and all same-ID sibling variants and is idempotent', () => {
  const a = sense(), b = sense({ definition: 'A course meaning.' });
  const legacy = { entryId: 'test:token', senseId: a.id, example: a.example };
  const rows = [legacy, variant('source', a, { ...a, usage: 'Source.' }, [sourceScope]), variant('course', b, { ...b, usage: 'Course.' }, [groupScope])];
  const data = empty(); data.readiness.corrections = rows; reset(data); runtime.registerVocabularyTeaching(data);
  assert.equal(runtime.vocabularyTeaching.readiness.corrections.length, 3);
  assert.deepEqual(runtime.vocabularyTeaching.readiness.corrections.map(r => r.variantId), [undefined, 'source', 'course']);
});
test('exact whole source/default/group variants do not mix notes or tasks', () => {
  const raw = sense(), common = sense({ definition: 'A common meaning.', example: 'The token is common.' }), course = sense({ definition: 'A course meaning.', example: 'The token is used in class.' });
  const sourceTask = { prompt: 'Source-only choice', options: ['token', 'other'], answer: 'token', explanation: 'This source meaning only.' };
  const rows = [variant('s', raw, { ...raw, distinctions: ['Source only.'], distinctionTask: sourceTask }, [sourceScope], { exampleKind: 'reading-note', learningPriority: 'historical' }), variant('d', common, { ...common, usage: 'Default only.' }, [defaultScope]), variant('g', course, { ...course, collocations: ['course token'] }, [groupScope])];
  const data = empty(); data.readiness.corrections = rows; reset(data);
  for (const [before, row, scope] of [[raw, rows[0], sourceScope], [common, rows[1], defaultScope], [course, rows[2], groupScope]]) {
    const actual = readiness.supplementVocabularySense('test:token', before, [before], content.hasVocabularySenseEdits, scope);
    assert.deepEqual(project(actual), project(row.contentVariant.afterContent));
  }
  const updated = readiness.supplementVocabularySense('test:token', course, [course], content.hasVocabularySenseEdits, groupScope);
  assert.equal(readiness.isVocabularyReadingNote('test:token', updated), false);
  assert.equal(readiness.getVocabularyLearningPriority('test:token', updated), undefined);
  assert.equal(content.learningTask(entry(updated), updated, 'cloze').prompt, 'The _____ is used in class.');
  assert.equal(Object.hasOwn(updated, 'distinctionTask'), false);
  assert.equal(content.learningTask(entry(updated), updated, 'distinction'), undefined);
});
test('full match rejects same definition/example/POS with a different optional note', () => {
  const raw = sense({ usage: 'Public source note.' }), sibling = { ...raw, usage: 'Separate course note.' };
  const row = variant('s', raw, { ...raw, collocations: ['source token'] }, [sourceScope]);
  const data = empty(); data.readiness.corrections = [row]; reset(data);
  assert.deepEqual(readiness.supplementVocabularySense('test:token', sibling, [sibling], () => false, sourceScope), sibling);
});
test('identical final content keeps reading-note metadata isolated by the actual route', () => {
  const raw = sense(), after = { ...raw, example: 'The token remains visible.' }; const data = empty();
  data.readiness.corrections = [variant('s', raw, after, [sourceScope], { exampleKind: 'reading-note', learningPriority: 'historical' }), variant('g', raw, after, [groupScope], { learningPriority: 'general' })]; reset(data);
  const source = readiness.supplementVocabularySense('test:token', clone(raw), [raw], content.hasVocabularySenseEdits, sourceScope);
  const course = readiness.supplementVocabularySense('test:token', clone(raw), [raw], content.hasVocabularySenseEdits, groupScope);
  assert.equal(readiness.isVocabularyReadingNote('test:token', source), true); assert.equal(readiness.getVocabularyLearningPriority('test:token', source), 'historical');
  assert.equal(readiness.isVocabularyReadingNote('test:token', course), false); assert.equal(readiness.getVocabularyLearningPriority('test:token', course), 'general');
  assert.equal(content.learningTask(entry(source), source, 'cloze'), undefined); assert.equal(content.learningTask(entry(course), course, 'cloze').prompt, 'The _____ remains visible.');
  assert.equal(readiness.isVocabularyReadingNote('test:token', { ...source, usage: 'My new note.' }), false);
});
test('ambiguous exact variants fail closed', () => {
  const raw = sense(); const data = empty();
  data.readiness.corrections = [variant('a', raw, { ...raw, usage: 'A' }, [sourceScope]), variant('b', raw, { ...raw, usage: 'B' }, [sourceScope])]; reset(data);
  assert.deepEqual(readiness.supplementVocabularySense('test:token', raw, [raw], () => false, sourceScope), raw);
});
test('explicit empty fields remain edits when old snapshot omitted that field', () => {
  const raw = sense(), after = { ...raw, distinctions: ['New public guidance.'], usage: 'New usage.' };
  assert.equal(content.hasVocabularySenseEdits({ ...raw, distinctions: [] }, [raw, { ...raw, distinctions: ['New public guidance.'] }]), true);
  assert.equal(content.hasVocabularySenseEdits({ ...after, usage: '' }, [raw, after]), true);
  const saved = { id: after.id, definition: after.definition, example: after.example, pos: after.pos };
  assert.equal(content.hasVocabularySenseEdits(saved, [raw, after]), false);
});
test('learner edits, explicit clearing, and mixed old/new fields are preserved', () => {
  const before = sense({ usage: 'Old usage.', distinctions: ['Old note.'] }), after = { ...before, example: 'The token has new teaching.', usage: 'New usage.', distinctions: ['New note.'] };
  const row = variant('s', before, after, [sourceScope]); const data = empty(); data.readiness.corrections = [row]; reset(data);
  for (const learner of [{ ...after, source: 'Personal note' }, { ...after, distinctions: [] }, { ...after, usage: '' }, { ...after, usage: before.usage }, { ...before, example: 'My token note.' }]) {
    assert.equal(content.hasVocabularySenseEdits(learner, [before, after]), true);
    assert.deepEqual(readiness.supplementVocabularySense('test:token', learner, [before, after], content.hasVocabularySenseEdits, sourceScope, before), learner);
  }
});
test('saved missing optional notes can update from the selected complete public baseline', () => {
  const before = sense({ usage: 'Old public note.' }), after = { ...before, example: 'The token has new teaching.', collocations: ['public token'] };
  const row = variant('s', before, after, [sourceScope]); const data = empty(); data.readiness.corrections = [row]; reset(data);
  const learner = { id: before.id, definition: before.definition, example: before.example, pos: before.pos };
  const actual = readiness.supplementVocabularySense('test:token', learner, [before], content.hasVocabularySenseEdits, sourceScope, before);
  assert.deepEqual(project(actual), project(after));
});
test('default is reviewed after its actual public selection', () => {
  const raw = sense(), chosen = sense({ definition: 'A default meaning.', example: 'The token has a default.' });
  const after = { ...chosen, usage: 'Reviewed default.' }; const data = empty();
  data.readiness.defaults = [{ entryId: 'test:token', sense: chosen, originalSense: raw }];
  data.readiness.corrections = [variant('default', chosen, after, [defaultScope]), variant('source', raw, { ...raw, usage: 'Source only.' }, [sourceScope])];
  const e = entry(raw); reset(data, [clone(e)]);
  assert.deepEqual(project(content.reviewedEntry(e).senses[0]), project(after));
});
test('final group curriculum and each multiple-meaning choice receive exact repairs', () => {
  const raw = sense(), a = sense({ definition: 'Course first.', example: 'The token is first.' }), b = sense({ id: 'second', definition: 'Course second.', example: 'The token is second.' });
  const aa = { ...a, distinctions: ['First reviewed.'] }, bb = { ...b, collocations: ['second token'] };
  const data = empty(); data.curriculum.common = [a, b].map(s => ({ entryId: 'test:token', term: 'token', sense: s, reason: 'test' }));
  data.readiness.corrections = [variant('g1', a, aa, [groupScope]), variant('g2', b, bb, [groupScope]), variant('source', raw, { ...raw, usage: 'Source only.' }, [sourceScope])];
  const e = entry(raw); reset(data, [clone(e)], [{ ...groupScope, parentId: 'ielts-listening-essentials-chapter-04' }]);
  const actual = context.resolveVocabularyLearningContext(e, groupScope);
  assert.deepEqual(actual.curriculum.senses.map(project), [aa, bb].map(project));
  assert.deepEqual(project(actual.sense), project(aa));
  assert.equal(actual.curriculumCurrent, true);
  assert.equal(actual.contentReviewed, true);
  assert.equal(actual.reviewed, false);
  assert.deepEqual(project(context.resolveVocabularyLearningContext(e, { ...groupScope, senseId: b.id }).sense), project(bb));
});
test('group binding content review does not confirm an unresolved original source', () => {
  const raw = sense(), course = sense({ definition: 'Bound course meaning.', example: 'The token is bound.' });
  const after = { ...course, distinctions: ['Reviewed bound guidance.'] }; const data = empty();
  data.context.bindings = [{ ...groupScope, entryId: 'test:token', sense: course, originalSense: raw, status: 'unresolved', contentReviewed: true }];
  data.readiness.corrections = [variant('g', course, after, [groupScope])];
  const e = entry(raw); reset(data, [clone(e)]);
  const actual = context.resolveVocabularyLearningContext(e, groupScope);
  assert.deepEqual(project(actual.sense), project(after)); assert.equal(actual.reviewed, false); assert.equal(actual.contentReviewed, true); assert.equal(actual.status, 'unresolved');
});
test('final learner choice and deliberate cleared group notes survive public resolution', () => {
  const raw = sense(), course = sense({ definition: 'Course meaning.', example: 'The token is taught.' }), after = { ...course, distinctions: ['Public guidance.'] };
  const data = empty(); data.curriculum.common = [{ entryId: 'test:token', term: 'token', sense: course, reason: 'test' }]; data.readiness.corrections = [variant('g', course, after, [groupScope])];
  const publicEntry = entry(raw); reset(data, [clone(publicEntry)], [{ ...groupScope, parentId: 'ielts-listening-essentials-chapter-04' }]);
  const learner = { ...after, distinctions: [] }; const actual = context.resolveVocabularyLearningContext(entry(learner), groupScope);
  assert.deepEqual(project(actual.sense), project(learner)); assert.equal(actual.curriculumCurrent, false); assert.equal(actual.contentReviewed, false);
});
test('old no-variant rows retain supplementation and metadata behavior', () => {
  const raw = sense(); const data = empty(); data.readiness.corrections = [{ entryId: 'test:token', senseId: raw.id, originalSense: raw, definition: raw.definition, example: 'A legacy token example.', collocations: ['legacy token'], distinctions: ['Legacy guidance.'], exampleKind: 'reading-note' }]; reset(data);
  const actual = readiness.supplementVocabularySense('test:token', raw, [raw], content.hasVocabularySenseEdits);
  assert.equal(actual.example, 'A legacy token example.'); assert.deepEqual(actual.collocations, ['legacy token']); assert.equal(readiness.isVocabularyReadingNote('test:token', actual), true);
  assert.deepEqual(readiness.supplementVocabularySense('test:token', { ...actual, distinctions: [] }, [raw, actual], content.hasVocabularySenseEdits).distinctions, []);
});
