import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const identity = (entryId, senseId) => JSON.stringify([entryId, senseId]);
const hash = value => createHash('sha256').update(JSON.stringify(value) ?? 'null').digest('hex');
const areas = ['definition', 'example', 'collocations', 'distinctions'];

/** Pending records are a work queue, never inferred linguistic approval. */
export function inspectDictionaryReview({ entries, dictionaries, corrections, records, diagrams }) {
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
  const seen = new Set(), reviewed = new Set();
  let tasks = 0;
  for (const review of records) {
    const key = identity(review.entryId, review.senseId), start = errors.length;
    if (seen.has(key)) errors.push(`Duplicate review: ${review.term}/${review.senseId}`);
    seen.add(key);
    const entry = entryById.get(review.entryId), original = sources.get(JSON.stringify([review.term, review.senseId]));
    if (!entry || entry.term !== review.term) errors.push(`Invalid entry identity: ${review.term}/${review.entryId}`);
    if (!original) errors.push(`Missing source sense: ${review.term}/${review.senseId}`);
    else if (hash(original) !== review.sourceHash) errors.push(`Stale source hash: ${review.term}/${review.senseId}`);
    const row = supplements.get(key);
    if (!row) errors.push(`Missing supplement: ${review.term}/${review.senseId}`);
    else {
      if (hash(row.originalSense) !== review.sourceHash) errors.push(`Supplement source hash mismatch: ${review.term}/${review.senseId}`);
      for (const area of areas) if (!review.reviewedAreas.includes(area) || !row[area]?.length) errors.push(`Incomplete ${area}: ${review.term}/${review.senseId}`);
      if (row.distinctionTask) {
        const task = row.distinctionTask;
        if (!task.prompt?.includes('_____') || !task.options?.includes(task.answer) || new Set(task.options).size < 2 || !task.explanation?.trim()) errors.push(`Invalid distinction task: ${review.term}/${review.senseId}`);
        else tasks++;
      }
    }
    if (errors.length === start) reviewed.add(JSON.stringify([review.term, review.senseId]));
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
    terms: byTerm.length, senses: inventory.length, reviewed: reviewed.size, pending: inventory.length-reviewed.size,
    diagrams: diagrams.length, tasks,
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
  const result = inspectDictionaryReview({ entries: read('public/vocabulary-catalog.json').entries, dictionaries, corrections: read('src/domain/vocabulary/readinessCorrections.json'), records: read('src/domain/vocabulary/dictionaryReviewLedger.json').records, diagrams: read('src/domain/vocabulary/senseDiagrams.json') });
  console.log(JSON.stringify({ ...result.summary, errors: result.errors }, null, 2));
  if (result.errors.length) process.exitCode = 1;
  else if (!process.argv.includes('--check')) {
    fs.mkdirSync('local/audits', { recursive: true });
    fs.writeFileSync('local/audits/vocabulary-dictionary.json', JSON.stringify(result, null, 2)+'\n');
    const { summary: s } = result;
    const table = result.byTerm.filter(row => row.reviewed).map(row => `| ${row.term} | ${row.reviewed} | ${row.senses} | ${row.senses-row.reviewed} |`).join('\n');
    fs.writeFileSync('docs/vocabulary-dictionary-audit.md', `# Full dictionary editorial audit\n\nRun: \`node scripts/audit-vocabulary-dictionary.mjs\`. Source records and stable identities are retained.\n\nThe complete index has **${s.terms.toLocaleString('en-US')} terms and ${s.senses.toLocaleString('en-US')} senses**. This ledger verifies **${s.reviewed} senses** across definition, example, collocations and distinctions; **${s.pending.toLocaleString('en-US')} remain pending**. Earlier default-learning patches are not counted as full dictionary review. ${s.tasks} reviewed distinction exercises and ${s.diagrams} exact-bound diagrams accompany this batch. Diagram coverage is additional to the four text areas, not implied for every reviewed sense.\n\n| Term | Reviewed text senses | Source senses | Pending |\n| --- | ---: | ---: | ---: |\n${table}\n\n## Raw-source signals\n\n${s.rawMissingExamples.toLocaleString('en-US')} raw senses lack examples; ${s.rawMissingCollocations.toLocaleString('en-US')} lack collocations; ${s.rawMissingDistinctions.toLocaleString('en-US')} lack distinction notes. ${s.rawExampleReviewSignals.toLocaleString('en-US')} examples trigger an archaic, truncated or relation-text signal. These counts describe preserved raw source data. They do not describe all currently displayed defaults, and flags do not prove linguistic errors.\n\n## Review rules\n\nEach ledger row binds a catalogue entry, dictionary sense and SHA-256 of its original record. The audit rejects stale hashes, missing identities, incomplete reviewed fields, invalid exercises and diagrams that do not match the exact reviewed definition and part of speech. Personal edits and frozen sessions are outside this public editorial ledger. Specialised, historical and proper-name senses remain pending until examined; they are not silently excluded.\n\nThe ignored \`local/audits/vocabulary-dictionary.json\` contains every source identity, fingerprint, status and signal for subsequent batches. Run with \`--check\` to validate without rewriting reports. Passing this check verifies accounting and bindings, not completion of the dictionary.\n`);
  }
}
