import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFieldbook } from '../../context/FieldbookContext';
import { createExamAttempt, gradeAttempt } from '../../domain/exam';
import type { ExamAttempt, ExamCatalog, ExamSkill } from '../../domain/exam/types';
import { accountId } from '../../storage/remote';
import { readExamRecovery, writeExamRecovery, clearExamRecovery } from '../../storage/examRecovery';

export function useExamAttempt(skill: ExamSkill, sourceId: string, mode: 'practice' | 'mock', catalog: ExamCatalog, requestedId?: string | null, retryId?: string | null, planId?: string | null) {
  const fb = useFieldbook(); const navigate = useNavigate(); const owner = accountId();
  const baseKey = `${skill}:${mode}:${sourceId}${retryId ? `:retry:${retryId}` : ''}`;
  const key = `${baseKey}${planId ? `:plan:${planId}` : ''}`;
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null); const ref = useRef<ExamAttempt | null>(null);
  const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [clock, setClock] = useState(0);
  const lock = useRef(false); const timer = useRef<number | null>(null); const alive = useRef(true); const boundOwner = useRef(owner);
  const practiceTick = useRef(Date.now());
  const saveFeedback = useRef('');
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => () => {
    const current = ref.current;
    if (mode !== 'practice' || !current || current.status !== 'active' || accountId() !== boundOwner.current) return;
    const paused = { ...current, status: 'paused' as const, updatedAt: new Date().toISOString() };
    ref.current = paused;
    writeExamRecovery(boundOwner.current, key, paused);
  }, [key, mode]);
  const update = useCallback((patch: Partial<ExamAttempt>) => {
    if (accountId() !== boundOwner.current || !ref.current) return;
    const next = { ...ref.current, ...patch, updatedAt: new Date().toISOString() }; ref.current = next; setAttempt(next); writeExamRecovery(boundOwner.current, key, next);
  }, [key]);
  useEffect(() => {
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
    const existing = (fb.stateRef.current.examAttempts || []).find((row: ExamAttempt) => matches(row) && (requestedId || row.status !== 'completed')) as ExamAttempt | undefined;
    const local = readExamRecovery<ExamAttempt>(owner, key) || (planId ? readExamRecovery<ExamAttempt>(owner, baseKey) : null);
    const validLocal = local && matches(local) ? local : undefined;
    const recovered = validLocal && (!existing || validLocal.updatedAt >= existing.updatedAt) ? validLocal : existing;
    const next = recovered ? { ...recovered } : (mode === 'practice' ? { ...createExamAttempt(catalog.sections, catalog.questions, mode), sourceId, ...(retryId ? { retryOfAttemptId: retryId } : {}), ...(planId ? { planId, questionSnapshot: structuredClone(catalog.questions) } : {}) } : null);
    if (next) { if (mode === 'mock' && next.status === 'paused') next.status = 'active'; ref.current = next; setAttempt(next); setClock(next.elapsedSeconds); practiceTick.current = Date.now(); writeExamRecovery(owner, key, next); if (next.status === 'completed' && validLocal) setError('This completed attempt still needs to be saved. Retry submission.'); }
  }, [owner, key, catalog, requestedId, retryId, sourceId, skill, mode, planId, fb.stateRef]);
  const start = () => {
    if (accountId() !== owner) return;
    const next = createExamAttempt(catalog.sections, catalog.questions, mode);
    next.sourceId = sourceId;
    if (planId) { next.planId = planId; next.questionSnapshot = structuredClone(catalog.questions); }
    if (mode === 'mock') { next.timeLimitSeconds = skill === 'reading' ? 3600 : Math.ceil(catalog.assets.filter(asset => asset.kind === 'audio').reduce((sum, asset) => sum + (asset.duration || 0), 0)) + 120; next.hintsEnabled = false; }
    ref.current = next; setAttempt(next); setClock(0); practiceTick.current = Date.now(); writeExamRecovery(owner, key, next);
  };
  useEffect(() => {
    if (!attempt || attempt.status !== 'active') return;
    const tick = () => {
      if (accountId() !== boundOwner.current || !ref.current || ref.current.status !== 'active') return;
      const now = Date.now(); const elapsed = mode === 'mock' ? Math.max(ref.current.elapsedSeconds, Math.floor((now - Date.parse(ref.current.startedAt)) / 1000)) : ref.current.elapsedSeconds + Math.max(0, Math.floor((now - practiceTick.current) / 1000));
      practiceTick.current = now; ref.current = { ...ref.current, elapsedSeconds: elapsed }; setClock(elapsed); writeExamRecovery(boundOwner.current, key, ref.current);
    };
    tick(); const id = window.setInterval(tick, 1000); return () => window.clearInterval(id);
  }, [attempt?.id, attempt?.status, mode, key]);
  const save = useCallback(async (current: ExamAttempt) => {
    if (accountId() !== boundOwner.current) return false;
    const savingOwner = boundOwner.current;
    const draft = structuredClone(fb.stateRef.current); const rows = (draft.examAttempts || []) as ExamAttempt[];
    draft.examAttempts = [...rows.filter(row => row.id !== current.id), structuredClone(current)];
    saveFeedback.current = '';
    try {
      const saved = await fb.persistNow(draft, { collections: ['examAttempts', 'plans'], onError: (message: string) => { saveFeedback.current = message; } });
      return saved && accountId() === savingOwner && boundOwner.current === savingOwner;
    } catch { return false; }
  }, [fb.persistNow, fb.stateRef]);
  useEffect(() => {
    if (!attempt || attempt.status === 'completed' || saving) return;
    const savingOwner = boundOwner.current;
    timer.current = window.setTimeout(() => { if (ref.current && accountId() === savingOwner && !lock.current) void save(ref.current).then(saved => { if (alive.current && accountId() === savingOwner && boundOwner.current === savingOwner) setError(saved ? '' : saveFeedback.current ? `${saveFeedback.current} Your answers remain in this browser.` : 'Autosave failed. Your answers remain in this browser; retry saving before leaving.'); }); }, 1500);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [attempt, save, saving]);
  const submit = useCallback(async () => {
    if (lock.current || !ref.current || accountId() !== boundOwner.current) return;
    if (skill === 'reading' && retryId && ref.current.status !== 'completed') {
      const missing = catalog.questions.filter(question => question.skill === 'reading' && ref.current!.sectionIds.includes(question.sectionId) && !ref.current!.evidence[question.id]?.trim());
      if (missing.length) { setError(`Add fresh passage evidence for question${missing.length === 1 ? '' : 's'} ${missing.map(question => question.number).join(', ')} before submitting this retry. Your answers are kept.`); return; }
    }
    const submissionOwner = boundOwner.current;
    lock.current = true; if (timer.current) window.clearTimeout(timer.current); setSaving(true); setError('');
    const completed = ref.current.status === 'completed' ? ref.current : gradeAttempt(ref.current, catalog.questions);
    ref.current = completed; setAttempt(completed); writeExamRecovery(boundOwner.current, key, completed);
    const saved = await save(completed);
    if (alive.current && accountId() === submissionOwner && boundOwner.current === submissionOwner) { setSaving(false); if (saved) { clearExamRecovery(submissionOwner, key); navigate(`/${skill}/review/${completed.id}`); } else setError(`${saveFeedback.current || 'Could not save your completed attempt.'} Your answers are retained. Retry submission.`); lock.current = false; }
  }, [catalog.questions, key, save, navigate, skill, retryId]);
  useEffect(() => { if (attempt?.mode === 'mock' && attempt.status === 'active' && attempt.timeLimitSeconds && clock >= attempt.timeLimitSeconds) void submit(); }, [attempt?.status, attempt?.timeLimitSeconds, clock, submit]);
  const pause = () => { if (mode === 'mock' || !ref.current || ref.current.status === 'completed') return; practiceTick.current = Date.now(); update({ status: ref.current.status === 'paused' ? 'active' : 'paused' }); };
  const retrySave = async () => {
    if (!ref.current || lock.current || accountId() !== boundOwner.current) return;
    const savingOwner = boundOwner.current;
    lock.current = true; setSaving(true);
    if (timer.current) window.clearTimeout(timer.current);
    const saved = await save(ref.current);
    if (alive.current && accountId() === savingOwner && boundOwner.current === savingOwner) {
      setError(saved ? '' : `${saveFeedback.current || 'Could not save.'} Your answers are retained in this browser.`);
      setSaving(false); lock.current = false;
    }
  };
  return { attempt, elapsed: clock, update, start, pause, submit, saving, error, retrySave };
}
