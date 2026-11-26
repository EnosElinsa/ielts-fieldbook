// @ts-nocheck
import { useEffect, useId, useMemo, useState } from 'react';
import { InlineLoadingState } from '../../components/AsyncState';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Expand, Minimize2, Undo2, Redo2, X, ZoomIn, Pause, Play, RotateCcw, Save, ArrowRight, Shuffle } from 'lucide-react';
import { useDraftHistory } from './useDraftHistory';
import { todaySession, composeEssay, writingSaveBlockers, writingWordSoftConfirm, normalizeSections, emptySections } from '../../domain';
import { useFieldbook } from '../../context/FieldbookContext';
import { attemptLabel, displayName, formatClock, formatDate, plural, safeImage, typeName } from '../../lib/format';
import { useWorkspaceDeskContext, useWorkspacePageState } from '../../lib/workspacePageState';
import { accountId } from '../../storage/remote';
import { useElapsedCountdown } from '../../lib/useElapsedCountdown';
import { navigateTabs } from '../../lib/tabNavigation';
import { useConfirmationDialog } from '../../components/useConfirmationDialog';

const FRAGMENT_MODES = new Set(['overview', 'outline', 'compare', 'body']);
const retrySrc = (src: string, retry: number) => {
  if (!retry || !src || /^(?:data|blob):/i.test(src)) return src;
  return `${src}${src.includes('?') ? '&' : '?'}retry=${retry}`;
};
const DRAFT_STATUS_LABELS = {
  unsaved: 'Draft has unsaved changes',
  pending: 'Waiting to save draft...',
  saving: 'Saving draft...',
  failed: 'Draft could not be saved',
};

