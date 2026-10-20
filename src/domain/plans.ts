// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { weakestCriterion, criterionBucket, isBandScore } from './assessment';
import { firstSentence, daysUntilExam, addLocalDays, dateKey, nowIso } from './utils';
import { dueVocabulary } from './vocabulary';
import { speakingPrompts } from './speaking';

export function bindSpeakingPlan(plan, topic, part, targetedPrompt, topics: any[] = []) {
  if (!plan || plan.status === 'completed' || !topic) return plan;
  if (plan.kind !== 'speaking-mock' && plan.target?.prompts?.length) return plan;
  const group = (source, resolved) => ({ questionId: String(source.id), part: resolved, prompts: speakingPrompts(source, resolved) });
  if (plan.kind === 'speaking-mock') {
    const short = String(topic.part) === '1' ? topic : topics.find(row => String(row.part) === '1' && !row.incomplete);
    const long = String(topic.part) === '2' ? topic : topics.find(row => String(row.part) === '2' && !row.incomplete);
    if (!short || !long) throw new Error('Both speaking mock topics must be available. Retry loading the bank.');
    plan.speakingGroups = plan.speakingGroups || {};
    if (short && !plan.speakingGroups.p1) plan.speakingGroups.p1 = group(short, '1');
    if (long) {
      if (!plan.speakingGroups.p2) plan.speakingGroups.p2 = group(long, '2');
      if (!plan.speakingGroups.p3) plan.speakingGroups.p3 = group(long, '3');
    }
  }
  if (plan.target?.prompts?.length) return plan;
  const bound = (plan.kind === 'speaking-mock' ? plan.speakingGroups?.[plan.stage || 'p1'] : null) || group(topic, String(part));
  plan.target = { ...plan.target, type: 'question', skill: 'speaking', ...bound, prompts: targetedPrompt?.promptKey ? [{ ...targetedPrompt, part: String(part) }] : bound.prompts };
  plan.questionId = bound.questionId;
  return plan;
}

export type StudySkill = 'writing' | 'speaking' | 'reading' | 'listening' | 'vocabulary';
export type StudyPlanAction =
  | {type:'add'|'replace';skill:StudySkill;practice?:string;kind?:string;estimatedMinutes?:number;dateKey?:string;questionId?:string;sectionId?:string;sentenceId?:string;bookId?:string;unitId?:string;batchIndex?:number;allowOverBudget?:boolean}
  | {type:'resize';estimatedMinutes:number;allowOverBudget?:boolean}
  | {type:'reschedule'|'duplicate';dateKey:string;allowOverBudget?:boolean}
  | {type:'restore';allowOverBudget?:boolean}
  | {type:'skip'|'hold'|'resume'|'archive'|'unarchive'}
  | {type:'reorder';direction:'up'|'down'};
export type PlanTarget =
  | { type: 'question'; skill: 'writing' | 'speaking'; questionId: string | null; part?: string; mode: string; prompts?: { promptKey: string; promptText: string; promptIndex: number; part: string }[] }
  | { type: 'section'; skill: 'reading' | 'listening'; sectionId: string | null; mode: 'practice' | 'mock'; questionIds?: string[] }
  | { type: 'exam-review'; skill: 'reading' | 'listening'; attemptId: string }
  | { type: 'intensive'; skill: 'listening'; sectionId: string; sentenceId: string }
  | { type: 'error-review'; errorIds: string[] }
  | { type: 'vocabulary'; binding?: 'dynamic' | 'frozen'; mode: 'learning-batch' | 'due-review'; assessmentMode: string; bookId?: string; unitId?: string; batchIndex?: number; batchSize?: number; selectionPolicy?: 'exact'; entryIds?: string[]; reviewType?:'due'|'wrong'|'custom';reviewFilter?:import('./vocabulary/types').ReviewQueueFilter;reviewReason?:string;questionOrder?:'source'|'random'|'due';selectedMeanings?:{entryId:string;senseId:string}[];cards: {entryId:string; senseId:string}[] };
