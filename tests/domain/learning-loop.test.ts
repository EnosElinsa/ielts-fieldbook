import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as core from '../../src/domain';

const essay = 'A complete candidate response kept for history.';
const samplePath = path.join(import.meta.dirname, '..', 'fixtures', 'assessment-sample.md');
const sampleText = fs.readFileSync(samplePath, 'utf8');

function localPlus(iso, days) {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function structuredAssessment(overrides) {
  return Object.assign({
    id: 'a1',
    date: '2026-01-01T00:00:00.000Z',
    filename: 'a.md',
    sessionId: 's1',
    questionId: '1342',
    overall: '6.0',
    criteria: [{ name: 'Task Achievement', score: '6', evidence: 'ok' }],
    summary: 'Main issue is data.',
    rawText: '# full markdown that can be rebuilt',
  }, overrides || {});
}

test('A1: v6 state migrates to v7 without dropping essays, assessments, or lexicon', () => {
  const migrated = core.migrateState({
    schemaVersion: 6,
    sessions: [{ id: 's1', questionId: 1342, essay, assessmentId: 'a1' }],
    assessments: [{ id: 'a1', rawText: 'legacy score', sessionId: 's1', overall: '5.5' }],
    lexicon: [{ id: 'l1', term: 'overall', meaning: '总体上' }],
    drafts: { '1342': 'still here', 'topic-1:notes': 'cue notes', 'topic-1': 'spoken draft' },
  });
  assert.equal(migrated.schemaVersion, 7);
  assert.equal(core.STATE_VERSION, 7);
  assert.equal(migrated.sessions.length, 1);
  assert.equal(migrated.sessions[0].essay, essay);
  assert.equal(migrated.assessments.length, 1);
  assert.equal(migrated.lexicon.length, 1);
  assert.equal(core.draftText(migrated.drafts['1342'], 'writing'), 'still here');
  assert.equal(migrated.drafts['1342'].text, 'still here');
  assert.equal(migrated.drafts['1342'].parentSessionId, null);
  assert.equal(migrated.drafts['topic-1'].notes, 'cue notes');
  assert.equal(core.draftText(migrated.drafts['topic-1'], 'speaking'), 'spoken draft');
  assert.equal(migrated.drafts['topic-1:notes'], undefined);
});

test('A1: normalizeDraft accepts strings and speaking objects', () => {
  assert.deepEqual(core.normalizeDraft('hello'), {
    text: 'hello', transcript: '', notes: '', parentSessionId: null,
  });
  assert.equal(core.draftText({ transcript: 'said this', text: 'ignored' }, 'speaking'), 'said this');
  assert.equal(core.draftText({ text: 'written' }, 'writing'), 'written');
});

test('A2: persistShape omits questions, speaking samples, and structured rawText', () => {
  const state = core.migrateState({
    questions: [{ id: '1342', type: '1', prompt: 'chart' }],
    speakingTopics: [{
      id: 't1', part: 2, title: 'Save time', titleZh: '省时', cueCard: 'Describe…', bullets: ['a'],
      part3: ['why?'], incomplete: false, sampleAnswer: 'SECRET SAMPLE', samples: ['nope'],
    }],
    assessments: [structuredAssessment()],
    sessions: [{ id: 's1', questionId: '1342', essay }],
  });
  const payload = core.persistShape(state);
  assert.equal(payload.schemaVersion, 7);
  assert.equal(payload.questions, undefined);
  assert.equal(payload.speakingTopics, undefined);
  assert.equal(payload.assessments[0].rawText, undefined);
  assert.equal(payload.assessments[0].overall, '6.0');
  assert.equal(payload.assessments[0].summary, 'Main issue is data.');
  assert.ok(state.assessments[0].rawText);
  assert.equal(state.questions.length, 1);
});

test('A2: persistShape keeps rawText when structured fields are incomplete', () => {
  const state = core.migrateState({
    assessments: [{ id: 'a2', rawText: 'only source', overall: '', criteria: [], summary: '' }],
  });
  const payload = core.persistShape(state);
  assert.equal(payload.assessments[0].rawText, 'only source');
});

test('A2: compactAssessmentsForQuota strips oldest rawText first', () => {
  const state = core.migrateState({
    assessments: [
      { id: 'old', date: '2026-01-01T00:00:00.000Z', rawText: 'old raw', overall: '' },
      { id: 'new', date: '2026-06-01T00:00:00.000Z', rawText: 'new raw', overall: '' },
    ],
  });
  const result = core.compactAssessmentsForQuota(state);
  assert.equal(result.stripped, 1);
  assert.equal(state.assessments.find(item => item.id === 'old').rawText, undefined);
  assert.equal(state.assessments.find(item => item.id === 'new').rawText, 'new raw');
});

test('A2: bank cache is slim and legacy keys can be cleared on a fake store', () => {
  const cache = core.bankCacheShape({
    writing: [{ id: '1342', type: '1' }],
    speakingTopics: [{ id: 't1', part: 2, title: 'X', sampleAnswer: 'hide me', samples: ['a'] }],
    cachedAt: '2026-09-19T00:00:00.000Z',
  });
  assert.deepEqual(cache.writing, [{ id: '1342', type: '1' }]);
  assert.equal(cache.speakingTopicsSlim[0].sampleAnswer, undefined);
  assert.equal(cache.speakingTopicsSlim[0].samples, undefined);
  assert.equal(cache.speakingTopicsSlim[0].title, 'X');
  assert.equal(cache.cachedAt, '2026-09-19T00:00:00.000Z');
  const removed = [];
  const storage = { removeItem(key) { removed.push(key); } };
  core.clearLegacyStores(storage);
  assert.deepEqual(removed, core.LEGACY_STORES);
});

test('A3: rewrite parent survives migrate and createAttempt stays rewrite', () => {
  const migrated = core.migrateState({
    drafts: { '1342': { text: 'old essay', parentSessionId: 's-parent' } },
  });
  assert.equal(migrated.drafts['1342'].parentSessionId, 's-parent');
  const state = core.migrateState({});
  core.createAttempt(state, {
    questionId: 't1', essay: 'again', skill: 'speaking', part: '2', parentSessionId: 's-old',
  }, { id: () => 's-new' });
  assert.equal(state.sessions[0].attemptKind, 'rewrite');
  assert.equal(state.sessions[0].parentSessionId, 's-old');
});

test('A4: saving a Task 1 essay does not complete a review plan', () => {
  const state = core.migrateState({
    plans: [{ id: 'p-review', kind: 'review', status: 'in_progress' }],
    activePlanId: 'p-review',
  });
  const attempt = core.createAttempt(state, { questionId: '1342', type: '1', essay }, { id: () => 's1' });
  assert.equal(core.planMatchesAttempt(state.plans[0], attempt), false);
  assert.equal(core.completePlanIfMatched(state, 'p-review', attempt), null);
  assert.equal(state.plans[0].status, 'in_progress');
  assert.equal(state.activePlanId, 'p-review');
});

test('A4: saving Task 1 only completes kind 1, and stories are not completed by an attempt', () => {
  const state = core.migrateState({
    plans: [
      { id: 'p1', kind: '1', status: 'in_progress' },
      { id: 'p2', kind: '2', status: 'in_progress' },
      { id: 'ps', kind: 'stories', status: 'in_progress' },
      { id: 'plx', kind: 'lexicon', status: 'in_progress' },
    ],
    activePlanId: 'p1',
  });
  const task1 = core.createAttempt(state, { questionId: '1342', type: '1', essay }, { id: () => 's1' });
  assert.equal(core.planMatchesAttempt(state.plans[0], task1), true);
  assert.equal(core.planMatchesAttempt(state.plans[1], task1), false);
  assert.ok(core.completePlanIfMatched(state, 'p1', task1));
  assert.equal(state.plans[0].status, 'completed');
  const speaking = core.createAttempt(state, {
    questionId: 't1', type: '2', skill: 'speaking', part: '2', essay: 'talk',
  }, { id: () => 's2' });
  assert.equal(core.planMatchesAttempt({ kind: 'speaking-p2' }, speaking), true);
  assert.equal(core.planMatchesAttempt({ kind: 'speaking-p1' }, speaking), false);
  assert.equal(core.planMatchesAttempt(state.plans[2], speaking), false);
  assert.equal(core.planMatchesAttempt(state.plans[3], task1), false);
  state.activePlanId = 'ps';
  const story = core.addStory(state, { title: 'Library' }, { id: () => 'st1' });
  assert.equal(story.duplicate, false);
  assert.ok(core.completeStoriesPlan(state));
  assert.equal(state.plans[2].status, 'completed');
});

test('A4: lexiconComplete only when due count dropped or nothing is due', () => {
  const state = core.migrateState({
    plans: [{ id: 'plx', kind: 'lexicon', status: 'in_progress' }],
    activePlanId: 'plx',
    lexicon: [{
      id: 'l1', term: 'overall', skill: 'writing', meaning: '总体上',
      nextReviewAt: '2020-01-01T00:00:00.000Z', status: 'learning',
    }],
  });
  assert.equal(core.completeLexiconPlan(state, 1, '2026-09-19T00:00:00.000Z'), null);
  assert.equal(state.plans[0].status, 'in_progress');
  core.reviewLexiconItem(state, 'l1', true, '2026-09-19T00:00:00.000Z');
  assert.ok(core.completeLexiconPlan(state, 1, '2026-09-19T00:00:00.000Z'));
  assert.equal(state.plans[0].status, 'completed');
});

test('A4: completeReview finishes the review plan without auto-reviewing errors', () => {
  const state = core.migrateState({
    plans: [{ id: 'pr', kind: 'review', status: 'in_progress' }],
    activePlanId: 'pr',
    errors: [{ id: 'e1', code: 'TA-DATA', text: 'series', resolved: false, reviewCount: 0 }],
  });
  assert.ok(core.completeReview(state));
  assert.equal(state.plans[0].status, 'completed');
  assert.equal(state.errors[0].reviewCount, 0);
  assert.equal(state.activePlanId, null);
});

test('A5: isBandScore accepts 6, 6.0, 6.00 and 5.5', () => {
  assert.equal(core.isBandScore('6'), true);
  assert.equal(core.isBandScore('6.0'), true);
  assert.equal(core.isBandScore('6.00'), true);
  assert.equal(core.isBandScore('5.5'), true);
  assert.equal(core.isBandScore('9'), true);
  assert.equal(core.isBandScore('9.5'), false);
  assert.equal(core.isBandScore('6.25'), false);
  assert.equal(core.isBandScore('unscored'), false);
});

test('A5: overall 6.0 parses, and a numeric Pronunciation score is flagged not averaged', () => {
  const text = `review_contract_version: speaking-1
skill: speaking
part: 2
overall: 6.0

## Candidate response

I saved time.

## 四项评分

| 项目 | 分数 | 依据 |
|---|---:|---|
| Fluency and Coherence | 6 | ok |
| Lexical Resource | 6.0 | ok |
| Grammatical Range and Accuracy | 5.5 | ok |
| Pronunciation | 7 | invented |

## 总体判断

Estimated.

## 下一次 30 分钟练习

Retell.`;
  const parsed = core.parseAssessmentFile(text, 'fake-p.md');
  assert.equal(parsed.overall, '6.0');
  assert.equal(parsed.reviewContractVersion, 'speaking-1');
  assert.equal(parsed.inventedPronunciation, true);
  const scored = core.scoredCriteria(parsed);
  assert.equal(scored.length, 3);
  assert.ok(!scored.some(item => /pronunciation/i.test(item.name)));
});

test('A5: missing session_id does not silently attach to another attempt of the same question', () => {
  const state = core.migrateState({
    questions: [{ id: '1342', type: '1', name: 'C21T1' }],
    sessions: [{ id: 'different', questionId: '1342', essay: 'saved essay', date: '2026-09-16' }],
  });
  const parsed = core.parseAssessmentFile(`question_id: 1342
task: Task 1
overall: 5.5

## Candidate response

${essay}

## 四项评分

| 项目 | 分数 | 依据 |
|---|---:|---|
| Task Achievement | 5 | x |

## 总体判断

Needs work.

## 下一次 30 分钟练习

Table.`, 'a.md');
  const result = core.resolveAssessmentEssay(state, parsed, { id: () => 'generated', now: () => '2026-09-16T00:00:00.000Z' });
  assert.equal(result.created, true);
  assert.equal(result.reason, 'candidate_response');
  assert.equal(result.session.id, 'generated');
  assert.equal(result.session.essay, essay);
  assert.equal(state.sessions.length, 2);
});

test('A5: same-question unlink is repaired only when the essay hash matches', () => {
  const state = core.migrateState({
    questions: [{ id: '1342', type: '1', name: 'C21T1' }],
    sessions: [{ id: 'saved-session', questionId: '1342', essay }],
  });
  const parsed = core.parseAssessmentFile(`question_id: 1342
task: Task 1
overall: 5.5

## Candidate response

${essay}

## 总体判断

Needs work.`, 'a.md');
  const result = core.resolveAssessmentEssay(state, parsed);
  assert.equal(result.created, false);
  assert.equal(result.reason, 'content_hash');
  assert.equal(result.session.id, 'saved-session');
});

test('A5: imports a synthetic assessment fixture and links by session_id', () => {
  const state = core.migrateState({
    questions: [{ id: '9001', type: '1', name: 'Sample T1' }],
    sessions: [{
      id: 'sample-session-0001',
      questionId: '9001',
      essay: 'placeholder that is not the candidate response',
    }],
  });
  const result = core.importAssessmentText(state, sampleText, 'assessment-sample.md', {
    id: () => 'a-sample', now: () => '2026-09-16T00:00:00.000Z',
  });
  assert.notEqual(result.invalid, true);
  assert.equal(result.resolution, 'session_id');
  assert.equal(result.session.id, 'sample-session-0001');
  assert.equal(result.assessment.overall, '5.5');
  assert.equal(result.assessment.reviewContractVersion, '2');
  assert.equal(state.sessions.length, 1);
});

test('A5: reconstructs markdown when rawText was omitted', () => {
  const markdown = core.reconstructAssessmentMarkdown(structuredAssessment({
    candidateResponse: essay,
    priorities: 'Check data.',
    nextExercise: 'Write a table.',
    criteria: [
      { name: 'Task Achievement', score: '6', evidence: 'overview present' },
    ],
  }));
  assert.match(markdown, /overall: 6\.0/);
  assert.match(markdown, /## Candidate response\n\nA complete candidate response kept for history\./);
  assert.match(markdown, /Task Achievement/);
  assert.match(markdown, /## 总体判断\n\nMain issue is data\./);
});

test('B1: unresolved errors are immediately due; review uses local calendar intervals', () => {
  const state = core.migrateState({
    errors: [{ id: 'e1', code: 'TA-DATA', text: 'series', resolved: false }],
  });
  const now = new Date().toISOString();
  assert.equal(core.dueErrors(state, now).length, 1);
  core.reviewError(state, 'e1', now);
  assert.equal(state.errors[0].nextReviewAt, localPlus(now, 1));
  assert.equal(core.dueErrors(state, now).length, 0);
  core.resolveError(state, 'e1', true);
  core.resolveError(state, 'e1', false, now);
  assert.equal(state.errors[0].resolved, false);
  assert.equal(core.dueErrors(state, now).length, 1);
});

test('B1: TA due errors prefer a different Task 1 format; CC prefers Task 2', () => {
  const questions = [
    { id: 't1-line', type: '1', format: '折线图' },
    { id: 't1-bar', type: '1', format: '柱状图' },
    { id: 't2-a', type: '2', format: '议论文' },
  ];
  const state = core.migrateState({
    questions,
    sessions: [{ id: 's1', questionId: 't1-line', type: '1', skill: 'writing', essay }],
    errors: [{
      id: 'e1', code: 'TA-DATA', text: 'wrong line', resolved: false,
      sourceSessionId: 's1', nextReviewAt: '2020-01-01T00:00:00.000Z',
    }],
  });
  const picked = core.selectWritingQuestion(state, '2', questions, '2026-09-19T00:00:00.000Z');
  assert.equal(picked.id, 't1-bar');
  state.errors[0].code = 'CC-ORG';
  const task2 = core.selectWritingQuestion(state, '1', questions, '2026-09-19T00:00:00.000Z');
  assert.equal(task2.type, '2');
});

test('B1: speaking selection skips incomplete topics and maps FC to Part 1', () => {
  const topics = [
    { id: 'p1-ok', part: '1', title: 'Hometown', incomplete: false },
    { id: 'p1-bad', part: '1', title: 'Broken', incomplete: true },
    { id: 'p2-ok', part: '2', title: 'Save time', incomplete: false },
  ];
  const state = core.migrateState({
    speakingTopics: topics,
    sessions: [{ id: 'sp1', skill: 'speaking', part: '2', questionId: 'p2-ok', essay: 'talk' }],
    errors: [{
      id: 'e-fc', code: 'FC-HES', text: 'pause', resolved: false,
      sourceSessionId: 'sp1', nextReviewAt: '2020-01-01T00:00:00.000Z',
    }],
  });
  const picked = core.selectSpeakingTopic(state, '2', topics, '2026-09-19T00:00:00.000Z');
  assert.equal(picked.id, 'p1-ok');
});

test('B1: rewrite hint uses the first sentence of nextExercise', () => {
  assert.equal(
    core.rewritePlanDescription({ nextExercise: 'Spend 5 minutes on a table. Then write the overview.' }, 'fallback'),
    'Spend 5 minutes on a table.',
  );
  assert.equal(core.examPressure({ settings: { examDate: '2026-09-25' } }, '2026-09-19T00:00:00'), true);
  assert.equal(core.examPressure({ settings: { examDate: '2026-10-20' } }, '2026-09-19T00:00:00'), false);
});

test('B2: lexicon key keeps same term in different skills, and sentence compare ignores punctuation', () => {
  assert.notEqual(core.lexiconKey('account for', 'writing', '占据'), core.lexiconKey('account for', 'speaking', '占据'));
  assert.equal(core.lexiconSentenceMatches('Overall, sales rose.', 'overall sales rose'), true);
  assert.equal(core.lexiconSentenceMatches('Overall, sales rose.', 'sales fell'), false);
});

test('B4: study streak counts consecutive scheduled days and resets after a miss', () => {
  const state = core.migrateState({
    settings: { days: [1, 2, 3, 4, 5] },
    sessions: [
      { id: 's1', date: '2026-09-14T10:00:00.000Z', questionId: '1', essay }, // Monday
      { id: 's2', date: '2026-09-15T10:00:00.000Z', questionId: '1', essay }, // Tuesday
    ],
  });
  // Thursday 17 Sep 2026: Wednesday 16 was a study day with no work → 0
  assert.equal(core.studyStreak(state, '2026-09-17T12:00:00.000Z'), 0);
  state.sessions.push({ id: 's3', date: '2026-09-16T10:00:00.000Z', questionId: '1', essay });
  assert.equal(core.studyStreak(state, '2026-09-17T12:00:00.000Z'), 3);
});

test('B4: numeric overalls skip invented pronunciation in criteria averages', () => {
  const state = core.migrateState({
    assessments: [
      structuredAssessment({
        id: 'a-old', date: '2026-01-01T00:00:00.000Z', overall: '5.5', skill: 'writing', rawText: 'old-5.5',
      }),
      structuredAssessment({
        id: 'a-new', date: '2026-06-01T00:00:00.000Z', overall: '6.0', skill: 'writing', rawText: 'new-6.0',
        criteria: [
          { name: 'Task Achievement', score: '6', evidence: 'ok' },
          { name: 'Coherence and Cohesion', score: '6', evidence: 'ok' },
        ],
      }),
      {
        id: 'a-speak', date: '2026-07-01T00:00:00.000Z', overall: '6.5', skill: 'speaking',
        inventedPronunciation: true,
        criteria: [
          { name: 'Fluency and Coherence', score: '6', evidence: 'ok' },
          { name: 'Pronunciation', score: '8', evidence: 'fake' },
        ],
        summary: 'est',
      },
    ],
  });
  const writing = core.numericOveralls(state, 'writing', 8);
  assert.deepEqual(writing.map(item => item.overall), ['5.5', '6.0']);
  const speaking = core.numericOveralls(state, 'speaking', 8);
  assert.equal(speaking[0].estimated, true);
  assert.equal(core.scoredCriteria(state.assessments[2]).length, 1);
});

test('weakest writing criterion is the lowest recent band, and pronunciation is ignored', () => {
  const state = core.migrateState({
    assessments: [
      {
        id: 'a1', date: '2026-09-01T00:00:00.000Z', skill: 'writing', rawText: 'band-set-a',
        criteria: [
          { name: 'Task Achievement', score: '6' },
          { name: 'Coherence and Cohesion', score: '5' },
          { name: 'Lexical Resource', score: '6.5' },
          { name: 'Grammatical Range and Accuracy', score: '6' },
        ],
      },
      {
        id: 'a2', date: '2026-09-10T00:00:00.000Z', skill: 'writing', rawText: 'band-set-b',
        criteria: [
          { name: 'Task Response', score: '7' },
          { name: 'Coherence and Cohesion', score: '5.5' },
          { name: 'Lexical Resource', score: '6' },
          { name: 'Grammatical Range and Accuracy', score: '6' },
          { name: 'Pronunciation', score: '9' },
        ],
      },
    ],
  });
  const weak = core.weakestCriterion(state, 'writing');
  assert.equal(weak.key, 'CC');
  assert.equal(weak.score, 5.25);
  assert.equal(core.criterionBands(state, 'writing').bands.TA, 6);
  assert.equal(core.criterionBands(state, 'writing').bands.Pronunciation, undefined);
  const practice = core.practiceFromWeakness(state, 'writing');
  assert.equal(practice.kind, '2');
  assert.equal(practice.deskMode, 'body');
  assert.equal(practice.driver, 'criterion:CC');
  assert.equal(core.weakestCriterion(core.migrateState({}), 'writing'), null);
});

test('speaking weakest criterion skips unscored pronunciation', () => {
  const state = core.migrateState({
    assessments: [{
      id: 's', date: '2026-09-02T00:00:00.000Z', skill: 'speaking',
      criteria: [
        { name: 'Fluency and Coherence', score: '5' },
        { name: 'Lexical Resource', score: '6' },
        { name: 'Grammatical Range and Accuracy', score: '6.5' },
        { name: 'Pronunciation', score: 'unscored (transcript only)' },
      ],
    }],
  });
  assert.equal(core.weakestCriterion(state, 'speaking').key, 'FC');
  assert.equal(core.practiceFromWeakness(state, 'speaking').kind, 'speaking-p1');
});

test('today session orders recall, practice, then the due correction', () => {
  const state = core.migrateState({
    lexicon: [{ id: 'l1', term: 'overall', skill: 'writing', meaning: '总体上', nextReviewAt: '2020-01-01T00:00:00.000Z' }],
    errors: [{ id: 'e1', code: 'GRA-PREP', text: 'Use account for once.', resolved: false, sourceSessionId: 's1', nextReviewAt: '2020-01-01T00:00:00.000Z' }],
    sessions: [{ id: 's1', skill: 'writing', questionId: '1', essay }],
    assessments: [{
      id: 'a1', date: '2026-09-01T00:00:00.000Z', skill: 'writing', sessionId: 's1',
      criteria: [
        { name: 'Task Achievement', score: '7' },
        { name: 'Coherence and Cohesion', score: '6' },
        { name: 'Lexical Resource', score: '6' },
        { name: 'Grammatical Range and Accuracy', score: '5' },
      ],
    }],
  });
  const session = core.todaySession(state, '2026-09-19T00:00:00.000Z', 'writing');
  assert.deepEqual(session.steps.map(step => step.id), ['recall', 'practice', 'correction']);
  assert.equal(session.steps[1].driver, 'criterion:GRA');
  assert.equal(session.steps[2].errorId, 'e1');
  assert.match(session.steps[2].detail, /GRA-PREP/);
});

test('easy skips one review rung and again resets the streak', () => {
  const state = core.migrateState({});
  core.addLexiconItem(state, { term: 'robust', meaning: '稳健' }, { id: () => 'l1', now: () => '2026-09-16T00:00:00.000Z' });
  const easy = core.reviewLexiconItem(state, 'l1', 'easy', '2026-09-16T00:00:00.000Z');
  assert.equal(easy.successStreak, 2);
  assert.equal(easy.nextReviewAt, localPlus('2026-09-16T00:00:00.000Z', 3));
  const again = core.reviewLexiconItem(state, 'l1', 'again', '2026-09-19T00:00:00.000Z');
  assert.equal(again.successStreak, 0);
  assert.equal(again.status, 'learning');
  assert.equal(again.nextReviewAt, localPlus('2026-09-19T00:00:00.000Z', 1));
});

test('syncPendingPlan rewrites only a pending same-skill plan and keeps driver on migrate', () => {
  const recommendation = {
    skill: 'writing', kind: '2', title: 'Task 2 · 主体段', description: '连贯衔接偏低。', deskMode: 'body', driver: 'criterion:CC',
  };
  const done = { id: 'done', status: 'completed', kind: '1', title: '旧计划', description: 'keep', deskMode: 'full', driver: null };
  assert.equal(core.syncPendingPlan(done, recommendation), false);
  assert.equal(done.title, '旧计划');
  const pending = { id: 'p', status: 'pending', kind: '1', title: '旧计划', description: 'old', deskMode: 'overview', driver: null, questionId: '99' };
  assert.equal(core.syncPendingPlan(pending, recommendation), true);
  assert.equal(pending.driver, 'criterion:CC');
  assert.equal(pending.kind, '2');
  assert.equal(pending.deskMode, 'body');
  assert.equal(pending.questionId, null);
  assert.equal(core.syncPendingPlan(pending, recommendation), false);
  const speaking = { id: 'sp', status: 'pending', kind: 'speaking-p2', title: 'Part 2', description: '', deskMode: 'full', driver: null };
  assert.equal(core.syncPendingPlan(speaking, recommendation), false);
  assert.equal(speaking.kind, 'speaking-p2');
  const running = { id: 'run', status: 'in_progress', kind: '1', title: '进行中', description: 'stay', deskMode: 'full', driver: null };
  assert.equal(core.syncPendingPlan(running, recommendation), false);
  assert.equal(running.title, '进行中');
  const migrated = core.migrateState({ plans: [{ id: 'keep', status: 'completed', driver: 'criterion:CC', title: '留着' }] });
  assert.equal(migrated.schemaVersion, 7);
  assert.equal(migrated.plans[0].driver, 'criterion:CC');
  assert.equal(migrated.plans[0].title, '留着');
});
