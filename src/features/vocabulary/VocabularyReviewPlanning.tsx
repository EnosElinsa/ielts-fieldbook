import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useFieldbook } from '../../context/FieldbookContext';
import { TaskStartButton } from '../planning/StudySchedule';
import { dateKey } from '../../domain/utils';
import { normalizeReviewScope } from '../../domain/vocabulary/reviewPlanning';
import { modeLabel } from './practicePresentation';
import type { VocabularyPracticeController } from './useVocabularyPracticeController';
import type { StudyPlan } from '../../domain/plans';
import { VOCABULARY_CATALOG } from '../../domain/vocabulary/catalog';

function reviewRange(plan:StudyPlan){
 const target=plan.target;if(target.type!=='vocabulary')return '';
 const filter=target.reviewFilter||{},book=VOCABULARY_CATALOG.books.find(row=>row.id===filter.bookId),group=VOCABULARY_CATALOG.units.find(row=>row.bookId===filter.bookId&&row.id===filter.unitId);
 const type=target.reviewType==='wrong'?'Words to retry':target.reviewType==='custom'?'Custom selection':'Due for review';
 const scope=target.selectedMeanings?`${target.selectedMeanings.length} selected meanings`:group?.title||book?.title||(filter.entryId?'Selected word':filter.sourceType==='wordbook'?'Wordbooks':'Saved words');
 return `${type} · ${scope}`;
}

export function PlannedReviewList(){
 const fb=useFieldbook();
 const tasks=((fb.state.plans||[]) as StudyPlan[]).filter(plan=>plan.skill==='vocabulary'&&plan.target?.type==='vocabulary'&&plan.target.mode==='due-review'&&!plan.archivedAt&&!plan.onHold&&['pending','in_progress'].includes(plan.status)).sort((a,b)=>a.dateKey.localeCompare(b.dateKey));
 return <section className="practice-planned-list" aria-label="Planned review"><header><h3>Planned review</h3><p>Each session follows one task's assigned mode and complete question list.</p></header>{tasks.length?<div>{tasks.map(plan=><article key={plan.id}><div><span className="vocabulary-eyebrow">{plan.origin==='manual'?'User arranged':'System arranged'} · {plan.dateKey}</span><h4>{plan.title}</h4><p>{plan.target.type==='vocabulary'?modeLabel(plan.target.assessmentMode):''} · {plan.target.type==='vocabulary'&&plan.target.binding==='frozen'?`${plan.target.cards.length} fixed questions · ${new Set(plan.target.cards.map(ref=>ref.entryId)).size} words`:`Up to ${plan.quantity||plan.estimatedMinutes} questions selected at start`}</p><p>{reviewRange(plan)}</p><p>{plan.completion?.description}</p></div><TaskStartButton plan={plan}/></article>)}</div>:<p>No planned reviews. Start a self-directed session or arrange one below.</p>}</section>;
}

