// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { todaySession, composeEssay, writingSaveBlockers, writingWordSoftConfirm, normalizeSections, emptySections } from '../../domain';
import { useFieldbook } from '../../context/FieldbookContext';
import { attemptLabel, displayName, formatClock, formatDate, safeImage, typeName } from '../../lib/format';

const FRAGMENT_MODES = new Set(['overview', 'outline', 'compare', 'body']);

export function WritingDeskPage() {
  const fb = useFieldbook();
  const selected = fb.selectedQuestion;
  const mode = fb.currentDeskMode();
  const fragment = FRAGMENT_MODES.has(mode);

  const [essay, setEssay] = useState(() => fb.writingDraft(selected.id));
  const [sections, setSections] = useState(() => {
    const draft = fb.state.drafts[selected.id];
    return normalizeSections(draft && draft.sections);
  });
  const [timerSeconds, setTimerSeconds] = useState(selected.type === '1' ? 1200 : 2400);
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState({});

  useEffect(() => {
    const draft = fb.state.drafts[selected.id];
    setEssay(fb.writingDraft(selected.id));
    setSections(normalizeSections(draft && draft.sections));
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
  const composed = fragment ? composeEssay(mode, sections, essay) : essay;
  const words = fb.wordCount(composed);
  const wordGoal = String(selected.type) === '1' ? 150 : 250;
  const wordPct = Math.min(100, Math.round((words / wordGoal) * 100));
  const paragraphs = String(composed || '')
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean).length;
  const showChecklist = mode === 'timed' || mode === 'full';

  const persistDraft = (nextEssay, nextSections) => {
    const text = fragment ? composeEssay(mode, nextSections, nextEssay) : nextEssay;
    fb.setWritingDraft(selected.id, text, { sections: nextSections });
    fb.scheduleDraftPersist();
  };

  const onEssayChange = (value) => {
    setEssay(value);
    persistDraft(value, sections);
  };

  const onSectionChange = (key, value) => {
    const next = { ...sections, [key]: value };
    setSections(next);
    persistDraft(essay, next);
  };

  const openSave = () => {
    const text = String(composed || '').trim();
    const blockers = writingSaveBlockers(mode, selected.type, text, checks, sections);
    if (blockers.length) {
      fb.toast(blockers[0]);
      return;
    }
    if (!text) {
      fb.toast('Write something first.');
      return;
    }
    const soft = writingWordSoftConfirm(mode, selected.type, text);
    if (soft && !window.confirm(soft)) return;
    fb.setChecklistToastNeeded(false);
    fb.setWritingDraft(selected.id, text, { sections: fragment ? sections : emptySections() });
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

  const sectionField = (key, label, placeholder, minHeight = 120) => (
    <label className="section-field" key={key}>
      <span>{label}</span>
      <textarea
        data-testid={`section-${key}`}
        style={{ minHeight }}
        placeholder={placeholder}
        value={sections[key] || ''}
        onChange={(e) => onSectionChange(key, e.target.value)}
      />
    </label>
  );

  return (
    <section className="view active">
      <div className="page-tools desk-tools">
        <p>
          {selected.type === '1' ? 'Task 1 · at least 150 words · 20 minutes.' : 'Task 2 · at least 250 words · 40 minutes.'}{' '}
          The draft saves itself.
        </p>
        <div className="desk-controls">
          <button
            className="btn text"
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
      </div>
      <div className="desk-stack">
        <div className="prompt">
          <span className="pill blue">{typeName(selected)}</span>
          <h3>{displayName(selected.name)}</h3>
          <div className={image ? 'prompt-with-figure' : 'prompt-body'}>
            <div className="prompt-copy">{selected.prompt}</div>
            {image ? (
              <figure className="prompt-figure">
                <img src={image} alt="Task chart" />
              </figure>
            ) : null}
          </div>
          <div className="prompt-tip">{tips[mode] || tips.full}</div>
          {['overview', 'outline', 'timed'].includes(mode) ? (
            <div className="prompt-tip">
              {mode === 'overview'
                ? 'Introduction and overview only · under 120 words'
                : mode === 'outline'
                  ? 'Plan only: position and two points · under 120 words'
                  : 'Use the exam time'}
            </div>
          ) : null}
          {mode === 'compare' || mode === 'body' ? (
            <div className="prompt-tip">One paragraph · 40 to 180 words</div>
          ) : null}
          {correction ? (
            <div className="prompt-tip correction-note">Use this correction at least once: {correction.detail}</div>
          ) : null}
          {showChecklist ? (
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
                          fb.setWritingDraft(selected.id, session.essay, {
                            parentSessionId: session.id,
                            sections: emptySections(),
                          });
                          setEssay(session.essay);
                          setSections(emptySections());
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
        <div className={`editor${running ? ' is-writing' : ''}`}>
          <div className="editor-head">
            <h3>{fragment ? 'Fragment draft' : 'Draft'}</h3>
            <span className={`timer${running ? ' is-live' : ''}`}>{formatClock(timerSeconds)}</span>
          </div>
          <div className="editor-bar">
            <div className="word-meter">
              <span className="count" data-testid="word-count">
                {words} words
              </span>
              <span className="count">/ {wordGoal}</span>
              <span className="word-track" aria-hidden="true">
                <span className={`word-fill${words >= wordGoal ? ' is-met' : ''}`} style={{ width: `${wordPct}%` }} />
              </span>
              {words ? (
                <span className="count">{paragraphs === 1 ? '1 paragraph' : `${paragraphs} paragraphs`}</span>
              ) : null}
            </div>
            <div className="btn-row">
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
          {mode === 'overview' ? (
            <div className="section-fields">
              {sectionField('intro', 'Introduction', 'Paraphrase the question…', 110)}
              {sectionField('overview', 'Overview', 'State the overall trend…', 140)}
            </div>
          ) : null}
          {mode === 'outline' ? (
            <div className="section-fields">
              {sectionField('position', 'Position', 'Your answer to the question…', 90)}
              {sectionField('pointA', 'Point one', 'First main idea…', 110)}
              {sectionField('pointB', 'Point two', 'Second main idea…', 110)}
            </div>
          ) : null}
          {mode === 'compare' || mode === 'body' ? (
            <div className="section-fields">
              {sectionField(
                'paragraph',
                mode === 'compare' ? 'Comparison paragraph' : 'Body paragraph',
                mode === 'compare' ? 'Compare at least two figures or trends…' : 'One full body paragraph with an example…',
                280,
              )}
            </div>
          ) : null}
          {!fragment ? (
            <div className="manuscript">
              <textarea
                data-testid="essay-input"
                placeholder="Write your answer here…"
                value={essay}
                onChange={(e) => onEssayChange(e.target.value)}
              />
            </div>
          ) : null}
          <div className="editor-foot">
            <p>{words >= wordGoal ? 'Minimum length reached.' : `${wordGoal - words} words to the minimum.`}</p>
            <div>
              <button
                className="btn line"
                type="button"
                onClick={() => {
                  fb.setWritingDraft(selected.id, composed, { sections });
                  if (!fb.flushDraftPersist()) fb.persistNow();
                  fb.toast('Draft saved.');
                }}
              >
                Save draft
              </button>
              <button className="btn primary" type="button" onClick={openSave} data-testid="writing-finished">
                Finished
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
