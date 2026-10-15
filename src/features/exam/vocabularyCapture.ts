import { resolveTextAnchor } from '../../domain/exam/annotations';
import type { ExamCatalog, ExamSkill } from '../../domain/exam/types';
import type { VocabularySource } from '../../domain/vocabulary';
import type { SourceSelection } from './SourceAnnotations';
import { vocabularySelectionText } from '../../domain/exam/textSelection';

type CaptureContext = { catalog: ExamCatalog; sectionId: string; skill: ExamSkill; attemptId?: string };

/** Clean the entry text without altering the original quote/offsets used for its source backlink. */
export function examVocabularySeed(selection: SourceSelection, context: CaptureContext, root: ParentNode = document) {
  const term = vocabularySelectionText(selection.quote);
  if (!term) return null;
  const sources = examVocabularySources(selection, context, root);
  if (!sources.length) return null;
  const count = term.split(/\s+/u).length;
  const category = count === 1 ? 'word' as const : count > 6 ? 'sentence' as const : 'phrase' as const;
  return { term, category, skill: context.skill, sourceId: context.sectionId, sourceType: context.skill, context: selection.context, example: selection.context, sources };
}

/** Each selected block keeps its own quote, text offsets and current source context. */
export function examVocabularySources(selection: SourceSelection, { catalog, sectionId, skill, attemptId }: CaptureContext, root: ParentNode = document): VocabularySource[] {
  return selection.anchors.flatMap(anchor => {
    const nodes = [...root.querySelectorAll<HTMLElement>('[data-source-block]')].filter(node => node.dataset.sourceBlock === anchor.blockId);
    const block = nodes.find(node => resolveTextAnchor(anchor, node.textContent || '', node.dataset.sourceVersion || ''));
    if (!block) return [];
    const context = block.textContent || '';
    const range = resolveTextAnchor(anchor, context, block.dataset.sourceVersion || '');
    if (!range) return [];
    const passage = catalog.passages?.find(row => row.sectionId === sectionId && row.paragraphs.some(paragraph => `passage:${row.id}:${paragraph.id}` === anchor.blockId));
    const paragraph = passage?.paragraphs.find(row => `passage:${passage.id}:${row.id}` === anchor.blockId);
    const sentence = catalog.sections.find(row => row.id === sectionId)?.sentences.find(row => `sentence:${row.id}` === anchor.blockId);
    return [{ type: skill, id: sectionId, skill, context, exam: { sectionId, ...(attemptId ? { attemptId } : {}), blockId: anchor.blockId,
      ...(passage ? { passageId: passage.id } : {}), ...(paragraph ? { paragraphId: paragraph.id } : {}), ...(sentence ? { sentenceId: sentence.id } : {}),
      quote: context.slice(range.start, range.end), start: range.start, end: range.end } }];
  });
}
