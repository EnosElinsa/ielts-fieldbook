// @ts-nocheck
import { latestPracticeRecommendation, rewritePlanDescription, syncPendingPlan, dateKey, dueErrors, dueVocabulary, examPressure, assignStoryPlanTarget } from '../domain';
import { sessionSkill, speakingKinds } from './format';
import { receptivePlanTemplates, ensureReceptivePlans } from './receptivePlans';
import { isProtectedPlan, practiceFromWeakness } from '../domain/plans';
import { getVocabularyReviewQueue } from '../domain/vocabulary';
import { buildLearningBatch } from '../domain/vocabulary/learningBatch';
import { getVocabularyPlanningCandidates } from '../domain/vocabulary/planning';
import { VOCABULARY_CATALOG } from '../domain/vocabulary/catalog';
import { getLearnedVocabularyIds, vocabularyGroupProgress } from '../domain/vocabulary/progress';
import { dayBudget, normalizePlanning } from '../domain/planningPreferences';
import { TASK_PRACTICES } from './planningTaskOptions';

export const planTemplates = {
  balanced: [
    { kind: '1', title: 'Task 1 · Read the chart', description: 'Check the figures, then write only the introduction and overview.', deskMode: 'overview' },
    { kind: '2', title: 'Task 2 · Plan', description: 'Question, position, and two main points.', deskMode: 'outline' },
    { kind: '1', title: 'Task 1 · Compare', description: 'Write one body paragraph with at least two real comparisons.', deskMode: 'compare' },
    { kind: 'review', title: 'Review · Mistakes', description: 'Go back over mistakes you have not fixed.', deskMode: 'full' },
    { kind: '2', title: 'Task 2 · Body', description: 'Write one full body paragraph and add an example.', deskMode: 'body' },
    { kind: '1', title: 'Timed writing', description: 'Write to the clock, then check your own work.', deskMode: 'timed' },
  ],
  task1: [
    { kind: '1', title: 'Task 1 · Read the chart', description: 'Check the figures and write the overview.', deskMode: 'overview' },
    { kind: '1', title: 'Task 1 · Compare', description: 'Group the trends and write a body paragraph.', deskMode: 'compare' },
    { kind: 'review', title: 'Review · Mistakes', description: 'Go back over mistakes you have not fixed.', deskMode: 'full' },
    { kind: '1', title: 'Task 1 · Timed', description: '20 minutes for a full Task 1.', deskMode: 'timed' },
    { kind: '2', title: 'Task 2 · Plan', description: 'Read the question and write two points.', deskMode: 'outline' },
    { kind: 'review', title: 'Weekly review', description: 'Look through this week’s essays and feedback.', deskMode: 'full' },
  ],
  task2: [
    { kind: '2', title: 'Task 2 · Plan', description: 'Break down the question and decide your position.', deskMode: 'outline' },
    { kind: '2', title: 'Task 2 · Body', description: 'Write one full body paragraph.', deskMode: 'body' },
    { kind: 'review', title: 'Review · Mistakes', description: 'Go back over mistakes you have not fixed.', deskMode: 'full' },
    { kind: '1', title: 'Task 1 · Overview', description: 'Write only the introduction and overview.', deskMode: 'overview' },
    { kind: '2', title: 'Task 2 · Timed', description: '40 minutes for a full Task 2.', deskMode: 'timed' },
    { kind: 'review', title: 'Weekly review', description: 'Look through this week’s essays and feedback.', deskMode: 'full' },
  ],
};

export const speakingPlanTemplates = {
  balanced: [
    { kind: 'speaking-p1', title: 'Part 1 · Short answers', description: 'About 20–30 seconds each.', deskMode: 'full' },
    { kind: 'speaking-p2', title: 'Part 2 · Long turn', description: 'One minute of notes, then two minutes of speaking.', deskMode: 'full' },
    { kind: 'stories', title: 'A story', description: 'Write down something that actually happened to you.', deskMode: 'full' },
    { kind: 'speaking-p3', title: 'Part 3 · Follow-up', description: 'About a minute each.', deskMode: 'full' },
    { kind: 'review', title: 'Review · Last attempt', description: 'Look at attempts that have not been marked.', deskMode: 'full' },
    { kind: 'speaking-p2', title: 'Part 2 · Again', description: 'This time, no notes.', deskMode: 'speak-blind' },
  ],
  part1: [
    { kind: 'speaking-p1', title: 'Part 1 · Short answers', description: 'Answer a run of short questions.', deskMode: 'full' },
    { kind: 'speaking-p1', title: 'Part 1 · Timed', description: '20–30 seconds each.', deskMode: 'timed' },
    { kind: 'review', title: 'Review · Last attempt', description: 'Look at attempts that have not been marked.', deskMode: 'full' },
    { kind: 'speaking-p2', title: 'Part 2 · Long turn', description: 'One minute of notes, then two minutes of speaking.', deskMode: 'full' },
    { kind: 'stories', title: 'A story', description: 'Add another story you can reuse.', deskMode: 'full' },
    { kind: 'speaking-p3', title: 'Part 3 · Follow-up', description: 'Take the same topic a step further.', deskMode: 'full' },
  ],
  part2: [
    { kind: 'speaking-p2', title: 'Part 2 · Long turn', description: 'One minute of notes, then two minutes of speaking.', deskMode: 'full' },
    { kind: 'stories', title: 'A story', description: 'Write down something that actually happened to you.', deskMode: 'full' },
    { kind: 'speaking-p2', title: 'Part 2 · Again', description: 'A different long-turn topic.', deskMode: 'full' },
    { kind: 'speaking-p3', title: 'Part 3 · Follow-up', description: 'Take the same topic a step further.', deskMode: 'full' },
    { kind: 'review', title: 'Review · Last attempt', description: 'Look at attempts that have not been marked.', deskMode: 'full' },
    { kind: 'speaking-p1', title: 'Part 1 · Warm-up', description: 'A short run of questions to find the pace.', deskMode: 'full' },
  ],
};

export const mixedPlanTemplates = [
  { kind: '1', title: 'Task 1 · Read the chart', description: 'Check the figures, then write only the introduction and overview.', deskMode: 'overview' },
  { kind: 'speaking-p1', title: 'Part 1 · Short answers', description: 'About 20–30 seconds each.', deskMode: 'full' },
  { kind: 'reading-practice', title: 'Reading · Find the evidence', description: 'Locate the answer, identify the paraphrase, and prove your choice.', deskMode: 'full' },
  { kind: 'listening-practice', title: 'Listening · Predict and follow', description: 'Predict the answer form, follow the recording, then check your mistakes.', deskMode: 'full' },
  { kind: '2', title: 'Task 2 · Plan', description: 'Question, position, and two main points.', deskMode: 'outline' },
  { kind: 'speaking-p2', title: 'Part 2 · Long turn', description: 'One minute of notes, then two minutes of speaking.', deskMode: 'full' },
  { kind: 'review', title: 'Review · Mistakes', description: 'Due vocabulary, or attempts still waiting for a score.', deskMode: 'full' },
  { kind: 'stories', title: 'A story', description: 'Write down something that actually happened to you.', deskMode: 'full' },
];

