/** Load code for the selected authenticated route; this never reads account data. */
export function preloadRoute(path: string) {
  if (path === '/planning') return import('./features/planning/PlanningPage');
  if (path.includes('/groups/') && path.endsWith('/words')) return import('./features/vocabulary/VocabularyGroupWordsPage');
  if (path.includes('/groups/') && path.endsWith('/learn')) return import('./features/vocabulary/VocabularyGroupLearnPage');
  if (path.startsWith('/vocabulary/study') || path.startsWith('/vocabulary/review')) return import('./features/vocabulary/VocabularyPracticePage');
  if (path.startsWith('/vocabulary')) return import('./features/vocabulary/VocabularyPages');
  if (path === '/write/questions') return import('./features/writing/WritingBankPage');
  if (path.startsWith('/write')) return import('./features/writing/WritingDeskPage');
  if (path === '/speak/questions') return import('./features/speaking/SpeakingBankPage');
  if (path.startsWith('/speak/topics')) return import('./features/speaking/SpeakingTopicPage');
  if (path.startsWith('/speak')) return import('./features/speaking/SpeakingDeskPage');
  if (path === '/account' || path.startsWith('/settings')) return import('./features/settings/SettingsPage');
  if (path === '/progress') return import('./features/progress/ProgressPage');
  if (path === '/stories') return import('./features/speaking/StoriesPage');
  if (path.startsWith('/listening/intensive')) return import('./features/exam/IntensiveWorkbenchPage');
  if (/^\/(reading|listening)\/source\//.test(path)) return import('./features/exam/ExamSourcePage');
  if (/^\/(reading|listening)\/review\//.test(path)) return import('./features/exam/ExamReviewPage');
  if (/^\/(reading|listening)\/review$/.test(path)) return import('./features/exam/ExamReviewQueuePage');
  if (/^\/(reading|listening)\//.test(path)) return import('./features/exam/ExamPracticePage');
  if (/^\/(reading|listening)$/.test(path)) return import('./features/exam/ExamBankPage');
  if (path.startsWith('/review/')) return import('./features/review/AssessmentDetailPage');
  if (path === '/review') return import('./features/review/ReviewPage');
  if (path === '/' || path === '/today') return import('./features/today/TodayPage');
  return Promise.resolve();
}
