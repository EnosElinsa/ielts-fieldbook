// @ts-nocheck
import { useEffect, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';
import { ModalFrame } from '../../components/ModalFrame';
import { DateField, FilterMenu } from '../../components/ui';
import { VocabularyPreferencesFields } from '../vocabulary/VocabularyPreferences';
import { normalizeVocabularyPreferences } from '../../domain/vocabulary/preferences';

export function SettingsModal() {
  const fb = useFieldbook();
  const open = fb.modal === 'settings';
  const [examDate, setExamDate] = useState('');
  const [targetBand, setTargetBand] = useState('');
  const [dailyMinutes, setDailyMinutes] = useState(30);
  const [focus, setFocus] = useState('balanced');
  const [skillMix, setSkillMix] = useState('mixed');
  const [speakingFocus, setSpeakingFocus] = useState('balanced');
  const [days, setDays] = useState([1, 2, 3, 4, 5, 6]);
  const [tab,setTab]=useState('study');
  const [vocabulary,setVocabulary]=useState(()=>normalizeVocabularyPreferences(null));
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState('');

  useEffect(() => {
    if (!open) return;
    const s = fb.state.settings;
    setVocabulary(normalizeVocabularyPreferences(s.vocabulary));setSaveError('');setSaving(false);
    setExamDate(s.examDate || '');
    setTargetBand(s.targetBand || '');
    setDailyMinutes(s.dailyMinutes);
    setFocus(s.focus);
    setSkillMix(s.skillMix || 'mixed');
    setSpeakingFocus(s.speakingFocus || 'balanced');
    setDays(s.days || [1]);
  }, [open, fb.state.settings]);

  return (
    <ModalFrame open={open} onClose={() => fb.closeModal()}>
      <div className="modal">
        <h3>Study settings</h3>
        <div className="settings-tabs" role="tablist" aria-label="Study settings"><button type="button" role="tab" aria-selected={tab==='study'} onClick={()=>setTab('study')}>Study plan</button><button type="button" role="tab" aria-selected={tab==='vocabulary'} onClick={()=>setTab('vocabulary')}>Vocabulary practice</button></div>
        {tab==='study' ? <div className="form">
          <div className="field">
            <label htmlFor="examDate">Exam date (optional)</label>
            <DateField id="examDate" label="Exam date" value={examDate} onChange={setExamDate} />
          </div>
          <div className="field">
            <label htmlFor="targetBand">Target band (optional)</label>
            <input
              id="targetBand"
              type="number"
              min={1}
              max={9}
              step={0.5}
              placeholder="None"
              value={targetBand}
              onChange={(e) => setTargetBand(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="dailyMinutes">Minutes a day</label>
            <input
              id="dailyMinutes"
              type="number"
              min={10}
              max={180}
              step={5}
              value={dailyMinutes}
              onChange={(e) => setDailyMinutes(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label id="focus-label">Writing focus</label>
            <FilterMenu
              label="Writing focus"
              value={focus}
              onChange={setFocus}
              options={[
                { value: 'balanced', label: 'Task 1 and Task 2' },
                { value: 'task1', label: 'Task 1 first' },
                { value: 'task2', label: 'Task 2 first' },
              ]}
            />
          </div>
          <div className="field">
            <label id="skillMix-label">What to practise</label>
            <FilterMenu
              label="What to practise"
              value={skillMix}
              onChange={setSkillMix}
              options={[
                { value: 'writing', label: 'Writing only' },
                { value: 'speaking', label: 'Speaking only' },
                { value: 'mixed', label: 'Writing and speaking' },
              ]}
            />
          </div>
          <div className="field">
            <label id="speakingFocus-label">Speaking focus</label>
            <FilterMenu
              label="Speaking focus"
              value={speakingFocus}
              onChange={setSpeakingFocus}
              options={[
                { value: 'balanced', label: 'Part 1 and Part 2' },
                { value: 'part1', label: 'Part 1 first' },
                { value: 'part2', label: 'Part 2 first' },
              ]}
            />
          </div>
          <div className="field full">
            <label>Study days</label>
            <div className="days">
              {[
                [1, 'Mon'],
                [2, 'Tue'],
                [3, 'Wed'],
                [4, 'Thu'],
                [5, 'Fri'],
                [6, 'Sat'],
                [7, 'Sun'],
              ].map(([value, label]) => (
                <label className="day" key={value}>
                  <input
                    type="checkbox"
                    value={value}
                    checked={days.includes(Number(value))}
                    onChange={(e) => {
                      const v = Number(value);
                      setDays((prev) => (e.target.checked ? [...prev, v] : prev.filter((d) => d !== v)));
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div> : <VocabularyPreferencesFields value={vocabulary} onChange={setVocabulary} disabled={saving}/>}
        <div className="rule-note">
          Study records and recordings are stored on your account. A new account starts empty. A backup JSON does not include recordings.
        </div>
        <div className="modal-foot">
          <button className="btn line" type="button" disabled={saving} onClick={() => fb.closeModal()}>
            Cancel
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={saving}
            onClick={async () => {
              if(saving)return;
              if(tab==='vocabulary'){
                setSaving(true);setSaveError('');
                try{if(await fb.saveVocabularyPreferences(vocabulary)){fb.closeModal();fb.toast('Practice settings saved.');}else setSaveError('Settings could not be saved. Your changes are still here.');}catch{setSaveError('Settings could not be saved. Try again.');}finally{setSaving(false);}
                return;
              }
              if (targetBand && (!Number.isFinite(Number(targetBand)) || Number(targetBand) < 1 || Number(targetBand) > 9 || !Number.isInteger(Number(targetBand) * 2))) { fb.toast('Use a target band from 1 to 9 in half-band steps.'); return; }
              const draft = structuredClone(fb.stateRef.current);
              draft.settings = Object.assign({}, draft.settings, {
                examDate,
                targetBand,
                dailyMinutes: Math.min(180, Math.max(10, Number(dailyMinutes) || 30)),
                days: days.length ? days : [1],
                focus,
                skillMix,
                speakingFocus,
              });
              draft.plans = draft.plans.filter((plan) => plan.status !== 'pending');
              if (draft.activePlanId && !draft.plans.some((plan) => plan.id === draft.activePlanId)) {
                draft.activePlanId = null;
              }
              const saved = await fb.persistNow(draft);
              if (!saved) return;
              fb.ensurePlansForSkill();
              fb.closeModal();
              fb.toast('Settings saved. Plans you have not started were rebuilt.');
            }}
          >
            {saving?'Saving...':'Save settings'}
          </button>
        </div>
        {saveError ? <p className="vocabulary-error" role="alert">{saveError}</p>:null}
      </div>
    </ModalFrame>
  );
}