const planCopyFixes = {
  'Part 1 · 快问': ['Part 1 · Short answers', 'About 20–30 seconds each.'],
  'Part 1 · 限时': ['Part 1 · Timed', '20–30 seconds each.'],
  'Part 1 · 热身': ['Part 1 · Warm-up', 'A short run of questions to find the pace.'],
  'Part 2 · cue card': ['Part 2 · Long turn', 'One minute of notes, then two minutes of speaking.'],
  'Part 2 · 限时': ['Part 2 · Again', 'This time, no notes.'],
  'Part 2 · 长题': ['Part 2 · Long turn', 'One minute of notes, then two minutes of speaking.'],
  'Part 2 · 再练': ['Part 2 · Again', 'This time, no notes.'],
  'Part 3 · 追问': ['Part 3 · Follow-up', 'About a minute each.'],
  '素材本 · 串题': ['A story', 'Write down something that actually happened to you.'],
  '写一段经历': ['A story', 'Write down something that actually happened to you.'],
  '复盘 · 转写回放': ['Review · Last attempt', 'Look at attempts that have not been marked.'],
  '看看上次说的': ['Review · Last attempt', 'Look at attempts that have not been marked.'],
  '语言积累 · 到期复习': ['Vocabulary due', 'Vocabulary to recall today.'],
  '词句到期了': ['Vocabulary due', 'Vocabulary to recall today.'],
  '重练 · 最近转写': ['Say it again', 'Use the last feedback and say it again.'],
  '再练一遍': ['Say it again', 'Use the last feedback and say it again.'],
  'Task 1 · 读图': ['Task 1 · Read the chart', 'Check the figures, then write only the introduction and overview.'],
  'Task 1 · 比较': ['Task 1 · Compare', 'Write one body paragraph with at least two real comparisons.'],
  'Task 1 · 限时': ['Task 1 · Timed', '20 minutes for a full Task 1.'],
  '限时写作': ['Timed writing', 'Write to the clock, then check your own work.'],
  'Task 2 · 提纲': ['Task 2 · Plan', 'Question, position, and two main points.'],
  'Task 2 · 审题': ['Task 2 · Plan', 'Break down the question and decide your position.'],
  'Task 2 · 主体段': ['Task 2 · Body', 'Write one full body paragraph and add an example.'],
  'Task 2 · 限时': ['Task 2 · Timed', '40 minutes for a full Task 2.'],
  '复盘 · 错误回放': ['Review · Mistakes', 'Go back over mistakes you have not fixed.'],
  '周复盘': ['Weekly review', 'Look through this week’s essays and feedback.'],
  '重写 · 最近作文': ['Rewrite · Last essay', 'Rewrite the last essay from the feedback.'],
  '复盘 · 评分归档': ['Review · Waiting scores', 'Attempts still waiting for a score.'],
  'Part 1 快问': ['Part 1 · Short answers', 'About 20–30 seconds each.'],
  'Part 1 计时': ['Part 1 · Timed', '20–30 seconds each.'],
  'Part 1 热身': ['Part 1 · Warm-up', 'A short run of questions to find the pace.'],
};

const planDescriptionFixes = {
  '按 20–30 秒回答一组 Part 1 小问。': 'About 20–30 seconds each.',
  '按 20–30 秒回答一组 Part 1 小问，并留下转写。': 'About 20–30 seconds each.',
  '一组小问题，每题大概二三十秒。': 'About 20–30 seconds each.',
  '一组小问题，每题大概二三十秒，说完把内容写下来。': 'About 20–30 seconds each.',
  '每题大约 20–30 秒。': 'About 20–30 seconds each.',
  '每题 20–30 秒。': '20–30 seconds each.',
  '用一组快问找回节奏。': 'A short run of questions to find the pace.',
  '连着答一组小问题。': 'Answer a run of short questions.',
  '1 分钟提纲 + 2 分钟口述一张 cue card。': 'One minute of notes, then two minutes of speaking.',
  '1 分钟提纲 + 2 分钟口述。': 'One minute of notes, then two minutes of speaking.',
  '先写一分钟提纲，再说满两分钟。': 'One minute of notes, then two minutes of speaking.',
  '1 分钟提纲，2 分钟说。': 'One minute of notes, then two minutes of speaking.',
  '整理一条个人故事并挂到多张 Part 2 卡片。': 'Write down something that actually happened to you.',
  '整理一条个人故事并挂到多张卡片。': 'Write down something that actually happened to you.',
  '记下一段自己的事，以后好几道题都能用。': 'Write down something that actually happened to you.',
  '写一段自己的经历。': 'Write down something that actually happened to you.',
  '补一条能挂到多张卡片的故事。': 'Add another story you can reuse.',
  '再补一段，好几道题都能用。': 'Add another story you can reuse.',
  '再补一段经历。': 'Add another story you can reuse.',
  '一条故事挂到两张以上 cue card。': 'Write down something that actually happened to you.',
  '一段经历尽量能说两道以上的题。': 'Write down something that actually happened to you.',
  '用一条故事撑起一张 cue card。': 'One minute of notes, then two minutes of speaking.',
  '用一段经历把这道长题说满。': 'One minute of notes, then two minutes of speaking.',
  '不看提纲再练一张 cue card。': 'This time, no notes.',
  '这次不看提纲，直接说。': 'This time, no notes.',
  '这次不看提纲。': 'This time, no notes.',
  '再练一张不同的 cue card。': 'A different long-turn topic.',
  '换一道不同的长题再说一遍。': 'A different long-turn topic.',
  '换一道不同的题。': 'A different long-turn topic.',
  '就刚才的话题再答几道深入的题，每题大约一分钟。': 'About a minute each.',
  '每题大约 1 分钟。': 'About a minute each.',
  '把刚才的话题往深了说。': 'Take the same topic a step further.',
  '复习尚未评分的转写或错误标签。': 'Look at attempts that have not been marked.',
  '复习尚未评分的转写。': 'Look at attempts that have not been marked.',
  '把还没批的口述稿过一遍。': 'Look at attempts that have not been marked.',
  '看还没批的练习。': 'Look at attempts that have not been marked.',
  '处理到期词汇或尚未评分的记录。': 'Due vocabulary, or attempts still waiting for a score.',
  '处理到期词汇或还没批的记录。': 'Due vocabulary, or attempts still waiting for a score.',
  '处理到期词汇，或还没批的记录。': 'Due vocabulary, or attempts still waiting for a score.',
  '按上次的反馈，把最近一次再说一遍。': 'Use the last feedback and say it again.',
  '按上次的反馈再说一遍。': 'Use the last feedback and say it again.',
  '今天有该看的说法。': 'Vocabulary to recall today.',
  '完成数据核对表，只写 Introduction + Overview。': 'Check the figures, then write only the introduction and overview.',
  '审题、立场、两个主体段论点。': 'Question, position, and two main points.',
  '写一个主体段，至少完成两次有效比较。': 'Write one body paragraph with at least two real comparisons.',
  '复习尚未解决的高频错误。': 'Go back over mistakes you have not fixed.',
  '写一个完整主体段并补充例子。': 'Write one full body paragraph and add an example.',
  '按题型完成一次限时写作并自查。': 'Write to the clock, then check your own work.',
  '完成数据核对表和 Overview。': 'Check the figures and write the overview.',
  '按趋势分组写主体段。': 'Group the trends and write a body paragraph.',
  '20 分钟完成一篇。': '20 minutes for a full Task 1.',
  '审题并写出两个论点。': 'Read the question and write two points.',
  '查看本周作文和反馈。': 'Look through this week’s essays and feedback.',
  '拆解题目并确定立场。': 'Break down the question and decide your position.',
  '写一个完整主体段。': 'Write one full body paragraph.',
  '只写 Introduction + Overview。': 'Write only the introduction and overview.',
  '40 分钟完成一篇。': '40 minutes for a full Task 2.',
  '根据反馈重写最近一篇作文。': 'Rewrite the last essay from the feedback.',
};

function skillFromKind(kind, mix) {
  if (String(kind).startsWith('reading')) return 'reading';
  if (String(kind).startsWith('listening')) return 'listening';
  if (kind === '1' || kind === '2' || kind === 'writing-mock') return 'writing';
  if (String(kind).startsWith('speaking') || kind === 'stories') return 'speaking';
  return mix === 'speaking' ? 'speaking' : 'writing';
}

