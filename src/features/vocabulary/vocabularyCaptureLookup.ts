import { vocabularyKey, type VocabularyEntry, type VocabularySense } from '../../domain/vocabulary';
import { reviewedEntry } from '../../domain/vocabulary/content';
import { lookupReleasedVocabularyTerms } from '../../storage/vocabularyCatalog';
import { loadDictionaryIndex, loadTermDictionary, resetDictionaryCache } from './dictionary';
import { requestTimeout } from '../../lib/requestTimeout';

export type VocabularyCaptureMatch = { key: string; entry?: VocabularyEntry; sense: VocabularySense; saved: boolean };
export type VocabularyCaptureLookup = { matches: VocabularyCaptureMatch[]; entries: VocabularyEntry[]; suggestions: string[]; unavailable: boolean };

/** Candidates are suggestions only; the learner explicitly chooses any changed dictionary form. */
export function vocabularyLookupForms(term: string): string[] {
  const key = vocabularyKey(term);
  const forms = [key];
  if (/^[a-z'-]+$/.test(key)) {
    if (key.endsWith("'s")) forms.push(key.slice(0, -2));
    if (key.endsWith('ies')) forms.push(key.slice(0, -3) + 'y');
    if (key.endsWith('es')) forms.push(key.slice(0, -2));
    if (key.endsWith('s') && !key.endsWith('ss')) forms.push(key.slice(0, -1));
  }
  return [...new Set(forms.filter(Boolean))];
}

export async function lookupVocabularyCapture(term: string, saved: VocabularyEntry[], options: { force?: boolean } = {}): Promise<VocabularyCaptureLookup> {
  const forms = vocabularyLookupForms(term), key = forms[0];
  if (options.force) resetDictionaryCache();
  const [catalog, dictionary] = await Promise.allSettled([lookupReleasedVocabularyTerms(forms, options), requestTimeout(loadDictionaryIndex())]);
  const publicEntries = catalog.status === 'fulfilled' ? catalog.value.map(reviewedEntry) : [];
  const exactSaved = saved.filter(entry => vocabularyKey(entry.term) === key);
  const exactPublic = publicEntries.filter(entry => vocabularyKey(entry.term) === key);
  const entries = [...exactSaved, ...exactPublic.filter(entry => !exactSaved.some(row => row.id === entry.id))];
  const matches: VocabularyCaptureMatch[] = [];
  const add = (sense: VocabularySense, entry: VocabularyEntry | undefined, isSaved: boolean) => {
    if (!sense.definition.trim()) return;
    if (matches.some(row => row.sense.id === sense.id || vocabularyKey(row.sense.definition) === vocabularyKey(sense.definition) && vocabularyKey(row.sense.pos) === vocabularyKey(sense.pos))) return;
    matches.push({ key: JSON.stringify([entry?.id, sense.id]), entry, sense, saved: isSaved });
  };
  exactSaved.forEach(entry => entry.senses.forEach(sense => add(sense, entry, true)));
  exactPublic.forEach(entry => entry.senses.forEach(sense => add(sense, entry, false)));
  let unavailable = catalog.status === 'rejected' || dictionary.status === 'rejected';
  if (dictionary.status === 'fulfilled' && Object.hasOwn(dictionary.value, key)) {
    try {
      const entry = exactPublic[0] || exactSaved[0];
      const meanings = await requestTimeout(loadTermDictionary(key, entry?.id));
      meanings.forEach(sense => add(sense, entry, false));
    } catch { unavailable = true; }
  }
  const suggestions = forms.slice(1).filter(form => saved.some(entry => vocabularyKey(entry.term) === form)
    || publicEntries.some(entry => vocabularyKey(entry.term) === form)
    || dictionary.status === 'fulfilled' && Object.hasOwn(dictionary.value, form));
  return { matches, entries, suggestions, unavailable };
}
