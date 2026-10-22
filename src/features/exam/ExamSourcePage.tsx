import { ExamBackLink, ExamStudyLink } from './ExamNavigation';
import { questionEndNumber, questionLabel, questionNumberLabel, questionSlotCount } from '../../domain/exam/questionSlots';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Headphones } from 'lucide-react';
import { PageLoadingState, StateMessage } from '../../components/AsyncState';
import { useFieldbook } from '../../context/FieldbookContext';
import type { ExamAttempt, ExamSkill, IntensiveSession } from '../../domain/exam/types';
import { hasActiveSourceMock, listeningTranscriptAccess } from '../../domain/exam/sourceAccess';
import { readExamRecoveries, readExamRecovery } from '../../storage/examRecovery';
import { accountId } from '../../storage/remote';
import { useExamCatalog } from './useExamCatalog';
import { AnnotatedText, SourceAnnotations } from './SourceAnnotations';
import { ReadingPassage, readingQuestionPrompt, HeadingList } from './ReadingPassage';
import { ExamImage, ExamStimulus, examStimulusBlockIds } from './ExamPracticePage';
import { examVocabularySeed } from './vocabularyCapture';
import { findSourceBlock, revealSourceBlock } from './sourceLocation';
import { questionPresentation, questionNumberPrefixLength } from './questionPresentation';
import '../../styles/exam.css';

