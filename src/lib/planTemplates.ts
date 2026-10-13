// @ts-nocheck
import { latestPracticeRecommendation, rewritePlanDescription, syncPendingPlan, dateKey, dueErrors, dueVocabulary, examPressure, assignStoryPlanTarget } from '../domain';
import { sessionSkill, speakingKinds } from './format';
import { receptivePlanTemplates, ensureReceptivePlans } from './receptivePlans';
import { isProtectedPlan, practiceFromWeakness } from '../domain/plans';
import { getVocabularyReviewQueue } from '../domain/vocabulary';
import { VOCABULARY_CATALOG } from '../domain/vocabulary/catalog';
import { getLearnedVocabularyIds, vocabularyGroupProgress } from '../domain/vocabulary/progress';

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

export function studyBudget(settings) {
  const daily = Math.max(1, Math.floor(Number(settings.dailyMinutes) || 30));
  const vocabulary = Math.min(10, Math.floor(daily / 3));
  return { daily, vocabulary, skill: daily - vocabulary };
}

export function selectedStudySkills(settings) {
  if (Array.isArray(settings.skills) && settings.skills.length) return ['writing','speaking','reading','listening'].filter(skill => settings.skills.includes(skill));
  return ['writing','speaking','reading','listening'].includes(settings.skillMix) ? [settings.skillMix] : ['writing','speaking','reading','listening'];
}

export function planningSettingsKey(settings) {
  return JSON.stringify([2, settings.days, studyBudget(settings).daily, selectedStudySkills(settings), settings.focus, settings.speakingFocus, settings.vocabulary?.learningBatchSize || 10, settings.vocabulary?.mode || 'dictation']);
}

export function calendarDays(now = new Date()) {
  const cursor = new Date(now); cursor.setHours(0,0,0,0);
  return Array.from({length:7}, (_,index) => { const day = new Date(cursor); day.setDate(day.getDate()+index); return dateKey(day); });
}

