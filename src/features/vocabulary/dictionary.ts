import { normalizeAnswer } from '../../domain/vocabulary';
import type { VocabularySense } from '../../domain/vocabulary';

export type DictionaryIndex = Record<string, string>;
let indexRequest: Promise<DictionaryIndex> | null = null;
const terms = new Map<string, Promise<VocabularySense[]>>();

export function resetDictionaryCache() { indexRequest = null; terms.clear(); }

export function loadDictionaryIndex(): Promise<DictionaryIndex> {
  if (!indexRequest) {
    const request = fetch('/dictionary/index.json').then(async response => {
      if (!response.ok) throw new Error('Dictionary index unavailable');
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid dictionary index');
      return Object.fromEntries(Object.entries(data).filter(([term, file]) => term && typeof file === 'string' && /^[a-f0-9]+\.json$/.test(file))) as DictionaryIndex;
    }).catch(error => { if (indexRequest === request) indexRequest = null; throw error; });
    indexRequest = request;
  }
  return indexRequest;
}

export function loadTermDictionary(term: string): Promise<VocabularySense[]> {
  const normalized = normalizeAnswer(term);
  const cached = terms.get(normalized);
  if (cached) return cached;
  const request = loadDictionaryIndex().then(async index => {
    const file = index[normalized];
    if (!file) return [];
    const response = await fetch(`/dictionary/${file}`);
    if (!response.ok) throw new Error('Dictionary meanings unavailable');
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || !Array.isArray((data as { senses?: unknown }).senses)) throw new Error('Invalid dictionary meanings');
    const seen = new Set<string>();
    return (data as { senses: VocabularySense[] }).senses.filter(sense => {
      if (!sense || typeof sense.id !== 'string' || typeof sense.pos !== 'string' || typeof sense.definition !== 'string' || !sense.definition.trim()) return false;
      const key = `${normalizeAnswer(sense.pos)}:${normalizeAnswer(sense.definition)}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }).catch(error => { if (terms.get(normalized) === request) terms.delete(normalized); throw error; });
  terms.set(normalized, request);
  return request;
}
