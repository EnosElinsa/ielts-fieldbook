import { SelectField } from '../../components/SelectField';
import { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, CalendarDays, Check, Clock3, Download, Headphones, List, Monitor, Moon, RotateCcw, Save, Square, Sun, Target, Upload } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { useTheme, type Theme } from '../../context/ThemeContext';
import { AccountPage } from '../account/AccountPage';
import { DeviceVoicePreferences } from '../vocabulary/DeviceVoicePreferences';
import { VOCABULARY_PRACTICE_MODES, type VocabularyPreferences } from '../../domain/vocabulary/preferences';
import { DateField } from '../../components/ui';
import { type PracticeNavigationRequest } from '../../lib/practiceNavigation';
import { accountId } from '../../storage/remote';
import { useConfirmationDialog } from '../../components/useConfirmationDialog';
import { requestSettingsBackup } from './backupActions';
import { settingsChanges, settingsDraft, settingsPlanPreview, rebaseSettingsDraft, type SettingsDraft } from './settingsDraft';
import { VocabularyBackLink } from '../vocabulary/VocabularyRouteLink';
import { safeVocabularyReturn } from '../vocabulary/vocabularyNavigation';
import './settings.css';
import { PlanningSettings, VocabularySourceSettings } from './PlanningSettings';
import { SettingsSection } from './SettingsSection';
import { studyBudget } from '../../lib/planTemplates';
import { studyPlanTitle } from '../../lib/planTargets';
import { emptyState } from '../../domain/state';

const categories = [
  ['target', 'Learning goals'], ['schedule', 'Time and modules'], ['overdue', 'Scheduling and overdue'],
  ['vocabulary', 'Vocabulary sources and balance'], ['practice', 'Practice and audio'], ['workspace', 'Appearance and account'],
] as const;
const categoryIcons = [Target, Clock3, CalendarDays, BookOpen, Headphones, Monitor];
const categoryDescriptions: Record<string, string> = {
  target: 'Set your exam date and the band you want to reach.',
  schedule: 'Choose your study time, weekly routine and practice balance.',
  overdue: 'Control how unfinished tasks return to your schedule.',
  vocabulary: 'Choose your new-word goals, study time and wordbook order.',
  practice: 'Set defaults for practice you start yourself, plus audio and device voices.',
  workspace: 'Choose an appearance, manage your account and keep a backup.',
};
const legacyCategories:Record<string,string>={skills:'schedule',audio:'practice',appearance:'workspace',account:'workspace',backup:'workspace'};
const skillNames = ['listening', 'reading', 'writing', 'speaking'];
const capital = (value: string) => value[0].toUpperCase() + value.slice(1);

