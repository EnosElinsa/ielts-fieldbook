import { formatDateKey } from '../../lib/format';
import type { describeScheduleChanges, previewScheduleReview } from '../../lib/planTemplates';
import { useEffect, useRef, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';

type Change = ReturnType<typeof describeScheduleChanges>[number];

function reason(change: Change) {
  if (change.status === 'completed') return 'Completed from saved practice.';
  if (change.skipReason === 'merged-review') return 'Merged into the current review queue.';
  if (change.skipReason === 'replanned-learning') return 'Unstarted words returned to the learning queue.';
  if (change.skipReason === 'no-longer-due') return 'Review is no longer due.';
  if (change.from && change.to && change.from !== change.to) return 'Moved to fit the study budget.';
  if (change.changeType === 'removed') return 'Removed from the automatic schedule.';
  if (change.changeType === 'added') return 'Scheduled using the current study budget and progress.';
  return 'Updated from your current study progress.';
}

export function ScheduleChangeList({ changes }: { changes: Change[] }) {
  return <ul className="study-change-list">{changes.map(change => <li key={String(change.id)}>
    <strong>{change.title}</strong>
    {change.previousTitle && change.previousTitle !== change.title && <span>Previously {change.previousTitle}</span>}
    <span>{change.from && change.from !== change.to && <>{formatDateKey(change.from)} → </>}
      {change.to && <>{formatDateKey(change.to)} · {change.toMinutes} min</>}</span>
    <span>{change.reason || reason(change)}</span>
  </li>)}</ul>;
}

export function ScheduleChanges({ changes = [] }: { changes?: Change[] }) {
  const one = changes.length === 1 ? changes[0] : undefined;
  let summary = '';
  if (one?.changeType === 'added') summary = `Added ${one.title} · ${one.toMinutes} min`;
  else if (one?.status === 'completed') summary = `Completed ${one.title} from saved practice`;
  else if (one) summary = `Updated ${one.title}`;
  else if (changes.length) summary = `Updated ${changes.length} schedule items`;
  return <div className="study-schedule-changes">
    <p role="status" aria-atomic="true">{summary}</p>
    {changes.length > 0 && <details><summary>See schedule changes</summary><ScheduleChangeList changes={changes}/></details>}
  </div>;
}

export function ScheduleReviewSuggestion({ proposal }: { proposal: ReturnType<typeof previewScheduleReview> }) {
  const fb = useFieldbook();
  const [preview, setPreview] = useState<NonNullable<typeof proposal> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
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
    {(proposal || preview) && <div className="study-suggestion-heading">
      <p>A due review could replace an upcoming practice task.</p>
      <button type="button" className="btn line" aria-expanded={Boolean(preview)} disabled={busy}
        onClick={() => { setPreview(preview ? null : proposal); setMessage(''); }}>{preview ? 'Close preview' : 'Preview suggested change'}</button>
    </div>}
    {preview && <div>
      <ScheduleChangeList changes={preview.changes}/>
      <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Apply schedule change'}</button>
    </div>}
  </div>;
}
