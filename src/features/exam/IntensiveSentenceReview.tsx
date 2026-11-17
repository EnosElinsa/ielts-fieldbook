import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SelectField } from '../../components/SelectField';
import { SessionAudioPlayer } from '../../components/SessionAudioPlayer';
import { StateMessage } from '../../components/AsyncState';
import type { ExamSentence, IntensiveListeningReview, IntensiveSession } from '../../domain/exam/types';
import { readExamRecovery, writeExamRecovery, clearExamRecovery } from '../../storage/examRecovery';
import { IntensiveAudio } from './IntensiveAudio';
import { IntensiveDiagnosisSummary } from './IntensiveDiagnosis';
import { nextIntensiveReview, intensiveReviewDays, intensiveReviewEnabled } from '../../domain/exam/intensive';

type Review = Omit<IntensiveListeningReview, 'nextReviewAt'>;
type Draft = { started: boolean; listened?: boolean; selfRating?: Review['selfRating']; reviewedAt?: string; revealed?: boolean; reviewEnabled?: boolean };
const date = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function IntensiveSentenceReview({ owner, session, sentence, audioUrl, audioError, busy = false, onRetryAudio, onSave, onReviewEnabledChange, onRestart, onNext }: {
  owner: string | null; session: IntensiveSession; sentence: ExamSentence; audioUrl: string; audioError: string;
  busy?: boolean;
  onRetryAudio: () => void; onSave: (review: Review) => Promise<boolean>; onRestart: () => void; onNext?: () => void;
  onReviewEnabledChange: (enabled: boolean) => Promise<boolean>;
}) {
  const key = `listening-review:${session.sectionId}:${sentence.id}:${session.completedAt}`;
  const transcriptId=useId();
  const [draft, setDraft] = useState<Draft | null>(() => readExamRecovery<Draft>(owner, key));
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const pass = useRef(false);
  const savingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const complete = saved;
  const update = (next: Draft) => { setDraft(next); writeExamRecovery(owner, key, next); };
  const enabled = intensiveReviewEnabled(session);
  const due = Boolean(enabled && session.nextReviewAt && Date.parse(session.nextReviewAt) <= Date.now());
  const active = Boolean(draft?.started && !complete);
  const start = session.correctedStart ?? sentence.start;
  const end = session.correctedEnd ?? sentence.end;
  const hasTiming = start !== undefined && end !== undefined && start >= 0 && end > start;
  const lastRating = session.listeningReviews?.at(-1)?.selfRating;
  const interval = intensiveReviewDays(lastRating ? 'correct' : session.dictationResult, lastRating || session.selfRating || 1);
  const keepReviewing = draft?.reviewEnabled ?? enabled;
  const startReview = () => { setSaved(false); pass.current = false; update({ started: true, reviewEnabled: enabled }); };
  async function changeReviewPreference(value: boolean) {
    if (savingRef.current || busy) return;
    savingRef.current = true; setSaving(true); setError('');
    let ok = false;
    try { ok = await onReviewEnabledChange(value); } catch { ok = false; }
    if (!mounted.current) return;
    savingRef.current = false; setSaving(false);
    if (!ok) setError('Could not save your review choice. Please try again.');
  }
  async function saveReview() {
    if (!draft?.listened || !draft.selfRating || savingRef.current) return;
    savingRef.current = true;
    const next = { ...draft, reviewEnabled: draft.reviewEnabled ?? enabled, reviewedAt: draft.reviewedAt || new Date().toISOString() };
    update(next); setSaving(true); setError('');
    let ok = false;
    try { ok = await onSave({ reviewedAt: next.reviewedAt, selfRating: next.selfRating!, reviewEnabled: next.reviewEnabled ?? enabled }); } catch { ok = false; }
    if (ok) clearExamRecovery(owner, key);
    if (!mounted.current) return;
    setSaving(false); savingRef.current = false;
    if (ok) setSaved(true);
    else setError('Could not save this review. Your rating is kept on this device; retry saving.');
  }
  return <section className="panel intensive-listening-review" aria-label="Sentence listening review">
    <h2>{complete ? 'Review complete' : active ? 'Listen without the transcript' : due ? 'Listening review due' : 'Practice complete'}</h2>
    {!active ? <>
      {complete ? <p role="status">Review saved</p> : null}
      <p>{!enabled ? 'Your work is saved. No listening review is scheduled for this sentence. You can add it whenever you want.' : due && !complete ? 'Check whether you can still understand this sentence. Listen once, then rate your understanding.' : 'Your work is saved. This sentence will appear in Listening → Review when its next review is due.'}</p>
      <label className="intensive-review-choice"><input type="checkbox" checked={enabled} disabled={busy || saving} onChange={event => void changeReviewPreference(event.target.checked)} /><span>Include this sentence in listening review</span></label>
      {saving ? <p role="status">Saving review choice…</p> : null}
      {enabled && session.nextReviewAt ? <p className={`intensive-next-review${due && !complete ? ' is-due' : ''}`}>{due && !complete ? 'Review due: ' : 'Next review: '}<strong><time dateTime={session.nextReviewAt}>{date(session.nextReviewAt)}</time></strong>{due && !complete ? ' · Due now' : ''}</p> : null}
      <div className="intensive-actions">
        {due && !complete ? <button className="btn primary" disabled={busy || saving} onClick={startReview}>Start listening review</button> : null}
        {onNext ? <button className={due && !complete ? 'btn line' : 'btn primary'} disabled={busy || saving} onClick={onNext}>Continue to next sentence</button> : null}
        {!due && !complete ? <button className={onNext ? 'btn line' : 'btn primary'} disabled={busy || saving} onClick={startReview}>Review now</button> : null}
        <Link className="btn line" to="/listening/review">Open listening review</Link>
      </div>
      <p className="intensive-action-hint">Listening reviews keep your previous dictation and recording. New dictation and shadowing are optional.</p>
      <details className="intensive-review-rule"><summary>How sentence reviews are scheduled</summary><p>Wrong and partially correct dictations enter review by default. Correct dictations are excluded unless you add them. You can change this choice at any time, or stop scheduling after a review.</p><p>For selected sentences, understanding ratings set the next interval: 1–2 → 1 day, 3 → 2 days, 4 → 4 days, 5 → 7 days. On the first cycle, a wrong dictation returns in 1 day; a partial dictation returns within 2 days.</p>{enabled ? <p>This sentence: {lastRating ? `latest listening rating ${lastRating}/5` : `${session.dictationResult || 'saved'} dictation · understanding ${session.selfRating || '—'}/5`} · {interval}-day interval.</p> : null}</details>
      <details open={historyOpen} onToggle={event => setHistoryOpen(event.currentTarget.open)}><summary>Previous practice and reviews</summary>{historyOpen ? <><p>{session.transcriptInput}</p><IntensiveDiagnosisSummary diagnosis={session} />{session.shadowingAudioId ? <SessionAudioPlayer audioId={session.shadowingAudioId} label="Saved shadowing" /> : null}{session.reviewHistory?.map((cycle, index) => <div className="intensive-cycle-history" key={index}><p>{cycle.completedAt ? date(cycle.completedAt) : 'Previous practice'} · {cycle.dictationResult}</p><IntensiveDiagnosisSummary diagnosis={cycle} /></div>)}{session.listeningReviews?.map(row => <p key={row.reviewedAt}>{date(row.reviewedAt)} · Listening understanding {row.selfRating}/5</p>)}<button className="btn line" disabled={busy} onClick={() => { clearExamRecovery(owner, key); onRestart(); }}>Practise dictation and shadowing again</button></> : null}</details>
    </> : <>
      <p>Play the whole sentence without the transcript. Then rate how much you understood; no typing or new recording is required.</p>
      {audioUrl ? <IntensiveAudio src={audioUrl} scope={`listening-review:${sentence.id}`} start={start} end={end} full={!hasTiming} speed={speed} loop={loop} previousDisabled nextDisabled onPrevious={() => {}} onNext={() => {}} onSpeedChange={setSpeed} onLoopChange={setLoop} onReplay={() => { pass.current = true; }} onPlaybackInvalidated={() => { pass.current = false; }} onSentenceEnd={() => { if (pass.current && hasTiming) { pass.current = false; update({ ...draft!, listened: true }); } }} /> : <StateMessage message={audioError || 'Loading sentence audio…'} onRetry={onRetryAudio} retryLabel="Retry audio" />}
      {!hasTiming ? <p role="alert">Sentence timing is unavailable. Return to the practice to correct its A/B timing before reviewing.</p> : null}
      <label>How much did you understand?<SelectField aria-label="How much did you understand?" disabled={!draft?.listened || saving || Boolean(draft?.reviewedAt)} value={draft?.selfRating || ''} onChange={event => update({ ...draft!, selfRating: Number(event.target.value) as Review['selfRating'] })}><option value="">Choose a rating</option>{[1, 2, 3, 4, 5].map(rating => <option key={rating} value={rating}>{rating} · {['Need help', 'Difficult', 'Some gaps', 'Mostly clear', 'Clear and fluent'][rating - 1]}</option>)}</SelectField></label>
      <p className="intensive-action-hint">{draft?.listened ? 'Sentence heard in full. Choose a rating, then decide whether to keep reviewing.' : 'Listen from the beginning to the end before rating.'}</p>
      <label className="intensive-review-choice"><input type="checkbox" checked={keepReviewing} disabled={saving || busy || Boolean(draft?.reviewedAt)} onChange={event => update({ ...draft!, reviewEnabled: event.target.checked })} /><span>Schedule another listening review</span></label>
      {draft?.selfRating && keepReviewing ? <p className="intensive-next-review">Next review after saving: <strong>{date(nextIntensiveReview('correct', draft.selfRating, draft.reviewedAt))}</strong></p> : null}
      {draft?.listened ? <div className="intensive-review-transcript"><button type="button" className="btn line" aria-expanded={Boolean(draft.revealed)} aria-controls={transcriptId} onClick={() => update({ ...draft, revealed: !draft.revealed })}>{draft.revealed ? 'Hide transcript' : 'Show transcript'}</button><blockquote id={transcriptId} hidden={!draft.revealed}>{sentence.text}</blockquote></div> : null}
      <details><summary>Need more practice?</summary><p>Choose this to repeat dictation and shadowing, or correct sentence timing. Your previous work stays in history.</p><button className="btn line" disabled={saving} onClick={() => { clearExamRecovery(owner, key); onRestart(); }}>Practise dictation and shadowing again</button></details>
      <div className="intensive-actions"><button className="btn primary" disabled={saving || busy || !draft?.listened || !draft.selfRating} onClick={() => void saveReview()}>{saving ? 'Saving review…' : draft?.reviewedAt ? 'Retry saving review' : keepReviewing ? 'Save review and schedule next' : 'Save review and finish'}</button><button className="btn line" disabled={saving} onClick={() => { clearExamRecovery(owner, key); setDraft(null); setError(''); }}>Cancel review</button></div>
    </>}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
