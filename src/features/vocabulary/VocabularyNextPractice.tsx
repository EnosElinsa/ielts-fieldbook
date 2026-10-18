import {ArrowRight} from 'lucide-react';
import type {VocabularyMode} from '../../domain/vocabulary/types';
import type {VocabularyNextPractice as Recommendation} from '../../domain/vocabulary/nextPractice';
import {VocabularyLink as Link} from './VocabularyRouteLink';
import {dateLabel,modeLabel} from './practicePresentation';

export function VocabularyNextPractice({recommendation,to,onPractice,busy=false}: {
  recommendation: Recommendation; to: (mode: VocabularyMode)=>string;
  onPractice?: (mode: VocabularyMode)=>void; busy?: boolean;
}) {
  const {status,mode,reason,dimensions,dueAt,alternatives,target}=recommendation;
  const action=(target:VocabularyMode,alternative=false)=>onPractice
    ? <button type="button" className="btn line" disabled={busy} onClick={()=>onPractice(target)}>{busy?'Saving…':alternative?modeLabel(target):`Practise ${modeLabel(target)}`}<ArrowRight size={14} aria-hidden="true" /></button>
    : <Link className="btn line" to={to(target)}>{alternative?modeLabel(target):`Practise ${modeLabel(target)}`}<ArrowRight size={14} aria-hidden="true" /></Link>;
  return <section className="vocabulary-next-practice" aria-label="Next practice">
    <h4>Next practice</h4>
    <strong>{modeLabel(mode)}</strong>
    {status==='waiting' ? <p>{reason==='due'?'Your next review is scheduled for ':'Your next spaced practice is available from '}<time dateTime={dueAt}>{dateLabel(dueAt!)}</time>.</p> : <>
      <p>{reason==='missing'
        ? dimensions.length===1 && dimensions[0]==='usage' ? 'No verified use in context for this meaning yet.' : `No verified ${dimensions.join(' or ')} retrieval for this meaning yet.`
        : reason==='recovery' ? 'Review an active mistake in this exercise. Your saved recovery rules still apply.'
        : reason==='spaced' ? `Build ${dimensions.join(' and ')} with another spaced success towards ${target==='mastered'?'Mastered':'Familiar'}. Successes count at least 24 hours apart.`
        : reason==='production' ? 'Practise using this meaning in your own sentence. Mastered needs two assessed production successes at least 24 hours apart.'
        : 'This exercise is due for this meaning.'}</p>
      {mode==='production' ? <p className="vocabulary-muted">Use in context needs assessed feedback before it can count towards mastery.</p> : null}
      {mode==='dictation' ? <p className="vocabulary-muted">Audio is word-level. Check that its pronunciation matches this meaning.</p> : null}
      {action(mode)}
      {alternatives.length ? <details><summary>Other available exercises</summary><div className="vocabulary-next-practice-alternatives">{alternatives.map(target=><span key={target}>{action(target,true)}</span>)}</div></details> : null}
    </>}
  </section>;
}
