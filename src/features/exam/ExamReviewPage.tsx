import { SelectField } from '../../components/SelectField';
import { PageLoadingState, StateMessage } from '../../components/AsyncState';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { ArrowLeft, RotateCcw, Bookmark, Headphones, Save, LocateFixed } from 'lucide-react';
import type { ExamAttempt, ExamQuestion, ExamSkill } from '../../domain/exam/types';
import { gradeQuestion } from '../../domain/exam';
import { useFieldbook } from '../../context/FieldbookContext';
import { useExamCatalog, QUESTION_TYPE_NAMES } from './useExamCatalog';
import { ExamImage, ExamStimulus } from './ExamPracticePage';
import { accountId } from '../../storage/remote';
import { clearExamRecovery, readExamRecovery, writeExamRecovery } from '../../storage/examRecovery';
import '../../styles/exam.css';
import { useWorkspacePageState } from '../../lib/workspacePageState';
import { questionNumberPrefixLength } from './questionPresentation';
import { PartVocabularyPanel } from './PartVocabularyPanel';
import { ExamSessionHistory } from './ExamSessionHistory';
import { recoveredExamSessions } from './sessionRecovery';
import { evidenceSentenceId } from './evidenceLocation';
import { QuestionEvidence } from './QuestionEvidence';
import { readingQuestionPrompt } from './ReadingPassage';

