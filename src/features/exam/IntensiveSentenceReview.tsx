import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SelectField } from '../../components/SelectField';
import { SessionAudioPlayer } from '../../components/SessionAudioPlayer';
import { StateMessage } from '../../components/AsyncState';
import type { ExamSentence, IntensiveListeningReview, IntensiveSession } from '../../domain/exam/types';
import { readExamRecovery, writeExamRecovery, clearExamRecovery } from '../../storage/examRecovery';
import { IntensiveAudio } from './IntensiveAudio';
import { IntensiveDiagnosisSummary } from './IntensiveDiagnosis';

type Review = Omit<IntensiveListeningReview, 'nextReviewAt'>;
type Draft = { started: boolean; listened?: boolean; selfRating?: Review['selfRating']; reviewedAt?: string; revealed?: boolean };
const date = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function IntensiveSentenceReview({ owner, session, sentence, audioUrl, audioError, busy = false, onRetryAudio, onSave, onRestart, onNext }: {
  owner: string | null; session: IntensiveSession; sentence: ExamSentence; audioUrl: string; audioError: string;
  busy?: boolean;
  onRetryAudio: () => void; onSave: (review: Review) => Promise<boolean>; onRestart: () => void; onNext?: () => void;
}) {
  const key = `listening-review:${session.sectionId}:${sentence.id}:${session.completedAt}`;
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
  const due = Boolean(session.nextReviewAt && Date.parse(session.nextReviewAt) <= Date.now());
  const active = Boolean(draft?.started && !complete);
  const start = session.correctedStart ?? sentence.start;
  const end = session.correctedEnd ?? sentence.end;
  const hasTiming = start !== undefined && end !== undefined && start >= 0 && end > start;
  async function saveReview() {
    if (!draft?.listened || !draft.selfRating || savingRef.current) return;
    savingRef.current = true;
    const next = { ...draft, reviewedAt: draft.reviewedAt || new Date().toISOString() };
    update(next); setSaving(true); setError('');
    let ok = false;
    try { ok = await onSave({ reviewedAt: next.reviewedAt, selfRating: next.selfRating! }); } catch { ok = false; }
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
      <p>{due && !complete ? 'Check whether you can still understand this sentence. Listen once, then rate your understanding.' : 'Your work is saved. This sentence will appear in Listening → Review when its next review is due.'}</p>
      {session.nextReviewAt ? <p className="intensive-next-review">Next review: <strong>{date(session.nextReviewAt)}</strong>{due && !complete ? ' · Due now' : ''}</p> : null}
      <div className="intensive-actions">
        {onNext ? <button className="btn primary" disabled={busy} onClick={onNext}>Continue to next sentence</button> : null}
        <Link className="btn line" to="/listening/review">Open listening review</Link>
        {due && !complete ? <button className="btn primary" disabled={busy} onClick={() => { setSaved(false); pass.current = false; update({ started: true }); }}>Start listening review</button> : null}
      </div>
      <p className="intensive-action-hint">Listening reviews keep your previous dictation and recording. New dictation and shadowing are optional.</p>
      <details open={historyOpen} onToggle={event => setHistoryOpen(event.currentTarget.open)}><summary>Previous practice and reviews</summary>{historyOpen ? <><p>{session.transcriptInput}</p><IntensiveDiagnosisSummary diagnosis={session} />{session.shadowingAudioId ? <SessionAudioPlayer audioId={session.shadowingAudioId} label="Saved shadowing" /> : null}{session.reviewHistory?.map((cycle, index) => <div className="intensive-cycle-history" key={index}><p>{cycle.completedAt ? date(cycle.completedAt) : 'Previous practice'} · {cycle.dictationResult}</p><IntensiveDiagnosisSummary diagnosis={cycle} /></div>)}{session.listeningReviews?.map(row => <p key={row.reviewedAt}>{date(row.reviewedAt)} · Listening understanding {row.selfRating}/5</p>)}<button className="btn line" disabled={busy} onClick={() => { clearExamRecovery(owner, key); onRestart(); }}>Practise dictation and shadowing again</button></> : null}</details>
    </> : <>
      <p>Play the whole sentence without the transcript. Then rate how much you understood; no typing or new recording is required.</p>
      {audioUrl ? <IntensiveAudio src={audioUrl} scope={`listening-review:${sentence.id}`} start={start} end={end} full={!hasTiming} speed={speed} loop={loop} previousDisabled nextDisabled onPrevious={() => {}} onNext={() => {}} onSpeedChange={setSpeed} onLoopChange={setLoop} onReplay={() => { pass.current = true; }} onPlaybackInvalidated={() => { pass.current = false; }} onSentenceEnd={() => { if (pass.current && hasTiming) { pass.current = false; update({ ...draft!, listened: true }); } }} /> : <StateMessage message={audioError || 'Loading sentence audio…'} onRetry={onRetryAudio} retryLabel="Retry audio" />}
      {!hasTiming ? <p role="alert">Sentence timing is unavailable. Return to the practice to correct its A/B timing before reviewing.</p> : null}
      <label>How much did you understand?<SelectField aria-label="How much did you understand?" disabled={!draft?.listened || saving || Boolean(draft?.reviewedAt)} value={draft?.selfRating || ''} onChange={event => update({ ...draft!, selfRating: Number(event.target.value) as Review['selfRating'] })}><option value="">Choose a rating</option>{[1, 2, 3, 4, 5].map(rating => <option key={rating} value={rating}>{rating} · {['Need help', 'Difficult', 'Some gaps', 'Mostly clear', 'Clear and fluent'][rating - 1]}</option>)}</SelectField></label>
      <p className="intensive-action-hint">{draft?.listened ? 'Sentence heard in full. Choose a rating to schedule the next review.' : 'Listen from the beginning to the end before rating.'}</p>
      {draft?.listened ? <><button className="btn line" onClick={() => update({ ...draft, revealed: !draft.revealed })}>{draft.revealed ? 'Hide transcript' : 'Show transcript'}</button>{draft.revealed ? <blockquote>{sentence.text}</blockquote> : null}</> : null}
      <details><summary>Need more practice?</summary><p>Choose this to repeat dictation and shadowing, or correct sentence timing. Your previous work stays in history.</p><button className="btn line" disabled={saving} onClick={() => { clearExamRecovery(owner, key); onRestart(); }}>Practise dictation and shadowing again</button></details>
      {error ? <p role="alert">{error}</p> : null}
      <div className="intensive-actions"><button className="btn primary" disabled={saving || !draft?.listened || !draft.selfRating} onClick={() => void saveReview()}>{saving ? 'Saving review…' : draft?.reviewedAt ? 'Retry saving review' : 'Save review and schedule next'}</button><button className="btn line" disabled={saving} onClick={() => { clearExamRecovery(owner, key); setDraft(null); setError(''); }}>Cancel review</button></div>
    </>}
  </section>;
}
