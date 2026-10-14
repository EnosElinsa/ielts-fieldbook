import { normalizeAnswer } from '../../domain/vocabulary';
import type { VocabularySource } from '../../domain/vocabulary';
import type { ExamAttempt, ExamCatalog } from '../../domain/exam/types';
import type { DictionaryIndex } from '../vocabulary/dictionary';

export type PartVocabularyCandidate = { term: string; score: number; reasons: string[]; sources: VocabularySource[] };
const common = new Set('a an the and or but if of to in on at by for from with as is are was were be been being it its this that these those he she they we you i my your our their not no yes all some any so than then who what when where which how do does did have has had can could may might will would should'.split(' '));
type Block = { text: string; exam: NonNullable<VocabularySource['exam']>; explanation?: boolean };

/** Local dictionary matching only; source text offsets never refer to audio time. */
export function buildPartVocabularyCandidates(catalog: ExamCatalog, attempt: ExamAttempt, sectionId: string, index: DictionaryIndex): PartVocabularyCandidate[] {
  if (attempt.status !== 'completed' || !attempt.sectionIds.includes(sectionId)) return [];
  const section = catalog.sections.find(row => row.id === sectionId && row.skill === attempt.skill);
  if (!section) return [];
  const questions = (attempt.questionSnapshot || catalog.questions).filter(row => row.sectionId === sectionId);
  const base = { sectionId, attemptId: attempt.id };
  const blocks: Block[] = attempt.skill === 'reading'
    ? catalog.passages.filter(row => row.sectionId === sectionId).flatMap(passage => passage.paragraphs.map(paragraph => ({ text: paragraph.text, exam: { ...base, blockId: `passage:${passage.id}:${paragraph.id}`, passageId: passage.id, paragraphId: paragraph.id } })))
    : section.sentences.map(sentence => ({ text: sentence.text, exam: { ...base, blockId: `sentence:${sentence.id}`, sentenceId: sentence.id } }));
  questions.forEach(question => [question.explanation, question.sourceExplanation].filter((text): text is string => Boolean(text)).forEach(text => blocks.push({ text, exam: { ...base, paragraphId: question.evidence?.paragraphId, sentenceId: question.evidence?.sentenceId }, explanation: true })));
  const rows = new Map<string, PartVocabularyCandidate>();
  const hits = (text: string | undefined, term: string) => text && (` ${normalizeAnswer(text).replace(/[^\p{L}\p{N}'-]+/gu, ' ')} `).includes(` ${term} `);
  const maxWords = Math.min(12, Math.max(1, ...Object.keys(index).map(term => term.split(' ').length)));
  for (const block of blocks) {
    const words = [...block.text.matchAll(/[\p{L}\p{N}]+(?:['’\u2010-\u2015-][\p{L}\p{N}]+)*/gu)];
    words.forEach((word, wordIndex) => {
      for (let length = 1; length <= maxWords && wordIndex + length <= words.length; length++) {
        const last = words[wordIndex + length - 1]; const start = word.index!; const end = last.index! + last[0].length;
        const quote = block.text.slice(start, end); const term = normalizeAnswer(quote);
        if (!Object.hasOwn(index, term) || common.has(term) || term.length < 2) continue;
        let row = rows.get(term);
        if (!row) { row = { term, score: 0, reasons: [], sources: [] }; rows.set(term, row); }
        const source: VocabularySource = { type: attempt.skill, skill: attempt.skill, id: sectionId, context: block.text,
          exam: { ...block.exam, ...(!block.explanation ? { quote, start, end } : {}) } };
        if ((!block.explanation || !row.sources.some(item => item.exam?.blockId)) && !row.sources.some(item => JSON.stringify(item) === JSON.stringify(source))) row.sources.push(source);
        const answer = questions.some(question => (Array.isArray(question.answer) ? question.answer : [question.answer]).some(value => hits(value, term)));
        const evidence = questions.some(question => hits(question.evidence?.text, term));
        const explanation = block.explanation || questions.some(question => hits(question.explanation, term) || hits(question.sourceExplanation, term));
        const reasons = [answer ? 'Answer' : '', evidence ? 'Evidence' : '', explanation ? 'Explanation' : '', !block.explanation ? 'Source' : ''].filter(Boolean);
        row.reasons = [...new Set([...row.reasons, ...reasons])];
        row.score = Math.max(row.score, (answer ? 100 : 0) + (evidence ? 60 : 0) + (explanation ? 30 : 0) + (length > 1 ? 15 : 0)) + 1;
      }
    });
  }
  return [...rows.values()].sort((a, b) => b.score - a.score || a.term.localeCompare(b.term, 'en'));
}
