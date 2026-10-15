import type { ExamPassage } from '../../domain/exam/types';
import { readingParagraphs } from './ReadingPassage';

const normalized = (text: string) => text.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

/** Locate only a unique source block, falling back to a complete sentence when an imported quote differs. */
export function findSourceBlock(container: HTMLElement, target: { block?: string; paragraph?: string | null; sentence?: string | null; quote?: string }, passages: ExamPassage[] = []) {
  const blocks = [...container.querySelectorAll<HTMLElement>('[data-source-block]')].filter(block => !block.closest('[hidden]'));
  const unique = (predicate: (block: HTMLElement) => boolean) => { const matches = blocks.filter(predicate); return matches.length === 1 ? matches[0] : undefined; };
  if (target.block) { const block = unique(row => row.dataset.sourceBlock === target.block); if (block) return block; }
  if (target.sentence) { const block = unique(row => row.dataset.sourceBlock === `sentence:${target.sentence}`); if (block) return block; }
  if (target.paragraph) {
    const block = unique(row => passages.some(passage => row.dataset.sourceBlock === `passage:${passage.id}:${target.paragraph}` || readingParagraphs(passage.paragraphs).some(group => group.label === target.paragraph && row.dataset.sourceBlock === `passage:${passage.id}:${group.fragments[0]?.id}`)));
    if (block) return block;
  }
  if (target.quote) {
    const quote = normalized(target.quote);
    const sourceBlocks = blocks.filter(row => /^(passage|sentence):/.test(row.dataset.sourceBlock || ''));
    const quoted = (text: string) => {
      const matches = (sourceBlocks.length ? sourceBlocks : blocks).filter(row => normalized(row.textContent || '').includes(text));
      return matches.length === 1 ? matches[0] : undefined;
    };
    const full = quoted(quote);
    if (full) return full;
    const sentences = quote.match(/[^.!?]+[.!?](?:\s|$)/g) || [];
    for (const sentence of sentences.sort((a, b) => b.length - a.length)) {
      if (sentence.trim().split(/\s+/).length < 6) continue;
      const block = quoted(sentence.trim());
      if (block) return block;
    }
  }
  if (target.block?.startsWith('question:')) {
    const questionId = target.block.slice('question:'.length);
    const question = [...container.querySelectorAll<HTMLElement>('[data-source-question]')].find(row => row.dataset.sourceQuestion === questionId);
    const gaps = [...container.querySelectorAll<HTMLElement>('[data-exam-gap]')].filter(row => row.dataset.examGap === question?.dataset.sourceNumber);
    return gaps.length === 1 ? gaps[0] : question;
  }
}

export function revealSourceBlock(block: HTMLElement) {
  for (let parent = block.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
  block.dataset.located = 'true';
  block.scrollIntoView?.({ block: 'center', behavior: 'auto' });
  block.focus({ preventScroll: true });
}
