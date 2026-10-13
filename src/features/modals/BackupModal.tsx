// @ts-nocheck
import { useMemo, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';
import { migrateState } from '../../domain';
import { ModalFrame } from '../../components/ModalFrame';

export function BackupModal() {
  const fb = useFieldbook();
  const open = fb.modal === 'backup';
  const [importSettings, setImportSettings] = useState(false);
  const [saving, setSaving] = useState(false);
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
    <ModalFrame open={open} onClose={() => fb.closeModal()} busy={saving}>
      <div className="modal">
        <h3>Import a backup</h3>
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
            disabled={saving}
            onClick={async () => {
              if (!fb.pendingBackup || saving) return;
              setSaving(true);
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
              if (!await fb.persistNow(draft)) { fb.toast('Backup could not be saved. Retry the merge.'); return; }
              fb.setPendingBackup(null);
              fb.closeModal();
              if (draft.questions[0]) fb.setSelectedQuestionId(String(draft.questions[0].id));
              fb.toast('Backup imported. Existing records were kept.');
              } catch { fb.toast('Could not load or save the complete account. Try again.'); }
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