function reviewMistakesTemplate(count) {
  return {
    kind: 'review',
    title: 'Review · Mistakes',
    description: count === 1 ? 'Review 1 mistake that is due.' : `Review ${count} mistakes that are due.`,
    deskMode: 'full',
  };
}

function reviewUnresolvedTemplate(count) {
  return {
    kind: 'review',
    title: 'Review · Mistakes',
    description: count === 1 ? 'Review 1 mistake you have not fixed.' : `Review ${count} mistakes you have not fixed.`,
    deskMode: 'full',
  };
}

function vocabularyDueTemplate(count) {
  return {
    kind: 'vocabulary',
    title: 'Vocabulary due',
    description: count === 1 ? '1 entry to review today.' : `${count} entries to review today.`,
    deskMode: 'full',
  };
}

function reviewWaitingTemplate(count) {
  return {
    kind: 'review',
    title: 'Review · Waiting scores',
    description: count === 1 ? '1 attempt still waiting for a score.' : `${count} attempts still waiting for a score.`,
    deskMode: 'full',
  };
}

function examReviewTemplate() {
  return {
    kind: 'review',
    title: 'Review · Mistakes',
    description: 'Go back over mistakes you have not fixed.',
    deskMode: 'full',
  };
}

export function promoteToTimed(template) {
  if (!template) return template;
  const kind = template.kind;
  if (kind === '1') {
    return {
      kind: '1',
      title: 'Task 1 · Timed',
      description: '20 minutes for a full Task 1.',
      deskMode: 'timed',
      driver: template.driver || null,
      questionId: template.questionId || null,
    };
  }
  if (kind === '2') {
    return {
      kind: '2',
      title: 'Task 2 · Timed',
      description: '40 minutes for a full Task 2.',
      deskMode: 'timed',
      driver: template.driver || null,
      questionId: template.questionId || null,
    };
  }
  if (String(kind).startsWith('speaking')) {
    return Object.assign({}, template, {
      deskMode: 'timed',
      title: /Timed|限时/i.test(template.title || '') ? template.title : String(template.title || 'Speaking').replace(/\s·\s.*$/, '') + ' · Timed',
      description: template.description || 'Use the exam timing.',
    });
  }
  return template;
}

/**
 * Choose today's plan template from rotation, daily minutes, and exam pressure.
 * Sequence 0 still prefers due errors, due vocabulary, and unscored attempts.
 */
export function pickTemplate({ settings, sequence, signals, templates }) {
  const opts = signals || {};
  const list = templates && templates.length ? templates : mixedPlanTemplates;
  const base = list[sequence % list.length];
  const examSoon = Boolean(opts.examSoon);
  const dueErr = Number(opts.dueErr) || 0;
  const dueLex = Number(opts.dueLex) || 0;
  const unassessed = Number(opts.unassessed) || 0;
  const longSession = Number(settings && settings.dailyMinutes) >= 60;

  if (sequence === 0) {
    if (opts.recommendation) return opts.recommendation;
    if (examSoon && (dueErr || dueLex)) {
      return dueErr ? reviewMistakesTemplate(dueErr) : vocabularyDueTemplate(dueLex);
    }
    if (dueErr) return reviewUnresolvedTemplate(dueErr);
    if (dueLex) return vocabularyDueTemplate(dueLex);
    if (unassessed) return reviewWaitingTemplate(unassessed);
  }

  if (opts.rewrite && (sequence === 2 || sequence === 3)) return opts.rewrite;

  let template = base;

  if (examSoon) {
    if (sequence % 2 === 1) return examReviewTemplate();
    const timed = promoteToTimed(base);
    if (timed && timed.deskMode === 'timed') template = timed;
    else {
      const skill = skillFromKind(base.kind, settings && settings.skillMix);
      template = promoteToTimed(
        skill === 'speaking'
          ? { kind: 'speaking-p2', title: 'Part 2 · Timed', description: 'Use the exam timing.' }
          : settings && settings.focus === 'task2'
            ? { kind: '2' }
            : { kind: '1' },
      );
    }
  }

  if (longSession) template = promoteToTimed(template);
  return template;
}

export function inferredDeskMode(plan) {
  if (plan && plan.deskMode) return plan.deskMode;
  const blob = `${(plan && plan.title) || ''}${(plan && plan.description) || ''}`;
  if (plan && plan.kind === 'speaking-p2' && /不看提纲|no notes/i.test(blob)) return 'speak-blind';
  if (/读图|Read the chart|Overview/i.test(blob)) return 'overview';
  if (/提纲|审题|\bPlan\b/i.test(blob)) return 'outline';
  if (/比较|Compare/i.test(blob)) return 'compare';
  if (/主体段|\bBody\b/i.test(blob)) return 'body';
  if (/限时|Timed/i.test(blob)) return 'timed';
  return 'full';
}

function refreshPlanCopy(plan) {
  if (!plan || plan.status !== 'pending') return false;
  let changed = false;
  const next = planCopyFixes[plan.title];
  if (next) {
    plan.title = next[0];
    if (next[1] && (!plan.description || planDescriptionFixes[plan.description] || /转写|cue card|素材|挂到|串题/.test(plan.description))) {
      if (!/复习 \d+ 条/.test(plan.description || '') && !/处理 \d+ 份/.test(plan.description || '') && !/今天有 \d+ 条/.test(plan.description || '')) {
        plan.description = next[1];
      }
    }
    changed = true;
  }
  const counted = String(plan.description || '').match(/^(?:复习 (\d+) 条到期的错误。|复习 (\d+) 条尚未解决的错误。|今天有 (\d+) 条该看的说法。|处理 (\d+) 份等待反馈的记录。)$/);
  if (counted) {
    const count = counted.slice(1).find(Boolean);
    plan.description = counted[1]
      ? `Review ${count} mistakes that are due.`
      : counted[2]
        ? `Review ${count} mistakes you have not fixed.`
        : counted[3]
          ? `${count} entries to review today.`
          : `${count} attempts still waiting for a score.`;
    changed = true;
  }
  const nextDescription = planDescriptionFixes[plan.description];
  if (nextDescription) {
    plan.description = nextDescription;
    changed = true;
  }
  return changed;
}

function templatesForSettings(settings) {
  const mix = settings.skillMix || 'mixed';
  if (mix === 'reading' || mix === 'listening') return receptivePlanTemplates[mix];
  if (mix === 'speaking') return speakingPlanTemplates[settings.speakingFocus] || speakingPlanTemplates.balanced;
  if (mix === 'writing') return planTemplates[settings.focus] || planTemplates.balanced;
  return mixedPlanTemplates;
}

function rewriteTemplate(state, latest) {
  if (!latest) return null;
  const linked = latest.assessmentId
    ? state.assessments.find((item) => item.id === latest.assessmentId)
    : state.assessments.filter((item) => item.sessionId === latest.id).slice(-1)[0];
  if (sessionSkill(latest) === 'speaking') {
    const part = ['1', '2', '3'].includes(String(latest.part)) ? latest.part : '2';
    return {
      kind: `speaking-p${part}`,
      title: 'Say it again',
      description: rewritePlanDescription(linked, 'Use the last feedback and say it again.'),
      deskMode: 'speak-blind',
      questionId: latest.questionId,
    };
  }
  if (['overview', 'outline', 'compare', 'body'].includes(latest.practiceMode)) {
    return { kind: latest.type, title: 'Use the correction', description: rewritePlanDescription(linked, 'Revise the last practice from the feedback.'), deskMode: latest.practiceMode, questionId: latest.questionId, targetErrorIds: latest.targetErrorIds || [] };
  }
  if (latest.practiceMode === 'unknown') return null;
  return {
    kind: latest.type,
    title: 'Rewrite · Last essay',
    description: rewritePlanDescription(linked, 'Rewrite the last essay from the feedback.'),
    deskMode: 'full',
    questionId: latest.questionId,
  };
}