export function ExamReviewPage({ skill }: { skill: ExamSkill }) {
  const { attemptId } = useParams(); const navigate = useNavigate(); const fb = useFieldbook(); const attempt = (fb.state.examAttempts || []).find((row: ExamAttempt) => row.id === attemptId && row.skill === skill) as ExamAttempt | undefined;
  const owner = accountId();
  const sessions = useMemo(() => recoveredExamSessions(owner, skill, fb.state.examAttempts || []), [owner, skill, fb.state.examAttempts]);
  const [params] = useSearchParams();
  const recoveryKey = `review:${attemptId}`;
  const identity = `${owner}:${attemptId}`;
  const currentIdentity = useRef(identity); currentIdentity.current = identity;
  const mounted = useRef(true);
  const generation = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; }; }, []);
  const location = useLocation();
  const [evidenceId, setEvidenceId] = useState('');
  const evidenceTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => setEvidenceId(''), [owner, attemptId]);
  const [selectedSection, setSelectedSection] = useWorkspacePageState(`exam-review:${skill}:${attemptId}:section`, '');
  const [filter, setFilter] = useWorkspacePageState<'all' | 'wrong'>(`exam-review:${skill}:${attemptId}:filter`, 'wrong', (value): value is 'all' | 'wrong' => value === 'all' || value === 'wrong');

  const [annotations, setAnnotations] = useState<Record<string, { evidence: string; keywords: string; reason: string }>>({}); const [saving, setSaving] = useState(false); const [saveError, setSaveError] = useState('');
  useEffect(() => { generation.current += 1; setAnnotations(readExamRecovery<Record<string, { evidence: string; keywords: string; reason: string }>>(owner, recoveryKey) || {}); setSaving(false); setSaveError(''); }, [owner, attemptId, recoveryKey]);
  const { catalog, loading, error, reload } = useExamCatalog(skill, undefined, attempt?.sectionIds || []);
  const questions = useMemo(() => attempt ? (attempt.questionSnapshot || catalog.questions.filter(question => attempt.questionTypes ? !!attempt.questionTypes[question.id] : attempt.sectionIds.includes(question.sectionId))).slice().sort((a, b) => a.number - b.number) : [], [catalog.questions, attempt]);
  useEffect(() => {
    if (!location.hash || loading) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView?.({ block: 'center' }); target?.focus({ preventScroll: true });
  }, [location.hash, catalog, selectedSection, filter]);
  if (!attempt) return <section className="view active"><Link className="btn text back-link" to={`/${skill}`}><ArrowLeft size={15} />Back to bank</Link><StateMessage title="Attempt not found." message="This account does not have a saved attempt with that id." /></section>;
  if (attempt.status !== 'completed') return <section className="view active"><Link className="btn text back-link" to={`/${skill}`}><ArrowLeft size={15} />Back to bank</Link><StateMessage message={attempt.status === 'discarded' ? 'This session was discarded without a score.' : 'Submit this attempt to view its results.'} /></section>;
  if (loading && !attempt.questionSnapshot) return <section className="view active"><PageLoadingState variant="workbench" message="Loading answer explanations…" onRetry={reload} /></section>;
  if (error && !attempt.questionSnapshot) return <section className="view active"><StateMessage kind="error" message={error} onRetry={reload} /></section>;
  const questionRows = questions.length ? questions : Object.keys(attempt.results || {}).map(id => ({ id, number: 0, type: attempt.questionTypes?.[id] || 'gap', prompt: 'Historical question content unavailable.', answer: '', sectionId: attempt.sectionIds[0], paperId: attempt.sourceId, skill, provenance: { sourceUrl: '', sourceVersion: '', fetchedAt: '', contentHash: '', authorization: '' } } as ExamQuestion));
  const score = attempt.score ?? Object.values(attempt.results || {}).filter(Boolean).length; const total = attempt.total ?? questionRows.length; const wrong = questionRows.filter(question => !(attempt.results?.[question.id] ?? gradeQuestion(question, attempt.responses[question.id] || '')));
  const sectionId = attempt.sectionIds.includes(selectedSection) ? selectedSection : attempt.sectionIds[0];
  const partRows = questionRows.filter(question => question.sectionId === sectionId);
  const partWrong = wrong.filter(question => question.sectionId === sectionId);
  const visibleRows = filter === 'wrong' && partWrong.length ? partWrong : partRows;
  const dirty = Object.keys(annotations).length > 0;
  const notes = (questionId: string) => annotations[questionId] || { evidence: attempt.evidence?.[questionId] || '', keywords: attempt.keywords?.[questionId] || '', reason: attempt.errorReasons?.[questionId] || '' };
  const setNote = (questionId: string, change: Partial<{ evidence: string; keywords: string; reason: string }>) => { if (accountId() !== owner) return; const next = { ...annotations, [questionId]: { ...notes(questionId), ...change } }; writeExamRecovery(owner, recoveryKey, next); setAnnotations(next); };
  const saveNotes = async () => {
    if (accountId() !== owner || saving) return;
    const requestGeneration = generation.current;
    const snapshot = JSON.stringify(annotations);
    setSaving(true); setSaveError('');
    const draft = structuredClone(fb.stateRef.current);
    const row = draft.examAttempts.find((current: ExamAttempt) => current.id === attempt.id);
    if (row) {
      row.updatedAt = new Date().toISOString();
      const plan = ((draft.plans || []) as import('../../domain/plans').StudyPlan[]).find(item => item.id === params.get('planId') && item.status === 'in_progress' && item.target?.type === 'exam-review' && item.target.attemptId === row.id && item.target.skill === skill);
      if (plan) row.planId = plan.id;
      Object.entries(annotations).forEach(([id, annotation]) => { row.evidence[id] = annotation.evidence; row.keywords[id] = annotation.keywords; row.errorReasons[id] = annotation.reason; });
    }
    let saved = false;
    let feedback = '';
    try { saved = await fb.persistNow(draft, { collections: ['examAttempts', 'plans'], onError: (message: string) => { feedback = message; } }); } catch { saved = false; }
    if (!mounted.current || accountId() !== owner || currentIdentity.current !== identity || generation.current !== requestGeneration) return;
    setSaving(false);
    if (!saved) setSaveError(`${feedback || 'Could not save review notes.'} Your edits remain here; retry saving.`);
    else { if (JSON.stringify(readExamRecovery(owner, recoveryKey)) === snapshot) clearExamRecovery(owner, recoveryKey); setAnnotations({}); fb.toast('Review notes saved.'); }
  };
  const retry = () => navigate(`/${skill}/${attempt.sectionIds[0]}?retry=${encodeURIComponent(attempt.id)}`);
  return <section className="view active exam-review"><div className="exam-review-head"><div className="exam-back-links"><Link className="btn text back-link" to={`/${skill}`}><ArrowLeft size={15} />Bank</Link><Link className="btn text" to={`/${skill}/review`}>Review queue</Link></div><div className="exam-review-title"><span className="exam-eyebrow">{attempt.mode === 'mock' ? 'Full mock' : skill === 'reading' ? 'Passage practice' : 'Part practice'} · {new Date(attempt.completedAt || attempt.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span><h2>Practice results</h2>{attempt.mode === 'practice' && attempt.answerRevealed && <p className="exam-source-foot">Supported practice · answers were checked before submission.</p>}</div><div className="exam-score"><strong aria-label="Attempt score">{score} <small>/ {total}</small></strong><span>{total ? Math.round(score / total * 100) : 0}% correct</span></div></div><div className="exam-review-actions"><p>{wrong.length ? `${wrong.length} question${wrong.length === 1 ? '' : 's'} to review. Retrying clears the answers and review notes for the new attempt.` : 'All answers are correct. You can still add review notes.'}</p>{wrong.length > 0 && <button className="btn primary" onClick={retry}><RotateCcw size={15} />Retry wrong answers</button>}<button className="btn line" disabled={saving || !dirty} onClick={() => void saveNotes()}><Save size={15} />{saving ? 'Saving…' : 'Save review notes'}</button></div>{saveError && <p role="alert" className="exam-notice">{saveError}</p>}<nav className="exam-part-tabs" aria-label="Result Parts">{attempt.sectionIds.map((id, i) => { const section = catalog.sections.find(row => row.id === id); return <button type="button" key={id} aria-pressed={sectionId === id} className={sectionId === id ? 'active' : ''} onClick={() => setSelectedSection(id)}>{skill === 'reading' ? 'Passage' : 'Part'} {section?.part || i + 1}</button>; })}</nav>{catalog.sections.some(row => row.id === sectionId) && <PartVocabularyPanel key={`${owner}:${attempt.id}:${sectionId}`} catalog={catalog} attempt={attempt} sectionId={sectionId} />}<ExamSessionHistory sessions={sessions.filter(row => row.mode === attempt.mode && row.sourceId === attempt.sourceId)} currentId={attempt.id} /><div className="exam-review-filter"><div className="exam-part-tabs" role="group" aria-label="Answers to review"><button aria-pressed={filter === 'wrong' && partWrong.length > 0} className={filter === 'wrong' && partWrong.length > 0 ? 'active' : ''} disabled={!partWrong.length} onClick={() => setFilter('wrong')}>Wrong answers ({partWrong.length})</button><button aria-pressed={filter === 'all' || !partWrong.length} className={filter === 'all' || !partWrong.length ? 'active' : ''} onClick={() => setFilter('all')}>All answers ({partRows.length})</button></div><span role="status">{saving ? 'Saving notes…' : dirty ? 'Unsaved review notes' : 'Review notes saved'}</span></div><div className="exam-review-list">{visibleRows.map((question, index) => { const response = attempt.responses[question.id] || ''; const correct = attempt.results?.[question.id] ?? gradeQuestion(question, response); const annotation = notes(question.id); const sentenceId = skill === 'listening' ? evidenceSentenceId(question, catalog.sections.find(section => section.id === question.sectionId)) : undefined; return <article id={`exam-review-${question.id}`} tabIndex={-1} className={`exam-review-card ${correct ? 'is-correct' : 'is-wrong'}`} key={question.id}><header><span className="exam-number">{question.number || '—'}</span><span className="exam-eyebrow">{QUESTION_TYPE_NAMES[question.type]}</span><strong>{correct ? 'Correct' : 'Review this answer'}{question.points && question.points > 1 ? ` · ${attempt.earnedPoints?.[question.id] || 0}/${question.points} points` : ''}</strong></header>{question.stimulusHtml && (index === 0 || visibleRows[index - 1]?.groupId !== question.groupId || !question.groupId) && <ExamStimulus html={question.stimulusHtml} assets={catalog.assets} />}<h3>{readingQuestionPrompt(question, questionRows, catalog.passages.filter(p => p.sectionId === question.sectionId).flatMap(p => p.paragraphs)).slice(questionNumberPrefixLength(question.prompt, question.number))}</h3><ExamImage asset={catalog.assets.find(asset => asset.id === question.assetId && asset.kind === 'image')} label={`Question ${question.number} diagram`} /><dl><div><dt>Your response</dt><dd>{Array.isArray(response) ? response.join(' · ') || 'No answer' : response.trim() || 'No answer'}</dd></div><div><dt>Answer</dt><dd>{Array.isArray(question.answer) ? question.answer.join(' · ') : question.answer || 'Source answer unavailable'}</dd></div></dl>{question.explanation ? <p className="exam-explanation">{question.explanation}</p> : <p className="exam-source-foot">The source does not include an explanation for this answer.</p>}{question.sourceExplanation && <details className="exam-source-explanation"><summary>Original source explanation</summary><p>{question.sourceExplanation}</p></details>}{question.evidence?.text && <blockquote><Bookmark size={14} />{question.evidence.text}</blockquote>}<button type="button" className="btn line" aria-expanded={evidenceId === question.id} aria-controls={`exam-evidence-${question.id}`} onClick={event => { evidenceTrigger.current = event.currentTarget; setEvidenceId(id => id === question.id ? '' : question.id); }}><LocateFixed size={15} />{question.evidence?.text || question.evidence?.paragraphId || sentenceId ? 'Locate evidence' : 'Read original text'}</button>{evidenceId === question.id && <QuestionEvidence question={question} response={response} passages={catalog.passages} section={catalog.sections.find(row => row.id === question.sectionId)} loading={loading} error={error} onRetry={reload} onClose={() => { setEvidenceId(''); evidenceTrigger.current?.focus(); }} />}<div className="exam-annotations"><label>Evidence for question {question.number}<textarea disabled={saving} value={annotation.evidence} onChange={event => setNote(question.id, { evidence: event.target.value })} placeholder="Quote the passage or transcript that supports your answer…" /></label><label>Keywords & synonyms for question {question.number}<input disabled={saving} value={annotation.keywords} onChange={event => setNote(question.id, { keywords: event.target.value })} placeholder="question wording → source wording" /></label></div>{!correct && <div className="exam-error-tag"><label>Error reason for question {question.number}<SelectField disabled={saving} value={annotation.reason} onChange={event => setNote(question.id, { reason: event.target.value })}><option value="">Choose a reason</option>{['Missed paraphrase', 'Wrong detail', 'Word limit or spelling', 'Lost concentration', 'Not Given confused with False', 'Distractor or correction', 'Other'].map(reason => <option key={reason} value={reason}>{reason}</option>)}</SelectField></label></div>}{skill === 'listening' && <Link className="btn line" to={`/listening/intensive/${question.sectionId}${sentenceId ? `?sentence=${encodeURIComponent(sentenceId)}` : ''}`}><Headphones size={15} />{sentenceId ? 'Practise this sentence' : 'Practise this listening part'}</Link>}</article>; })}</div></section>;
}
