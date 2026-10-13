import { VOCABULARY_PRACTICE_MODES, type VocabularyPracticeMode } from './preferences';
import { normalizeVocabularyIdentities } from './identities';

type Binding = { id: string; target: { type: 'vocabulary'; assessmentMode: VocabularyPracticeMode; cards: {entryId:string;senseId:string}[]; bookId?: string; unitId?: string } };
export function boundVocabularyAssessment(state: { plans?: unknown[] }, planId: string | null): Binding | undefined {
  if (!planId) return;
  const plan = state.plans?.find(value => {
    if (!value || typeof value !== 'object') return false;
    const row = value as Record<string, unknown>;
    return row.id === planId && row.kind === 'vocabulary' && ['pending','in_progress'].includes(String(row.status));
  }) as Record<string, unknown> | undefined;
  const target = plan?.target as Binding['target'] | undefined;
  if (!target || target.type !== 'vocabulary' || !VOCABULARY_PRACTICE_MODES.some(mode => mode.value === target.assessmentMode) || ['audio','production'].includes(target.assessmentMode) || !Array.isArray(target.cards) || !target.cards.length) return;
  return normalizeVocabularyIdentities({ id: planId, target });
}
