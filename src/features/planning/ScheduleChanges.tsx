import { formatDateKey } from '../../lib/format';
import type { describeScheduleChanges, previewScheduleReview } from '../../lib/planTemplates';
import { useEffect, useRef, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';

type Change = ReturnType<typeof describeScheduleChanges>[number];

export function scheduleChangeReason(change: Change) {
  if (change.status === 'completed') return 'Completed from saved practice.';
  if (change.skipReason === 'merged-review') return 'Merged into the current review queue.';
  if (change.skipReason === 'replanned-learning') return 'Unstarted words returned to the learning queue.';
  if (change.skipReason === 'no-longer-due') return 'Review is no longer due.';
  if (change.changeType === 'removed') return 'Removed from the automatic schedule.';
  if (change.from && change.to && change.from !== change.to) return 'Moved to fit the study budget.';
  if (change.changeType === 'added') return 'Scheduled using the current study budget and progress.';
  return 'Updated from your current study progress.';
}

/** The date and length of a change, always stating where a task went or that it was removed. */
export function scheduleChangeWhen(change: Change) {
  if (change.changeType === 'removed') return `Removed · ${formatDateKey(change.from)} · ${change.fromMinutes} min`;
  if (change.changeType === 'added') return `${formatDateKey(change.to)} · ${change.toMinutes} min`;
  const destination = change.archived ? 'Archived' : change.onHold ? 'On hold' : change.status === 'skipped' ? 'Skipped' : formatDateKey(change.to);
  const date = change.from && (change.from !== change.to || destination !== formatDateKey(change.to)) ? `${formatDateKey(change.from)} → ${destination}` : destination;
  const length = change.fromMinutes && change.toMinutes && change.fromMinutes !== change.toMinutes ? `${change.fromMinutes} → ${change.toMinutes} min` : `${change.toMinutes || change.fromMinutes} min`;
  return `${date} · ${length}`;
}

export function ScheduleChangeList({ changes }: { changes: Change[] }) {
  return <ul className="study-change-list">{changes.map(change => <li key={String(change.id)}>
    <strong>{change.title}</strong>
    {change.previousTitle && change.previousTitle !== change.title && <span>Previously {change.previousTitle}</span>}
    <span>{scheduleChangeWhen(change)}</span>
    <span>{change.reason || scheduleChangeReason(change)}</span>
  </li>)}</ul>;
}

export function ScheduleChanges({ changes = [], open = false }: { changes?: Change[]; open?: boolean }) {
  const one = changes.length === 1 ? changes[0] : undefined;
  let summary = '';
  if (one?.changeType === 'added') summary = `Added ${one.title} · ${one.toMinutes} min`;
  else if (one?.changeType === 'removed') summary = `Removed ${one.title}`;
  else if (one?.status === 'completed') summary = `Completed ${one.title} from saved practice`;
  else if (one) summary = `Updated ${one.title}`;
  else if (changes.length) summary = `Updated ${changes.length} schedule items`;
  return <div className="study-schedule-changes">
    <p role="status" aria-atomic="true">{summary}</p>
    {changes.length > 0 && <details open={open || undefined}><summary>See schedule changes</summary><ScheduleChangeList changes={changes}/></details>}
  </div>;
}

export function ScheduleReviewSuggestion({ proposal }: { proposal: ReturnType<typeof previewScheduleReview> }) {
  const fb = useFieldbook();
  const [preview, setPreview] = useState<NonNullable<typeof proposal> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [savedChanges, setSavedChanges] = useState<Change[]>([]);
  const status = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (message === 'Review added to your schedule.') status.current?.focus();
  }, [message]);

  async function save() {
    if (!preview || busy) return;
    setBusy(true);
    setMessage('');
    let feedback = '';
    try {
      if (await fb.saveBacklogPreview(preview, { onError: (text: string) => { feedback = text; } })) {
        setSavedChanges(preview.changes);
        setPreview(null);
        setMessage('Review added to your schedule.');
      } else setMessage(feedback || 'The change could not be saved. Try again.');
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : 'The schedule changed. Open the latest suggestion.');
    } finally {
      setBusy(false);
    }
  }
  return <div className="study-schedule-suggestion">
    <p ref={status} role="status" tabIndex={-1}>{message}</p>
    {savedChanges.length > 0 && !preview && <ScheduleChangeList changes={savedChanges}/>}
    {(proposal || preview) && <div className="study-suggestion-heading">
      <p>A due review could replace an upcoming practice task.</p>
      <button type="button" className="btn line" aria-expanded={Boolean(preview)} disabled={busy}
        onClick={() => { setPreview(preview ? null : proposal); setMessage(''); setSavedChanges([]); }}>{preview ? 'Close preview' : 'Preview suggested change'}</button>
    </div>}
    {preview && <div>
      <ScheduleChangeList changes={preview.changes}/>
      <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Apply schedule change'}</button>
    </div>}
  </div>;
}
