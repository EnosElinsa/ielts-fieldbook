import type { ExamPassage, ExamQuestion, ExamSection } from '../../domain/exam/types';
import { readingParagraphs } from './ReadingPassage';

export type EvidenceRange = { start: number; end: number };
export type EvidenceLocation = { ranges: Record<string, EvidenceRange[]>; status: 'exact' | 'partial' | 'paragraph' | 'missing' };
type Block = { id: string; text: string; offset?: number };

// Keep a source-offset map: normalising typography must not move saved annotation anchors.
function indexed(text: string) {
  let value = ''; const starts: number[] = []; const ends: number[] = [];
  for (let offset = 0; offset < text.length;) {
    const char = String.fromCodePoint(text.codePointAt(offset)!);
    const next = offset + char.length;
    const normalized = char.normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s/g, ' ');
    for (const part of normalized) {
      if (part === ' ' && value.endsWith(' ')) { ends[ends.length - 1] = next; continue; }
      value += part; starts.push(offset); ends.push(next);
    }
    offset = next;
  }
  return { value, starts, ends };
}

function matchQuote(blocks: Block[], quote: string) {
  const text = blocks.map(block => block.text).join(' '); const source = indexed(text);
  const needle = indexed(quote).value.trim();
  if (!needle) return;
  const first = source.value.indexOf(needle);
  if (first < 0 || source.value.indexOf(needle, first + 1) >= 0) return;
  const start = source.starts[first]; const end = source.ends[first + needle.length - 1];
  let offset = 0; const ranges: Record<string, EvidenceRange[]> = {};
  for (const block of blocks) {
    const from = Math.max(start, offset); const to = Math.min(end, offset + block.text.length);
    if (to > from) ranges[block.id] = [{ start: from - offset + (block.offset || 0), end: to - offset + (block.offset || 0) }];
    offset += block.text.length + 1;
  }
  return ranges;
}

export function locateQuestionEvidence(question: ExamQuestion, passages: ExamPassage[], section?: ExamSection): EvidenceLocation {
  const reference = question.evidence?.paragraphId || question.evidence?.text?.match(/^\s*(?:Paragraph\s+([A-Z])\b|\[([A-Z])\])/i)?.slice(1).find(Boolean);
  const groups = passages.filter(passage => passage.sectionId === question.sectionId).flatMap(passage => readingParagraphs(passage.paragraphs).map(group => ({
    label: group.label,
    blocks: group.fragments.map((fragment, index) => ({ id: `passage:${passage.id}:${fragment.id}`, text: fragment.text.slice(index === 0 ? group.prefixLength || 0 : 0), offset: index === 0 ? group.prefixLength || 0 : 0 })),
    paragraphIds: [...(group.marker ? [group.marker.id] : []), ...group.fragments.map(fragment => fragment.id)],
  })));
  const referenced = reference ? groups.filter(group => group.label.toUpperCase() === reference.toUpperCase() || group.paragraphIds.includes(reference)) : [];
  const sentenceId = question.evidence?.sentenceId || section?.sentences.find(sentence => sentence.questionIds?.includes(question.id))?.id;
  const sentences = section?.sentences || [];
  const blocks: Block[] = question.skill === 'reading' ? (referenced.length === 1 ? referenced : groups).flatMap(group => group.blocks) : sentences.map(sentence => ({ id: `sentence:${sentence.id}`, text: sentence.text }));
  const importedQuote = (question.evidence?.text || '').replace(/^\s*\[[A-Z]\]\s*/i, '').trim();
  const quote = question.skill === 'listening' ? importedQuote.replace(/(?:^|\n)[A-Z][A-Z \t]{0,24}:\s*/g, ' ').trim() : importedQuote;
  if (quote && !/^Paragraph\s+[A-Z]$/i.test(quote)) {
    const full = matchQuote(blocks, quote);
    if (full) return { ranges: full, status: 'exact' };
    // Imported explanations sometimes contain typos. Mark only complete wording
    // that actually occurs in the source, never a guessed answer or sentence.
    const candidates = [...quote.split(/(?<=[.!?])\s+/), ...quote.split(/[,;]\s*/)].filter(text => text.trim().split(/\s+/).length >= 6);
    const partial: Record<string, EvidenceRange[]> = {};
    for (const candidate of candidates) {
      const found = matchQuote(blocks, candidate.trim());
      for (const [id, ranges] of Object.entries(found || {})) (partial[id] ||= []).push(...ranges);
    }
    if (Object.keys(partial).length) return { ranges: partial, status: 'partial' };
  }
  const fallback: Block[] = question.skill === 'reading' ? (referenced.length === 1 ? referenced[0].blocks : []) : sentences.filter(sentence => sentence.id === sentenceId).map(sentence => ({ id: `sentence:${sentence.id}`, text: sentence.text }));
  if (fallback.length) return { ranges: Object.fromEntries(fallback.map(block => [block.id, [{ start: block.offset || 0, end: (block.offset || 0) + block.text.length }]])), status: 'paragraph' };
  return { ranges: {}, status: 'missing' };
}

/** Some imports retain obsolete sentence IDs after transcript realignment. */
export function evidenceSentenceId(question: ExamQuestion, section?: ExamSection) {
  if (!section) return undefined;
  const direct = section.sentences.find(sentence => sentence.id === question.evidence?.sentenceId || sentence.questionIds?.includes(question.id));
  if (direct) return direct.id;
  const block = Object.keys(locateQuestionEvidence(question, [], section).ranges).find(id => id.startsWith('sentence:'));
  return block?.slice('sentence:'.length);
}
