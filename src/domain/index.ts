export {
  STATE_VERSION,
  PRACTICE_MODES,
  DEFAULT_SETTINGS,
  BANK_CACHE_KEY,
  LEGACY_STORES,
  emptyState,
  migrateState,
  normalizeDraft,
  draftText,
  persistShape,
  compactAssessmentsForQuota,
  bankCacheShape,
  slimSpeakingTopic,
  clearLegacyStores,
  createAttempt,
} from './state';

export {
  parseAssessmentFile,
  reconstructAssessmentMarkdown,
  isBandScore,
  scoredCriteria,
  assessmentPracticeMode,
  assessmentIsComparable,
  resolveAssessmentEssay,
  importAssessmentText,
  syncAssessmentErrors,
  numericOveralls,
  criterionSeries,
  latestCriteriaScores,
  criterionLabel,
  criterionBands,
  weakestCriterion,
  overallIsEstimated,
  buildAssessmentRequestWithVocabulary as buildAssessmentRequest,
} from './assessment';

export * from './vocabulary';

export { validateBackup, mergeBackup } from './backup';

export { addStory, updateStory, removeStory } from './stories';

export {
  speakingCoverage,
  speakingCoverageCounts,
  buildSpeakingAssessmentRequest,
} from './speaking';

export {
  startPlan,
  completePlan,
  planMatchesAttempt,
  completePlanIfMatched,
  completeStoriesPlan,
  completeVocabularyPlan,
  completeReview,
  reviewError,
  resolveError,
  dueErrors,
  rewritePlanDescription,
  examPressure,
  selectWritingQuestion,
  selectSpeakingTopic,
  pickUnusedPart2ForStory,
  assignStoryPlanTarget,
  ensureMockPlan,
  studyStreak,
  practiceFromWeakness,
  todaySession,
  syncPendingPlan,
  recommendationFromAssessment,
  latestPracticeRecommendation,
  syncNearestPendingPlan,
} from './plans';

export { wordCount, dateKey, hashText, firstSentence } from './utils';

export {
  composeEssay,
  writingSaveBlockers,
  writingWordSoftConfirm,
  fragmentFieldsFilled,
  normalizeSections,
  emptySections,
} from './desk';
