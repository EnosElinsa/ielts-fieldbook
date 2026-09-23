// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { todaySession } from '../../domain';
import { useFieldbook } from '../../context/FieldbookContext';
import { attemptLabel, displayName, formatClock, formatDate, safeImage, typeName } from '../../lib/format';

export function WritingDeskPage() {
  const fb = useFieldbook();
  const selected = fb.selectedQuestion;
  const [essay, setEssay] = useState(() => fb.writingDraft(selected.id));
  const [timerSeconds, setTimerSeconds] = useState(selected.type === '1' ? 1200 : 2400);
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState({});

  useEffect(() => {
    setEssay(fb.writingDraft(selected.id));
    setTimerSeconds(selected.type === '1' ? 1200 : 2400);
    setRunning(false);
    setChecks({});
  }, [selected.id]);

  useEffect(() => {
    if (!running) return undefined;
    const id = window.setInterval(() => {
      setTimerSeconds((s) => {
        if (s <= 1) {
          setRunning(false);
          fb.toast('Time is up. Check the answer.');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, fb]);

  const mode = fb.currentDeskMode();
  const tips = {
    overview: 'Write only the introduction and overview.',
    outline: 'Write only the question breakdown, your position, and two points.',
    compare: 'Make at least two real comparisons in this paragraph.',
    body: 'Write one full body paragraph and make the example clear.',
    timed: 'Use the exam time. Start the timer.',
    full:
      selected.type === '1'
        ? 'Task 1: check the series, units, time, and the overall trend before you write.'
        : 'Task 2: answer every part, state your position, and develop two points with examples.',
  };
  const correction = todaySession(fb.state, null, 'writing').steps.find((step) => step.id === 'correction');
  const attempts = useMemo(
    () =>
      fb.state.sessions
        .filter((session) => String(session.questionId) === String(selected.id) && session.essay)
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [fb.state.sessions, selected.id],
  );
  const image = safeImage(selected.image);
  const words = fb.wordCount(essay);

  const onEssayChange = (value: string) => {
    setEssay(value);
    fb.setWritingDraft(selected.id, value);
    fb.scheduleDraftPersist();
  };

  const openSave = () => {
    const text = essay.trim();
    if (!text) {
      fb.toast('Write something first.');
      return;
    }
    if ((mode === 'overview' || mode === 'outline') && words >= 80) {
      const ok = window.confirm(
        mode === 'overview'
          ? 'This task is only the introduction and overview. Save the whole essay anyway?'
          : 'This task is only the plan. Save the whole essay anyway?',
      );
      if (!ok) return;
    }
    const boxValues = Object.values(checks);
    fb.setChecklistToastNeeded(boxValues.length > 0 && boxValues.some((v) => !v));
    fb.setWritingDraft(selected.id, essay);
    if (!fb.flushDraftPersist()) fb.persistNow();
    fb.setPendingAttempt({
      id: crypto.randomUUID(),
      essay: text,
      question: selected,
      parentSessionId: fb.speakingDraft(selected.id).parentSessionId || null,
      planId: fb.state.activePlanId,
      skill: 'writing',
      reviewErrorId: correction ? correction.errorId : null,
    });
    fb.openModal('save');
  };

  return (
    <section className="view active">
      <div className="section-head">
        <div>
          <p className="kicker">Writing</p>
          <h3>Write</h3>
          <p>Pick a question.</p>
        </div>
        <button
          className="btn line"
          type="button"
          onClick={() => {
            const next =
              fb.selectWritingQuestion(fb.state, selected && selected.type, fb.state.questions) ||
              fb.state.questions[0];
            fb.chooseQuestion(next.id);
          }}
        >
          Another question
        </button>
      </div>
      <div className="desk-grid">
        <div className="prompt">
          <span className="pill blue">{typeName(selected)}</span>
          <h3>{displayName(selected.name)}</h3>
          <div className="prompt-body">
            {selected.prompt}
            {image ? (
              <>
                <br />
                <img src={image} alt="Task chart" />
              </>
            ) : null}
          </div>
          <div className="prompt-tip">{tips[mode] || tips.full}</div>
          {['overview', 'outline', 'timed'].includes(mode) ? (
            <div className="prompt-tip">
              {mode === 'overview'
                ? 'Introduction and overview only'
                : mode === 'outline'
                  ? 'Plan only: position and two points'
                  : 'Use the exam time'}
            </div>
          ) : null}
          {correction ? (
            <div className="prompt-tip correction-note">Use this correction at least once: {correction.detail}</div>
          ) : null}
          <div className="desk-check">
            {selected.type === '1' ? (
              <>
                {['series', 'units', 'time', 'overview'].map((key) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={Boolean(checks[key])}
                      onChange={(e) => setChecks((c) => ({ ...c, [key]: e.target.checked }))}
                    />
                    {key === 'series' ? 'Series' : key === 'units' ? 'Units' : key === 'time' ? 'Time' : 'Overview'}
                  </label>
                ))}
              </>
            ) : (
              <>
                {['prompt', 'position', 'body'].map((key) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={Boolean(checks[key])}
                      onChange={(e) => setChecks((c) => ({ ...c, [key]: e.target.checked }))}
                    />
                    {key === 'prompt' ? 'Question' : key === 'position' ? 'Position' : 'Two paragraphs'}
                  </label>
                ))}
              </>
            )}
          </div>
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
                        {session.words} words · {attemptLabel(session)} · {attempts.length - index}
                      </span>
                    </div>
                    <p>{session.essay}</p>
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
                      <button
                        className="btn line"
                        type="button"
                        onClick={() => {
                          fb.setWritingDraft(selected.id, session.essay, { parentSessionId: session.id });
                          setEssay(session.essay);
                          fb.persistNow();
                          fb.toast('Copied into a new draft.');
                        }}
                      >
                        Continue
                      </button>
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
                <div className="empty">No earlier attempts.</div>
              )}
            </div>
          </div>
        </div>
        <div className="editor">
          <div className="editor-head">
            <h3>Draft</h3>
            <span className="timer">{formatClock(timerSeconds)}</span>
          </div>
          <div className="editor-bar">
            <span className="count" data-testid="word-count">
              {words} words
            </span>
            <div>
              <button className="btn line" type="button" onClick={() => setRunning((r) => !r)}>
                {running ? 'Pause' : 'Start timer'}
              </button>
              <button
                className="btn line"
                type="button"
                onClick={() => {
                  setRunning(false);
                  setTimerSeconds(selected.type === '1' ? 1200 : 2400);
                }}
              >
                Reset
              </button>
            </div>
          </div>
          <textarea
            data-testid="essay-input"
            placeholder="Write your answer here…"
            value={essay}
            onChange={(e) => onEssayChange(e.target.value)}
          />
          <div className="editor-foot">
            <p>The draft saves itself.</p>
            <div>
              <button
                className="btn line"
                type="button"
                onClick={() => {
                  fb.setWritingDraft(selected.id, essay);
                  if (!fb.flushDraftPersist()) fb.persistNow();
                  fb.toast('Draft saved.');
                }}
              >
                Save draft
              </button>
              <button className="btn primary" type="button" onClick={openSave}>
                Finished
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
