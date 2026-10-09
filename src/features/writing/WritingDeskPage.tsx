// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Expand, Minimize2, Undo2, Redo2, X, ZoomIn, Pause, Play, RotateCcw, Save, ArrowRight, Shuffle } from 'lucide-react';
import { useDraftHistory } from './useDraftHistory';
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
  const [focused, setFocused] = useState(false);
  const [mobileTab, setMobileTab] = useState('answer');
  const [split, setSplit] = useState(() => {
    try { return Math.max(30, Math.min(55, Number(localStorage.getItem('fieldbook.writingSplit')) || 40)); }
    catch { return 40; }
  });
  const history = useDraftHistory({ essay, sections });

  useEffect(() => {
    if (!focused) return;
    const exit = (event) => { if (event.key === 'Escape' && !document.querySelector('[role="dialog"]')) setFocused(false); };
    window.addEventListener('keydown', exit);
    return () => window.removeEventListener('keydown', exit);
  }, [focused]);

  useEffect(() => {
    const draft = fb.state.drafts[selected.id];
    setEssay(fb.writingDraft(selected.id));
    setSections(normalizeSections(draft && draft.sections));
    setTimerSeconds(selected.type === '1' ? 1200 : 2400);
    setRunning(false);
    setChecks({});
    history.reset({ essay: fb.writingDraft(selected.id), sections: normalizeSections(draft && draft.sections) });
  }, [selected.id, fb.draftRevision]);

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
  const targetErrorIds = [...new Set([...(fb.state.drafts[selected.id]?.targetErrorIds || []), ...(correction?.errorId ? [correction.errorId] : [])])];
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
    fb.setWritingDraft(selected.id, text, { sections: nextSections, practiceMode: mode, targetErrorIds });
    fb.scheduleDraftPersist();
  };

  const onEssayChange = (value) => {
    history.push({ essay: value, sections });
    setEssay(value);
    persistDraft(value, sections);
  };

  const onSectionChange = (key, value) => {
    const next = { ...sections, [key]: value };
    history.push({ essay, sections: next });
    setSections(next);
    persistDraft(essay, next);
  };

  const restore = (direction) => {
    const value = direction === 'undo' ? history.undo() : history.redo();
    if (!value) return;
    setEssay(value.essay);
    setSections(value.sections);
    persistDraft(value.essay, value.sections);
  };
  const keyboardHistory = (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault();
      restore(event.shiftKey ? 'redo' : 'undo');
    } else if (event.key.toLowerCase() === 'y') {
      event.preventDefault();
      restore('redo');
    }
  };
  const iconButton = (label, Icon, action, disabled = false) => (
    <Tooltip.Root>
      <Tooltip.Trigger asChild><button className="btn line icon-btn" type="button" aria-label={label} onClick={action} disabled={disabled}><Icon size={17} /></button></Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Content className="tool-tooltip" sideOffset={6}>{label}</Tooltip.Content></Tooltip.Portal>
    </Tooltip.Root>
  );

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
    fb.setWritingDraft(selected.id, text, { sections: fragment ? sections : emptySections(), practiceMode: mode, targetErrorIds });
    if (!fb.flushDraftPersist()) fb.persistNow();
    fb.setPendingAttempt({
      id: crypto.randomUUID(),
      essay: text,
      question: selected,
      parentSessionId: fb.state.drafts[selected.id]?.parentSessionId || null,
      planId: fb.state.activePlanId,
      skill: 'writing',
      reviewErrorId: correction ? correction.errorId : null,
      practiceMode: mode,
      targetErrorIds,
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
        onKeyDown={keyboardHistory}
        onChange={(e) => onSectionChange(key, e.target.value)}
      />
    </label>
  );

  return (
    <Tooltip.Provider delayDuration={250}><section className={`view active writing-workspace${focused ? ' focus-workspace' : ''}`}>
      <div className="page-tools desk-tools">
        <p>
          {selected.type === '1' ? 'Task 1 · at least 150 words · 20 minutes.' : 'Task 2 · at least 250 words · 40 minutes.'}{' '}
          <span className="draft-status" role="status">{fb.saveStatus === 'saving' ? 'Saving...' : fb.saveStatus === 'failed' || fb.saveStatus === 'error' ? 'Failed' : fb.saveStatus === 'saved' ? 'Saved' : 'Autosave on'}</span>
        </p>
        <div className="desk-controls">
          {iconButton(focused ? 'Exit focus mode' : 'Enter focus mode', focused ? Minimize2 : Expand, () => setFocused((value) => !value))}
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
            <Shuffle size={16} /> Another question
          </button>
        </div>
      </div>
      <div className="workspace-layout-tools">
        <div className="mobile-desk-tabs" role="tablist" aria-label="Writing workspace">
          {['prompt', 'answer'].map((tab) => <button key={tab} className={mobileTab === tab ? 'active' : ''} role="tab" aria-selected={mobileTab === tab} aria-controls={`writing-${tab}`} onClick={() => setMobileTab(tab)}>{tab === 'prompt' ? 'Prompt' : 'Answer'}</button>)}
        </div>
        <label className="split-control">Prompt width<input type="range" aria-label="Prompt panel width" min="30" max="55" value={split} onChange={(event) => { const value = Number(event.target.value); setSplit(value); try { localStorage.setItem('fieldbook.writingSplit', String(value)); } catch { /* Browser preference is optional. */ } }} /><span>{split}%</span></label>
      </div>
      <div className="desk-stack" style={{ '--prompt-share': `${split}fr`, '--answer-share': `${100 - split}fr` }}>
        <div className={`prompt${mobileTab === 'prompt' ? ' mobile-active' : ''}`} id="writing-prompt">
          <span className="pill blue">{typeName(selected)}</span>
          <h3>{displayName(selected.name)}</h3>
          <div className={image ? 'prompt-with-figure' : 'prompt-body'}>
            <div className="prompt-copy">{selected.prompt}</div>
            {image ? (
              <figure className="prompt-figure">
                <Dialog.Root>
                  <Dialog.Trigger asChild><button type="button" className="figure-zoom" aria-label="Zoom task chart"><img src={image} alt="Task chart" /><span><ZoomIn size={16} /> Zoom</span></button></Dialog.Trigger>
                  <Dialog.Portal><Dialog.Overlay className="chart-dialog-overlay" /><Dialog.Content className="chart-dialog-content"><div className="chart-dialog-head"><Dialog.Title>Task chart</Dialog.Title><Dialog.Close asChild><button className="btn line icon-btn" aria-label="Close task chart"><X size={20} /></button></Dialog.Close></div><Dialog.Description className="sr-only">Full-size chart for the current writing prompt.</Dialog.Description><div className="chart-dialog-image"><img src={image} alt="Task chart enlarged" /></div></Dialog.Content></Dialog.Portal>
                </Dialog.Root>
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
                        onClick={async () => {
                          fb.setWritingDraft(selected.id, session.essay, {
                            parentSessionId: session.id,
                            sections: emptySections(),
                          });
                          setEssay(session.essay);
                          setSections(emptySections());
                          history.reset({ essay: session.essay, sections: emptySections() });
                          const saved = await fb.persistNow();
                          if (saved) fb.toast('Copied into a new draft.');
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
        <div className={`editor${running ? ' is-writing' : ''}${mobileTab === 'answer' ? ' mobile-active' : ''}`} id="writing-answer">
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
              {iconButton('Undo', Undo2, () => restore('undo'), !history.canUndo)}
              {iconButton('Redo', Redo2, () => restore('redo'), !history.canRedo)}
              <button className="btn line" type="button" onClick={() => setRunning((r) => !r)}>
                {running ? <Pause size={15} /> : <Play size={15} />}{running ? 'Pause' : 'Start timer'}
              </button>
              <button
                className="btn line"
                type="button"
                onClick={() => {
                  setRunning(false);
                  setTimerSeconds(selected.type === '1' ? 1200 : 2400);
                }}
              >
                <RotateCcw size={15} /> Reset
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
                aria-label="Writing answer"
                onKeyDown={keyboardHistory}
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
                onClick={async () => {
                  fb.setWritingDraft(selected.id, composed, { sections, practiceMode: mode, targetErrorIds });
                  const pending = fb.flushDraftPersist();
                  const saved = await (pending ?? fb.persistNow());
                  if (saved) fb.toast('Draft saved.');
                }}
              >
                <Save size={16} /> {fb.saveStatus === 'failed' || fb.saveStatus === 'error' ? 'Retry save' : 'Save draft'}
              </button>
              <button className="btn primary" type="button" onClick={openSave} data-testid="writing-finished">
                Finished <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section></Tooltip.Provider>
  );
}
