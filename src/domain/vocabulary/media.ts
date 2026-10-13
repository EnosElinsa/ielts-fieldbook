import type { VocabularyEntry } from './types';
import type { ResolvedVocabularyLearningContext } from './context';
import { vocabularySensePresentation } from './dictionaryPresentation';
import imageManifest from './illustrations.json';
export type VocabularyAccent = 'uk' | 'us';
export type MediaCredit = { sourceUrl: string; author: string; license: string; licenseUrl: string; changes: string };
export type VocabularyRecording = MediaCredit & { url: string; aliases?: string[]; title: string; accent: VocabularyAccent | 'other' | 'unknown'; status: 'verified' | 'unknown' | 'rejected' | 'missing'; availability: 'http-audio' | 'metadata-only' | 'network-unverified' | 'failed'; reason: string; wordformConfirmed?: boolean };
export type VocabularyIllustrationAsset = MediaCredit & { entryId: string; senseId: string; bookId?: string; unitId?: string; src: string; alt: string; caption: string; width: number; height: number };
export type VocabularyMedia = { version: string; recordings: VocabularyRecording[]; loadError?: boolean };
/** Remove recognized tracking only, preserving functional/signed query bytes and order. */
export function sanitizeVocabularyMediaUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    const query = url.search.slice(1).split('&').filter(parameter => {
      let name: string;
      try { name = decodeURIComponent(parameter.split('=', 1)[0].replace(/\+/g, ' ')).toLowerCase(); }
      catch { return true; }
      return !name.startsWith('utm_') && !['fbclid', 'gclid', 'dclid', 'msclkid', '_ga', '_gl', 'mc_cid', 'mc_eid'].includes(name);
    }).join('&');
    url.search = query; url.hash = '';
    return url.href;
  } catch { return undefined; }
}
export function legacyVocabularyRecordings(entry: VocabularyEntry): VocabularyRecording[] {
  return (['uk', 'us'] as const).flatMap(accent => {
    const value = entry.pronunciation?.[accent];
    if (!value) return [];
    const url = sanitizeVocabularyMediaUrl(value);
    if (!url) return [];
    return [{ url, title: `Legacy ${accent.toUpperCase()} label (unverified)`, accent: 'unknown' as const, status: 'unknown' as const, availability: 'network-unverified' as const, reason: `Imported ${accent.toUpperCase()} label has not been independently verified.`, author: 'Unverified legacy recording', license: 'Unknown', licenseUrl: '', sourceUrl: url, changes: 'Legacy URL retained; accent and redistribution license unverified.' }];
  });
}
function withLegacy(entry: VocabularyEntry, media: VocabularyMedia): VocabularyMedia {
  // An alias shares the canonical file's rejection/wordform evidence, never a new candidate.
  const known = new Set(media.recordings.flatMap(item => [item.url, ...(item.aliases || [])]).map(sanitizeVocabularyMediaUrl).filter(Boolean));
  return { ...media, recordings: [...media.recordings, ...legacyVocabularyRecordings(entry).filter(item => !known.has(item.url))] };
}
const shards = new Map<string, Promise<Record<string, VocabularyMedia>>>();
export function vocabularyMediaShard(id: string) { let hash = 0; for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return (hash % 16).toString(16); }
/** Public, on-demand attribution/status data. Failed requests may be retried; no learning writes. */
export async function getVocabularyMedia(entry: VocabularyEntry, options: { retry?: boolean } = {}): Promise<VocabularyMedia> {
  const shard = vocabularyMediaShard(entry.id);
  if (options.retry) shards.delete(shard);
  let request = shards.get(shard);
  if (!request) {
    request = fetch(`/vocabulary-media/audio/${shard}.json`).then(async response => { if (!response.ok) throw new Error('Media metadata unavailable'); return await response.json() as Record<string, VocabularyMedia>; });
    shards.set(shard, request); request.catch(() => { if (shards.get(shard) === request) shards.delete(shard); });
  }
  try { return withLegacy(entry, (await request)[entry.id] || { version: 'media-2026-10-11.2', recordings: [] }); }
  catch { return withLegacy(entry, { version: 'media-2026-10-11.2', recordings: [], loadError: true }); }
}
export function getVocabularyIllustration(resolved: ResolvedVocabularyLearningContext): VocabularyIllustrationAsset | undefined {
  if (!resolved.sense || !resolved.contentReviewed) return undefined;
  const context = resolved.context;
  return (imageManifest.images as VocabularyIllustrationAsset[]).find(image => image.entryId === resolved.entry.id && image.senseId === resolved.sense?.id && (!image.bookId || image.bookId === context?.bookId && image.unitId === context?.unitId));
}
export function aggregateMediaCredits(recordings: VocabularyRecording[], image?: VocabularyIllustrationAsset): MediaCredit[] {
  return [...new Map([...recordings, ...(image ? [image] : [])].filter(item => item.sourceUrl).map(item => [item.sourceUrl, { sourceUrl: item.sourceUrl, author: item.author, license: item.license, licenseUrl: item.licenseUrl, changes: item.changes }])).values()];
}
export type VocabularyVisualConcept = 'pea' | 'carrot' | 'apple' | 'banana' | 'grape' | 'lemon' | 'orange' | 'vegetable' | 'fruit' | 'paste';
/** A drawn food scene needs both the exact word and a concrete selected noun meaning. */
export function getVocabularyVisualConcept(resolved: ResolvedVocabularyLearningContext): VocabularyVisualConcept | undefined {
  const sense = resolved.sense;
  if (!sense || !/^noun\b/i.test(sense.pos.trim())) return undefined;
  const definition = vocabularySensePresentation(sense).definition.toLowerCase();
  if (/\b(company|corporation|software|computer|device|person|reward|incentive|metaphor|figurative|result|outcome|profit|colour|color|political|currency)\b/.test(definition)) return undefined;
  const term = resolved.entry.term.trim().toLowerCase();
  const candidates: { words: string[]; concept: VocabularyVisualConcept; meaning: RegExp }[] = [
    { words: ['paste'], concept: 'paste', meaning: /\b(mixture|substance)\b/ },
    { words: ['pea', 'peas'], concept: 'pea', meaning: /\b(legume|pod|vegetable)\b|\b(round|spherical|green|edible|small)\b.*\bseed/ },
    { words: ['carrot', 'carrots'], concept: 'carrot', meaning: /\b(root|vegetable|edible)\b/ },
    { words: ['apple', 'apples'], concept: 'apple', meaning: /\b(fruit|orchard|edible)\b/ },
    { words: ['banana', 'bananas'], concept: 'banana', meaning: /\b(fruit|edible|tropical)\b/ },
    { words: ['grape', 'grapes'], concept: 'grape', meaning: /\b(fruit|berry|berries|vine)\b/ },
    { words: ['lemon', 'lemons'], concept: 'lemon', meaning: /\b(fruit|citrus|edible)\b/ },
    { words: ['orange', 'oranges'], concept: 'orange', meaning: /\b(fruit|citrus|edible)\b/ },
    { words: ['vegetable', 'vegetables'], concept: 'vegetable', meaning: /\b(plant|food|edible|root|leaf|leaves)\b/ },
    { words: ['fruit', 'fruits'], concept: 'fruit', meaning: /\b(plant|seed|seeds|food|edible|sweet)\b/ },
  ];
  return candidates.find(candidate => candidate.words.includes(term) && candidate.meaning.test(definition))?.concept;
}
