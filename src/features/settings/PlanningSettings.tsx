import { SelectField } from '../../components/SelectField';
import { PLANNING_SKILLS, type PlanningPreferences } from '../../domain/planningPreferences';
import type { SettingsDraft } from './settingsDraft';
import { useFieldbook } from '../../context/FieldbookContext';
import { VOCABULARY_CATALOG } from '../../domain/vocabulary/catalog';
import { Link } from 'react-router-dom';
import { SettingsSection } from './SettingsSection';
const capital=(value:string)=>value[0].toUpperCase()+value.slice(1);
export function PlanningSettings({draft,update,section='schedule'}:{draft:SettingsDraft;update:(patch:Partial<SettingsDraft>)=>void;section?:'schedule'|'weights'|'overdue'|'vocabulary'}) {
  const config=draft.planning;
  const change=(patch:Partial<PlanningPreferences>)=>update({planning:{...config,...patch}});
  if(section==='weights')return <SettingsSection title="Module balance" description="Higher weights receive more practice time. A weight of 0 leaves a module out of automatic planning."><div className="settings-weight-grid">{PLANNING_SKILLS.filter(skill=>draft.skills.includes(skill)).map(skill=><label className="field" key={skill}>{capital(skill)} weight<input aria-label={`${capital(skill)} weight`} type="number" min={0} max={10} value={config.weights[skill]} onChange={event=>change({weights:{...config.weights,[skill]:Number(event.target.value)}})}/></label>)}</div>{!draft.skills.length&&<p className="settings-field-help">Your plan uses vocabulary only. Select a skill above to adjust its weight.</p>}</SettingsSection>;
  if(section==='overdue')return <>
    <SettingsSection title="Catch up on overdue tasks" description="Choose how much of each study day can be used for unfinished tasks.">
      <div className="settings-catchup-controls">
        <div className="settings-segment" role="group" aria-label="Catch-up limit presets">{[0,15,30,50,100].map(percent=><button type="button" key={percent} aria-pressed={config.carryoverPercent===percent} onClick={()=>change({carryoverPercent:percent})}>{percent===0?'Off':`${percent}%`}</button>)}</div>
        <label className="field settings-custom-time">Daily catch-up limit<div className="settings-number-unit"><input aria-label="Daily catch-up limit" aria-describedby="settings-catchup-example" type="number" min={0} max={100} value={config.carryoverPercent} onChange={event=>change({carryoverPercent:Number(event.target.value)})}/><span aria-hidden="true">%</span></div></label>
      </div>
      <p id="settings-catchup-example" className="settings-value-explanation" aria-live="polite">{config.carryoverPercent===0?'Automatic catch-up is off. Arrange unfinished tasks from the Waiting list.':config.carryoverPercent>=0&&config.carryoverPercent<=100?`For a ${draft.dailyMinutes}-minute study day: up to ${Math.floor(draft.dailyMinutes*config.carryoverPercent/100)} min for overdue tasks.`:'Choose a limit from 0 to 100%.'}</p>
      <details className="settings-help"><summary>How catch-up works</summary><ul><li>Whole tasks must fit both this limit and the remaining time for their module.</li><li>Tasks that do not fit stay in Waiting. Rest days remain free.</li><li>Started and fixed tasks keep their content and completion requirements.</li></ul></details>
    </SettingsSection>
    <SettingsSection title="Manage waiting tasks" description="Choose a date, hold a task for later, or skip it from your Waiting list."><p className="settings-field-help">Held tasks wait until you resume them. Skipped tasks can be restored from History.</p><Link className="btn line" to="/planning?view=waiting">Open Waiting list</Link></SettingsSection>
    <details className="settings-help settings-reference"><summary>Vocabulary review order</summary><p>The planner uses this fixed order. Each review task shows its reason.</p><ol><li>Confirmed mistakes</li><li>Recovery practice</li><li>Due reviews</li><li>Foundation gaps</li><li>Spaced consolidation</li></ol></details>
  </>;
  if(section==='vocabulary')return <>
    <SettingsSection title="New-word target" description="Set a daily goal. Use 0 to pause new learning; shorter study days may include fewer words."><div className="settings-planning-grid">
      <label className="field">Daily new words<input aria-label="Daily new words" type="number" min={0} max={100} value={config.newWordsPerDay} onChange={event=>change({newWordsPerDay:Number(event.target.value)})}/></label>
    </div></SettingsSection>
    <SettingsSection title="Vocabulary time" description="Reserve time for new words and reviews. Unused vocabulary time goes to your other modules."><div className="settings-planning-grid">
      <label className="field">Allocation<SelectField aria-label="Vocabulary allocation" value={config.vocabularyMode} onValueChange={value=>change({vocabularyMode:value as 'ratio'|'fixed'})} options={[{value:'ratio',label:'Percentage of each day'},{value:'fixed',label:'Fixed minutes per day'}]}/></label>
      {config.vocabularyMode==='ratio'?<label className="field">Percent<input aria-label="Vocabulary percent" type="number" min={0} max={100} value={config.vocabularyPercent} onChange={event=>change({vocabularyPercent:Number(event.target.value)})}/></label>:<label className="field">Minutes<input aria-label="Vocabulary minutes" type="number" min={0} max={180} value={config.vocabularyMinutes} onChange={event=>change({vocabularyMinutes:Number(event.target.value)})}/></label>}
    </div><p className="settings-value-explanation">{config.vocabularyMode==='ratio'?`${config.vocabularyPercent}% of a ${draft.dailyMinutes}-minute day is ${Math.round(draft.dailyMinutes*config.vocabularyPercent/100)} min for vocabulary.`:`Up to ${config.vocabularyMinutes} min per study day, within your daily time.`}</p></SettingsSection>
  </>;
  return <>
    <SettingsSection title="Weekly template" description="Leave minutes blank to use your daily time. Set 0 for a rest day, or choose a focus for that day."><div className="settings-week-template">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((label,index)=>{
      const day=index+1;const row=config.week[day]||{};const enabled=draft.days.includes(day);
      const edit=(patch:Partial<typeof row>)=>change({week:{...config.week,[day]:{...row,...patch}}});
      return <div className={`settings-template-row${enabled?'':' is-disabled'}`} key={day}><span>{label}<small>{enabled?'Study':'Rest'}</small></span>
        <label className="field"><span>Minutes</span><input aria-label={`${label} study minutes`} type="number" min={0} max={180} disabled={!enabled} value={row.minutes??''} placeholder={String(draft.dailyMinutes)} onChange={event=>edit({minutes:event.target.value===''?undefined:Number(event.target.value)})}/></label>
        <label className="field"><span>Focus</span><SelectField aria-label={`${label} focus`} disabled={!enabled} value={row.focus||'balanced'} onValueChange={focus=>edit({focus:focus as typeof row.focus})} options={[{value:'balanced',label:'Use module balance'},...draft.skills.map(value=>({value,label:capital(value)}))]}/></label></div>;
    })}</div></SettingsSection>
    <SettingsSection title="Task size" description="Split longer study days into manageable tasks across your selected modules."><div className="settings-planning-grid"><label className="field">Task block minutes<input aria-label="Task block minutes" type="number" min={10} max={90} value={config.blockMinutes} onChange={event=>change({blockMinutes:Number(event.target.value)})}/></label></div>
      <div className="settings-task-options">
        <label className="settings-toggle check-field"><input type="checkbox" checked={config.multipleTasks} onChange={event=>change({multipleTasks:event.target.checked})}/>Split practice across multiple tasks</label>
        <label className="settings-toggle check-field"><input type="checkbox" checked={config.preferFullTasks} onChange={event=>change({preferFullTasks:event.target.checked})}/>Prefer full responses when time allows</label>
      </div>
    </SettingsSection>
  </>;
}

