import { NotebookPen, X } from 'lucide-react';
import { SelectField } from '../../components/SelectField';
import type { ExamQuestion, ExamSkill } from '../../domain/exam/types';
import { questionLabel } from '../../domain/exam/questionSlots';

type NotesProps = {
  question: ExamQuestion; skill: ExamSkill; disabled: boolean;
  evidence: string; keywords: string;
  onEvidence: (value: string) => void; onKeywords: (value: string) => void;
};

export function QuestionNotes({ question, skill, disabled, evidence, keywords, onEvidence, onKeywords }: NotesProps) {
  return <div className="exam-annotations exam-notes-panel" id={`exam-notes-${question.id}`} role="region" aria-label={`Evidence & paraphrase for ${questionLabel(question).toLowerCase()}`}>
    <h4>Evidence & paraphrase</h4>
    <label>Evidence for {questionLabel(question).toLowerCase()}<textarea disabled={disabled} value={evidence} onChange={event => onEvidence(event.target.value)} placeholder={skill === 'reading' ? 'Quote the source words that prove your answer…' : 'Note the words or time in the recording…'} /></label>
    <label>Keywords & synonyms for {questionLabel(question).toLowerCase()}<input disabled={disabled} value={keywords} onChange={event => onKeywords(event.target.value)} placeholder="question wording → source wording" /></label>
  </div>;
}

export function InlineQuestionNotes({ questions, selectedId, onSelect, onClose, onReturn, evidence, keywords, onEvidence, onKeywords, ...props }: Omit<NotesProps, 'question' | 'evidence' | 'keywords' | 'onEvidence' | 'onKeywords'> & {
  questions: ExamQuestion[]; selectedId: string;
  evidence: Record<string, string>; keywords: Record<string, string>;
  onSelect: (id: string) => void; onClose: () => void; onReturn: (question: ExamQuestion) => void;
  onEvidence: (id: string, value: string) => void; onKeywords: (id: string, value: string) => void;
}) {
  const selected = questions.find(question => question.id === selectedId);
  const savedCount = questions.filter(question => evidence[question.id]?.trim() || keywords[question.id]?.trim()).length;
  const groupId = `exam-inline-notes-${questions[0].id}`;
  return <section className="exam-inline-notes" aria-label="Question notes">
    <button type="button" className="exam-inline-notes-toggle" aria-expanded={Boolean(selected)} aria-controls={groupId} onClick={() => selected ? onClose() : onSelect(questions[0].id)}>
      <NotebookPen size={18} aria-hidden="true" /><span><strong>Question notes</strong><small>Optional · Evidence & paraphrases are kept separately for each answer.</small></span><span className="exam-inline-notes-count">{savedCount ? `${savedCount} with notes` : selected ? 'Hide' : 'Open'}</span>
    </button>
    {selected && <div id={groupId} className="exam-inline-notes-editor">
      <div className="exam-inline-notes-controls"><label>Question for notes<SelectField aria-label="Question for notes" value={selected.id} onValueChange={onSelect} options={questions.map(question => ({ value: question.id, label: `${questionLabel(question)}${evidence[question.id]?.trim() || keywords[question.id]?.trim() ? ' · Notes added' : ''}` }))} /></label>
        <button type="button" className="btn text" onClick={() => onReturn(selected)}>Return to answer {selected.number}</button>
        <button type="button" className="icon-button" aria-label="Close question notes" title="Close question notes" onClick={onClose}><X size={18} /></button>
      </div>
      <QuestionNotes {...props} question={selected} evidence={evidence[selected.id] || ''} keywords={keywords[selected.id] || ''} onEvidence={value => onEvidence(selected.id, value)} onKeywords={value => onKeywords(selected.id, value)} />
    </div>}
  </section>;
}
