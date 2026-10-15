import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFieldbook } from '../../context/FieldbookContext';
import { createExamAttempt, gradeAttempt } from '../../domain/exam';
import type { ExamAttempt, ExamCatalog, ExamSkill } from '../../domain/exam/types';
import { accountId } from '../../storage/remote';
import { readExamRecoveries } from '../../storage/examRecovery';
import { mergeExamSessions, unfinishedExamSession } from '../../domain/exam/sessions';
import { checkpointExamSession, clearSessionCheckpoint } from './sessionRecovery';

export function useExamAttempt(skill: ExamSkill, sourceId: string, mode: 'practice' | 'mock', catalog: ExamCatalog, requestedId?: string | null, retryId?: string | null, planId?: string | null, newSession = false) {
  const fb = useFieldbook(); const navigate = useNavigate(); const owner = accountId();
  const baseKey = `${skill}:${mode}:${sourceId}${retryId ? `:retry:${retryId}` : ''}`;
  const key = `${baseKey}${planId ? `:plan:${planId}` : ''}`;
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null); const ref = useRef<ExamAttempt | null>(null);
  const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [clock, setClock] = useState(0);
  const lock = useRef(false); const timer = useRef<number | null>(null); const alive = useRef(true); const boundOwner = useRef(owner);
  const practiceTick = useRef(Date.now());
  const saveFeedback = useRef('');
  const scope = `${owner}:${key}`;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => () => {
    const current = ref.current;
    if (mode !== 'practice' || !current || current.status !== 'active' || accountId() !== boundOwner.current) return;
    const paused = { ...current, status: 'paused' as const, updatedAt: new Date().toISOString() };
    ref.current = paused;
    checkpointExamSession(boundOwner.current, key, paused);
  }, [key, mode]);
  const update = useCallback((patch: Partial<ExamAttempt>) => {
    if (accountId() !== boundOwner.current || !ref.current || !unfinishedExamSession(ref.current) || lock.current) return;
    const next = { ...ref.current, ...patch, updatedAt: new Date().toISOString() }; ref.current = next; setAttempt(next); checkpointExamSession(boundOwner.current, key, next);
  }, [key]);
  useEffect(() => {
    const previous = ref.current;
    if (previous?.status === 'active' && mode === 'practice' && owner === boundOwner.current && previous.sourceId === sourceId && (newSession || requestedId && requestedId !== previous.id)) {
      checkpointExamSession(owner, key, { ...previous, status: 'paused', updatedAt: new Date().toISOString() });
    }
    boundOwner.current = owner; ref.current = null; setAttempt(null); setError(''); setSaving(false); lock.current = false;
    if (!catalog.sections.length || !sourceId) return;
    const matches = (row: ExamAttempt) => {
      if (row.skill !== skill || row.mode !== mode || row.sourceId !== sourceId || row.retryOfAttemptId !== (retryId || undefined)) return false;
      if (requestedId && row.id !== requestedId) return false;
      if (planId) {
        if (row.planId !== planId) return false;
        const plan = (fb.stateRef.current.plans as import('../../domain/plans').StudyPlan[] || []).find(item => item.id === planId);
        if (plan?.startedAt && !(Date.parse(row.startedAt) >= Date.parse(plan.startedAt))) return false;
        const wanted = catalog.questions.map(question => question.id).sort();
        const recorded = row.questionSnapshot ? row.questionSnapshot.map(question => question.id) : Object.keys(row.questionTypes || {});
        if (JSON.stringify(wanted) !== JSON.stringify(recorded.sort())) return false;
      } else if (!requestedId && row.planId) return false;
      return true;
    };
    const local = readExamRecoveries<ExamAttempt>(owner, baseKey).filter(matches);
    const rows = mergeExamSessions((fb.stateRef.current.examAttempts || []).filter(matches), local);
    const recovered = newSession ? undefined : rows.find(row => requestedId || unfinishedExamSession(row) || row.status === 'completed' && local.some(item => item.id === row.id));
    if (requestedId && !newSession && (!recovered || recovered.status === 'discarded')) { setError('This session was discarded or is no longer available. Start a new session from the bank.'); return; }
    if (recovered?.status === 'completed' && !local.some(row => row.id === recovered.id && row.status === 'completed')) { navigate(`/${skill}/review/${recovered.id}`, { replace: true }); return; }
    const next = recovered ? { ...recovered } : (mode === 'practice' ? { ...createExamAttempt(catalog.sections, catalog.questions, mode), sourceId, ...(retryId ? { retryOfAttemptId: retryId } : {}), ...(planId ? { planId, questionSnapshot: structuredClone(catalog.questions) } : {}) } : null);
    if (next) { if (mode === 'mock' && next.status === 'paused') next.status = 'active'; ref.current = next; setAttempt(next); setClock(next.elapsedSeconds); practiceTick.current = Date.now(); checkpointExamSession(owner, key, next); if (next.status === 'completed') setError('This completed session still needs to be saved. Retry submission.'); }
  }, [owner, key, catalog, requestedId, retryId, sourceId, skill, mode, planId, newSession, fb.stateRef, navigate]);
  const start = () => {
    if (accountId() !== owner) return;
    const next = createExamAttempt(catalog.sections, catalog.questions, mode);
    next.sourceId = sourceId;
    if (retryId) next.retryOfAttemptId = retryId;
    if (planId) { next.planId = planId; next.questionSnapshot = structuredClone(catalog.questions); }
    if (mode === 'mock') { next.timeLimitSeconds = skill === 'reading' ? 3600 : Math.ceil(catalog.assets.filter(asset => asset.kind === 'audio').reduce((sum, asset) => sum + (asset.duration || 0), 0)) + 120; next.hintsEnabled = false; }
    ref.current = next; setAttempt(next); setClock(0); practiceTick.current = Date.now(); checkpointExamSession(owner, key, next);
  };
  useEffect(() => {
    if (!attempt || attempt.status !== 'active') return;
    const tick = () => {
      if (accountId() !== boundOwner.current || !ref.current || ref.current.status !== 'active') return;
      const now = Date.now(); const elapsed = mode === 'mock' ? Math.max(ref.current.elapsedSeconds, Math.floor((now - Date.parse(ref.current.startedAt)) / 1000)) : ref.current.elapsedSeconds + Math.max(0, Math.floor((now - practiceTick.current) / 1000));
      practiceTick.current = now; ref.current = { ...ref.current, elapsedSeconds: elapsed }; setClock(elapsed); checkpointExamSession(boundOwner.current, key, ref.current);
    };
    tick(); const id = window.setInterval(tick, 1000); return () => window.clearInterval(id);
  }, [attempt?.id, attempt?.status, mode, key]);
  const save = useCallback((current: ExamAttempt) => {
    const savingOwner = boundOwner.current;
    const savingScope = scopeRef.current;
    const operation = async () => {
      if (accountId() !== boundOwner.current) return false;
      if (savingScope !== scopeRef.current || savingOwner !== boundOwner.current) return false;
      const draft = structuredClone(fb.stateRef.current); const rows = (draft.examAttempts || []) as ExamAttempt[];
      draft.examAttempts = [...rows.filter(row => row.id !== current.id), structuredClone(current)];
      saveFeedback.current = '';
      try {
        const saved = await fb.persistNow(draft, { collections: ['examAttempts', 'plans'], onError: (message: string) => { saveFeedback.current = message; } });
        return saved && accountId() === savingOwner && boundOwner.current === savingOwner && scopeRef.current === savingScope;
      } catch { return false; }
    };
    // Submission/discard follows any pending autosave so an older active revision
    // cannot overwrite the terminal session state on the account server.
    const request = saveQueue.current.then(operation, operation);
    saveQueue.current = request;
    return request;
  }, [fb.persistNow, fb.stateRef]);
  useEffect(() => {
    if (!attempt || !unfinishedExamSession(attempt) || saving) return;
    const savingOwner = boundOwner.current;
    const savingId = attempt.id; const savingScope = scopeRef.current;
    timer.current = window.setTimeout(() => { if (ref.current?.id === savingId && accountId() === savingOwner && !lock.current) void save(ref.current).then(saved => { if (alive.current && accountId() === savingOwner && boundOwner.current === savingOwner && scopeRef.current === savingScope && ref.current?.id === savingId && !lock.current) setError(saved ? '' : saveFeedback.current ? `${saveFeedback.current} Your answers remain in this browser.` : 'Autosave failed. Your answers remain in this browser; retry saving before leaving.'); }); }, 1500);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [attempt, save, saving]);
  const submit = useCallback(async () => {
    if (lock.current || !ref.current || ref.current.status === 'discarded' || accountId() !== boundOwner.current) return;
    if (skill === 'reading' && retryId && ref.current.status !== 'completed') {
      const missing = catalog.questions.filter(question => question.skill === 'reading' && ref.current!.sectionIds.includes(question.sectionId) && !ref.current!.evidence[question.id]?.trim());
      if (missing.length) { setError(`Add fresh passage evidence for question${missing.length === 1 ? '' : 's'} ${missing.map(question => question.number).join(', ')} before submitting this retry. Your answers are kept.`); return; }
    }
    const submissionOwner = boundOwner.current;
    lock.current = true; if (timer.current) window.clearTimeout(timer.current); setSaving(true); setError('');
    const completed = ref.current.status === 'completed' ? ref.current : gradeAttempt(ref.current, ref.current.questionSnapshot || catalog.questions);
    ref.current = completed; setAttempt(completed); checkpointExamSession(boundOwner.current, key, completed);
    const saved = await save(completed);
    if (alive.current && accountId() === submissionOwner && boundOwner.current === submissionOwner && ref.current?.id === completed.id) { setSaving(false); if (saved) { clearSessionCheckpoint(submissionOwner, key, completed.id); navigate(`/${skill}/review/${completed.id}`); } else setError(`${saveFeedback.current || 'Could not save your completed attempt.'} Your answers are retained. Retry submission.`); lock.current = false; }
  }, [catalog.questions, key, save, navigate, skill, retryId]);
  useEffect(() => { if (attempt?.mode === 'mock' && attempt.status === 'active' && attempt.timeLimitSeconds && clock >= attempt.timeLimitSeconds) void submit(); }, [attempt?.status, attempt?.timeLimitSeconds, clock, submit]);
  const pause = () => { if (mode === 'mock' || !ref.current || !unfinishedExamSession(ref.current)) return; practiceTick.current = Date.now(); update({ status: ref.current.status === 'paused' ? 'active' : 'paused' }); };
  const keepSession = async () => {
    if (!ref.current || lock.current || !unfinishedExamSession(ref.current) || accountId() !== boundOwner.current) return false;
    const savingOwner = boundOwner.current;
    const next = { ...ref.current, status: mode === 'practice' ? 'paused' as const : 'active' as const, updatedAt: new Date().toISOString() };
    lock.current = true; setSaving(true); setError('');
    if (timer.current) window.clearTimeout(timer.current);
    ref.current = next; setAttempt(next); checkpointExamSession(savingOwner, key, next);
    const saved = await save(next);
    if (!alive.current || accountId() !== savingOwner || boundOwner.current !== savingOwner || ref.current?.id !== next.id) return false;
    lock.current = false; setSaving(false);
    if (!saved) setError(`${saveFeedback.current || 'Could not save this session.'} Your answers remain in this browser. Retry saving before leaving.`);
    return saved;
  };
  const saveAndExit = async () => { if (await keepSession()) navigate(`/${skill}`); };
  useEffect(() => {
    const checkpoint = () => {
      if (accountId() !== boundOwner.current || !ref.current || !unfinishedExamSession(ref.current)) return;
      const current = ref.current;
      const next = mode === 'practice' && current.status === 'active' ? { ...current, status: 'paused' as const, updatedAt: new Date().toISOString() } : current;
      ref.current = next; setAttempt(next); checkpointExamSession(boundOwner.current, key, next);
    };
    window.addEventListener('pagehide', checkpoint);
    return () => window.removeEventListener('pagehide', checkpoint);
  }, [key, mode]);
  const discard = async () => {
    if (!ref.current || lock.current || !unfinishedExamSession(ref.current) || accountId() !== boundOwner.current) return;
    const original = ref.current; const discardingOwner = boundOwner.current;
    const discarded: ExamAttempt = { ...original, status: 'discarded', discardedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    lock.current = true; setSaving(true); setError('');
    if (timer.current) window.clearTimeout(timer.current);
    ref.current = discarded; setAttempt(discarded); checkpointExamSession(discardingOwner, key, discarded);
    const saved = await save(discarded);
    if (!alive.current || accountId() !== discardingOwner || boundOwner.current !== discardingOwner || ref.current?.id !== discarded.id) return;
    lock.current = false; setSaving(false);
    if (saved) navigate(`/${skill}`);
    else {
      const restored = { ...original, updatedAt: new Date(Math.max(Date.now(), Date.parse(discarded.updatedAt) + 1)).toISOString() };
      ref.current = restored; setAttempt(restored); checkpointExamSession(discardingOwner, key, restored);
      setError(`${saveFeedback.current || 'Could not discard this session.'} Your answers are kept. Retry discarding when the connection is available.`);
    }
  };
  const retrySave = async () => {
    if (!ref.current || lock.current || accountId() !== boundOwner.current) return;
    const savingOwner = boundOwner.current;
    const savingId = ref.current.id;
    lock.current = true; setSaving(true);
    if (timer.current) window.clearTimeout(timer.current);
    const saved = await save(ref.current);
    if (alive.current && accountId() === savingOwner && boundOwner.current === savingOwner && ref.current?.id === savingId) {
      setError(saved ? '' : `${saveFeedback.current || 'Could not save.'} Your answers are retained in this browser.`);
      setSaving(false); lock.current = false;
    }
  };
  return { attempt, elapsed: clock, update, start, pause, keepSession, saveAndExit, discard, submit, saving, error, retrySave };
}
