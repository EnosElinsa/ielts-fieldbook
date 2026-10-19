import type { QualityReport } from './vocabulary-quality';
// @ts-expect-error The existing source renderer is shared with its executable audit.
import { plainSourceGloss } from './audit-vocabulary-dictionary.mjs';

type Work = QualityReport['work'][number];
type Page = { title: string; revision: number; text: string };
type Block = { pos: string; line: string; definition: string | null; examples: string[] };
const object = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const posNames: Record<string, string> = { Noun: 'noun', Verb: 'verb', Adjective: 'adj', Adverb: 'adv', 'Proper noun': 'name', Conjunction: 'conj', Preposition: 'prep', Pronoun: 'pron', Determiner: 'det', Interjection: 'intj', Numeral: 'num', Article: 'article' };
const knownGlossTemplates = new Set(['lb', 'label', 'l', 'm', 'w', 'U', 'cap', 'ng', 'n-g', 'non-gloss']);
const templateNames = (value: string) => [...value.matchAll(/\{\{\s*([^{}|]+)[|}]/g)].map(match => match[1].trim());

function sourceTitle(item: Work) {
  try {
    const url = new URL(item.originalSense?.sourceUrl || '');
    if (url.origin !== 'https://en.wiktionary.org') return null;
    return (url.pathname.startsWith('/wiki/') ? decodeURIComponent(url.pathname.slice(6)) : url.pathname === '/w/index.php' ? url.searchParams.get('title') : null)?.replaceAll('_', ' ') || null;
  } catch { return null; }
}
function pagesFrom(responses: unknown[]) {
  const pages = new Map<string, Page[]>();
  for (const response of responses) {
    const value = object(object(response)?.query)?.pages;
    for (const raw of Object.values(object(value) || (Array.isArray(value) ? value : {}))) {
      const page = object(raw), revisions = page?.revisions;
      if (typeof page?.title !== 'string' || !Array.isArray(revisions) || revisions.length !== 1) continue;
      const revision = object(revisions[0]), main = object(object(revision?.slots)?.main), text = main?.['*'] ?? main?.content ?? revision?.['*'];
      if (!Number.isSafeInteger(revision?.revid) || Number(revision?.revid) <= 0 || typeof text !== 'string') continue;
      const row = { title: page.title.replaceAll('_', ' '), revision: Number(revision?.revid), text };
      const prior = pages.get(row.title) || [];
      if (!prior.some(other => other.revision === row.revision && other.text === row.text)) prior.push(row);
      pages.set(row.title, prior);
    }
  }
  return pages;
}
function sourceBlocks(text: string) {
  const blocks: Block[] = []; let english = false, pos = '', current: Block | undefined, depth = 0;
  for (const line of text.split(/\r?\n/)) {
    const header = /^(={2,6})\s*([^=]+?)\s*\1\s*$/.exec(line);
    if (header) {
      current = undefined;
      if (header[1].length === 2) { english = header[2] === 'English'; pos = ''; }
      else pos = posNames[header[2]] || '';
      continue;
    }
    if (!english || !pos) continue;
    const definition = /^(#+)\s*([^#:*].*)$/.exec(line);
    if (definition) {
      const unsupported = templateNames(line).some(name => !knownGlossTemplates.has(name));
      current = { pos, line, definition: unsupported ? null : plainSourceGloss(line), examples: [] };
      depth = definition[1].length; blocks.push(current); continue;
    }
    const example = /^(#+)([:*].*)$/.exec(line);
    if (current && example?.[1].length === depth) current.examples.push(line);
  }
  return blocks;
}

/** Split only top-level template parameters; nested links/templates retain their own pipes. */
function parameters(text: string) {
  const result: string[] = []; let current = '', braces = 0, links = 0;
  for (let i = 0; i < text.length; i++) {
    const pair = text.slice(i, i + 2);
    if (pair === '{{') { braces++; current += pair; i++; }
    else if (pair === '}}') { braces--; current += pair; i++; }
    else if (pair === '[[') { links++; current += pair; i++; }
    else if (pair === ']]') { links--; current += pair; i++; }
    else if (text[i] === '|' && !braces && !links) { result.push(current); current = ''; }
    else current += text[i];
  }
  result.push(current); return result;
}
function usageExample(line: string): { text?: string; reason?: string } {
  const raw = line.replace(/^#+:\s*/, '');
  if (!/^#+:/.test(line) || !/^\{\{(?:ux|uxi|usex)\|en\|/.test(raw) || !raw.endsWith('}}')) return { reason: 'Not a direct supported English usage example.' };
  const values = parameters(raw.slice(2, -2));
  const example = values[2];
  if (!example || /^\s*\w+=/.test(example) || templateNames(example).length || /[{}<>]|\[\s*(?:…|\.{3})\s*\]|\b(?:thou|thee|thy|thine|hath|doth)\b|ſ/i.test(example)) return { reason: 'Unsupported markup, truncation or archaic wording.' };
  const text = plainSourceGloss(example);
  if (!text || /^(?:Near[- ]synonyms?|Synonyms?|Antonyms?|Meronyms?|Citations?|Related terms?)\s*:/i.test(text) || !/[.!?][”"’')\]]*$/.test(text)) return { reason: 'Relation, citation or sentence-fragment signal.' };
  return { text };
}

export function prepareSourceCandidates(report: QualityReport, items: QualityReport['work'], responses: unknown[]) {
  if (!items.length || items.length > 1000) throw new Error('Supply 1–1000 work items.');
  const current = new Map(report.work.map(row => [row.workItemId, row])), seen = new Set<string>(), pages = pagesFrom(responses);
  const prepared = items.map(input => {
    const item = current.get(input.workItemId);
    if (!item || item.sourceHash !== input.sourceHash || item.displayHash !== input.displayHash) throw new Error('Unknown or stale work item: ' + input.workItemId);
    if (seen.has(item.workItemId)) throw new Error('Duplicate work identity: ' + item.workItemId);
    seen.add(item.workItemId);
    const title = sourceTitle(item), available = title ? pages.get(title) || [] : [], page = available.length === 1 ? available[0] : undefined;
    const blocks = page ? sourceBlocks(page.text) : [];
    const matches = blocks.filter(block => block.pos === item.originalSense?.pos && block.definition === item.originalSense?.definition);
    const sameMeaning = item.originalSense && item.originalSense.definition === item.displaySense.definition && item.originalSense.pos === item.displaySense.pos;
    const matched = Boolean(sameMeaning && page && matches.length === 1), block = matched ? matches[0] : undefined;
    const examples = (block?.examples || []).map(raw => ({ raw, ...usageExample(raw) }));
    const suggestions = [...new Set(examples.flatMap(row => row.text ? [row.text] : []))];
    const referenceUrl = page ? 'https://en.wiktionary.org/w/index.php?title=' + encodeURIComponent(page.title) + '&oldid=' + page.revision : '';
    const draft = { workItemId: item.workItemId, sourceHash: item.sourceHash, displayHash: item.displayHash,
      definition: item.displaySense.definition, pos: item.displaySense.pos, example: suggestions[0] || '',
      collocations: [...(item.displaySense.collocations || [])], distinctions: [...(item.displaySense.distinctions || [])], referenceUrl };
    const missingFields = [!draft.example && 'example', !draft.collocations.some(text => text.trim()) && 'collocations', !draft.distinctions.some(text => text.trim()) && 'distinctions'].filter(Boolean) as string[];
    return { workItemId: item.workItemId, term: item.term, senseId: item.senseId, scopes: item.scopes,
      status: matched ? 'semantic-review-required' : 'manual-source-match-required',
      reason: matched ? null : !sameMeaning ? 'The displayed teaching meaning differs from the preserved original.' : available.length !== 1 ? 'Missing or conflicting revision-bound page.' : `Expected one exact original gloss/POS match; found ${matches.length}.`,
      source: page ? { title: page.title, revision: page.revision, url: referenceUrl, gloss: block?.line || null } : null,
      sourceBlocks: matched ? undefined : blocks, exampleSuggestions: suggestions,
      rejectedExamples: examples.filter(row => !row.text).map(({ raw, reason }) => ({ raw, reason })),
      draft, missingFields };
  });
  return { schemaVersion: 1, items: prepared, matched: prepared.filter(row => row.status === 'semantic-review-required').length,
    withExampleSuggestions: prepared.filter(row => row.exampleSuggestions.length).length,
    manualSourceMatches: prepared.filter(row => row.status === 'manual-source-match-required').length,
    readyForPublication: 0, semanticReviewRequired: prepared.length };
}