export function SettingsPage() {
  const fb = useFieldbook();
  const { theme, setTheme } = useTheme();
  const owner = accountId();
  const { confirm, dialog } = useConfirmationDialog(owner || 'anonymous');
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = safeVocabularyReturn(new URLSearchParams(location.search).get('returnTo'), '');
  const { category: routeCategory } = useParams();
  const category = legacyCategories[routeCategory||''] || (categories.some(([id]) => id === routeCategory) ? routeCategory : 'target');
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
  const showSettingsActions = category !== 'workspace' || dirty || saving || Boolean(error);
  const changesKey=JSON.stringify(changes);
  const [previewChanges,setPreviewChanges]=useState(changes);
  useEffect(()=>{const timer=setTimeout(()=>setPreviewChanges(JSON.parse(changesKey)),180);return()=>clearTimeout(timer);},[changesKey]);
  const preview = useMemo(()=>settingsPlanPreview(fb.state.settings, baseline.current.owner===owner?previewChanges:{}, fb.state.plans || [], undefined, fb.state),[fb.state,previewChanges,owner]);
  const update = (patch: Partial<SettingsDraft>) => { setDraft(current => ({ ...current, ...patch })); setNote(''); setError(''); };
  const vocabulary = (patch: Partial<VocabularyPreferences>) => update({ vocabulary: { ...draft.vocabulary, ...patch } });

  useLayoutEffect(() => {
    historySnapshot.current = { state: window.history.state, url: location.pathname + location.search + location.hash };
  }, [location.key, location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (baseline.current.owner === owner) return;
    const next = settingsDraft(fb.state.settings);
    baseline.current = { draft: next, appearance: theme, owner };
    setDraft(next); setPreviewChanges({}); setAppearance(theme); setError(''); setNote('');
  }, [owner, fb.state.settings, theme]);

  useEffect(() => {
    const blocked = (path: string) => !/^\/settings(?:\/|$)/.test(path) && (dirty || savingRef.current);
    const decide = (proceed: () => void) => {
      if (savingRef.current) return;
      void confirm({ title: 'Discard unsaved settings?', description: 'Your settings changes have not been saved.', confirmLabel: 'Discard and leave', destructive: true }).then(accepted => { if (accepted && accountId() === owner && !savingRef.current) proceed(); });
    };
    const requested = (event: Event) => {
      const request = (event as CustomEvent<PracticeNavigationRequest>).detail;
      if (request && blocked(request.path)) { event.preventDefault(); decide(request.proceed); }
    };
    const leave = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element)?.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.hasAttribute('data-practice-navigation')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (blocked(url.pathname + url.search)) { event.preventDefault(); event.stopPropagation(); decide(() => navigate(url.pathname + url.search + url.hash)); }
    };
    const unload = (event: BeforeUnloadEvent) => { if (dirty || savingRef.current) { event.preventDefault(); event.returnValue = ''; } };
    const pop = (event: PopStateEvent) => {
      if (restoringHistory.current) { restoringHistory.current = false; return; }
      if (!blocked(window.location.pathname + window.location.search)) return;
      event.stopImmediatePropagation();
      const previous = historySnapshot.current;
      const destination = window.location.pathname + window.location.search + window.location.hash;
      const distance = Number(previous.state?.idx) - Number(event.state?.idx);
      // Restore the history cursor before React Router observes a canceled departure.
      if (Number.isFinite(distance) && distance !== 0) { restoringHistory.current = true; window.history.go(distance); }
      else window.history.replaceState(previous.state, '', previous.url);
      decide(() => navigate(destination));
    };
    document.addEventListener('fieldbook:before-navigate', requested);
    document.addEventListener('click', leave, true);
    window.addEventListener('beforeunload', unload);
    window.addEventListener('popstate', pop, true);
    return () => { document.removeEventListener('fieldbook:before-navigate', requested); document.removeEventListener('click', leave, true); window.removeEventListener('beforeunload', unload); window.removeEventListener('popstate', pop, true); };
  }, [dirty, owner, confirm, navigate]);

  const discard = () => { setDraft(structuredClone(baseline.current.draft)); setAppearance(baseline.current.appearance); setError(''); setNote(''); };
  async function resetDefaults(){
    if(await confirm({title:'Reset learning settings?',description:'Load the default learning and practice settings into this draft. Review and save to apply them. Your tasks and history are preserved.',confirmLabel:'Load defaults'})){
      setDraft(settingsDraft(emptyState().settings));setAppearance('system');setError('');setNote('Defaults loaded into your draft. Review the plan preview before saving.');
    }
  }
  async function save() {
    if (savingRef.current) return;
    if (draft.targetBand && (!Number.isFinite(Number(draft.targetBand)) || Number(draft.targetBand) < 1 || Number(draft.targetBand) > 9 || !Number.isInteger(Number(draft.targetBand) * 2))) { setError('Use a target band from 1 to 9 in half-band steps.'); return; }
    if (draft.dailyMinutes < 10 || draft.dailyMinutes > 180 || !Number.isFinite(draft.dailyMinutes)) { setError('Use a daily study time from 10 to 180 minutes.'); return; }
    if (!Number.isInteger(draft.vocabulary.learningBatchSize) || draft.vocabulary.learningBatchSize < 1 || draft.vocabulary.learningBatchSize > 50) { setError('Use a learning batch size from 1 to 50 words.'); return; }
    if (!Number.isInteger(draft.vocabulary.sessionSize) || draft.vocabulary.sessionSize < 1 || draft.vocabulary.sessionSize > 100) { setError('Use a review session size from 1 to 100 questions.'); return; }
    if (!draft.days.length) { setError('Select at least one study day.'); return; }
    const config=draft.planning;
    const valid=(value:number,min:number,max:number)=>Number.isInteger(value)&&value>=min&&value<=max;
    if(!valid(config.blockMinutes,10,90)||!valid(config.newWordsPerDay,0,100)||!valid(config.carryoverPercent,0,100)||!valid(config.vocabularyMinutes,0,180)||!valid(config.vocabularyPercent,0,100)||draft.skills.some(skill=>!valid(config.weights[skill as keyof typeof config.weights],0,10))||(draft.skills.length>0&&!draft.skills.some(skill=>config.weights[skill as keyof typeof config.weights]>0))||Object.values(config.week).some(row=>row.minutes!==undefined&&!valid(row.minutes,0,180))) {setError('Check task size, vocabulary allocation, weekday minutes and module weights.');return;}
    const freshPreview=settingsPlanPreview(fb.state.settings,changes,fb.state.plans||[],undefined,fb.state);
    setPreviewChanges(changes);
    const saveOwner = owner;
    savingRef.current = true; setSaving(true); setError(''); setNote('');
    try {
      const studyChanged = Object.keys(changes).some(key => key !== 'vocabulary') || freshPreview.rebuild;
      const saved = !Object.keys(changes).length || (studyChanged ? await fb.saveStudySettings(changes) : await fb.saveVocabularyPreferences(changes.vocabulary));
      if (saveOwner !== accountId()) return;
      if (!saved) { setError(fb.getStudySettingsError?.() || 'Settings could not be saved. Your changes are still here. Try again.'); return; }
      if (appearance !== baseline.current.appearance) setTheme(appearance);
      baseline.current = { draft, appearance, owner: saveOwner };
      setNote(freshPreview.rebuild ? `Settings saved. Plan refreshed; ${freshPreview.preservedLearning.length} saved learning task${freshPreview.preservedLearning.length===1?'':'s'} kept.` : 'Settings saved.');
    } catch { if (saveOwner === accountId()) setError('Settings could not be saved. Your changes are still here. Try again.'); }
    finally { savingRef.current = false; setSaving(false); }
  }

  async function refreshConflict(){
    const before=baseline.current.draft,edited=draft,saveOwner=owner;
    setSaving(true);savingRef.current=true;
    try{const latest=await fb.refreshPlanningState();if(accountId()!==saveOwner)return;const next=settingsDraft(latest.settings);baseline.current={...baseline.current,draft:next};setDraft(rebaseSettingsDraft(before,edited,next));setPreviewChanges({});setError('');setNote('Latest settings loaded. Your draft edits were retained. Review the plan preview before saving.');}
    catch{if(accountId()===saveOwner)setError('Could not refresh the latest settings. Your draft is retained. Retry when connected.');}
    finally{setSaving(false);savingRef.current=false;}
  }

  function preferenceSelect<K extends keyof VocabularyPreferences>(label: string, key: K, options: { value: VocabularyPreferences[K]; label: string }[]) {
    return <label className="field" key={key}>{label}<SelectField aria-label={label} value={String(draft.vocabulary[key])} onChange={event => vocabulary({ [key]: typeof draft.vocabulary[key] === 'number' ? Number(event.target.value) : event.target.value } as Partial<VocabularyPreferences>)}>{options.map(option => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</SelectField></label>;
  }
  const choices = (values: number[], suffix = '') => values.map(value => ({ value, label: `${value}${suffix}` }));
  const weeklyMinutes = [1,2,3,4,5,6,7].filter(day=>draft.days.includes(day)).reduce((sum,day)=>sum+(draft.planning.week[day]?.minutes??draft.dailyMinutes),0);
  const weekDuration = `${Math.floor(weeklyMinutes / 60) ? `${Math.floor(weeklyMinutes / 60)}h ` : ''}${weeklyMinutes % 60 ? `${weeklyMinutes % 60}m` : ''}`.trim() || '0m';
  const affectedDates = [...new Set(preview.affected.map(plan => plan.dateKey))];
  const settingsActions = showSettingsActions && <footer className="settings-actions"><div className="settings-save-status">{error?<p role="alert">{error}</p>:note?<p role="status"><Check size={16}/>{note}</p>:<p>{dirty?'Unsaved changes':'All changes saved'}</p>}</div><div className="settings-save-buttons"><button className="btn line" type="button" disabled={saving} onClick={()=>void resetDefaults()}>Reset defaults</button><button className="btn line" type="button" disabled={saving || !dirty} onClick={discard}><RotateCcw size={15}/>Discard changes</button><button className="btn primary" type="button" disabled={saving || !dirty} onClick={() => void save()}><Save size={16} />{saving ? 'Saving...' : error ? 'Retry save' : 'Save settings'}</button></div>{['target','schedule','overdue','vocabulary'].includes(category||'')&&<p className="settings-save-help">Saved to your account. Planning changes update upcoming automatic tasks; started and fixed tasks keep their requirements.</p>}{error&&<button className="btn line" type="button" disabled={saving} onClick={()=>void refreshConflict()}>Refresh saved settings and retain my edits</button>}</footer>;
  return <section className="view active settings-page">
    <div className="settings-category-picker"><SelectField aria-label="Settings category" value={category} onChange={event => navigate(`/settings/${event.target.value}${location.search}`, {state:location.state})}>{categories.map(([id,label]) => <option key={id} value={id}>{label}</option>)}</SelectField></div>
    <nav className="settings-categories" aria-label="Settings categories">
      {['Learning','Workspace'].map((group,groupIndex)=><div className="settings-category-section" key={group}>
        <p className="settings-category-group">{group}</p>
        {categories.map(([id,label],index)=>{
          if((index<5)!==(groupIndex===0))return null;
          const Icon=categoryIcons[index];
          return <Link key={id} to={`/settings/${id}${location.search}`} state={location.state} aria-current={category===id?'page':undefined}><Icon size={18} aria-hidden="true"/><span>{label}</span></Link>;
        })}
      </div>)}
    </nav>
    <div className="settings-content">
      {returnTo || location.state?.vocabularyReturn ? <VocabularyBackLink/> : null}
      <header className="settings-section-heading"><div><h2>{categories.find(([id]) => id === category)?.[1]}</h2><p>{categoryDescriptions[category || 'target']}</p></div>{dirty&&<span className="settings-draft-status">Unsaved changes</span>}</header>
      <fieldset className="settings-fields" disabled={saving}>
        {category === 'target' && <SettingsSection title="Exam target" description="Both fields are optional. You can add or change them later."><div className="form">
          <div className="field"><label htmlFor="settings-exam">Exam date (optional)</label><DateField id="settings-exam" label="Exam date" value={draft.examDate} onChange={(examDate: string) => update({ examDate })} /></div>
          <label className="field">Target band (optional)<input aria-label="Target band" type="number" min={1} max={9} step={0.5} value={draft.targetBand} placeholder="None" onChange={event => update({ targetBand: event.target.value })} /></label>
        </div></SettingsSection>}
        {category === 'schedule' && <div className="settings-schedule">
          <SettingsSection title="Daily time" description="Choose a preset or enter the time you can spend on a normal study day."><div className="settings-time-controls"><div className="settings-segment" role="group" aria-label="Daily time presets">{[15,30,45,60,90,120].map(minutes=><button key={minutes} type="button" aria-pressed={draft.dailyMinutes===minutes} onClick={()=>update({dailyMinutes:minutes})}>{minutes} min</button>)}</div><label className="field settings-custom-time">Minutes a day<div className="settings-number-unit"><input aria-label="Minutes a day" type="number" min={10} max={180} step={5} value={draft.dailyMinutes || ''} onChange={event => update({ dailyMinutes: Number(event.target.value) })}/><span aria-hidden="true">min</span></div></label></div></SettingsSection>
          <SettingsSection title="Study days" description="Unselected days stay free of automatically scheduled work."><div className="settings-weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, index) => <label className="settings-weekday" key={label}><input aria-label={label} type="checkbox" checked={draft.days.includes(index + 1)} onChange={event => update({ days: event.target.checked ? [...draft.days, index + 1].sort() : draft.days.filter(day => day !== index + 1) })} /><span>{label}<Check size={15}/></span></label>)}</div>
          <dl className="settings-week-summary"><div><dt>Weekly study time</dt><dd>{weekDuration}</dd></div><div><dt>Study days</dt><dd>{draft.days.length}<small> / week</small></dd></div><div><dt>Daily commitment</dt><dd>{draft.dailyMinutes}<small> min</small></dd></div></dl>
          </SettingsSection><PlanningSettings draft={draft} update={update}/>
        </div>}
        {category === 'schedule' && <><SettingsSection title="Practice modules" description="Choose the skills in your plan. Leave all four unchecked to study vocabulary only."><div className="form">
          <div className="field full"><span>Selected skills</span><div className="settings-skills">{skillNames.map(skill => <label className="check-field" key={skill}><input type="checkbox" checked={draft.skills.includes(skill)} onChange={event => update({ skills: ['writing', 'speaking', 'reading', 'listening'].filter(value => value === skill ? event.target.checked : draft.skills.includes(value)) })} />{capital(skill)}</label>)}</div></div>
          <label className="field">Writing focus<SelectField aria-label="Writing focus" value={draft.focus} onChange={event => update({ focus: event.target.value })}><option value="balanced">Task 1 and Task 2</option><option value="task1">Task 1 first</option><option value="task2">Task 2 first</option></SelectField></label>
          <label className="field">Speaking focus<SelectField aria-label="Speaking focus" value={draft.speakingFocus} onChange={event => update({ speakingFocus: event.target.value })}><option value="balanced">Part 1 and Part 2</option><option value="part1">Part 1 first</option><option value="part2">Part 2 first</option></SelectField></label>
        </div></SettingsSection><PlanningSettings draft={draft} update={update} section="weights"/></>}
        {category === 'overdue' && <PlanningSettings draft={draft} update={update} section="overdue"/>}
        {category === 'vocabulary' && <>
          <PlanningSettings draft={draft} update={update} section="vocabulary"/>
          <VocabularySourceSettings draft={draft} update={update}/>
        </>}
        {category === 'practice' && <SettingsSection title="Practice defaults" description="Used for practice you start yourself. Planned tasks keep their assigned mode and question count."><div className="form">
          {preferenceSelect('Default mode', 'mode', VOCABULARY_PRACTICE_MODES)}
          <label className="field">Review batch size<input aria-label="Review batch size" type="number" min={1} max={100} value={draft.vocabulary.sessionSize||''} onChange={event=>vocabulary({sessionSize:Number(event.target.value)})}/></label>
          {preferenceSelect('Feedback', 'feedback', [{ value: 'end', label: 'After submission' }, { value: 'immediate', label: 'After each answer' }])}
          {preferenceSelect('Order', 'order', [{ value: 'source', label: 'Source order' }, { value: 'due', label: 'Due date' }, { value: 'random', label: 'Shuffle' }])}
          <div className="field"><span>Layout</span><div className="settings-segment" role="group" aria-label="Practice layout">{(['list', 'cards'] as const).map(layout => <button type="button" key={layout} aria-pressed={draft.vocabulary.layout === layout} onClick={() => vocabulary({ layout })}>{layout === 'list' ? <List size={17} /> : <Square size={17} />}{layout === 'list' ? 'List' : 'Focus'}</button>)}</div></div>
          <label className="settings-toggle check-field"><input type="checkbox" checked={draft.vocabulary.autoAdvance} onChange={event => vocabulary({ autoAdvance: event.target.checked })} />Advance with Enter</label>
        </div></SettingsSection>}
        {category === 'practice' && <>
          <SettingsSection title="Audio playback" description="These preferences apply during practice and are saved to your account.">
          <div className="form">
            {preferenceSelect('Accent', 'accent', [{ value: 'uk', label: 'British English' }, { value: 'us', label: 'American English' }])}
            {preferenceSelect('Playback speed', 'speechRate', choices([0.6, 0.8, 1, 1.2, 1.5], 'x'))}
            {preferenceSelect('Repeat', 'repeatCount', choices([1, 2, 3, 5], ' times'))}
            {preferenceSelect('Repeat gap', 'repeatGapMs', [0, 500, 800, 1000, 1500, 2000, 3000].map(value => ({ value, label: `${value / 1000} seconds` })))}
            {preferenceSelect('Audio loop gap', 'audioGapMs', [0, 500, 1000, 1500, 2000, 3000, 5000].map(value => ({ value, label: `${value / 1000} seconds` })))}
            <label className="field">Volume {Math.round(draft.vocabulary.volume * 100)}%<input aria-label="Volume" type="range" min={0} max={1} step={0.05} value={draft.vocabulary.volume} onChange={event => vocabulary({ volume: Number(event.target.value) })} /></label>
            {(['autoPlay', 'audioExamples'] as const).map(key => <label className="settings-toggle check-field" key={key}><input type="checkbox" checked={draft.vocabulary[key]} onChange={event => vocabulary({ [key]: event.target.checked })} />{key === 'autoPlay' ? 'Autoplay' : 'Examples in audio loop'}</label>)}
          </div></SettingsSection><DeviceVoicePreferences disabled={saving} />
        </>}
        {category === 'workspace' && <>
          <SettingsSection title="Appearance" description="Saved on this device when you save settings."><div className="settings-segment" role="group" aria-label="Appearance">{([['light', Sun], ['dark', Moon], ['system', Monitor]] as const).map(([value, Icon]) => <button key={value} type="button" aria-pressed={appearance === value} onClick={() => { setAppearance(value); setNote(''); }}><Icon size={17} />{capital(value)}{appearance === value && <Check size={15} />}</button>)}</div>{settingsActions}</SettingsSection>
          <SettingsSection title="Account" description="Account details have their own save buttons."><AccountPage/></SettingsSection>
          <SettingsSection title="Backup" description="Export your study data or restore a backup file."><div className="btn-row"><button className="btn line" type="button" onClick={() => requestSettingsBackup('export')}><Download size={16} />Export backup</button><button className="btn line" type="button" onClick={() => requestSettingsBackup('import')}><Upload size={16} />Import backup</button></div></SettingsSection>
        </>}
      </fieldset>
      {preview.rebuild && <section className="settings-plan-preview" aria-label="Affected study tasks"><details><summary><RotateCcw size={16}/><span>{preview.affected.length} existing task{preview.affected.length === 1 ? '' : 's'} will change</span></summary>{affectedDates.map(date=><div className="settings-preview-day" key={date}><time>{new Date(`${date}T00:00:00`).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</time><ul>{preview.affected.filter(plan=>plan.dateKey===date).map(plan=><li key={plan.id}>{studyPlanTitle(plan)}</li>)}</ul></div>)}</details><div className="settings-preview-overview"><strong>{preview.scheduled.length} scheduled tasks in the next seven days</strong><div className="settings-preview-modules">{Object.entries(preview.totals).filter(([,minutes])=>minutes>0).map(([skill,minutes])=><span key={skill}>{capital(skill)} <b>{minutes} min</b></span>)}</div></div>{preview.preservedLearning.length>0&&<details className="settings-preserved-learning"><summary>{preview.preservedLearning.length} saved learning task{preview.preservedLearning.length===1?'':'s'} will keep their words</summary><p className="settings-input-help">New limits apply to newly created tasks. These saved selections stay the same.</p><ul>{preview.preservedLearning.map(plan=><li key={plan.id}>{studyPlanTitle(plan)} · {new Date(`${plan.dateKey}T00:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</li>)}</ul></details>}<details><summary>Preview your new week</summary>{preview.days.map(day=>{const tasks=preview.scheduled.filter(plan=>plan.dateKey===day);const used=tasks.reduce((sum,plan)=>sum+Number(plan.estimatedMinutes||0),0);const budget=studyBudget({...fb.state.settings,...draft},day).daily;return <div className="settings-preview-day" key={day}><time>{new Date(`${day}T00:00:00`).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}<small>{used} / {budget} min</small></time><ul>{tasks.length?tasks.map(plan=><li key={plan.id}>{studyPlanTitle(plan)} · {plan.estimatedMinutes} min{plan.origin==='manual'?' · Kept':''}</li>):<li>{budget?'No tasks scheduled':'Rest day'}</li>}</ul></div>;})}</details><p className="settings-field-help">Started, completed, manually arranged tasks and saved word selections keep their content. Other unfinished tasks may move within your budget.</p></section>}
      {category !== 'workspace' && settingsActions}
    </div>
    {dialog}
  </section>;
}
