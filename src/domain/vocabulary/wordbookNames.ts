const names: Record<string, string> = {
  'ielts-vocabulary': 'IELTS Vocabulary',
  'ielts-reading-keywords': 'IELTS Reading Keywords',
  'ielts-listening-vocabulary': 'IELTS Listening Vocabulary',
  'ielts-listening-essentials': 'IELTS Listening Essentials',
  'ielts-listening-practice-21': 'IELTS Listening Practice 21',
  'ielts-listening-practice-20': 'IELTS Listening Practice 20',
};
export function genericWordbook<T extends { id: string; title: string }>(book: T): T {
  return names[book.id] ? { ...book, title: names[book.id], description: 'Vocabulary organised into chapters and study groups.' } : book;
}
