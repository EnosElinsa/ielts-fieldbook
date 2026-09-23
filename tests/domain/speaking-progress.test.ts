import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as core from '../../src/domain';

const topicId = '2026q4-p2-save-time';

test('derives speaking coverage, with the highest status winning', () => {
  assert.equal(core.speakingCoverage(core.migrateState({}), topicId), 'unseen');
  assert.equal(core.speakingCoverage(core.migrateState({ drafts: { [topicId]: '   ' } }), topicId), 'unseen');
  assert.equal(core.speakingCoverage(core.migrateState({
    sessions: [{ id: 'w1', questionId: topicId, essay: 'an essay', assessmentId: 'a-writing' }],
  }), topicId), 'unseen');

  assert.equal(core.speakingCoverage(core.migrateState({
    stories: [{ id: 'st1', title: 'Library', topicIds: [topicId] }],
  }), topicId), 'prepared');
  assert.equal(core.speakingCoverage(core.migrateState({
    drafts: { [topicId]: 'one-minute outline' },
  }), topicId), 'prepared');

  assert.equal(core.speakingCoverage(core.migrateState({
    stories: [{ id: 'st1', topicIds: [topicId] }],
    sessions: [{ id: 's1', questionId: topicId, skill: 'speaking', part: '2', essay: 'transcript', assessmentId: null }],
  }), topicId), 'practiced');

  assert.equal(core.speakingCoverage(core.migrateState({
    stories: [{ id: 'st1', topicIds: [topicId] }],
    drafts: { [topicId]: 'outline' },
    sessions: [{ id: 's1', questionId: topicId, skill: 'speaking', part: 2, notes: 'cue', essay: 'transcript', assessmentId: 'a1' }],
  }), topicId), 'assessed');
});

test('addStory dedupes by id and updates the existing story', () => {
  const state = core.migrateState({});
  const first = core.addStory(state, {
    id: 'st1', title: 'Library', people: 'a classmate', topicIds: [topicId], tags: 'school, travel',
  }, { id: () => 'generated', now: () => '2026-09-18T00:00:00.000Z' });
  const second = core.addStory(state, { id: 'st1', title: 'Library again', feeling: 'proud' }, { now: () => '2026-09-18T01:00:00.000Z' });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(state.stories.length, 1);
  assert.equal(state.stories[0].title, 'Library again');
  assert.equal(state.stories[0].feeling, 'proud');
  assert.equal(state.stories[0].people, 'a classmate');
  assert.deepEqual(state.stories[0].topicIds, [topicId]);
  assert.deepEqual(state.stories[0].tags, ['school', 'travel']);
  const updated = core.updateStory(state, 'st1', { place: 'campus library' }, { now: () => '2026-09-18T02:00:00.000Z' });
  assert.equal(updated.place, 'campus library');
  assert.equal(core.removeStory(state, 'st1'), true);
  assert.equal(core.removeStory(state, 'missing'), false);
  assert.equal(state.stories.length, 0);
});

test('migrate preserves stories, essays, and speaking session fields', () => {
  const migrated = core.migrateState({
    schemaVersion: 5,
    sessions: [
      { id: 'w1', questionId: 1342, essay: 'keep this essay' },
      { id: 's1', skill: 'speaking', part: 2, notes: 'cue outline', essay: 'spoken transcript', questionId: topicId },
      { id: 'bad', skill: 'listening', essay: 'not a third skill' },
    ],
    stories: [
      { id: 'st1', title: 'Old', people: 'friend', tags: 'school; travel', topicIds: 't1,t2', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
      { id: 'st1', title: 'Newer', event: 'trip', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z' },
      { id: 'st2', title: 'Market', place: 'street' },
    ],
  });
  assert.equal(migrated.schemaVersion, 7);
  assert.equal(migrated.sessions.find(item => item.id === 'w1').skill, 'writing');
  assert.equal(migrated.sessions.find(item => item.id === 'w1').essay, 'keep this essay');
  const speaking = migrated.sessions.find(item => item.id === 's1');
  assert.equal(speaking.skill, 'speaking');
  assert.equal(speaking.part, '2');
  assert.equal(speaking.notes, 'cue outline');
  assert.equal(speaking.essay, 'spoken transcript');
  assert.equal(migrated.sessions.find(item => item.id === 'bad').skill, 'writing');
  assert.equal(migrated.sessions.find(item => item.id === 'bad').essay, 'not a third skill');
  assert.equal(migrated.stories.length, 2);
  const story = migrated.stories.find(item => item.id === 'st1');
  assert.equal(story.title, 'Newer');
  assert.equal(story.people, 'friend');
  assert.equal(story.event, 'trip');
  assert.deepEqual(story.tags, ['school', 'travel']);
  assert.deepEqual(story.topicIds, ['t1', 't2']);
  assert.equal(story.createdAt, '2026-09-01T00:00:00.000Z');
  assert.ok(migrated.stories.find(item => item.id === 'st2').place, 'street');
});

test('createAttempt defaults to writing and accepts speaking fields', () => {
  const state = core.migrateState({});
  const writing = core.createAttempt(state, { questionId: '1342', essay: 'essay text' }, { id: () => 'w1' });
  const speaking = core.createAttempt(state, {
    questionId: topicId, essay: 'transcript', skill: 'speaking', part: '2', notes: 'outline',
  }, { id: () => 's1' });
  assert.equal(writing.skill, 'writing');
  assert.equal(writing.essay, 'essay text');
  assert.equal(speaking.skill, 'speaking');
  assert.equal(speaking.part, '2');
  assert.equal(speaking.notes, 'outline');
  assert.equal(speaking.essay, 'transcript');
});

test('backup validation recognizes stories and merge keeps writing essays', () => {
  assert.equal(core.validateBackup({ stories: [] }).valid, true);
  assert.equal(core.validateBackup({ stories: [] }).counts.stories, 0);
  assert.equal(core.validateBackup({ stories: {} }).valid, false);
  const current = core.migrateState({
    sessions: [{ id: 'w1', questionId: '1342', essay: 'writing survives' }],
    stories: [{ id: 'st1', title: 'Current story', topicIds: [topicId] }],
  });
  const incoming = core.migrateState({
    sessions: [{ id: 'w1', questionId: '1342', essay: 'older essay' }, { id: 'w2', questionId: '9', essay: 'other essay' }],
    stories: [{ id: 'st1', title: 'Older story' }, { id: 'st2', title: 'Incoming story' }],
  });
  const merged = core.mergeBackup(current, incoming, { includeSettings: false });
  assert.equal(merged.sessions.find(item => item.id === 'w1').essay, 'writing survives');
  assert.equal(merged.sessions.find(item => item.id === 'w2').essay, 'other essay');
  assert.deepEqual(merged.stories.map(item => item.id).sort(), ['st1', 'st2']);
  assert.equal(merged.stories.find(item => item.id === 'st1').title, 'Current story');
});
