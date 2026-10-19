import {ArrowRight} from 'lucide-react';
import type {VocabularyMode} from '../../domain/vocabulary/types';
import type {VocabularyNextPractice as Recommendation} from '../../domain/vocabulary/nextPractice';
import {VocabularyLink as Link} from './VocabularyRouteLink';
import {dateLabel,modeLabel} from './practicePresentation';
import './vocabulary-next-practice.css';

export function VocabularyNextPractice({recommendation,to,onPractice,busy=false,primaryAction=false,title='Next practice',meaning}: {
  recommendation: Recommendation; to: (mode: VocabularyMode)=>string;
  onPractice?: (mode: VocabularyMode)=>void; busy?: boolean; primaryAction?: boolean; title?: string;
  meaning?: {term:string;definition:string};
}) {
  const {status,mode,reason,dimensions,dueAt,alternatives,target,error}=recommendation;
  const errorMessage=error && {
    spelling:'Your written answer did not match the accepted spelling. Compare the letters, then try the word again.',
    'meaning-choice':'Your selected option did not match the meaning in that question. Recall this meaning before trying the contrast again.',
    'collocation-choice':'Your selected option did not match the reviewed phrase or construction. Practise this meaning in its sentence context.',
    choice:'Your selected option was not accepted in that question. Review its explanation before another attempt.',
  }[error.kind];
  const short=(text:string)=>text.length>120?`${text.slice(0,117)}…`:text;
  const action=(target:VocabularyMode,alternative=false)=>onPractice
    ? <button type="button" className={`btn ${primaryAction&&!alternative?'primary':'line'}`} disabled={busy} onClick={()=>onPractice(target)}>{busy?'Saving…':alternative?modeLabel(target):`Practise ${modeLabel(target)}`}<ArrowRight size={14} aria-hidden="true" /></button>
    : <Link className={`btn ${primaryAction&&!alternative?'primary':'line'}`} to={to(target)}>{alternative?modeLabel(target):`Practise ${modeLabel(target)}`}<ArrowRight size={14} aria-hidden="true" /></Link>;
  return <section className="vocabulary-next-practice" aria-label={title}>
    <h4>{title}</h4>
    {meaning ? <p><b>{meaning.term}</b> · {meaning.definition}</p> : null}
    <p className="vocabulary-next-practice-mode">{modeLabel(mode)}</p>
    {status==='waiting' ? <p>{reason==='due'?'Your next review is scheduled for ':'Your next spaced practice is available from '}<time dateTime={dueAt}>{dateLabel(dueAt!)}</time>.</p> : <>
      <p>{reason==='error' ? errorMessage : reason==='missing'
        ? dimensions.length===1 && dimensions[0]==='usage' ? 'No verified use in context for this meaning yet.' : `No verified ${dimensions.join(' or ')} retrieval for this meaning yet.`
        : reason==='recovery' ? 'Review an active mistake in this exercise. Your saved recovery rules still apply.'
        : reason==='spaced' ? `Build ${dimensions.join(' and ')} with another spaced success towards ${target==='mastered'?'Mastered':'Familiar'}. Successes count at least 24 hours apart.`
        : reason==='production' ? 'Practise using this meaning in your own sentence. Usage is tracked separately from foundation mastery.'
        : 'This exercise is due for this meaning.'}</p>
      {error && reason==='error' ? <>
        <p className="vocabulary-muted">Last error: “{short(error.response)}” → “{short(error.expectedAnswer)}”.</p>
        <p className="vocabulary-muted">{mode!==error.failedMode ? `Supporting practice does not clear the original ${modeLabel(error.failedMode)} mistake. Return to that exercise when it is due. ` : ''}Recovery needs 3 correct retries in the failed mode, with at least 24 hours between the first and last.</p>
      </> : null}
      {mode==='production' ? <p className="vocabulary-muted">Use in context needs assessed feedback to count as verified usage. It is optional for foundation mastery.</p> : null}
      {mode==='dictation' ? <p className="vocabulary-muted">Audio is word-level. Check that its pronunciation matches this meaning.</p> : null}
      {action(mode)}
      {alternatives.length ? <details><summary>Other available exercises</summary><div className="vocabulary-next-practice-alternatives">{alternatives.map(target=><span key={target}>{action(target,true)}</span>)}</div></details> : null}
    </>}
  </section>;
}
