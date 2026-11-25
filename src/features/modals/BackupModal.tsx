// @ts-nocheck
import { useMemo, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';
import { migrateState } from '../../domain';
import { ModalFrame } from '../../components/ModalFrame';
import { SaveFailure } from '../../components/SaveFailure';
import { formatCount } from '../../lib/format';

const COUNT_LABELS = [['sessions', 'Attempts'], ['assessments', 'Scores'], ['vocabulary', 'Vocabulary'], ['stories', 'Stories'], ['errors', 'Mistakes'], ['plans', 'Plans']];

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

  const importBackup = async () => {
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
  };

  return (
    <ModalFrame
      open={open}
      title="Import a backup"
      description="Import study records into your account without deleting existing records."
      onClose={() => fb.closeModal()}
      busy={saving}
      footer={<>
        <button className="btn line" type="button" disabled={saving} onClick={() => { fb.setPendingBackup(null); fb.closeModal(); }}>Cancel</button>
        <button className="btn primary" type="button" disabled={saving} onClick={() => void importBackup()}>{saving ? 'Saving...' : 'Back up and import'}</button>
      </>}
    >
      {preview ? (
        <>
          {preview.origin ? (
            <p className="backup-origin">
              From <strong>{preview.origin}</strong>
            </p>
          ) : null}
          <dl className="backup-counts" aria-label="Records in this backup">
            {COUNT_LABELS.map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{formatCount(preview.counts[key])}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p>Nothing to preview.</p>
      )}
      <label className="check-field import-settings">
        <input type="checkbox" disabled={saving} checked={importSettings} onChange={(e) => setImportSettings(e.target.checked)} />
        Also import study settings
      </label>
      <SaveFailure failed={Boolean(error)} role="alert" message={error} />
    </ModalFrame>
  );
}
