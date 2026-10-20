import { VOCABULARY_PRACTICE_MODES, type VocabularyPracticeMode } from './preferences';
import { isVocabularySessionSelection } from './selection';
import { normalizeVocabularyIdentities } from './identities';

type Binding = { id: string; origin?:'automatic'|'manual';dateKey?:string;title?:string;target: { type: 'vocabulary'; mode?: 'learning-batch' | 'due-review'; binding?: 'dynamic' | 'frozen'; selectionPolicy?: 'exact'; assessmentMode: VocabularyPracticeMode; cards: {entryId:string;senseId:string}[]; batchIndex?:number; batchSize?:number; bookId?: string; unitId?: string } };
export function boundVocabularyAssessment(state: { plans?: unknown[] }, planId: string | null): Binding | undefined {
  if (!planId) return;
  const plan = state.plans?.find(value => {
    if (!value || typeof value !== 'object') return false;
    const row = value as Record<string, unknown>;
    return row.id === planId && row.kind === 'vocabulary' && ['pending','in_progress'].includes(String(row.status));
  }) as Record<string, unknown> | undefined;
  const target = plan?.target as Binding['target'] | undefined;
  if (!target || target.type !== 'vocabulary' || !VOCABULARY_PRACTICE_MODES.some(mode => mode.value === target.assessmentMode) || ['audio','production'].includes(target.assessmentMode) || !Array.isArray(target.cards) || !target.cards.length) return;
  const normalized = normalizeVocabularyIdentities({ id: planId, target, ...(plan?.origin==='manual'||plan?.origin==='automatic'?{origin:plan.origin}:{}), ...(typeof plan?.dateKey==='string'?{dateKey:plan.dateKey}:{}), ...(typeof plan?.title==='string'?{title:plan.title}:{}) });
  if (!isVocabularySessionSelection({kind:'planned-review',planId,cards:normalized.target.cards})) return;
  return normalized as Binding;
}
