import { useEffect, useRef, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';
import { ModalFrame } from '../../components/ModalFrame';
import { DateField, FilterMenu } from '../../components/ui';
import { VocabularyPreferencesFields } from '../vocabulary/VocabularyPreferences';
import { normalizeVocabularyPreferences } from '../../domain/vocabulary/preferences';

function settingsDraft(settings: any) {
  return {
    examDate: settings.examDate || '', targetBand: String(settings.targetBand || ''),
    dailyMinutes: settings.dailyMinutes ?? 30, focus: settings.focus || 'balanced',
    skillMix: settings.skillMix || 'mixed', speakingFocus: settings.speakingFocus || 'balanced',
    days: [...(settings.days || [1])], vocabulary: normalizeVocabularyPreferences(settings.vocabulary),
  };
}
type SettingsDraft = ReturnType<typeof settingsDraft>;
const same = (first: unknown, second: unknown) => JSON.stringify(first) === JSON.stringify(second);

export function SettingsModal() {
  const fb = useFieldbook();
  const open = fb.modal === 'settings';
  const [draft, setDraft] = useState(() => settingsDraft(fb.state.settings));
  const original = useRef(draft);
  const wasOpen = useRef(false);
  const savingRef = useRef(false);
  const [tab, setTab] = useState<'study' | 'vocabulary'>('study');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (open && !wasOpen.current) {
      const next = settingsDraft(fb.state.settings);
      original.current = next;
      setDraft(next);
      setSaveError('');
      setTab('study');
    }
    wasOpen.current = open;
  }, [open, fb.state.settings]);

  const update = (patch: Partial<SettingsDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const dirty = !same(draft, original.current);
  function close() {
    if (savingRef.current) return;
    if (dirty && !window.confirm('Discard your unsaved settings changes?')) return;
    fb.closeModal();
  }
  async function save() {
    if (savingRef.current) return;
    if (draft.targetBand && (!Number.isFinite(Number(draft.targetBand)) || Number(draft.targetBand) < 1 || Number(draft.targetBand) > 9 || !Number.isInteger(Number(draft.targetBand) * 2))) {
      setSaveError('Use a target band from 1 to 9 in half-band steps.');
      return;
    }
    const changes = Object.fromEntries(Object.entries(draft).filter(([key, value]) => !same(value, original.current[key as keyof SettingsDraft])));
    if ('vocabulary' in changes) changes.vocabulary = Object.fromEntries(Object.entries(draft.vocabulary).filter(([key, value]) => !same(value, original.current.vocabulary[key as keyof typeof draft.vocabulary])));
    const studyChanged = Object.keys(changes).some((key) => key !== 'vocabulary');
    if (!Object.keys(changes).length) { fb.closeModal(); return; }
    if ('dailyMinutes' in changes) changes.dailyMinutes = Math.min(180, Math.max(10, Number(draft.dailyMinutes) || 30));
    if ('days' in changes) changes.days = draft.days.length ? draft.days : [1];
    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const saved = studyChanged ? await fb.saveStudySettings(changes) : await fb.saveVocabularyPreferences(changes.vocabulary);
      if (!saved) { setSaveError('Settings could not be saved. Your changes are still here.'); return; }
      original.current = draft;
      fb.closeModal();
      fb.toast(studyChanged ? 'Settings saved. Plans you have not started were rebuilt.' : 'Practice settings saved.');
    } catch {
      setSaveError('Settings could not be saved. Your changes are still here. Try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <ModalFrame open={open} onClose={close} title="Study settings" header="Your workspace" description="Set your study plan and vocabulary practice preferences." busy={saving} footer={<><button className="btn line" type="button" disabled={saving} onClick={close}>Cancel</button><button className="btn primary" type="button" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save settings'}</button></>}>
    <div className="settings-tabs" role="tablist" aria-label="Study settings">
      <button type="button" id="study-settings-tab" role="tab" aria-controls="study-settings-panel" aria-selected={tab === 'study'} disabled={saving} onClick={() => setTab('study')}>Study plan</button>
      <button type="button" id="vocabulary-settings-tab" role="tab" aria-controls="vocabulary-settings-panel" aria-selected={tab === 'vocabulary'} disabled={saving} onClick={() => setTab('vocabulary')}>Vocabulary practice</button>
    </div>
    {tab === 'study' ? <section id="study-settings-panel" role="tabpanel" aria-labelledby="study-settings-tab"><fieldset className="settings-form" disabled={saving}><div className="form">
      <div className="field"><label htmlFor="examDate">Exam date (optional)</label><DateField id="examDate" label="Exam date" value={draft.examDate} onChange={(examDate) => update({ examDate })} /></div>
      <div className="field"><label htmlFor="targetBand">Target band (optional)</label><input id="targetBand" type="number" min={1} max={9} step={0.5} placeholder="None" value={draft.targetBand} onChange={(event) => update({ targetBand: event.target.value })} /></div>
      <div className="field"><label htmlFor="dailyMinutes">Minutes a day</label><input id="dailyMinutes" type="number" min={10} max={180} step={5} value={draft.dailyMinutes} onChange={(event) => update({ dailyMinutes: Number(event.target.value) })} /></div>
      <div className="field"><label>Writing focus</label><FilterMenu label="Writing focus" value={draft.focus} onChange={(focus) => update({ focus })} options={[{ value: 'balanced', label: 'Task 1 and Task 2' }, { value: 'task1', label: 'Task 1 first' }, { value: 'task2', label: 'Task 2 first' }]} /></div>
      <div className="field"><label>What to practise</label><FilterMenu label="What to practise" value={draft.skillMix} onChange={(skillMix) => update({ skillMix })} options={[{ value: 'writing', label: 'Writing only' }, { value: 'speaking', label: 'Speaking only' }, { value: 'mixed', label: 'Writing and speaking' }]} /></div>
      <div className="field"><label>Speaking focus</label><FilterMenu label="Speaking focus" value={draft.speakingFocus} onChange={(speakingFocus) => update({ speakingFocus })} options={[{ value: 'balanced', label: 'Part 1 and Part 2' }, { value: 'part1', label: 'Part 1 first' }, { value: 'part2', label: 'Part 2 first' }]} /></div>
      <div className="field full"><label>Study days</label><div className="days">{[[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']].map(([day, label]) => <label className="day" key={day}><input type="checkbox" value={day} checked={draft.days.includes(Number(day))} onChange={(event) => update({ days: event.target.checked ? [...draft.days, Number(day)] : draft.days.filter((value: number) => value !== Number(day)) })} />{label}</label>)}</div></div>
    </div></fieldset></section> : <section id="vocabulary-settings-panel" role="tabpanel" aria-labelledby="vocabulary-settings-tab"><VocabularyPreferencesFields value={draft.vocabulary} onChange={(vocabulary) => update({ vocabulary })} disabled={saving} /></section>}
    <p className="rule-note">Study records and recordings are stored on your account. A new account starts empty. A backup JSON does not include recordings.</p>
    {saveError ? <p className="vocabulary-error" role="alert">{saveError}</p> : null}
  </ModalFrame>;
}
