// @ts-nocheck
import { useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';
import { ModalFrame } from '../../components/ModalFrame';

export function SaveModal() {
  const fb = useFieldbook();
  const open = fb.modal === 'save';
  const [focus, setFocus] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async (exportForReview) => { setSaving(true); try { await fb.saveAttempt(exportForReview, { focus, next, errors }); } finally { setSaving(false); } };
  const speaking = fb.pendingAttempt?.skill === 'speaking';
  const focused = ['overview', 'outline', 'compare', 'body'].includes(fb.pendingAttempt?.practiceMode);

  return (
    <ModalFrame open={open} onClose={() => fb.closeModal()}>
      <div className="modal">
        <h3>Save practice</h3>
        <p>
          {focused ? 'Save your exercise, or export it for feedback and import the marked file when it is ready.' : speaking
            ? 'Save your transcript, or export it for feedback. The export does not include your recording. Import the marked file when it is ready.'
            : 'Save your response, or export it for feedback and import the marked file when it is ready.'}
        </p>
        <div className="form">
          <div className="field full">
            <label>Practice focus</label>
            <input
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="For example: overview, comparisons, paragraph order"
            />
          </div>
          <div className="field full">
            <label>Next step</label>
            <input
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="For example: check the figures before writing"
            />
          </div>
          <div className="field full">
            <label>Mistake tags (separate with semicolons)</label>
            <input
              value={errors}
              onChange={(e) => setErrors(e.target.value)}
              placeholder="For example: TA-DATA wrong figure; GRA-PREP preposition"
            />
          </div>
        </div>
        <div className="modal-foot">
          {fb.saveFailed ? <p className="inline-error" role="alert">Your work is still here. Retry saving when your connection returns.</p> : null}
          <button
            className="btn line"
            type="button"
            disabled={saving}
            onClick={() => {
              fb.setPendingAttempt(null);
              fb.closeModal();
            }}
          >
            Cancel
          </button>
          <button className="btn line" disabled={saving} type="button" onClick={() => void save(false)}>
            Save only
          </button>
          <button className="btn primary" disabled={saving} type="button" onClick={() => void save(true)}>
            {saving ? 'Saving…' : 'Save and export'}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
