// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';
import { useSpeakingSample, SpeakingSampleStatus } from './useSpeakingSample';
import { formatClock, formatDate } from '../../lib/format';
import { Empty } from '../../components/ui';
import { putAudio } from '../../storage/audio';
import { RecordingPlayer } from '../../components/SessionAudioPlayer';
import { deletePendingAudio, readPendingAudio, writePendingAudio } from '../../storage/pendingAudio';
import { accountId } from '../../storage/remote';
import { Mic, Square, Play, Pause, RotateCcw, Save, ArrowRight, Shuffle, Download } from 'lucide-react';
import { useWorkspaceDeskContext, useWorkspacePageState } from '../../lib/workspacePageState';
import { useElapsedCountdown } from '../../lib/useElapsedCountdown';
import { navigateTabs } from '../../lib/tabNavigation';
import { speakingPrompts } from '../../domain/speaking';
import { useConfirmationDialog } from '../../components/useConfirmationDialog';

function speakSecondsFor(part) {
  if (String(part) === '1') return 30;
  if (String(part) === '3') return 60;
  return 120;
}

function storySummary(story) {
  return [
    story.people && `People: ${story.people}`,
    story.place && `Place: ${story.place}`,
    story.time && `When: ${story.time}`,
    story.feeling && `Felt: ${story.feeling}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function SampleInline({ topic, part }) {
  if (String(part) !== '2') return null;
  if (!topic.sampleAnswer && !(topic.sampleNotes && topic.sampleNotes.length)) return null;
  return (
    <details className="sample-answers">
      <summary>Show a sample answer</summary>
      <p className="file-hint">Use this example to plan your own answer. In Part 2, speak for 1–2 minutes.</p>
      {topic.sampleNotes && topic.sampleNotes.length ? (
        <div className="sample-qa">
          <strong>Sample one-minute notes</strong>
          <ul>
            {topic.sampleNotes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {topic.sampleAnswer ? (
        <div className="sample-qa">
          <strong>Sample one-to-two-minute answer</strong>
          <p>{topic.sampleAnswer}</p>
        </div>
      ) : null}
    </details>
  );
}

export function SpeakingDeskPage() {
  const fb = useFieldbook();
  const topic = fb.selectedTopic;
  const sampleStatus = useSpeakingSample(topic?.id);
  const part = String(fb.deskPart);
  const owner = accountId();
  const mode = fb.currentDeskMode();
  const activePlan = fb.state.activePlanId ? fb.state.plans.find(plan => plan.id === fb.state.activePlanId) : null;
  const topicDraft = topic ? fb.speakingDraft(topic.id) : { transcript: '', notes: '' };
  const bound = activePlan?.status === 'in_progress' && String(activePlan.target?.questionId) === String(topic?.id) && String(activePlan.target?.part) === part ? activePlan.target.prompts : null;
  const prompts = bound?.length ? bound : topicDraft.targetPrompt?.part === part ? [topicDraft.targetPrompt] : speakingPrompts(topic, part);
  const qIndex = Math.min(fb.questionIndex, Math.max(0, prompts.length - 1));
  const prompt = prompts[qIndex];
  const promptKey = prompt?.promptKey;
  const questions = prompts.map(item => item.promptText);
  const scope = JSON.stringify([owner, topic?.id || '', part, promptKey || '']);
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const { confirm, dialog } = useConfirmationDialog(scope);
  const uiKey = `speaking:desk:${scope}:${mode}`;
  useWorkspaceDeskContext({skill:'speaking', id:String(topic?.id || ''), mode:fb.currentDeskMode(), part, questionIndex:fb.questionIndex}, saved => {
    fb.setSelectedTopicId(saved.id);
    if (['1','2','3'].includes(saved.part)) fb.setDeskPart(saved.part);
    if (Number.isInteger(saved.questionIndex) && saved.questionIndex >= 0) fb.setQuestionIndex(saved.questionIndex);
    fb.setActiveDeskMode(saved.mode);
  }, id => fb.state.speakingTopics.some(item => String(item.id) === id), fb.booted !== false);
  const draft = topic ? fb.speakingDraft(topic.id, promptKey) : { transcript: '', notes: '' };
  const saveStatus = topic ? fb.draftSaveStatus?.(topic.id, promptKey) || 'saved' : 'saved';
  const [transcript, setTranscript] = useState(draft.transcript || '');
  const [notes, setNotes] = useState(draft.notes || '');
  const [noteSeconds, setNoteSeconds] = useWorkspacePageState(`${uiKey}:noteSeconds`, 60, value => typeof value === 'number' && value >= 0 && value <= 60);
  const [speakSeconds, setSpeakSeconds] = useWorkspacePageState(`${uiKey}:speakSeconds`, speakSecondsFor(part), value => typeof value === 'number' && value >= 0 && value <= 120);
  const [noteRunning, setNoteRunning] = useState(false);
  const [speakRunning, setSpeakRunning] = useState(false);
  const [recording, setRecording] = useState(false);
  const [requestingMicrophone, setRequestingMicrophone] = useState(false);
  const microphoneRequestPending = useRef(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [micError, setMicError] = useState(null);
  const [phase, setPhase] = useWorkspacePageState(`${uiKey}:phase`, part === '2' ? 'prepare' : 'answer', value => ['prepare', 'answer', 'playback'].includes(value));
  const [mobileTab, setMobileTab] = useWorkspacePageState(`${uiKey}:mobileTab`, 'practice', value => value === 'practice' || value === 'prompt');
  const [notesOpen, setNotesOpen] = useWorkspacePageState(`${uiKey}:notesOpen`, part === '2', value => typeof value === 'boolean');
  const [uploadError, setUploadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [audioSaved, setAudioSaved] = useState(false);
  const [legacyAudio, setLegacyAudio] = useState(null);
  const [legacyAudioUrl, setLegacyAudioUrl] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const activeCapture = useRef(null);
  const microphoneGeneration = useRef(0);

  const resetRecording = () => {
    microphoneGeneration.current += 1;
    microphoneRequestPending.current = false;
    setRequestingMicrophone(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        const recorder = mediaRecorderRef.current;
        const capture = activeCapture.current;
        const chunks = chunksRef.current;
        recorder.onstop = () => {
          if (capture && chunks.length) void writePendingAudio(capture.owner, capture.topicId, capture.part, new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), capture.promptKey);
        };
        mediaRecorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    activeCapture.current = null;
    setRecording(false);
    setAudioBlob(null);
    setAudioSaved(false);
    setUploading(false);
    setUploadError(false);
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const clearRecording = () => {
    if (topic) void deletePendingAudio(owner, topic.id, part, promptKey);
    resetRecording();
  };

  useEffect(() => {
    if (!topic) return;
    const d = fb.speakingDraft(topic.id, promptKey);
    setTranscript(d.transcript || '');
    setNotes(d.notes || '');
    setNoteRunning(false);
    setSpeakRunning(false);
    resetRecording();
    setMicError(null);
    let active = true;
    void readPendingAudio(owner, topic.id, part, promptKey).then((blob) => {
      if (!active || !blob || owner !== accountId() || scopeRef.current !== scope) return;
      setAudioBlob(blob);
      setAudioUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
      setAudioSaved(false);
      setPhase('playback');
    });
    return () => { active = false; };
  }, [scope]);

  useEffect(() => {
    setLegacyAudio(null); setLegacyAudioUrl(null);
    let active = true; let url = null;
    if (topic) void readPendingAudio(owner, topic.id, part).then(blob => {
      if (!active || owner !== accountId() || !blob) return;
      url = URL.createObjectURL(blob); setLegacyAudio(blob); setLegacyAudioUrl(url);
    });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [owner, topic?.id, part]);

  useEffect(() => {
    if (!topic) return;
    const recovered = fb.speakingDraft(topic.id, promptKey);
    setTranscript(recovered.transcript || '');
    setNotes(recovered.notes || '');
  }, [fb.draftRevision]);

  useEffect(() => () => resetRecording(), []);

  useEffect(() => { setNoteRunning(false); setSpeakRunning(false); }, [uiKey, owner]);

  useEffect(() => {
    if (!recording && !audioBlob) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = 'Your recording has not been uploaded yet.';
      return event.returnValue;
    };
    window.addEventListener('beforeunload', warn);
    const guardLink = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!link || link.hasAttribute('download') || link.hasAttribute('data-practice-navigation') || link.target === '_blank') return;
      const destination = new URL(link.href, window.location.href);
      if (destination.protocol === 'blob:' || destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      event.preventDefault(); event.stopPropagation();
      void confirm({ title: 'Leave speaking practice?', description: 'Your recording will stay available for this question.', confirmLabel: 'Leave practice' }).then(accepted => {
        if (!accepted || scopeRef.current !== scope || owner !== accountId()) return;
        keepCurrentDraft();
        if (destination.origin === window.location.origin) fb.navigate(`${destination.pathname}${destination.search}${destination.hash}`);
        else window.location.assign(destination.href);
      });
    };
    document.addEventListener('click', guardLink, true);
    const guardRequest = event => {
      if (event.defaultPrevented || audioSaved && !recording) return;
      event.preventDefault();
      void confirm({ title: 'Leave speaking practice?', description: 'Your recording will stay available for this question.', confirmLabel: 'Leave practice' }).then(accepted => {
        if (accepted && scopeRef.current === scope && owner === accountId()) { keepCurrentDraft(); event.detail?.proceed(); }
      });
    };
    document.addEventListener('fieldbook:before-navigate', guardRequest);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', guardLink, true); document.removeEventListener('fieldbook:before-navigate', guardRequest); };
  }, [audioBlob, audioSaved, recording, scope, transcript, notes]);

  useElapsedCountdown({
    seconds: noteSeconds, running: noteRunning, scope: JSON.stringify([owner, uiKey]), setSeconds: setNoteSeconds,
    onComplete: () => { setNoteRunning(false); setNotesOpen(false); setPhase('answer'); fb.toast('Note time is up.'); },
  });
  useElapsedCountdown({
    seconds: speakSeconds, running: speakRunning, scope: JSON.stringify([owner, uiKey]), setSeconds: setSpeakSeconds,
    onComplete: () => {
      setSpeakRunning(false);
      setPhase(audioBlob ? 'playback' : 'answer');
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      fb.toast('Time is up. Write what you said.');
    },
  });

  const blind = mode === 'speak-blind';
  const mockMode = activePlan && activePlan.kind === 'speaking-mock';
  const hideAids = blind || mockMode;

  const attempts = useMemo(() => {
    if (!topic) return [];
    return fb.state.sessions
      .filter((session) => session.skill === 'speaking' && String(session.questionId) === String(topic.id) && session.essay)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [fb.state.sessions, topic]);

  const stories = topic
    ? (fb.state.stories || []).filter((story) => (story.topicIds || []).includes(topic.id))
    : [];

  const liveSave = (patch) => {
    if (!topic) return;
    if (owner !== accountId() || scopeRef.current !== scope) return;
    const changed = fb.setSpeakingDraft(topic.id, { ...prompt, ...patch, practiceMode: mode, targetErrorIds: draft.targetErrorIds || [] });
    if (changed !== false) fb.scheduleDraftPersist();
  };

  const keepCurrentDraft = () => { liveSave({ transcript, notes }); fb.flushDraftPersist(); setNoteRunning(false); setSpeakRunning(false); };

  const randomTopic = async () => {
    if (audioBlob && !await confirm({ title: 'Change topic?', description: 'Your recording will stay available for this question.', confirmLabel: 'Change topic' })) return;
    if (scopeRef.current !== scope || owner !== accountId()) return;
    const topics = fb.state.speakingTopics || [];
    const wanted = part === '3' ? '2' : part;
    const pool =
      wanted === '3' || part === '3'
        ? topics.filter((t) => Number(t.part) === 2)
        : topics.filter((t) => String(t.part) === wanted);
    const usable = pool.filter((t) => !t.incomplete);
    const list = usable.length ? usable : pool.length ? pool : topics;
    if (!list.length) return;
    const next = list[Math.floor(Math.random() * list.length)];
    keepCurrentDraft(); fb.setSelectedTopicId(String(next.id));
    fb.setQuestionIndex(0);
  };

  const finishAttempt = async (transcriptOnly = false) => {
    if (recording || uploading) return;
    const text = String(transcript || '').trim();
    if (!text) { fb.toast('Nothing written yet.'); return; }
    liveSave({ transcript, notes });
    const attemptId = crypto.randomUUID();
    const generation = microphoneGeneration.current;
    const stillCurrent = () => owner === accountId() && generation === microphoneGeneration.current && scopeRef.current === scope;
    let audioId = null;
    if (audioBlob && !transcriptOnly) {
      setUploading(true);
      setUploadError(false);
      try {
        await writePendingAudio(owner, topic.id, part, audioBlob, promptKey);
        if (!stillCurrent()) return;
        await putAudio(attemptId, audioBlob, owner);
        if (!stillCurrent()) return;
        audioId = attemptId; setAudioSaved(true);
      }
      catch {
        if (!stillCurrent()) return;
        setUploadError(true);
        fb.toast('Recording upload failed. Your recording is still available here.');
        return;
      } finally { if (stillCurrent()) setUploading(false); }
    }
    if (!stillCurrent()) return;
    const currentDraft = fb.speakingDraft(topic.id, promptKey);
    fb.setPendingAttempt({
      id: attemptId, essay: text, notes, part, question: topic, owner, ...prompt,
      parentSessionId: currentDraft.parentSessionId || null,
      planId: fb.state.activePlanId, skill: 'speaking', audioId,
      practiceMode: mode, targetErrorIds: currentDraft.targetErrorIds || [],
    });
    fb.openModal('save');
  };

  if (!topic) {
    return (
      <section className="view active">
          <Empty message="Speaking questions are unavailable. Please try again later." />
      </section>
    );
  }

  return (
    <section className="view active speaking-workspace">
      {dialog}
      <div className="page-tools desk-tools">
        <p>
          {mockMode
            ? 'Timed speaking mock. Record your answers and enter a transcript.'
            : part === '2' ? 'One minute to prepare, then two minutes to answer.' : 'Answer the question, then review your transcript.'}
        </p>
        <div className="desk-controls">
          {mockMode ? (
            <span className="pill blue">Part {part}</span>
          ) : (
            <div className="segment" role="tablist" aria-label="Speaking part">
              {['1', '2', '3'].map((p) => (
                <button
                  key={p}
                  className={`btn ${part === p ? 'primary' : 'line'}`}
                  type="button"
                  role="tab"
                  aria-selected={part === p}
                  tabIndex={part === p ? 0 : -1}
                  onKeyDown={navigateTabs}
                  disabled={recording || uploading}
                  onClick={async () => {
                    if (p === part) return;
                    if (audioBlob && !await confirm({ title: 'Change speaking part?', description: 'Your recording will stay available for this question.', confirmLabel: 'Change part' })) return;
                    if (scopeRef.current !== scope || owner !== accountId()) return;
                    keepCurrentDraft();
                    const wantedPart = p === '3' ? '2' : p;
                    if (String(topic.part) !== wantedPart) {
                      const next = fb.state.speakingTopics.find(item => String(item.part) === wantedPart && !item.incomplete) || fb.state.speakingTopics.find(item => String(item.part) === wantedPart);
                      if (!next) { fb.toast(`Part ${p} topics are unavailable.`); return; }
                      fb.setSelectedTopicId(String(next.id));
                    }
                    fb.setDeskPart(p);
                    if (p === '1' || p === '3') fb.setQuestionIndex(0);
                    setNoteRunning(false);
                    setSpeakRunning(false);
                  }}
                >
                  Part {p}
                </button>
              ))}
            </div>
          )}
          {!mockMode ? (
            <button className="btn text" type="button" onClick={randomTopic} disabled={recording || uploading}>
              <Shuffle size={16} /> Another question
            </button>
          ) : null}
        </div>
      </div>
      <div className="mobile-desk-tabs" role="tablist" aria-label="Speaking workspace">
        {['prompt', 'practice'].map(tab => <button key={tab} id={`speaking-tab-${tab}`} className={mobileTab === tab ? 'active' : ''} type="button" role="tab" tabIndex={mobileTab === tab ? 0 : -1} aria-selected={mobileTab === tab} aria-controls={`speaking-${tab}`} onKeyDown={navigateTabs} onClick={() => setMobileTab(tab)}>{tab === 'prompt' ? 'Prompt' : 'Practice'}</button>)}
      </div>
      <ol className="speaking-phases" aria-label="Speaking practice phase">
        {(part === '2' ? ['prepare', 'answer', 'playback'] : ['answer', 'playback']).map((item, index) => <li key={item} aria-current={(phase === 'record' ? 'answer' : phase) === item ? 'step' : undefined}><span>{index + 1}</span>{item === 'prepare' ? 'Prepare' : item === 'answer' ? recording ? 'Recording' : 'Answer' : 'Review'}</li>)}
      </ol>
      <div className="desk-grid">
        <div className={`prompt${mobileTab === 'prompt' ? ' mobile-active' : ''}`} id="speaking-prompt">
          <span className="pill blue">Part {part}</span>
          <h3>{topic.title}</h3>
          <div className="prompt-body">
            {part === '1' || part === '3' ? (
              (questions.length ? questions : part === '3' ? ['Take the long turn a step further.'] : [topic.title]).map(
                (item, index) => (
                  <button
                    key={index}
                    className={`speak-q${index === qIndex ? ' current' : ''}`}
                    type="button"
                    aria-pressed={index === qIndex}
                    disabled={recording || uploading}
                    onClick={() => {
                      keepCurrentDraft(); fb.setQuestionIndex(index);
                      setSpeakRunning(false);
                    }}
                  >
                    {index + 1}. {item}
                  </button>
                ),
              )
            ) : (
              <div className="cue-card">
                <strong>{(prompt?.promptText || topic.cueCard || topic.title).split('\n')[0]}</strong>
                {prompt?.promptText.split('\n').length > 1 ? (
                  <ul>
                    {prompt.promptText.split('\n').slice(1).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
            {!hideAids && part === '2' && !speakRunning ? <SampleInline topic={topic} part={part} /> : null}
            {!hideAids && !speakRunning ? <SpeakingSampleStatus {...sampleStatus} /> : null}
          </div>
          <div className="prompt-tip">
            {part === '1'
              ? 'Part 1: about 20–30 seconds each. The timer restarts on the next question.'
              : part === '3'
                ? 'Part 3: about a minute each.'
                : hideAids
                  ? mockMode
                    ? 'Mock exam. No samples or earlier answers on this side.'
                    : 'No notes this time.'
                  : 'Part 2: one minute for notes, then two minutes to speak.'}
          </div>
          {!hideAids && stories.length ? (
            <div className="question-history history-flush">
              <div className="history-head">
                <h4>Stories</h4>
              </div>
              {stories.map((story) => (
                <div className="linked-story" key={story.id}>
                  <h4>{story.title || 'Untitled story'}</h4>
                  <p>{storySummary(story)}</p>
                </div>
              ))}
            </div>
          ) : null}
          <div className="question-history">
            <div className="history-head">
              <h4>Earlier attempts</h4>
              <span>{attempts.length === 1 ? '1 attempt' : `${attempts.length} attempts`}</span>
            </div>
            <div className="history-list">
              {attempts.length ? (
                attempts.map((session, index) => (
                  <div className="history-item" key={session.id}>
                    <div className="history-meta">
                      <span>{formatDate(session.date, true)}</span>
                      <span>
                        {session.words} words · Part {session.part || ''} · {attempts.length - index}
                      </span>
                    </div>
                    <p className="file-hint">{session.promptText || 'Unassociated earlier response'}</p>
                    {!hideAids ? <p>{session.essay}</p> : null}
                    <div className="history-actions">
                      <button
                        className="btn line"
                        type="button"
                        onClick={() => {
                          fb.setViewedSession(session);
                          fb.openModal('history');
                        }}
                      >
                        View
                      </button>
                      {!hideAids ? (
                        <button
                          className="btn line"
                          type="button"
                          disabled={uploading || requestingMicrophone}
                          onClick={async () => {
                            await fb.startTargetedPractice(session);
                          }}
                        >
                          Continue
                        </button>
                      ) : null}
                      {session.assessmentId ? (
                        <button
                          className="btn line"
                          type="button"
                          onClick={async () => {
                            if (audioBlob && !await confirm({ title: 'Leave speaking practice?', description: 'Your recording will stay available for this question.', confirmLabel: 'Leave practice' })) return;
                            if (scopeRef.current !== scope || owner !== accountId()) return;
                            keepCurrentDraft();
                            fb.navigate(`/review/${session.assessmentId}`);
                          }}
                        >
                          Score
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty">Nothing spoken yet.</div>
              )}
            </div>
          </div>
        </div>
        <div className={`editor${recording ? ' is-recording' : ''}${mobileTab === 'practice' ? ' mobile-active' : ''}`} id="speaking-practice">
          <div className="speaking-current-prompt">
            <span className="pill blue">Part {part}</span>
            <p>{prompt?.promptText || topic.title}</p>
          </div>
          {part === '2' && !hideAids ? (
            <details className="editor-block preparation-notes" open={notesOpen} onToggle={event => setNotesOpen(event.currentTarget.open)}>
              <summary className="editor-head">
                <h3>One-minute notes</h3>
                <span className={`timer${noteRunning ? ' is-live' : ''}`}>{formatClock(noteSeconds)}</span>
              </summary>
              <div className="editor-bar">
                <span className="count">Glance at these while you speak</span>
                <div className="btn-row">
                  <button className="btn line" type="button" disabled={recording} onClick={() => { setPhase('prepare'); setSpeakRunning(false); if (!noteSeconds) setNoteSeconds(60); setNoteRunning((r) => !r); }}>
                    {noteRunning ? 'Pause notes' : 'Start notes'}
                  </button>
                  <button
                    className="btn line"
                    type="button"
                    onClick={() => {
                      const linked = stories
                        .map((story) =>
                          [
                            story.title && `Title: ${story.title}`,
                            story.people && `People: ${story.people}`,
                            story.place && `Place: ${story.place}`,
                            story.time && `Time: ${story.time}`,
                            story.event && `Event: ${story.event}`,
                            story.feeling && `Feeling: ${story.feeling}`,
                          ]
                            .filter(Boolean)
                            .join('\n'),
                        )
                        .filter(Boolean)
                        .join('\n\n');
                      if (!linked) {
                        fb.toast('This topic has no story yet.');
                        return;
                      }
                      setNotes(linked);
                      liveSave({ notes: linked });
                      fb.toast('Story notes added.');
                    }}
                  >
                    Use story notes
                  </button>
                </div>
              </div>
              <textarea
                className="notes-area"
                aria-label="Preparation notes"
                placeholder="Notes for this question…"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  liveSave({ notes: e.target.value, transcript });
                }}
              />
              <button className="btn line prepare-complete" type="button" onClick={() => { setNoteRunning(false); setNotesOpen(false); setPhase('answer'); if (!speakSeconds) setSpeakSeconds(speakSecondsFor(part)); setSpeakRunning(true); }} disabled={recording}><Play size={16} /> Start answer</button>
            </details>
          ) : null}
          <div className="editor-head">
            <h3>What you said</h3>
            <span className={`timer${speakRunning ? ' is-live' : ''}`}>{formatClock(speakSeconds)}</span>
          </div>
          <div className="editor-bar">
            <span className="count">{fb.wordCount(transcript)} words</span>
            <div className="btn-row">
              <button className="btn line" type="button" disabled={recording} onClick={() => { setNoteRunning(false); setNotesOpen(false); setPhase('answer'); if (!speakSeconds) setSpeakSeconds(speakSecondsFor(part)); setSpeakRunning((r) => !r); }}>
                {speakRunning ? <Pause size={16} /> : <Play size={16} />}{speakRunning ? 'Pause' : 'Start timer'}
              </button>
              <button
                className="btn line"
                type="button"
                onClick={() => {
                  setNoteRunning(false);
                  setSpeakRunning(false);
                  setNoteSeconds(60);
                  setSpeakSeconds(speakSecondsFor(part));
                  setPhase(part === '2' ? 'prepare' : 'answer');
                  setNotesOpen(part === '2');
                }}
                disabled={recording}
              >
                <RotateCcw size={16} /> Reset
              </button>
            </div>
          </div>
          <div className={`rec-strip${recording ? ' is-live' : ''}${audioBlob ? ' is-ready' : ''}`} role="status">
            <span className="rec-dot" aria-hidden="true" />
            <span className="rec-label">
              {recording ? 'Recording' : requestingMicrophone ? 'Waiting for microphone' : audioBlob ? 'Recording ready' : 'Microphone off'}
            </span>
            <div className="btn-row">
              {!recording ? (
                <button
                  className="btn line"
                  type="button"
                  disabled={uploading || requestingMicrophone}
                  onClick={async () => {
                    if (microphoneRequestPending.current) return;
                    if (audioBlob && !await confirm({ title: 'Replace recording?', description: 'The current recording will be replaced when the microphone starts.', confirmLabel: 'Replace recording', destructive: true })) return;
                    if (scopeRef.current !== scope || owner !== accountId()) return;
                    setSpeakRunning(false);
                    setMicError(null);
                    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
                      setMicError('This browser cannot record. You can still type the transcript.');
                      return;
                    }
                    const captureOwner = owner;
                    const generation = microphoneGeneration.current;
                    let requestedStream = null;
                    let requestedRecorder = null;
                    microphoneRequestPending.current = true;
                    setRequestingMicrophone(true);
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                      requestedStream = stream;
                      if (generation !== microphoneGeneration.current || captureOwner !== accountId() || scopeRef.current !== scope) { stream.getTracks().forEach(track => track.stop()); return; }
                      const recorder = new MediaRecorder(stream);
                      requestedRecorder = recorder;
                      recorder.start();
                      // Replace recoverable audio only once a new recording has started.
                      if (audioBlob) void deletePendingAudio(captureOwner, topic.id, part, promptKey);
                      resetRecording();
                      streamRef.current = stream;
                      chunksRef.current = [];
                      activeCapture.current = { owner: captureOwner, topicId: topic.id, part, promptKey };
                      const recordingGeneration = microphoneGeneration.current;
                      const chunks = chunksRef.current;
                      mediaRecorderRef.current = recorder;
                      recorder.ondataavailable = (event) => {
                        if (event.data && event.data.size) chunks.push(event.data);
                      };
                      recorder.onstop = () => {
                        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
                        void writePendingAudio(captureOwner, topic.id, part, blob, promptKey);
                        stream.getTracks().forEach(track => track.stop());
                        if (captureOwner !== accountId() || scopeRef.current !== scope || recordingGeneration !== microphoneGeneration.current) return;
                        setAudioBlob(blob);
                        setAudioUrl((prev) => {
                          if (prev) URL.revokeObjectURL(prev);
                          return URL.createObjectURL(blob);
                        });
                        if (streamRef.current) {
                          streamRef.current = null;
                        }
                        setRecording(false);
                        setSpeakRunning(false);
                        setPhase('playback');
                      };
                      setRecording(true);
                      setPhase('record');
                      setNotesOpen(false);
                      setNoteRunning(false);
                      setSpeakSeconds(speakSecondsFor(part));
                      setSpeakRunning(true);
                      setUploadError(false);
                      setAudioSaved(false);
                    } catch (error) {
                      try { if (requestedRecorder?.state === 'recording') requestedRecorder.stop(); } catch { /* Release tracks even when the recorder cannot stop. */ }
                      requestedStream?.getTracks().forEach(track => track.stop());
                      if (generation !== microphoneGeneration.current || captureOwner !== accountId() || scopeRef.current !== scope) return;
                      setMicError(error?.name === 'NotAllowedError' || error?.name === 'SecurityError' ? 'Microphone permission was denied. You can still type the transcript.' : error?.name === 'NotFoundError' ? 'No microphone was found. Connect one and retry, or type the transcript.' : error?.name === 'NotReadableError' ? 'The microphone is unavailable or in use. Retry, or type the transcript.' : 'Recording could not start. Retry, or type the transcript.');
                    } finally {
                      if (captureOwner === accountId() && scopeRef.current === scope) { microphoneRequestPending.current = false; setRequestingMicrophone(false); }
                    }
                  }}
                >
                  <Mic size={16} />{requestingMicrophone ? 'Opening microphone...' : audioBlob ? 'Re-record' : 'Record'}
                </button>
              ) : (
                <button
                  className="btn warn"
                  type="button"
                  onClick={() => {
                    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                      mediaRecorderRef.current.stop();
                    }
                  }}
                >
                  <Square size={16} /> Stop
                </button>
              )}
              {audioBlob ? (
                <button className="btn line" type="button" onClick={async () => { if (await confirm({ title: 'Clear recording?', description: 'This question recording will be removed.', confirmLabel: 'Clear recording', destructive: true })) { clearRecording(); setPhase('answer'); } }} disabled={uploading}>
                  Clear audio
                </button>
              ) : null}
            </div>
          </div>
          {micError ? <p className="file-hint warn-note" role="alert">{micError}</p> : null}
          {topicDraft.transcript || topicDraft.notes || topicDraft.text || legacyAudio ? <details className="editor-block"><summary>Unassociated earlier response</summary>{topicDraft.transcript || topicDraft.text ? <p>{topicDraft.transcript || topicDraft.text}</p> : null}{topicDraft.notes ? <p>{topicDraft.notes}</p> : null}{legacyAudioUrl ? <><RecordingPlayer src={legacyAudioUrl} label="Unassociated earlier recording" /><a className="btn line" href={legacyAudioUrl} download="ielts-earlier-recording.webm"><Download size={16} /> Download earlier recording</a></> : null}<button className="btn line" type="button" disabled={recording || uploading || requestingMicrophone} onClick={async () => {
            if (!await confirm({ title: 'Associate earlier response?', description: `Use the earlier response for: ${prompt.promptText}`, confirmLabel: 'Associate response' })) return;
            if (scopeRef.current !== scope || owner !== accountId()) return;
            const text = topicDraft.transcript || topicDraft.text || '';
            if (text || topicDraft.notes) { setTranscript(text); setNotes(topicDraft.notes || ''); liveSave({ transcript: text, notes: topicDraft.notes || '', parentSessionId: topicDraft.parentSessionId }); }
            if (legacyAudio) { await writePendingAudio(owner, topic.id, part, legacyAudio, promptKey); if (scopeRef.current !== scope || owner !== accountId()) return; setAudioBlob(legacyAudio); setAudioUrl(previous => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(legacyAudio); }); setAudioSaved(false); setPhase('playback'); }
          }}>Associate with current question</button></details> : null}
          {audioUrl ? <RecordingPlayer src={audioUrl} label="Current recording" onPlaybackChange={() => setPhase('playback')} /> : null}
          {uploadError ? <div className="recording-upload-error" role="alert"><p>The recording could not upload. It remains available until you leave this practice.</p><div className="btn-row"><button className="btn line" disabled={uploading} onClick={() => finishAttempt()}><RotateCcw size={16} /> Retry upload</button>{audioUrl ? <a className="btn line" href={audioUrl} download="ielts-recording.webm"><Download size={16} /> Download recording</a> : null}<button className="btn line" disabled={uploading} onClick={() => finishAttempt(true)}>Continue with transcript only</button></div></div> : null}
          <textarea
            aria-label="Speaking transcript"
            placeholder={
              audioBlob
                ? 'Write what you said. Pronunciation stays unscored in the Markdown score request.'
                : 'Write what you said. Without a recording, pronunciation cannot be scored.'
            }
            value={transcript}
            onChange={(e) => {
              setTranscript(e.target.value);
              liveSave({ transcript: e.target.value, notes });
            }}
          />
          <div className="editor-foot">
            <p role="status">{uploading ? 'Uploading recording...' : saveStatus === 'failed' || saveStatus === 'error' ? 'Draft could not be saved.' : saveStatus === 'unsaved' ? 'Draft has unsaved changes.' : saveStatus === 'pending' ? 'Waiting to save draft...' : saveStatus === 'saving' ? 'Saving draft...' : saveStatus === 'saved' ? 'Draft saved.' : 'Autosave enabled.'} {audioBlob && !audioSaved ? 'Recording has not been uploaded.' : audioSaved ? 'Recording saved to your account.' : ''}</p>
            <div>
              <button
                className="btn line"
                type="button"
                onClick={async () => {
                  liveSave({ transcript, notes });
                  const pending = fb.flushDraftPersist();
                  const saved = await (pending ?? fb.persistNow(undefined, { collections: ['drafts'] }));
                  if (saved) fb.toast('Draft saved.');
                }}
              >
                <Save size={16} /> {saveStatus === 'failed' || saveStatus === 'error' ? 'Retry save' : 'Save draft'}
              </button>
              <button
                className="btn primary"
                type="button"
                disabled={recording || uploading}
                onClick={() => finishAttempt()}
              >
                {uploading ? 'Uploading...' : 'Finish practice'} <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
