// @ts-nocheck
import { useEffect, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';

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

  useEffect(() => {
    if (!open) return;
    const s = fb.state.settings;
    setExamDate(s.examDate || '');
    setTargetBand(s.targetBand || '');
    setDailyMinutes(s.dailyMinutes);
    setFocus(s.focus);
    setSkillMix(s.skillMix || 'mixed');
    setSpeakingFocus(s.speakingFocus || 'balanced');
    setDays(s.days || [1]);
  }, [open, fb.state.settings]);

  if (!open) return null;

  return (
    <div className="modal-bg show" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && fb.closeModal()}>
      <div className="modal">
        <h3>Study settings</h3>
        <p>Exam date, target, and how long you study.</p>
        <div className="form">
          <div className="field">
            <label htmlFor="examDate">Exam date (optional)</label>
            <input id="examDate" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="targetBand">Target band (optional)</label>
            <input
              id="targetBand"
              type="number"
              min={0}
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
            <label htmlFor="focus">Writing focus</label>
            <select id="focus" value={focus} onChange={(e) => setFocus(e.target.value)}>
              <option value="balanced">Task 1 and Task 2</option>
              <option value="task1">Task 1 first</option>
              <option value="task2">Task 2 first</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="skillMix">What to practise</label>
            <select id="skillMix" value={skillMix} onChange={(e) => setSkillMix(e.target.value)}>
              <option value="writing">Writing only</option>
              <option value="speaking">Speaking only</option>
              <option value="mixed">Writing and speaking</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="speakingFocus">Speaking focus</label>
            <select id="speakingFocus" value={speakingFocus} onChange={(e) => setSpeakingFocus(e.target.value)}>
              <option value="balanced">Part 1 and Part 2</option>
              <option value="part1">Part 1 first</option>
              <option value="part2">Part 2 first</option>
            </select>
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
        </div>
        <div className="rule-note">
          Your data stays with this browser address. localhost and 127.0.0.1 keep separate copies. Export a backup before
          you switch, then import it at the new address.
        </div>
        <div className="modal-foot">
          <button className="btn line" type="button" onClick={() => fb.closeModal()}>
            Cancel
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={() => {
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
              fb.persistNow(draft);
              fb.ensurePlansForSkill();
              fb.closeModal();
              fb.toast('Settings saved. Plans you have not started were rebuilt.');
            }}
          >
            Save settings
          </button>
        </div>
      </div>
    </div>
  );
}
