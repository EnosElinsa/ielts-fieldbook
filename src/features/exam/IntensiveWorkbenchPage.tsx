import { SelectField } from '../../components/SelectField';
import { InlineLoadingState, PageLoadingState, StateMessage } from '../../components/AsyncState';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Check, Mic, Save, Square } from 'lucide-react';
import { ExamBackLink } from './ExamNavigation';
import { useFieldbook } from '../../context/FieldbookContext';
import { RecordingPlayer, SessionAudioPlayer } from '../../components/SessionAudioPlayer';
import { useConfirmationDialog } from '../../components/useConfirmationDialog';
import { applyIntensiveStage, calculateDictationResult, createIntensiveSession, lcsDiff } from '../../domain/exam/intensive';
import type { ExamAsset, ExamAttempt, ExamCatalog, ExamSentence, IntensiveSession } from '../../domain/exam/types';
import { hasActiveSourceMock } from '../../domain/exam/sourceAccess';
import { loadExamSections, resolveExamAsset } from '../../storage/examCatalog';
import { clearExamRecovery, readExamRecoveries, readExamRecovery, writeExamRecovery } from '../../storage/examRecovery';
import { accountId } from '../../storage/remote';
import { putAudio } from '../../storage/audio';
import { deletePendingAudio, readPendingAudio, writePendingAudio } from '../../storage/pendingAudio';
import { IntensiveAudio, type IntensiveAudioHandle } from './IntensiveAudio';
import { IntensivePlayerPanel } from './IntensivePlayerPanel';
import { SourceAnnotations, AnnotatedText, type SourceSelection } from './SourceAnnotations';
import { examVocabularySeed } from './vocabularyCapture';
import '../../styles/intensive.css';

