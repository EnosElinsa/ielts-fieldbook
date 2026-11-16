/** Verified import repairs for Cambridge 11 / Test 4 / Passage 1. */
export function readingCopy(passageId: string, text: string) {
  if (passageId !== 'passage:1010') return text;
  return text.replace('DNA,researchers', 'DNA, researchers')
    .replace('different.Epigenetics', 'different. Epigenetics')
    .replace('phrase‘nature', 'phrase ‘nature')
    .replace('a‘third', 'a ‘third')
    .replace("studies.' ‘He", "studies. ‘He");
}
