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
      {groups.map((group, index) => <div className="intensive-diagnosis-group" role="group" aria-labelledby={`${id}-group-${index}`} key={group.title}>
        <h4 id={`${id}-group-${index}`}>{group.title}</h4>
        <div className="intensive-diagnosis-choices">{group.reasons.map(choice)}</div>
      </div>)}
      {earlierReasons.length ? <div className="intensive-diagnosis-group intensive-diagnosis-earlier" role="group" aria-labelledby={`${id}-earlier`}>
        <h4 id={`${id}-earlier`}>Earlier saved choices</h4>
        <div className="intensive-diagnosis-content">
          <p className="file-hint">Your earlier choices are kept as originally saved.</p>
          <div className="intensive-diagnosis-choices">{earlierReasons.map(choice)}</div>
        </div>
      </div> : null}
      <div className="intensive-diagnosis-group intensive-diagnosis-other" role="group" aria-labelledby={`${id}-other`}>
        <h4 id={`${id}-other`}>Other</h4>
        <div className="intensive-diagnosis-content">
          <div className="intensive-diagnosis-choices">{choice('Other')}</div>
          {diagnosis.errorReasons.includes('Other') || diagnosis.errorNote ? <>
            <label className="intensive-diagnosis-note-label" htmlFor={`${id}-note`}>Diagnosis note (optional)</label>
            <textarea id={`${id}-note`} value={diagnosis.errorNote || ''} onChange={event => onNoteChange(event.target.value)} rows={2} placeholder="What made this sentence difficult?" />
          </> : null}
        </div>
      </div>
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
