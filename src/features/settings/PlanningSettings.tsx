import { SelectField } from '../../components/SelectField';
import { PLANNING_SKILLS, type PlanningPreferences } from '../../domain/planningPreferences';
import type { SettingsDraft } from './settingsDraft';
import { useFieldbook } from '../../context/FieldbookContext';
import { VOCABULARY_CATALOG } from '../../domain/vocabulary/catalog';
const capital=(value:string)=>value[0].toUpperCase()+value.slice(1);
export function PlanningSettings({draft,update,section='schedule'}:{draft:SettingsDraft;update:(patch:Partial<SettingsDraft>)=>void;section?:'schedule'|'weights'|'overdue'|'vocabulary'}) {
  const config=draft.planning;
  const change=(patch:Partial<PlanningPreferences>)=>update({planning:{...config,...patch}});
  if(section==='weights')return <div className="settings-planning-section full"><h3>Module balance</h3><p>Higher weights receive more study time. Use 0 to leave a module out of automatic scheduling.</p><div className="settings-weight-grid">{PLANNING_SKILLS.filter(skill=>draft.skills.includes(skill)).map(skill=><label className="field" key={skill}>{capital(skill)} weight<input aria-label={`${capital(skill)} weight`} type="number" min={0} max={10} value={config.weights[skill]} onChange={event=>change({weights:{...config.weights,[skill]:Number(event.target.value)}})}/></label>)}</div></div>;
  if(section==='overdue')return <section className="settings-planning-section"><h3>Automatic catch-up</h3><p>Overdue tasks use this share of your daily budget and must also fit the available module time. Rest days remain free. Started and fixed tasks keep their requirements.</p><div className="settings-planning-grid">
      <label className="field">Automatic carryover (%)<input aria-label="Automatic carryover percent" type="number" min={0} max={100} value={config.carryoverPercent} onChange={event=>change({carryoverPercent:Number(event.target.value)})}/></label>
    </div><p>Use the Waiting list to choose a date, hold a task, or skip it. Held tasks stay there until you resume them. Skipped history can be archived and restored.</p><h3>Review priority</h3><p>Plans first address confirmed mistakes, then recovery practice, due reviews, foundation gaps and spaced consolidation. Each review task shows its reason.</p></section>;
  if(section==='vocabulary')return <>
    <section className="settings-planning-section full"><h3>New-word target</h3><p>After protected tasks, automatic plans reserve new-word time before adding reviews. A target of 0 pauses new learning. A short budget reduces the selected word count.</p><div className="settings-planning-grid">
      <label className="field">Daily new words<input aria-label="Daily new words" type="number" min={0} max={100} value={config.newWordsPerDay} onChange={event=>change({newWordsPerDay:Number(event.target.value)})}/></label>
    </div></section>
    <section className="settings-planning-section full"><h3>Vocabulary time</h3><p>Reserve time for learning and assessed recall. If no vocabulary task is available, the time goes to your other modules.</p><div className="settings-planning-grid">
      <label className="field">Allocation<SelectField aria-label="Vocabulary allocation" value={config.vocabularyMode} onValueChange={value=>change({vocabularyMode:value as 'ratio'|'fixed'})} options={[{value:'ratio',label:'Percentage of each day'},{value:'fixed',label:'Fixed minutes per day'}]}/></label>
      {config.vocabularyMode==='ratio'?<label className="field">Percent<input aria-label="Vocabulary percent" type="number" min={0} max={100} value={config.vocabularyPercent} onChange={event=>change({vocabularyPercent:Number(event.target.value)})}/></label>:<label className="field">Minutes<input aria-label="Vocabulary minutes" type="number" min={0} max={180} value={config.vocabularyMinutes} onChange={event=>change({vocabularyMinutes:Number(event.target.value)})}/></label>}
    </div></section>
  </>;
  return <>
    <section className="settings-planning-section"><h3>Weekly template</h3><p>Leave minutes blank to use your daily time. Set 0 for a rest day. A focus day dedicates practice time to one module.</p><div className="settings-week-template">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((label,index)=>{
      const day=index+1;const row=config.week[day]||{};const enabled=draft.days.includes(day);
      const edit=(patch:Partial<typeof row>)=>change({week:{...config.week,[day]:{...row,...patch}}});
      return <div className={`settings-template-row${enabled?'':' is-disabled'}`} key={day}><span>{label}<small>{enabled?'Study':'Rest'}</small></span>
        <label className="field"><span>Minutes</span><input aria-label={`${label} study minutes`} type="number" min={0} max={180} disabled={!enabled} value={row.minutes??''} placeholder={String(draft.dailyMinutes)} onChange={event=>edit({minutes:event.target.value===''?undefined:Number(event.target.value)})}/></label>
        <label className="field"><span>Focus</span><SelectField aria-label={`${label} focus`} disabled={!enabled} value={row.focus||'balanced'} onValueChange={focus=>edit({focus:focus as typeof row.focus})} options={[{value:'balanced',label:'Use module balance'},...draft.skills.map(value=>({value,label:capital(value)}))]}/></label></div>;
    })}</div></section>
    <section className="settings-planning-section"><h3>Task size</h3><div className="settings-planning-grid"><label className="field">Task block minutes<input aria-label="Task block minutes" type="number" min={10} max={90} value={config.blockMinutes} onChange={event=>change({blockMinutes:Number(event.target.value)})}/></label><p className="settings-field-help">Long study days are split into manageable tasks across your selected modules.</p></div>
      <div className="settings-task-options">
        <label className="settings-toggle check-field"><input type="checkbox" checked={config.multipleTasks} onChange={event=>change({multipleTasks:event.target.checked})}/>Split practice across multiple tasks</label>
        <label className="settings-toggle check-field"><input type="checkbox" checked={config.preferFullTasks} onChange={event=>change({preferFullTasks:event.target.checked})}/>Prefer full responses when time allows</label>
      </div>
    </section>
  </>;
}

