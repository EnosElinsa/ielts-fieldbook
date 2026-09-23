// @ts-nocheck
export {
  STATE_VERSION,
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
  resolveAssessmentEssay,
  importAssessmentText,
  syncAssessmentErrors,
  numericOveralls,
  latestCriteriaScores,
  criterionLabel,
  criterionBands,
  weakestCriterion,
  overallIsEstimated,
  buildAssessmentRequestWithLexicon as buildAssessmentRequest,
} from './assessment';

export {
  addLexiconItem,
  updateLexiconItem,
  removeLexiconItem,
  reviewLexiconItem,
  lexiconKey,
  dueLexicon,
  lexiconSentenceMatches,
} from './lexicon';

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
  completeLexiconPlan,
  completeReview,
  reviewError,
  resolveError,
  dueErrors,
  rewritePlanDescription,
  examPressure,
  selectWritingQuestion,
  selectSpeakingTopic,
  studyStreak,
  practiceFromWeakness,
  todaySession,
  syncPendingPlan,
} from './plans';

export { wordCount, dateKey, hashText, firstSentence } from './utils';
