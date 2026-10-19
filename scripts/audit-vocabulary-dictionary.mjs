import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const identity = (entryId, senseId) => JSON.stringify([entryId, senseId]);
// Index keys are lowercase; source URLs retain their independent case-sensitive titles.
const dictionaryTerm = entry => entry?.term?.trim().toLowerCase();
const hash = value => createHash('sha256').update(JSON.stringify(value) ?? 'null').digest('hex');
const areas = ['definition', 'example', 'collocations', 'distinctions'];
export const plainSourceGloss = value => value.replace(/<!--[^]*?-->/g, '').replace(/^#+\s*/, '')
  .replace(/\{\{(?:lb|label)\|(?:[^{}]|\{\{[^{}]*\}\})*\}\}/g, '')
  .replace(/\[\[(?:File|Image):[^]*?\]\]/g, '')
  .replace(/\{\{(?:U|cap)\|([^{}|]+)\}\}/g, (_, term) => term[0].toUpperCase() + term.slice(1))
  .replace(/\{\{ellipsis of\|en\|([^{}|]+)\}\}/g, 'Ellipsis of $1')
  .replace(/\{\{syn of\|en\|you know\|id=singlish\|tr=([^{}]+)\}\}/g, 'Synonym of you know ($1).')
  .replace(/\{\{synonym of\|en\|([^{}|]+)\|t=([^{}]+)\}\}/g, 'Synonym of $1 ($2)')
  .replace(/\{\{(?:m|l)\|en\|([^{}|]+)\|([^{}|=]+)\}\}/g, '$2')
  .replace(/\{\{(?:m|l)\|en\|([^{}|]+)(?:\|t=([^{}]+)|\|id=[^{}|]+)?\}\}/g, (_, term, gloss) => {
    const display = term.replace(/#.+$/, '');
    return gloss ? `${display} (${gloss})` : display;
  })
  .replace(/\{\{w\|([^{}|]+)(?:\|([^{}|]+))?\}\}/g, (_, title, display) => display || title)
  .replace(/\{\{place\|en\|lgarea\|north of \[\[([^\]|]+)\]\],\|s\/([^{}|]+)\|named after ([^{}|]+)\|full=([^{}|]+)\}\}/g, (_, city, state, namesake, name) => name + ', a local government area north of ' + city + ', ' + state + ', named after ' + namesake)
  .replace(/\{\{place\|en\|river\|r:suf\/([^{}|]+)\|s\/([^{}|]+)\|named after ([^{}|]+)\|full=([^{}|]+)\}\}/g, (_, region, state, namesake, name) => name[0].toUpperCase() + name.slice(1) + ', a river in the ' + region + ' region, ' + state + ', named after ' + namesake)
  .replace(/\{\{place\|en\|(place|ucomm|CDP)\|((?:c|co|s)\/[^{}|]+(?:\|(?:c|co|s)\/[^{}|]+)*)\}\}/g, (_, kind, locations) => `${({ place: 'A place', ucomm: 'An unincorporated community', CDP: 'A census-designated place' })[kind]} in ${locations.split('|').map(location => location.slice(location.indexOf('/') + 1)).map(location => location === 'USA' ? 'the United States' : location).join(', ')}`)
  .replace(/\{\{(?:ng|n-g|non-gloss)\|([^{}]*)\}\}/g, '$1').replace(/\{\{[^{}]*\}\}/g, '').replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/'{2,}/g, '').replace(/\s+/g, ' ').trim();
function dictionarySourcePage(sense, fallback) {
  if (!sense?.sourceUrl) return fallback;
  try {
    const url = new URL(sense.sourceUrl);
    if (url.origin !== 'https://en.wiktionary.org') return undefined;
    return url.pathname.startsWith('/wiki/') ? decodeURIComponent(url.pathname.slice(6)) : url.pathname === '/w/index.php' ? url.searchParams.get('title') : undefined;
  } catch { return undefined; }
}

/** Pending records are a work queue, never inferred linguistic approval. */
export function inspectDictionaryReview({ entries, dictionaries, corrections, records, diagrams, restoredSources = [] }) {
  const errors = [], inventory = [], byTerm = [];
  const entryById = new Map(entries.map(entry => [entry.id, entry]));
  const supplements = new Map(corrections.map(row => [identity(row.entryId, row.senseId), row]));
  const sources = new Map();
  for (const [term, dictionary] of Object.entries(dictionaries)) {
    const seen = new Set();
    for (const sense of dictionary.senses) {
      if (seen.has(sense.id)) errors.push(`Duplicate source sense: ${term}/${sense.id}`);
      seen.add(sense.id);
      sources.set(JSON.stringify([term, sense.id]), sense);
      const flags = [];
      if (!sense.example?.trim()) flags.push('missing-example');
      if (/\b(thou|thee|thy|thine|hath|doth)\b|ſ|\[\s*…\s*\]|^\s*(?:Synonyms?|Meronyms?|Citations):/i.test(sense.example || '')) flags.push('example-review-signal');
      if (!sense.collocations?.length) flags.push('missing-collocations');
      if (!sense.distinctions?.length) flags.push('missing-distinctions');
      inventory.push({ term, senseId: sense.id, sourceHash: hash(sense), status: 'pending', flags });
    }
    byTerm.push({ term, senses: dictionary.senses.length, reviewed: 0 });
  }
  const preservedSenses = inventory.length;
  const sourceIds = new Set([...sources.values()].map(sense => sense.id));
  const restoredKeys = new Set();
  for (const evidence of restoredSources) {
    const { term, entryId, parentSenseId, parentSourceHash, sense, sourcePage, revision, sourceGloss } = evidence;
    const key = identity(entryId, sense.id), start = errors.length;
    const topLevel = evidence.sourceKind === 'top-level';
    const anchor = dictionaries[term]?.senses.find(source => source.id === (topLevel ? evidence.anchorSenseId : parentSenseId));
    if (!anchor || sourceIds.has(sense.id) || restoredKeys.has(key)) errors.push(`Invalid restored parent or duplicate source: ${term}/${sense.id}`);
    if (!anchor || hash(anchor) !== (topLevel ? evidence.anchorSourceHash : parentSourceHash)) errors.push(`Restored parent or anchor hash mismatch: ${term}/${sense.id}`);
    if ((evidence.sourceKind !== undefined && !topLevel) || (topLevel ? parentSenseId !== undefined || parentSourceHash !== undefined : evidence.anchorSenseId !== undefined || evidence.anchorSourceHash !== undefined)) errors.push(`Invalid restored source kind: ${term}/${sense.id}`);
    if (dictionaryTerm(entryById.get(entryId)) !== term || sourcePage !== dictionarySourcePage(anchor, term)) errors.push(`Invalid restored entry identity: ${term}/${entryId}`);
    let url;
    try { url = new URL(sense.sourceUrl); } catch { /* Invalid evidence is reported below. */ }
    if (!Number.isSafeInteger(revision) || revision <= 0 || url?.origin !== 'https://en.wiktionary.org' || url.pathname !== '/w/index.php' || url.searchParams.get('title') !== sourcePage || url.searchParams.get('oldid') !== String(revision)) errors.push(`Invalid restored source revision: ${term}/${sense.id}`);
    if (!(topLevel ? /^#[^#:*]/ : /^#{2,4}[^#:*]/).test(sourceGloss || '') || plainSourceGloss(sourceGloss || '') !== sense.definition || !sense.definition?.trim() || !sense.pos?.trim() || sense.license !== 'CC-BY-SA-4.0' || sense.attribution !== 'English Wiktionary contributors') errors.push(`Invalid restored source attribution or gloss: ${term}/${sense.id}`);
    const row = supplements.get(key);
    if (!row || row.dictionaryParentSenseId !== parentSenseId || row.dictionarySourceAnchorSenseId !== evidence.anchorSenseId || hash(row.originalSense) !== hash(sense)) errors.push(`Restored supplement parent or source mismatch: ${term}/${sense.id}`);
    restoredKeys.add(key);
    sourceIds.add(sense.id);
    inventory.push({ term, senseId: sense.id, sourceHash: hash(sense), status: 'pending', restored: true, flags: [] });
    const termRow = byTerm.find(row => row.term === term);
    if (termRow) termRow.senses++;
    if (errors.length === start) sources.set(JSON.stringify([term, sense.id]), sense);
  }
  for (const row of corrections) if ((row.dictionaryParentSenseId || row.dictionarySourceAnchorSenseId) && !restoredKeys.has(identity(row.entryId, row.senseId))) errors.push(`Missing restored source evidence: ${row.entryId}/${row.senseId}`);
  const learningPriorities = { general: 0, specialist: 0, historical: 0, 'proper-name': 0 };
  for (const row of corrections.filter(row => row.learningPriority !== undefined)) {
    const entry = entryById.get(row.entryId), key = identity(row.entryId, row.senseId);
    const original = sources.get(JSON.stringify([dictionaryTerm(entry), row.senseId]));
    if (!Object.hasOwn(learningPriorities, row.learningPriority) || !entry || !original ||
      !records.some(record => identity(record.entryId, record.senseId) === key) || hash(row.originalSense) !== hash(original) ||
      !row.definition?.trim() || !(row.pos || row.originalSense?.pos)?.trim() || row.referenceOnly || row.meaningGroup || row.usageReference) {
      errors.push(`Invalid learning priority: ${row.entryId}/${row.senseId}`);
    } else learningPriorities[row.learningPriority]++;
  }
  const seen = new Set(), reviewed = new Set();
  let tasks = 0, spellingReferences = 0, readingNotes = 0, meaningGroups = 0, usageReferences = 0;
  for (const review of records) {
    const key = identity(review.entryId, review.senseId), start = errors.length;
    if (seen.has(key)) errors.push(`Duplicate review: ${review.term}/${review.senseId}`);
    seen.add(key);
    const entry = entryById.get(review.entryId), original = sources.get(JSON.stringify([review.term, review.senseId]));
    if (!entry || dictionaryTerm(entry) !== review.term) errors.push(`Invalid entry identity: ${review.term}/${review.entryId}`);
    if (!original) errors.push(`Missing source sense: ${review.term}/${review.senseId}`);
    else if (hash(original) !== review.sourceHash) errors.push(`Stale source hash: ${review.term}/${review.senseId}`);
    const row = supplements.get(key);
    if (!row) errors.push(`Missing supplement: ${review.term}/${review.senseId}`);
    else {
      if (hash(row.originalSense) !== review.sourceHash) errors.push(`Supplement source hash mismatch: ${review.term}/${review.senseId}`);
      if (row.exampleKind !== undefined && row.exampleKind !== 'reading-note') errors.push(`Invalid example kind: ${review.term}/${review.senseId}`);
      if (row.referenceOnly !== undefined && typeof row.referenceOnly !== 'boolean') errors.push(`Invalid spelling reference flag: ${review.term}/${review.senseId}`);
      if (row.referenceOnly && (!/\bmisspelling\b/i.test(`${original?.definition || ''} ${original?.usage || ''}`) || row.distinctionTask || diagrams.some(diagram => identity(diagram.entryId, diagram.senseId) === key))) errors.push(`Invalid spelling reference: ${review.term}/${review.senseId}`);
      if (row.meaningGroup !== undefined) {
        const gloss = row.meaningGroup?.sourceGloss;
        const headingGloss = (gloss || '').replace(/<!--[^]*?-->/g, '').replace(/^#(?!#)\s*(?:\{\{(?:senseid|sid)\|en\|[^{}]+\}\}\s*)*/, '# ');
        const children = restoredSources.filter(source => source.entryId === review.entryId && source.parentSenseId === review.senseId && sources.has(JSON.stringify([source.term, source.sense.id])));
        // Some source directories italicise the entire heading instead of using ng.
        // Require multiple restored children; ordinary or partly italic glosses stay lexical.
        const italicDirectory = children.length > 1 && /^#\s*(?:\{\{lb\|en\|[^{}]+\}\}\s*)?''(?!')(?:(?!'').)+''\s*$/.test(headingGloss);
        const heading = italicDirectory || /^#\s*(?:\{\{(?:lb|label)\|en\|[^{}]+\}\}\s*)*\{\{(?:ng|n-g|non-gloss)\|/.test(headingGloss) || (/^#[^#]/.test(headingGloss) && /\{\{lb\|en\|(?:[^{}|]+\|)*heading(?:\||\}\})/.test(headingGloss)) || /^#\s*\{\{place\|en\|place\|(?:c|co|s)\/[^{}|]+\}\}\s*:\s*$/.test(headingGloss) || /^#\s*A \[\[place name\]\]:\s*$/.test(headingGloss);
        if (!heading || plainSourceGloss(gloss || '') !== original?.definition || !children.length || children.some(child => child.sense.sourceUrl !== row.referenceUrl) || row.referenceOnly || row.usageReference || row.distinctionTask || diagrams.some(diagram => identity(diagram.entryId, diagram.senseId) === key)) errors.push(`Invalid meaning group: ${review.term}/${review.senseId}`);
      }
      if (row.usageReference !== undefined) {
        const match = row.usageReference?.sourceGloss?.match(/^#\s*\{\{used in phrasal verbs\|([^{}]+)\}\}\s*$/);
        const phrases = match?.[1].split('|').filter(value => !value.includes('='));
        let url; try { url = new URL(row.referenceUrl); } catch { /* Report below. */ }
        if (!phrases?.length || !original?.definition.startsWith('Used in phrasal verbs: ') || phrases.some(phrase => !original.definition.includes(phrase)) || url?.origin !== 'https://en.wiktionary.org' || url.pathname !== '/w/index.php' || url.searchParams.get('title') !== review.term || !/^[1-9]\d*$/.test(url.searchParams.get('oldid') || '') || row.referenceOnly || row.meaningGroup || row.distinctionTask || diagrams.some(diagram => identity(diagram.entryId, diagram.senseId) === key)) errors.push(`Invalid usage reference: ${review.term}/${review.senseId}`);
      }
      for (const area of areas) if (!review.reviewedAreas.includes(area) || !row[area]?.length) errors.push(`Incomplete ${area}: ${review.term}/${review.senseId}`);
      if (row.distinctionTask) {
        const task = row.distinctionTask;
        if (!task.prompt?.includes('_____') || !task.options?.includes(task.answer) || new Set(task.options).size < 2 || new Set(task.options.map(option => option.trim().toLowerCase())).size !== task.options.length || !task.explanation?.trim()) errors.push(`Invalid distinction task: ${review.term}/${review.senseId}`);
        else tasks++;
      }
    }
    if (errors.length === start) {
      reviewed.add(JSON.stringify([review.term, review.senseId]));
      if (row?.referenceOnly) spellingReferences++;
      if (row?.exampleKind === 'reading-note') readingNotes++;
      if (row?.meaningGroup) meaningGroups++;
      if (row?.usageReference) usageReferences++;
    }
  }
  const diagramKeys = new Set();
  for (const diagram of diagrams) {
    const key = identity(diagram.entryId, diagram.senseId), row = supplements.get(key);
    const review = records.find(record => record.entryId === diagram.entryId && record.senseId === diagram.senseId);
    if (diagramKeys.has(key)) errors.push(`Duplicate diagram: ${diagram.term}/${diagram.senseId}`);
    diagramKeys.add(key);
    if (!review?.diagramReviewed || !reviewed.has(JSON.stringify([diagram.term, diagram.senseId])) || !row || row.definition !== diagram.definition || (row.pos || row.originalSense?.pos) !== diagram.pos || !diagram.kind) errors.push(`Unbound diagram: ${diagram.term}/${diagram.senseId}`);
  }
  for (const review of records) if (review.diagramReviewed && !diagramKeys.has(identity(review.entryId, review.senseId))) errors.push(`Missing reviewed diagram: ${review.term}/${review.senseId}`);
  for (const item of inventory) if (reviewed.has(JSON.stringify([item.term, item.senseId]))) item.status = 'reviewed';
  for (const item of byTerm) item.reviewed = inventory.filter(sense => sense.term === item.term && sense.status === 'reviewed').length;
  const summary = {
    terms: byTerm.length, senses: inventory.length, preservedSenses, restoredSenses: restoredSources.length, reviewed: reviewed.size, pending: inventory.length-reviewed.size,
    diagrams: diagrams.length, tasks, spellingReferences, readingNotes, meaningGroups, usageReferences, learningPriorities,
    rawMissingExamples: inventory.filter(row => row.flags.includes('missing-example')).length,
    rawExampleReviewSignals: inventory.filter(row => row.flags.includes('example-review-signal')).length,
    rawMissingCollocations: inventory.filter(row => row.flags.includes('missing-collocations')).length,
    rawMissingDistinctions: inventory.filter(row => row.flags.includes('missing-distinctions')).length,
  };
  return { summary, errors, byTerm, inventory };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const index = read('public/dictionary/index.json');
  const dictionaries = Object.fromEntries(Object.entries(index).map(([term, file]) => [term, read(`public/dictionary/${file}`)]));
  const result = inspectDictionaryReview({ entries: read('public/vocabulary-catalog.json').entries, dictionaries, corrections: read('src/domain/vocabulary/readinessCorrections.json'), records: read('src/domain/vocabulary/dictionaryReviewLedger.json').records, diagrams: read('src/domain/vocabulary/senseDiagrams.json'), restoredSources: read('src/domain/vocabulary/dictionarySenseSources.json') });
  console.log(JSON.stringify({ ...result.summary, errors: result.errors }, null, 2));
  if (result.errors.length) process.exitCode = 1;
  else if (!process.argv.includes('--check')) {
    fs.mkdirSync('local/audits', { recursive: true });
    fs.writeFileSync('local/audits/vocabulary-dictionary.json', JSON.stringify(result, null, 2)+'\n');
    const { summary: s } = result;
    const table = result.byTerm.filter(row => row.reviewed).map(row => `| ${row.term} | ${row.reviewed} | ${row.senses} | ${row.senses-row.reviewed} |`).join('\n');
    fs.writeFileSync('docs/vocabulary-dictionary-audit.md', `# Full dictionary editorial audit\n\nRun: \`node scripts/audit-vocabulary-dictionary.mjs\`. Source records and stable identities are retained.\n\nThe complete index has **${s.terms.toLocaleString('en-US')} terms, ${s.preservedSenses.toLocaleString('en-US')} preserved raw senses and ${s.restoredSenses} restored source meanings** (${s.senses.toLocaleString('en-US')} total). This ledger verifies **${s.reviewed} records** across definition, examples or reading explanations, collocations and distinctions; **${s.pending.toLocaleString('en-US')} remain pending**. Earlier default-learning patches are not counted as full dictionary review. ${s.tasks} reviewed distinction exercises and ${s.diagrams} exact-bound diagrams accompany this batch. Diagram coverage is additional to the four text areas, not implied for every reviewed sense. ${s.spellingReferences} reviewed records are spelling-error references, retained for reading and excluded from new practice queues. ${s.readingNotes} explicitly classified reading explanations are labelled Reading note and excluded from new sentence-gap tasks. ${s.meaningGroups} reviewed records are source organisation headings, labelled Meaning group and excluded from the initial learning-notes list and all new practice modes. They are references, not individual lexical meanings. Source phrase-list references: ${s.usageReferences}. These are labelled Usage reference, accessible under All meanings and excluded from new practice. Earlier batches still need example-type annotation.\n\nAuthored learning-priority metadata classifies ${s.learningPriorities.general} general, ${s.learningPriorities.specialist} specialist, ${s.learningPriorities.historical} historical and ${s.learningPriorities['proper-name']} proper-name meanings. These are classifications of reviewed records, not additional text reviews or evidence of mastery. Unclassified meanings remain accessible.\n\n| Term | Reviewed records | Raw + restored records | Pending |\n| --- | ---: | ---: | ---: |\n${table}\n\n## Raw-source signals\n\n${s.rawMissingExamples.toLocaleString('en-US')} raw senses lack examples; ${s.rawMissingCollocations.toLocaleString('en-US')} lack collocations; ${s.rawMissingDistinctions.toLocaleString('en-US')} lack distinction notes. ${s.rawExampleReviewSignals.toLocaleString('en-US')} examples trigger an archaic, truncated or relation-text signal. These counts describe preserved raw source data. They do not describe all currently displayed defaults, and flags do not prove linguistic errors.\n\n## Review rules\n\nEach ledger row binds a catalogue entry, dictionary sense and SHA-256 of its original record. The audit rejects stale hashes, missing identities, incomplete reviewed fields, invalid exercises and diagrams that do not match the exact reviewed definition and part of speech. Restored source meanings additionally require a preserved parent fingerprint for child meanings or an explicit raw-source identity anchor for independent top-level meanings, a revision-bound Wiktionary URL, the exact source definition line and independent source/evidence alignment. Grouping references require an exact top-level nongloss, explicitly labelled or fully italic source heading, independently bound restored children at the same source revision, and no exercise or diagram. Fully italic directories require at least two restored children; partial italics and nested headings do not qualify. Usage references require a source phrasal-verb template with wording consistent with the original record, a revision-bound URL and no exercise or diagram. Their counts are separate from preserved raw-source signals. Personal edits and frozen sessions are outside this public editorial ledger. Specialised, historical and proper-name senses remain pending until examined; they are not silently excluded.\n\nThe ignored \`local/audits/vocabulary-dictionary.json\` contains every source identity, fingerprint, status and signal for subsequent batches. Run with \`--check\` to validate without rewriting reports. Passing this check verifies accounting and bindings, not completion of the dictionary.\n`);
  }
}