export function planMatchesSkill(plan, activeSkill) {
  if (!plan) return false;
  if (String(plan.kind).startsWith('reading')) return activeSkill === 'reading';
  if (String(plan.kind).startsWith('listening')) return activeSkill === 'listening';
  if (activeSkill === 'reading' || activeSkill === 'listening') return false;
  if (plan.kind === 'review' || plan.kind === 'vocabulary') return true;
  if (plan.kind === 'writing-mock') return activeSkill === 'writing';
  if (plan.kind === 'speaking-mock') return activeSkill === 'speaking';
  if (activeSkill === 'speaking') return speakingKinds().includes(plan.kind);
  return !speakingKinds().includes(plan.kind);
}

export function ensurePlans(state, activeSkill, persistIfChanged) {
  return ensureUnifiedPlans(state, persistIfChanged).filter(plan => planMatchesSkill(plan, activeSkill));
}

export function studyBudget(settings, key: string | undefined = undefined) {
  return dayBudget(settings,key);
}

export function selectedStudySkills(settings) {
  if (Array.isArray(settings.skills) && settings.skills.length) return ['writing','speaking','reading','listening'].filter(skill => settings.skills.includes(skill));
  return ['writing','speaking','reading','listening'].includes(settings.skillMix) ? [settings.skillMix] : ['writing','speaking','reading','listening'];
}

export function planningSettingsKey(settings) {
  return JSON.stringify([3, settings.days, studyBudget(settings).daily, normalizePlanning(settings.planning,settings.dailyMinutes), selectedStudySkills(settings), settings.focus, settings.speakingFocus, settings.vocabulary?.learningBatchSize || 10, settings.vocabulary?.mode || 'dictation']);
}

export function calendarDays(now = new Date()) {
  const cursor = new Date(now); cursor.setHours(0,0,0,0);
  return Array.from({length:7}, (_,index) => { const day = new Date(cursor); day.setDate(day.getDate()+index); return dateKey(day); });
}

export function nextUnifiedPlan(plans, now = new Date()) {
  const sorted = plans.slice().sort(compareStudyPlans);
  return sorted.find(plan => plan.status === 'in_progress') || sorted.find(plan => plan.status === 'pending' && plan.dateKey === dateKey(now)) || null;
}

function deterministicQuestion(state, skill, kind, sequence) {
  const bank = skill === 'writing' ? state.questions : state.speakingTopics;
  const part=kind.slice(-1)==='3'?'2':kind.slice(-1);
  const pool = (bank || []).filter(row => skill === 'writing' ? String(row.type) === kind : String(row.part) === part && !row.incomplete).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  return pool.length ? String(pool[sequence % pool.length].id) : null;
}

export function skillTask(state, skill, minutes, sequence = 0, useEvidence = true) {
  let template;
  if (skill === 'writing') {
    const task2 = state.settings.focus === 'task2' || state.settings.focus !== 'task1' && sequence % 2 === 1;
    const full = minutes >= (task2 ? 40 : 20);
    template = {kind:task2?'2':'1',title:full?`Task ${task2?'2':'1'} - Timed writing`:task2?'Task 2 - Position and support':'Task 1 - Chart overview',description:full?'Complete the response and save your attempt.':task2?'Write your position and two supporting points.':'Write the introduction and overview.',deskMode:full?'timed':task2?'outline':'overview'};
  } else if (skill === 'speaking') {
    const part = state.settings.speakingFocus === 'part2' ? '2' : state.settings.speakingFocus === 'part1' ? '1' : String(sequence % 3 + 1);
    template = {kind:`speaking-p${part}`,title:`Speaking - Part ${part}`,description:'Record your response and save the attempt.',deskMode:'full'};
  } else template = {...receptivePlanTemplates[skill][0], deskMode:minutes>=20?'timed':'full'};
  const weak = useEvidence && ['writing','speaking'].includes(skill) ? practiceFromWeakness(state,skill) : null;
  if (weak) {
    const required = weak.deskMode === 'full' || weak.deskMode === 'timed' ? weak.kind === '2' ? 40 : weak.kind === '1' ? 20 : 5 : 1;
    if (minutes >= required) template = {...template,...weak};
  }
  const questionId = template.questionId || deterministicQuestion(state,skill,template.kind,sequence);
  const target = ['writing','speaking'].includes(skill)
    ? {type:'question',skill,questionId,mode:template.deskMode, ...(skill === 'speaking' ? {part:template.kind.slice(-1)} : {})}
    : {type:'section',skill,sectionId:null,mode:'practice'};
  return {...template,skill,estimatedMinutes:minutes,questionId,target,completion:{type:'attempt',description:skill==='reading'||skill==='listening'?'Submit the selected section.':'Save a response for this question and practice mode.'}};
}

function reviewTask(state, skills, now, minutes) {
  const due = dueErrors(state,now).filter(error=> { const session=(state.sessions||[]).find(row=>row.id===error.sourceSessionId); return skills.includes(session?.skill==='speaking'?'speaking':'writing'); });
  if (due.length) {
    const first = due[0]; const source=(state.sessions||[]).find(row=>row.id===first.sourceSessionId);
    return {skill:source?.skill==='speaking'?'speaking':'writing',kind:'review',title:'Review - Due mistakes',description:first.text,deskMode:'full',estimatedMinutes:minutes,target:{type:'error-review',errorIds:[first.id]},targetErrorIds:[first.id],completion:{type:'review',description:'Review the selected mistake and save the correction.'}};
  }
  const sentence=(state.intensiveSessions||[]).filter(row=>row.nextReviewAt&&Date.parse(row.nextReviewAt)<=new Date(now).getTime()).sort((a,b)=>String(a.nextReviewAt).localeCompare(String(b.nextReviewAt)))[0];
  if (skills.includes('listening') && sentence) return {skill:'listening',kind:'listening-intensive',title:'Listening - Due sentence',description:'Complete blind recall and dictation for this sentence.',deskMode:'full',estimatedMinutes:minutes,sectionId:sentence.sectionId,sentenceId:sentence.sentenceId,target:{type:'intensive',skill:'listening',sectionId:sentence.sectionId,sentenceId:sentence.sentenceId},completion:{type:'review',description:'Complete the selected sentence practice.'}};
  const attempt=(state.examAttempts||[]).filter(row=>skills.includes(row.skill)&&row.status==='completed'&&Object.values(row.results||{}).some(value=>!value)&&Object.entries(row.results||{}).some(([id,correct])=>!correct&&(!row.errorReasons?.[id]||row.skill==='reading'&&!row.evidence?.[id]))).sort((a,b)=>String(b.completedAt).localeCompare(String(a.completedAt)))[0];
  if (attempt) return {skill:attempt.skill,kind:`${attempt.skill}-review`,title:`${attempt.skill==='reading'?'Reading':'Listening'} - Review mistakes`,description:'Save the evidence and diagnosis for each missed answer.',deskMode:'full',estimatedMinutes:minutes,attemptId:attempt.id,target:{type:'exam-review',skill:attempt.skill,attemptId:attempt.id},completion:{type:'review',description:'Save proof and a diagnosis for every missed answer.'}};
  return null;
}

function evidenceTargetKey(task) {
  if (['error-review','intensive','exam-review'].includes(task.target?.type)) return JSON.stringify(task.target);
  return typeof task.driver==='string'&&task.driver.startsWith('criterion:') ? JSON.stringify([task.skill,task.driver,task.kind,task.deskMode]) : null;
}

