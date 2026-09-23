import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as core from '../../src/domain';

const essay = 'A complete candidate response kept for history.';
const assessmentText = `session_id: old-session
question_id: 1342
task: Task 1
overall: 5.5

## Candidate response

${essay}

## 四项评分

| 项目 | 分数 | 依据 |
|---|---:|---|
| Task Achievement | 5 | Data are inaccurate. |
| Coherence and Cohesion | 6 | Organisation is visible. |
| Lexical Resource | 6 | Vocabulary is adequate. |
| Grammatical Range and Accuracy | 5 | Errors are frequent. |

## 总体判断

The response needs more accurate data.

## 最高优先级修改

Check every series before writing.

## 改写示例

Overall, two sectors increased.

## 下一次 30 分钟练习

Write a data table first.`;

test('migrates legacy data without losing essays or arrays', () => {
  const migrated = core.migrateState({
    sessions: [{ id: 's1', questionId: 1342, essay }],
    assessments: [{ id: 'a1', text: 'legacy' }],
    settings: { dailyMinutes: 45 },
  });
  assert.equal(migrated.schemaVersion, 7);
  assert.equal(migrated.sessions[0].essay, essay);
  assert.equal(migrated.sessions[0].questionId, '1342');
  assert.equal(migrated.assessments.length, 1);
  assert.equal(migrated.settings.dailyMinutes, 45);
  assert.ok(Array.isArray(migrated.plans));
  assert.ok(Array.isArray(migrated.lexicon));
});

test('migrates a v5 writing session to skill writing without losing the essay', () => {
  const migrated = core.migrateState({
    schemaVersion: 5,
    sessions: [{ id: 's-v5', questionId: '1342', essay, words: 7 }],
    assessments: [{ id: 'a1', text: 'legacy' }],
    settings: { dailyMinutes: 40, focus: 'task2' },
    drafts: { '1342': 'draft text' },
  });
  assert.equal(migrated.schemaVersion, 7);
  assert.equal(migrated.sessions[0].skill, 'writing');
  assert.equal(migrated.sessions[0].essay, essay);
  assert.equal(migrated.sessions[0].questionId, '1342');
  assert.equal(migrated.assessments.length, 1);
  assert.equal(migrated.settings.dailyMinutes, 40);
  assert.equal(migrated.settings.focus, 'task2');
  assert.equal(migrated.settings.activeSkill, 'writing');
  assert.equal(migrated.settings.skillMix, 'mixed');
  assert.equal(migrated.settings.speakingFocus, 'balanced');
  assert.equal(core.draftText(migrated.drafts['1342'], 'writing'), 'draft text');
  assert.deepEqual(migrated.stories, []);
  assert.deepEqual(migrated.speakingTopics, []);
});

test('creates and deduplicates language accumulation items', () => {
  const state = core.migrateState({});
  const first = core.addLexiconItem(state, {
    category: 'phrase', term: 'account for', meaning: '占据；解释', example: 'Online sales account for half of revenue.',
    tags: 'Task 1; trend', source: 'C21T1',
  }, { id: () => 'l1', now: () => '2026-09-16T00:00:00.000Z' });
  const duplicate = core.addLexiconItem(state, { category: 'phrase', term: ' Account For ', meaning: '占据；解释' });
  const otherSkill = core.addLexiconItem(state, { category: 'phrase', term: 'account for', meaning: '占据；解释', skill: 'speaking' }, { id: () => 'l2' });
  assert.equal(first.duplicate, false);
  assert.equal(first.item.id, 'l1');
  assert.deepEqual(first.item.tags, ['Task 1', 'trend']);
  assert.equal(duplicate.duplicate, true);
  assert.equal(otherSkill.duplicate, false);
  assert.equal(state.lexicon.length, 2);
});

