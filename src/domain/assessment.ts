// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { parseLexiconSuggestions } from './lexicon';
import { wordCount, hashText, dateKey, makeId, nowIso } from './utils';

export function headingSection(text, heading) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const wanted = String(heading).trim().toLowerCase();
  const start = lines.findIndex(line => line.replace(/^##\s*/, '').trim().toLowerCase() === wanted && /^##\s/.test(line));
  if (start < 0) return '';
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) { end = index; break; }
  }
  return lines.slice(start + 1, end).join('\n').trim();
}

export function metadata(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(text || '').match(new RegExp(`^${escaped}:\\s*(.+)$`, 'im'));
  return match ? match[1].trim() : '';
}

export function isBandScore(value) {
  const text = String(value || '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return false;
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0 || number > 9) return false;
  return Math.abs(number * 2 - Math.round(number * 2)) < 1e-9;
}

export function isUnscoredPronunciation(name, score) {
  return /pronunciation/i.test(String(name || '')) && /unscored|not scored|transcript only|no audio|not applicable|n\/a/i.test(String(score || ''));
}

export function parseCriteria(text) {
  return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('|')).map(line => line.split('|').slice(1, -1).map(cell => cell.trim())).filter(cells => {
    return cells.length >= 3 && !/^(项目|criterion)$/i.test(cells[0]) && (isBandScore(cells[1]) || isUnscoredPronunciation(cells[0], cells[1]));
  }).map(cells => ({
    name: cells[0],
    score: isBandScore(cells[1]) ? cells[1] : 'unscored (transcript only)',
    evidence: cells.slice(2).join(' | '),
  }));
}

export function parseEditRows(text) {
  const rows = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('|'));
  return rows.map(line => line.split('|').slice(1, -1).map(cell => cell.trim())).filter(cells => {
    return cells.length >= 4 && cells[0] && !/^[-:]+$/.test(cells[0]) && !/^(原文问题|original issue)$/i.test(cells[0]);
  }).map(cells => ({ original: cells[0], revised: cells[1], reason: cells[2], tag: cells[3] }));
}

export function scoredCriteria(assessment) {
  const criteria = Array.isArray(assessment && assessment.criteria) ? assessment.criteria : [];
  return criteria.filter(item => {
    if (!isBandScore(item.score)) return false;
    if (/pronunciation/i.test(item.name) && assessment && assessment.inventedPronunciation) return false;
    return true;
  });
}

export function reconstructAssessmentMarkdown(assessment) {
  const item = assessment || {};
  const rows = (Array.isArray(item.criteria) ? item.criteria : []).map(row => `| ${row.name || ''} | ${row.score || ''} | ${row.evidence || ''} |`).join('\n');
  const blocks = [
    item.sessionId ? `session_id: ${item.sessionId}` : '',
    item.questionId ? `question_id: ${item.questionId}` : '',
    item.skill ? `skill: ${item.skill}` : '',
    item.part ? `part: ${item.part}` : '',
    item.task ? `task: ${item.task}` : '',
    item.overall ? `overall: ${item.overall}` : '',
    '',
    '## Candidate response',
    '',
    item.candidateResponse || '',
    '',
    '## 四项评分',
    '',
    '| 项目 | 分数 | 依据 |',
    '|---|---:|---|',
    rows,
    '',
    '## 总体判断',
    '',
    item.summary || '',
  ];
  if (item.priorities) blocks.push('', '## 最高优先级修改', '', item.priorities);
  if (item.nextExercise) blocks.push('', '## 下一次 30 分钟练习', '', item.nextExercise);
  return blocks.filter((line, index) => line !== '' || blocks[index - 1] !== '').join('\n').trim() + '\n';
}

