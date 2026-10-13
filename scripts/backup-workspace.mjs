import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const directory = resolve(process.argv[2] || 'local/workflow-release-backup');
const env = Object.fromEntries((await readFile('.env', 'utf8')).split(/\r?\n/).flatMap(line => {
  const pair = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  return pair ? [[pair[1], pair[2].trim().replace(/^['"]|['"]$/g, '')]] : [];
}));
const endpoint = process.env.SUPABASE_URL || env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!endpoint || !key) throw new Error('Administrative backup credentials are unavailable.');
const owned = ['sessions', 'assessments', 'errors', 'plans', 'stories', 'vocabulary', 'vocabulary_states', 'vocabulary_evidence', 'vocabulary_reviews', 'vocabulary_activities', 'wordbook_progress', 'wordbook_enrollments', 'vocabulary_import_batches', 'vocabulary_sessions', 'exam_attempts', 'intensive_sessions', 'drafts', 'lexicon', 'workspace_commit_receipts'];
const shared = ['profiles', 'word_entries', 'word_senses', 'word_relations', 'word_enrichments', 'wordbooks', 'wordbook_units', 'wordbook_memberships', 'writing_questions', 'speaking_topics', 'speaking_samples', 'exam_papers', 'exam_sections', 'exam_passages', 'exam_questions', 'exam_assets'];
await mkdir(directory, { recursive: true });
const manifest = { startedAt: new Date().toISOString(), tables: {} };
for (const table of [...owned, ...shared]) {
  const rows = [];
  for (let offset = 0;; offset += 1000) {
    const url = new URL(`/rest/v1/${table}`, endpoint);
    url.searchParams.set('select', '*'); url.searchParams.set('limit', '1000'); url.searchParams.set('offset', String(offset));
    url.searchParams.set('order', owned.includes(table) ? 'user_id.asc,id.asc' : 'id.asc');
    const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Backup ${table} failed (${response.status}).`);
    const page = await response.json(); rows.push(...page);
    if (page.length < 1000) break;
  }
  const content = JSON.stringify(rows);
  const path = resolve(directory, `${table}.json`);
  await writeFile(path, content);
  const checksum = createHash('sha256').update(content).digest('hex');
  if (createHash('sha256').update(await readFile(path)).digest('hex') !== checksum) throw new Error(`Backup checksum mismatch: ${table}`);
  manifest.tables[table] = { count: rows.length, sha256: checksum };
  console.log(`Verified ${table}: ${rows.length} rows.`);
}
manifest.completedAt = new Date().toISOString();
await writeFile(resolve(directory, 'backup-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Complete verified backup: ${directory}`);
