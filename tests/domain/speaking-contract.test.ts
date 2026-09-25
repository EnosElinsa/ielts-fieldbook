import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as core from '../../src/domain';

const topic = {
  id: '2026q4-p2-save-time',
  part: 2,
  title: 'A way to save time',
  cueCard: 'Describe a way you saved time.',
  bullets: ['what it was', 'when', 'how it saved time', 'how you felt'],
  part3: ['Why do people want to save time?'],
};

test('builds a speaking assessment request with the speaking-1 contract', () => {
  const request = core.buildSpeakingAssessmentRequest(
    { id: 'sp-1', questionId: topic.id, part: '2', essay: 'I saved time by planning the week.', notes: 'method, last year', words: 7 },
    topic,
  );
  assert.match(request, /review_contract_version: speaking-1/);
  assert.match(request, /skill: speaking/);
  assert.match(request, /part: 2/);
  assert.match(request, /session_id: sp-1/);
  assert.match(request, /question_id: 2026q4-p2-save-time/);
  assert.match(request, /audio_present: false/);
  assert.match(request, /unscored \(transcript only\)/);
  const withAudio = core.buildSpeakingAssessmentRequest(
    { id: 'sp-audio', questionId: topic.id, part: '2', essay: 'Said aloud.', audioId: 'audio-1' },
    topic,
  );
  assert.match(withAudio, /audio_present: true/);
  assert.match(withAudio, /unscored \(transcript only\)/);
  assert.match(request, /Describe a way you saved time\./);
  assert.match(request, /- what it was/);
  assert.match(request, /Why do people want to save time\?/);
  assert.match(request, /## Notes\n\nmethod, last year/);
  assert.match(request, /## Candidate response\n\nI saved time by planning the week\./);
  assert.match(request, /Fluency and Coherence/);
  assert.match(request, /Lexical Resource/);
  assert.match(request, /Grammatical Range and Accuracy/);
  assert.match(request, /Pronunciation/);
  assert.match(request, /https:\/\/ielts\.org\/cdn\/ielts-guides\/ielts-speaking-band-descriptors\.pdf/);
  assert.match(request, /estimated/);
  assert.match(request, /## 四项评分/);
  assert.match(request, /## 总体判断/);
  assert.match(request, /## 最高优先级修改/);
  assert.match(request, /## 原文问题与修改说明/);
  assert.match(request, /## 完整改写稿/);
  assert.match(request, /## 语言积累建议/);
  assert.match(request, /## 下一次 30 分钟练习/);
  assert.match(request, /FC-HES/);
  assert.match(request, /FC-DEV/);
  assert.match(request, /LR-COL/);
  assert.match(request, /GRA-TENSE/);

  const part1 = core.buildSpeakingAssessmentRequest(
    { id: 'sp-p1', part: '1', essay: 'Not very often.' },
    { id: '2026q4-p1-feeling-bored', part: 1, title: 'Feeling bored', questions: ['Do you often feel bored?', 'What do you do when you feel bored?'] },
  );
  assert.match(part1, /1\. Do you often feel bored\?/);
  assert.match(part1, /2\. What do you do when you feel bored\?/);
  assert.doesNotMatch(part1, /cue card/i);
});

test('parses a speaking result when Pronunciation is unscored', () => {
  const text = `review_contract_version: speaking-1
skill: speaking
part: 2
session_id: sp-1
question_id: 2026q4-p2-save-time
overall: 6

## Candidate response

I saved time by planning my week.

## 四项评分

| 项目 | 分数 | 依据 |
|---|---:|---|
| Fluency and Coherence | 6 | Some hesitation. |
| Lexical Resource | 6 | Adequate range. |
| Grammatical Range and Accuracy | 5.5 | Some errors. |
| Pronunciation | unscored (transcript only) | No audio. |

## 总体判断

Overall is estimated from the three scored criteria.

## 最高优先级修改

Develop the example.

## 原文问题与修改说明

| 原文问题 | 修改后 | 原因 | 错误标签 |
|---|---|---|---|
| I saved time | I managed to save time | development | FC-DEV |

## 完整改写稿

I managed to save time by planning the week in advance.

## 语言积累建议

| 类型 | 表达 | 释义/用法 | 例句 | 标签 |
|---|---|---|---|---|
| 词组 | in advance | 提前 | I planned in advance. | speaking |

## 下一次 30 分钟练习

Retell the cue card in two minutes.`;

  const parsed = core.parseAssessmentFile(text, 'speaking.md');
  assert.equal(parsed.skill, 'speaking');
  assert.equal(parsed.part, '2');
  assert.equal(parsed.sessionId, 'sp-1');
  assert.equal(parsed.overall, '6');
  const scored = parsed.criteria.filter(item => /^[0-9](?:\.5)?$/.test(item.score));
  assert.equal(scored.length, 3);
  assert.deepEqual(scored.map(item => item.name), [
    'Fluency and Coherence',
    'Lexical Resource',
    'Grammatical Range and Accuracy',
  ]);
  const pronunciation = parsed.criteria.find(item => /pronunciation/i.test(item.name));
  assert.ok(pronunciation);
  assert.match(pronunciation.score, /unscored \(transcript only\)/i);

  const similar = text.replace('| Pronunciation | unscored (transcript only) | No audio. |', '| Pronunciation | Not scored (no audio) | Transcript only. |');
  const similarParsed = core.parseAssessmentFile(similar, 'speaking.md');
  assert.equal(similarParsed.overall, '6');
  assert.equal(similarParsed.criteria.filter(item => /^[0-9](?:\.5)?$/.test(item.score)).length, 3);
  assert.match(similarParsed.criteria.find(item => /pronunciation/i.test(item.name)).score, /unscored/i);

  const state = core.migrateState({});
  const imported = core.importAssessmentText(state, text, 'speaking.md', { id: () => 'a-sp', now: () => '2026-09-18T00:00:00.000Z' });
  assert.notEqual(imported.invalid, true);
  assert.equal(imported.assessment.overall, '6');
  assert.equal(imported.assessment.criteria.filter(item => /^[0-9](?:\.5)?$/.test(item.score)).length, 3);
});