export function parseAssessmentFile(text, filename) {
  const rawText = String(text || '');
  const candidateResponse = headingSection(rawText, 'Candidate response');
  const nextExercise = headingSection(rawText, '下一次 30 分钟练习') || metadata(rawText, 'next step');
  const rewrittenResponse = headingSection(rawText, '完整改写稿') || headingSection(rawText, '完整修改稿');
  const task = metadata(rawText, 'task');
  const skill = metadata(rawText, 'skill').toLowerCase() === 'speaking' ? 'speaking' : 'writing';
  const part = metadata(rawText, 'part');
  const rewriteMinimum = skill === 'speaking' ? 0 : (task === 'Task 2' ? 250 : 150);
  const lexiconSuggestions = parseLexiconSuggestions(headingSection(rawText, '语言积累建议'));
  const criteria = parseCriteria(headingSection(rawText, '四项评分') || rawText);
  const inventedPronunciation = criteria.some(item => /pronunciation/i.test(item.name) && isBandScore(item.score));
  return {
    filename: filename || 'score.md',
    rawText,
    contentHash: hashText(rawText),
    sessionId: metadata(rawText, 'session_id'),
    questionId: metadata(rawText, 'question_id'),
    skill,
    part,
    task,
    reviewContractVersion: metadata(rawText, 'review_contract_version'),
    inventedPronunciation,
    overall: metadata(rawText, 'overall') || metadata(rawText, 'estimated_task_band'),
    candidateResponse,
    criteria,
    summary: headingSection(rawText, '总体判断'),
    priorities: headingSection(rawText, '最高优先级修改'),
    editNotes: headingSection(rawText, '原文问题与修改说明') || headingSection(rawText, '修改说明'),
    rewrittenResponse,
    rewriteWordCount: wordCount(rewrittenResponse),
    rewriteTooShort: Boolean(rewrittenResponse) && wordCount(rewrittenResponse) < rewriteMinimum,
    editRows: parseEditRows(headingSection(rawText, '原文问题与修改说明') || headingSection(rawText, '修改说明')),
    lexiconSuggestions,
    // Keep the old field for imported assessments written against the
    // previous contract. New requests must use 完整改写稿 instead.
    rewriteExample: headingSection(rawText, '改写示例'),
    nextExercise,
  };
}

export function buildAssessmentRequest(session, question) {
  const task = String(question && question.type) === '1' ? 'Task 1' : 'Task 2';
  const image = String(question && question.image || '');
  const imageFilename = image.split('/').pop() || '';
  const visual = image ? `visual_file: ${image}\nvisual_attachment_required: true\nvisual_filename: ${imageFilename}\n` : '';
  return `# IELTS Writing assessment request\n\nreview_contract_version: 2\nsession_id: ${session.id}\nquestion_id: ${question.id}\ntask: ${task}\nword_count: ${session.words}\n${visual}\n## Task prompt\n\n${question.prompt}\n\n## Candidate response\n\n${session.essay}\n\n## Review instructions\n\nFollow these steps in order:\n1. Preserve session_id, question_id, task, and the Candidate response exactly.\n2. Assess Task Achievement/Task Response, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy using the official IELTS Writing Band Descriptors.\n3. Quote or identify evidence from the Candidate response for important deductions.\n4. For Task 1, verify every trend, comparison, year, unit, and number against the attached visual. Never invent a number that is not shown.\n5. For Task 2, check that the response answers every part of the question, states a clear position, develops the main ideas, and includes a conclusion.\n6. Produce a complete rewritten answer based on the Candidate response. Do not return only an Overview, one paragraph, an outline, a list of replacement sentences, or an unrelated model answer.\n7. The rewrite must be ready to submit in an IELTS exam: at least 150 words for Task 1 and at least 250 words for Task 2.\n8. If the visual is unavailable, say so explicitly and do not guess Task 1 data.\n\nReturn only Markdown with the exact structure below.\n\nsession_id: <same session_id>\nquestion_id: <same question_id>\ntask: <same task>\noverall: <band>\n\n## Candidate response\n\n<full response verbatim>\n\n## 四项评分\n\n| 项目 | 分数 | 依据 |\n|---|---:|---|\n| Task Achievement / Task Response | | |\n| Coherence and Cohesion | | |\n| Lexical Resource | | |\n| Grammatical Range and Accuracy | | |\n\n## 总体判断\n\nExplain the main score-limiting issues and cite evidence from the Candidate response.\n\n## 最高优先级修改\n\nList the 3–8 highest-priority changes.\n\n## 原文问题与修改说明\n\n| 原文问题 | 修改后 | 原因 | 错误标签 |\n|---|---|---|---|\n| | | | TA-DATA / TA-OVERVIEW / CC-ORG / LR-COL / GRA-PREP |\n\n## 完整改写稿\n\nWrite the complete revised answer from beginning to end, based on the Candidate response. It must not be only a partial example.\n\n## 下一次 30 分钟练习\n\nOfficial criteria: https://ielts.org/cdn/ielts-guides/ielts-writing-key-assessment-criteria.pdf\n`;
}

export function buildAssessmentRequestWithLexicon(session, question) {
  const base = buildAssessmentRequest(session, question);
  const lexiconSection = `## 语言积累建议

Select 3–8 reusable words, phrases, or sentence patterns from the corrections and complete rewrite. Do not invent expressions unrelated to this response.

| 类型 | 表达 | 释义/用法 | 例句 | 标签 |
|---|---|---|---|---|
| 词汇 / 词组 / 句式 | | | | |

## 下一次 30 分钟练习`;
  return base.replace('## 下一次 30 分钟练习', lexiconSection);
}