export function WritingDeskPage() {
  const fb = useFieldbook();
  const selected = fb.selectedQuestion;
  const owner = accountId();
  const mode = fb.currentDeskMode();
  const fragment = FRAGMENT_MODES.has(mode);
  const task1 = String(selected.type) === '1';
  const fieldId = useId();
  const limit = mode === 'overview' || mode === 'outline' ? 120 : 180;
  const paragraphPractice = mode === 'compare' || mode === 'body';
  const lengthHint = paragraphPractice ? '40 to 180 words' : 'Up to 120 words';
  const editorTitle = {
    overview: 'Introduction and overview',
    outline: task1 ? 'Task 1 outline' : 'Task 2 outline',
    compare: 'Comparison paragraph',
    body: 'Body paragraph',
  }[mode] || 'Full response';
  const uiKey = `writing:desk:${selected.id}:${mode}`;
  const { confirm, dialog } = useConfirmationDialog(`${owner}:${uiKey}`);
  useWorkspaceDeskContext({skill:'writing', id:String(selected.id), mode}, saved => {
    fb.setSelectedQuestionId(saved.id);
    fb.setActiveDeskMode(saved.mode);
  }, id => fb.state.questions.some(question => String(question.id) === id), fb.booted !== false);

  const [essay, setEssay] = useState(() => fb.writingDraft(selected.id));
  const [sections, setSections] = useState(() => {
    const draft = fb.state.drafts[selected.id];
    return normalizeSections(draft && draft.sections);
  });
  const [timerSeconds, setTimerSeconds] = useWorkspacePageState(`${uiKey}:seconds`, selected.type === '1' ? 1200 : 2400, value => typeof value === 'number' && value >= 0 && value <= 7200);
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useWorkspacePageState(`${uiKey}:checks`, {}, value => Boolean(value && typeof value === 'object' && Object.values(value).every(item => typeof item === 'boolean')));
  const [focused, setFocused] = useState(false);
  const [mobileTab, setMobileTab] = useWorkspacePageState(`${uiKey}:mobileTab`, 'answer', value => value === 'answer' || value === 'prompt');
  const [widerPrompt, setWiderPrompt] = useState(() => {
    try { return Number(localStorage.getItem('fieldbook.writingSplit')) >= 45; }
    catch { return false; }
  });
  const history = useDraftHistory({ essay, sections });

  useEffect(() => {
    if (!focused) return;
    const exit = (event) => { if (event.key === 'Escape' && !event.isComposing && event.keyCode !== 229 && !document.querySelector('[role="dialog"]')) setFocused(false); };
    window.addEventListener('keydown', exit);
    return () => window.removeEventListener('keydown', exit);
  }, [focused]);

  useEffect(() => {
    const draft = fb.state.drafts[selected.id];
    setEssay(fb.writingDraft(selected.id));
    setSections(normalizeSections(draft && draft.sections));
    setRunning(false);
    history.reset({ essay: fb.writingDraft(selected.id), sections: normalizeSections(draft && draft.sections) });
  }, [selected.id, mode, fb.draftRevision, owner]);

  useElapsedCountdown({
    seconds: timerSeconds, running, scope: JSON.stringify([owner, uiKey]), setSeconds: setTimerSeconds,
    onBackground: () => { setRunning(false); fb.toast('Timer paused while this page is in the background.'); },
    onComplete: () => { setRunning(false); fb.toast('Time is up. Check the answer.'); },
  });

  const tips = {
    overview: 'Write only the introduction and overview.',
    outline: task1 ? 'Find the main trend and group the figures for comparison.' : 'Plan your answer in brief notes. You can develop these ideas into paragraphs in a full response.',
    compare: 'Make at least two real comparisons in this paragraph.',
    body: 'Write one full body paragraph and make the example clear.',
    timed: 'Use the exam time. Start the timer.',
    full:
      selected.type === '1'
        ? 'Task 1: check the series, units, time, and the overall trend before you write.'
        : 'Task 2: answer every part, state your position, and develop two points with examples.',
  };
  const dueCorrection = todaySession(fb.state, null, 'writing').steps.find((step) => step.id === 'correction');
  const correctionSource = dueCorrection ? fb.state.sessions.find((session) => session.id === fb.state.errors?.find((error) => error.id === dueCorrection.errorId)?.sourceSessionId) : null;
  const correction = correctionSource && String(correctionSource.type) === String(selected.type) ? dueCorrection : null;
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
  const draftStatus = fb.draftSaveStatus(selected.id);
  const draftStatusLabel = DRAFT_STATUS_LABELS[draftStatus] || (words ? 'Draft saved' : 'Autosave enabled');
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
    if (event.defaultPrevented || event.nativeEvent?.isComposing || event.nativeEvent?.keyCode === 229 || !(event.ctrlKey || event.metaKey) || event.altKey) return;
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

  const openSave = async () => {
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
    if (soft && !await confirm({ title: 'Finish this response?', description: soft, confirmLabel: 'Finish practice' })) return;
    fb.setChecklistToastNeeded(false);
    fb.setWritingDraft(selected.id, text, { sections: fragment || fb.standaloneWriting ? sections : emptySections(), practiceMode: mode, targetErrorIds });
    if (!fb.flushDraftPersist()) fb.persistNow(undefined, { collections: ['drafts'] });
    fb.setPendingAttempt({
      id: crypto.randomUUID(),
      essay: text,
      sections: fragment ? structuredClone(sections) : undefined,
      question: selected,
      parentSessionId: fb.state.drafts[selected.id]?.parentSessionId || null,
      planId: fb.standaloneWriting ? null : fb.state.activePlanId,
      keepPracticeNotes: fb.standaloneWriting && Object.values(sections).some(value => value.trim()),
      skill: 'writing',
      reviewErrorId: correction ? correction.errorId : null,
      practiceMode: mode,
      targetErrorIds,
    });
    fb.openModal('save');
  };

  const sectionField = (key, label, help, minHeight = 120) => (
    <div className="section-field" key={key}>
      <label htmlFor={`${fieldId}-${key}`}>{label}</label>
      <small id={`${fieldId}-${key}-help`}>{help}</small>
      <textarea
        id={`${fieldId}-${key}`}
        aria-describedby={`${fieldId}-${key}-help`}
        data-testid={`section-${key}`}
        style={{ minHeight }}
        value={sections[key] || ''}
        onKeyDown={keyboardHistory}
        onChange={(e) => onSectionChange(key, e.target.value)}
      />
    </div>
  );

  return (
    <Tooltip.Provider delayDuration={250}><section className={`view active writing-workspace${focused ? ' focus-workspace' : ''}`}>
      <div className="page-tools desk-tools">
        <p>
          {fragment ? typeName(selected) : task1 ? 'Task 1 · at least 150 words · 20 minutes.' : 'Task 2 · at least 250 words · 40 minutes.'}{' '}
          <span className="draft-status" role="status">{draftStatusLabel}</span>
        </p>
        <div className="desk-controls">
          <button
            type="button"
            className="btn line writing-prompt-width"
            aria-pressed={widerPrompt}
            aria-controls="writing-prompt"
            onClick={() => {
              const next = !widerPrompt;
              setWiderPrompt(next);
              try { localStorage.setItem('fieldbook.writingSplit', next ? '50' : '40'); }
              catch { /* Browser preference is optional. */ }
            }}
          >
            Wider prompt
          </button>
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
          {['prompt', 'answer'].map((tab) => <button key={tab} id={`writing-tab-${tab}`} type="button" className={mobileTab === tab ? 'active' : ''} role="tab" tabIndex={mobileTab === tab ? 0 : -1} aria-selected={mobileTab === tab} aria-controls={`writing-${tab}`} onKeyDown={navigateTabs} onClick={() => setMobileTab(tab)}>{tab === 'prompt' ? 'Prompt' : 'Answer'}</button>)}
        </div>
      </div>
      <div className={`desk-stack${widerPrompt ? ' writing-prompt-wide' : ''}`}>
        <div className={`prompt${mobileTab === 'prompt' ? ' mobile-active' : ''}`} id="writing-prompt">
          <span className="pill blue">{typeName(selected)}</span>
          <h2>{displayName(selected.name)}</h2>
          <WritingTaskPrompt prompt={selected.prompt} image={image} />
          {!fragment && <div className="prompt-tip">{tips[mode] || tips.full}</div>}
          {correction ? (
            <div className="prompt-tip correction-note">Use this correction at least once: {correction.detail}</div>
          ) : null}
          <div className="question-history">
            <div className="history-head">
              <h3>Earlier attempts</h3>
              <span>{attempts.length === 1 ? '1 attempt' : `${attempts.length} attempts`}</span>
            </div>
            <div className="history-list">
              {attempts.length ? (
                attempts.map((session, index) => (
                  <div className="history-item" key={session.id}>
                    <div className="history-meta">
                      <span>{formatDate(session.date, true)}</span>
                      <span>
                        Attempt {attempts.length - index} · {plural(session.words, 'word')} · {attemptLabel(session)}
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
                          await fb.startTargetedPractice(session);
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
            <h2>{editorTitle}</h2>
            <span className={`timer${running ? ' is-live' : ''}`}>{formatClock(timerSeconds)}</span>
          </div>
          <div className="editor-bar">
            <div className="word-meter">
              <span className="count" data-testid="word-count">
                {words} words
              </span>
              {fragment ? <span className="count">{lengthHint}</span> : <>
                <span className="count">/ {wordGoal}</span>
                <span className="word-track" aria-hidden="true">
                  <span className={`word-fill${words >= wordGoal ? ' is-met' : ''}`} style={{ width: `${wordPct}%` }} />
                </span>
              </>}
              {words && !fragment ? (
                <span className="count">{paragraphs === 1 ? '1 paragraph' : `${paragraphs} paragraphs`}</span>
              ) : null}
            </div>
            <div className="btn-row writing-editor-controls" role="group" aria-label="Writing tools">
              {iconButton('Undo', Undo2, () => restore('undo'), !history.canUndo)}
              {iconButton('Redo', Redo2, () => restore('redo'), !history.canRedo)}
              <button className="btn line" type="button" onClick={() => { if (!timerSeconds) setTimerSeconds(selected.type === '1' ? 1200 : 2400); setRunning((r) => !r); }}>
                {running ? <Pause size={15} /> : <Play size={15} />}{running ? 'Pause' : 'Start timer'}
              </button>
              {iconButton('Reset timer', RotateCcw, () => {
                setRunning(false);
                setTimerSeconds(selected.type === '1' ? 1200 : 2400);
              })}
            </div>
          </div>
          <details key={selected.id} className="writing-answer-prompt"><summary>Task prompt</summary><WritingTaskPrompt prompt={selected.prompt} image={image} /></details>
          {fragment && <p className="writing-exercise-guide">{tips[mode]}</p>}
          {mode === 'overview' ? (
            <div className="section-fields">
              {sectionField('intro', 'Introduction', 'Paraphrase the question…', 110)}
              {sectionField('overview', 'Overview', 'State the overall trend…', 140)}
            </div>
          ) : null}
          {mode === 'outline' ? (
            <div className="section-fields">
              {task1 ? <>
                {sectionField('position', 'Overall picture', 'State the main trend or standout feature in the chart.', 90)}
                {sectionField('pointA', 'First comparison', 'Group related figures and note one comparison worth reporting.', 110)}
                {sectionField('pointB', 'Second comparison', 'Identify another group or contrast and note the figures that illustrate it.', 110)}
              </> : <>
                {sectionField('position', 'Your position', 'Answer the question directly in one sentence. State your view if the prompt asks for it.', 90)}
                {sectionField('pointA', 'First supporting idea', 'Note one reason and how you would explain or illustrate it.', 110)}
                {sectionField('pointB', 'Second supporting idea', 'Choose a different reason, or address another part of the question.', 110)}
              </>}
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
          {showChecklist ? (
            <div className="desk-check">
              {selected.type === '1' ? (
                <>
                  {['series', 'units', 'time', 'overview'].map((key) => (
                    <label className="check-field" key={key}>
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
                    <label className="check-field" key={key}>
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
          <div className="editor-foot">
            <p>{fragment
              ? words > limit ? `Remove ${plural(words - limit, 'word')} to meet the limit.` : 'Focused feedback on this exercise'
              : words >= wordGoal ? 'Minimum length reached.' : `${wordGoal - words} words to the minimum.`}</p>
            <div>
              <button
                className="btn line"
                type="button"
                onClick={async () => {
                  fb.setWritingDraft(selected.id, composed, { sections, practiceMode: mode, targetErrorIds });
                  const pending = fb.flushDraftPersist();
                  const saved = await (pending ?? fb.persistNow(undefined, { collections: ['drafts'] }));
                  if (saved) fb.toast('Draft saved.');
                }}
              >
                <Save size={16} /> {draftStatus === 'failed' ? 'Retry save' : 'Save draft'}
              </button>
              <button className="btn primary" type="button" onClick={openSave} data-testid="writing-finished">
                Finish practice <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
      {dialog}
    </section></Tooltip.Provider>
  );
}

export function WritingTaskPrompt({ prompt, image }) {
  return <div className={image ? 'prompt-with-figure' : 'prompt-body'}>
    <div className="prompt-copy">{prompt}</div>
    {image ? <WritingTaskChart key={image} image={image} /> : null}
  </div>;
}

function WritingTaskChart({ image }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  const src = retrySrc(image, retry);
  useEffect(() => {
    if (failed || loaded) return undefined;
    const timer = window.setTimeout(() => setFailed(true), 15_000);
    return () => window.clearTimeout(timer);
  }, [failed, loaded, src]);
  return <figure className="prompt-figure" aria-busy={!failed && !loaded}>
    {failed ? <div className="task-chart-error" role="status"><p>The task chart could not load.</p><button type="button" className="btn line" onClick={() => { setFailed(false); setLoaded(false); setRetry(value => value + 1); }}><RotateCcw size={15}/>Retry chart</button></div> : <Dialog.Root>
      <Dialog.Trigger asChild><button type="button" className={`figure-zoom${loaded ? '' : ' is-loading'}`} disabled={!loaded} aria-label="Zoom task chart"><img key={src} src={src} alt="Task chart" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />{loaded ? <span><ZoomIn size={16} /> Zoom</span> : <span className="task-chart-loading"><InlineLoadingState message="Loading chart…" /></span>}</button></Dialog.Trigger>
      <Dialog.Portal><Dialog.Overlay className="chart-dialog-overlay" /><Dialog.Content className="chart-dialog-content"><div className="chart-dialog-head"><Dialog.Title>Task chart</Dialog.Title><Dialog.Close asChild><button className="btn line icon-btn" aria-label="Close task chart"><X size={20} /></button></Dialog.Close></div><Dialog.Description className="sr-only">Full-size chart for the current writing prompt.</Dialog.Description><div className="chart-dialog-image"><img src={src} alt="Task chart enlarged" onError={() => setFailed(true)} /></div></Dialog.Content></Dialog.Portal>
    </Dialog.Root>}
  </figure>;
}