export function ExamSourcePage({ skill }: { skill: ExamSkill }) {
  const { sectionId = '' } = useParams();
  const [params] = useSearchParams();
  const fb = useFieldbook();
  const { catalog, loading, error, reload } = useExamCatalog(skill, undefined, [sectionId]);
  const container = useRef<HTMLDivElement>(null);
  const section = catalog.sections.find(row => row.id === sectionId && row.skill === skill);
  const passages = catalog.passages.filter(row => row.sectionId === sectionId);
  const questions = (catalog.questions || []).filter(row => row.sectionId === sectionId && row.skill === skill).slice().sort((a, b) => a.number - b.number);
  const presentation = questionPresentation(questions);
  const requestedBlock = params.get('block') || '';
  const paragraphId = params.get('paragraph');
  const sentenceId = params.get('sentence');
  const quote = params.get('quote') || '';
  const contextQuestion = questions.find(question => question.id === params.get('question'));
  const [locationMissing, setLocationMissing] = useState(false);
  const recovery = skill === 'listening' ? readExamRecovery<Record<string, IntensiveSession>>(accountId(), `intensive:${sectionId}`) : null;
  const access = listeningTranscriptAccess(sectionId, fb.state.examAttempts || [], [...(fb.state.intensiveSessions || []), ...Object.values(recovery || {})]);
  const visibleSentences = section?.sentences.filter(sentence => access.fullTranscript || access.sentenceIds.has(sentence.id)) || [];
  const localMocks = section?.paperId ? readExamRecoveries<ExamAttempt>(accountId(), `${skill}:mock:${section.paperId}`).filter(attempt => attempt.sourceId === section.paperId) : [];
  const activeMock = hasActiveSourceMock(sectionId, skill, [...localMocks, ...(fb.state.examAttempts || [])]);
  const materialBlockIds = useMemo(() => questions.flatMap((question, index) => [`question:${question.id}`, ...(question.stimulusHtml && (!question.groupId || questions[index - 1]?.groupId !== question.groupId) ? examStimulusBlockIds(question.stimulusHtml, `stimulus:${question.groupId || question.id}`) : [])]), [catalog, sectionId, skill]);
  useEffect(() => {
    if (!section || !container.current) return;
    container.current.querySelectorAll('[data-located]').forEach(block => block.removeAttribute('data-located'));
    const target = findSourceBlock(container.current, { block: requestedBlock, sentence: sentenceId, paragraph: paragraphId, quote }, passages);
    setLocationMissing(Boolean(requestedBlock || sentenceId || paragraphId || quote) && !target);
    if (target) revealSourceBlock(target);
    else if (contextQuestion) {
      const question = findSourceBlock(container.current, { block: `question:${contextQuestion.id}` });
      if (question) revealSourceBlock(question);
    }
  }, [section, requestedBlock, paragraphId, sentenceId, quote, contextQuestion?.id]);
  if (loading) return <section className="view active"><PageLoadingState variant="document" message="Loading source material…" onRetry={reload} /></section>;
  if (error) return <section className="view active"><StateMessage kind="error" message={error} onRetry={reload} /></section>;
  if (!section) return <section className="view active"><StateMessage title="Source unavailable." message="This material could not be found." /></section>;
  const version = section.provenance.contentHash || section.provenance.sourceVersion;
  return <section className="view active exam-source-view">
    <ExamBackLink fallback={`/${skill}`} fallbackLabel="Bank" />
    <div className="exam-workspace-head"><div><span className="exam-eyebrow">{skill === 'reading' ? 'Passage' : 'Part'} {section.part}</span><h2>{section.title}</h2></div>{skill === 'listening' && <ExamStudyLink className="btn line" to={`/listening/intensive/${encodeURIComponent(sectionId)}${sentenceId ? `?sentence=${encodeURIComponent(sentenceId)}` : ''}`}><Headphones size={16} />Play source sentence</ExamStudyLink>}</div>
    {contextQuestion && <div className="exam-evidence-context"><div><strong>{questionLabel(contextQuestion)} · {quote ? 'Source evidence' : 'Original question'}</strong><p>{contextQuestion.prompt.slice(questionNumberPrefixLength(contextQuestion.prompt, contextQuestion.number, questionEndNumber(contextQuestion)))}</p></div>{locationMissing && <p role="status">The exact evidence position is unavailable. The original question is shown below for reference.</p>}</div>}
    <SourceAnnotations key={`${skill}:${sectionId}`} skill={skill} sourceId={sectionId} mock={activeMock} allowedBlockIds={skill === 'listening' && !access.fullTranscript ? [...visibleSentences.map(sentence => `sentence:${sentence.id}`), ...materialBlockIds] : undefined} onVocabulary={selection => {
      if (activeMock) return;
      const seed = examVocabularySeed(selection, { catalog, sectionId, skill }, container.current || document);
      if (!seed) return;
      fb.setEditingVocabularyId(null);
      fb.setVocabularySeed(seed);
      fb.openModal('vocabulary');
    }}>
      <div ref={container} className="exam-source-document">
        {questions.length > 0 && <details className="exam-source-questions" aria-label="Original questions" open={Boolean(requestedBlock.startsWith('question:') || !quote && !paragraphId && !sentenceId)}><summary>Original questions</summary>{questions.map((question, index) => <article key={question.id} data-source-question={question.id} data-source-number={question.number} tabIndex={-1} className="exam-question-material">
          {question.stimulusHtml && (!question.groupId || questions[index - 1]?.groupId !== question.groupId) && <ExamStimulus html={question.stimulusHtml} assets={catalog.assets || []} blockPrefix={`stimulus:${question.groupId || question.id}`} version={question.provenance.contentHash || question.provenance.sourceVersion} />}
          {question.type === 'heading' && presentation[index].groupStart && <HeadingList question={question} />}
          <span className={`exam-number${questionSlotCount(question) > 1 ? " is-range" : ""}`}>{questionNumberLabel(question)}</span>{presentation[index].showInstructions && <p className="exam-instruction">{question.instructions}</p>}
          {presentation[index].showPrompt && <p className="exam-prompt"><AnnotatedText blockId={`question:${question.id}`} text={readingQuestionPrompt(question, questions, passages.flatMap(passage => passage.paragraphs))} hiddenPrefixLength={questionNumberPrefixLength(readingQuestionPrompt(question, questions, passages.flatMap(passage => passage.paragraphs)), question.number, questionEndNumber(question))} version={question.provenance.contentHash || question.provenance.sourceVersion} /></p>}
          <ExamImage asset={(catalog.assets || []).find(asset => asset.id === question.assetId && asset.kind === 'image')} label={`${questionLabel(question)} diagram`} />
          {question.type !== 'heading' && question.options?.length ? <ul>{question.options.map(option => <li key={option}>{option}</li>)}</ul> : null}
        </article>)}</details>}
        {skill === 'reading' ? passages.map(passage => <ReadingPassage key={passage.id} passage={passage} sourceView />) : visibleSentences.map(sentence => <p className="exam-source-sentence" key={sentence.id}><ExamStudyLink className="icon-button" title={`Play sentence ${section.sentences.indexOf(sentence) + 1}`} aria-label={`Play sentence ${section.sentences.indexOf(sentence) + 1}`} to={`/listening/intensive/${encodeURIComponent(sectionId)}?sentence=${encodeURIComponent(sentence.id)}`}><Headphones size={16} /></ExamStudyLink><AnnotatedText blockId={`sentence:${sentence.id}`} text={sentence.text} version={version} /></p>)}
        {skill === 'listening' && section.sentences.length > visibleSentences.length && <StateMessage title="Transcript hidden." message="Submit this listening part to view the full transcript, or compare an intensive sentence to unlock its text." />}
        {skill === 'listening' && !section.sentences.length && <StateMessage title="Transcript unavailable." message="The source does not include a transcript for this part." />}
      </div>
    </SourceAnnotations>
  </section>;
}