export function resolveAssessmentEssay(state, parsed, deps) {
  const services = Object.assign({ id: () => makeId('session'), now: nowIso }, deps || {});
  if (parsed.sessionId) {
    const exact = state.sessions.find(item => item.id === parsed.sessionId);
    if (exact) return { session: exact, created: false, reason: 'session_id' };
  }
  const candidate = String(parsed.candidateResponse || '').trim();
  if (parsed.questionId && candidate) {
    const wanted = hashText(candidate);
    const match = state.sessions.slice().reverse().find(item => (
      String(item.questionId) === String(parsed.questionId)
      && !item.assessmentId
      && hashText(String(item.essay || '').trim()) === wanted
    ));
    if (match) return { session: match, created: false, reason: 'content_hash' };
  }
  if (candidate) {
    const writingQuestion = (state.questions || []).find(item => String(item.id) === String(parsed.questionId)) || {};
    const speakingTopic = (state.speakingTopics || []).find(item => String(item.id) === String(parsed.questionId)) || {};
    const question = parsed.skill === 'speaking' ? speakingTopic : writingQuestion;
    const speakingPart = parsed.skill === 'speaking' && ['1', '2', '3'].includes(String(parsed.part || question.part || '')) ? String(parsed.part || question.part) : '';
    const session = {
      id: parsed.sessionId || services.id(),
      date: services.now(),
      planDate: dateKey(services.now()),
      questionId: String(parsed.questionId || question.id || ''),
      name: question.name || question.title || `Question ${parsed.questionId || ''}`.trim(),
      type: parsed.skill === 'speaking' ? (speakingPart || '2') : (question.type || (parsed.task === 'Task 2' ? '2' : '1')),
      skill: parsed.skill === 'speaking' ? 'speaking' : 'writing',
      part: speakingPart,
      notes: '',
      words: wordCount(parsed.candidateResponse),
      essay: parsed.candidateResponse,
      focus: '',
      next: parsed.nextExercise || '',
      attemptKind: 'original',
      parentSessionId: null,
      assessmentId: null,
    };
    state.sessions.push(session);
    return { session, created: true, reason: 'candidate_response' };
  }
  return { session: null, created: false, reason: 'missing_essay' };
}

export function syncAssessmentErrors(state, assessment, linkedSession) {
  const rows = Array.isArray(assessment && assessment.editRows) ? assessment.editRows : [];
  const sessionId = linkedSession && linkedSession.id || assessment && assessment.sessionId || null;
  rows.forEach((row, index) => {
    const tagMatch = String(row.tag || '').match(/[A-Z]+(?:-[A-Z]+)?/);
    const code = tagMatch ? tagMatch[0] : 'REVIEW';
    const text = `${row.original || 'original'} → ${row.revised || 'revision'}${row.reason ? `: ${row.reason}` : ''}`;
    const duplicate = state.errors.find(error => error.sourceAssessmentId === assessment.id && error.code === code && error.text === text);
    if (duplicate) return;
    state.errors.push({
      id: `${assessment.id}-error-${index}`,
      date: assessment.date || nowIso(),
      code,
      text,
      next: row.revised || '',
      sourceSessionId: sessionId,
      sourceAssessmentId: assessment.id,
      reviewCount: 0,
      lastReviewedAt: null,
      nextReviewAt: assessment.date || nowIso(),
      resolved: false,
    });
  });
  return state.errors;
}

export function importAssessmentText(state, text, filename, deps) {
  const services = Object.assign({ id: () => makeId('assessment'), now: nowIso }, deps || {});
  const parsed = parseAssessmentFile(text, filename);
  if (!parsed.overall && !parsed.criteria.length && !parsed.summary && !parsed.nextExercise) {
    return { assessment: null, session: null, duplicate: false, invalid: true, reason: 'This file has no overall score, criteria, or summary. It looks like a request, not a marked script.' };
  }
  const duplicate = state.assessments.find(item => item.contentHash === parsed.contentHash);
  if (duplicate) {
    // Older imports could be stored without the essay/session link. Treat a
    // repeated import as a repair opportunity instead of returning a dead
    // rating record that can never appear beside the corresponding essay.
    const linked = duplicate.sessionId ? state.sessions.find(item => item.id === duplicate.sessionId) : null;
    const resolution = linked ? { session: linked, created: false, reason: 'existing_link' } : resolveAssessmentEssay(state, parsed, services);
    if (resolution.session) {
      duplicate.sessionId = resolution.session.id;
      duplicate.missingEssay = false;
      resolution.session.assessmentId = duplicate.id;
    }
    Object.keys(parsed).forEach(key => {
      if (duplicate[key] === undefined || duplicate[key] === null || duplicate[key] === '' || (Array.isArray(duplicate[key]) && !duplicate[key].length)) duplicate[key] = parsed[key];
    });
    duplicate.rawText = duplicate.rawText || parsed.rawText;
    syncAssessmentErrors(state, duplicate, resolution.session);
    return { assessment: duplicate, session: resolution.session || null, duplicate: true, resolution: resolution.reason };
  }
  const resolution = resolveAssessmentEssay(state, parsed, services);
  const assessment = Object.assign({}, parsed, {
    id: services.id(),
    date: services.now(),
    sessionId: resolution.session ? resolution.session.id : null,
    missingEssay: !resolution.session,
  });
  state.assessments.push(assessment);
  if (resolution.session) resolution.session.assessmentId = assessment.id;
  syncAssessmentErrors(state, assessment, resolution.session);
  return { assessment, session: resolution.session, duplicate: false, resolution: resolution.reason };
}