const stages = ['Blind listening', 'Sentence dictation', 'Compare and diagnose', 'Shadow and record', 'Listen without text', 'Delayed review'];
// Four learner-facing steps cover the six method stages; sessions keep their domain stage numbers.
const steps = [
  { title: 'Listen for the gist', stages: [0] },
  { title: 'Dictate and compare', stages: [1, 2] },
  { title: 'Shadow and re-listen', stages: [3, 4] },
  { title: 'Rate and schedule', stages: [5] },
];
type StepState = 'current' | 'done' | 'ready' | 'locked';
/** The step that holds the next action. A compared sentence (stage 2) keeps its comparison open; stage 4 is reached only after the blind replay. */
const activeStepFor = (stage: number) => stage >= 4 ? 4 : stage >= 3 ? 3 : stage >= 1 ? 2 : 1;
/** The last step whose work is finished. */
const finishedStepFor = (stage: number) => stage >= 6 ? 4 : stage >= 4 ? 3 : stage >= 2 ? 2 : stage >= 1 ? 1 : 0;
function sentenceStatus(session?: IntensiveSession) {
  if (session?.nextReviewAt && Date.parse(session.nextReviewAt) <= Date.now()) return { tone: 'due', label: 'Due' };
  if (session?.completedAt) return { tone: 'done', label: 'Done' };
  if (session && (session.stage > 0 || session.listened || session.transcriptInput?.trim() || session.gist?.trim())) return { tone: 'progress', label: 'In progress' };
  return { tone: 'new', label: 'Not started' };
}
function IntensiveStep({ id, number, state, open, onOpenChange, children }: { id: string; number: number; state: StepState; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  return <details id={id} className={`panel intensive-step is-${state}`} open={open} onToggle={event => { if (event.currentTarget.open !== open) onOpenChange(event.currentTarget.open); }}>
    <summary aria-disabled={state === 'locked' || undefined} onClick={event => { if (state === 'locked') event.preventDefault(); }}>
      <span className="intensive-step-number" aria-hidden="true">{state === 'done' ? <Check size={13} /> : number}</span>
      <h2>{steps[number - 1].title}</h2>
      <span className="intensive-step-state">{state === 'done' ? 'Done' : state === 'current' ? 'Current step' : state === 'ready' ? 'Ready' : `Available after step ${number - 1}`}</span>
    </summary>
    <div className="intensive-step-body">{children}</div>
  </details>;
}
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
  const [opening, setOpening] = useState(false);
  const requesting = useRef(false);
  const scopeGeneration = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const recordingId = useRef<string | null>(null);
  const pendingKey = `intensive:${sectionId}`;
  const {confirm,dialog}=useConfirmationDialog(`${owner}:${pendingKey}:${sentenceId}`);
  useEffect(() => {
    const generation=++scopeGeneration.current;
    mounted.current = true;
    requesting.current=false;setOpening(false);
    void readPendingAudio(owner, pendingKey, sentenceId).then(value => { if (mounted.current && scopeGeneration.current===generation && accountId() === owner && value) setBlob(value); }).catch(()=>{});
    return () => {
      mounted.current = false;
      scopeGeneration.current+=1;requesting.current=false;
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
    if (!enabled || accountId() !== owner || requesting.current || recording) return;
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('Microphone recording is unavailable in this browser. Use a supported browser over HTTPS.'); return; }
    const generation=scopeGeneration.current;
    requesting.current=true;
    try {
      if(blob&&!await confirm({title:'Replace pending shadowing recording?',description:'The pending recording will be replaced when you stop the new recording. Save or download it first if you want to keep it.',confirmLabel:'Record again',destructive:true}))return;
      if(!mounted.current||scopeGeneration.current!==generation||accountId()!==owner)return;
      setOpening(true);
      const nextStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || scopeGeneration.current!==generation || accountId() !== owner) { nextStream.getTracks().forEach(track => track.stop()); return; }
      stream.current = nextStream;
      const nextRecorder = new MediaRecorder(nextStream);
      recorder.current = nextRecorder;
      const chunks: Blob[] = [];
      recordingId.current = null;
      nextRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      nextRecorder.onstop = () => {
        nextStream.getTracks().forEach(track => track.stop());
        if (!mounted.current || scopeGeneration.current!==generation || recorder.current!==nextRecorder || accountId() !== owner) return;
        const value = new Blob(chunks, { type: nextRecorder.mimeType || 'audio/webm' });
        if (value.size) void writePendingAudio(owner, pendingKey, sentenceId, value);
        setRecording(false);
        if (value.size) setBlob(value); else setError('No audio was recorded. Check the microphone and try again.');
      };
      nextRecorder.onerror = () => {
        nextStream.getTracks().forEach(track => track.stop());
        if (mounted.current && scopeGeneration.current===generation && recorder.current===nextRecorder && accountId() === owner) { setRecording(false); setError('Microphone recording failed. Try recording again.'); }
      };
      nextRecorder.start(); setRecording(true);
    } catch {
      stream.current?.getTracks().forEach(track => track.stop());
      if (mounted.current && scopeGeneration.current===generation && accountId() === owner) setError('Microphone permission was denied or the device is unavailable. Allow access and retry.');
    } finally { if(mounted.current&&scopeGeneration.current===generation&&accountId()===owner){requesting.current=false;setOpening(false);} }
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
    {dialog}
    <p>Echo the rhythm, word stress and linking. Listen to your recording beside the original before rating it.</p>
    <button className={`btn ${recording ? 'warn' : 'line'}`} aria-describedby="intensive-recording-hint" disabled={!enabled || uploading || opening || !owner} onClick={() => recording ? recorder.current?.stop() : void start()}>{recording ? <Square size={16} /> : <Mic size={16} />}{opening?'Opening microphone…':recording ? 'Stop recording' : 'Record shadowing'}</button>
    <p className="intensive-action-hint" id="intensive-recording-hint">{recording ? 'Recording… Stop when you finish, then listen back and save.' : !enabled ? 'Compare your dictation with the transcript to unlock recording.' : 'Record, listen back, then save your shadowing to continue.'}</p>
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
  const location = useLocation();
  const backLink = <ExamBackLink fallback={`/listening/${encodeURIComponent(sectionId)}`} fallbackLabel="Listening practice" />;
  const [search, setSearch] = useSearchParams();
  const searchRef = useRef(search);
  searchRef.current = search;
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
  const audioPlayer = useRef<IntensiveAudioHandle>(null);
  const [audioReady, setAudioReady] = useState(false);
  const [blindReplayRequest, setBlindReplayRequest] = useState(0);
  const blindReplayStarted = useRef(false);
  const [advancedStep, setAdvancedStep] = useState(0);
  const [openSteps, setOpenSteps] = useState<number[]>([]);
  const recoveryKey = `intensive:${sectionId}`;
  const mounted = useRef(true);
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const saveGeneration = useRef(0);
  const [savedCompletions, setSavedCompletions] = useState<Record<string, string>>(() => {
    const pending = readExamRecovery<Record<string, string>>(owner, `${recoveryKey}:pending-completions`);
    return Object.fromEntries(((fb.state.intensiveSessions || []) as IntensiveSession[])
      .filter(row => row.sectionId === sectionId && row.completedAt && pending?.[row.sentenceId] !== row.completedAt)
      .map(row => [row.sentenceId, row.completedAt!]));
  });
  const savedCompletionsRef = useRef(savedCompletions);
  savedCompletionsRef.current = savedCompletions;
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
      const loadedSection = next.sections.find(row => row.id === sectionId);
      const id = searchRef.current.get('sentence') || searchRef.current.get('sentenceId') || readExamRecovery<string>(owner, `${recoveryKey}:position`);
      const selected = Math.max(0, loadedSection?.sentences.findIndex(row => row.id === id) ?? 0);
      if (loadedSection?.sentences[selected]) enterRecall(loadedSection.sentences[selected].id);
      setIndex(selected);
      setCatalog(next);
    }).catch(error => { if (active && accountId() === owner) setLoadingError(error instanceof Error ? error.message : 'Could not load listening material.'); });
    return () => { active = false; };
  }, [sectionId, owner, retry]);

  const section = catalog?.sections.find(row => row.id === sectionId);
  function sourceMockActive() {
    const local = section?.paperId ? readExamRecoveries<ExamAttempt>(owner, `listening:mock:${section.paperId}`).filter(attempt => attempt.sourceId === section.paperId) : [];
    return hasActiveSourceMock(sectionId, 'listening', [...local, ...(fb.stateRef.current.examAttempts || [])]);
  }
  const activeMock = sourceMockActive();
  useEffect(() => {
    if (!section?.sentences.length) return;
    const requested = search.get('sentence') || search.get('sentenceId');
    const sentenceId = requested || readExamRecovery<string>(owner, `${recoveryKey}:position`);
    const selected = Math.max(0, section.sentences.findIndex(row => row.id === sentenceId));
    const id = section.sentences[selected].id;
    setIndex(selected);
    enterRecall(id);
    writeExamRecovery(owner, `${recoveryKey}:position`, id);
    if (!requested) { const next = new URLSearchParams(search); next.set('sentence', id); setSearch(next, { replace: true, state: location.state }); }
  }, [section, search, owner, recoveryKey, setSearch]);
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
  function resetCyclePresentation() {
    setBlind(false); setBlindReplayRequest(0); blindReplayStarted.current = false; setAdvancedStep(0);
  }
  useEffect(() => { resetCyclePresentation(); setStatus(''); setSaveError(''); }, [sentence?.id]);
  const activeStep = Math.max(activeStepFor(session?.stage ?? 0), advancedStep);
  // Only the step in progress opens on its own; finished steps stay one click away.
  useEffect(() => { setOpenSteps([activeStep]); }, [activeStep, sentence?.id]);
  useEffect(() => { if(blind&&blindReplayRequest>0)audioPlayer.current?.replay(); }, [blind,blindReplayRequest]);

  function enterRecall(sentenceId: string) {
    if (accountId() !== owner) return;
    const current = sessionRef.current[sentenceId];
    if (!current?.completedAt || savedCompletionsRef.current[sentenceId] !== current.completedAt || !current.nextReviewAt || Date.parse(current.nextReviewAt) > Date.now()) return;
    const next = { ...sessionRef.current, [sentenceId]: applyIntensiveStage(current, 'review') };
    sessionRef.current = next;
    setSessions(next);
    resetCyclePresentation();
    writeExamRecovery(owner, recoveryKey, next);
  }

  function change(mutator: (value: IntensiveSession) => IntensiveSession) {
    if (!sentence || accountId() !== owner) return;
    const latest = sessionRef.current[sentence.id] || createIntensiveSession(sectionId, sentence.id);
    const changed = { ...mutator(latest), ...(search.get('planId') ? { planId: search.get('planId')! } : {}), updatedAt: stamp() };
    const next = { ...sessionRef.current, [sentence.id]: changed };
    sessionRef.current = next; setSessions(next);
    writeExamRecovery(owner, recoveryKey, next);
    setStatus('');
  }

  const save = useCallback(async (override?: SessionMap) => {
    if (accountId() !== owner || !mounted.current) return false;
    const snapshot = structuredClone(override || sessionRef.current);
    writeExamRecovery(owner, recoveryKey, snapshot);
    const pendingKey = `${recoveryKey}:pending-completions`;
    const pending = readExamRecovery<Record<string, string>>(owner, pendingKey) || {};
    Object.values(snapshot).forEach(row => {
      if (row.completedAt && savedCompletionsRef.current[row.sentenceId] !== row.completedAt) pending[row.sentenceId] = row.completedAt;
    });
    writeExamRecovery(owner, pendingKey, pending);
    setSaving(true); setSaveError('');
    const generation = ++saveGeneration.current;
    const operation = saveQueue.current.catch(() => false).then(async () => {
      if (!mounted.current || accountId() !== owner) return false;
      const draft = structuredClone(fb.stateRef.current);
      const ids = new Set(Object.values(snapshot).map(row => row.id));
      draft.intensiveSessions = [...(draft.intensiveSessions || []).filter((row: IntensiveSession) => !ids.has(row.id)), ...Object.values(snapshot)];
      let saved = false;
      let feedback = '';
      try { saved = Boolean(await fb.persistNow(draft, { collections: ['intensiveSessions', 'plans'], onError: (message: string) => { feedback = message; } })); } catch { saved = false; }
      if (!mounted.current || accountId() !== owner) return false;
      if (saved) {
        setSavedCompletions(Object.fromEntries(Object.values(snapshot).filter(row => row.completedAt).map(row => [row.sentenceId, row.completedAt!])));
        const outstanding = readExamRecovery<Record<string, string>>(owner, pendingKey) || {};
        Object.values(snapshot).forEach(row => { if (outstanding[row.sentenceId] === row.completedAt) delete outstanding[row.sentenceId]; });
        if (Object.keys(outstanding).length) writeExamRecovery(owner, pendingKey, outstanding);
        else clearExamRecovery(owner, pendingKey);
      }
      if (generation !== saveGeneration.current) return saved;
      setSaving(false);
      if (!saved) { setSaveError(`${feedback || 'Could not save progress.'} Your changes are kept on this device. Retry Save progress.`); return false; }
      if (JSON.stringify(sessionRef.current) === JSON.stringify(snapshot) && JSON.stringify(readExamRecovery(owner, recoveryKey)) === JSON.stringify(snapshot)) { clearExamRecovery(owner, recoveryKey); setStatus('Progress saved.'); }
      else setStatus('New changes waiting to save.');
      return true;
    });
    saveQueue.current = operation;
    return operation;
  }, [fb.persistNow, fb.stateRef, owner, recoveryKey]);

  function choose(next: number) {
    if (!section || next < 0 || next >= section.sentences.length) return;
    if (next === index) return;
    void save();
    enterRecall(section.sentences[next].id);
    setIndex(next);
    const params = new URLSearchParams(search);
    params.delete('sentenceId'); params.set('sentence', section.sentences[next].id);
    setSearch(params, { state: location.state });
  }
  async function recordingSaved(id: string) {
    if (!sentence || accountId() !== owner) return false;
    change(value => applyIntensiveStage({ ...value, shadowingAudioId: id }, 'shadowed'));
    return save();
  }

  function captureVocabulary(selection: SourceSelection) {
    if (accountId() !== owner || sourceMockActive() || !sentence || blind || !session?.revealed || session.dictationResult === 'pending') return;
    const seed = examVocabularySeed(selection, { catalog: catalog!, sectionId, skill: 'listening' });
    if (!seed || seed.sources.some(source => source.exam?.sentenceId !== sentence.id)) return;
    fb.setEditingVocabularyId(null);
    fb.setVocabularySeed(seed);
    fb.openModal('vocabulary');
  }

  if (loadingError) return <section className="panel intensive-workbench">{backLink}<h1>Intensive listening</h1><StateMessage kind="error" message={loadingError} onRetry={() => setRetry(value => value + 1)} retryLabel="Retry material" /></section>;
  if (!catalog) return <section className="intensive-workbench">{backLink}<PageLoadingState variant="workbench" message="Loading intensive listening material…" onRetry={() => setRetry(value => value + 1)} retryLabel="Retry material" /></section>;
  if (!section || section.skill !== 'listening') return <section className="intensive-workbench">{backLink}<StateMessage title="Listening section unavailable" /></section>;
  const hasTiming = Boolean(sentence && (session?.correctedStart ?? sentence.start) !== undefined && (session?.correctedEnd ?? sentence.end) !== undefined);
  const start = session?.correctedStart ?? sentence?.start;
  const end = session?.correctedEnd ?? sentence?.end;
  const completedCount = section.sentences.filter(row => sessions[row.id]?.completedAt && savedCompletions[row.id] === sessions[row.id].completedAt).length;
  const completionSaved = Boolean(session?.completedAt && savedCompletions[sentence?.id || ''] === session.completedAt);
  const checklist = session ? [
    { label: 'Dictation compared', done: session.dictationResult !== 'pending' },
    { label: 'Shadowing saved', done: Boolean(session.shadowingAudioId) },
    { label: 'Blind replay completed', done: Boolean(session.blindReplayDone) },
    { label: 'Self rating selected', done: Boolean(session.selfRating) },
  ] : [];
  const stepTargets = ['intensive-player', blind ? 'intensive-player' : 'intensive-dictation', 'intensive-shadow', 'intensive-review'];
  const finishedStep = session ? finishedStepFor(session.stage) : 0;
  const stepState = (number: number): StepState => number <= finishedStep ? 'done' : number === activeStep ? 'current' : number === finishedStep + 1 ? 'ready' : 'locked';
  const stepProps = (number: number) => ({ number, state: stepState(number), open: openSteps.includes(number), onOpenChange: (open: boolean) => setOpenSteps(current => open ? [...new Set([...current, number])] : current.filter(step => step !== number)) });
  const hiddenWhileBlind = <p className="intensive-action-hint">Hidden while you re-listen without the transcript.</p>;

  return <section className="intensive-workbench">
    <header className="intensive-header"><div>{backLink}<h2>{catalog.papers.find(paper => paper.id === section.paperId)?.title || 'Listening'} · {section.title}</h2><div className="intensive-progress"><p>{completedCount} / {section.sentences.length} sentences completed</p>{status && <span className={`intensive-save-status ${status === 'Progress saved.' ? 'is-saved' : ''}`} role="status">{status}</span>}</div></div><button className="btn line" disabled={saving || !sentence} onClick={() => void save()}><Save size={16} />{saving ? 'Saving…' : 'Save progress'}</button></header>
    <ol className="intensive-stages" aria-label="Intensive listening method">{steps.map((step, stepIndex) => { const number = stepIndex + 1; const state = stepState(number); const content = <><span className="intensive-stage-number" aria-hidden="true">{state === 'done' ? <Check size={13} /> : number}</span><span className="intensive-stage-label">{step.title}</span></>; return <li key={step.title} className={state === 'done' ? 'done' : ''} title={step.stages.map(stage => stages[stage]).join(' · ')}>{sentence ? <a href={`#${stepTargets[stepIndex]}`} aria-current={activeStep === number ? 'step' : undefined} onClick={() => { if (state !== 'locked') setOpenSteps(current => [...new Set([...current, number])]); }}>{content}</a> : <div>{content}</div>}</li>; })}</ol>
    {saveError ? <p role="alert" className="audio-error">{saveError}</p> : null}
    {!section.sentences.length ? <div className="panel"><h2>Transcript unavailable</h2><p>This section has no imported sentence transcript yet. Full-track listening is available when audio has been imported; dictation comparison and sentence loops need the source transcript and timing.</p>{audioUrl ? <RecordingPlayer src={audioUrl} label="Full listening track" /> : <p role="status">{audioError || 'Listening audio unavailable.'}</p>}</div> : null}
    {sentence && session ? <div className="intensive-layout">
      <aside ref={sentencesPanel} className="panel intensive-sentences"><h2>Sentences</h2>{section.sentences.map((row, rowIndex) => { const rowStatus = sentenceStatus(sessions[row.id]); return <button key={row.id} className={`intensive-sentence ${rowIndex === index ? 'active' : ''}`} aria-current={rowIndex === index ? 'step' : undefined} onClick={() => choose(rowIndex)}><span>Sentence {rowIndex + 1}</span><span className={`intensive-sentence-status is-${rowStatus.tone}`}><span className="intensive-status-dot" aria-hidden="true" />{rowStatus.label}</span></button>; })}<p className="file-hint">Return to weak sentences after a delay, then practise without the transcript first.</p></aside>
      <div className="intensive-main">
        <IntensivePlayerPanel><div className="intensive-player-heading"><h2>Sentence {index + 1} / {section.sentences.length}</h2><SelectField aria-label="Jump to sentence" value={index} onChange={event => choose(Number(event.target.value))}>{section.sentences.map((row, rowIndex) => <option key={row.id} value={rowIndex}>Sentence {rowIndex + 1}</option>)}</SelectField></div>
          {!sentence.text.trim() ? <p role="status">Transcript unavailable for this sentence.</p> : null}
          {!hasTiming ? <p role="status">Sentence timing unavailable. Listen to the full track, or set accurate A/B points below.</p> : null}
          {audioUrl ? <IntensiveAudio ref={audioPlayer} scope={`${owner}:${sectionId}:${sentence.id}:${blind?'blind':'normal'}`} src={audioUrl} start={start} end={end} full={!hasTiming} speed={session.speed} loop={session.loop} onAvailabilityChange={setAudioReady} onPlaybackInvalidated={()=>{blindReplayStarted.current=false;}} previousDisabled={index === 0} nextDisabled={index === section.sentences.length - 1} onPrevious={() => choose(index - 1)} onNext={() => choose(index + 1)} onSpeedChange={speed => change(value => ({ ...value, speed }))} onLoopChange={loop => change(value => ({ ...value, loop }))} onReplay={() => { if (blind) blindReplayStarted.current = true; change(value => ({ ...value, replayCount: value.replayCount + 1 })); }} onSentenceEnd={() => { if (!hasTiming || blind && !blindReplayStarted.current) return; blindReplayStarted.current=false; change(value => applyIntensiveStage(value, blind ? 'blind-replayed' : 'listened')); }} /> : <div>{audioError ? <StateMessage kind="error" message={audioError} onRetry={() => setAssetRetry(value => value + 1)} retryLabel="Retry audio link" /> : !asset ? <StateMessage message="Listening audio unavailable for this section." /> : <InlineLoadingState message="Loading listening audio…" onRetry={() => setAssetRetry(value => value + 1)} retryLabel="Retry audio link" />}</div>}
        </IntensivePlayerPanel>
        <div className="panel intensive-practice-tools">
          <p className="file-hint">{session.replayCount} plays · {session.listened ? 'Blind listening completed' : 'Listen once before comparing'}</p>
          <details className="intensive-timing"><summary>Correct sentence A/B timing</summary><p>Use the seconds from the source recording. Changes apply to your learning record.</p><div className="intensive-actions"><label>A (seconds)<input aria-label="Sentence start seconds" type="number" min="0" step="0.1" value={start ?? ''} onChange={event => { const value = event.target.value === '' ? undefined : Number(event.target.value); change(row => ({ ...row, correctedStart: value })); }} /></label><label>B (seconds)<input aria-label="Sentence end seconds" type="number" min="0" step="0.1" value={end ?? ''} onChange={event => { const value = event.target.value === '' ? undefined : Number(event.target.value); change(row => ({ ...row, correctedEnd: value })); }} /></label></div>{start !== undefined && end !== undefined && end <= start ? <p role="alert">B must be later than A.</p> : null}</details>
        </div>
        <IntensiveStep id="intensive-gist" {...stepProps(1)}>{blind ? hiddenWhileBlind : <><p>Play the sentence once without the transcript and understand the situation before you write. Keep a short note if it helps.</p><label htmlFor="listening-gist">Main idea or situation</label><textarea id="listening-gist" value={session.gist} onChange={event => change(value => ({ ...value, gist: event.target.value }))} placeholder="Who is speaking? What is happening?" rows={2} /></>}</IntensiveStep>
        <IntensiveStep id="intensive-dictation" {...stepProps(2)}>{blind ? hiddenWhileBlind : <><p>Type what you hear. Keep uncertain gaps visible, then compare once you have tried.</p><label htmlFor="sentence-dictation">Sentence dictation</label><textarea id="sentence-dictation" value={session.transcriptInput} onChange={event => change(value => ({ ...value, transcriptInput: event.target.value, dictationResult: 'pending' }))} rows={3} disabled={session.stage === 6} placeholder="Write what you hear; use … for uncertain words." />
          <button className="btn primary" aria-describedby="intensive-compare-hint" disabled={saving || !session.listened || !session.transcriptInput.trim() || !sentence.text.trim() || blind} onClick={() => { change(value => applyIntensiveStage({ ...value, dictationResult: calculateDictationResult(value.transcriptInput, sentence.text) }, 'reveal')); void save(); }}>Compare with transcript</button>
          <p id="intensive-compare-hint" className="intensive-action-hint">{!session.listened ? 'Play this sentence to the end before comparing.' : !session.transcriptInput.trim() ? 'Write your first attempt before comparing.' : !sentence.text.trim() ? 'The source transcript is unavailable for comparison.' : 'Compare your attempt, then mark why you missed a word.'}</p>
          {session.revealed && !blind && session.dictationResult !== 'pending' ? <div className="dictation-comparison"><p className="dictation-text">{lcsDiff(session.transcriptInput, sentence.text).map((token, tokenIndex) => <span key={tokenIndex} className={`dictation-${token.kind}`}>{token.text} </span>)}</p><p className="file-hint"><span className="dictation-missing">Missing words</span> · <span className="dictation-extra">Extra words</span> · Result: {session.dictationResult}</p><SourceAnnotations key={`${owner}:${sectionId}:${sentence.id}`} sourceId={sectionId} skill="listening" mock={activeMock} allowedBlockIds={[`sentence:${sentence.id}`]} onVocabulary={captureVocabulary}><div className="intensive-source-transcript"><h3>Original transcript</h3><p><AnnotatedText blockId={`sentence:${sentence.id}`} text={sentence.text} version={section.provenance.contentHash || section.provenance.sourceVersion} /></p></div></SourceAnnotations><fieldset><legend>Why did you miss it?</legend>{reasons.map(reason => <label key={reason}><input type="checkbox" checked={session.errorReasons.includes(reason)} onChange={() => change(value => ({ ...value, errorReasons: value.errorReasons.includes(reason) ? value.errorReasons.filter(row => row !== reason) : [...value.errorReasons, reason] }))} />{reason}</label>)}</fieldset></div> : null}
          {session.stage === 2 && activeStep === 2 ? <div className="intensive-actions"><button className="btn primary" onClick={() => setAdvancedStep(3)}>Continue to shadowing</button></div> : null}
        </>}</IntensiveStep>
        <IntensiveStep id="intensive-shadow" {...stepProps(3)}><ShadowingRecorder key={`${owner}:${sentence.id}`} owner={owner} sectionId={sectionId} sentenceId={sentence.id} enabled={session.stage >= 2} audioId={session.shadowingAudioId} onSaved={recordingSaved} />
          <div className="intensive-actions"><button className="btn primary" aria-describedby="intensive-blind-hint" disabled={session.stage < 3 || !audioUrl || !audioReady || !hasTiming} onClick={() => { audioPlayer.current?.stop(); change(value => ({ ...value, revealed: false, blindReplayDone: false })); blindReplayStarted.current=false; setBlind(true); setBlindReplayRequest(value=>value+1); }}>Play original blind</button><button className="btn line" aria-describedby="intensive-blind-hint" disabled={session.stage < 3 || !audioUrl || blind} aria-pressed={blind} onClick={() => { audioPlayer.current?.stop(); change(value => ({ ...value, revealed: false, blindReplayDone: false })); blindReplayStarted.current = false; setBlind(true); }}>Hide transcript for blind re-listening</button></div><p id="intensive-blind-hint" className="intensive-action-hint" role={blind ? 'status' : undefined}>{blind ? 'Transcript hidden. Play the whole sentence without pausing or seeking before finishing.' : session.stage < 3 ? 'Save your shadowing recording before blind re-listening.' : !audioUrl || !audioReady ? 'Wait for the source recording to load.' : !hasTiming ? 'Set valid sentence A/B timing before blind re-listening.' : 'Play original blind hides the transcript and plays this sentence from the beginning.'}</p>
        </IntensiveStep>
        <IntensiveStep id="intensive-review" {...stepProps(4)}><p>Rate your understanding and shadowing after the blind replay. Weak sentences return sooner.</p><label htmlFor="intensive-rating">Self rating</label><SelectField id="intensive-rating" value={session.selfRating || ''} onChange={event => change(value => ({ ...value, selfRating: Number(event.target.value) as IntensiveSession['selfRating'] }))}><option value="">Choose a rating</option>{[1, 2, 3, 4, 5].map(rating => <option key={rating} value={rating}>{rating} · {['Need help', 'Difficult', 'Some gaps', 'Mostly clear', 'Clear and fluent'][rating - 1]}</option>)}</SelectField><ul className="intensive-checklist" aria-label="Sentence completion checklist">{checklist.map(item => <li key={item.label} className={item.done ? 'is-done' : ''}><span aria-hidden="true">{item.done ? <Check size={13} /> : '○'}</span>{item.label}<span className="sr-only">{item.done ? ' · Complete' : ' · Pending'}</span></li>)}</ul><div className="intensive-actions"><button className="btn primary" disabled={saving || completionSaved || !session.blindReplayDone || !session.shadowingAudioId || !session.selfRating || session.dictationResult === 'pending'} onClick={() => { if (!session.completedAt) change(value => applyIntensiveStage(value, 'complete')); void save(); }}>{saving && session.completedAt ? 'Saving review…' : completionSaved ? 'Review scheduled' : session.completedAt ? 'Retry scheduling review' : 'Finish and schedule review'}</button>{completionSaved ? <button className="btn line" onClick={() => { change(value => applyIntensiveStage(value, 'review')); resetCyclePresentation(); }}>Start blind review</button> : null}</div>
          {session.nextReviewAt ? <p role="status">Next review: {new Date(session.nextReviewAt).toLocaleDateString()} · {!completionSaved && session.completedAt ? 'Pending save' : new Date(session.nextReviewAt) <= new Date() ? 'Due now' : 'Scheduled'}</p> : null}
          {session.stage >= 2 && !blind && session.reviewHistory?.length ? <details><summary>Previous completed cycles</summary>{session.reviewHistory.map((cycle, cycleIndex) => <div key={cycleIndex}><p>{cycle.completedAt ? new Date(cycle.completedAt).toLocaleDateString() : 'Previous review'} · {cycle.dictationResult} · Rating {cycle.selfRating || '—'}</p>{cycle.shadowingAudioId ? <SessionAudioPlayer audioId={cycle.shadowingAudioId} label={`Previous shadowing ${cycleIndex + 1}`} /> : null}</div>)}</details> : null}
        </IntensiveStep>
      </div>
    </div> : null}
  </section>;
}
