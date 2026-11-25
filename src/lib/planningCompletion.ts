import { completePlan, completePlanIfMatched, completeVocabularyPlan, errorReviewSatisfied, planMatchesAttempt } from '../domain/plans';
import { dateKey } from '../domain/utils';
import { completeReceptivePlanIfMatched } from './receptivePlans';

/** Replay durable, explicitly bound work before treating a task as unfinished. */
export function recoverCompletedPlans(state: Record<string, any>) {
  const byPlan = (rows: Record<string, any>[]) => {
    const groups = new Map<string, Record<string, any>[]>();
    for (const row of rows || []) if (row.planId) {
      if (!groups.has(row.planId)) groups.set(row.planId, []);
      groups.get(row.planId)!.push(row);
    }
    return groups;
  };
  const sessions = byPlan(state.sessions), vocabulary = byPlan(state.vocabularySessions), exams = byPlan(state.examAttempts);
  const intensive = new Map<string, Record<string, any>[]>();
  for (const row of state.intensiveSessions || []) {
    const ids = new Set<string>([row.planId, ...(row.listeningReviews || []).map((review: { planId?: string }) => review.planId)].filter(Boolean));
    for (const id of ids) { if (!intensive.has(id)) intensive.set(id, []); intensive.get(id)!.push(row); }
  }
  for (const plan of state.plans || []) {
    if (plan.status !== 'in_progress' || !plan.target || !plan.startedAt) continue;
    const owned: any = { ...state, plans: [plan], examAttempts: exams.get(plan.id) || [], intensiveSessions: intensive.get(plan.id) || [] };
    completeReceptivePlanIfMatched(owned, undefined, true);
    // A mistake review is bound to its exact mistakes and the time it began.
    if (plan.kind === 'review' && plan.target.type === 'error-review' && errorReviewSatisfied(state, plan)) {
      const reviewed = plan.target.errorIds.map((id: string) => Date.parse((state.errors || []).find((error: Record<string, any>) => error.id === id)?.lastReviewedAt || '')).filter(Number.isFinite);
      completePlan(owned, plan.id, { completedAt: new Date(reviewed.length ? Math.max(...reviewed) : Date.parse(plan.startedAt)).toISOString() });
    }
    // Mock stages change their next target. Do not replay a prior stage into another one.
    if (!String(plan.kind || '').endsWith('-mock')) {
      const rows = [...(sessions.get(plan.id) || [])]
        .filter(row => planMatchesAttempt(plan, row) && (!plan.restoredAt || Date.parse(row.date) >= Date.parse(plan.restoredAt)))
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.id.localeCompare(b.id));
      const prompts: { promptKey: string }[] = plan.target.prompts || [];
      const promptRecords = new Map<string, Record<string, any>>();
      for (const row of rows) {
        if (String(row.part) === String(plan.target.part) && prompts.some(prompt => prompt.promptKey === row.promptKey) && !promptRecords.has(row.promptKey)) promptRecords.set(row.promptKey, row);
        completePlanIfMatched(owned, plan.id, row);
      }
      if (plan.status === 'completed' && prompts.length && prompts.every(prompt => promptRecords.has(prompt.promptKey))) {
        const last = [...promptRecords.values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).at(-1)!;
        plan.completedAt = last.date; plan.linkedSessionId = last.id;
      }
    }
    for (const row of vocabulary.get(plan.id) || []) if (!plan.restoredAt || Date.parse(row.startedAt) >= Date.parse(plan.restoredAt)) completeVocabularyPlan(owned, row);
    if (plan.status !== 'completed') continue;
    if (state.activePlanId === plan.id) state.activePlanId = null;
    const completedDay = dateKey(plan.completedAt);
    if (plan.originalDateKey && plan.rescheduledAt && Date.parse(plan.rescheduledAt) > Date.parse(plan.completedAt)
      && completedDay >= plan.originalDateKey && completedDay < plan.dateKey) plan.dateKey = completedDay;
    delete plan.waitingReason;
  }
}