export function assessmentSkill(state, assessment) {
  if (assessment && assessment.skill === 'speaking') return 'speaking';
  const session = assessment && assessment.sessionId ? (state.sessions || []).find(item => item.id === assessment.sessionId) : null;
  return session && session.skill === 'speaking' ? 'speaking' : 'writing';
}

export function overallIsEstimated(assessment) {
  if (!assessment) return false;
  if (assessment.inventedPronunciation) return true;
  return (assessment.criteria || []).some(item => /pronunciation/i.test(item.name) && /unscored/i.test(String(item.score || '')));
}

export function numericOveralls(state, skill, limit) {
  const wanted = skill === 'speaking' ? 'speaking' : 'writing';
  return (state.assessments || []).filter(item => assessmentSkill(state, item) === wanted && isBandScore(item.overall))
    .slice()
    .sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')))
    .slice(-(limit || 8))
    .map(item => ({ overall: item.overall, estimated: overallIsEstimated(item), date: item.date, id: item.id }));
}

export function latestCriteriaScores(state, skill) {
  const wanted = skill === 'speaking' ? 'speaking' : 'writing';
  const last = (state.assessments || []).filter(item => assessmentSkill(state, item) === wanted)
    .slice()
    .sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')))
    .slice(-1)[0];
  return last || null;
}

const CRITERION_LABELS = {
  TA: 'Task achievement',
  TR: 'Task response',
  CC: 'Coherence',
  LR: 'Vocabulary',
  GRA: 'Grammar',
  FC: 'Fluency',
};

export function criterionLabel(key) {
  return CRITERION_LABELS[key] || String(key || '');
}

export function criterionBucket(name) {
  const text = String(name || '');
  if (/pronunciation/i.test(text)) return null;
  if (/fluency/i.test(text) || /流利/.test(text)) return 'FC';
  if (/task achievement/i.test(text) || /任务完成/.test(text)) return 'TA';
  if (/task response/i.test(text) || /任务回应/.test(text)) return 'TR';
  if (/coheren/i.test(text) || /衔接/.test(text)) return 'CC';
  if (/lexical/i.test(text) || /词汇/.test(text)) return 'LR';
  if (/grammat/i.test(text) || /语法/.test(text)) return 'GRA';
  return null;
}

export function assessmentsForSkill(state, skill, limit) {
  const wanted = skill === 'speaking' ? 'speaking' : 'writing';
  return (state.assessments || []).filter(item => assessmentSkill(state, item) === wanted)
    .slice()
    .sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')))
    .slice(-(limit || 5));
}

export function criterionBands(state, skill, limit) {
  const wanted = skill === 'speaking' ? 'speaking' : 'writing';
  const order = wanted === 'speaking' ? ['FC', 'LR', 'GRA'] : ['TA', 'TR', 'CC', 'LR', 'GRA'];
  const buckets = {};
  order.forEach(key => { buckets[key] = []; });
  const recent = assessmentsForSkill(state, wanted, limit || 5);
  recent.forEach(assessment => {
    (assessment.criteria || []).forEach(criterion => {
      if (!isBandScore(criterion.score)) return;
      const key = criterionBucket(criterion.name);
      if (key && buckets[key]) buckets[key].push(Number(criterion.score));
    });
  });
  const bands = {};
  order.forEach(key => {
    const values = buckets[key];
    if (!values.length) return;
    bands[key] = Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
  });
  return { skill: wanted, count: recent.length, bands };
}

export function weakestCriterion(state, skill) {
  const report = criterionBands(state, skill, 5);
  const order = report.skill === 'speaking' ? ['FC', 'LR', 'GRA'] : ['TA', 'TR', 'CC', 'LR', 'GRA'];
  const entries = Object.keys(report.bands).map(key => [key, report.bands[key]]);
  if (!entries.length) return null;
  entries.sort((left, right) => left[1] - right[1] || order.indexOf(left[0]) - order.indexOf(right[0]));
  return { key: entries[0][0], score: entries[0][1], skill: report.skill, bands: report.bands };
}
