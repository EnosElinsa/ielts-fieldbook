// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { weakestCriterion } from './assessment';
import { firstSentence, daysUntilExam, addLocalDays, dateKey, nowIso } from './utils';
import { dueLexicon } from './lexicon';

export function startPlan(state, planId, startedAt) {
  const plan = state.plans.find(item => item.id === planId);
  if (!plan) return null;
  plan.status = 'in_progress';
  plan.startedAt = startedAt || nowIso();
  state.activePlanId = plan.id;
  return plan;
}

export function completePlan(state, planId, details) {
  const plan = state.plans.find(item => item.id === planId);
  if (!plan) return null;
  plan.status = 'completed';
  plan.completedAt = details && details.completedAt || nowIso();
  plan.linkedSessionId = details && details.linkedSessionId || plan.linkedSessionId || null;
  if (state.activePlanId === plan.id) state.activePlanId = null;
  return plan;
}

export function planMatchesAttempt(plan, attempt) {
  if (!plan || !attempt) return false;
  const kind = String(plan.kind || '');
  if (kind === 'review' || kind === 'lexicon' || kind === 'stories') return false;
  const speaking = attempt.skill === 'speaking';
  if (kind === 'writing-mock') {
    if (speaking) return false;
    const stage = plan.stage || 'task1';
    if (stage === 'task1') return String(attempt.type) === '1';
    if (stage === 'task2') return String(attempt.type) === '2';
    return false;
  }
  if (kind === 'speaking-mock') {
    if (!speaking) return false;
    const stage = plan.stage || 'p1';
    const part = stage === 'p1' ? '1' : stage === 'p2' ? '2' : stage === 'p3' ? '3' : '';
    return String(attempt.part) === part;
  }
  if (kind === '1' || kind === '2') return !speaking && String(attempt.type) === kind;
  if (kind === 'speaking-p1') return speaking && String(attempt.part) === '1';
  if (kind === 'speaking-p2') return speaking && String(attempt.part) === '2';
  if (kind === 'speaking-p3') return speaking && String(attempt.part) === '3';
  return false;
}

export function completePlanIfMatched(state, planId, attempt) {
  const plan = (state.plans || []).find(item => item.id === planId);
  if (!plan || !planMatchesAttempt(plan, attempt)) return null;
  if (plan.kind === 'writing-mock') {
    const stage = plan.stage || 'task1';
    if (stage === 'task1') {
      plan.stage = 'task2';
      plan.status = 'in_progress';
      plan.linkedSessionId = attempt && attempt.id || plan.linkedSessionId;
      return plan;
    }
    return completePlan(state, planId, { linkedSessionId: attempt && attempt.id });
  }
  if (plan.kind === 'speaking-mock') {
    const stage = plan.stage || 'p1';
    if (stage === 'p1') {
      plan.stage = 'p2';
      plan.status = 'in_progress';
      plan.linkedSessionId = attempt && attempt.id || plan.linkedSessionId;
      return plan;
    }
    if (stage === 'p2') {
      plan.stage = 'p3';
      plan.status = 'in_progress';
      plan.linkedSessionId = attempt && attempt.id || plan.linkedSessionId;
      return plan;
    }
    return completePlan(state, planId, { linkedSessionId: attempt && attempt.id });
  }
  return completePlan(state, planId, { linkedSessionId: attempt && attempt.id });
}

export function completeStoriesPlan(state, details) {
  const plan = (state.plans || []).find(item => item.id === state.activePlanId);
  if (!plan || plan.kind !== 'stories') return null;
  return completePlan(state, plan.id, details);
}

export function completeLexiconPlan(state, previousDueCount, now) {
  const plan = (state.plans || []).find(item => item.id === state.activePlanId && item.kind === 'lexicon');
  if (!plan) return null;
  const due = dueLexicon(state, now).length;
  if (due > 0 && !(typeof previousDueCount === 'number' && due < previousDueCount)) return null;
  return completePlan(state, plan.id, { completedAt: now });
}

export function completeReview(state, details) {
  const plan = (state.plans || []).find(item => item.id === state.activePlanId && item.kind === 'review');
  if (!plan) return null;
  return completePlan(state, plan.id, details);
}

