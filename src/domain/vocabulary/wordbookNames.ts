const names: Record<string, string> = {
  'guixue:10174': 'IELTS Vocabulary',
  'guixue:10176': 'IELTS Reading Keywords',
  'guixue:11320': 'IELTS Listening Vocabulary',
  'guixue:10177': 'IELTS Listening Essentials',
  'guixue:21953': 'IELTS Listening Practice 21',
  'guixue:10216': 'IELTS Listening Practice 20',
};
export function genericWordbook<T extends { id: string; title: string }>(book: T): T {
  return names[book.id] ? { ...book, title: names[book.id], description: 'Vocabulary organised into chapters and study groups.' } : book;
}
