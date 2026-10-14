// @ts-nocheck
import { useMemo, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';
import { migrateState } from '../../domain';
import { ModalFrame } from '../../components/ModalFrame';
import { SaveFailure } from '../../components/SaveFailure';

export function BackupModal() {
  const fb = useFieldbook();
  const open = fb.modal === 'backup';
  const [importSettings, setImportSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
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
    <ModalFrame open={open} title="Import a backup" onClose={() => fb.closeModal()} busy={saving}>
      <div className="modal">
        <h3 aria-hidden="true">Import a backup</h3>
        <p>Import study records into your account without deleting existing records.</p>
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
                Vocabulary: <strong>{preview.counts.vocabulary}</strong>
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
        <label className="check-field import-settings">
          <input type="checkbox" disabled={saving} checked={importSettings} onChange={(e) => setImportSettings(e.target.checked)} />
          Also import study settings
        </label>
        <SaveFailure failed={Boolean(error)} role="alert" message={error} />
        <div className="modal-foot">
          <button
            className="btn line"
            type="button"
            disabled={saving}
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
            disabled={saving}
            onClick={async () => {
              if (!fb.pendingBackup || saving) return;
              setSaving(true); setError('');
              try {
              if (fb.ensureCompleteAccount) await fb.ensureCompleteAccount();
              fb.downloadFile(
                `ielts-fieldbook-rollback-${fb.dateKey(new Date())}.json`,
                JSON.stringify(fb.persistShape(fb.stateRef.current), null, 2),
                'application/json',
              );
              const questions = fb.state.questions;
              const draft = fb.mergeBackup(structuredClone(fb.stateRef.current), migrateState(fb.pendingBackup), {
                includeSettings: importSettings,
              });
              if (questions.length) draft.questions = questions;
              let feedback = '';
              if (!await fb.persistNow(draft, { onError: message => { feedback = message; } })) { setError(feedback || 'Backup could not be saved. Retry the merge.'); return; }
              fb.setPendingBackup(null);
              fb.closeModal();
              if (draft.questions[0]) fb.setSelectedQuestionId(String(draft.questions[0].id));
              fb.toast('Backup imported. Existing records were kept.');
              } catch { setError('Could not load or save the complete account. Your backup is still here. Try again.'); }
              finally { setSaving(false); }
            }}
          >
            {saving ? 'Saving...' : 'Back up and import'}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
