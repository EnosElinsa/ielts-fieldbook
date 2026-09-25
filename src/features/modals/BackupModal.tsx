// @ts-nocheck
import { useMemo, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';
import { migrateState } from '../../domain';
import { ModalFrame } from '../../components/ModalFrame';

export function BackupModal() {
  const fb = useFieldbook();
  const open = fb.modal === 'backup';
  const [importSettings, setImportSettings] = useState(false);
  const preview = useMemo(() => {
    if (!fb.pendingBackup) return null;
    const validation = fb.validateBackup(fb.pendingBackup);
    if (!validation.valid) return null;
    return {
      counts: validation.counts,
      origin: fb.pendingBackup.backupMeta && fb.pendingBackup.backupMeta.origin,
    };
  }, [fb.pendingBackup, fb]);

  return (
    <ModalFrame open={open} onClose={() => fb.closeModal()}>
      <div className="modal">
        <h3>Import a backup</h3>
        <p>This merges with what you already have. Essays and transcripts stay.</p>
        <div className="panel">
          {preview ? (
            <>
              {preview.origin ? (
                <p>
                  From: <strong>{preview.origin}</strong>
                </p>
              ) : null}
              <p>
                Attempts: <strong>{preview.counts.sessions}</strong>
              </p>
              <p>
                Scores: <strong>{preview.counts.assessments}</strong>
              </p>
              <p>
                Phrases: <strong>{preview.counts.lexicon}</strong>
              </p>
              <p>
                Stories: <strong>{preview.counts.stories}</strong>
              </p>
              <p>
                Mistakes: <strong>{preview.counts.errors}</strong>
              </p>
              <p>
                Plans: <strong>{preview.counts.plans}</strong>
              </p>
            </>
          ) : (
            <p>Nothing to preview.</p>
          )}
        </div>
        <label className="day import-settings">
          <input type="checkbox" checked={importSettings} onChange={(e) => setImportSettings(e.target.checked)} />
          Also import study settings
        </label>
        <div className="modal-foot">
          <button
            className="btn line"
            type="button"
            onClick={() => {
              fb.setPendingBackup(null);
              fb.closeModal();
            }}
          >
            Cancel
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              if (!fb.pendingBackup) return;
              fb.downloadFile(
                `ielts-fieldbook-rollback-${fb.dateKey(new Date())}.json`,
                JSON.stringify(fb.persistShape(fb.state), null, 2),
                'application/json',
              );
              const questions = fb.state.questions;
              const draft = fb.mergeBackup(structuredClone(fb.stateRef.current), migrateState(fb.pendingBackup), {
                includeSettings: importSettings,
              });
              if (questions.length) draft.questions = questions;
              fb.setPendingBackup(null);
              fb.closeModal();
              fb.persistNow(draft);
              if (draft.questions[0]) fb.setSelectedQuestionId(String(draft.questions[0].id));
              fb.toast('Backup merged. Nothing already here was deleted.');
            }}
          >
            Back up what I have, then merge
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