test('reviews accumulation items with spaced next-review dates', () => {
  const state = core.migrateState({});
  const added = core.addLexiconItem(state, { category: 'sentence', term: 'Overall, ...', meaning: '概述句式' }, { id: () => 'l1', now: () => '2026-09-16T00:00:00.000Z' });
  const first = core.reviewLexiconItem(state, added.item.id, true, '2026-09-16T00:00:00.000Z');
  const plus = (iso, days) => {
    const date = new Date(iso);
    date.setDate(date.getDate() + days);
    return date.toISOString();
  };
  const firstReviewCount = first.reviewCount;
  const firstStatus = first.status;
  const second = core.reviewLexiconItem(state, added.item.id, true, '2026-09-17T00:00:00.000Z');
  assert.equal(firstReviewCount, 1);
  assert.equal(firstStatus, 'learning');
  assert.equal(second.reviewCount, 2);
  assert.equal(second.nextReviewAt, plus('2026-09-17T00:00:00.000Z', 3));
  const forgotAt = plus('2026-09-17T00:00:00.000Z', 3);
  const forgot = core.reviewLexiconItem(state, added.item.id, false, forgotAt);
  assert.equal(forgot.status, 'learning');
  assert.equal(forgot.successStreak, 0);
  assert.equal(forgot.nextReviewAt, plus(forgotAt, 1));
  const relearned = core.reviewLexiconItem(state, added.item.id, true, plus(forgotAt, 1));
  assert.equal(relearned.successStreak, 1);
  assert.equal(relearned.nextReviewAt, plus(plus(forgotAt, 1), 1));
});

test('updates and removes accumulation items safely', () => {
  const state = core.migrateState({});
  const added = core.addLexiconItem(state, { category: 'word', term: 'robust', meaning: '稳健的' }, { id: () => 'l1' });
  const updated = core.updateLexiconItem(state, 'l1', { example: 'A robust method.', tags: ['methods'] }, { now: () => '2026-09-16T00:00:00.000Z' });
  assert.equal(updated.example, 'A robust method.');
  assert.deepEqual(updated.tags, ['methods']);
  assert.equal(core.removeLexiconItem(state, 'l1'), true);
  assert.equal(core.removeLexiconItem(state, 'missing'), false);
  assert.equal(state.lexicon.length, 0);
});

test('rejects editing an accumulation item into an existing term', () => {
  const state = core.migrateState({});
  core.addLexiconItem(state, { term: 'account for' }, { id: () => 'l1' });
  core.addLexiconItem(state, { term: 'by contrast' }, { id: () => 'l2' });
  const result = core.updateLexiconItem(state, 'l2', { term: 'account for' });
  assert.equal(result, null);
  assert.equal(state.lexicon[1].term, 'by contrast');
});

test('parses the standardized assessment contract', () => {
  const parsed = core.parseAssessmentFile(assessmentText, 'assessment.md');
  assert.equal(parsed.sessionId, 'old-session');
  assert.equal(parsed.questionId, '1342');
  assert.equal(parsed.overall, '5.5');
  assert.equal(parsed.candidateResponse, essay);
  assert.equal(parsed.criteria.length, 4);
  assert.match(parsed.summary, /accurate data/);
  assert.match(parsed.nextExercise, /data table/);
});

test('parses a full rewritten response and edit notes', () => {
  const fullRewrite = 'The graph compares employment in four sectors between 1960 and 2020.\n\nOverall, manufacturing peaked before declining, while retail and healthcare rose. Agriculture decreased overall.\n\nManufacturing rose from 15 million to 20 million in 1980 before falling to 13 million. Agriculture followed the opposite pattern.\n\nRetail increased steadily, and healthcare recorded the fastest growth.';
  const rewrittenText = assessmentText.replace('## 改写示例\n\nOverall, two sectors increased.', `## 原文问题与修改说明\n\n| 原文问题 | 修改后 | 原因 | 错误标签 |\n|---|---|---|---|\n| wrong trend | correct trend | data accuracy | TA-DATA |\n\n## 完整改写稿\n\n${fullRewrite}`);
  const parsed = core.parseAssessmentFile(rewrittenText, 'assessment.md');
  assert.equal(parsed.rewrittenResponse, fullRewrite);
  assert.match(parsed.editNotes, /wrong trend/);
  assert.deepEqual(parsed.editRows, [{ original: 'wrong trend', revised: 'correct trend', reason: 'data accuracy', tag: 'TA-DATA' }]);
  assert.equal(parsed.rewriteTooShort, true);
});

test('parses language accumulation suggestions from an assessment', () => {
  const text = assessmentText.replace('## 下一次 30 分钟练习', `## 语言积累建议

| 类型 | 表达 | 释义/用法 | 例句 | 标签 |
|---|---|---|---|---|
| 词组 | account for | 占据；解释 | Online sales account for half of revenue. | Task 1; trend |

## 下一次 30 分钟练习`);
  const parsed = core.parseAssessmentFile(text, 'assessment.md');
  assert.deepEqual(parsed.lexiconSuggestions, [{ category: 'phrase', term: 'account for', meaning: '占据；解释', example: 'Online sales account for half of revenue.', tags: ['Task 1', 'trend'] }]);
});