export function ScheduleVocabularyReview({controller:c}:{controller:VocabularyPracticeController}){
 const fb=useFieldbook();const [open,setOpen]=useState(false),[date,setDate]=useState(dateKey(new Date())),[binding,setBinding]=useState('dynamic'),[extra,setExtra]=useState(false),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 const assessed=!['audio','production'].includes(c.mode),type=c.wrongOnly?'wrong':c.dueOnly?'due':'custom';
 const cards=c.queue.slice(0,c.preferences.sessionSize).map(({entryId,senseId})=>({entryId,senseId}));
 async function save(){setSaving(true);setMessage('');let error='';try{const count=binding==='frozen'?cards.length:c.preferences.sessionSize;const saved=await fb.changePlan(null,{type:'add',skill:'vocabulary',practice:'due-review',assessmentMode:c.mode,dateKey:date,estimatedMinutes:count,reviewType:type,binding,reviewFilter:normalizeReviewScope(c.filter),questionOrder:c.preferences.order,...(c.customCardIds!==null&&type==='custom'?{selectedMeanings:c.queue.map(({entryId,senseId})=>({entryId,senseId}))}:{}),...(binding==='frozen'?{cards}:{}),allowOverBudget:extra},{onError:(value:string)=>{error=value;}});if(saved){setMessage('Review task saved. It is available in Planned review and Planning.');setOpen(false);}else setMessage(error||'Could not save this review task. Your choices are retained.');}catch(cause){setMessage(cause instanceof Error?cause.message:'Could not save this review task.');}finally{setSaving(false);}}
 return <section className="practice-schedule-review"><button type="button" className="btn line" disabled={!assessed} onClick={()=>setOpen(value=>!value)}>Arrange this review for a date</button>{!assessed&&<p>Audio loop and Use in context are self-directed activities. Scheduled tasks use assessed modes.</p>}{message&&<p role="status">{message}</p>}{open&&<fieldset disabled={saving}><legend>One-time review task</legend><label>Study date<input type="date" value={date} onChange={event=>setDate(event.target.value)}/></label><label>Word selection<select value={binding} onChange={event=>setBinding(event.target.value)}><option value="dynamic">Select matching words when I start</option><option value="frozen">Keep this exact question list</option></select></label><p>{binding==='frozen'?`${cards.length} fixed questions`:`Up to ${c.preferences.sessionSize} questions matching this source and review type. You can schedule future due review even when nothing is due today.`}</p><label className="check-field"><input type="checkbox" checked={extra} onChange={event=>setExtra(event.target.checked)}/>Keep extra time if this exceeds the daily budget</label><button type="button" className="btn primary" disabled={!date||binding==='frozen'&&!cards.length} onClick={()=>void save()}>{saving?'Saving…':'Save review task'}</button></fieldset>}</section>;
}

export function ReviewStartButton({controller:c,disabled,label}:{controller:VocabularyPracticeController;disabled:boolean;label:string}){
 const [matching,setMatching]=useState<StudyPlan[]|null>(null);
 useEffect(()=>{if(c.planRequested)setMatching(null);},[c.planRequested]);
 function start(){
  if(c.planRequested||c.study){c.begin();return;}
  const identities=new Set(c.queue.map(card=>JSON.stringify([card.entryId,card.senseId])));
  const type=c.wrongOnly?'wrong':c.dueOnly?'due':'custom';
  const matches=((c.state.plans||[]) as StudyPlan[]).filter(plan=>{
    if(plan.kind!=='vocabulary'||!['pending','in_progress'].includes(plan.status)||plan.archivedAt||plan.onHold||plan.target?.type!=='vocabulary'||plan.target.mode!=='due-review'||plan.target.assessmentMode!==c.mode)return false;
    if(plan.target.binding==='frozen')return plan.target.cards.length>0&&plan.target.cards.every(ref=>identities.has(JSON.stringify([ref.entryId,ref.senseId])));
    const target=plan.target as typeof plan.target&{reviewType?:string;reviewFilter?:unknown};
    return (!target.reviewType?type==='due':target.reviewType===type&&JSON.stringify(normalizeReviewScope(target.reviewFilter))===JSON.stringify(normalizeReviewScope(c.filter)));
  });
  if(matches.length)setMatching(matches);else c.begin();
 }
 return <><button className="btn primary practice-start" type="button" disabled={disabled} aria-busy={!c.localDrafts.ready||!c.catalogReady} onClick={start}>{label}</button><Dialog.Root open={Boolean(matching)} onOpenChange={open=>{if(!open)setMatching(null);}}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content"><Dialog.Title>Link to a planned review?</Dialog.Title><Dialog.Description>Choose one task to practise its complete requirements. A separate session updates your vocabulary without completing a plan task.</Dialog.Description><div className="practice-match-list">{matching?.map(plan=><article key={plan.id}><strong>{plan.title}</strong><p>{plan.dateKey} · {plan.origin==='manual'?'User arranged':'System arranged'} · {plan.estimatedMinutes} questions</p><TaskStartButton plan={plan}/></article>)}</div><button type="button" className="btn line" onClick={()=>{setMatching(null);c.begin();}}>Start a separate session</button></Dialog.Content></Dialog.Portal></Dialog.Root></>;
}
