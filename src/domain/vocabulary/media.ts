import type { VocabularyEntry } from './types';
import type { ResolvedVocabularyLearningContext } from './context';
import { vocabularySensePresentation } from './dictionaryPresentation';
import imageManifest from './illustrations.json';
import senseDiagrams from './senseDiagrams.json';
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
export type VocabularySenseDiagram = typeof senseDiagrams[number];
/** An edited definition or another sense cannot inherit this editorial diagram. */
export function getVocabularySenseDiagram(resolved: Pick<ResolvedVocabularyLearningContext, 'entry' | 'sense'>): VocabularySenseDiagram | undefined {
  const sense = resolved.sense;
  if (!sense || sense.source === 'Personal note') return;
  return senseDiagrams.find(row => row.entryId === resolved.entry.id && row.term === resolved.entry.term && row.senseId === sense.id && row.definition === sense.definition && row.pos === sense.pos);
}
export type VocabularyVisualConcept = 'pea' | 'carrot' | 'apple' | 'banana' | 'grape' | 'lemon' | 'orange' | 'vegetable' | 'fruit' | 'paste'
 | 'wheat' | 'grain' | 'rice' | 'corn' | 'flour' | 'bread' | 'tomato' | 'potato' | 'onion' | 'garlic' | 'mushroom' | 'egg' | 'cheese' | 'nut'
 | 'fork' | 'spoon' | 'knife' | 'cutlery' | 'bowl' | 'plate' | 'cup' | 'glass' | 'kettle' | 'pan' | 'pot'
 | 'boil' | 'steam' | 'bake' | 'fry' | 'slice' | 'grind' | 'evaporate' | 'condense' | 'freeze' | 'melt' | 'increase' | 'decrease';