export function VocabularySourceSettings({draft,update}:{draft:SettingsDraft;update:(patch:Partial<SettingsDraft>)=>void}){
  const fb=useFieldbook(),config=draft.planning;
  const enrolled=((fb.state.wordbookEnrollments||[]) as {bookId:string}[]).map(row=>row.bookId);
  const ids=[...new Set([...config.wordbookOrder.filter(id=>enrolled.includes(id)),...enrolled])];
  const change=(patch:Partial<PlanningPreferences>)=>update({planning:{...config,...patch}});
  function move(index:number,delta:number){const order=[...ids];[order[index],order[index+delta]]=[order[index+delta],order[index]];change({wordbookOrder:order});}
  return <SettingsSection title="Automatic learning sources" description="New words come from your enrolled wordbooks. Words already learned in another book are excluded.">
    <label className="field">Wordbook selection<SelectField aria-label="Wordbook selection" value={config.wordbookMode} onValueChange={value=>change({wordbookMode:value as PlanningPreferences['wordbookMode']})} options={[{value:'ordered',label:'Finish books in order'},{value:'round-robin',label:'Rotate after each batch'}]}/></label>
    {ids.length?<><p className="settings-field-help">Pausing a book stops new words from that book. Due reviews continue.</p><ol className="settings-source-list">{ids.map((id,index)=><li key={id}><span>{VOCABULARY_CATALOG.books.find(book=>book.id===id)?.title||id}</span><label className="check-field"><input type="checkbox" checked={config.pausedWordbooks.includes(id)} onChange={event=>change({pausedWordbooks:event.target.checked?[...config.pausedWordbooks,id]:config.pausedWordbooks.filter(value=>value!==id)})}/>Pause new words</label><div className="btn-row"><button type="button" className="btn line" disabled={!index} aria-label={`Move ${id} up`} onClick={()=>move(index,-1)}>↑</button><button type="button" className="btn line" disabled={index===ids.length-1} aria-label={`Move ${id} down`} onClick={()=>move(index,1)}>↓</button></div></li>)}</ol></>:<div className="settings-empty-source"><p>Enrol in a wordbook to start automatic new-word tasks.</p><Link className="btn line" to="/vocabulary/wordbooks">Browse wordbooks</Link></div>}
  </SettingsSection>;
}
