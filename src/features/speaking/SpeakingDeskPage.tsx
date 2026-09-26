// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';
import { formatClock, formatDate } from '../../lib/format';
import { Empty } from '../../components/ui';
import { putAudio } from '../../storage/audio';

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
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const clearRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
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
    setRecording(false);
    setAudioBlob(null);
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
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
    clearRecording();
    setMicError(null);
  }, [topic?.id, fb.deskPart]);

  useEffect(() => () => clearRecording(), []);

  useEffect(() => {
    if (!noteRunning) return undefined;
    const id = window.setInterval(() => {
      setNoteSeconds((s) => {
        if (s <= 1) {
          setNoteRunning(false);
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
          fb.toast('Time is up. Write what you said.');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [speakRunning, fb]);

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
    fb.setSpeakingDraft(topic.id, patch);
    fb.scheduleDraftPersist();
  };

  const randomTopic = () => {
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

  if (!topic) {
    return (
      <section className="view active">
          <Empty message="The speaking bank did not load. Sign in again after the question catalog has been seeded." />
      </section>
    );
  }

  return (
    <section className="view active">
      <div className="page-tools desk-tools">
        <p>
          {mockMode
            ? 'Timed mock. Record if you can, then write what you said.'
            : 'One minute of notes, then speak. The recording stays on this account.'}
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
                  onClick={() => {
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
            <button className="btn text" type="button" onClick={randomTopic}>
              Another question
            </button>
          ) : null}
        </div>
      </div>
      <div className="desk-grid">
        <div className="prompt">
          <span className="pill blue">Part {part}</span>
          <h3>{topic.title}</h3>
          <div className="prompt-body">
            {part === '1' || part === '3' ? (
              (questions.length ? questions : part === '3' ? ['Take the long turn a step further.'] : [topic.title]).map(
                (item, index) => (
                  <div
                    key={index}
                    className={`speak-q${index === qIndex ? ' current' : ''}`}
                    onClick={() => {
                      fb.setQuestionIndex(index);
                      setSpeakSeconds(speakSecondsFor(part));
                      setSpeakRunning(false);
                    }}
                  >
                    {index + 1}. {item}
                  </div>
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
                          onClick={() => fb.navigate(`/review/${session.assessmentId}`)}
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
                  <button className="btn line" type="button" onClick={() => setNoteRunning((r) => !r)}>
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
            </div>
          ) : null}
          <div className="editor-head">
            <h3>What you said</h3>
            <span className={`timer${speakRunning ? ' is-live' : ''}`}>{formatClock(speakSeconds)}</span>
          </div>
          <div className="editor-bar">
            <span className="count">{fb.wordCount(transcript)} words</span>
            <div className="btn-row">
              <button className="btn line" type="button" onClick={() => setSpeakRunning((r) => !r)}>
                {speakRunning ? 'Pause' : 'Start timer'}
              </button>
              <button
                className="btn line"
                type="button"
                onClick={() => {
                  setNoteRunning(false);
                  setSpeakRunning(false);
                  setNoteSeconds(60);
                  setSpeakSeconds(speakSecondsFor(part));
                }}
              >
                Reset
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
                  onClick={async () => {
                    setMicError(null);
                    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                      setMicError('This browser cannot record. You can still type the transcript.');
                      return;
                    }
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                      streamRef.current = stream;
                      chunksRef.current = [];
                      const recorder = new MediaRecorder(stream);
                      mediaRecorderRef.current = recorder;
                      recorder.ondataavailable = (event) => {
                        if (event.data && event.data.size) chunksRef.current.push(event.data);
                      };
                      recorder.onstop = () => {
                        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
                        setAudioBlob(blob);
                        setAudioUrl((prev) => {
                          if (prev) URL.revokeObjectURL(prev);
                          return URL.createObjectURL(blob);
                        });
                        if (streamRef.current) {
                          streamRef.current.getTracks().forEach((track) => track.stop());
                          streamRef.current = null;
                        }
                        setRecording(false);
                      };
                      recorder.start();
                      setRecording(true);
                      setAudioBlob(null);
                      setAudioUrl((prev) => {
                        if (prev) URL.revokeObjectURL(prev);
                        return null;
                      });
                    } catch {
                      setMicError('Microphone permission was denied. You can still type the transcript.');
                    }
                  }}
                >
                  {audioBlob ? 'Re-record' : 'Record'}
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
                  Stop
                </button>
              )}
              {audioBlob ? (
                <button className="btn line" type="button" onClick={clearRecording}>
                  Clear audio
                </button>
              ) : null}
            </div>
          </div>
          {micError ? <p className="file-hint warn-note">{micError}</p> : null}
          {audioUrl ? <audio controls src={audioUrl} preload="metadata" /> : null}
          <textarea
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
            <p>The draft saves itself. Recordings stay on this account.</p>
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
                Save draft
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={async () => {
                  liveSave({ transcript, notes });
                  const text = String(transcript || '').trim();
                  if (!text) {
                    fb.toast('Nothing written yet.');
                    return;
                  }
                  const d = fb.speakingDraft(topic.id);
                  const attemptId = crypto.randomUUID();
                  let audioId = null;
                  if (audioBlob) {
                    audioId = attemptId;
                    try {
                      await putAudio(audioId, audioBlob);
                    } catch {
                      fb.toast('Could not store the recording. Saving the transcript only.');
                      audioId = null;
                    }
                  }
                  fb.setPendingAttempt({
                    id: attemptId,
                    essay: text,
                    notes,
                    part,
                    question: topic,
                    parentSessionId: d.parentSessionId || null,
                    planId: fb.state.activePlanId,
                    skill: 'speaking',
                    audioId,
                  });
                  fb.openModal('save');
                }}
              >
                Finished
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
