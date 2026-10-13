import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Check, Download, List, Monitor, Moon, Save, Square, Sun, Upload } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { useTheme, type Theme } from '../../context/ThemeContext';
import { AccountPage } from '../account/AccountPage';
import { DeviceVoicePreferences } from '../vocabulary/DeviceVoicePreferences';
import { VOCABULARY_PRACTICE_MODES, type VocabularyPreferences } from '../../domain/vocabulary/preferences';
import { DateField } from '../../components/ui';
import { navigateWithPracticeGuard, type PracticeNavigationRequest } from '../../lib/practiceNavigation';
import { accountId } from '../../storage/remote';
import { requestSettingsBackup } from './backupActions';
import { settingsChanges, settingsDraft, settingsPlanPreview, type SettingsDraft } from './settingsDraft';
import './settings.css';

const categories = [
  ['target', 'Target'], ['schedule', 'Study time'], ['skills', 'Skills'], ['vocabulary', 'Vocabulary'],
  ['audio', 'Audio'], ['appearance', 'Appearance'], ['account', 'Account'], ['backup', 'Backup'],
] as const;
const skillNames = ['listening', 'reading', 'writing', 'speaking'];
const capital = (value: string) => value[0].toUpperCase() + value.slice(1);

export function SettingsPage() {
  const fb = useFieldbook();
  const { theme, setTheme } = useTheme();
  const owner = accountId();
  const navigate = useNavigate();
  const location = useLocation();
  const { category: routeCategory } = useParams();
  const category = categories.some(([id]) => id === routeCategory) ? routeCategory : 'target';
  const [draft, setDraft] = useState(() => settingsDraft(fb.state.settings));
  const [appearance, setAppearance] = useState<Theme>(theme);
  const baseline = useRef({ draft, appearance: theme, owner });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const historySnapshot = useRef({ state: window.history.state, url: location.pathname + location.search + location.hash });
  const restoringHistory = useRef(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const changes = settingsChanges(draft, baseline.current.draft);
  const dirty = Object.keys(changes).length > 0 || appearance !== baseline.current.appearance;
  const preview = settingsPlanPreview(fb.state.settings, changes, fb.state.plans || []);
  const update = (patch: Partial<SettingsDraft>) => { setDraft(current => ({ ...current, ...patch })); setNote(''); };
  const vocabulary = (patch: Partial<VocabularyPreferences>) => update({ vocabulary: { ...draft.vocabulary, ...patch } });

  useLayoutEffect(() => {
    historySnapshot.current = { state: window.history.state, url: location.pathname + location.search + location.hash };
  }, [location.key, location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (baseline.current.owner === owner) return;
    const next = settingsDraft(fb.state.settings);
    baseline.current = { draft: next, appearance: theme, owner };
    setDraft(next); setAppearance(theme); setError(''); setNote('');
  }, [owner, fb.state.settings, theme]);

  useEffect(() => {
    const allow = (path: string) => /^\/settings(?:\/|$)/.test(path) || !savingRef.current && (!dirty || window.confirm('Discard your unsaved settings changes?'));
    const requested = (event: Event) => {
      const request = (event as CustomEvent<PracticeNavigationRequest>).detail;
      if (request && !allow(request.path)) event.preventDefault();
    };
    const leave = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element)?.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.hasAttribute('data-practice-navigation')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (!allow(url.pathname + url.search)) { event.preventDefault(); event.stopPropagation(); }
    };
    const unload = (event: BeforeUnloadEvent) => { if (dirty || savingRef.current) { event.preventDefault(); event.returnValue = ''; } };
    const pop = (event: PopStateEvent) => {
      if (restoringHistory.current) { restoringHistory.current = false; return; }
      if (allow(window.location.pathname + window.location.search)) return;
      event.stopImmediatePropagation();
      const previous = historySnapshot.current;
      const distance = Number(previous.state?.idx) - Number(event.state?.idx);
      // Restore the history cursor before React Router observes a canceled departure.
      if (Number.isFinite(distance) && distance !== 0) { restoringHistory.current = true; window.history.go(distance); }
      else window.history.replaceState(previous.state, '', previous.url);
    };
    document.addEventListener('fieldbook:before-navigate', requested);
    document.addEventListener('click', leave, true);
    window.addEventListener('beforeunload', unload);
    window.addEventListener('popstate', pop, true);
    return () => { document.removeEventListener('fieldbook:before-navigate', requested); document.removeEventListener('click', leave, true); window.removeEventListener('beforeunload', unload); window.removeEventListener('popstate', pop, true); };
  }, [dirty]);

  const cancel = () => navigateWithPracticeGuard('/', () => navigate('/'));
  async function save() {
    if (savingRef.current) return;
    if (draft.targetBand && (!Number.isFinite(Number(draft.targetBand)) || Number(draft.targetBand) < 1 || Number(draft.targetBand) > 9 || !Number.isInteger(Number(draft.targetBand) * 2))) { setError('Use a target band from 1 to 9 in half-band steps.'); return; }
    if (draft.dailyMinutes < 10 || draft.dailyMinutes > 180 || !Number.isFinite(draft.dailyMinutes)) { setError('Use a daily study time from 10 to 180 minutes.'); return; }
    if (!Number.isInteger(draft.vocabulary.learningBatchSize) || draft.vocabulary.learningBatchSize < 1 || draft.vocabulary.learningBatchSize > 50) { setError('Use a learning batch size from 1 to 50 words.'); return; }
    if (!draft.days.length || !draft.skills.length) { setError('Select at least one study day and skill.'); return; }
    const saveOwner = owner;
    savingRef.current = true; setSaving(true); setError(''); setNote('');
    try {
      const studyChanged = Object.keys(changes).some(key => key !== 'vocabulary') || preview.rebuild;
      const saved = !Object.keys(changes).length || (studyChanged ? await fb.saveStudySettings(changes) : await fb.saveVocabularyPreferences(changes.vocabulary));
      if (saveOwner !== accountId()) return;
      if (!saved) { setError('Settings could not be saved. Your changes are still here. Try again.'); return; }
      if (appearance !== baseline.current.appearance) setTheme(appearance);
      baseline.current = { draft, appearance, owner: saveOwner };
      setNote('Settings saved.');
    } catch { if (saveOwner === accountId()) setError('Settings could not be saved. Your changes are still here. Try again.'); }
    finally { savingRef.current = false; setSaving(false); }
  }

  function preferenceSelect<K extends keyof VocabularyPreferences>(label: string, key: K, options: { value: VocabularyPreferences[K]; label: string }[]) {
    return <label className="field" key={key}>{label}<select aria-label={label} value={String(draft.vocabulary[key])} onChange={event => vocabulary({ [key]: typeof draft.vocabulary[key] === 'number' ? Number(event.target.value) : event.target.value } as Partial<VocabularyPreferences>)}>{options.map(option => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select></label>;
  }
  const choices = (values: number[], suffix = '') => values.map(value => ({ value, label: `${value}${suffix}` }));
  return <section className="view active settings-page">
    <nav className="settings-categories" aria-label="Settings categories">{categories.map(([id, label]) => <Link key={id} to={`/settings/${id}`} aria-current={category === id ? 'page' : undefined}>{label}</Link>)}</nav>
    <div className="settings-content">
      <h2>{categories.find(([id]) => id === category)?.[1]}</h2>
      {category === 'account' ? <AccountPage /> : <fieldset className="settings-fields" disabled={saving}>
        {category === 'target' && <div className="form">
          <div className="field"><label htmlFor="settings-exam">Exam date (optional)</label><DateField id="settings-exam" label="Exam date" value={draft.examDate} onChange={(examDate: string) => update({ examDate })} /></div>
          <label className="field">Target band (optional)<input aria-label="Target band" type="number" min={1} max={9} step={0.5} value={draft.targetBand} placeholder="None" onChange={event => update({ targetBand: event.target.value })} /></label>
        </div>}
        {category === 'schedule' && <div className="form">
          <label className="field">Minutes a day<input aria-label="Minutes a day" type="number" min={10} max={180} step={5} value={draft.dailyMinutes} onChange={event => update({ dailyMinutes: Number(event.target.value) })} /></label>
          <div className="field full"><span>Study days</span><div className="days">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, index) => <label className="day" key={label}><input type="checkbox" checked={draft.days.includes(index + 1)} onChange={event => update({ days: event.target.checked ? [...draft.days, index + 1].sort() : draft.days.filter(day => day !== index + 1) })} />{label}</label>)}</div></div>
        </div>}
        {category === 'skills' && <div className="form">
          <div className="field full"><span>Selected skills</span><div className="settings-skills">{skillNames.map(skill => <label key={skill}><input type="checkbox" checked={draft.skills.includes(skill)} onChange={event => update({ skills: ['writing', 'speaking', 'reading', 'listening'].filter(value => value === skill ? event.target.checked : draft.skills.includes(value)) })} />{capital(skill)}</label>)}</div></div>
          <label className="field">Writing focus<select value={draft.focus} onChange={event => update({ focus: event.target.value })}><option value="balanced">Task 1 and Task 2</option><option value="task1">Task 1 first</option><option value="task2">Task 2 first</option></select></label>
          <label className="field">Speaking focus<select value={draft.speakingFocus} onChange={event => update({ speakingFocus: event.target.value })}><option value="balanced">Part 1 and Part 2</option><option value="part1">Part 1 first</option><option value="part2">Part 2 first</option></select></label>
        </div>}
        {category === 'vocabulary' && <div className="form">
          {preferenceSelect('Default mode', 'mode', VOCABULARY_PRACTICE_MODES)}
          <label className="field">Learning batch size<input aria-label="Learning batch size" type="number" min={1} max={50} value={draft.vocabulary.learningBatchSize || ''} onChange={event => vocabulary({ learningBatchSize: Number(event.target.value) })} /></label>
          {preferenceSelect('Review batch size', 'sessionSize', choices([5, 10, 20, 50, 100], ' words'))}
          {preferenceSelect('Feedback', 'feedback', [{ value: 'end', label: 'After submission' }, { value: 'immediate', label: 'During practice' }])}
          {preferenceSelect('Order', 'order', [{ value: 'source', label: 'Source order' }, { value: 'due', label: 'Due date' }, { value: 'random', label: 'Shuffle' }])}
          <div className="field"><span>Layout</span><div className="settings-segment" role="group" aria-label="Practice layout">{(['list', 'cards'] as const).map(layout => <button type="button" key={layout} aria-pressed={draft.vocabulary.layout === layout} onClick={() => vocabulary({ layout })}>{layout === 'list' ? <List size={17} /> : <Square size={17} />}{layout === 'list' ? 'List' : 'Focus'}</button>)}</div></div>
          <label className="settings-toggle"><input type="checkbox" checked={draft.vocabulary.autoAdvance} onChange={event => vocabulary({ autoAdvance: event.target.checked })} />Advance with Enter</label>
        </div>}
        {category === 'audio' && <>
          <div className="form">
            {preferenceSelect('Accent', 'accent', [{ value: 'uk', label: 'British English' }, { value: 'us', label: 'American English' }])}
            {preferenceSelect('Playback speed', 'speechRate', choices([0.6, 0.8, 1, 1.2, 1.5], 'x'))}
            {preferenceSelect('Repeat', 'repeatCount', choices([1, 2, 3, 5], ' times'))}
            {preferenceSelect('Repeat gap', 'repeatGapMs', [0, 500, 800, 1000, 1500, 2000, 3000].map(value => ({ value, label: `${value / 1000} seconds` })))}
            {preferenceSelect('Audio loop gap', 'audioGapMs', [0, 500, 1000, 1500, 2000, 3000, 5000].map(value => ({ value, label: `${value / 1000} seconds` })))}
            <label className="field">Volume {Math.round(draft.vocabulary.volume * 100)}%<input aria-label="Volume" type="range" min={0} max={1} step={0.05} value={draft.vocabulary.volume} onChange={event => vocabulary({ volume: Number(event.target.value) })} /></label>
            {(['autoPlay', 'audioExamples'] as const).map(key => <label className="settings-toggle" key={key}><input type="checkbox" checked={draft.vocabulary[key]} onChange={event => vocabulary({ [key]: event.target.checked })} />{key === 'autoPlay' ? 'Autoplay' : 'Examples in audio loop'}</label>)}
          </div><DeviceVoicePreferences disabled={saving} />
        </>}
        {category === 'appearance' && <div className="settings-segment" role="group" aria-label="Appearance">{([['light', Sun], ['dark', Moon], ['system', Monitor]] as const).map(([value, Icon]) => <button key={value} type="button" aria-pressed={appearance === value} onClick={() => { setAppearance(value); setNote(''); }}><Icon size={17} />{capital(value)}{appearance === value && <Check size={15} />}</button>)}</div>}
        {category === 'backup' && <div className="btn-row"><button className="btn line" type="button" onClick={() => requestSettingsBackup('export')}><Download size={16} />Export backup</button><button className="btn line" type="button" onClick={() => requestSettingsBackup('import')}><Upload size={16} />Import backup</button></div>}
      </fieldset>}
      {preview.rebuild && <section className="settings-plan-preview" aria-label="Affected study tasks"><h3>{preview.affected.length} pending task{preview.affected.length === 1 ? '' : 's'} will be rebuilt</h3>{preview.affected.length > 0 && <ul>{preview.affected.map(plan => <li key={plan.id}><time>{plan.dateKey}</time><span>{plan.title}</span></li>)}</ul>}</section>}
      {error && <p className="vocabulary-error" role="alert">{error}</p>}
      {note && <p role="status">{note}</p>}
      <footer className="settings-actions"><button className="btn line" type="button" disabled={saving} onClick={cancel}>Cancel</button><button className="btn primary" type="button" disabled={saving || !dirty} onClick={() => void save()}><Save size={16} />{saving ? 'Saving...' : 'Save settings'}</button></footer>
    </div>
  </section>;
}
