import { SelectField } from '../../components/SelectField';
import { PLANNING_SKILLS, type PlanningPreferences } from '../../domain/planningPreferences';
import type { SettingsDraft } from './settingsDraft';
const capital=(value:string)=>value[0].toUpperCase()+value.slice(1);
export function PlanningSettings({draft,update,section='schedule'}:{draft:SettingsDraft;update:(patch:Partial<SettingsDraft>)=>void;section?:'schedule'|'weights'}) {
  const config=draft.planning;
  const change=(patch:Partial<PlanningPreferences>)=>update({planning:{...config,...patch}});
  if(section==='weights')return <div className="settings-planning-section full"><h3>Module balance</h3><p>Higher weights receive more study time. Use 0 to leave a module out of automatic scheduling.</p><div className="settings-weight-grid">{PLANNING_SKILLS.filter(skill=>draft.skills.includes(skill)).map(skill=><label className="field" key={skill}>{capital(skill)} weight<input aria-label={`${capital(skill)} weight`} type="number" min={0} max={10} value={config.weights[skill]} onChange={event=>change({weights:{...config.weights,[skill]:Number(event.target.value)}})}/></label>)}</div></div>;
  return <>
    <section className="settings-planning-section"><h3>Weekly template</h3><p>Leave minutes blank to use your daily time. Set 0 for a rest day. A focus day dedicates practice time to one module.</p><div className="settings-week-template">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((label,index)=>{
      const day=index+1;const row=config.week[day]||{};const enabled=draft.days.includes(day);
      const edit=(patch:Partial<typeof row>)=>change({week:{...config.week,[day]:{...row,...patch}}});
      return <div className={`settings-template-row${enabled?'':' is-disabled'}`} key={day}><span>{label}<small>{enabled?'Study':'Rest'}</small></span>
        <label className="field"><span>Minutes</span><input aria-label={`${label} study minutes`} type="number" min={0} max={180} disabled={!enabled} value={row.minutes??''} placeholder={String(draft.dailyMinutes)} onChange={event=>edit({minutes:event.target.value===''?undefined:Number(event.target.value)})}/></label>
        <label className="field"><span>Focus</span><SelectField aria-label={`${label} focus`} disabled={!enabled} value={row.focus||'balanced'} onValueChange={focus=>edit({focus:focus as typeof row.focus})} options={[{value:'balanced',label:'Use module balance'},...draft.skills.map(value=>({value,label:capital(value)}))]}/></label></div>;
    })}</div></section>
    <section className="settings-planning-section"><h3>Vocabulary time</h3><p>Reserve time for learning and assessed recall. If no vocabulary task is available, the time goes to your other modules.</p><div className="settings-planning-grid">
      <label className="field">Allocation<SelectField aria-label="Vocabulary allocation" value={config.vocabularyMode} onValueChange={value=>change({vocabularyMode:value as 'ratio'|'fixed'})} options={[{value:'ratio',label:'Percentage of each day'},{value:'fixed',label:'Fixed minutes per day'}]}/></label>
      {config.vocabularyMode==='ratio'?<label className="field">Percent<input aria-label="Vocabulary percent" type="number" min={0} max={100} value={config.vocabularyPercent} onChange={event=>change({vocabularyPercent:Number(event.target.value)})}/></label>:<label className="field">Minutes<input aria-label="Vocabulary minutes" type="number" min={0} max={180} value={config.vocabularyMinutes} onChange={event=>change({vocabularyMinutes:Number(event.target.value)})}/></label>}
    </div></section>
    <section className="settings-planning-section"><h3>Task size</h3><div className="settings-planning-grid"><label className="field">Task block minutes<input aria-label="Task block minutes" type="number" min={10} max={90} value={config.blockMinutes} onChange={event=>change({blockMinutes:Number(event.target.value)})}/></label><p className="settings-field-help">Long study days are split into manageable tasks across your selected modules.</p></div>
      <label className="settings-toggle"><input type="checkbox" checked={config.multipleTasks} onChange={event=>change({multipleTasks:event.target.checked})}/>Split practice across multiple tasks</label>
      <label className="settings-toggle"><input type="checkbox" checked={config.preferFullTasks} onChange={event=>change({preferFullTasks:event.target.checked})}/>Prefer full responses when time allows</label>
    </section>
  </>;
}
