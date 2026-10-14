import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Clock3, Save } from 'lucide-react';
import { DEFAULT_SETTINGS, dateKey } from '../../domain';
import { DateField } from '../../components/ui';
import { useFieldbook } from '../../context/FieldbookContext';
import { accountId } from '../../storage/remote';
import { settingsChanges, settingsDraft } from '../settings/settingsDraft';

export function needsStudySetup(state: any): boolean {
  const settings = state.settings || {};
  if (settings.studySetupCompletedAt || settings.targetBand || settings.examDate || settings.skills?.length) return false;
  if (settings.dailyMinutes !== DEFAULT_SETTINGS.dailyMinutes || JSON.stringify(settings.days) !== JSON.stringify(DEFAULT_SETTINGS.days) || settings.skillMix !== DEFAULT_SETTINGS.skillMix) return false;
  if (['sessions', 'assessments', 'examAttempts', 'intensiveSessions', 'vocabularyReviews', 'vocabularyEvidence', 'vocabularyActivities', 'wordbookEnrollments', 'vocabularySessions', 'stories'].some(key => state[key]?.length)) return false;
  if (state.plans?.some((plan: any) => ['in_progress', 'completed'].includes(plan.status))) return false;
  return !Object.values(state.drafts || {}).some((draft: any) => [draft.text, draft.transcript, draft.notes, ...Object.values(draft.sections || {})].some(value => String(value || '').trim()));
}

export function StudySetup() {
  const fb = useFieldbook();
  const owner = accountId();
  const baseline = useRef(settingsDraft(fb.state.settings));
  const [draft, setDraft] = useState(baseline.current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  if (completed) return null;
  const update = (patch: Partial<typeof draft>) => { setDraft(current => ({ ...current, ...patch })); setError(''); };
  async function save(useCurrent = false) {
    if (busy.current) return;
    if (!useCurrent) {
      if (!draft.days.length || !draft.skills.length) { setError('Select at least one study day and skill.'); return; }
      if (!Number.isInteger(draft.dailyMinutes) || draft.dailyMinutes < 10 || draft.dailyMinutes > 180) { setError('Use a daily study time from 10 to 180 minutes.'); return; }
      if (draft.targetBand && (!Number.isFinite(Number(draft.targetBand)) || Number(draft.targetBand) < 1 || Number(draft.targetBand) > 9 || !Number.isInteger(Number(draft.targetBand) * 2))) { setError('Use a target band from 1 to 9 in half-band steps.'); return; }
      if (draft.examDate && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.examDate) || draft.examDate < dateKey(new Date()))) { setError('Choose an exam date today or later.'); return; }
    }
    busy.current = true; setSaving(true); setError('');
    try {
      const changes = useCurrent ? {} : settingsChanges(draft, baseline.current);
      const saved = await fb.saveStudySettings({ ...changes, studySetupCompletedAt: new Date().toISOString() });
      if (!alive.current || owner !== accountId()) return;
      if (saved) setCompleted(true);
      else setError(fb.getStudySettingsError?.() || 'Your study plan could not be saved. Your choices are still here. Retry saving.');
    } catch { if (alive.current && owner === accountId()) setError('Your study plan could not be saved. Your choices are still here. Retry saving.'); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  }
  return <form className="study-setup" aria-label="First study setup" noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
    <header><div><p className="kicker">Getting started</p><h3>Your study plan</h3></div><span className="study-setup-total"><Clock3 size={16} />{draft.dailyMinutes * draft.days.length} min / week</span></header>
    <fieldset className="study-setup-fields" disabled={saving}>
      <div className="study-setup-time"><label className="field">Minutes a day<input type="number" aria-label="Minutes a day" min={10} max={180} step={1} value={draft.dailyMinutes || ''} onChange={event => update({ dailyMinutes: Number(event.target.value) })} /></label><div className="study-setup-presets" role="group" aria-label="Daily time presets">{[15, 30, 45, 60].map(minutes => <button type="button" key={minutes} aria-pressed={draft.dailyMinutes === minutes} onClick={() => update({ dailyMinutes: minutes })}>{minutes} min</button>)}</div></div>
      <fieldset className="study-setup-choices"><legend>Study days</legend><div className="study-setup-days">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, index) => <label key={label}><input type="checkbox" aria-label={label} checked={draft.days.includes(index + 1)} onChange={event => update({ days: event.target.checked ? [...draft.days, index + 1].sort() : draft.days.filter(day => day !== index + 1) })} /><span>{label}</span></label>)}</div></fieldset>
      <fieldset className="study-setup-choices"><legend>Skills</legend><div className="study-setup-skills">{['listening', 'reading', 'writing', 'speaking'].map(skill => <label key={skill}><input type="checkbox" checked={draft.skills.includes(skill)} onChange={event => update({ skills: ['writing', 'speaking', 'reading', 'listening'].filter(value => value === skill ? event.target.checked : draft.skills.includes(value)) })} /><span>{skill[0].toUpperCase() + skill.slice(1)}</span><Check size={15} aria-hidden="true" /></label>)}</div></fieldset>
      <details className="study-setup-target"><summary>Exam target (optional)</summary><div><label className="field">Target band<input type="number" aria-label="Target band" min={1} max={9} step={0.5} placeholder="None" value={draft.targetBand} onChange={event => update({ targetBand: event.target.value })} /></label><div className="field"><label htmlFor="setup-exam-date">Exam date</label><DateField id="setup-exam-date" label="Exam date" value={draft.examDate} onChange={(examDate: string) => update({ examDate })} /></div></div></details>
    </fieldset>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <footer><button className="btn primary" type="submit" disabled={saving}><Save size={16} />{saving ? 'Saving...' : error ? 'Retry save' : 'Save study plan'}</button><button className="btn text" type="button" disabled={saving} onClick={() => void save(true)}>Use current plan <ArrowRight size={15} /></button></footer>
  </form>;
}
