import type { ExamQuestion } from '../../domain/exam/types';

// Both formats occur in the imported catalogue. Only numbered blank markers
// qualify; an ordinary bracketed number or reference is still source text.
export function examGapMatches(text: string) {
  return text.matchAll(/#####-(\d+)-#####|\[(\d+)\s*_{2,}\s*\]/g);
}

export function examGapNumber(match: RegExpMatchArray) { return Number(match[1] || match[2]); }

function sourceText(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.body.querySelectorAll('p,div,li,tr,br,h3,h4,h5').forEach(node => node.after(' '));
  return parsed.body.textContent || '';
}
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

export function questionPresentation(questions: ExamQuestion[]) {
  return questions.map((question, index) => {
    let start = index; let end = index + 1;
    if (question.groupId) {
      while (start > 0 && questions[start - 1].groupId === question.groupId) start--;
      while (end < questions.length && questions[end].groupId === question.groupId) end++;
    }
    const group = questions.slice(start, end);
    const source = group[0].stimulusHtml || '';
    const text = sourceText(source);
    const hasSourceGap = [...examGapMatches(text)].some(match => examGapNumber(match) === question.number);
    const scaffold = question.prompt === `Question ${question.number} · Complete the marked gap in the ${question.type === 'map' ? 'map' : 'text above'}.`;
    const instructions = normalize(question.instructions || '');
    return {
      group, groupStart: index === start,
      showPrompt: !(scaffold && hasSourceGap),
      showInstructions: Boolean(instructions) && !normalize(text).includes(instructions) && !questions.slice(start, index).some(row => normalize(row.instructions || '') === instructions),
      sharedType: group.length > 1 && group.every(row => row.type === question.type),
      sharedLimit: group.length > 1 && Boolean(question.maxWords) && group.every(row => row.maxWords === question.maxWords),
    };
  });
}

/** Only hide an explicit, matching question label; quantities and dates remain source text. */
export function questionNumberPrefixLength(text: string, number: number, endNumber = number) {
  if (!Number.isInteger(number) || number < 1) return 0;
  if (Number.isInteger(endNumber) && endNumber > number) {
    const range = `${number}\\s*[-–—]\\s*${endNumber}`;
    const label = new RegExp(`^\\s*(?:Questions?\\s+${range}(?:\\s*[.:)·]\\s*|\\s+)|\\(\\s*${range}\\s*\\)\\s*|${range}(?:[.)．、:](?!\\d)\\s*|\\s+))(?=\\S)`, 'i');
    const match = text.match(label);
    if (match) return match[0].length;
  }
  if (new RegExp(`^\\s*(?:Questions?\\s+|\\(\\s*)?${number}\\s*[-–—]\\s*\\d+`, 'i').test(text)) return 0;
  const label = new RegExp(`^\\s*(?:Question\\s+${number}(?:\\s*[.:)·-]\\s*|\\s+)|\\(\\s*${number}\\s*\\)\\s*|${number}(?:[.)．、:](?!\\d)\\s*|\\s+))(?=\\S)`, 'i');
  return text.match(label)?.[0].length || 0;
}
