import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Mic, Save, Square } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { RecordingPlayer, SessionAudioPlayer } from '../../components/SessionAudioPlayer';
import { applyIntensiveStage, calculateDictationResult, createIntensiveSession, lcsDiff, sentenceProgress } from '../../domain/exam/intensive';
import type { ExamAsset, ExamCatalog, ExamSentence, IntensiveSession } from '../../domain/exam/types';
import { loadExamSections, resolveExamAsset } from '../../storage/examCatalog';
import { clearExamRecovery, readExamRecovery, writeExamRecovery } from '../../storage/examRecovery';
import { accountId } from '../../storage/remote';
import { putAudio } from '../../storage/audio';
import { deletePendingAudio, readPendingAudio, writePendingAudio } from '../../storage/pendingAudio';
import { IntensiveAudio } from './IntensiveAudio';
import '../../styles/intensive.css';

const stages = ['Blind listening', 'Sentence dictation', 'Compare and diagnose', 'Shadow and record', 'Listen without text', 'Delayed review'];
const reasons = ['Connected speech', 'Weak forms', 'Vocabulary', 'Spelling', 'Attention', 'Sound changes'];
const stamp = () => new Date().toISOString();
type SessionMap = Record<string, IntensiveSession>;

function ShadowingRecorder({ owner, sectionId, sentenceId, enabled, audioId, onSaved }: {
  owner: string | null; sectionId: string; sentenceId: string; enabled: boolean; audioId?: string;
  onSaved: (id: string) => Promise<boolean>;
}) {
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const recordingId = useRef<string | null>(null);
  const pendingKey = `intensive:${sectionId}`;
  useEffect(() => {
    mounted.current = true;
    void readPendingAudio(owner, pendingKey, sentenceId).then(value => { if (mounted.current && accountId() === owner && value) setBlob(value); });
    return () => {
      mounted.current = false;
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, [owner, pendingKey, sentenceId]);
  useEffect(() => {
    if (!blob) { setUrl(null); return; }
    const next = URL.createObjectURL(blob); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);

  async function start() {
    if (!enabled || accountId() !== owner) return;
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('Microphone recording is unavailable in this browser. Use a supported browser over HTTPS.'); return; }
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || accountId() !== owner) { nextStream.getTracks().forEach(track => track.stop()); return; }
      stream.current = nextStream;
      const nextRecorder = new MediaRecorder(nextStream);
      recorder.current = nextRecorder;
      const chunks: Blob[] = [];
      recordingId.current = null;
      nextRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      nextRecorder.onstop = () => {
        nextStream.getTracks().forEach(track => track.stop());
        const value = new Blob(chunks, { type: nextRecorder.mimeType || 'audio/webm' });
        if (value.size) void writePendingAudio(owner, pendingKey, sentenceId, value);
        if (!mounted.current || accountId() !== owner) return;
        setRecording(false);
        if (value.size) setBlob(value); else setError('No audio was recorded. Check the microphone and try again.');
      };
      nextRecorder.onerror = () => {
        nextStream.getTracks().forEach(track => track.stop());
        if (mounted.current && accountId() === owner) { setRecording(false); setError('Microphone recording failed. Try recording again.'); }
      };
      nextRecorder.start(); setRecording(true);
    } catch {
      stream.current?.getTracks().forEach(track => track.stop());
      if (mounted.current && accountId() === owner) setError('Microphone permission was denied or the device is unavailable. Allow access and retry.');
    }
  }

  async function upload() {
    if (!blob || !owner || accountId() !== owner || uploading) return;
    setUploading(true); setError('');
    const id = recordingId.current || `intensive-${crypto.randomUUID()}`;
    recordingId.current = id;
    try {
      await writePendingAudio(owner, pendingKey, sentenceId, blob);
      if (accountId() !== owner) return;
      await putAudio(id, blob);
      if (!mounted.current || accountId() !== owner) return;
      const saved = await onSaved(id);
      if (!saved) { setError('Recording uploaded but progress could not save. Retry saving this recording.'); return; }
      await deletePendingAudio(owner, pendingKey, sentenceId);
      if (mounted.current && accountId() === owner) { setBlob(null); recordingId.current = null; }
    } catch {
      if (mounted.current && accountId() === owner) setError('Recording could not upload. Your recording is kept here; retry or download it.');
    } finally { if (mounted.current && accountId() === owner) setUploading(false); }
  }

  return <div className="intensive-shadowing">
    <p>Echo the rhythm, word stress and linking. Listen to your recording beside the original before rating it.</p>
    <button className="btn line" disabled={!enabled || uploading || !owner} onClick={() => recording ? recorder.current?.stop() : void start()}>{recording ? <Square size={16} /> : <Mic size={16} />}{recording ? 'Stop recording' : 'Record shadowing'}</button>
    {!owner ? <p role="status">Sign in to save a shadowing recording.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {url ? <><RecordingPlayer src={url} label="Shadowing preview" /><div className="intensive-actions"><button className="btn" disabled={uploading || recording} onClick={() => void upload()}>{uploading ? 'Saving recording…' : 'Save shadowing recording'}</button><a className="btn line" href={url} download="ielts-shadowing.webm">Download recording</a></div></> : audioId ? <SessionAudioPlayer audioId={audioId} label="Saved shadowing" /> : null}
  </div>;
}

export function IntensiveWorkbenchPage({ sectionId: suppliedId }: { sectionId?: string }) {
  const params = useParams();
  const sectionId = suppliedId || params.sectionId || '';
  const fb = useFieldbook();
  const owner = accountId();
  return <IntensiveWorkbench key={`${owner}:${sectionId}`} sectionId={sectionId} owner={owner} fb={fb} />;
}

function IntensiveWorkbench({ sectionId, owner, fb }: { sectionId: string; owner: string | null; fb: ReturnType<typeof useFieldbook> }) {
  const [search] = useSearchParams();
  const [catalog, setCatalog] = useState<ExamCatalog | null>(null);
  const [loadingError, setLoadingError] = useState('');
  const [retry, setRetry] = useState(0);
  const [index, setIndex] = useState(0);
  const sentencesPanel = useRef<HTMLElement>(null);
  const [status, setStatus] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioError, setAudioError] = useState('');
  const [assetRetry, setAssetRetry] = useState(0);
  const [blind, setBlind] = useState(false);
  const blindReplayStarted = useRef(false);
  const recoveryKey = `intensive:${sectionId}`;
  const mounted = useRef(true);
  const [sessions, setSessions] = useState<SessionMap>(() => {
    const saved = Object.fromEntries(((fb.state.intensiveSessions || []) as IntensiveSession[]).filter(row => row.sectionId === sectionId).map(row => [row.sentenceId, row]));
    const recovery = readExamRecovery<SessionMap>(owner, recoveryKey);
    if (recovery && typeof recovery === 'object') {
      for (const [key, value] of Object.entries(recovery)) {
        if (value && value.sectionId === sectionId && value.sentenceId === key && (!saved[key] || value.updatedAt >= saved[key].updatedAt)) saved[key] = value;
      }
    }
    return saved;
  });
  const sessionRef = useRef(sessions);
  sessionRef.current = sessions;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setCatalog(null); setLoadingError('');
    void loadExamSections([sectionId]).then(next => {
      if (!active || accountId() !== owner) return;
      const section = next.sections.find(row => row.id === sectionId);
      const sentenceId = search.get('sentence') || search.get('sentenceId');
      const selectedIndex = Math.max(0, section?.sentences.findIndex(sentence => sentence.id === sentenceId) || 0);
      const selectedSentence = section?.sentences[selectedIndex];
      if (selectedSentence) enterRecall(selectedSentence.id);
      setIndex(selectedIndex);
      setCatalog(next);
    }).catch(error => { if (active && accountId() === owner) setLoadingError(error instanceof Error ? error.message : 'Could not load listening material.'); });
    return () => { active = false; };
  }, [sectionId, owner, retry, search]);

  const section = catalog?.sections.find(row => row.id === sectionId);
  useEffect(() => { sentencesPanel.current?.querySelector('[aria-current="step"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [index, section?.id]);
  const sentence: ExamSentence | undefined = section?.sentences[index];
  const session = sentence ? sessions[sentence.id] || createIntensiveSession(sectionId, sentence.id) : null;
  const asset: ExamAsset | undefined = catalog?.assets.find(row => row.id === (sentence?.assetId || section?.assetId));
  useEffect(() => {
    let active = true;
    setAudioUrl(''); setAudioError('');
    if (!asset) return;
    void resolveExamAsset(asset).then(url => { if (active && accountId() === owner) setAudioUrl(url); }).catch(error => { if (active && accountId() === owner) setAudioError(error instanceof Error ? error.message : 'Audio is unavailable.'); });
    return () => { active = false; };
  }, [asset, owner, assetRetry]);
  useEffect(() => { setBlind(false); blindReplayStarted.current = false; setStatus(''); setSaveError(''); }, [sentence?.id]);

  function enterRecall(sentenceId: string) {
    if (accountId() !== owner) return;
    const current = sessionRef.current[sentenceId];
    if (!current?.completedAt || !current.nextReviewAt || Date.parse(current.nextReviewAt) > Date.now()) return;
    const next = { ...sessionRef.current, [sentenceId]: applyIntensiveStage(current, 'review') };
    sessionRef.current = next;
    setSessions(next);
    writeExamRecovery(owner, recoveryKey, next);
  }

  function change(mutator: (value: IntensiveSession) => IntensiveSession) {
    if (!sentence || accountId() !== owner) return;
    const latest = sessionRef.current[sentence.id] || createIntensiveSession(sectionId, sentence.id);
    const changed = { ...mutator(latest), updatedAt: stamp() };
    const next = { ...sessionRef.current, [sentence.id]: changed };
    sessionRef.current = next; setSessions(next);
    writeExamRecovery(owner, recoveryKey, next);
    setStatus('');
  }

  const save = useCallback(async (override?: SessionMap) => {
    if (accountId() !== owner || !mounted.current) return false;
    const snapshot = structuredClone(override || sessionRef.current);
    writeExamRecovery(owner, recoveryKey, snapshot);
    setSaving(true); setSaveError('');
    const draft = structuredClone(fb.stateRef.current);
    const ids = new Set(Object.values(snapshot).map(row => row.id));
    draft.intensiveSessions = [...(draft.intensiveSessions || []).filter((row: IntensiveSession) => !ids.has(row.id)), ...Object.values(snapshot)];
    let saved = false;
    try { saved = Boolean(await fb.persistNow(draft)); } catch { saved = false; }
    if (!mounted.current || accountId() !== owner) return false;
    setSaving(false);
    if (!saved) { setSaveError('Could not save progress. Your changes are kept on this device. Retry Save progress.'); return false; }
    if (JSON.stringify(sessionRef.current) === JSON.stringify(snapshot)) clearExamRecovery(owner, recoveryKey);
    setStatus('Progress saved.');
    return true;
  }, [fb.persistNow, fb.stateRef, owner, recoveryKey]);

  function choose(next: number) {
    if (!section || next < 0 || next >= section.sentences.length) return;
    void save();
    enterRecall(section.sentences[next].id);
    setIndex(next);
  }
  async function recordingSaved(id: string) {
    if (!sentence || accountId() !== owner) return false;
    change(value => applyIntensiveStage({ ...value, shadowingAudioId: id }, 'shadowed'));
    return save();
  }

  if (loadingError) return <section className="panel intensive-workbench"><h1>Intensive listening</h1><p role="alert">{loadingError}</p><button className="btn line" onClick={() => setRetry(value => value + 1)}>Retry material</button></section>;
  if (!catalog) return <section className="panel intensive-workbench"><p role="status">Loading intensive listening material…</p></section>;
  if (!section || section.skill !== 'listening') return <section className="panel intensive-workbench"><h1>Listening section unavailable</h1><Link to="/listening">Back to listening</Link></section>;
  const hasTiming = Boolean(sentence && (session?.correctedStart ?? sentence.start) !== undefined && (session?.correctedEnd ?? sentence.end) !== undefined);
  const start = session?.correctedStart ?? sentence?.start;
  const end = session?.correctedEnd ?? sentence?.end;
  const completedCount = section.sentences.filter(row => sessions[row.id]?.completedAt).length;

  return <section className="intensive-workbench">
    <header className="intensive-header"><div><Link to={`/listening/${encodeURIComponent(sectionId)}`}>← Listening practice</Link><h2>{catalog.papers.find(paper => paper.id === section.paperId)?.title || 'Listening'} · {section.title}</h2><p>{completedCount} / {section.sentences.length} sentences completed</p></div><button className="btn line" disabled={saving || !sentence} onClick={() => void save()}><Save size={16} />{saving ? 'Saving…' : 'Save progress'}</button></header>
    <ol className="intensive-stages" aria-label="Intensive listening method">{stages.map((label, step) => <li key={label} className={session && (session.stage === 6 || step < session.stage) ? 'done' : ''}><span>{step + 1}</span>{label}</li>)}</ol>
    {saveError ? <p role="alert" className="audio-error">{saveError}</p> : status ? <p role="status">{status}</p> : null}
    {!section.sentences.length ? <div className="panel"><h2>Transcript unavailable</h2><p>This section has no imported sentence transcript yet. Full-track listening is available when audio has been imported; dictation comparison and sentence loops need the source transcript and timing.</p>{audioUrl ? <RecordingPlayer src={audioUrl} label="Full listening track" /> : <p role="status">{audioError || 'Listening audio unavailable.'}</p>}</div> : null}
    {sentence && session ? <div className="intensive-layout">
      <aside ref={sentencesPanel} className="panel intensive-sentences"><h2>Sentences</h2>{section.sentences.map((row, rowIndex) => <button key={row.id} className={`intensive-sentence ${rowIndex === index ? 'active' : ''}`} aria-current={rowIndex === index ? 'step' : undefined} onClick={() => choose(rowIndex)}><span>Sentence {rowIndex + 1}</span><span>{sentenceProgress(sessions[row.id])}%{sessions[row.id]?.nextReviewAt && new Date(sessions[row.id].nextReviewAt!) <= new Date() ? ' · Due' : ''}</span></button>)}<p className="file-hint">Return to weak sentences after a delay, then practise without the transcript first.</p></aside>
      <div className="intensive-main">
        <div className="panel"><h2>Sentence {index + 1} / {section.sentences.length}</h2>
          {!sentence.text.trim() ? <p role="status">Transcript unavailable for this sentence.</p> : null}
          {!hasTiming ? <p role="status">Sentence timing unavailable. Listen to the full track, or set accurate A/B points below.</p> : null}
          {audioUrl ? <IntensiveAudio src={audioUrl} start={start} end={end} full={!hasTiming} speed={session.speed} loop={session.loop} previousDisabled={index === 0} nextDisabled={index === section.sentences.length - 1} onPrevious={() => choose(index - 1)} onNext={() => choose(index + 1)} onSpeedChange={speed => change(value => ({ ...value, speed }))} onLoopChange={loop => change(value => ({ ...value, loop }))} onReplay={() => { if (blind) blindReplayStarted.current = true; change(value => ({ ...value, replayCount: value.replayCount + 1 })); }} onSentenceEnd={() => { if (blind && !blindReplayStarted.current) return; change(value => applyIntensiveStage(value, blind ? 'blind-replayed' : 'listened')); }} /> : <div><p role="status">{audioError || (!asset ? 'Listening audio unavailable for this section.' : 'Loading listening audio…')}</p>{audioError ? <button className="btn line" onClick={() => setAssetRetry(value => value + 1)}>Retry audio link</button> : null}</div>}
          <p className="file-hint">{session.replayCount} plays · {session.listened ? 'Blind listening completed' : 'Listen once before comparing'}</p>
          <details className="intensive-timing"><summary>Correct sentence A/B timing</summary><p>Use the seconds from the source recording. Changes apply to your learning record.</p><div className="intensive-actions"><label>A (seconds)<input aria-label="Sentence start seconds" type="number" min="0" step="0.1" value={start ?? ''} onChange={event => { const value = event.target.value === '' ? undefined : Number(event.target.value); change(row => ({ ...row, correctedStart: value })); }} /></label><label>B (seconds)<input aria-label="Sentence end seconds" type="number" min="0" step="0.1" value={end ?? ''} onChange={event => { const value = event.target.value === '' ? undefined : Number(event.target.value); change(row => ({ ...row, correctedEnd: value })); }} /></label></div>{start !== undefined && end !== undefined && end <= start ? <p role="alert">B must be later than A.</p> : null}</details>
        </div>
        {!blind ? <div className="panel intensive-step"><h2>1 · Understand before transcribing</h2><label htmlFor="listening-gist">Main idea or situation</label><textarea id="listening-gist" value={session.gist} onChange={event => change(value => ({ ...value, gist: event.target.value }))} placeholder="Who is speaking? What is happening?" rows={2} /></div> : null}
        {!blind ? <div className="panel intensive-step"><h2>2 · Dictate, compare, diagnose</h2><p>Type what you hear. Keep uncertain gaps visible, then compare once you have tried.</p><label htmlFor="sentence-dictation">Sentence dictation</label><textarea id="sentence-dictation" value={session.transcriptInput} onChange={event => change(value => ({ ...value, transcriptInput: event.target.value, dictationResult: 'pending' }))} rows={3} disabled={session.stage === 6} />
          <button className="btn line" disabled={!session.listened || !session.transcriptInput.trim() || !sentence.text.trim() || blind} onClick={() => { change(value => applyIntensiveStage({ ...value, dictationResult: calculateDictationResult(value.transcriptInput, sentence.text) }, 'reveal')); void save(); }}>Compare with transcript</button>
          {session.revealed && !blind ? <div className="dictation-comparison"><p className="dictation-text">{lcsDiff(session.transcriptInput, sentence.text).map((token, tokenIndex) => <span key={tokenIndex} className={`dictation-${token.kind}`}>{token.text} </span>)}</p><p className="file-hint"><span className="dictation-missing">Missing words</span> · <span className="dictation-extra">Extra words</span> · Result: {session.dictationResult}</p><fieldset><legend>Why did you miss it?</legend>{reasons.map(reason => <label key={reason}><input type="checkbox" checked={session.errorReasons.includes(reason)} onChange={() => change(value => ({ ...value, errorReasons: value.errorReasons.includes(reason) ? value.errorReasons.filter(row => row !== reason) : [...value.errorReasons, reason] }))} />{reason}</label>)}</fieldset></div> : null}
        </div> : null}
        <div className="panel intensive-step"><h2>3 · Shadow, record, listen again</h2><ShadowingRecorder key={`${owner}:${sentence.id}`} owner={owner} sectionId={sectionId} sentenceId={sentence.id} enabled={session.stage >= 2} audioId={session.shadowingAudioId} onSaved={recordingSaved} />
          <button className="btn line" disabled={session.stage < 3 || !audioUrl || blind} aria-pressed={blind} onClick={() => { change(value => ({ ...value, revealed: false, blindReplayDone: false })); blindReplayStarted.current = false; setBlind(true); }}>Hide transcript for blind re-listening</button>{blind ? <p role="status">Transcript hidden. Replay the sentence to the end before finishing.</p> : null}
        </div>
        <div className="panel intensive-step"><h2>4 · Rate and schedule</h2><p>Rate your understanding and shadowing after the blind replay. Weak sentences return sooner.</p><label htmlFor="intensive-rating">Self rating</label><select id="intensive-rating" value={session.selfRating || ''} onChange={event => change(value => ({ ...value, selfRating: Number(event.target.value) as IntensiveSession['selfRating'] }))}><option value="">Choose a rating</option>{[1, 2, 3, 4, 5].map(rating => <option key={rating} value={rating}>{rating} · {['Need help', 'Difficult', 'Some gaps', 'Mostly clear', 'Clear and fluent'][rating - 1]}</option>)}</select><div className="intensive-actions"><button className="btn" disabled={saving || !session.blindReplayDone || !session.shadowingAudioId || !session.selfRating || session.dictationResult === 'pending'} onClick={() => { change(value => applyIntensiveStage(value, 'complete')); void save(); }}>Finish and schedule review</button>{session.completedAt ? <button className="btn line" onClick={() => { change(value => applyIntensiveStage(value, 'review')); setBlind(false); }}>Start blind review</button> : null}</div>
          {session.nextReviewAt ? <p role="status">Next review: {new Date(session.nextReviewAt).toLocaleDateString()} · {new Date(session.nextReviewAt) <= new Date() ? 'Due now' : 'Scheduled'}</p> : null}
          {session.stage >= 2 && !blind && session.reviewHistory?.length ? <details><summary>Previous completed cycles</summary>{session.reviewHistory.map((cycle, cycleIndex) => <div key={cycleIndex}><p>{cycle.completedAt ? new Date(cycle.completedAt).toLocaleDateString() : 'Previous review'} · {cycle.dictationResult} · Rating {cycle.selfRating || '—'}</p>{cycle.shadowingAudioId ? <SessionAudioPlayer audioId={cycle.shadowingAudioId} label={`Previous shadowing ${cycleIndex + 1}`} /> : null}</div>)}</details> : null}
        </div>
      </div>
    </div> : null}
  </section>;
}