function clearPlanBinding(plan) {
  for (const field of ['target','targetLabel','quantity','questionId','sectionId','sentenceId','attemptId','sourceAssessmentId','targetErrorIds','driver','stage','speakingGroups','completedPromptKeys','targetPrompt']) delete plan[field];
  plan.linkedSessionId = null;
  plan.completedAt = null;
}

function replaceAutomaticTarget(plan, task) {
  clearPlanBinding(plan);
  Object.assign(plan,task);
}

function refreshEvidenceTargets(state, keys, skills, now) {
  const candidates=state.plans.filter(plan=>keys.includes(plan.dateKey)&&plan.schemaVersion===2&&plan.origin==='automatic'&&!protectedSchedulePlan(plan)&&plan.skill!=='vocabulary'&&plan.kind!=='vocabulary').slice().sort((a,b)=>a.dateKey.localeCompare(b.dateKey)||a.id.localeCompare(b.id));
  const review=reviewTask(state,skills,now,1);
  const reviewKey=review&&evidenceTargetKey(review);
  const alreadyScheduled=reviewKey&&state.plans.some(plan=>plan.status!=='skipped'&&plan.status!=='completed'&&(keys.includes(plan.dateKey)||plan.status==='in_progress')&&evidenceTargetKey(plan)===reviewKey);
  const reviewSlot=review&&candidates.find(plan=>studyDaySkills(state.settings,plan.dateKey,skills).includes(review.skill));
  if (review&&!alreadyScheduled&&reviewSlot) {
    const plan=reviewSlot;
    replaceAutomaticTarget(plan,{...review,estimatedMinutes:plan.estimatedMinutes});plan.order=-1;
  }
  for (const plan of candidates) {
    if (['error-review','intensive','exam-review'].includes(plan.target?.type)) continue;
    const task=skillTask(state,plan.skill,plan.estimatedMinutes,Math.floor((plan.rotationIndex||0)/skills.length));
    // Ordinary targets may already have a concrete question/section bound by the context.
    if (evidenceTargetKey(task)!==evidenceTargetKey(plan)) replaceAutomaticTarget(plan,task);
  }
}

function vocabularyReviewTask(mode, count) {
  return {skill:'vocabulary',kind:'vocabulary',title:`Vocabulary - ${mode==='dictation'?'Dictation':'Meaning'} review`,description:`Recall up to ${count} ${count===1?'prompt':'prompts'} selected when you start.`,estimatedMinutes:count,quantity:count,deskMode:mode,target:{type:'vocabulary',mode:'due-review',assessmentMode:mode,binding:'dynamic',batchSize:count,cards:[]},completion:{type:'assessment',description:'Submit the review selected when you start.'}};
}

const isVocabularyPlan=plan=>plan.skill==='vocabulary'||plan.kind==='vocabulary';
const startedPlan=plan=>plan.status==='in_progress'||Boolean(plan.startedAt);
const frozenVocabularyPlan=plan=>plan.target?.type==='vocabulary'&&(plan.target.binding==='frozen'||plan.target.binding!=='dynamic'&&plan.target.cards?.length>0);
const protectedSchedulePlan=plan=>isProtectedPlan(plan)||Boolean(plan.originalDateKey)||frozenVocabularyPlan(plan);
const cardIdentity=(card,mode=card.mode)=>JSON.stringify([card.entryId,card.senseId,mode]);
const taskMinutes=plan=>Math.max(1,Number(plan.estimatedMinutes)||Number(plan.quantity)||1);

/** Automatic allocation never spends the reserved vocabulary share on old skill work. */
function remainingCapacity(state,key) {
  const budget=studyBudget(state.settings,key);
  const rows=state.plans.filter(plan=>plan.dateKey===key&&plan.status!=='skipped');
  const total=rows.reduce((sum,plan)=>sum+taskMinutes(plan),0);
  const vocabulary=rows.filter(isVocabularyPlan).reduce((sum,plan)=>sum+taskMinutes(plan),0);
  return {total:Math.max(0,budget.daily-total),vocabulary:Math.max(0,Math.min(budget.vocabulary-vocabulary,budget.daily-total)),skill:Math.max(0,Math.min(budget.skill-(total-vocabulary),budget.daily-total))};
}

function carryBacklog(state,keys,now,selectedIds,previousDates=new Map()) {
  const today=keys[0];
  const backlog=state.plans.filter(plan=>plan.dateKey<today&&['pending','in_progress'].includes(plan.status)&&(!selectedIds||selectedIds.has(plan.id)))
    .sort((a,b)=>Number(startedPlan(b))-Number(startedPlan(a))||String(a.originalDateKey||a.dateKey).localeCompare(String(b.originalDateKey||b.dateKey))||a.id.localeCompare(b.id));
  for(const plan of backlog) {
    if(plan.target?.mode==='due-review'&&!startedPlan(plan)&&!plan.restoredAt) {
      plan.previousStatus=plan.status;plan.status='skipped';plan.skipReason='merged-review';plan.skippedAt=new Date(now).toISOString();
      if(state.activePlanId===plan.id)state.activePlanId=null;
      continue;
    }
    const key=keys.find(key=>{const capacity=remainingCapacity(state,key);return taskMinutes(plan)<=capacity.total&&taskMinutes(plan)<=capacity[isVocabularyPlan(plan)?'vocabulary':'skill'];});
    if(key){plan.originalDateKey=plan.originalDateKey||plan.dateKey;plan.dateKey=key;if(previousDates.get(plan.id)!==key)plan.rescheduledAt=new Date(now).toISOString();}
  }
}

export function nextLearningTarget(state, reserved = new Set(), frozenCards = []) {
  const batchSize=state.settings.vocabulary?.learningBatchSize || 10;
  const assessmentMode=['audio','production'].includes(state.settings.vocabulary?.mode)?'definition':state.settings.vocabulary?.mode || 'dictation';
  for(const enrollment of state.wordbookEnrollments || []) {
    const groups=VOCABULARY_CATALOG.units.filter(unit=>unit.bookId===enrollment.bookId&&unit.kind!=='chapter').slice().sort((a,b)=>(a.order||0)-(b.order||0)||String(a.id).localeCompare(String(b.id)));
    for(const group of groups) {
      if(vocabularyGroupProgress(state,group)==='Studied')continue;
      const answered=new Set();
      for(const session of state.vocabularySessions || []) {
        const selection=session.selection;
        if(session.status!=='submitted'||['audio','production'].includes(session.mode)||selection?.kind!=='learning-batch'||selection.bookId!==group.bookId||selection.unitId!==group.id)continue;
        session.results.filter(result=>String(result.response||'').trim()&&selection.cards.some(ref=>ref.entryId===result.entryId&&ref.senseId===result.senseId)).forEach(result=>answered.add(result.entryId));
      }
      const ids=group.entryIds || VOCABULARY_CATALOG.memberships.filter(row=>row.bookId===group.bookId&&row.unitId===group.id).slice().sort((a,b)=>a.order-b.order).map(row=>row.entryId);
      for(let index=0;index<Math.ceil(ids.length/batchSize);index++) {
        if(ids.slice(index*batchSize,(index+1)*batchSize).every(id=>answered.has(id)))continue;
        const key=JSON.stringify([group.bookId,group.id,index,batchSize]);if(reserved.has(key))continue;
        if(frozenCards.some(ref=>ids.includes(ref.entryId))) {
          // Resolve the same contextual senses and mode fallback as the binder. If resources
          // are not loaded yet, defer the overlapping batch rather than inventing identities.
          try {
            const batch=buildLearningBatch(state,group.bookId,group.id,index,batchSize,assessmentMode);
            if(!batch.cards.length||batch.cards.some(card=>frozenCards.some(ref=>ref.entryId===card.entryId&&ref.senseId===card.senseId&&ref.mode===batch.mode)))continue;
          } catch {continue;}
        }
        reserved.add(key);
        return {type:'vocabulary',mode:'learning-batch',assessmentMode,bookId:group.bookId,unitId:group.id,batchIndex:index,batchSize,cards:[]};
      }
    }
    if(!groups.length){
      let index=0;while(reserved.has(JSON.stringify([enrollment.bookId,null,index,batchSize])))index++;
      reserved.add(JSON.stringify([enrollment.bookId,null,index,batchSize]));
      return {type:'vocabulary',mode:'learning-batch',assessmentMode,bookId:enrollment.bookId,batchIndex:index,batchSize,cards:[]};
    }
  }
  return null;
}

