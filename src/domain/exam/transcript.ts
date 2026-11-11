import type { ExamSection } from './types';

/** Source-site analysis buttons are UI labels, never spoken transcript words. */
export function cleanExamTranscriptText(text: string): string {
  return text.replace(/\s*Q\s*(?:\d+(?:\s*[-–—,，]\s*\d+)*)?\s*解析/g, '').trim();
}

/** Apply to published legacy data on read; IDs, timings and saved records stay intact. */
export function cleanExamSection(section: ExamSection): ExamSection {
  if (section.skill !== 'listening') return section;
  return { ...section, sentences: section.sentences.map(sentence => ({ ...sentence, text: cleanExamTranscriptText(sentence.text) })) };
}