export type StudyPlan = {
  id: string; dateKey: string; skill: StudySkill; kind: string; title: string; description: string;
  estimatedMinutes: number; origin: 'automatic' | 'manual'; status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  skipReason?: 'no-longer-due' | 'merged-review' | 'bulk-skip' | 'user-skipped';
  originalDateKey?: string; rescheduledAt?: string; skippedAt?: string;
  onHold?: boolean; heldAt?: string; archivedAt?: string; unarchivedAt?: string;
  target: PlanTarget; completion: { type: 'attempt' | 'review' | 'assessment'; description: string };
  schemaVersion: 2; generationKey: string; startedAt: string | null; completedAt: string | null;
  [key: string]: unknown;
};

export function isProtectedPlan(plan) {
  return plan.status !== 'pending' || Boolean(plan.startedAt || plan.completedAt || plan.manuallyEditedAt || plan.origin === 'manual' || plan.manual || plan.userModified);
}

export function recommendationFromAssessment(state, assessment) {
  if (!assessment) return null;
  const skill = assessment.skill === 'speaking' ? 'speaking' : 'writing';
  const mode = String(assessment.practiceMode || 'unknown');
  if (mode === 'full' || mode === 'timed') {
    const weakness = practiceFromWeakness(state, skill);
    if (weakness) return weakness;
  }
  const currentScores = (assessment.criteria || []).filter(item => isBandScore(item.score) && criterionBucket(item.name))
    .map(item => ({ key: criterionBucket(item.name), score: Number(item.score), skill }))
    .sort((a, b) => a.score - b.score);
  if (currentScores.length && mode === 'unknown') return practiceForCriterion(state, currentScores[0]);
  if (skill === 'writing' && ['overview', 'outline', 'compare', 'body'].includes(mode)) {
    const labels = {
      overview: ['Task 1 · Read the chart', 'Check the figures, then write only the introduction and overview.', 'overview'],
      outline: ['Task 2 · Plan', 'Question, position, and two main points.', 'outline'],
      compare: ['Task 1 · Compare', 'Write one body paragraph with at least two real comparisons.', 'compare'],
      body: ['Task 2 · Body', 'Write one full body paragraph and add an example.', 'body'],
    }[mode];
    return { skill, kind: mode === 'outline' || mode === 'body' ? '2' : '1', title: labels[0], description: labels[1], deskMode: labels[2], driver: 'assessment:focused', questionId: assessment.questionId || null };
  }
  if (skill === 'speaking' && ['1', '2', '3'].includes(String(assessment.part || ''))) {
    const part = String(assessment.part);
    return { skill, kind: `speaking-p${part}`, title: `Part ${part} · Again`, description: firstSentence(assessment.nextExercise) || 'Use the last feedback and say it again.', deskMode: part === '2' ? 'speak-blind' : 'timed', driver: 'assessment:focused', questionId: assessment.questionId || null };
  }
  if (assessment.nextExercise) {
    const session = (state.sessions || []).find(item => item.id === assessment.sessionId);
    return { skill, kind: skill === 'speaking' ? `speaking-p${assessment.part || '2'}` : String(session && session.type || (assessment.task === 'Task 1' ? '1' : '2')), title: 'Use the feedback', description: firstSentence(assessment.nextExercise), deskMode: 'full', driver: 'assessment:focused', questionId: assessment.questionId || null };
  }
  return null;
}

export function syncNearestPendingPlan(state, recommendation, now) {
  if (!recommendation) return null;
  const today = dateKey(now || new Date());
  const candidates = (state.plans || []).filter(plan => {
    if (!plan || isProtectedPlan(plan) || plan.target) return false;
    if (plan.kind === 'writing-mock' || plan.kind === 'speaking-mock' || plan.kind === 'review' || plan.kind === 'vocabulary' || plan.kind === 'stories') return false;
    const skill = String(plan.kind).startsWith('speaking') ? 'speaking' : (plan.kind === '1' || plan.kind === '2' ? 'writing' : null);
    if (skill !== recommendation.skill) return false;
    return String(plan.dateKey || '') >= today;
  }).sort((a, b) => String(a.dateKey || '').localeCompare(String(b.dateKey || '')));
  const plan = candidates[0];
  if (!plan) return null;
  plan.kind = recommendation.kind;
  plan.title = recommendation.title;
  plan.description = recommendation.description;
  plan.deskMode = recommendation.deskMode || 'full';
  plan.driver = recommendation.driver;
  plan.targetErrorIds = (recommendation.targetErrorIds || []).slice();
  plan.sourceAssessmentId = recommendation.sourceAssessmentId || null;
  plan.questionId = recommendation.questionId || null;
  return plan;
}

