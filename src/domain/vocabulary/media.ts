import type { VocabularyEntry } from './types';
import type { ResolvedVocabularyLearningContext } from './context';
import imageManifest from './illustrations.json';
export type VocabularyAccent = 'uk' | 'us';
export type MediaCredit = { sourceUrl: string; author: string; license: string; licenseUrl: string; changes: string };
export type VocabularyRecording = MediaCredit & { url: string; title: string; accent: VocabularyAccent | 'other' | 'unknown'; status: 'verified' | 'unknown' | 'rejected' | 'missing'; availability: 'http-audio' | 'metadata-only' | 'network-unverified' | 'failed'; reason: string; wordformConfirmed?: boolean };
export type VocabularyIllustrationAsset = MediaCredit & { entryId: string; senseId: string; bookId?: string; unitId?: string; src: string; alt: string; caption: string; width: number; height: number };
export type VocabularyMedia = { version: string; recordings: VocabularyRecording[]; loadError?: boolean };
export function legacyVocabularyRecordings(entry: VocabularyEntry): VocabularyRecording[] {
  return (['uk', 'us'] as const).flatMap(accent => {
    const value = entry.pronunciation?.[accent];
    if (!value) return [];
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return [];
      url.search = ''; url.hash = '';
      return [{ url: url.href, title: `Legacy ${accent.toUpperCase()} label (unverified)`, accent: 'unknown' as const, status: 'unknown' as const, availability: 'network-unverified' as const, reason: `Imported ${accent.toUpperCase()} label has not been independently verified.`, author: 'Unverified legacy recording', license: 'Unknown', licenseUrl: '', sourceUrl: url.href, changes: 'Legacy URL retained; accent and redistribution license unverified.' }];
    } catch { return []; }
  });
}
function withLegacy(entry: VocabularyEntry, media: VocabularyMedia): VocabularyMedia {
  const known = new Set(media.recordings.map(item => item.url));
  return { ...media, recordings: [...media.recordings, ...legacyVocabularyRecordings(entry).filter(item => !known.has(item.url))] };
}
const shards = new Map<string, Promise<Record<string, VocabularyMedia>>>();
export function vocabularyMediaShard(id: string) { let hash = 0; for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return (hash % 16).toString(16); }
/** Public, on-demand attribution/status data. Failed requests may be retried; no learning writes. */
export async function getVocabularyMedia(entry: VocabularyEntry): Promise<VocabularyMedia> {
  const shard = vocabularyMediaShard(entry.id);
  let request = shards.get(shard);
  if (!request) {
    request = fetch(`/vocabulary-media/audio/${shard}.json`).then(async response => { if (!response.ok) throw new Error('Media metadata unavailable'); return await response.json() as Record<string, VocabularyMedia>; });
    shards.set(shard, request); request.catch(() => { if (shards.get(shard) === request) shards.delete(shard); });
  }
  try { return withLegacy(entry, (await request)[entry.id] || { version: 'media-2026-10-10.1', recordings: [] }); }
  catch { return withLegacy(entry, { version: 'media-2026-10-10.1', recordings: [], loadError: true }); }
}
export function getVocabularyIllustration(resolved: ResolvedVocabularyLearningContext): VocabularyIllustrationAsset | undefined {
  if (!resolved.sense || !resolved.contentReviewed) return undefined;
  const context = resolved.context;
  return (imageManifest.images as VocabularyIllustrationAsset[]).find(image => image.entryId === resolved.entry.id && image.senseId === resolved.sense?.id && (!image.bookId || image.bookId === context?.bookId && image.unitId === context?.unitId));
}
export function aggregateMediaCredits(recordings: VocabularyRecording[], image?: VocabularyIllustrationAsset): MediaCredit[] {
  return [...new Map([...recordings, ...(image ? [image] : [])].filter(item => item.sourceUrl).map(item => [item.sourceUrl, { sourceUrl: item.sourceUrl, author: item.author, license: item.license, licenseUrl: item.licenseUrl, changes: item.changes }])).values()];
}
