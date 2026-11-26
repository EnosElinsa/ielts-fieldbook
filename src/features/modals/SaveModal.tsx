import { useId, useRef, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';
import { ModalFrame } from '../../components/ModalFrame';
import { SaveFailure } from '../../components/SaveFailure';

export function SaveModal() {
  const fb = useFieldbook();
  const open = fb.modal === 'save';
  const id = useId();
  const [focus, setFocus] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(''); const lock = useRef(false);
  const save = async (exportForReview: boolean) => {
    if (lock.current) return;
    lock.current = true; setSaving(true); setError(''); let feedback = '';
    try { if (await fb.saveAttempt(exportForReview, { focus, next, errors }, { onError: (message: string) => { feedback = message; } }) === false) setError(feedback || 'Practice could not be saved. Your work is still here. Retry saving.'); }
    catch { setError('Practice could not be saved. Your work is still here. Retry saving.'); }
    finally { lock.current = false; setSaving(false); }
  };
  const pending = fb.pendingAttempt as { skill?: string; practiceMode?: string } | null;
  const speaking = pending?.skill === 'speaking';
  const focused = ['overview', 'outline', 'compare', 'body'].includes(pending?.practiceMode || '');
  const description = focused ? 'Save your exercise, or export it for feedback and import the marked file when it is ready.' : speaking
    ? 'Save your transcript, or export it for feedback. The export does not include your recording. Import the marked file when it is ready.'
    : 'Save your response, or export it for feedback and import the marked file when it is ready.';

  return (
    <ModalFrame
      open={open}
      title="Save practice"
      description={description}
      busy={saving}
      onClose={() => fb.closeModal()}
      footer={<>
        <button className="btn line" type="button" disabled={saving} onClick={() => { fb.setPendingAttempt(null); fb.closeModal(); }}>Cancel</button>
        <button className="btn line" disabled={saving} type="button" onClick={() => void save(false)}>Save only</button>
        <button className="btn primary" disabled={saving} type="button" onClick={() => void save(true)}>{saving ? 'Saving…' : 'Save and export'}</button>
      </>}
    >
      <fieldset className="form save-modal-form" disabled={saving}>
        <div className="field full">
          <label htmlFor={`${id}-focus`}>Practice focus</label>
          <input id={`${id}-focus`} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="For example: overview, comparisons, paragraph order" />
        </div>
        <div className="field full">
          <label htmlFor={`${id}-next`}>Next step</label>
          <input id={`${id}-next`} value={next} onChange={(e) => setNext(e.target.value)} placeholder="For example: check the figures before writing" />
        </div>
        <div className="field full">
          <label htmlFor={`${id}-errors`}>Mistake tags (separate with semicolons)</label>
          <input id={`${id}-errors`} value={errors} onChange={(e) => setErrors(e.target.value)} placeholder="For example: TA-DATA wrong figure; GRA-PREP preposition" />
        </div>
      </fieldset>
      <SaveFailure failed={Boolean(error)} role="alert" message={error} />
    </ModalFrame>
  );
}