export function nextUnifiedPlan(plans, now = new Date()) {
  const sorted = plans.slice().sort((a,b) => String(a.dateKey).localeCompare(String(b.dateKey)) || (a.skill === 'vocabulary' ? 1 : b.skill === 'vocabulary' ? -1 : String(a.id).localeCompare(String(b.id))));
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

function replaceAutomaticTarget(plan, task) {
  // Clear fields from the old target before the shared context binds the replacement.
  for (const field of ['questionId','sectionId','sentenceId','attemptId','sourceAssessmentId','targetErrorIds','driver','stage']) delete plan[field];
  Object.assign(plan,task);
}

function refreshEvidenceTargets(state, keys, skills, now) {
  const candidates=state.plans.filter(plan=>keys.includes(plan.dateKey)&&plan.schemaVersion===2&&plan.origin==='automatic'&&!isProtectedPlan(plan)&&plan.skill!=='vocabulary'&&plan.kind!=='vocabulary').slice().sort((a,b)=>a.dateKey.localeCompare(b.dateKey)||a.id.localeCompare(b.id));
  const review=reviewTask(state,skills,now,1);
  const reviewKey=review&&evidenceTargetKey(review);
  const alreadyScheduled=reviewKey&&state.plans.some(plan=>plan.status!=='skipped'&&plan.status!=='completed'&&(keys.includes(plan.dateKey)||plan.status==='in_progress')&&evidenceTargetKey(plan)===reviewKey);
  if (review&&!alreadyScheduled&&candidates.length) {
    const plan=candidates[0];
    replaceAutomaticTarget(plan,{...review,estimatedMinutes:plan.estimatedMinutes});
  }
  for (const plan of candidates) {
    if (['error-review','intensive','exam-review'].includes(plan.target?.type)) continue;
    const task=skillTask(state,plan.skill,plan.estimatedMinutes,Math.floor((plan.rotationIndex||0)/skills.length));
    // Ordinary targets may already have a concrete question/section bound by the context.
    if (evidenceTargetKey(task)!==evidenceTargetKey(plan)) replaceAutomaticTarget(plan,task);
  }
}

function vocabularyReviewTask(dueCards, mode, minutes) {
  const cards=dueCards.slice(0,Math.max(1,minutes)).map(({entryId,senseId})=>({entryId,senseId}));
  return {skill:'vocabulary',kind:'vocabulary',title:'Vocabulary - Due recall',description:`Recall ${cards.length} due words.`,estimatedMinutes:minutes,deskMode:mode,target:{type:'vocabulary',mode:'due-review',assessmentMode:mode,cards},completion:{type:'assessment',description:'Submit recall answers for these exact words.'}};
}

function vocabularyRecallKey(target) {
  if(target?.mode!=='due-review')return null;
  return JSON.stringify([target.assessmentMode,(target.cards||[]).map(card=>JSON.stringify([card.entryId,card.senseId])).sort()]);
}

function refreshVocabularyTarget(state, keys, dueCards, mode, cap) {
  if(!dueCards.length||cap<=0)return;
  const plan=state.plans.filter(plan=>keys.includes(plan.dateKey)&&plan.schemaVersion===2&&plan.origin==='automatic'&&!isProtectedPlan(plan)&&plan.kind==='vocabulary').slice().sort((a,b)=>a.dateKey.localeCompare(b.dateKey)||a.id.localeCompare(b.id))[0];
  if(!plan)return;
  const task=vocabularyReviewTask(dueCards,mode,Math.min(cap,plan.estimatedMinutes));
  const recallKey=vocabularyRecallKey(task.target);
  if(state.plans.some(row=>row.status!=='completed'&&row.status!=='skipped'&&(keys.includes(row.dateKey)||row.status==='in_progress')&&vocabularyRecallKey(row.target)===recallKey))return;
  replaceAutomaticTarget(plan,task);
}

export function nextLearningTarget(state, reserved = new Set()) {
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

export function ensureUnifiedPlans(state, persistIfChanged, now = new Date()) {
  const before = JSON.stringify(state.plans);
  const keys = calendarDays(now); const today = keys[0]; const generationKey = planningSettingsKey(state.settings);
  // Migrate only recognizable untouched automatic plans. Keep every unfinished past task visible.
  state.plans = (state.plans || []).filter(plan => {
    if (isProtectedPlan(plan) || String(plan.dateKey || '') < today) return true;
    if (plan.schemaVersion === 2) return plan.generationKey === generationKey;
    return !/^plan-(?:(?:reading|listening)-)?\d{4}-\d{2}-\d{2}$/.test(plan.id || '');
  });
  const skills = selectedStudySkills(state.settings); const budget = studyBudget(state.settings);
  const uniqueId=(id)=>{let next=id;let suffix=2;while(state.plans.some(plan=>plan.id===next))next=`${id}-${suffix++}`;return next;};
  const prior=state.plans.filter(plan=>plan.dateKey<today&&Number.isInteger(plan.rotationIndex)).slice().sort((a,b)=>a.dateKey.localeCompare(b.dateKey)).pop();
  let sequence = prior ? prior.rotationIndex+1 : 0;
  const reserved=new Set(state.plans.filter(plan=>plan.target?.mode==='learning-batch'&&plan.status!=='skipped').map(plan=>JSON.stringify([plan.target.bookId,plan.target.unitId||null,plan.target.batchIndex,plan.target.batchSize])));
  const learned=getLearnedVocabularyIds(state);const preferred=state.settings.vocabulary?.mode || 'dictation';
  let dueCards=[];let dueMode='definition';
  for(const mode of [...new Set([preferred,'definition','dictation','cloze','synonym','distinction'])].filter(mode=>!['audio','production'].includes(mode))) {
    const cards=getVocabularyReviewQueue(state,{mode,dueOnly:true,now}).filter(card=>learned.has(card.entryId));
    if(cards.length){dueCards=cards;dueMode=mode;break;}
  }
  for (const key of keys) {
    if (!(state.settings.days || []).includes(new Date(`${key}T00:00:00`).getDay() || 7) || !skills.length) continue;
    const existing = state.plans.filter(plan=>plan.dateKey===key);
    const retainedRotation=existing.find(plan=>Number.isInteger(plan.rotationIndex));
    if(retainedRotation)sequence=retainedRotation.rotationIndex;
    const existingMinutes = existing.reduce((sum,plan)=>sum+(Number(plan.estimatedMinutes)||budget.daily),0);
    let available = Math.max(0,budget.daily-existingMinutes);
    let vocabulary = null;
    const vocabMinutes = Math.min(budget.vocabulary,available);
    if (!existing.some(plan=>plan.skill==='vocabulary'||plan.kind==='vocabulary') && vocabMinutes>0) {
      if (key===today && dueCards.length) {
        vocabulary=vocabularyReviewTask(dueCards,dueMode,vocabMinutes);
      } else if (vocabMinutes===10) {
        const target=nextLearningTarget(state,reserved);
        if(target)vocabulary={skill:'vocabulary',kind:'vocabulary',title:`Vocabulary - Learn ${target.batchSize} words`,description:'Learn the batch, then submit recall answers.',estimatedMinutes:10,deskMode:target.assessmentMode,target,completion:{type:'assessment',description:'Submit the exact learning batch assessment.'}};
      }
    }
    const vocabReserved = vocabulary?.estimatedMinutes || 0;
    if (!existing.some(plan=>plan.skill!=='vocabulary'&&plan.kind!=='vocabulary') && available-vocabReserved>0) {
      const selected = skills[sequence % skills.length];
      const task = key===today ? reviewTask(state,skills,now,available-vocabReserved) || skillTask(state,selected,available-vocabReserved,Math.floor(sequence/skills.length)) : skillTask(state,selected,available-vocabReserved,Math.floor(sequence/skills.length));
      if(task.skill!=='reading'||task.estimatedMinutes>=2)state.plans.push({id:uniqueId(`study-${key}-skill`),dateKey:key,...task,rotationIndex:sequence,schemaVersion:2,generationKey,origin:'automatic',status:'pending',startedAt:null,completedAt:null,linkedSessionId:null});
    }
    if (vocabulary && available>=vocabReserved) state.plans.push({id:uniqueId(`study-${key}-vocabulary`),dateKey:key,...vocabulary,schemaVersion:2,generationKey,origin:'automatic',status:'pending',startedAt:null,completedAt:null,linkedSessionId:null});
    sequence++;
  }
  refreshEvidenceTargets(state,keys,skills,now);
  refreshVocabularyTarget(state,keys,dueCards,dueMode,budget.vocabulary);
  if (JSON.stringify(state.plans)!==before) persistIfChanged?.();
  return state.plans.filter(plan=>keys.includes(plan.dateKey)).slice().sort((a,b)=>a.dateKey.localeCompare(b.dateKey)||a.id.localeCompare(b.id));
}

export function mutateStudyPlan(state, planId, action, now = new Date()) {
  const plan = state.plans.find(row=>row.id===planId); if (!plan) throw new Error('Task not found.');
  if (action.type==='skip' && plan.status!=='completed') { plan.previousStatus=plan.status;plan.status='skipped';if(state.activePlanId===plan.id)state.activePlanId=null; }
  else if (action.type==='restore' && plan.status==='skipped') plan.status=plan.previousStatus==='in_progress'?'in_progress':'pending';
  else if (action.type==='reschedule') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(action.dateKey) || dateKey(`${action.dateKey}T00:00:00`)!==action.dateKey) throw new Error('Choose a valid date.');
    if(plan.status==='completed')throw new Error('Completed tasks cannot be rescheduled.');
    const used=state.plans.filter(row=>row.id!==plan.id&&row.dateKey===action.dateKey&&row.status!=='skipped').reduce((sum,row)=>sum+Number(row.estimatedMinutes||0),0);
    if(used+Number(plan.estimatedMinutes||0)>studyBudget(state.settings).daily)throw new Error('This day does not have enough study time.');
    plan.dateKey=action.dateKey;
  } else if (action.type==='replace') {
    if(plan.status!=='pending'||plan.startedAt)throw new Error('Only unstarted tasks can be replaced.');
    if(!['writing','speaking','reading','listening'].includes(action.skill))throw new Error('Choose a skill.');
    if(action.kind==='writing-mock'||action.kind==='speaking-mock'){
      const minutes=action.kind==='writing-mock'?60:15;
      const used=state.plans.filter(row=>row.id!==plan.id&&row.dateKey===plan.dateKey&&row.status!=='skipped').reduce((sum,row)=>sum+Number(row.estimatedMinutes||0),0);
      if(used+minutes>studyBudget(state.settings).daily)throw new Error(`This mock needs ${minutes} minutes available on this day.`);
      const skill=action.kind==='writing-mock'?'writing':'speaking';
      Object.assign(plan,{kind:action.kind,skill,title:skill==='writing'?'Writing mock':'Speaking mock',description:skill==='writing'?'Complete Task 1 and Task 2 under exam timing.':'Complete Parts 1, 2 and 3 under exam timing.',deskMode:'timed',estimatedMinutes:minutes,stage:skill==='writing'?'task1':'p1',questionId:null,target:{type:'question',skill,questionId:null,mode:'timed'},completion:{type:'attempt',description:'Save every stage of this mock.'}});
    }else Object.assign(plan,skillTask(state,action.skill,Number(plan.estimatedMinutes)||studyBudget(state.settings).skill,0,false));
    Object.assign(plan,{sectionId:null,sentenceId:null,attemptId:null,sourceAssessmentId:null,targetErrorIds:[],driver:null});
  } else throw new Error('This task cannot be changed.');
  plan.origin='manual';plan.manuallyEditedAt=new Date(now).toISOString();
  return plan;
}