export function VocabularySourceSettings({draft,update}:{draft:SettingsDraft;update:(patch:Partial<SettingsDraft>)=>void}){
  const fb=useFieldbook(),config=draft.planning;
  const enrolled=((fb.state.wordbookEnrollments||[]) as {bookId:string}[]).map(row=>row.bookId);
  const ids=[...new Set([...config.wordbookOrder.filter(id=>enrolled.includes(id)),...enrolled])];
  const change=(patch:Partial<PlanningPreferences>)=>update({planning:{...config,...patch}});
  function move(index:number,delta:number){const order=[...ids];[order[index],order[index+delta]]=[order[index+delta],order[index]];change({wordbookOrder:order});}
  return <section className="settings-planning-section full"><h3>Automatic learning sources</h3><p>New words come from your enrolled wordbooks, in group and source order. Already learned words are excluded across books. Pausing a book affects new words; its due reviews remain available.</p>
    <label className="field">Wordbook selection<SelectField aria-label="Wordbook selection" value={config.wordbookMode} onValueChange={value=>change({wordbookMode:value as PlanningPreferences['wordbookMode']})} options={[{value:'ordered',label:'Finish books in order'},{value:'round-robin',label:'Rotate after each batch'}]}/></label>
    {ids.length?<ol className="settings-source-list">{ids.map((id,index)=><li key={id}><span>{VOCABULARY_CATALOG.books.find(book=>book.id===id)?.title||id}</span><label className="check-field"><input type="checkbox" checked={config.pausedWordbooks.includes(id)} onChange={event=>change({pausedWordbooks:event.target.checked?[...config.pausedWordbooks,id]:config.pausedWordbooks.filter(value=>value!==id)})}/>Pause new words</label><div className="btn-row"><button type="button" className="btn line" disabled={!index} aria-label={`Move ${id} up`} onClick={()=>move(index,-1)}>↑</button><button type="button" className="btn line" disabled={index===ids.length-1} aria-label={`Move ${id} down`} onClick={()=>move(index,1)}>↓</button></div></li>)}</ol>:<p>Enrol in a wordbook to enable automatic new-word tasks.</p>}
  </section>;
}