export function latestPracticeRecommendation(state, skill) {
  const wanted = skill === 'speaking' ? 'speaking' : 'writing';
  const latest = (state.assessments || []).filter(item => {
    const session = (state.sessions || []).find(attempt => attempt.id === item.sessionId);
    return (session && session.skill === 'speaking' || item.skill === 'speaking' ? 'speaking' : 'writing') === wanted;
  }).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).pop();
  const recommendation = latest && recommendationFromAssessment(state, latest);
  if (recommendation) {
    recommendation.targetErrorIds = (state.errors || []).filter(error => error.sourceAssessmentId === latest.id && !error.resolved).map(error => error.id);
    recommendation.sourceAssessmentId = latest.id;
    return recommendation;
  }
  return practiceFromWeakness(state, wanted);
}

export function startPlan(state, planId, startedAt) {
  const plan = state.plans.find(item => item.id === planId);
  if (!plan || plan.status === 'completed' || plan.status === 'skipped') return null;
  plan.status = 'in_progress';
  plan.startedAt = plan.startedAt || startedAt || nowIso();
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
  if (plan.target) {
    if (plan.status !== 'in_progress' || !plan.startedAt || attempt.planId !== plan.id || plan.target.type !== 'question') return false;
    if (!plan.target.questionId || String(attempt.questionId) !== String(plan.target.questionId)) return false;
    if (!(Date.parse(attempt.date) >= Date.parse(plan.startedAt))) return false;
    const expected = plan.target.mode;
    if (attempt.practiceMode !== expected && !(['full','timed'].includes(expected) && ['full','timed'].includes(attempt.practiceMode))) return false;
  }
  const kind = String(plan.kind || '');
  if (kind === 'review' || kind === 'vocabulary' || kind === 'stories') return false;
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
  if (attempt.skill === 'speaking' && plan.target?.prompts?.length) {
    if (!plan.target.prompts.some(prompt => prompt.promptKey === attempt.promptKey) || String(plan.target.part) !== String(attempt.part)) return null;
    plan.completedPromptKeys = [...new Set([...(plan.completedPromptKeys || []), attempt.promptKey])];
    plan.linkedSessionId = attempt.id || plan.linkedSessionId;
    if (!plan.target.prompts.every(prompt => plan.completedPromptKeys.includes(prompt.promptKey))) return plan;
  }
  if (plan.kind === 'writing-mock') {
    const stage = plan.stage || 'task1';
    if (stage === 'task1') {
      plan.stage = 'task2';
      if(plan.target){const next=(state.questions||[]).find(question=>String(question.type)==='2');if(next){plan.questionId=String(next.id);plan.target={...plan.target,questionId:String(next.id)};}}
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
      if(plan.speakingGroups?.p2) { plan.target = { ...plan.target, ...plan.speakingGroups.p2 }; plan.questionId = plan.target.questionId; }
      else if(plan.target){const next=(state.speakingTopics||[]).find(topic=>String(topic.part)==='2'&&!topic.incomplete);if(next){plan.questionId=String(next.id);plan.target={...plan.target,questionId:String(next.id),part:'2'};}}
      plan.status = 'in_progress';
      plan.linkedSessionId = attempt && attempt.id || plan.linkedSessionId;
      return plan;
    }
    if (stage === 'p2') {
      plan.stage = 'p3';
      if(plan.speakingGroups?.p3) { plan.target = { ...plan.target, ...plan.speakingGroups.p3 }; plan.questionId = plan.target.questionId; }
      else if(plan.target)plan.target={...plan.target,part:'3'};
      plan.status = 'in_progress';
      plan.linkedSessionId = attempt && attempt.id || plan.linkedSessionId;
      return plan;
    }
    return completePlan(state, planId, { linkedSessionId: attempt && attempt.id });
  }
  return completePlan(state, planId, { linkedSessionId: attempt && attempt.id, completedAt: attempt?.date });
}

export function completeStoriesPlan(state, details) {
  const plan = (state.plans || []).find(item => item.id === state.activePlanId);
  if (!plan || plan.kind !== 'stories') return null;
  return completePlan(state, plan.id, details);
}

