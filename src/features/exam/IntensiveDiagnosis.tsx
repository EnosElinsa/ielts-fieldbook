import { useId } from 'react';
import type { IntensiveSession } from '../../domain/exam/types';

const groups = [
  { title: 'Sound recognition', reasons: ['Known word not recognized', 'Connected speech, weak forms or sound changes', 'Word boundaries'] },
  { title: 'Language knowledge', reasons: ['Unknown vocabulary', 'Grammar or word endings'] },
  { title: 'Writing', reasons: ['Spelling'] },
  { title: 'Listening pace and attention', reasons: ['Listening pace or memory', 'Attention'] },
];
const currentReasons = new Set([...groups.flatMap(group => group.reasons), 'Other']);
type Diagnosis = Pick<IntensiveSession, 'errorReasons' | 'errorNote'>;

export function IntensiveDiagnosis({ diagnosis, onToggleReason, onNoteChange }: {
  diagnosis: Diagnosis; onToggleReason: (reason: string) => void; onNoteChange: (note: string) => void;
}) {
  const id = useId();
  const earlierReasons = [...new Set(diagnosis.errorReasons.filter(reason => !currentReasons.has(reason)))];
  const choice = (reason: string) => <label className="intensive-diagnosis-choice" key={reason}>
    <input type="checkbox" checked={diagnosis.errorReasons.includes(reason)} onChange={() => onToggleReason(reason)} />
    <span>{reason}</span>
  </label>;
  return <fieldset className="intensive-diagnosis" aria-describedby={`${id}-hint`}>
    <legend>Listening diagnosis (optional)</legend>
    <p id={`${id}-hint`} className="file-hint">Choose any causes that help you practise, or leave this blank.</p>
    <div className="intensive-diagnosis-groups">
      {groups.map(group => <fieldset className="intensive-diagnosis-group" key={group.title}>
        <legend>{group.title}</legend>
        {group.reasons.map(choice)}
      </fieldset>)}
      {earlierReasons.length ? <fieldset className="intensive-diagnosis-group intensive-diagnosis-earlier">
        <legend>Earlier saved choices</legend>
        <p className="file-hint">Your earlier choices are kept as originally saved.</p>
        {earlierReasons.map(choice)}
      </fieldset> : null}
      <fieldset className="intensive-diagnosis-group intensive-diagnosis-other">
        <legend>Other</legend>
        {choice('Other')}
        {diagnosis.errorReasons.includes('Other') || diagnosis.errorNote ? <>
          <label className="intensive-diagnosis-note-label" htmlFor={`${id}-note`}>Diagnosis note (optional)</label>
          <textarea id={`${id}-note`} value={diagnosis.errorNote || ''} onChange={event => onNoteChange(event.target.value)} rows={2} placeholder="What made this sentence difficult?" />
        </> : null}
      </fieldset>
    </div>
  </fieldset>;
}

export function IntensiveDiagnosisSummary({ diagnosis }: { diagnosis: Diagnosis }) {
  if (!diagnosis.errorReasons.length && !diagnosis.errorNote) return null;
  return <div className="intensive-diagnosis-summary" aria-label="Saved listening diagnosis">
    <p className="file-hint">Listening diagnosis</p>
    {diagnosis.errorReasons.length ? <p>{diagnosis.errorReasons.join(' · ')}</p> : null}
    {diagnosis.errorNote ? <p className="intensive-diagnosis-saved-note">{diagnosis.errorNote}</p> : null}
  </div>;
}
