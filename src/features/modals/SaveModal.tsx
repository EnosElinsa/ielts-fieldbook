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
  const speaking = fb.pendingAttempt?.skill === 'speaking';

  return (
    <ModalFrame open={open} onClose={() => fb.closeModal()}>
      <div className="modal">
        <h3>Finished</h3>
        <p>
          {speaking
            ? 'This file is what you said. The recording is not inside the file. Score it outside Fieldbook, then import the scored file.'
            : 'This file is the essay to score. Score it outside Fieldbook, then import the scored file.'}
        </p>
        <div className="form">
          <div className="field full">
            <label>What to watch</label>
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
          <button
            className="btn line"
            type="button"
            onClick={() => {
              fb.setPendingAttempt(null);
              fb.closeModal();
            }}
          >
            Cancel
          </button>
          <button className="btn line" type="button" onClick={() => fb.saveAttempt(false, { focus, next, errors })}>
            Save only
          </button>
          <button className="btn primary" type="button" onClick={() => fb.saveAttempt(true, { focus, next, errors })}>
            Save and export
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
