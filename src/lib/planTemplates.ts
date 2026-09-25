// @ts-nocheck
import { practiceFromWeakness, rewritePlanDescription, syncPendingPlan, dateKey, dueErrors, dueLexicon, examPressure, assignStoryPlanTarget } from '../domain';
import { sessionSkill, speakingKinds } from './format';

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
  { kind: '2', title: 'Task 2 · Plan', description: 'Question, position, and two main points.', deskMode: 'outline' },
  { kind: 'speaking-p2', title: 'Part 2 · Long turn', description: 'One minute of notes, then two minutes of speaking.', deskMode: 'full' },
  { kind: 'review', title: 'Review · Mistakes', description: 'Due phrases, or attempts still waiting for a score.', deskMode: 'full' },
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
  '语言积累 · 到期复习': ['Phrases due', 'Phrases to recall today.'],
  '词句到期了': ['Phrases due', 'Phrases to recall today.'],
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
  '处理到期词汇或尚未评分的记录。': 'Due phrases, or attempts still waiting for a score.',
  '处理到期词汇或还没批的记录。': 'Due phrases, or attempts still waiting for a score.',
  '处理到期词汇，或还没批的记录。': 'Due phrases, or attempts still waiting for a score.',
  '按上次的反馈，把最近一次再说一遍。': 'Use the last feedback and say it again.',
  '按上次的反馈再说一遍。': 'Use the last feedback and say it again.',
  '今天有该看的说法。': 'Phrases to recall today.',
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

function lexiconDueTemplate(count) {
  return {
    kind: 'lexicon',
    title: 'Phrases due',
    description: count === 1 ? '1 phrase to recall today.' : `${count} phrases to recall today.`,
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
 * Sequence 0 still prefers due errors, due lexicon, and unscored attempts.
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
      return dueErr ? reviewMistakesTemplate(dueErr) : lexiconDueTemplate(dueLex);
    }
    if (dueErr) return reviewUnresolvedTemplate(dueErr);
    if (dueLex) return lexiconDueTemplate(dueLex);
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
          ? `${count} phrases to recall today.`
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
  if (plan.kind === 'review' || plan.kind === 'lexicon') return true;
  if (plan.kind === 'writing-mock') return activeSkill === 'writing';
  if (plan.kind === 'speaking-mock') return activeSkill === 'speaking';
  if (activeSkill === 'speaking') return speakingKinds().includes(plan.kind);
  return !speakingKinds().includes(plan.kind);
}

export function ensurePlans(state, activeSkill, persistIfChanged) {
  const wanted = Math.max(1, state.settings.days.length);
  const templates = templatesForSettings(state.settings);
  const mix = state.settings.skillMix;
  const mixSkill = mix === 'speaking' || mix === 'writing' ? mix : null;
  const dueErr = dueErrors(state)
    .filter((error) => {
      if (!mixSkill || !error.sourceSessionId) return true;
      const session = state.sessions.find((item) => item.id === error.sourceSessionId);
      return !session || sessionSkill(session) === mixSkill;
    }).length;
  const unassessed = state.sessions.filter(
    (session) => !session.assessmentId && (!mixSkill || sessionSkill(session) === mixSkill),
  ).length;
  const dueLex = dueLexicon(state).length;
  const examSoon = examPressure(state);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const generated = [];
  let cursor = new Date(now);
  let sequence = 0;
  let guard = 0;
  let copyChanged = false;
  while (generated.length < wanted && guard < 35) {
    const weekday = cursor.getDay() || 7;
    if (state.settings.days.includes(weekday)) {
      const key = dateKey(cursor);
      const id = `plan-${key}`;
      let plan = state.plans.find((item) => item.id === id);
      if (!plan) {
        const baseTemplate = templates[sequence % templates.length];
        const templateSkill = skillFromKind(baseTemplate.kind, mix);
        const latest = state.sessions[state.sessions.length - 1];
        const template = pickTemplate({
          settings: state.settings,
          sequence,
          templates,
          signals: {
            recommendation: sequence === 0 ? practiceFromWeakness(state, templateSkill) : null,
            rewrite: rewriteTemplate(state, latest),
            dueErr,
            dueLex,
            unassessed,
            examSoon,
          },
        });
        plan = {
          id,
          dateKey: key,
          kind: template.kind,
          title: template.title,
          description: template.description,
          deskMode: template.deskMode || inferredDeskMode(template),
          status: 'pending',
          linkedSessionId: null,
          questionId:
            template.questionId ||
            (latest && (template.title === '再练一遍' || template.title === 'Say it again' || /重写|Rewrite/.test(template.title))
              ? latest.questionId
              : null),
          startedAt: null,
          completedAt: null,
          driver: template.driver || null,
        };
        if (template.kind === 'stories') {
          const assignment = assignStoryPlanTarget(state);
          if (assignment) {
            plan.storyId = assignment.storyId;
            plan.questionId = assignment.questionId;
          }
        }
        state.plans.push(plan);
      } else if (refreshPlanCopy(plan)) copyChanged = true;
      if (plan.status === 'pending' && key === dateKey(new Date())) {
        const pendingSkill = skillFromKind(plan.kind, mix);
        if (syncPendingPlan(plan, practiceFromWeakness(state, pendingSkill))) copyChanged = true;
      }
      generated.push(plan);
      sequence += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  if (copyChanged && persistIfChanged) persistIfChanged();
  return generated.filter((plan) => planMatchesSkill(plan, activeSkill));
}