test('builds a versioned assessment request with the complete rewrite contract', () => {
  const request = core.buildAssessmentRequest(
    { id: 'session-1', essay: 'Candidate essay.', words: 2 },
    { id: '1342', type: '1', prompt: 'Describe the chart.', image: 'question-assets/1342.png' },
  );
  assert.match(request, /review_contract_version: 2/);
  assert.match(request, /visual_attachment_required: true/);
  assert.match(request, /visual_filename: 1342\.png/);
  assert.match(request, /## Candidate response\n\nCandidate essay\./);
  assert.match(request, /## 原文问题与修改说明/);
  assert.match(request, /## 完整改写稿/);
  assert.match(request, /## 语言积累建议\n\nSelect 3–8 reusable/);
  assert.doesNotMatch(request, /语言积累建议\\n/);
  assert.match(request, /at least 150 words for Task 1/);
  assert.match(request, /Do not return only an Overview/);
});

test('resolves exact session before other attempts', () => {
  const state = core.migrateState({
    questions: [{ id: '1342', type: '1', name: 'C21T1' }],
    sessions: [
      { id: 'old-session', questionId: '1342', essay: 'exact' },
      { id: 'newer', questionId: '1342', essay: 'newer', date: '2026-09-16' },
    ],
  });
  const result = core.resolveAssessmentEssay(state, core.parseAssessmentFile(assessmentText, 'a.md'));
  assert.equal(result.session.id, 'old-session');
  assert.equal(result.reason, 'session_id');
});

test('creates a new attempt from Candidate response instead of silently attaching by question id', () => {
  const state = core.migrateState({
    questions: [{ id: '1342', type: '1', name: 'C21T1' }],
    sessions: [{ id: 'different', questionId: '1342', essay: 'saved essay', date: '2026-09-16' }],
  });
  const result = core.resolveAssessmentEssay(state, core.parseAssessmentFile(assessmentText, 'a.md'), {
    id: () => 'generated', now: () => '2026-09-16T00:00:00.000Z',
  });
  assert.equal(result.created, true);
  assert.equal(result.reason, 'candidate_response');
  assert.equal(result.session.id, 'old-session');
  assert.equal(state.sessions.length, 2);
});

test('reconstructs history when assessment contains the only essay copy', () => {
  const state = core.migrateState({ questions: [{ id: '1342', type: '1', name: 'C21T1' }] });
  const result = core.resolveAssessmentEssay(state, core.parseAssessmentFile(assessmentText, 'a.md'), {
    id: () => 'generated', now: () => '2026-09-16T00:00:00.000Z',
  });
  assert.equal(result.created, true);
  assert.equal(result.session.essay, essay);
  assert.equal(state.sessions.length, 1);
});

test('imports an assessment once and links both directions', () => {
  const state = core.migrateState({
    questions: [{ id: '1342', type: '1', name: 'C21T1' }],
    sessions: [{ id: 'old-session', questionId: '1342', essay }],
  });
  const first = core.importAssessmentText(state, assessmentText, 'assessment.md', { id: () => 'a1' });
  const second = core.importAssessmentText(state, assessmentText, 'assessment.md', { id: () => 'a2' });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(state.assessments.length, 1);
  assert.equal(state.sessions[0].assessmentId, 'a1');
  assert.equal(state.assessments[0].sessionId, 'old-session');
});

test('imports tagged edit rows into the error archive without duplication', () => {
  const taggedAssessment = assessmentText.replace('## 改写示例', `## 原文问题与修改说明

| 原文问题 | 修改后 | 原因 | 错误标签 |
|---|---|---|---|
| deceased | decreased | wrong word choice | LR-COL |

## 改写示例`);
  const state = core.migrateState({ sessions: [{ id: 'old-session', questionId: '1342', essay }] });
  core.importAssessmentText(state, taggedAssessment, 'assessment.md', { id: () => 'a1', now: () => '2026-09-16T00:00:00.000Z' });
  core.importAssessmentText(state, taggedAssessment, 'assessment.md', { id: () => 'a2', now: () => '2026-09-16T00:00:00.000Z' });
  assert.equal(state.errors.length, 1);
  assert.equal(state.errors[0].code, 'LR-COL');
  assert.match(state.errors[0].text, /deceased → decreased/);
  assert.equal(state.errors[0].sourceAssessmentId, 'a1');
  assert.equal(state.errors[0].sourceSessionId, 'old-session');
});

test('repairs the link when the same assessment is imported again', () => {
  const state = core.migrateState({
    questions: [{ id: '1342', type: '1', name: 'C21T1' }],
    sessions: [{ id: 'saved-session', questionId: '1342', essay }],
    assessments: [{
      id: 'old-assessment',
      filename: 'assessment.md',
      text: assessmentText,
      rawText: assessmentText,
      contentHash: core.hashText(assessmentText),
      sessionId: null,
      missingEssay: true,
    }],
  });
  const result = core.importAssessmentText(state, assessmentText, 'assessment.md', { id: () => 'new-assessment' });
  assert.equal(result.duplicate, true);
  assert.equal(result.assessment.id, 'old-assessment');
  assert.equal(result.session.id, 'saved-session');
  assert.equal(state.assessments[0].sessionId, 'saved-session');
  assert.equal(state.assessments[0].missingEssay, false);
  assert.equal(state.sessions[0].assessmentId, 'old-assessment');
});

test('rejects a review-request markdown file without assessment output', () => {
  const state = core.migrateState({});
  const result = core.importAssessmentText(state, 'session_id: s1\nquestion_id: 1342\n\n## Candidate response\n\nDraft only.', 'request.md');
  assert.equal(result.invalid, true);
  assert.equal(state.assessments.length, 0);
});

test('validates and merges a backup without deleting current records', () => {
  assert.equal(core.validateBackup({ sessions: [] }).valid, true);
  assert.equal(core.validateBackup({ hello: 'world' }).valid, false);
  const current = core.migrateState({ sessions: [{ id: 's1', questionId: '1', essay: 'one' }] });
  const incoming = core.migrateState({ sessions: [{ id: 's2', questionId: '2', essay: 'two' }] });
  const merged = core.mergeBackup(current, incoming, { includeSettings: false });
  assert.deepEqual(merged.sessions.map(x => x.id).sort(), ['s1', 's2']);
});

test('backup merge keeps the current version when record ids conflict', () => {
  const current = core.migrateState({ sessions: [{ id: 's1', questionId: '1', essay: 'current version' }] });
  const incoming = core.migrateState({ sessions: [{ id: 's1', questionId: '1', essay: 'older backup version' }] });
  const merged = core.mergeBackup(current, incoming, { includeSettings: false });
  assert.equal(merged.sessions.length, 1);
  assert.equal(merged.sessions[0].essay, 'current version');
});

test('deduplicates assessments by content when backup ids differ', () => {
  const current = core.migrateState({ assessments: [{ id: 'a-current', rawText: assessmentText, sessionId: 's1' }] });
  const incoming = core.migrateState({ assessments: [{ id: 'a-backup', rawText: assessmentText }] });
  const merged = core.mergeBackup(current, incoming, { includeSettings: false });
  assert.equal(merged.assessments.length, 1);
  assert.equal(merged.assessments[0].id, 'a-current');
  assert.equal(merged.assessments[0].sessionId, 's1');
});

test('merges a legacy rating store alongside current writing history', () => {
  const current = core.migrateState({ sessions: [{ id: 's1', questionId: '1342', essay }] });
  const legacy = core.migrateState({ assessments: [{ id: 'a1', text: assessmentText }] });
  const merged = core.mergeBackup(current, legacy, { includeSettings: false });
  assert.equal(merged.sessions.length, 1);
  assert.equal(merged.assessments.length, 1);
  assert.equal(merged.assessments[0].rawText, assessmentText);
});

test('includes language accumulation in backup validation and merge', () => {
  const current = core.migrateState({ lexicon: [{ id: 'l1', term: 'account for' }] });
  const incoming = core.migrateState({ lexicon: [{ id: 'l2', term: 'by contrast' }] });
  assert.equal(core.validateBackup({ lexicon: [] }).valid, true);
  assert.equal(core.validateBackup({ lexicon: [] }).counts.lexicon, 0);
  const merged = core.mergeBackup(current, incoming, { includeSettings: false });
  assert.deepEqual(merged.lexicon.map(item => item.id).sort(), ['l1', 'l2']);
});

test('deduplicates legacy language entries while preserving richer fields', () => {
  const migrated = core.migrateState({ lexicon: [
    { id: 'old', term: 'by contrast', meaning: '', tags: ['Task 1'] },
    { id: 'new', term: ' By Contrast ', meaning: '相比之下', example: 'By contrast, retail rose.', tags: ['comparison'], reviewCount: 2, status: 'learning' },
  ] });
  assert.equal(migrated.lexicon.length, 1);
  assert.equal(migrated.lexicon[0].meaning, '相比之下');
  assert.equal(migrated.lexicon[0].example, 'By contrast, retail rose.');
  assert.deepEqual(migrated.lexicon[0].tags.slice().sort(), ['Task 1', 'comparison']);
});

test('keeps original and rewrite attempts as separate versions', () => {
  const state = core.migrateState({});
  const original = core.createAttempt(state, { questionId: '1342', name: 'C21T1', type: '1', essay: 'one' }, { id: () => 's1' });
  const rewrite = core.createAttempt(state, { questionId: '1342', name: 'C21T1', type: '1', essay: 'two', parentSessionId: original.id }, { id: () => 's2' });
  assert.equal(state.sessions.length, 2);
  assert.equal(original.attemptKind, 'original');
  assert.equal(rewrite.attemptKind, 'rewrite');
  assert.equal(rewrite.parentSessionId, 's1');
});

test('tracks plan completion explicitly', () => {
  const state = core.migrateState({ plans: [{ id: 'p1', kind: 'review', status: 'pending' }] });
  core.startPlan(state, 'p1', '2026-09-16T00:00:00Z');
  assert.equal(state.plans[0].status, 'in_progress');
  core.completePlan(state, 'p1', { completedAt: '2026-09-16T01:00:00Z' });
  assert.equal(state.plans[0].status, 'completed');
});

test('does not alter an unknown plan', () => {
  const state = core.migrateState({ plans: [{ id: 'p1', status: 'completed' }] });
  assert.equal(core.startPlan(state, 'missing'), null);
  assert.equal(state.plans[0].status, 'completed');
});

test('tracks error review and resolution', () => {
  const state = core.migrateState({ errors: [{ id: 'e1', code: 'TA-DATA', text: 'wrong series' }] });
  core.reviewError(state, 'e1', '2026-09-16');
  assert.equal(state.errors[0].reviewCount, 1);
  core.resolveError(state, 'e1', true);
  assert.equal(state.errors[0].resolved, true);
});

test('migrates lexicon skill and stores it on new items', () => {
  const migrated = core.migrateState({
    lexicon: [
      { id: 'l1', term: 'anyway', skill: 'speaking' },
      { id: 'l2', term: 'overall' },
    ],
  });
  assert.equal(migrated.lexicon.find(item => item.id === 'l1').skill, 'speaking');
  assert.equal(migrated.lexicon.find(item => item.id === 'l2').skill, 'writing');
  const added = core.addLexiconItem(migrated, { term: 'in advance', skill: 'speaking' }, { id: () => 'l3' });
  assert.equal(added.item.skill, 'speaking');
  const updated = core.updateLexiconItem(migrated, 'l2', { skill: 'speaking' });
  assert.equal(updated.skill, 'speaking');
});

test('names a reconstructed speaking session from speakingTopics', () => {
  const text = `skill: speaking
part: 2
question_id: 2026q4-p2-save-time
overall: 6

## Candidate response

I saved time by planning the week.

## 四项评分

| 项目 | 分数 | 依据 |
|---|---:|---|
| Fluency and Coherence | 6 | Some hesitation. |
| Lexical Resource | 6 | Adequate range. |
| Grammatical Range and Accuracy | 6 | Controlled. |
| Pronunciation | unscored (transcript only) | No audio. |

## 总体判断

Overall is estimated because Pronunciation is unscored.

## 下一次 30 分钟练习

Retell the cue card.`;
  const state = core.migrateState({
    speakingTopics: [{ id: '2026q4-p2-save-time', part: 2, title: 'A way to save time' }],
  });
  const result = core.importAssessmentText(state, text, 'speaking.md', { id: () => 'a-sp', now: () => '2026-09-18T00:00:00.000Z' });
  assert.notEqual(result.invalid, true);
  assert.equal(result.session.skill, 'speaking');
  assert.equal(result.session.name, 'A way to save time');
  assert.equal(result.session.part, '2');
  assert.equal(result.session.essay, 'I saved time by planning the week.');
});
