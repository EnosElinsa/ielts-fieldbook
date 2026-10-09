// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';
import { formatClock, formatDate } from '../../lib/format';
import { Empty } from '../../components/ui';
import { putAudio } from '../../storage/audio';
import { RecordingPlayer } from '../../components/SessionAudioPlayer';
import { deletePendingAudio, readPendingAudio, writePendingAudio } from '../../storage/pendingAudio';
import { accountId } from '../../storage/remote';
import { Mic, Square, Play, Pause, RotateCcw, Save, ArrowRight, Shuffle, Download } from 'lucide-react';

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
      <p className="file-hint">A sample for shape, not for memorising. A Part 2 answer is about one or two minutes.</p>
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
  const part = String(fb.deskPart);
  const owner = accountId();
  const draft = topic ? fb.speakingDraft(topic.id) : { transcript: '', notes: '' };
  const [transcript, setTranscript] = useState(draft.transcript || '');
  const [notes, setNotes] = useState(draft.notes || '');
  const [noteSeconds, setNoteSeconds] = useState(60);
  const [speakSeconds, setSpeakSeconds] = useState(speakSecondsFor(part));
  const [noteRunning, setNoteRunning] = useState(false);
  const [speakRunning, setSpeakRunning] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [micError, setMicError] = useState(null);
  const [phase, setPhase] = useState(part === '2' ? 'prepare' : 'answer');
  const [uploadError, setUploadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [audioSaved, setAudioSaved] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const activeCapture = useRef(null);

  const resetRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        const recorder = mediaRecorderRef.current;
        const capture = activeCapture.current;
        const chunks = chunksRef.current;
        recorder.onstop = () => {
          if (capture && chunks.length) void writePendingAudio(capture.owner, capture.topicId, capture.part, new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
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
    setUploadError(false);
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const clearRecording = () => {
    if (topic) void deletePendingAudio(owner, topic.id, part);
    resetRecording();
  };

  useEffect(() => {
    if (!topic) return;
    const d = fb.speakingDraft(topic.id);
    setTranscript(d.transcript || '');
    setNotes(d.notes || '');
    setNoteSeconds(60);
    setSpeakSeconds(speakSecondsFor(fb.deskPart));
    setNoteRunning(false);
    setSpeakRunning(false);
    resetRecording();
    setMicError(null);
    setPhase(String(fb.deskPart) === '2' ? 'prepare' : 'answer');
    let active = true;
    void readPendingAudio(owner, topic.id, String(fb.deskPart)).then((blob) => {
      if (!active || !blob || owner !== accountId()) return;
      setAudioBlob(blob);
      setAudioUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
      setAudioSaved(false);
      setPhase('playback');
    });
    return () => { active = false; };
  }, [topic?.id, fb.deskPart, owner]);

  useEffect(() => {
    if (!topic) return;
    const recovered = fb.speakingDraft(topic.id);
    setTranscript(recovered.transcript || '');
    setNotes(recovered.notes || '');
  }, [fb.draftRevision]);

  useEffect(() => () => resetRecording(), []);

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
      if (!link || link.hasAttribute('download') || link.target === '_blank') return;
      const destination = new URL(link.href, window.location.href);
      if (destination.protocol === 'blob:' || destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (!window.confirm('This recording has not been uploaded. Leave this practice and discard it?')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('click', guardLink, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', guardLink, true); };
  }, [audioBlob, audioSaved, recording]);

  useEffect(() => {
    if (!noteRunning) return undefined;
    const id = window.setInterval(() => {
      setNoteSeconds((s) => {
        if (s <= 1) {
          setNoteRunning(false);
          setPhase('answer');
          fb.toast('Note time is up.');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [noteRunning, fb]);

  useEffect(() => {
    if (!speakRunning) return undefined;
    const id = window.setInterval(() => {
      setSpeakSeconds((s) => {
        if (s <= 1) {
          setSpeakRunning(false);
          setPhase(audioBlob ? 'playback' : 'answer');
          if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
          fb.toast('Time is up. Write what you said.');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [speakRunning, fb, audioBlob]);

  const mode = fb.currentDeskMode();
  const blind = mode === 'speak-blind';
  const activePlan = fb.state.activePlanId
    ? fb.state.plans.find((plan) => plan.id === fb.state.activePlanId)
    : null;
  const mockMode = activePlan && activePlan.kind === 'speaking-mock';
  const hideAids = blind || mockMode;
  const questions =
    part === '1'
      ? (topic?.questions || [topic?.title]).filter(Boolean)
      : part === '3'
        ? topic?.part3 || topic?.questions || []
        : [];
  const qIndex = Math.min(fb.questionIndex, Math.max(0, questions.length - 1));

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
    fb.setSpeakingDraft(topic.id, { ...patch, practiceMode: mode, targetErrorIds: draft.targetErrorIds || [] });
    fb.scheduleDraftPersist();
  };

  const randomTopic = () => {
    if (audioBlob && !window.confirm('This recording has not been uploaded. Change question and discard it?')) return;
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
    fb.setSelectedTopicId(String(next.id));
    fb.setQuestionIndex(0);
  };

  const finishAttempt = async (transcriptOnly = false) => {
    if (recording || uploading) return;
    const text = String(transcript || '').trim();
    if (!text) { fb.toast('Nothing written yet.'); return; }
    liveSave({ transcript, notes });
    const attemptId = crypto.randomUUID();
    let audioId = null;
    if (audioBlob && !transcriptOnly) {
      setUploading(true);
      setUploadError(false);
      try { await writePendingAudio(owner, topic.id, part, audioBlob); await putAudio(attemptId, audioBlob); audioId = attemptId; setAudioSaved(true); }
      catch {
        setUploadError(true);
        fb.toast('Recording upload failed. Your recording is still available here.');
        return;
      } finally { setUploading(false); }
    }
    const currentDraft = fb.speakingDraft(topic.id);
    fb.setPendingAttempt({
      id: attemptId, essay: text, notes, part, question: topic,
      parentSessionId: currentDraft.parentSessionId || null,
      planId: fb.state.activePlanId, skill: 'speaking', audioId,
      practiceMode: mode, targetErrorIds: currentDraft.targetErrorIds || [],
    });
    fb.openModal('save');
  };

  if (!topic) {
    return (
      <section className="view active">
          <Empty message="The speaking bank did not load. Sign in again after the question catalog has been seeded." />
      </section>
    );
  }

  return (
    <section className="view active speaking-workspace">
      <div className="page-tools desk-tools">
        <p>
          {mockMode
            ? 'Timed mock. Record if you can, then write what you said.'
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
                  disabled={recording || uploading}
                  onClick={() => {
                    if (p !== part && audioBlob && !window.confirm('This recording has not been uploaded. Change part and discard it?')) return;
                    fb.setDeskPart(p);
                    if (p === '1' || p === '3') fb.setQuestionIndex(0);
                    setSpeakSeconds(speakSecondsFor(p));
                    setNoteSeconds(60);
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
      <ol className="speaking-phases" aria-label="Speaking practice phase">
        {['prepare', 'answer', 'record', 'playback'].map((item, index) => <li key={item} aria-current={phase === item ? 'step' : undefined}><span>{index + 1}</span>{item === 'prepare' ? 'Prepare' : item === 'answer' ? 'Answer' : item === 'record' ? 'Record' : 'Playback'}</li>)}
      </ol>
      <div className="desk-grid">
        <div className="prompt">
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
                      fb.setQuestionIndex(index);
                      setSpeakSeconds(speakSecondsFor(part));
                      setSpeakRunning(false);
                    }}
                  >
                    {index + 1}. {item}
                  </button>
                ),
              )
            ) : (
              <div className="cue-card">
                <strong>{topic.cueCard || topic.title}</strong>
                {topic.bullets && topic.bullets.length ? (
                  <ul>
                    {topic.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
            {!hideAids && part === '2' && !speakRunning ? <SampleInline topic={topic} part={part} /> : null}
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
                          onClick={async () => {
                            setTranscript(session.essay);
                            liveSave({
                              transcript: session.essay,
                              notes: session.notes || notes,
                              parentSessionId: session.id,
                            });
                            const saved = await fb.persistNow();
                            if (saved) fb.toast('Copied into a new draft.');
                          }}
                        >
                          Continue
                        </button>
                      ) : null}
                      {session.assessmentId ? (
                        <button
                          className="btn line"
                          type="button"
                          onClick={() => {
                            if (audioBlob && !window.confirm('This recording has not been uploaded. Leave this practice and discard it?')) return;
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
        <div className={`editor${recording ? ' is-recording' : ''}`}>
          {part === '2' && !hideAids ? (
            <div className="editor-block">
              <div className="editor-head">
                <h3>One-minute notes</h3>
                <span className={`timer${noteRunning ? ' is-live' : ''}`}>{formatClock(noteSeconds)}</span>
              </div>
              <div className="editor-bar">
                <span className="count">Glance at these while you speak</span>
                <div className="btn-row">
                  <button className="btn line" type="button" disabled={recording} onClick={() => { setPhase('prepare'); setSpeakRunning(false); setNoteRunning((r) => !r); }}>
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
                placeholder="Notes for this question…"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  liveSave({ notes: e.target.value, transcript });
                }}
              />
              <button className="btn line prepare-complete" type="button" onClick={() => { setNoteRunning(false); setPhase('answer'); setSpeakRunning(true); }} disabled={recording}><Play size={16} /> Start answer</button>
            </div>
          ) : null}
          <div className="editor-head">
            <h3>What you said</h3>
            <span className={`timer${speakRunning ? ' is-live' : ''}`}>{formatClock(speakSeconds)}</span>
          </div>
          <div className="editor-bar">
            <span className="count">{fb.wordCount(transcript)} words</span>
            <div className="btn-row">
              <button className="btn line" type="button" disabled={recording} onClick={() => { setNoteRunning(false); setPhase('answer'); setSpeakRunning((r) => !r); }}>
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
              {recording ? 'Recording' : audioBlob ? 'Recording ready' : 'Microphone off'}
            </span>
            <div className="btn-row">
              {!recording ? (
                <button
                  className="btn line"
                  type="button"
                  disabled={uploading}
                  onClick={async () => {
                    if (audioBlob && !window.confirm('This recording has not been uploaded. Replace it with a new recording?')) return;
                    if (audioBlob) await deletePendingAudio(accountId(), topic.id, part);
                    resetRecording();
                    setMicError(null);
                    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                      setMicError('This browser cannot record. You can still type the transcript.');
                      return;
                    }
                    try {
                      const captureOwner = owner;
                      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                      streamRef.current = stream;
                      chunksRef.current = [];
                      const recorder = new MediaRecorder(stream);
                      activeCapture.current = { owner: captureOwner, topicId: topic.id, part };
                      const chunks = chunksRef.current;
                      mediaRecorderRef.current = recorder;
                      recorder.ondataavailable = (event) => {
                        if (event.data && event.data.size) chunks.push(event.data);
                      };
                      recorder.onstop = () => {
                        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
                        setAudioBlob(blob);
                        void writePendingAudio(captureOwner, topic.id, part, blob);
                        setAudioUrl((prev) => {
                          if (prev) URL.revokeObjectURL(prev);
                          return URL.createObjectURL(blob);
                        });
                        if (streamRef.current) {
                          streamRef.current.getTracks().forEach((track) => track.stop());
                          streamRef.current = null;
                        }
                        setRecording(false);
                        setSpeakRunning(false);
                        setPhase('playback');
                      };
                      recorder.start();
                      setRecording(true);
                      setPhase('record');
                      setNoteRunning(false);
                      setSpeakRunning(true);
                      setUploadError(false);
                      setAudioSaved(false);
                    } catch {
                      setMicError('Microphone permission was denied. You can still type the transcript.');
                    }
                  }}
                >
                  <Mic size={16} />{audioBlob ? 'Re-record' : 'Record'}
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
                <button className="btn line" type="button" onClick={() => { clearRecording(); setPhase('answer'); }} disabled={uploading}>
                  Clear audio
                </button>
              ) : null}
            </div>
          </div>
          {micError ? <p className="file-hint warn-note">{micError}</p> : null}
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
            <p role="status">{uploading ? 'Uploading recording...' : fb.saveStatus === 'failed' || fb.saveStatus === 'error' ? 'Failed.' : fb.saveStatus === 'saving' ? 'Saving...' : fb.saveStatus === 'saved' ? 'Saved.' : 'Autosave on.'} {audioBlob && !audioSaved ? 'Recording not uploaded.' : 'Saved recordings are stored on your account.'}</p>
            <div>
              <button
                className="btn line"
                type="button"
                onClick={async () => {
                  liveSave({ transcript, notes });
                  const pending = fb.flushDraftPersist();
                  const saved = await (pending ?? fb.persistNow());
                  if (saved) fb.toast('Draft saved.');
                }}
              >
                <Save size={16} /> {fb.saveStatus === 'failed' || fb.saveStatus === 'error' ? 'Retry save' : 'Save draft'}
              </button>
              <button
                className="btn primary"
                type="button"
                disabled={recording || uploading}
                onClick={() => finishAttempt()}
              >
                {uploading ? 'Uploading...' : 'Finished'} <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
