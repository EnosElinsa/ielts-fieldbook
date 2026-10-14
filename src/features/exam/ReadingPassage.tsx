import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ExamPassage, ExamQuestion } from '../../domain/exam/types';
import { AnnotatedText } from './SourceAnnotations';

const paragraphMarker = /^([A-Z])(?:\s+(\d{1,3}))?$/;

export function readingParagraphs(paragraphs: ExamPassage['paragraphs']) {
  const groups: { label: string; marker?: ExamPassage['paragraphs'][number]; fragments: ExamPassage['paragraphs'] }[] = [];
  const markers = paragraphs.filter(row => paragraphMarker.test(row.text.trim()));
  const lettered = markers.length > 0 && markers.every((row, index) => row.text.trim().match(paragraphMarker)![1] === String.fromCharCode(65 + index));
  for (const [index, paragraph] of paragraphs.entries()) {
    const marker = lettered && paragraph.text.trim().match(paragraphMarker);
    if (marker) groups.push({ label: marker[1], marker: paragraph, fragments: [] });
    else if (lettered && groups.length) groups.at(-1)!.fragments.push(paragraph);
    else groups.push({ label: /^[A-Z]$/.test(paragraph.id) ? paragraph.id : String(index + 1), fragments: [paragraph] });
  }
  return groups;
}

export function headingParagraphLabel(questionNumber: number, index: number, paragraphs: ExamPassage['paragraphs']) {
  const groups = readingParagraphs(paragraphs);
  return groups.find(group => Number(group.marker?.text.trim().match(paragraphMarker)?.[2]) === questionNumber)?.label
    || groups[index]?.label || String.fromCharCode(65 + index);
}

export function readingQuestionPrompt(question: ExamQuestion, questions: ExamQuestion[], paragraphs: ExamPassage['paragraphs']) {
  if (question.type !== 'heading' || !/^Question \d+ · Complete the marked gap/.test(question.prompt)) return question.prompt;
  const group = questions.filter(row => row.sectionId === question.sectionId && row.type === 'heading' && row.groupId === question.groupId).sort((a, b) => a.number - b.number);
  return `Paragraph ${headingParagraphLabel(question.number, group.findIndex(row => row.id === question.id), paragraphs)}`;
}

export function HeadingList({ question }: { question: ExamQuestion }) {
  return question.type === 'heading' && question.options?.length
    ? <ul className="exam-heading-list" aria-label="List of headings">{question.options.map(option => <li key={option}>{option}</li>)}</ul> : null;
}

export function HeadingReference({ question }: { question: ExamQuestion }) {
  return <QuestionReference label="List of headings" count={question.options?.length}><HeadingList question={question} /></QuestionReference>;
}

export function QuestionReference({ label, count, children }: { label: string; count?: number; children: ReactNode }) {
  const reference = useRef<HTMLDetailsElement>(null);
  const [expanded, setExpanded] = useState(() => !window.matchMedia?.('(max-width: 740px)').matches);
  useEffect(() => {
    const workspace = reference.current?.parentElement;
    if (workspace && typeof ResizeObserver !== 'undefined') {
      let wide: boolean | undefined;
      const observer = new ResizeObserver(entries => {
        const nextWide = entries[0].contentRect.width >= 420;
        if (wide !== nextWide) { wide = nextWide; setExpanded(nextWide); }
      });
      observer.observe(workspace);
      return () => observer.disconnect();
    }
    const media = window.matchMedia?.('(max-width: 740px)');
    if (!media) return;
    const resize = () => setExpanded(!media.matches);
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  return <details ref={reference} className="exam-heading-reference" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>{label} {count !== undefined && <span>{count} choices</span>}</summary>
    {children}
  </details>;
}

export function ReadingPassage({ passage, sourceView = false }: { passage: ExamPassage; sourceView?: boolean }) {
  const Heading = sourceView ? 'h3' : 'h4';
  const version = passage.provenance.contentHash || passage.provenance.sourceVersion;
  return <article className="exam-passage">
    <Heading>{passage.title}</Heading>
    {readingParagraphs(passage.paragraphs).map(group => <Fragment key={group.marker?.id || group.fragments[0]?.id}>
      {group.marker && <span hidden aria-hidden="true"><AnnotatedText blockId={`passage:${passage.id}:${group.marker.id}`} text={group.marker.text} version={version} /></span>}
      <p><span className="exam-paragraph-id" aria-label={`Paragraph ${group.label}`}>{group.label}</span>{' '}
      {group.fragments.map((fragment, index) => <span key={fragment.id}>{index > 0 && ' '}<AnnotatedText blockId={`passage:${passage.id}:${fragment.id}`} text={fragment.text} version={version} /></span>)}
      </p></Fragment>)}
  </article>;
}