export function reviewError(state, errorId, reviewedAt) {
  const error = state.errors.find(item => item.id === errorId);
  if (!error) return null;
  const at = new Date(reviewedAt || nowIso());
  error.reviewCount = Number(error.reviewCount || 0) + 1;
  error.lastReviewedAt = at.toISOString();
  const intervals = [1, 3, 7, 14, 30];
  const interval = intervals[Math.min(Math.max(error.reviewCount - 1, 0), intervals.length - 1)];
  error.nextReviewAt = addLocalDays(at, interval).toISOString();
  return error;
}

export function resolveError(state, errorId, resolved, resolvedAt) {
  const error = state.errors.find(item => item.id === errorId);
  if (!error) return null;
  error.resolved = resolved !== false;
  if (error.resolved === false) error.nextReviewAt = resolvedAt || nowIso();
  return error;
}

export function dueErrors(state, now) {
  const at = now ? new Date(now) : new Date();
  return (state.errors || []).filter(error => {
    if (error.resolved) return false;
    if (!error.nextReviewAt) return true;
    return new Date(error.nextReviewAt) <= at;
  }).slice().sort((left, right) => String(left.nextReviewAt || '').localeCompare(String(right.nextReviewAt || '')));
}

export function rewritePlanDescription(assessment, fallback) {
  return firstSentence(assessment && assessment.nextExercise) || String(fallback || '');
}

export function examPressure(state, now) {
  const days = daysUntilExam(state && state.settings && state.settings.examDate, now);
  return days != null && days >= 0 && days <= 14;
}

export function recentQuestionIds(sessions, skill, limit) {
  return (sessions || []).filter(item => (item.skill === 'speaking') === (skill === 'speaking'))
    .slice(-(limit || 3)).map(item => String(item.questionId));
}