const noun = /^noun\b/i;
const verb = /^verb\b/i;
const visualConcepts: { words: string[]; concept: VocabularyVisualConcept; meaning: RegExp; pos: RegExp }[] = [
 { words: ['wheat'], concept: 'wheat', pos: noun, meaning: /\b(cereal|grain|triticum)\b/ },
 { words: ['grain', 'grains'], concept: 'grain', pos: noun, meaning: /\b(cereal|wheat|rice|crop)\b|\bseed\b.*\b(food|grass)\b/ },
 { words: ['rice'], concept: 'rice', pos: noun, meaning: /\b(grains?|seeds?)\b/ },
 { words: ['corn', 'maize'], concept: 'corn', pos: noun, meaning: /\b(maize|cereal|grain|zea|seed|cob)\b/ },
 { words: ['flour'], concept: 'flour', pos: noun, meaning: /\b(powder|grind|ground)\b.*\b(grain|cereal|wheat|seed)\b/ },
 { words: ['bread'], concept: 'bread', pos: noun, meaning: /\b(food|flour|dough|baked|baking)\b/ },
 { words: ['tomato', 'tomatoes'], concept: 'tomato', pos: noun, meaning: /\b(fruit|plant|vegetable|edible|lycopersicum)\b/ },
 { words: ['potato', 'potatoes'], concept: 'potato', pos: noun, meaning: /\b(tuber|tubers|vegetable|edible|starchy)\b/ },
 { words: ['onion', 'onions'], concept: 'onion', pos: noun, meaning: /\b(bulb|vegetable|allium)\b/ },
 { words: ['garlic'], concept: 'garlic', pos: noun, meaning: /\b(bulb|allium|clove|cloves)\b/ },
 { words: ['mushroom', 'mushrooms'], concept: 'mushroom', pos: noun, meaning: /\b(fungus|fungi|fruiting|edible)\b/ },
 { words: ['egg', 'eggs'], concept: 'egg', pos: noun, meaning: /\b(bird|birds|shell|yolk|food)\b/ },
 { words: ['cheese'], concept: 'cheese', pos: noun, meaning: /\b(milk|curd|curds|dairy|food)\b/ },
 { words: ['nut', 'nuts'], concept: 'nut', pos: noun, meaning: /\b(seed|seeds|fruit|fruits|edible|shelled)\b/ },
 { words: ['fork', 'forks'], concept: 'fork', pos: noun, meaning: /\b(prong|prongs|tines)\b.*\b(food|eating)\b|\b(eating|food)\b.*\b(prong|prongs|tines)\b/ },
 { words: ['spoon', 'spoons'], concept: 'spoon', pos: noun, meaning: /\b(utensil|eating|serving|scooped)\b/ },
 { words: ['knife', 'knives'], concept: 'knife', pos: noun, meaning: /\b(blade|cutting|utensil)\b/ },
 { words: ['cutlery'], concept: 'cutlery', pos: noun, meaning: /\b(knives|forks|spoons|eating|utensils)\b/ },
 { words: ['bowl', 'bowls'], concept: 'bowl', pos: noun, meaning: /\b(container|vessel|dish)\b/ },
 { words: ['plate', 'dish'], concept: 'plate', pos: noun, meaning: /\b(vessel|plate|container)\b.*\b(food|serving|holding)\b|\b(food|serving)\b.*\b(vessel|plate|container)\b/ },
 { words: ['cup', 'mug'], concept: 'cup', pos: noun, meaning: /\b(beverage|beverages|drinking|drink|tea|coffee)\b/ },
 { words: ['glass'], concept: 'glass', pos: noun, meaning: /\b(drinking|drink|beverage|beverages)\b/ },
 { words: ['kettle'], concept: 'kettle', pos: noun, meaning: /\b(boiling|heating)\b.*\b(water|liquid)\b/ },
 { words: ['pan'], concept: 'pan', pos: noun, meaning: /\b(cooking|frying)\b/ },
 { words: ['pot'], concept: 'pot', pos: noun, meaning: /\b(cooking|cook|boiling)\b/ },
 { words: ['boil', 'boiling'], concept: 'boil', pos: /^(verb|noun)\b/i, meaning: /\b(liquid|water)\b.*\b(heat|heating|bubbl\w*|vapou?r|gas)\b|\b(heat|heating|bubbl\w*)\b.*\b(liquid|water)\b/ },
 { words: ['steam'], concept: 'steam', pos: verb, meaning: /\bcook\b.*\b(steam|vapou?r)\b/ },
 { words: ['bake', 'baking', 'roast'], concept: 'bake', pos: verb, meaning: /\bcook\b.*\boven\b/ },
 { words: ['fry', 'frying'], concept: 'fry', pos: verb, meaning: /\bcook\b.*\b(oil|fat)\b/ },
 { words: ['slice'], concept: 'slice', pos: /^(noun|verb)\b/i, meaning: /\bthin\b.*\b(piece|pieces|cut)\b/ },
 { words: ['grind'], concept: 'grind', pos: verb, meaning: /\b(crushing|crush|powder|smaller pieces)\b/ },
 { words: ['evaporate', 'evaporation'], concept: 'evaporate', pos: /^(verb|noun)\b/i, meaning: /\bliquid\b.*\b(gas|vapou?r)\b/ },
 { words: ['condense', 'condensation'], concept: 'condense', pos: /^(verb|noun)\b/i, meaning: /\b(gas|vapou?r)\b.*\bliquid\b/ },
 { words: ['freeze', 'freezing'], concept: 'freeze', pos: /^(verb|noun)\b/i, meaning: /\bliquid\b.*\bsolid\b|\b(ice|solid)\b.*\b(cold|cool|temperature)\b/ },
 { words: ['melt', 'melting'], concept: 'melt', pos: /^(verb|noun)\b/i, meaning: /\bsolid\b.*\bliquid\b|\bliquid\b.*\b(heat|warm)\b/ },
 { words: ['increase', 'rise', 'increment'], concept: 'increase', pos: /^(verb|noun)\b/i, meaning: /\b(amount|number|quantity|greater|larger)\b/ },
 { words: ['decrease', 'reduce', 'reduction', 'decline', 'diminish'], concept: 'decrease', pos: /^(verb|noun)\b/i, meaning: /\b(amount|number|quantity|smaller)\b/ },
];
/** Match the selected definition and part of speech, never the word's spelling alone. */
export function getVocabularyVisualConcept(resolved: ResolvedVocabularyLearningContext): VocabularyVisualConcept | undefined {
  const sense = resolved.sense;
  if (!sense) return undefined;
  const definition = vocabularySensePresentation(sense).definition.toLowerCase();
  if (/\b(company|corporation|software|computer|person|reward|incentive|metaphor|figurative|outcome|profit|colour|color|political|currency)\b/.test(definition)) return undefined;
  const term = resolved.entry.term.trim().toLowerCase();
  const concept = visualConcepts.find(candidate => candidate.words.includes(term) && candidate.pos.test(sense.pos.trim()) && candidate.meaning.test(definition))?.concept;
  if (concept) return concept;
  if (!noun.test(sense.pos.trim()) || /\b(result|device)\b/.test(definition)) return undefined;
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
