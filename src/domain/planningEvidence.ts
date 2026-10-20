// These read-only rows are deliberately separate from writable collections.
// They cannot participate in workspace diffs or replace a full history row.
export const PLANNING_FIELDS = {
  sessions: ['skill','type','part','practiceMode','date','assessmentId','questionId','question_id','targetErrorIds'],
  assessments: ['sessionId','skill','date','criteria','overall','practiceMode','questionId','part','task','nextExercise','inventedPronunciation'],
  errors: ['code','text','resolved','nextReviewAt','sourceSessionId','sourceAssessmentId'],
  stories: ['topicIds'],
  examAttempts: ['skill','status','sectionIds','results','errorReasons','evidence','completedAt','mode','sourceId','planId','retryOfAttemptId','updatedAt','startedAt','remainingSeconds','durationSeconds'],
  intensiveSessions: ['nextReviewAt','sectionId','sentenceId','stage','completedAt'],
} as const;

export type PlanningEvidenceKey = keyof typeof PLANNING_FIELDS;
export type PlanningEvidence = { id: PlanningEvidenceKey; rows: Record<string, any>[] };

export function planningEvidenceView<T extends Record<string, any>>(state:T):T {
  if (!state.planningEvidence?.length) return state;
  const view = { ...state };
  for (const summary of state.planningEvidence as PlanningEvidence[]) {
    if (!(summary.id in PLANNING_FIELDS)) continue;
    const rows = new Map(summary.rows.map(row => [row.id, row]));
    // Rows created or updated in this tab always win over a read-only summary.
    for (const row of state[summary.id] || []) rows.set(row.id, row);
    (view as Record<string, any>)[summary.id] = [...rows.values()];
  }
  return view;
}
