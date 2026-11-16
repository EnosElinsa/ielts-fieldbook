type WritingQuestion = { id: string | number; source?: string; prompt?: string; name?: string; format?: string };

/** Verified transcription repairs, scoped to the original imported question identity. */
const repairs: Record<string, [string, string][]> = {
  '1219': [['tablesshow', 'tables show'], ['Staten lsland', 'Staten Island']],
  '1221': [['site ofa farm', 'site of a farm'], ['byselecting', 'by selecting']],
  '1225': [['the mail features', 'the main features']],
  '1091': [['fordifferent', 'for different'], ['period2000', 'period 2000'], ['andmake', 'and make']],
  '1100': [['andmake', 'and make']],
  '1058': [['T he diagram', 'The diagram']],
  '699': [['T he charts', 'The charts'], ['inownership', 'in ownership'], ['houseworkin', 'housework in']],
  '717': [['anairport', 'an airport']],
  '760': [['Thetable', 'The table']],
  '765': [['selectingand', 'selecting and']],
  '1003': [['dioxide(CO2)', 'dioxide (CO2)']],
  '1014': [['The table below show ', 'The table below shows '], ['afterit', 'after it']],
  '955': [['seconachart', 'second chart'], ['comparisonswhere', 'comparisons where']],
  '1220': [['human right, Therefore', 'human right. Therefore']],
  '1222': [['I n many countries', 'In many countries'], ['primaryand', 'primary and'], ['oflong', 'of long'], ['ofshorter', 'of shorter']],
  '1224': [['everyyear', 'every year']],
  '1092': [['agood thing', 'a good thing'], ['ownknowledge', 'own knowledge']],
  '1101': [['alonger weekend', 'a longer weekend']],
  '695': [['Wr ite about', 'Write about']],
  '718': [['drinkproducts', 'drink products']],
  '743': [['often toId', 'often told']],
  '752': [['bestto accept', 'best to accept']],
  '787': [['organisationWhy', 'organisation. Why'], ['caseWhat', 'case? What']],
  '796': [['problemsTo', 'problems. To']],
  '1037': [['sim ilar', 'similar']],
  '954': [['technologyIn', 'technology. In'], ['makeHas', 'make? Has']],
};
const reasons = 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.';

export function normalizeWritingQuestion<T extends WritingQuestion>(question: T): T {
  try {
    const source = new URL(question.source || '');
    if (source.hostname !== 'www.ieltscb.com' || source.pathname !== '/WriteQuestion/getPartWriteInfo' || source.searchParams.get('chapters_id') !== String(question.id) || typeof question.prompt !== 'string') return question;
  } catch { return question; }
  let prompt = question.prompt.replace(/[^\S\n]+/g, ' ').trim();
  for (const [before, after] of repairs[String(question.id)] || []) prompt = prompt.split(before).join(after);
  prompt = prompt.replace(/,(?=[A-Za-z])/g, ', ').replace(/([.!?])(?=[A-Z][a-z]+)/g, '$1 ');
  if (String(question.id) === '728') prompt = prompt.replace(`${reasons} ${reasons}`, reasons);
  prompt = prompt.replace(/\s*(Summarise the information by selecting)/, '\n\n$1').replace(/\s*(Give reasons for your answer)/, '\n\n$1').trim();
  const category = String(question.id) === '1347' && question.format === '柱状图'
    ? { format: '教育类', name: question.name?.replace('柱状图', '教育类') } : {};
  return { ...question, ...category, prompt };
}
