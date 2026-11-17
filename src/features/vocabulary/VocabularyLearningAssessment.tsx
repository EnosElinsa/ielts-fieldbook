import { useId, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { SelectField } from '../../components/SelectField';
import type { LearningBatch } from '../../domain/vocabulary/learningBatch';
import { VOCABULARY_PRACTICE_MODES, type VocabularyPracticeMode } from '../../domain/vocabulary/preferences';
import type { availableUnitPracticeModes } from '../../domain/vocabulary/selection';
import { VocabularyLink as Link } from './VocabularyRouteLink';

type Props = {
  batch: LearningBatch | null;
  assessments: ReturnType<typeof availableUnitPracticeModes>;
  groupWords: number;
  bound: boolean;
  blocked?: boolean;
  blockedDescriptionId?: string;
  batchUrl: (mode: VocabularyPracticeMode) => string;
  groupUrl: (mode: VocabularyPracticeMode) => string;
};
const wordsLabel = (count: number) => `${count} ${count === 1 ? 'word' : 'words'}`;

/** Scope and question type are independent choices; only the resulting test is a link. */
export function VocabularyLearningAssessment({ batch, assessments, groupWords, bound, blocked, blockedDescriptionId, batchUrl, groupUrl }: Props) {
  const id = useId();
  const [scope, setScope] = useState<'batch' | 'group'>('batch');
  const [requestedMode, setRequestedMode] = useState<VocabularyPracticeMode>();
  const batchModes = batch ? VOCABULARY_PRACTICE_MODES.filter(item => item.value === batch.mode || (!bound && assessments.some(assessment =>
    assessment.value === item.value && batch.selection.cards.every(ref => assessment.queue.cards.some(card => card.entryId === ref.entryId && card.senseId === ref.senseId)),
  ))) : [];
  const modes = bound || scope === 'batch' ? batchModes : assessments;
  const mode = modes.find(item => item.value === requestedMode) || modes.find(item => item.value === batch?.mode) || modes[0];
  const count = scope === 'batch' ? batch?.cards.length || 0 : assessments.find(item => item.value === mode?.value)?.queue.eligibleWords || 0;
  const partial = scope === 'group' && Boolean(mode) && count < groupWords;
  const materials = mode?.value === 'cloze' ? 'sentence-gap questions' : mode?.value === 'synonym' ? 'synonym questions' : mode?.value === 'distinction' ? 'word-distinction questions' : 'questions for this test type';
  const changeScope = (next: 'batch' | 'group') => {
    setRequestedMode(mode?.value);
    setScope(next);
  };
  if (bound && batch) return <div className="vocabulary-learning-test-picker vocabulary-assigned-test">
    <p>{wordsLabel(batch.cards.length)} · {mode?.label}</p>
    {mode && count ? blocked ? <button className="btn primary" disabled aria-describedby={blockedDescriptionId}>Start {mode.label.toLowerCase()} · {wordsLabel(count)}<ArrowRight size={15}/></button> : <Link className="btn primary" to={batchUrl(mode.value)}>Start {mode.label.toLowerCase()} · {wordsLabel(count)}<ArrowRight size={15}/></Link> : null}
    <details className="vocabulary-other-tests"><summary>Other practice</summary>
      <p>Group practice is separate from this task.</p>
      {assessments.map(item => <Link key={item.value} className="btn line" to={groupUrl(item.value)}>{item.label} · {wordsLabel(item.queue.eligibleWords)}</Link>)}
    </details>
  </div>;
  return <div className="vocabulary-learning-test-picker">
    <span className="vocabulary-learning-field-label">Test scope</span>
    <div className="vocabulary-learning-test-scope" role="group" aria-label="Assessment scope">
      <button type="button" className="btn line" aria-pressed={scope === 'batch'} disabled={!batch} onClick={() => changeScope('batch')}>This batch · {wordsLabel(batch?.cards.length || 0)}</button>
      <button type="button" className="btn line" aria-pressed={scope === 'group'} onClick={() => changeScope('group')}>Whole group · {wordsLabel(groupWords)}</button>
    </div>
    {scope === 'group' && <p className="vocabulary-learning-scope-note">One learning meaning per word across the group.</p>}
    <div className="vocabulary-learning-test-launch">
      <label className="vocabulary-learning-test-type" htmlFor={`${id}-type`}>
        <span className="vocabulary-learning-field-label">Test type</span>
        <SelectField id={`${id}-type`} aria-label="Test type" value={mode?.value || ''} disabled={!modes.length} aria-describedby={partial || !mode ? `${id}-availability` : undefined} onValueChange={value => setRequestedMode(value as VocabularyPracticeMode)}>
          {!modes.length ? <option value="">No test available</option> : modes.map(item => {
            const available = assessments.find(assessment => assessment.value === item.value)?.queue.eligibleWords || 0;
            return <option key={item.value} value={item.value}>{item.label}{scope === 'group' && available < groupWords ? ` · ${available}/${groupWords}` : ''}</option>;
          })}
        </SelectField>
      </label>
      {mode && count ? blocked && scope === 'batch' ? <button className="btn primary" disabled aria-describedby={blockedDescriptionId}>Start {mode.label.toLowerCase()} · {wordsLabel(count)}<ArrowRight size={15}/></button> : <Link className="btn primary" to={scope === 'batch' ? batchUrl(mode.value) : groupUrl(mode.value)}>Start {mode.label.toLowerCase()} · {wordsLabel(count)}<ArrowRight size={15}/></Link> : null}
    </div>
    {(partial || !mode) && <p id={`${id}-availability`} className="vocabulary-learning-availability" role="status">{partial
      ? `${count} of ${groupWords} words have suitable ${materials}. The remaining words are not included in this test.`
      : !mode ? 'No test is available for this scope. You can continue learning or check the word details.'
        : ''}</p>}
  </div>;
}