export function pickFrom(list) {
  if (!list || !list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

export function writingTypeForError(error, planKind, source) {
  const code = String(error && error.code || '');
  if (/^TA(?:-|$)/.test(code)) return '1';
  if (/^CC(?:-|$)/.test(code)) return '2';
  if (/^(?:LR|GRA)(?:-|$)/.test(code) && source) return String(source.type || planKind || '2');
  return String(planKind === '1' || planKind === '2' ? planKind : (source && source.type) || '2');
}

export function selectWritingQuestion(state, planKind, questions, now) {
  const pool = Array.isArray(questions) ? questions.slice() : [];
  if (!pool.length) return null;
  const due = dueErrors(state, now).filter(error => {
    const session = (state.sessions || []).find(item => item.id === error.sourceSessionId);
    return !session || session.skill !== 'speaking';
  });
  const latest = (state.sessions || []).filter(item => item.skill !== 'speaking').slice(-1)[0] || null;
  const source = due[0] && due[0].sourceSessionId
    ? (state.sessions || []).find(item => item.id === due[0].sourceSessionId) || latest
    : latest;
  const wanted = writingTypeForError(due[0], planKind, source);
  const typed = pool.filter(item => String(item.type) === String(wanted));
  const candidates = typed.length ? typed : pool;
  if (due[0] && /^TA(?:-|$)/.test(String(due[0].code || '')) && source) {
    const latestQuestion = pool.find(item => String(item.id) === String(source.questionId));
    const different = candidates.filter(item => latestQuestion && item.format && item.format !== latestQuestion.format);
    if (different.length) return pickFrom(different);
  }
  const recent = recentQuestionIds(state.sessions, 'writing', 3);
  const fresh = candidates.filter(item => !recent.includes(String(item.id)));
  return pickFrom(fresh.length ? fresh : candidates) || pickFrom(pool);
}

export function selectSpeakingTopic(state, part, topics, now) {
  const all = (Array.isArray(topics) ? topics : []).filter(item => !item.incomplete);
  if (!all.length) return pickFrom(topics);
  const due = dueErrors(state, now).filter(error => {
    const session = (state.sessions || []).find(item => item.id === error.sourceSessionId);
    return session && session.skill === 'speaking';
  });
  let wanted = String(part || '2');
  if (due[0] && /^FC(?:-|$)/.test(String(due[0].code || ''))) wanted = '1';
  let pool = all.filter(item => String(item.part) === wanted);
  if (!pool.length && wanted === '1') pool = all.filter(item => String(item.part) === '2');
  if (!pool.length) pool = all;
  const recent = recentQuestionIds(state.sessions, 'speaking', 3);
  const fresh = pool.filter(item => !recent.includes(String(item.id)));
  return pickFrom(fresh.length ? fresh : pool);
}

/** Part 2 cards that are not yet linked on any story. */
export function pickUnusedPart2ForStory(state, topics) {
  const used = new Set();
  (state.stories || []).forEach((story) => {
    (story.topicIds || []).forEach((id) => used.add(String(id)));
  });
  const pool = (Array.isArray(topics) ? topics : state.speakingTopics || [])
    .filter((topic) => String(topic.part) === '2' && !topic.incomplete && !used.has(String(topic.id)));
  return pickFrom(pool);
}

/**
 * When stories exist, bind a stories plan to one unused Part 2 and a story.
 * Returns null when there is no story yet (caller should open the stories page).
 */
export function assignStoryPlanTarget(state, topics) {
  const stories = state.stories || [];
  if (!stories.length) return null;
  const topic = pickUnusedPart2ForStory(state, topics || state.speakingTopics);
  if (!topic) return null;
  const story = pickFrom(stories);
  return { storyId: story.id, questionId: String(topic.id) };
}

export function ensureMockPlan(state, kind, details) {
  const wanted = kind === 'speaking-mock' ? 'speaking-mock' : 'writing-mock';
  const key = dateKey(details && details.now ? details.now : new Date());
  const existing = (state.plans || []).find(
    (plan) => plan.kind === wanted && plan.dateKey === key && plan.status !== 'completed',
  );
  if (existing) {
    if (!existing.stage) existing.stage = wanted === 'writing-mock' ? 'task1' : 'p1';
    return existing;
  }
  const plan = {
    id: `plan-${wanted}-${key}`,
    dateKey: key,
    kind: wanted,
    title: wanted === 'writing-mock' ? 'Writing mock' : 'Speaking mock',
    description:
      wanted === 'writing-mock'
        ? 'Task 1 then Task 2 under exam timing.'
        : 'Part 1, Part 2, then Part 3 under exam timing.',
    deskMode: 'timed',
    stage: wanted === 'writing-mock' ? 'task1' : 'p1',
    status: 'pending',
    linkedSessionId: null,
    questionId: null,
    startedAt: null,
    completedAt: null,
    driver: null,
  };
  state.plans.push(plan);
  return plan;
}

export function studyStreak(state, now) {
  const scheduled = new Set(((state.settings && state.settings.days) || []).map(Number));
  if (!scheduled.size) return 0;
  const activity = new Set((state.sessions || []).map(item => dateKey(item.date)));
  const cursor = now ? new Date(now) : new Date();
  cursor.setHours(0, 0, 0, 0);
  const todayDow = cursor.getDay() || 7;
  if (scheduled.has(todayDow) && !activity.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  for (let guard = 0; guard < 400; guard += 1) {
    const dow = cursor.getDay() || 7;
    if (!scheduled.has(dow)) {
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    if (!activity.has(dateKey(cursor))) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function practiceFromWeakness(state, skill) {
  const weakest = weakestCriterion(state, skill);
  if (!weakest) return null;
  if (weakest.skill === 'speaking') {
    if (weakest.key === 'FC') {
      return {
        skill: 'speaking', kind: 'speaking-p1', title: 'Part 1 · Short answers',
        description: 'Fluency is the weak spot. Use short answers to steady the pace.', deskMode: 'timed', driver: 'criterion:FC',
      };
    }
    return {
      skill: 'speaking', kind: 'speaking-p2', title: 'Part 2 · Long turn',
      description: 'Vocabulary or grammar is the weak spot. Work the correction into a long turn.', deskMode: 'full', driver: `criterion:${weakest.key}`,
    };
  }
  if (weakest.key === 'TA') {
    return {
      skill: 'writing', kind: '1', title: 'Task 1 · Read the chart',
      description: 'Task achievement is the weak spot. Check the data, then write only the introduction and overview.', deskMode: 'overview', driver: 'criterion:TA',
    };
  }
  if (weakest.key === 'TR') {
    return {
      skill: 'writing', kind: '2', title: 'Task 2 · Plan',
      description: 'Task response is the weak spot. Write your position and two points first.', deskMode: 'outline', driver: 'criterion:TR',
    };
  }
  if (weakest.key === 'CC') {
    return {
      skill: 'writing', kind: '2', title: 'Task 2 · Body',
      description: 'Coherence is the weak spot. Write one body paragraph that joins the example in.', deskMode: 'body', driver: 'criterion:CC',
    };
  }
  const latest = (state.sessions || []).filter(item => item.skill !== 'speaking').slice(-1)[0];
  const kind = latest && String(latest.type) === '1' ? '1' : '2';
  return {
    skill: 'writing',
    kind,
    title: kind === '1' ? 'Task 1 · Use the correction' : 'Task 2 · Use the correction',
    description: weakest.key === 'LR' ? 'Vocabulary is the weak spot. Use the last correction in this essay.' : 'Grammar is the weak spot. Use the last correction in this essay.',
    deskMode: 'full',
    driver: `criterion:${weakest.key}`,
  };
}

export function errorsForSkill(state, skill, now) {
  const wanted = skill === 'speaking' ? 'speaking' : 'writing';
  return dueErrors(state, now).filter(error => {
    if (!error.sourceSessionId) return wanted === 'writing';
    const session = (state.sessions || []).find(item => item.id === error.sourceSessionId);
    if (!session) return wanted === 'writing';
    return (session.skill === 'speaking' ? 'speaking' : 'writing') === wanted;
  });
}

export function todaySession(state, now, skill) {
  const wanted = skill === 'speaking' ? 'speaking' : 'writing';
  const steps = [];
  const dueWords = dueLexicon(state, now, wanted);
  if (dueWords.length) {
    steps.push({
      id: 'recall',
      title: 'Recall due phrases',
      detail: dueWords.length === 1 ? '1 phrase to recall today.' : `${dueWords.length} phrases to recall today.`,
      count: dueWords.length,
    });
  }
  const practice = practiceFromWeakness(state, wanted);
  steps.push({
    id: 'practice',
    title: practice ? practice.title : "Today's main task",
    detail: practice ? practice.description : 'Follow the plan for this piece.',
    kind: practice ? practice.kind : null,
    driver: practice ? practice.driver : null,
  });
  const correction = errorsForSkill(state, wanted, now)[0] || null;
  if (correction) {
    const sentence = firstSentence(correction.text);
    steps.push({
      id: 'correction',
      title: 'Use the last correction',
      detail: `${correction.code}${sentence ? ` · ${sentence}` : ''}`,
      errorId: correction.id,
      code: correction.code,
    });
  }
  return { steps, practice, weakest: weakestCriterion(state, wanted) };
}

export function syncPendingPlan(plan, recommendation) {
  if (!plan || plan.status !== 'pending' || !recommendation || !recommendation.driver) return false;
  const kind = String(plan.kind || '');
  if (kind === 'writing-mock' || kind === 'speaking-mock') return false;
  const currentSkill = kind === '1' || kind === '2' || kind === 'writing-mock'
    ? 'writing'
    : (kind.startsWith('speaking') || kind === 'stories' ? 'speaking' : null);
  if (currentSkill && currentSkill !== recommendation.skill) return false;
  if (plan.driver && !String(plan.driver).startsWith('criterion:')) return false;
  const same = plan.driver === recommendation.driver
    && plan.kind === recommendation.kind
    && plan.deskMode === recommendation.deskMode
    && plan.title === recommendation.title
    && plan.description === recommendation.description;
  if (same) return false;
  const previousDriver = plan.driver;
  plan.kind = recommendation.kind;
  plan.title = recommendation.title;
  plan.description = recommendation.description;
  plan.deskMode = recommendation.deskMode || 'full';
  plan.driver = recommendation.driver;
  if (previousDriver !== recommendation.driver) plan.questionId = null;
  return true;
}
