import { useEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import type { ExamPassage, ExamQuestion, ExamSection } from '../../domain/exam/types';
import { ReadingPassage } from './ReadingPassage';
import { AnnotatedText } from './SourceAnnotations';
import { locateQuestionEvidence } from './evidenceLocation';

export function QuestionEvidence({ question, response, passages, section, loading, error, onRetry, onClose }: {
  question: ExamQuestion; response: string | string[]; passages: ExamPassage[]; section?: ExamSection; loading: boolean; error: string; onRetry: () => void; onClose: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const source = passages.filter(passage => passage.sectionId === question.sectionId);
  const location = useMemo(() => locateQuestionEvidence(question, passages, section), [question, passages, section]);
  useEffect(() => {
    const mark = container.current?.querySelector<HTMLElement>('[data-evidence-highlight]');
    if (mark) { mark.scrollIntoView?.({ block: 'center' }); mark.closest<HTMLElement>('[data-source-block]')?.focus({ preventScroll: true }); }
  }, [location]);
  const hasSource = question.skill === 'reading' ? source.length > 0 : Boolean(section?.sentences.length);
  return <section id={`exam-evidence-${question.id}`} className="exam-review-evidence" role="region" aria-label={`Source evidence for question ${question.number}`}>
    <header><div><strong>{question.skill === 'reading' ? 'Passage' : 'Transcript'} · question {question.number}</strong><p>{`Your response: ${Array.isArray(response) ? response.join(' · ') || 'No answer' : response || 'No answer'} · Answer: ${Array.isArray(question.answer) ? question.answer.join(' · ') : question.answer || 'Unavailable'}`}</p><p>{location.status === 'exact' ? 'The evidence is highlighted in the original text.' : location.status === 'partial' ? 'The imported quote differs from the source. Only matching wording is highlighted.' : location.status === 'paragraph' ? 'The source gives a paragraph or sentence reference. The referenced text is highlighted.' : 'No exact evidence location is supplied for this answer. Compare the source with the answer and explanation above.'}</p></div><button type="button" className="icon-button" aria-label="Close evidence" title="Close evidence" onClick={onClose}><X size={18} /></button></header>
    {loading && !hasSource ? <p role="status">Loading original text…</p> : error ? <div role="alert"><p>The original text could not load. Your answers and notes are kept.</p><button className="btn line" onClick={onRetry}>Retry original text</button></div> : !hasSource ? <p role="status">The original text is unavailable for this saved session.</p> : <div ref={container} className="exam-review-evidence-text">
      {question.skill === 'reading' ? source.map(passage => <ReadingPassage key={passage.id} passage={passage} sourceView evidenceRanges={location.ranges} />) : section?.sentences.map(sentence => <p key={sentence.id}><AnnotatedText blockId={`sentence:${sentence.id}`} text={sentence.text} version={section.provenance.contentHash} evidenceRanges={location.ranges[`sentence:${sentence.id}`]} /></p>)}
    </div>}
  </section>;
}
