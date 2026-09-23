// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { normalizeDraft } from './state';
import { splitList } from './utils';

export function numberedList(items) {
  return splitList(items).map((item, index) => `${index + 1}. ${item}`).join('\n');
}

export function bulletList(items) {
  return splitList(items).map(item => `- ${item}`).join('\n');
}

export function speakingTopicPrompt(topic, part) {
  const card = topic && typeof topic === 'object' ? topic : {};
  const resolved = String(part || card.part || '');
  const blocks = [];
  if (card.title) blocks.push(String(card.title).trim());
  if (resolved === '1') {
    const questions = numberedList(card.questions);
    if (questions) blocks.push(questions);
  } else if (resolved === '3') {
    if (card.cueCard) blocks.push(String(card.cueCard).trim());
    const follow = numberedList(card.part3 || card.questions);
    if (follow) blocks.push(follow);
  } else {
    if (card.cueCard) blocks.push(String(card.cueCard).trim());
    const bullets = bulletList(card.bullets);
    if (bullets) blocks.push(bullets);
    const follow = numberedList(card.part3);
    if (follow) blocks.push(`Part 3\n\n${follow}`);
    if (!card.cueCard && !bullets) {
      const questions = numberedList(card.questions);
      if (questions) blocks.push(questions);
    }
  }
  return blocks.filter(Boolean).join('\n\n');
}

export function buildSpeakingAssessmentRequest(session, topic) {
  const source = session && typeof session === 'object' ? session : {};
  const card = topic && typeof topic === 'object' ? topic : {};
  const part = ['1', '2', '3'].includes(String(source.part ?? card.part ?? '')) ? String(source.part ?? card.part) : String(source.part || card.part || '');
  const questionId = source.questionId != null && String(source.questionId) !== '' ? source.questionId : (card.id || '');
  const prompt = speakingTopicPrompt(card, part);
  return `# IELTS Speaking assessment request\n\nreview_contract_version: speaking-1\nskill: speaking\npart: ${part}\nsession_id: ${source.id}\nquestion_id: ${questionId}\n\n## Topic prompt\n\n${prompt}\n\n## Notes\n\n${source.notes || ''}\n\n## Candidate response\n\n${source.essay || ''}\n\n## Review instructions\n\nFollow these steps in order:\n1. Preserve session_id, question_id, skill, part, and the Candidate response exactly.\n2. Score Fluency and Coherence, Lexical Resource, and Grammatical Range and Accuracy, and record Pronunciation, using the official IELTS Speaking Band Descriptors: https://ielts.org/cdn/ielts-guides/ielts-speaking-band-descriptors.pdf\n3. Pronunciation MUST be recorded as "unscored (transcript only)" because there is no audio. Do not invent a Pronunciation band.\n4. Estimate overall from Fluency and Coherence, Lexical Resource, and Grammatical Range and Accuracy only, and say explicitly that overall is estimated because Pronunciation is unscored (transcript only).\n5. Quote or identify evidence from the Candidate response for important deductions.\n6. Produce a complete spoken rewrite (完整改写稿) the candidate could say aloud. Do not return only an outline, a list of replacement sentences, or an unrelated model answer.\n7. Suggested error tags: FC-HES, FC-DEV, LR-COL, GRA-TENSE.\n\nReturn only Markdown with the exact structure below.\n\nsession_id: <same session_id>\nquestion_id: <same question_id>\nskill: speaking\npart: <same part>\noverall: <estimated band from the three scored criteria; Pronunciation is unscored (transcript only)>\n\n## Candidate response\n\n<full transcript verbatim>\n\n## 四项评分\n\n| 项目 | 分数 | 依据 |\n|---|---:|---|\n| Fluency and Coherence | | |\n| Lexical Resource | | |\n| Grammatical Range and Accuracy | | |\n| Pronunciation | unscored (transcript only) | No audio; transcript only. |\n\n## 总体判断\n\nExplain the main score-limiting issues, cite evidence from the Candidate response, and state that overall is estimated from the three scored criteria because Pronunciation is unscored (transcript only).\n\n## 最高优先级修改\n\nList the 3–8 highest-priority changes.\n\n## 原文问题与修改说明\n\n| 原文问题 | 修改后 | 原因 | 错误标签 |\n|---|---|---|---|\n| | | | FC-HES / FC-DEV / LR-COL / GRA-TENSE |\n\n## 完整改写稿\n\nWrite the complete spoken rewrite from beginning to end, based on the Candidate response. It must be something the candidate could say aloud, not only a partial example.\n\n## 语言积累建议\n\nSelect 3–8 reusable words, phrases, or sentence patterns from the corrections and spoken rewrite. Do not invent expressions unrelated to this response.\n\n| 类型 | 表达 | 释义/用法 | 例句 | 标签 |\n|---|---|---|---|---|\n| 词汇 / 词组 / 句式 | | | | |\n\n## 下一次 30 分钟练习\n\nGive one 30-minute speaking practice task for this part.\n\nOfficial criteria: https://ielts.org/cdn/ielts-guides/ielts-speaking-band-descriptors.pdf\n`;
}

export function draftIsPrepared(value) {
  const draft = normalizeDraft(value);
  return Boolean(String(draft.text || '').trim() || String(draft.transcript || '').trim() || String(draft.notes || '').trim());
}

export function speakingCoverage(state, topicId) {
  const id = String(topicId ?? '');
  const source = state && typeof state === 'object' ? state : {};
  const stories = Array.isArray(source.stories) ? source.stories : [];
  const sessions = Array.isArray(source.sessions) ? source.sessions : [];
  const draft = normalizeDraft(source.drafts && source.drafts[id]);
  const prepared = stories.some(story => splitList(story && story.topicIds).includes(id))
    || Boolean(draft.text.trim() || draft.transcript.trim() || draft.notes.trim());
  const speakingSessions = sessions.filter(session => session && session.skill === 'speaking' && String(session.questionId) === id);
  if (speakingSessions.some(session => session.assessmentId)) return 'assessed';
  if (speakingSessions.length) return 'practiced';
  if (prepared) return 'prepared';
  return 'unseen';
}

export function speakingCoverageCounts(state, topics) {
  const counts = { unseen: 0, prepared: 0, practiced: 0, assessed: 0 };
  (topics || []).forEach(topic => {
    const status = speakingCoverage(state, topic.id);
    if (counts[status] != null) counts[status] += 1;
  });
  return counts;
}
