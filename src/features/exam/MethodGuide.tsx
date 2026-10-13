import { X, Compass } from 'lucide-react';
import type { ExamSkill, QuestionType } from '../../domain/exam/types';
import { QUESTION_TYPE_NAMES } from './useExamCatalog';
const typeTips: Record<QuestionType, string> = {
  gap: 'Predict the grammar of the missing word. Copy the exact source word and check the word limit.',
  single: 'Compare every option with the source. An option may repeat a keyword while changing the meaning.',
  multiple: 'Check each option separately. Select only the number of choices requested.',
  'true-false': 'True agrees with the text; False contradicts it; Not Given lacks enough evidence. Do not use outside knowledge.',
  'yes-no': 'Judge the writer’s claim, not your opinion. A missing opinion is Not Given.',
  matching: 'Look for the relationship described in the question, then check that the chosen item expresses it.',
  heading: 'Find the paragraph’s main purpose. A heading should cover the whole paragraph, not one example.',
  map: 'Follow the starting point, direction and landmarks. Confirm which label the speaker or diagram identifies.',
  flow: 'Follow the process in order. Predict the missing word’s role at each step.',
  summary: 'Read the whole summary first. Locate the relevant source section and fit the word grammatically.',
};
export function MethodGuide({ skill, types = [], onClose }: { skill: ExamSkill; types?: QuestionType[]; onClose: () => void }) {
  return <aside className="exam-method" aria-label={`${skill} method guide`}><div className="exam-method-head"><strong><Compass size={17} />{skill === 'reading' ? 'Reading strategies' : 'Listening strategies'}</strong><button className="btn text icon-btn" onClick={onClose} aria-label="Close method guide"><X size={17} /></button></div><details className="exam-method-details" open={window.innerWidth > 740}><summary>Practice steps and question tips</summary><ol>{(skill === 'reading' ? ['Read the question and mark a distinctive keyword. Scan for the matching idea.', 'Read the surrounding sentences and note the text that supports your answer.', 'Connect the question’s wording to the source’s wording. Check meaning and the word limit.'] : ['Before the recording starts, predict the answer’s topic, grammar and likely form.', 'Follow signposts, corrections and changes of direction. Keep moving if you miss an answer.', 'Check spelling, singular or plural forms and the requested number of words.']).map(step => <li key={step}>{step}</li>)}</ol>{[...new Set(types)].map(type => <p key={type}><b>{QUESTION_TYPE_NAMES[type]}.</b> {typeTips[type]}</p>)}</details></aside>;
}