export function ensureUnifiedPlans(state, persistIfChanged, now = new Date(), recoveryIds?) {
  const before=JSON.stringify(state.plans);
  const previous=(state.plans||[]).slice();
  const keys=calendarDays(now),today=keys[0],generationKey=planningSettingsKey(state.settings);
  // Reclaim only untouched generated slots, before allocating carryover.
  state.plans=previous.filter(plan=>plan.dateKey<today||protectedSchedulePlan(plan)||!(plan.origin==='automatic'||plan.schemaVersion===2||/^plan-(?:(?:reading|listening)-)?\d{4}-\d{2}-\d{2}$/.test(plan.id||'')));
  const previousDates=new Map();
  if(!recoveryIds)for(const plan of state.plans)if(plan.originalDateKey<today&&plan.dateKey>=today&&plan.status==='pending'&&!isProtectedPlan(plan)&&!frozenVocabularyPlan(plan)) {
    previousDates.set(plan.id,plan.dateKey);plan.dateKey=plan.originalDateKey;
  }
  carryBacklog(state,keys,now,recoveryIds,previousDates);
  const skills=selectedStudySkills(state.settings);
  const reserved=new Set(state.plans.filter(plan=>plan.target?.mode==='learning-batch'&&plan.status!=='skipped').map(plan=>JSON.stringify([plan.target.bookId,plan.target.unitId||null,plan.target.batchIndex,plan.target.batchSize])));
  const frozenCards=state.plans.filter(plan=>['pending','in_progress'].includes(plan.status)&&frozenVocabularyPlan(plan)).flatMap(plan=>(plan.target.cards||[]).map(card=>({...card,mode:plan.target.assessmentMode})));
  const identities=new Set(frozenCards.map(card=>cardIdentity(card)));
  let candidates=getVocabularyPlanningCandidates(state,now,state.settings.vocabulary?.mode).filter(({card})=>!identities.has(cardIdentity(card)));
  const historical=previous.filter(plan=>(plan.originalDateKey||plan.dateKey)<today&&Number.isInteger(plan.rotationIndex)).sort((a,b)=>String(a.originalDateKey||a.dateKey).localeCompare(String(b.originalDateKey||b.dateKey))||a.rotationIndex-b.rotationIndex).pop();
  let sequence=historical ? historical.rotationIndex+1 : 0;
  const add=(key,task,id,order,rotationIndex?)=>{
    if(state.plans.some(plan=>plan.id===id&&plan.status==='skipped'))return;
    let unique=id,index=2;while(state.plans.some(plan=>plan.id===unique))unique=`${id}-${index++}`;
    const proposed={id:unique,dateKey:key,...task,order,...(rotationIndex===undefined?{}:{rotationIndex}),schemaVersion:2,generationKey,origin:'automatic',status:'pending',startedAt:null,completedAt:null,linkedSessionId:null};
    const old=previous.find(plan=>plan.id===unique&&!protectedSchedulePlan(plan));
    // Preserve resource bindings when an otherwise unchanged automatic task is regenerated.
    if(old&&old.generationKey===generationKey&&old.skill===proposed.skill&&old.kind===proposed.kind&&old.deskMode===proposed.deskMode&&old.estimatedMinutes===proposed.estimatedMinutes&&evidenceTargetKey(old)===evidenceTargetKey(proposed)&&!isVocabularyPlan(old)) {
      proposed.target=old.target;proposed.questionId=old.questionId;
      for(const field of ['targetLabel','quantity','sectionId','driver','title','description','completion'])if(old[field]!==undefined)proposed[field]=old[field];
    }
    if(old){for(const field of Object.keys(old))delete old[field];Object.assign(old,proposed);state.plans.push(old);}else state.plans.push(proposed);
  };
  for(const key of keys) {
    const budget=studyBudget(state.settings,key);if(!budget.daily)continue;
    const retainedRotation=previous.filter(plan=>plan.dateKey===key&&!plan.originalDateKey&&Number.isInteger(plan.rotationIndex)).sort((a,b)=>a.rotationIndex-b.rotationIndex)[0];
    if(retainedRotation)sequence=retainedRotation.rotationIndex;
    let remaining=remainingCapacity(state,key).vocabulary;
    const vocabularyTasks=[];
    while(remaining>0&&candidates.length) {
      const mode=candidates[0].card.mode,words=new Set(),chosen=[];
      for(const candidate of candidates)if(candidate.reason===candidates[0].reason&&candidate.card.mode===mode&&!words.has(candidate.card.entryId)&&chosen.length<Math.min(remaining,budget.planning.blockMinutes)){chosen.push(candidate);words.add(candidate.card.entryId);}
      if(!chosen.length)break;
      vocabularyTasks.push(vocabularyReviewTask(mode,chosen.length));remaining-=chosen.length;
      const consumed=new Set(chosen.map(({card})=>cardIdentity(card)));candidates=candidates.filter(({card})=>!consumed.has(cardIdentity(card)));
    }
    // Existing learning batches are indivisible; new batches must fit their actual prompt count.
    const batchSize=state.settings.vocabulary?.learningBatchSize||10;
    while(remaining>0&&!candidates.length) {
      const target=nextLearningTarget(state,new Set(reserved),frozenCards);if(!target)break;
      const group=VOCABULARY_CATALOG.units.find(unit=>unit.id===target.unitId&&unit.bookId===target.bookId);
      const groupSize=group?(group.entryIds||VOCABULARY_CATALOG.memberships.filter(row=>row.bookId===group.bookId&&row.unitId===group.id).map(row=>row.entryId)).length:null;
      const count=groupSize===null?batchSize:Math.min(batchSize,Math.max(0,groupSize-target.batchIndex*batchSize));
      if(!count||count>remaining)break;
      reserved.add(JSON.stringify([target.bookId,target.unitId||null,target.batchIndex,target.batchSize]));
      vocabularyTasks.push({skill:'vocabulary',kind:'vocabulary',title:`Vocabulary - Learn ${count} words`,description:'Learn the batch, then submit recall answers.',estimatedMinutes:count,quantity:count,deskMode:target.assessmentMode,target,completion:{type:'assessment',description:'Submit the exact learning batch assessment.'}});remaining-=count;
      if(!budget.planning.multipleTasks)break;
    }
    vocabularyTasks.forEach((task,index)=>add(key,task,`study-${key}-vocabulary${index?`-${index+1}`:''}`,index));
    // Unused vocabulary time remains available for new ordinary practice, but never for carryover.
    const available=remainingCapacity(state,key).total;
    const daySkills=studyDaySkills(state.settings,key,skills);
    if(available>0&&daySkills.length) {
      if(budget.planning.multipleTasks) {
        allocateStudyBlocks(skills,budget,available,sequence).forEach(({skill,minutes},index)=>{
          add(key,skillTask(state,skill,minutes,sequence+index),`study-${key}-slot-${index+1}`,index+vocabularyTasks.length,sequence+index);
        });
      } else if(!state.plans.some(plan=>plan.dateKey===key&&plan.status!=='skipped'&&!isVocabularyPlan(plan))) {
        const weighted=daySkills.flatMap(skill=>Array(Math.max(1,budget.planning.weights[skill])).fill(skill));
        const task=skillTask(state,weighted[sequence%weighted.length],available,Math.floor(sequence/skills.length));
        if(task.skill!=='reading'||available>=2)add(key,task,`study-${key}-skill`,vocabularyTasks.length,sequence);
      }
    }
    sequence++;
  }
  refreshEvidenceTargets(state,keys,skills,now);
  if(JSON.stringify(state.plans)!==before)persistIfChanged?.();
  return state.plans.filter(plan=>keys.includes(plan.dateKey)).slice().sort(compareStudyPlans);
}