export function completeVocabularyPlan(state, session, now = undefined) {
  const plan = (state.plans || []).find(item => item.id === session?.planId && item.kind === 'vocabulary');
  const target = plan?.target;
  if (!plan || plan.status !== 'in_progress' || target?.type !== 'vocabulary' || !session || typeof session !== 'object') return null;
  if (session.planId !== plan.id || session.status !== 'submitted' || session.mode !== target.assessmentMode || ['audio','production'].includes(session.mode)) return null;
  if (!(Date.parse(session.startedAt) >= Date.parse(plan.startedAt)) || !(Date.parse(session.submittedAt) >= Date.parse(session.startedAt))) return null;
  const identities = cards => (cards || []).map(card => JSON.stringify([card.entryId,card.senseId])).sort();
  const wanted = identities(target.cards);
  if (!wanted.length || JSON.stringify(wanted) !== JSON.stringify(identities(session.results)) || session.results.some(result => !String(result.response || '').trim() || result.result === 'pending')) return null;
  if (target.mode === 'learning-batch') {
    const selection = session.selection;
    if (selection?.kind !== 'learning-batch' || ['bookId','unitId','batchIndex','batchSize'].some(key => selection[key] !== target[key]) || JSON.stringify(wanted) !== JSON.stringify(identities(selection.cards))) return null;
  }
  return completePlan(state, plan.id, { linkedSessionId: session.id, completedAt: session.submittedAt || now });
}

export function completeReview(state, details) {
  const plan = (state.plans || []).find(item => item.id === state.activePlanId && item.kind === 'review');
  if (!plan) return null;
  if (plan.target) {
    if (plan.status !== 'in_progress' || plan.target.type !== 'error-review' || details?.planId !== plan.id) return null;
    if (!plan.target.errorIds.length || !plan.target.errorIds.every(id => {
      const error = (state.errors || []).find(row => row.id === id);
      return error && (error.resolved || Date.parse(error.lastReviewedAt) >= Date.parse(plan.startedAt));
    })) return null;
  }
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
  const activity = new Set([
    ...(state.sessions || []).map(item => item.date),
    ...(state.examAttempts || []).filter(item => item.status === 'completed').map(item => item.completedAt),
    ...(state.intensiveSessions || []).filter(item => item.stage === 6).map(item => item.completedAt),
  ].filter(value => value && Number.isFinite(Date.parse(value))).map(value => dateKey(value)));
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
  return practiceForCriterion(state, weakest);
}

function practiceForCriterion(state, weakest) {
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
  const dueWords = dueVocabulary(state, now, wanted);
  if (dueWords.length) {
    steps.push({
      id: 'recall',
      title: 'Recall due vocabulary',
      detail: dueWords.length === 1 ? '1 entry to review today.' : `${dueWords.length} entries to review today.`,
      count: dueWords.length,
    });
  }
  const practice = latestPracticeRecommendation(state, wanted);
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
  if (!plan || isProtectedPlan(plan) || plan.target || !recommendation || !recommendation.driver) return false;
  const kind = String(plan.kind || '');
  if (kind === 'writing-mock' || kind === 'speaking-mock') return false;
  const currentSkill = kind === '1' || kind === '2' || kind === 'writing-mock'
    ? 'writing'
    : (kind.startsWith('speaking') || kind === 'stories' ? 'speaking' : null);
  if (currentSkill && currentSkill !== recommendation.skill) return false;
  if (plan.driver && !String(plan.driver).startsWith('criterion:') && !String(plan.driver).startsWith('assessment:')) return false;
  const same = plan.driver === recommendation.driver
    && plan.kind === recommendation.kind
    && plan.deskMode === recommendation.deskMode
    && plan.title === recommendation.title
    && plan.description === recommendation.description
    && JSON.stringify(plan.targetErrorIds || []) === JSON.stringify(recommendation.targetErrorIds || [])
    && (plan.sourceAssessmentId || null) === (recommendation.sourceAssessmentId || null);
  if (same) return false;
  const previousDriver = plan.driver;
  plan.kind = recommendation.kind;
  plan.title = recommendation.title;
  plan.description = recommendation.description;
  plan.deskMode = recommendation.deskMode || 'full';
  plan.driver = recommendation.driver;
  plan.targetErrorIds = (recommendation.targetErrorIds || []).slice();
  plan.sourceAssessmentId = recommendation.sourceAssessmentId || null;
  if (previousDriver !== recommendation.driver || recommendation.sourceAssessmentId) plan.questionId = recommendation.questionId || null;
  return true;
}
