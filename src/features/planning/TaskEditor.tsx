// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { ModalFrame } from '../../components/ModalFrame';
import { DateField, FilterMenu } from '../../components/ui';
import { SelectField } from '../../components/SelectField';
import { useFieldbook } from '../../context/FieldbookContext';
import { manualStudyTask, studyBudget, validatePlanDuration } from '../../lib/planTemplates';
import { TASK_PRACTICES } from '../../lib/planningTaskOptions';
import { loadExamCatalog, loadExamSections } from '../../storage/examCatalog';
import { VOCABULARY_CATALOG } from '../../domain/vocabulary/catalog';
import { accountId } from '../../storage/remote';
const capital=value=>value[0].toUpperCase()+value.slice(1);
const titles={add:'Add task',replace:'Replace task',resize:'Edit duration',reschedule:'Reschedule task',duplicate:'Duplicate task',restore:'Restore task'};

export function TaskEditor({mode,plan,dateKey,onClose}) {
  const fb=useFieldbook();const owner=accountId();
  const [skill,setSkill]=useState(plan?.skill||'writing');
  const [practice,setPractice]=useState(mode==='replace'?'recommended':plan?.kind?.endsWith('-mock')?plan.kind:'recommended');
  const [minutes,setMinutes]=useState(plan?.estimatedMinutes||Math.min(30,studyBudget(fb.state.settings,dateKey).daily)||30);
  const [date,setDate]=useState(dateKey||plan?.dateKey);
  const [material,setMaterial]=useState('');const [sentence,setSentence]=useState('');const [batch,setBatch]=useState(1);const [search,setSearch]=useState('');
  const [materials,setMaterials]=useState([]);const [sentences,setSentences]=useState([]);const [loading,setLoading]=useState(false);const [materialError,setMaterialError]=useState('');const [retry,setRetry]=useState(0);
  const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [allowOverBudget,setAllowOverBudget]=useState(false);
  const editing=['add','replace'].includes(mode);
  useEffect(()=>{if(accountId()!==owner)onClose();},[owner,onClose]);
  useEffect(()=>{
    if(!editing)return;
    let alive=true;setLoading(true);setMaterialError('');setMaterials([]);
    const read=async()=>{
      if(['writing','speaking'].includes(skill)) {
        const bank=await fb.ensureQuestionBank?.(skill,retry>0)|| (skill==='writing'?fb.state.questions:fb.state.speakingTopics)||[];
        return bank.filter(row=>!row.incomplete).map(row=>({id:String(row.id),label:row.name||row.title||row.topic||row.prompt||`Question ${row.id}`,part:String(skill==='writing'?row.type:row.part)}));
      }
      if(skill==='vocabulary') {
        await fb.loadVocabularyCatalog?.();
        const enrolled=new Set(fb.state.wordbookEnrollments?.map(row=>row.bookId));
        return VOCABULARY_CATALOG.units.filter(row=>enrolled.has(row.bookId)&&row.kind!=='chapter').map(row=>({id:row.id,bookId:row.bookId,label:row.title,batches:Math.max(1,Math.ceil((row.entryIds?.length||row.totalSourceWords||10)/(fb.state.settings.vocabulary?.learningBatchSize||10)))}));
      }
      const catalog=await loadExamCatalog(skill,undefined,{force:retry>0});
      return catalog.sections.filter(row=>row.skill===skill&&row.status==='ready').map(row=>({id:row.id,label:`${catalog.papers.find(p=>p.id===row.paperId)?.title||row.title} / ${skill==='reading'?'Passage':'Part'} ${row.part}`}));
    };
    read().then(rows=>{if(alive&&accountId()===owner)setMaterials(rows);}).catch(cause=>{if(alive&&accountId()===owner)setMaterialError(cause.message||'Materials could not load. Retry.');}).finally(()=>{if(alive&&accountId()===owner)setLoading(false);});
    return ()=>{alive=false;};
  },[skill,retry,editing,owner]);
  useEffect(()=>{
    setSentences([]);setSentence('');
    if(practice!=='listening-intensive'||!material)return;
    let alive=true;setLoading(true);setMaterialError('');
    loadExamSections([material]).then(catalog=>{if(alive&&accountId()===owner)setSentences(catalog.sections.find(row=>row.id===material)?.sentences||[]);}).catch(cause=>{if(alive)setMaterialError(cause.message);}).finally(()=>{if(alive)setLoading(false);});
    return ()=>{alive=false;};
  },[material,practice,retry,owner]);
  const options=TASK_PRACTICES[skill]||[];
  const selected=materials.find(row=>row.id===material);
  const config={type:mode,skill,practice,estimatedMinutes:Number(minutes),dateKey:date,allowOverBudget,
    ...(material&&['writing','speaking'].includes(skill)?{questionId:material}:{}),
    ...(material&&['reading','listening'].includes(skill)?{sectionId:material}:{}),
    ...(sentence?{sentenceId:sentence}:{}),
    ...(skill==='vocabulary'&&material?{bookId:selected?.bookId,unitId:material,batchIndex:batch-1}:{})};
  const preview=useMemo(()=>{try{if(!editing){if(mode==='resize')validatePlanDuration(plan,Number(minutes));return {task:plan};}return {task:manualStudyTask(fb.state,config)};}catch(cause){return {error:cause.message};}},[editing,mode,plan,skill,practice,minutes,material,sentence,batch,fb.state]);
  const duration=mode==='resize'||editing?Number(minutes):Number(plan?.estimatedMinutes||0);
  const used=fb.state.plans.filter(row=>row.dateKey===date&&row.status!=='skipped'&&(mode==='duplicate'||row.id!==plan?.id)).reduce((sum,row)=>sum+Number(row.estimatedMinutes||0),0);
  const budget=studyBudget(fb.state.settings,date).daily;const over=Math.max(0,used+duration-budget);
  const kind=preview.task?.kind||'';
  const part=skill==='writing'?kind==='writing-mock'?'1':kind:preview.task?.target?.part==='3'?'2':preview.task?.target?.part||'1';
  const visible=materials.filter(row=>(!['writing','speaking'].includes(skill)||row.part===part)&&(row.id===material||String(row.label).toLowerCase().includes(search.toLowerCase())));
  function reset(){setMaterial('');setSearch('');setError('');setAllowOverBudget(false);}
  async function save(){
    if(saving||accountId()!==owner)return;setSaving(true);setError('');
    const action=editing?config:mode==='resize'?{type:mode,estimatedMinutes:Number(minutes),allowOverBudget}:{type:mode,dateKey:date,allowOverBudget};
    let feedback='';
    try{if(await fb.changePlan(plan?.id||null,action,{onError:message=>{feedback=message;}})){if(accountId()===owner)onClose();}else if(accountId()===owner)setError(feedback||'Your task could not be saved. Retry the change.');}
    catch(cause){if(accountId()===owner)setError(cause.message||'Your task could not be saved.');}
    finally{if(accountId()===owner)setSaving(false);}
  }
  return <ModalFrame open onClose={onClose} title={titles[mode]} header={plan?.title||'Build your study day'} size={editing?'md':'sm'} busy={saving} footer={<><button className="btn line" disabled={saving} onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving||!date||(over>0&&!allowOverBudget)||Boolean(preview.error)||editing&&loading} onClick={()=>void save()}>{saving?'Saving...':'Save change'}</button></>}>
    <fieldset className="study-edit-controls task-editor" disabled={saving}>
      {editing&&<><div className="task-editor-grid"><div className="study-edit-field"><span>Skill</span><FilterMenu label="Skill" value={skill} disabled={saving} onChange={value=>{setSkill(value);setPractice(value==='vocabulary'?'learning-batch':'recommended');reset();}} options={Object.keys(TASK_PRACTICES).map(value=>({value,label:capital(value)}))}/></div>
      <label className="study-edit-field">Practice type<SelectField aria-label="Practice type" value={practice} options={options} disabled={saving} onValueChange={value=>{setPractice(value);reset();const minimum=options.find(row=>row.value===value)?.minimum||1;if(value.endsWith('-mock'))setMinutes(minimum);else if(minutes<minimum)setMinutes(minimum);}}/></label></div></>}
      {(editing||mode==='resize')&&<label className="study-edit-field">Task minutes<input aria-label="Task minutes" type="number" min={1} max={180} value={minutes||''} onChange={event=>{setMinutes(Number(event.target.value));setAllowOverBudget(false);}}/></label>}
      {['add','duplicate','reschedule'].includes(mode)&&<div className="study-edit-field"><label htmlFor="task-study-date">Study date</label><DateField id="task-study-date" label="Study date" value={date} onChange={value=>{setDate(value);setAllowOverBudget(false);}}/></div>}
      {editing&&!practice.endsWith('-mock')&&practice!=='due-review'&&<section className="task-materials"><h3>Study material</h3><p>Use the recommendation or choose a specific source.</p>
        {loading?<p role="status">Loading available materials…</p>:<><label className="study-edit-field">Search material<input type="search" aria-label="Search material" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search questions, passages or groups"/></label>
          <label className="study-edit-field">Material<SelectField aria-label="Material" disabled={saving} value={material} onValueChange={value=>{setMaterial(value);setBatch(1);}} options={[{value:'',label:practice==='listening-intensive'?'Choose a listening part':'Recommended material'},...visible.map(row=>({value:row.id,label:row.label}))]}/></label>
          {!visible.length&&<p className="settings-field-help">{search?'No matching materials. Try another search.':'No selectable materials loaded. You can retry or use a recommendation.'}</p>}
        </>}
        {practice==='listening-intensive'&&material&&<label className="study-edit-field">Sentence<SelectField aria-label="Sentence" value={sentence} disabled={saving} onValueChange={setSentence} options={[{value:'',label:'Choose a sentence'},...sentences.map((row,index)=>({value:row.id,label:`Sentence ${index+1} · ${row.text||row.transcript||''}`}))]}/></label>}
        {skill==='vocabulary'&&material&&<label className="study-edit-field">Batch number<input type="number" aria-label="Batch number" min={1} max={selected?.batches||1} value={batch} onChange={event=>setBatch(Number(event.target.value))}/></label>}
      </section>}
      {materialError&&<div className="study-alert" role="alert">{materialError}<button type="button" className="btn line" onClick={()=>setRetry(value=>value+1)}>Retry materials</button></div>}
      <section className={`task-budget${over?' is-over':''}`} aria-label="Task budget"><p>Daily budget <strong>{budget} min</strong></p><dl><div><dt>Other tasks</dt><dd>{used} min</dd></div><div><dt>After this change</dt><dd>{used+duration} min</dd></div><div><dt>{over?'Extra time':'Remaining'}</dt><dd>{over||Math.max(0,budget-used-duration)} min</dd></div></dl>
        {over>0&&<label className="check-field task-overage-confirm"><input type="checkbox" checked={allowOverBudget} onChange={event=>setAllowOverBudget(event.target.checked)}/>Keep extra {over} minutes on this day</label>}
      </section>
      {preview.task&&<section className="task-preview"><h3>{editing?preview.task.title:'Completion condition'}</h3><p>{preview.task.completion?.description||'Save the selected practice result.'}</p><small>{editing?'This task will be kept when automatic plans are rebuilt.':'The chosen material and progress are preserved.'}</small></section>}
      {preview.error&&<p className="study-alert" role="alert">{preview.error}</p>}{error&&<p className="study-alert" role="alert">{error}</p>}
    </fieldset>
  </ModalFrame>;
}