/** A snapshot guard makes the reviewed transaction exact, including concurrent edits and midnight. */
function backlogSnapshot(state,now) {
  return JSON.stringify([dateKey(now),state.plans,state.activePlanId,planningSettingsKey(state.settings)]);
}
export function previewBacklogChange(state,action,now=new Date()) {
  if(!['replan','skip'].includes(action.type))throw new Error('Choose replan or skip.');
  const draft=structuredClone(state),today=dateKey(now),ids=new Set(action.ids||[]);
  const selected=draft.plans.filter(plan=>ids.has(plan.id)&&plan.dateKey<today&&['pending','in_progress'].includes(plan.status)&&(action.includeStarted||!startedPlan(plan)));
  if(!selected.length)throw new Error('Select at least one eligible waiting task.');
  if(action.type==='replan')ensureUnifiedPlans(draft,undefined,now,new Set(selected.map(plan=>plan.id)));
  else for(const plan of selected){plan.previousStatus=plan.status;plan.status='skipped';plan.skipReason='bulk-skip';plan.skippedAt=new Date(now).toISOString();plan.origin='manual';if(draft.activePlanId===plan.id)draft.activePlanId=null;}
  return {snapshot:backlogSnapshot(state,now),createdAt:new Date(now).toISOString(),action,plans:draft.plans,activePlanId:draft.activePlanId,changes:selected.map(plan=>({id:plan.id,title:plan.title,from:state.plans.find(row=>row.id===plan.id).dateKey,to:plan.dateKey,status:plan.status,waiting:plan.dateKey<today&&plan.status!=='skipped'}))};
}
export function applyBacklogPreview(state,preview,now=new Date()) {
  if(backlogSnapshot(state,now)!==preview.snapshot)throw new Error('Your schedule changed. Preview the backlog again before saving.');
  state.plans=structuredClone(preview.plans);state.activePlanId=preview.activePlanId;
}

function studyDaySkills(settings,key,skills) {
  const budget=studyBudget(settings,key);
  if(budget.focus!=='balanced'&&skills.includes(budget.focus))return [budget.focus];
  return skills.filter(skill=>budget.planning.weights[skill]>0);
}

function allocateStudyBlocks(skills, budget, minutes, sequence) {
  const {planning}=budget;
  let candidates=skills.filter(skill=>planning.weights[skill]>0);
  if (budget.focus!=='balanced' && skills.includes(budget.focus)) candidates=[budget.focus];
  candidates.sort((a,b)=>planning.weights[b]-planning.weights[a] || (skills.indexOf(a)-sequence%skills.length+skills.length)%skills.length-(skills.indexOf(b)-sequence%skills.length+skills.length)%skills.length);
  candidates=candidates.slice(0,Math.max(1,Math.floor(minutes/10)));
  if (!candidates.length) return [];
  const total=candidates.reduce((sum,skill)=>sum+Math.max(1,planning.weights[skill]),0);
  const shares=candidates.map(skill=>({skill,minutes:Math.floor(minutes*Math.max(1,planning.weights[skill])/total)}));
  let remainder=minutes-shares.reduce((sum,row)=>sum+row.minutes,0);
  for(let index=0;remainder>0;index=(index+1)%shares.length,remainder--)shares[index].minutes++;
  const blocks=[];
  for(const row of shares) {
    const size=planning.preferFullTasks&&row.skill==='writing' ? Math.max(planning.blockMinutes,40) : planning.blockMinutes;
    const count=Math.max(1,Math.ceil(row.minutes/size));
    for(let index=0;index<count;index++) {
      const duration=planning.preferFullTasks ? Math.min(size,row.minutes-index*size) : Math.floor(row.minutes/count)+(index<row.minutes%count?1:0);
      if(duration>=(row.skill==='reading'?2:1))blocks.push({skill:row.skill,minutes:duration});
    }
  }
  return blocks;
}

export function manualStudyTask(state, action) {
  const skill=action.skill;
  if(!TASK_PRACTICES[skill])throw new Error('Choose a skill.');
  const practice=action.practice || action.kind || (skill==='vocabulary'?'learning-batch':'recommended');
  const option=TASK_PRACTICES[skill].find(row=>row.value===practice);
  if(!option)throw new Error('Choose a supported practice type.');
  const minutes=Number(action.estimatedMinutes);
  if(!Number.isInteger(minutes)||minutes<1||minutes>180)throw new Error('Use a task duration from 1 to 180 minutes.');
  if(minutes<option.minimum)throw new Error(`This practice needs at least ${option.minimum} minutes.`);
  if(skill==='vocabulary') {
    if(practice==='due-review') {
      const mode=action.assessmentMode || state.settings.vocabulary?.mode || 'definition';
      if(['audio','production'].includes(mode))throw new Error('Choose an assessed recall mode.');
      const learned=getLearnedVocabularyIds(state);
      const cards=getVocabularyReviewQueue(state,{mode,dueOnly:true}).filter(card=>learned.has(card.entryId));
      if(!cards.length)throw new Error('No learned words are due for this recall mode.');
      return vocabularyReviewTask(cards,mode,minutes);
    }
    const target=action.bookId&&action.unitId ? {type:'vocabulary',mode:'learning-batch',assessmentMode:['audio','production'].includes(state.settings.vocabulary?.mode)?'definition':state.settings.vocabulary?.mode||'dictation',bookId:action.bookId,unitId:action.unitId,batchIndex:Number(action.batchIndex)||0,batchSize:state.settings.vocabulary?.learningBatchSize||10,cards:[]} : nextLearningTarget(state);
    if(action.batchIndex!==undefined&&(!Number.isInteger(action.batchIndex)||action.batchIndex<0))throw new Error('Choose a valid batch number.');
    if(!target)throw new Error('Enrol in a wordbook before adding a learning batch.');
    return {skill,kind:'vocabulary',title:`Vocabulary - Learn ${target.batchSize} words`,description:'Learn the selected batch, then submit recall answers.',estimatedMinutes:minutes,target,deskMode:target.assessmentMode,completion:{type:'assessment',description:'Submit the exact learning batch assessment.'}};
  }
  if(practice==='writing-mock'||practice==='speaking-mock') {
    const exact=practice==='writing-mock'?60:15;
    if(minutes!==exact)throw new Error(`This mock needs ${exact} minutes.`);
    return {skill,kind:practice,title:skill==='writing'?'Writing mock':'Speaking mock',description:skill==='writing'?'Complete Task 1 and Task 2 under exam timing.':'Complete Parts 1, 2 and 3 under exam timing.',estimatedMinutes:exact,deskMode:'timed',stage:skill==='writing'?'task1':'p1',questionId:null,target:{type:'question',skill,questionId:null,mode:'timed',...(skill==='speaking'?{part:'1'}:{})},completion:{type:'attempt',description:'Save every stage of this mock.'}};
  }
  let task=skillTask(state,skill,minutes,0,false);
  if(skill==='writing' && practice!=='recommended') {
    const kind=['outline','body','task2-timed'].includes(practice)?'2':'1';
    const mode=practice.endsWith('-timed')?'timed':practice;
    task={...task,kind,title:option.label,deskMode:mode,target:{type:'question',skill,questionId:null,mode}};
  } else if(skill==='speaking'&&practice!=='recommended') {
    task={...task,kind:practice,title:option.label,target:{type:'question',skill,questionId:null,mode:'full',part:practice.slice(-1)}};
  } else if(practice==='listening-intensive') {
    if(!action.sectionId||!action.sentenceId)throw new Error('Choose a listening section and sentence.');
    task={...task,kind:practice,title:'Listening - Sentence intensive',sectionId:action.sectionId,sentenceId:action.sentenceId,target:{type:'intensive',skill,sectionId:action.sectionId,sentenceId:action.sentenceId},completion:{type:'review',description:'Complete the selected sentence practice.'}};
  }
  if(task.target.type==='question') {
    const questionId=action.questionId||task.target.questionId;
    const bank=skill==='writing'?state.questions:state.speakingTopics;
    if(action.questionId && bank?.length && !bank.some(row=>String(row.id)===String(questionId) && (skill==='writing'?String(row.type)===task.kind:String(row.part)===(task.target.part==='3'?'2':task.target.part))))throw new Error('The selected question does not match this practice.');
    task.target.questionId=questionId||null;task.questionId=questionId||null;
  }
  if(task.target.type==='section'&&action.sectionId) {task.target.sectionId=action.sectionId;task.sectionId=action.sectionId;}
  return task;
}

function requireDayCapacity(state, key, minutes, excludedId, allowed) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(key)||dateKey(`${key}T00:00:00`)!==key)throw new Error('Choose a valid date.');
  const used=state.plans.filter(row=>row.id!==excludedId&&row.dateKey===key&&row.status!=='skipped').reduce((n,row)=>n+Number(row.estimatedMinutes||0),0);
  const budget=studyBudget(state.settings,key).daily;
  if(used+minutes>budget&&!allowed)throw new Error(`This change exceeds the daily budget by ${used+minutes-budget} minutes. Confirm to keep the extra time.`);
}

export function validatePlanDuration(plan, minutes) {
  if(!Number.isInteger(minutes)||minutes<1||minutes>180)throw new Error('Use a task duration from 1 to 180 minutes.');
  const selected=TASK_PRACTICES[plan.skill]?.find(row=>row.value===plan.practice);
  const required=plan.kind==='writing-mock'?60:plan.kind==='speaking-mock'?15:plan.skill==='writing'&&['timed','full'].includes(plan.deskMode)?plan.kind==='2'?40:20:plan.skill==='reading'?2:1;
  const minimum=Math.max(selected?.minimum||1,required);
  if(minutes<minimum)throw new Error(`This practice needs at least ${minimum} minutes. Replace it with a shorter practice instead.`);
  if(plan.kind?.endsWith('-mock')&&minutes!==minimum)throw new Error(`This mock needs ${minimum} minutes.`);
}

export function mutateStudyPlan(state, planId, action, now = new Date()) {
  let plan=state.plans.find(row=>row.id===planId);
  if(action.type==='add'||action.type==='duplicate') {
    if(action.type==='duplicate'&&!plan)throw new Error('Task not found.');
    let task;
    if(action.type==='duplicate') {
      task=structuredClone(plan);
      // Retain the chosen material but discard all attempt/completion state.
      for(const key of ['id','startedAt','completedAt','linkedSessionId','completedPromptKeys','previousStatus','stage','speakingGroups','manuallyEditedAt'])delete task[key];
      if(task.kind==='writing-mock')task.stage='task1';
      if(task.kind==='speaking-mock'){task.stage='p1';task.target={type:'question',skill:'speaking',questionId:null,part:'1',mode:'timed'};task.questionId=null;}
      if(task.kind==='writing-mock'){task.target={type:'question',skill:'writing',questionId:null,mode:'timed'};task.questionId=null;}
    }else task={...manualStudyTask(state,action),practice:action.practice||action.kind||(action.skill==='vocabulary'?'learning-batch':'recommended')};
    const key=action.dateKey||plan?.dateKey;
    requireDayCapacity(state,key,task.estimatedMinutes,null,action.allowOverBudget);
    let id=`manual-${new Date(now).getTime()}`;let index=1;while(state.plans.some(row=>row.id===id))id=`manual-${new Date(now).getTime()}-${index++}`;
    plan={...task,id,dateKey:key,order:Math.max(-1,...state.plans.filter(row=>row.dateKey===key).map(row=>Number(row.order)||0))+1,status:'pending',startedAt:null,completedAt:null,linkedSessionId:null,schemaVersion:2,generationKey:planningSettingsKey(state.settings)};
    state.plans.push(plan);
  } else {
    if(!plan)throw new Error('Task not found.');
    if(action.type==='skip'&&plan.status!=='completed') {plan.previousStatus=plan.status;plan.status='skipped';plan.skipReason='user-skipped';if(state.activePlanId===plan.id)state.activePlanId=null;}
    else if(action.type==='restore'&&plan.status==='skipped') {requireDayCapacity(state,plan.dateKey,plan.estimatedMinutes,plan.id,action.allowOverBudget);plan.status=plan.previousStatus==='in_progress'?'in_progress':'pending';delete plan.skipReason;delete plan.skippedAt;plan.restoredAt=new Date(now).toISOString();}
    else if(action.type==='reschedule') {
      if(plan.status==='completed')throw new Error('Completed tasks cannot be rescheduled.');
      requireDayCapacity(state,action.dateKey,plan.estimatedMinutes,plan.id,action.allowOverBudget);plan.originalDateKey=plan.originalDateKey||plan.dateKey;plan.dateKey=action.dateKey;plan.rescheduledAt=new Date(now).toISOString();
    } else if(action.type==='resize'||action.type==='replace') {
      if(plan.status!=='pending'||plan.startedAt)throw new Error('Only unstarted tasks can be edited.');
      if(action.type==='resize') {
        const minutes=Number(action.estimatedMinutes);
        validatePlanDuration(plan,minutes);
        requireDayCapacity(state,plan.dateKey,minutes,plan.id,action.allowOverBudget);plan.estimatedMinutes=minutes;
        if(plan.target?.type==='section')delete plan.target.questionIds;
      }else {
        const minutes=action.estimatedMinutes ?? (action.kind==='writing-mock'?60:action.kind==='speaking-mock'?15:plan.estimatedMinutes||studyBudget(state.settings,plan.dateKey).skill);
        const task={...manualStudyTask(state,{...action,estimatedMinutes:minutes}),practice:action.practice||action.kind||(action.skill==='vocabulary'?'learning-batch':'recommended')};
        requireDayCapacity(state,plan.dateKey,task.estimatedMinutes,plan.id,action.allowOverBudget);
        clearPlanBinding(plan);Object.assign(plan,task);
      }
    }else if(action.type==='reorder') {
      const rows=state.plans.filter(row=>row.dateKey===plan.dateKey).sort(compareStudyPlans);
      const index=rows.indexOf(plan);const next=index+(action.direction==='up'?-1:1);
      if(next<0||next>=rows.length)return plan;
      [rows[index],rows[next]]=[rows[next],rows[index]];
      rows.forEach((row,order)=>{row.order=order;row.origin='manual';row.manuallyEditedAt=new Date(now).toISOString();});
    } else throw new Error('This task cannot be changed.');
  }
  plan.origin='manual';plan.manuallyEditedAt=new Date(now).toISOString();
  return plan;
}

export function compareStudyPlans(a,b) {
  return String(a.dateKey).localeCompare(String(b.dateKey)) || (Number(a.order)||0)-(Number(b.order)||0) || String(a.id).localeCompare(String(b.id));
}
